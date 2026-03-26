'use server'

import { revalidatePath } from 'next/cache'

import { logActivity } from '@/lib/activity-log'
import { createClient } from '@/lib/supabase/server'
import { formatVisitReportsActionError } from '@/lib/visit-reports-schema'
import {
  buildTargetedTheftVisitSummary,
  buildVisitReportTitle,
  normalizeTargetedTheftVisitPayload,
  VISIT_REPORT_TYPE_OPTIONS,
  type TargetedTheftVisitPayload,
  type VisitReportStatus,
  type VisitReportType,
} from '@/lib/reports/visit-report-types'
import type { FaIncidentCategory, FaSeverity, FaActionPriority } from '@/types/db'

const WRITABLE_ROLES = new Set(['admin', 'ops'])
const VALID_REPORT_TYPES = new Set<VisitReportType>(VISIT_REPORT_TYPE_OPTIONS.map((option) => option.value))
const VALID_STATUSES = new Set<VisitReportStatus>(['draft', 'final'])

export interface SaveVisitReportInput {
  reportId?: string
  storeId: string
  reportType: VisitReportType
  status: VisitReportStatus
  title?: string
  payload: TargetedTheftVisitPayload
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return formatVisitReportsActionError('Failed to save visit report.', error)
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

function toIncidentSeverity(riskRating: TargetedTheftVisitPayload['riskRating']): FaSeverity {
  if (riskRating === 'critical') return 'critical'
  if (riskRating === 'high') return 'high'
  if (riskRating === 'medium') return 'medium'
  return 'low'
}

function toActionPriority(riskRating: TargetedTheftVisitPayload['riskRating']): FaActionPriority {
  if (riskRating === 'critical') return 'urgent'
  if (riskRating === 'high') return 'high'
  if (riskRating === 'medium') return 'medium'
  return 'low'
}

function addDays(value: string, days: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date()
    fallback.setDate(fallback.getDate() + days)
    return fallback.toISOString().slice(0, 10)
  }
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

async function createLinkedIncidentAndAction(params: {
  supabase: ReturnType<typeof createClient>
  userId: string
  storeId: string
  reportId: string
  reportTitle: string
  visitDate: string
  summary: string | null
  payload: TargetedTheftVisitPayload
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
  } = params
  const severity = toIncidentSeverity(payload.riskRating)
  const actionPriority = toActionPriority(payload.riskRating)
  const occurredAt = `${visitDate}T12:00:00.000Z`
  const dueDate = addDays(visitDate, 7)

  const sourceMarker = `Source visit report ID: ${reportId}`
  const { data: existingIncident } = await supabase
    .from('tfs_incidents')
    .select('id')
    .eq('store_id', storeId)
    .ilike('description', `%${sourceMarker}%`)
    .maybeSingle()

  let incidentId = existingIncident?.id || null
  if (!incidentId) {
    const { data: refData } = await supabase.rpc('tfs_generate_incident_reference')
    const referenceNo = refData || `INC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

    const incidentDescriptionParts = [
      summary || '',
      payload.riskJustification?.trim() || '',
      payload.recommendations.details?.trim() || '',
      sourceMarker,
    ].filter(Boolean)

    const { data: incident, error: incidentError } = await supabase
      .from('tfs_incidents')
      .insert({
        reference_no: referenceNo,
        store_id: storeId,
        reported_by_user_id: userId,
        incident_category: 'security' as FaIncidentCategory,
        severity,
        summary: `Visit report follow-up: ${reportTitle}`,
        description: incidentDescriptionParts.join('\n\n') || null,
        occurred_at: occurredAt,
        reported_at: new Date().toISOString(),
        status: 'open',
        riddor_reportable: false,
        persons_involved: {
          source: 'visit_report',
          visit_report_id: reportId,
        },
      })
      .select('id')
      .single()

    if (incidentError || !incident) {
      throw new Error(toErrorMessage(incidentError))
    }
    incidentId = incident.id
  }

  const { data: existingActions } = await supabase
    .from('tfs_actions')
    .select('id')
    .eq('incident_id', incidentId)
    .limit(1)

  if ((existingActions || []).length > 0) return

  const actionDescriptionParts = [
    'Implement agreed mitigations from the visit report.',
    payload.immediateActionsTaken.actionsCompleted?.trim() || '',
    payload.recommendations.details?.trim() || '',
    sourceMarker,
  ].filter(Boolean)

  const { error: actionError } = await supabase
    .from('tfs_actions')
    .insert({
      incident_id: incidentId,
      title: `Implement visit report actions: ${reportTitle}`,
      description: actionDescriptionParts.join('\n\n'),
      priority: actionPriority,
      assigned_to_user_id: userId,
      due_date: dueDate,
      status: 'open',
      evidence_required: false,
    })

  if (actionError) {
    throw new Error(toErrorMessage(actionError))
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

  const normalizedPayload = normalizeTargetedTheftVisitPayload(
    input.payload,
    profile.full_name || null
  )
  const visitDate = normalizeDate(normalizedPayload.visitDate)
  const title =
    String(input.title || '').trim() ||
    buildVisitReportTitle(input.reportType, store.store_name || 'Store', visitDate)
  const summary = buildTargetedTheftVisitSummary(normalizedPayload) || null

  const payload = {
    store_id: input.storeId,
    report_type: input.reportType,
    status: input.status,
    title,
    visit_date: visitDate,
    summary,
    payload: normalizedPayload,
    created_by_user_id: user.id,
  }

  let linkedFollowUpWarning: string | null = null

  if (input.reportId) {
    const { data: report, error } = await supabase
      .from('tfs_visit_reports')
      .update({
        report_type: payload.report_type,
        status: payload.status,
        title: payload.title,
        visit_date: payload.visit_date,
        summary: payload.summary,
        payload: payload.payload,
      })
      .eq('id', input.reportId)
      .select('id, title, status, visit_date, summary, created_at, updated_at')
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
      try {
        await createLinkedIncidentAndAction({
          supabase,
          userId: user.id,
          storeId: input.storeId,
          reportId: report.id,
          reportTitle: report.title,
          visitDate: report.visit_date,
          summary: report.summary || null,
          payload: normalizedPayload,
        })
      } catch (linkedError) {
        linkedFollowUpWarning = `Report saved, but follow-up incident/action creation failed: ${toErrorMessage(linkedError)}`
        console.error('Visit report follow-up creation failed:', linkedError)
      }
    }

    revalidatePath('/reports')
    revalidatePath(`/stores/${input.storeId}`)
    revalidatePath('/incidents')
    revalidatePath('/actions')

    return {
      id: report.id,
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
    .select('id, title, status, visit_date, summary, created_at, updated_at')
    .single()

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  if (input.status === 'final') {
    try {
      await createLinkedIncidentAndAction({
        supabase,
        userId: user.id,
        storeId: input.storeId,
        reportId: report.id,
        reportTitle: report.title,
        visitDate: report.visit_date,
        summary: report.summary || null,
        payload: normalizedPayload,
      })
    } catch (linkedError) {
      linkedFollowUpWarning = `Report saved, but follow-up incident/action creation failed: ${toErrorMessage(linkedError)}`
      console.error('Visit report follow-up creation failed:', linkedError)
    }
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
  revalidatePath(`/stores/${input.storeId}`)
  revalidatePath('/incidents')
  revalidatePath('/actions')

  return {
    id: report.id,
    title: report.title,
    status: report.status as VisitReportStatus,
    visitDate: report.visit_date,
    summary: report.summary || null,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    warning: linkedFollowUpWarning,
  }
}
