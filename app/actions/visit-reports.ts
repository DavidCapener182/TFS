'use server'

import { revalidatePath } from 'next/cache'

import { logActivity } from '@/lib/activity-log'
import {
  buildVisitReportIncidentMeta,
  buildVisitReportInjuryDetails,
  buildVisitReportSourceMarker,
  buildVisitReportStoreVisitDraft,
  getVisitReportOccurredAt,
  toIncidentSeverity,
} from '@/lib/reports/visit-report-follow-ups'
import { createClient } from '@/lib/supabase/server'
import { formatVisitReportsActionError } from '@/lib/visit-reports-schema'
import {
  buildVisitReportSummary,
  buildVisitReportTitle,
  isActivityVisitReportType,
  normalizeVisitReportPayload,
  VISIT_REPORT_TYPE_OPTIONS,
  type ActivityVisitReportPayload,
  type TargetedTheftVisitPayload,
  type VisitReportPayload,
  type VisitReportStatus,
  type VisitReportType,
} from '@/lib/reports/visit-report-types'
import {
  buildStoreVisitActivityDetailText,
  type StoreVisitActivityDetails,
  type StoreVisitActivityPayloads,
  type StoreVisitNeedLevel,
} from '@/lib/visit-needs'
import type { FaIncidentCategory } from '@/types/db'

const WRITABLE_ROLES = new Set(['admin', 'ops'])
const VALID_REPORT_TYPES = new Set<VisitReportType>(VISIT_REPORT_TYPE_OPTIONS.map((option) => option.value))
const VALID_STATUSES = new Set<VisitReportStatus>(['draft', 'final'])

export interface SaveVisitReportInput {
  reportId?: string
  storeVisitId?: string
  storeId: string
  reportType: VisitReportType
  status: VisitReportStatus
  title?: string
  payload: VisitReportPayload
}

type VisitReportStoreVisitDraft = {
  visitType: 'action_led'
  visitedAt: string
  completedActivityKeys: string[]
  completedActivityDetails: StoreVisitActivityDetails
  completedActivityPayloads: StoreVisitActivityPayloads
  notes: string | null
  followUpRequired: boolean
  needScoreSnapshot: number
  needLevelSnapshot: StoreVisitNeedLevel
  needReasonsSnapshot: string[] | null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return formatVisitReportsActionError('Failed to save visit report.', error)
}

function getErrorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (!error || typeof error !== 'object') return ''

  const errorLike = error as { message?: unknown; hint?: unknown }
  const parts = []

  if (typeof errorLike.message === 'string') {
    parts.push(errorLike.message)
  }

  if (typeof errorLike.hint === 'string') {
    parts.push(errorLike.hint)
  }

  return parts.join(' ')
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code.toUpperCase() : ''
}

function isTableUnavailable(error: unknown, tableNames: string[]): boolean {
  const haystack = getErrorText(error).toLowerCase()
  if (!haystack) return false

  const mentionsTable = tableNames.some(
    (tableName) => haystack.includes(tableName) || haystack.includes(`public.${tableName}`)
  )

  if (!mentionsTable) return false

  const code = getErrorCode(error)
  if (code === 'PGRST205' || code === '42P01') {
    return true
  }

  return (
    haystack.includes('could not find the table') ||
    haystack.includes('schema cache') ||
    haystack.includes('does not exist')
  )
}

function isFollowUpTablesUnavailable(error: unknown): boolean {
  return isTableUnavailable(error, ['tfs_incidents', 'tfs_actions'])
}

function isStoreVisitsTableUnavailable(error: unknown): boolean {
  return isTableUnavailable(error, ['tfs_store_visits'])
}

function joinSections(parts: Array<string | null | undefined>): string {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join('\n\n')
}

function normalizeDate(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    throw new Error('Visit date is required.')
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Visit date is invalid.')
  }

  return trimmed.slice(0, 10)
}

function getActivityReportOccurredAt(params: {
  visitDate: string
  payload: ActivityVisitReportPayload
  fallbackIso?: string | null
}) {
  const { visitDate, payload, fallbackIso } = params
  const timeIn = String(payload.timeIn || '').trim()

  if (visitDate && /^\d{2}:\d{2}$/.test(timeIn)) {
    const combined = new Date(`${visitDate}T${timeIn}:00.000Z`)
    if (!Number.isNaN(combined.getTime())) {
      return combined.toISOString()
    }
  }

  if (visitDate) {
    const midday = new Date(`${visitDate}T12:00:00.000Z`)
    if (!Number.isNaN(midday.getTime())) {
      return midday.toISOString()
    }
  }

  const fallback = fallbackIso ? new Date(fallbackIso) : null
  if (fallback && !Number.isNaN(fallback.getTime())) {
    return fallback.toISOString()
  }

  return new Date().toISOString()
}

function buildActivityVisitReportStoreVisitDraft(params: {
  reportId: string
  reportType: VisitReportType
  reportTitle: string
  visitDate: string
  summary: string | null
  payload: ActivityVisitReportPayload
  fallbackVisitedAt?: string | null
}): VisitReportStoreVisitDraft {
  const {
    reportId,
    reportType,
    reportTitle,
    visitDate,
    summary,
    payload,
    fallbackVisitedAt,
  } = params
  const sourceMarker = buildVisitReportSourceMarker(reportId)
  const activityKey = isActivityVisitReportType(reportType) ? reportType : 'other'
  const detailText =
    buildStoreVisitActivityDetailText(activityKey, undefined, payload.activityPayload) || summary || reportTitle
  const completedActivityDetails: StoreVisitActivityDetails = detailText
    ? { [activityKey]: detailText }
    : {}
  const completedActivityPayloads: StoreVisitActivityPayloads =
    Object.keys(payload.activityPayload || {}).length > 0
      ? { [activityKey]: payload.activityPayload }
      : {}

  return {
    visitType: 'action_led',
    visitedAt: getActivityReportOccurredAt({
      visitDate,
      payload,
      fallbackIso: fallbackVisitedAt || null,
    }),
    completedActivityKeys: [activityKey],
    completedActivityDetails,
    completedActivityPayloads,
    notes:
      joinSections([
        `Created from final visit report: ${reportTitle}`,
        payload.findings ? `Findings:\n${payload.findings}` : null,
        payload.actionsTaken ? `Actions / escalation:\n${payload.actionsTaken}` : null,
        sourceMarker,
      ]) || null,
    followUpRequired: false,
    needScoreSnapshot: 0,
    needLevelSnapshot: 'none',
    needReasonsSnapshot: null,
  }
}

async function syncLinkedIncidentAndAction(params: {
  supabase: ReturnType<typeof createClient>
  userId: string
  storeId: string
  reportId: string
  reportTitle: string
  visitDate: string
  summary: string | null
  payload: TargetedTheftVisitPayload
  reportCreatedAt?: string | null
}) {
  const {
    supabase,
    userId,
    storeId,
    reportId,
    reportTitle,
    visitDate,
    summary,
    payload,
    reportCreatedAt,
  } = params
  const severity = toIncidentSeverity(payload.riskRating)
  const occurredAt = getVisitReportOccurredAt({
    visitDate,
    payload,
    fallbackIso: reportCreatedAt || null,
  })

  const sourceMarker = buildVisitReportSourceMarker(reportId)
  const incidentDescription = joinSections([
    summary,
    payload.incidentOverview.summary,
    payload.riskJustification ? `Risk justification: ${payload.riskJustification}` : null,
    payload.recommendations.details
      ? `Recommendations: ${payload.recommendations.details}`
      : null,
    sourceMarker,
  ]) || null
  const incidentMeta = buildVisitReportIncidentMeta({ reportId, payload })
  const injuryDetails = buildVisitReportInjuryDetails(payload)
  const { data: existingIncidents, error: existingIncidentError } = await supabase
    .from('tfs_incidents')
    .select('id')
    .eq('store_id', storeId)
    .ilike('description', `%${sourceMarker}%`)
    .order('created_at', { ascending: false })
    .limit(1)

  if (existingIncidentError) {
    if (isFollowUpTablesUnavailable(existingIncidentError)) {
      console.warn(
        'Visit report follow-up skipped: incidents/actions tables unavailable.',
        existingIncidentError
      )
      return
    }
    throw new Error(toErrorMessage(existingIncidentError))
  }

  const existingIncident = existingIncidents?.[0] || null
  let incidentId = existingIncident?.id || null
  if (incidentId) {
    const { error: incidentUpdateError } = await supabase
      .from('tfs_incidents')
      .update({
        severity,
        status: 'under_investigation',
        summary: `Visit report follow-up: ${reportTitle}`,
        description: incidentDescription,
        occurred_at: occurredAt,
        persons_involved: incidentMeta,
        injury_details: injuryDetails,
      })
      .eq('id', incidentId)

    if (incidentUpdateError) {
      if (isFollowUpTablesUnavailable(incidentUpdateError)) {
        console.warn(
          'Visit report follow-up skipped: incidents/actions tables unavailable.',
          incidentUpdateError
        )
        return
      }
      throw new Error(toErrorMessage(incidentUpdateError))
    }
  } else {
    const { data: refData } = await supabase.rpc('tfs_generate_incident_reference')
    const referenceNo = refData || `INC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

    const { data: incident, error: incidentError } = await supabase
      .from('tfs_incidents')
      .insert({
        reference_no: referenceNo,
        store_id: storeId,
        reported_by_user_id: userId,
        incident_category: 'security' as FaIncidentCategory,
        severity,
        summary: `Visit report follow-up: ${reportTitle}`,
        description: incidentDescription,
        occurred_at: occurredAt,
        reported_at: new Date().toISOString(),
        status: 'under_investigation',
        riddor_reportable: false,
        persons_involved: incidentMeta,
        injury_details: injuryDetails,
      })
      .select('id')
      .single()

    if (incidentError) {
      if (isFollowUpTablesUnavailable(incidentError)) {
        console.warn(
          'Visit report follow-up skipped: incidents/actions tables unavailable.',
          incidentError
        )
        return
      }
      throw new Error(toErrorMessage(incidentError))
    }
    if (!incident) {
      throw new Error('Failed to create incident for visit report follow-up.')
    }
    incidentId = incident.id
  }

  // Product decision: do not auto-create follow-up actions from visit reports.
  // If legacy auto-created actions exist (matched by source marker), remove them so users can add actions manually.
  const { error: deleteLegacyActionError } = await supabase
    .from('tfs_actions')
    .delete()
    .eq('incident_id', incidentId)
    .ilike('title', 'Implement visit report actions:%')

  if (deleteLegacyActionError) {
    if (isFollowUpTablesUnavailable(deleteLegacyActionError)) {
      console.warn(
        'Visit report follow-up action cleanup skipped: incidents/actions tables unavailable.',
        deleteLegacyActionError
      )
      return
    }
    throw new Error(toErrorMessage(deleteLegacyActionError))
  }
}

async function syncLinkedStoreVisit(params: {
  supabase: ReturnType<typeof createClient>
  userId: string
  storeId: string
  reportId: string
  reportTitle: string
  visitDate: string
  summary: string | null
  payload: TargetedTheftVisitPayload
  reportCreatedAt?: string | null
  storeVisitId?: string | null
}) {
  const {
    supabase,
    userId,
    storeId,
    reportId,
    reportTitle,
    visitDate,
    summary,
    payload,
    reportCreatedAt,
    storeVisitId,
  } = params
  if (storeVisitId) {
    return storeVisitId
  }

  const visitDraft = buildVisitReportStoreVisitDraft({
    reportId,
    reportTitle,
    visitDate,
    summary,
    payload,
    fallbackVisitedAt: reportCreatedAt || null,
  })
  const sourceMarker = buildVisitReportSourceMarker(reportId)

  const { data: existingVisits, error: existingVisitError } = await supabase
    .from('tfs_store_visits')
    .select('id')
    .eq('store_id', storeId)
    .ilike('notes', `%${sourceMarker}%`)
    .order('visited_at', { ascending: false })
    .limit(1)

  if (existingVisitError) {
    if (isStoreVisitsTableUnavailable(existingVisitError)) {
      console.warn(
        'Visit report visit-log sync skipped: tfs_store_visits unavailable.',
        existingVisitError
      )
      return
    }
    throw new Error(toErrorMessage(existingVisitError))
  }

  const visitPayload = {
    visit_type: visitDraft.visitType,
    visited_at: visitDraft.visitedAt || reportCreatedAt || new Date().toISOString(),
    completed_activity_keys: visitDraft.completedActivityKeys,
    completed_activity_details: visitDraft.completedActivityDetails,
    completed_activity_payloads: visitDraft.completedActivityPayloads,
    notes: visitDraft.notes,
    follow_up_required: visitDraft.followUpRequired,
    need_score_snapshot: visitDraft.needScoreSnapshot,
    need_level_snapshot: visitDraft.needLevelSnapshot,
    need_reasons_snapshot: visitDraft.needReasonsSnapshot,
  }

  const existingVisit = existingVisits?.[0]
  if (existingVisit?.id) {
    const { error: visitUpdateError } = await supabase
      .from('tfs_store_visits')
      .update({
        ...visitPayload,
        status: 'completed',
      })
      .eq('id', existingVisit.id)

    if (visitUpdateError) {
      if (isStoreVisitsTableUnavailable(visitUpdateError)) {
        console.warn(
          'Visit report visit-log sync skipped: tfs_store_visits unavailable.',
          visitUpdateError
        )
        return
      }
      throw new Error(toErrorMessage(visitUpdateError))
    }

    return existingVisit.id
  }

  const { data: visit, error: visitInsertError } = await supabase
    .from('tfs_store_visits')
    .insert({
      ...visitPayload,
      status: 'completed',
      store_id: storeId,
      created_by_user_id: userId,
    })
    .select('id, visited_at, visit_type')
    .single()

  if (visitInsertError) {
    if (isStoreVisitsTableUnavailable(visitInsertError)) {
      console.warn(
        'Visit report visit-log sync skipped: tfs_store_visits unavailable.',
        visitInsertError
      )
      return
    }
    throw new Error(toErrorMessage(visitInsertError))
  }

  try {
    await logActivity('store', storeId, 'VISIT_LOGGED', {
      visit_id: visit.id,
      visit_type: visit.visit_type,
      visited_at: visit.visited_at,
      completed_activity_keys: visitDraft.completedActivityKeys,
      completed_activity_details: visitDraft.completedActivityDetails,
      completed_activity_payloads: visitDraft.completedActivityPayloads,
      follow_up_required: visitDraft.followUpRequired,
      need_score_snapshot: visitDraft.needScoreSnapshot,
      need_level_snapshot: visitDraft.needLevelSnapshot,
      source: 'visit_report',
      source_report_id: reportId,
    })
  } catch (activityError) {
    console.error('Failed to log linked store visit activity:', activityError)
  }

  return visit.id
}

async function syncActivityReportStoreVisit(params: {
  supabase: ReturnType<typeof createClient>
  userId: string
  storeId: string
  reportId: string
  reportType: VisitReportType
  reportTitle: string
  visitDate: string
  summary: string | null
  payload: ActivityVisitReportPayload
  reportCreatedAt?: string | null
  storeVisitId?: string | null
}) {
  const {
    supabase,
    userId,
    storeId,
    reportId,
    reportType,
    reportTitle,
    visitDate,
    summary,
    payload,
    reportCreatedAt,
    storeVisitId,
  } = params

  if (storeVisitId) {
    return storeVisitId
  }

  const visitDraft = buildActivityVisitReportStoreVisitDraft({
    reportId,
    reportType,
    reportTitle,
    visitDate,
    summary,
    payload,
    fallbackVisitedAt: reportCreatedAt || null,
  })
  const sourceMarker = buildVisitReportSourceMarker(reportId)

  const { data: existingVisits, error: existingVisitError } = await supabase
    .from('tfs_store_visits')
    .select('id')
    .eq('store_id', storeId)
    .ilike('notes', `%${sourceMarker}%`)
    .order('visited_at', { ascending: false })
    .limit(1)

  if (existingVisitError) {
    if (isStoreVisitsTableUnavailable(existingVisitError)) {
      console.warn(
        'Visit report visit-log sync skipped: tfs_store_visits unavailable.',
        existingVisitError
      )
      return null
    }
    throw new Error(toErrorMessage(existingVisitError))
  }

  const visitPayload = {
    visit_type: visitDraft.visitType,
    visited_at: visitDraft.visitedAt || reportCreatedAt || new Date().toISOString(),
    completed_activity_keys: visitDraft.completedActivityKeys,
    completed_activity_details: visitDraft.completedActivityDetails,
    completed_activity_payloads: visitDraft.completedActivityPayloads,
    notes: visitDraft.notes,
    follow_up_required: visitDraft.followUpRequired,
    need_score_snapshot: visitDraft.needScoreSnapshot,
    need_level_snapshot: visitDraft.needLevelSnapshot,
    need_reasons_snapshot: visitDraft.needReasonsSnapshot,
    status: 'completed',
  }

  const existingVisit = existingVisits?.[0]
  if (existingVisit?.id) {
    const { error: visitUpdateError } = await supabase
      .from('tfs_store_visits')
      .update(visitPayload)
      .eq('id', existingVisit.id)

    if (visitUpdateError) {
      if (isStoreVisitsTableUnavailable(visitUpdateError)) {
        console.warn(
          'Visit report visit-log sync skipped: tfs_store_visits unavailable.',
          visitUpdateError
        )
        return null
      }
      throw new Error(toErrorMessage(visitUpdateError))
    }

    return existingVisit.id
  }

  const { data: visit, error: visitInsertError } = await supabase
    .from('tfs_store_visits')
    .insert({
      ...visitPayload,
      store_id: storeId,
      created_by_user_id: userId,
    })
    .select('id')
    .single()

  if (visitInsertError) {
    if (isStoreVisitsTableUnavailable(visitInsertError)) {
      console.warn(
        'Visit report visit-log sync skipped: tfs_store_visits unavailable.',
        visitInsertError
      )
      return null
    }
    throw new Error(toErrorMessage(visitInsertError))
  }

  return visit.id
}

async function syncFinalVisitReportRecords(params: {
  supabase: ReturnType<typeof createClient>
  userId: string
  storeId: string
  reportId: string
  reportType: VisitReportType
  reportTitle: string
  visitDate: string
  summary: string | null
  payload: VisitReportPayload
  reportCreatedAt?: string | null
  storeVisitId?: string | null
}) {
  const warnings: string[] = []
  let linkedStoreVisitId: string | null = params.storeVisitId || null

  if (params.reportType === 'targeted_theft_visit') {
    try {
      await syncLinkedIncidentAndAction({
        supabase: params.supabase,
        userId: params.userId,
        storeId: params.storeId,
        reportId: params.reportId,
        reportTitle: params.reportTitle,
        visitDate: params.visitDate,
        summary: params.summary,
        payload: params.payload as TargetedTheftVisitPayload,
        reportCreatedAt: params.reportCreatedAt,
      })
    } catch (error) {
      if (isFollowUpTablesUnavailable(error)) {
        console.warn(
          'Visit report follow-up skipped: incidents/actions tables unavailable.',
          error
        )
      } else {
        warnings.push(`Incident/action sync failed: ${toErrorMessage(error)}`)
        console.error('Visit report incident/action sync failed:', error)
      }
    }
  }

  try {
    if (params.reportType === 'targeted_theft_visit') {
      linkedStoreVisitId = await syncLinkedStoreVisit({
        supabase: params.supabase,
        userId: params.userId,
        storeId: params.storeId,
        reportId: params.reportId,
        reportTitle: params.reportTitle,
        visitDate: params.visitDate,
        summary: params.summary,
        payload: params.payload as TargetedTheftVisitPayload,
        reportCreatedAt: params.reportCreatedAt,
        storeVisitId: params.storeVisitId,
      })
    } else {
      linkedStoreVisitId = await syncActivityReportStoreVisit({
        supabase: params.supabase,
        userId: params.userId,
        storeId: params.storeId,
        reportId: params.reportId,
        reportType: params.reportType,
        reportTitle: params.reportTitle,
        visitDate: params.visitDate,
        summary: params.summary,
        payload: params.payload as ActivityVisitReportPayload,
        reportCreatedAt: params.reportCreatedAt,
        storeVisitId: params.storeVisitId,
      })
    }
  } catch (error) {
    if (isStoreVisitsTableUnavailable(error)) {
      console.warn('Visit report visit-log sync skipped: tfs_store_visits unavailable.', error)
    } else {
      warnings.push(`Visit tracker sync failed: ${toErrorMessage(error)}`)
      console.error('Visit report store visit sync failed:', error)
    }
  }

  return {
    linkedStoreVisitId,
    warning:
      warnings.length === 0
        ? null
        : `Report saved, but linked LP records could not fully sync: ${warnings.join(' ')}`,
  }
}

export async function saveVisitReport(input: SaveVisitReportInput) {
  if (!input.storeId) {
    throw new Error('Select a store before saving the report.')
  }

  if (!VALID_REPORT_TYPES.has(input.reportType)) {
    throw new Error('Report type is invalid.')
  }

  if (!VALID_STATUSES.has(input.status)) {
    throw new Error('Report status is invalid.')
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: profile, error: profileError } = await supabase
    .from('fa_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new Error('Unable to verify user role.')
  }

  if (!WRITABLE_ROLES.has(profile.role)) {
    throw new Error('You do not have permission to save visit reports.')
  }

  const { data: store, error: storeError } = await supabase
    .from('tfs_stores')
    .select('id, store_name')
    .eq('id', input.storeId)
    .single()

  if (storeError || !store) {
    throw new Error('Store could not be found for this report.')
  }

  const normalizedPayload = normalizeVisitReportPayload(
    input.reportType,
    input.payload,
    profile.full_name || null
  )
  const visitDate = normalizeDate(normalizedPayload.visitDate)
  const title =
    String(input.title || '').trim() ||
    buildVisitReportTitle(input.reportType, store.store_name || 'Store', visitDate)
  const summary = buildVisitReportSummary(input.reportType, normalizedPayload) || null

  const payload = {
    store_id: input.storeId,
    store_visit_id: input.storeVisitId || null,
    report_type: input.reportType,
    status: input.status,
    title,
    visit_date: visitDate,
    summary,
    payload: normalizedPayload,
    created_by_user_id: user.id,
  }

  let linkedFollowUpWarning: string | null = null
  let linkedStoreVisitId: string | null = input.storeVisitId || null

  if (input.reportId) {
    const { data: report, error } = await supabase
      .from('tfs_visit_reports')
      .update({
        store_visit_id: payload.store_visit_id,
        report_type: payload.report_type,
        status: payload.status,
        title: payload.title,
        visit_date: payload.visit_date,
        summary: payload.summary,
        payload: payload.payload,
      })
      .eq('id', input.reportId)
      .select('id, store_visit_id, title, status, visit_date, summary, created_at, updated_at')
      .single()

    if (error) {
      throw new Error(toErrorMessage(error))
    }

    try {
      await logActivity('store', input.storeId, 'VISIT_REPORT_UPDATED', {
        report_id: report.id,
        report_type: input.reportType,
        status: input.status,
        title,
      })
    } catch (activityError) {
      console.error('Failed to log visit report update activity:', activityError)
    }

    if (input.status === 'final') {
      const syncResult = await syncFinalVisitReportRecords({
        supabase,
        userId: user.id,
        storeId: input.storeId,
        reportId: report.id,
        reportType: input.reportType,
        reportTitle: report.title,
        visitDate: report.visit_date,
        summary: report.summary || null,
        payload: normalizedPayload,
        reportCreatedAt: report.created_at,
        storeVisitId: input.storeVisitId || report.store_visit_id || null,
      })
      linkedStoreVisitId = syncResult.linkedStoreVisitId
      linkedFollowUpWarning = syncResult.warning
      if (linkedStoreVisitId && linkedStoreVisitId !== report.store_visit_id) {
        const { error: updateLinkError } = await supabase
          .from('tfs_visit_reports')
          .update({ store_visit_id: linkedStoreVisitId })
          .eq('id', report.id)

        if (updateLinkError) {
          throw new Error(toErrorMessage(updateLinkError))
        }
      }
    } else {
      linkedStoreVisitId = input.storeVisitId || report.store_visit_id || null
    }

    revalidatePath('/reports')
    revalidatePath('/stores')
    revalidatePath(`/stores/${input.storeId}`)
    revalidatePath('/incidents')
    revalidatePath('/actions')
    revalidatePath('/visit-tracker')
    revalidatePath('/dashboard')

    return {
      id: report.id,
      storeVisitId: linkedStoreVisitId,
      title: report.title,
      status: report.status as VisitReportStatus,
      visitDate: report.visit_date,
      summary: report.summary || null,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
      warning: linkedFollowUpWarning,
    }
  }

  const { data: report, error } = await supabase
    .from('tfs_visit_reports')
    .insert(payload)
    .select('id, store_visit_id, title, status, visit_date, summary, created_at, updated_at')
    .single()

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  if (input.status === 'final') {
    const syncResult = await syncFinalVisitReportRecords({
      supabase,
      userId: user.id,
      storeId: input.storeId,
      reportId: report.id,
      reportType: input.reportType,
      reportTitle: report.title,
      visitDate: report.visit_date,
      summary: report.summary || null,
      payload: normalizedPayload,
      reportCreatedAt: report.created_at,
      storeVisitId: input.storeVisitId || report.store_visit_id || null,
    })
    linkedStoreVisitId = syncResult.linkedStoreVisitId
    linkedFollowUpWarning = syncResult.warning
    if (linkedStoreVisitId && linkedStoreVisitId !== report.store_visit_id) {
      const { error: updateLinkError } = await supabase
        .from('tfs_visit_reports')
        .update({ store_visit_id: linkedStoreVisitId })
        .eq('id', report.id)

      if (updateLinkError) {
        throw new Error(toErrorMessage(updateLinkError))
      }
    }
  } else {
    linkedStoreVisitId = input.storeVisitId || report.store_visit_id || null
  }

  try {
    await logActivity('store', input.storeId, 'VISIT_REPORT_CREATED', {
      report_id: report.id,
      report_type: input.reportType,
      status: input.status,
      title,
    })
  } catch (activityError) {
    console.error('Failed to log visit report create activity:', activityError)
  }

  revalidatePath('/reports')
  revalidatePath('/stores')
  revalidatePath(`/stores/${input.storeId}`)
  revalidatePath('/incidents')
  revalidatePath('/actions')
  revalidatePath('/visit-tracker')
  revalidatePath('/dashboard')

  return {
    id: report.id,
    storeVisitId: linkedStoreVisitId,
    title: report.title,
    status: report.status as VisitReportStatus,
    visitDate: report.visit_date,
    summary: report.summary || null,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    warning: linkedFollowUpWarning,
  }
}
