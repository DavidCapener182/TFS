import { requireRole } from '@/lib/auth'
import { shouldHideStore } from '@/lib/store-normalization'
import {
  getStoreVisitsUnavailableMessage,
  isMissingStoreVisitsTableError,
  isMissingTfsVisitsColumnError,
} from '@/lib/store-visits-schema'
import {
  computeStoreVisitNeed,
  getStoreVisitTypeLabel,
  normalizeStoreVisitActivityDetails,
  normalizeStoreVisitActivityPayloads,
  isStoreVisitActivityKey,
  type StoreVisitNeedLevel,
  type StoreVisitType,
} from '@/lib/visit-needs'
import { getStoreVisitProductCatalog } from '@/lib/store-visit-product-catalog'
import { createClient } from '@/lib/supabase/server'
import type { VisitReportType } from '@/lib/reports/visit-report-types'
import { VisitTrackerClient } from '@/components/visit-tracker/visit-tracker-client'
import type { CaseVisitSummary, VisitHistoryEntry, VisitState, VisitTrackerRow } from '@/components/visit-tracker/types'

type StoreActionRow = {
  store_id: string
  title: string | null
  description: string | null
  priority: string | null
  due_date: string | null
  status: string | null
  source_flagged_item: string | null
  created_at: string | null
}

type IncidentRow = {
  id: string
  store_id: string
  summary: string | null
  description: string | null
  incident_category: string | null
  severity: string | null
  status: string | null
  occurred_at: string | null
}

type StoreVisitRow = {
  id: string
  store_id: string
  visited_at: string
  status: 'draft' | 'completed' | null
  visit_type: string
  completed_activity_keys: string[] | null
  completed_activity_details: Record<string, string> | null
  completed_activity_payloads: Record<string, unknown> | null
  notes: string | null
  follow_up_required: boolean | null
  need_score_snapshot: number | null
  need_level_snapshot: StoreVisitNeedLevel | null
  created_by_user_id: string
}

type StoreVisitEvidenceRow = {
  id: string
  visit_id: string
  activity_key: string
  file_name: string
  file_path: string
  file_type: string | null
  file_size: number | null
  created_at: string
}

type RouteVisitLogRow = {
  id: string
  entity_id: string
  created_at: string
  performed_by_user_id: string | null
  details: {
    completed_at?: string | null
    planned_date?: string | null
  } | null
}

type VisitReportRow = {
  id: string
  store_id: string
  store_visit_id: string | null
  report_type: string
  status: string
  title: string
  summary: string | null
  visit_date: string
  updated_at: string
  created_by_user_id: string | null
}

type CaseVisitRow = {
  id: string
  case_id: string
  store_id: string
  visit_type: string
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  scheduled_for: string | null
  assigned_user_id: string | null
  created_at: string
}

type CaseRow = {
  id: string
  case_type: string
  severity: string | null
  stage: CaseVisitSummary['caseStage']
  origin_reference: string | null
  next_action_label: string | null
  last_update_summary: string | null
}

function buildVisitState(
  lastVisit: VisitHistoryEntry | undefined,
  nextPlannedVisitDate: string | null,
  hasOpenCaseVisit = false
): VisitState {
  if (nextPlannedVisitDate || hasOpenCaseVisit) return 'planned'
  if (!lastVisit) return 'none'

  const now = Date.now()
  const lastVisitTime = new Date(lastVisit.visitedAt).getTime()
  if (Number.isNaN(lastVisitTime)) return 'none'

  const daysSinceVisit = Math.floor((now - lastVisitTime) / 86_400_000)
  if (lastVisit.visitType === 'random_area' && daysSinceVisit <= 30) return 'random'
  if (daysSinceVisit <= 30) return 'recent'
  return 'none'
}

function getActivePlannedVisitDate(plannedDate: string | null, lastVisitDate: string | null): string | null {
  if (!plannedDate) return null
  if (!lastVisitDate) return plannedDate

  const plannedTime = new Date(plannedDate).getTime()
  const visitTime = new Date(lastVisitDate).getTime()
  if (Number.isNaN(plannedTime) || Number.isNaN(visitTime)) return plannedDate

  return visitTime >= plannedTime ? null : plannedDate
}

function getDisplayPlannedVisitDate(legacyPlannedDate: string | null, caseVisit: CaseVisitSummary | null): string | null {
  if (!caseVisit?.scheduledFor) return legacyPlannedDate
  if (!legacyPlannedDate) return caseVisit.scheduledFor

  const legacyTime = new Date(legacyPlannedDate).getTime()
  const caseTime = new Date(caseVisit.scheduledFor).getTime()
  if (Number.isNaN(legacyTime)) return caseVisit.scheduledFor
  if (Number.isNaN(caseTime)) return legacyPlannedDate

  return caseTime < legacyTime ? caseVisit.scheduledFor : legacyPlannedDate
}

function sortCaseVisits(visits: CaseVisitSummary[]): CaseVisitSummary[] {
  return [...visits].sort((left, right) => {
    const leftScheduled = left.scheduledFor ? new Date(left.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER
    const rightScheduled = right.scheduledFor ? new Date(right.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER
    if (leftScheduled !== rightScheduled) return leftScheduled - rightScheduled

    const leftCreated = new Date(left.createdAt).getTime()
    const rightCreated = new Date(right.createdAt).getTime()
    return rightCreated - leftCreated
  })
}

function getLastVisitType(lastVisit: VisitHistoryEntry | undefined): string | null {
  if (!lastVisit) return null
  if (lastVisit.visitType === 'route_completion') return 'Planned route visit'
  return getStoreVisitTypeLabel(lastVisit.visitType)
}

async function getVisitTrackerData(): Promise<{
  rows: VisitTrackerRow[]
  visitsAvailable: boolean
  visitsUnavailableMessage: string | null
}> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('tfs_stores')
    .select(`
      id,
      store_code,
      store_name,
      region,
      city,
      postcode,
      is_active,
      compliance_audit_2_planned_date,
      compliance_audit_2_planned_purpose,
      compliance_audit_2_planned_note,
      assigned_manager:fa_profiles!tfs_stores_compliance_audit_2_assigned_manager_user_id_fkey(full_name)
    `)
    .order('region', { ascending: true })
    .order('store_name', { ascending: true })

  if (error) {
    console.error('Error fetching visit tracker stores:', error)
    return {
      rows: [],
      visitsAvailable: true,
      visitsUnavailableMessage: null,
    }
  }

  const stores = ((data || []) as any[]).filter((store) => !shouldHideStore(store))
  const storeIds = stores.map((store) => String(store.id)).filter(Boolean)

  const openStoreActionsByStore = new Map<string, StoreActionRow[]>()
  const openIncidentsByStore = new Map<string, IncidentRow[]>()
  const visitHistoryByStore = new Map<string, VisitHistoryEntry[]>()
  const caseVisitsByStore = new Map<string, CaseVisitSummary[]>()
  const evidenceByVisitId = new Map<string, VisitHistoryEntry['evidenceFiles']>()
  const linkedReportsByVisitId = new Map<string, VisitHistoryEntry['linkedReports']>()
  const profileMap = new Map<string, string | null>()
  let visitsAvailable = true
  let visitsUnavailableMessage: string | null = null

  if (storeIds.length > 0) {
    const storeActionsResult = await supabase
      .from('tfs_store_actions')
      .select('store_id, title, description, priority, due_date, status, source_flagged_item, created_at')
      .in('store_id', storeIds)

    if (storeActionsResult.error) {
      console.error('Error fetching visit tracker store actions:', storeActionsResult.error)
    } else {
      for (const action of (storeActionsResult.data || []) as StoreActionRow[]) {
        const storeId = String(action.store_id || '')
        if (!storeId) continue
        const status = String(action.status || '').toLowerCase()
        if (status === 'complete' || status === 'cancelled') continue
        const existing = openStoreActionsByStore.get(storeId) || []
        existing.push(action)
        openStoreActionsByStore.set(storeId, existing)
      }
    }

    const { data: incidentRows, error: incidentError } = await supabase
      .from('tfs_incidents')
      .select('id, store_id, summary, description, incident_category, severity, status, occurred_at')
      .in('store_id', storeIds)

    if (incidentError) {
      console.error('Error fetching visit tracker incidents:', incidentError)
    } else {
      for (const incident of (incidentRows || []) as IncidentRow[]) {
        const storeId = String(incident.store_id || '')
        const status = String(incident.status || '').toLowerCase()
        if (!storeId || ['closed', 'cancelled'].includes(status)) continue
        const existing = openIncidentsByStore.get(storeId) || []
        existing.push(incident)
        openIncidentsByStore.set(storeId, existing)
      }
    }

    const [storeVisitsResult, routeVisitLogsResult] = await Promise.all([
      supabase
        .from('tfs_store_visits')
        .select(
          'id, store_id, visited_at, status, visit_type, completed_activity_keys, completed_activity_details, completed_activity_payloads, notes, follow_up_required, need_score_snapshot, need_level_snapshot, created_by_user_id'
        )
        .in('store_id', storeIds)
        .order('visited_at', { ascending: false }),
      supabase
        .from('tfs_activity_log')
        .select('id, entity_id, created_at, performed_by_user_id, details')
        .eq('entity_type', 'store')
        .eq('action', 'ROUTE_VISIT_COMPLETED')
        .in('entity_id', storeIds)
        .order('created_at', { ascending: false }),
    ])

    let caseVisitsResult = await supabase
      .from('tfs_visits')
      .select('id, case_id, store_id, visit_type, status, scheduled_for, assigned_user_id, created_at')
      .in('store_id', storeIds)
      .in('status', ['planned', 'in_progress'])

    if (
      caseVisitsResult.error &&
      isMissingTfsVisitsColumnError(caseVisitsResult.error, ['visit_type', 'scheduled_for', 'assigned_user_id'])
    ) {
      const fallbackResult = await supabase
        .from('tfs_visits')
        .select('id, case_id, store_id, status, created_at')
        .in('store_id', storeIds)
        .in('status', ['planned', 'in_progress'])

      caseVisitsResult = {
        ...fallbackResult,
        data: (fallbackResult.data || []).map((row: any) => ({
          ...row,
          visit_type: 'follow_up',
          scheduled_for: null,
          assigned_user_id: null,
        })),
      } as unknown as typeof caseVisitsResult
    }

    if (storeVisitsResult.error) {
      if (isMissingStoreVisitsTableError(storeVisitsResult.error)) {
        visitsAvailable = false
        visitsUnavailableMessage = getStoreVisitsUnavailableMessage()
      } else {
        console.error('Error fetching visit tracker store visits:', storeVisitsResult.error)
      }
    }

    if (routeVisitLogsResult.error) {
      console.error('Error fetching route visit history:', routeVisitLogsResult.error)
    }

    if (caseVisitsResult.error) {
      console.error('Error fetching case-driven visits for visit tracker:', caseVisitsResult.error)
    }

    const userIds = new Set<string>()
    const visitIds: string[] = []

    for (const row of ((storeVisitsResult.data || []) as StoreVisitRow[])) {
      if (row.created_by_user_id) userIds.add(row.created_by_user_id)
      if (row.id) visitIds.push(row.id)
    }

    for (const row of ((routeVisitLogsResult.data || []) as RouteVisitLogRow[])) {
      if (row.performed_by_user_id) userIds.add(row.performed_by_user_id)
    }

    const openCaseVisits = (caseVisitsResult.data || []) as CaseVisitRow[]
    const caseIds = Array.from(new Set(openCaseVisits.map((row) => row.case_id).filter(Boolean)))

    for (const row of openCaseVisits) {
      if (row.assigned_user_id) userIds.add(row.assigned_user_id)
    }

    const { data: caseRows, error: caseRowsError } =
      caseIds.length > 0
        ? await supabase
            .from('tfs_cases')
            .select('id, case_type, severity, stage, origin_reference, next_action_label, last_update_summary')
            .in('id', caseIds)
        : { data: [], error: null as { message?: string } | null }

    if (caseRowsError) {
      console.error('Error fetching case metadata for visit tracker:', caseRowsError)
    }

    const casesById = new Map(
      ((caseRows || []) as CaseRow[]).map((row) => [row.id, row])
    )

    const { data: unlinkedDraftReports, error: unlinkedDraftReportsError } = await supabase
      .from('tfs_visit_reports')
      .select('id, store_id, store_visit_id, report_type, status, title, summary, visit_date, updated_at, created_by_user_id')
      .in('store_id', storeIds)
      .is('store_visit_id', null)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })

    if (unlinkedDraftReportsError) {
      console.error('Error fetching unlinked draft visit reports for visit tracker:', unlinkedDraftReportsError)
    }

    for (const report of ((unlinkedDraftReports || []) as VisitReportRow[])) {
      if (report.created_by_user_id) userIds.add(report.created_by_user_id)
    }

    if (userIds.size > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('fa_profiles')
        .select('id, full_name')
        .in('id', Array.from(userIds))

      if (profilesError) {
        console.error('Error fetching visit tracker profile names:', profilesError)
      } else {
        for (const profile of profiles || []) {
          profileMap.set(profile.id, profile.full_name || null)
        }
      }
    }

    for (const row of openCaseVisits) {
      const storeId = String(row.store_id || '')
      const caseRow = casesById.get(row.case_id)
      if (!storeId || !caseRow) continue

      const existing = caseVisitsByStore.get(storeId) || []
      const visitType = String(row.visit_type || 'follow_up').trim() || 'follow_up'

      existing.push({
        caseId: row.case_id,
        visitId: row.id,
        visitType: visitType as StoreVisitType,
        visitStatus: row.status === 'in_progress' ? 'in_progress' : 'planned',
        scheduledFor: row.scheduled_for,
        assignedUserId: row.assigned_user_id || null,
        assignedUserName: row.assigned_user_id ? profileMap.get(row.assigned_user_id) || null : null,
        caseType: caseRow.case_type,
        caseStage: caseRow.stage,
        severity:
          caseRow.severity === 'critical' || caseRow.severity === 'high' || caseRow.severity === 'medium'
            ? caseRow.severity
            : 'low',
        originReference: caseRow.origin_reference,
        nextActionLabel: caseRow.next_action_label,
        lastUpdateSummary: caseRow.last_update_summary,
        createdAt: row.created_at,
      })
      caseVisitsByStore.set(storeId, existing)
    }

    for (const [storeId, visits] of caseVisitsByStore.entries()) {
      caseVisitsByStore.set(storeId, sortCaseVisits(visits))
    }

    if (visitIds.length > 0) {
      const [evidenceResult, linkedReportsResult] = await Promise.all([
        supabase
          .from('tfs_store_visit_evidence')
          .select('id, visit_id, activity_key, file_name, file_path, file_type, file_size, created_at')
          .in('visit_id', visitIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('tfs_visit_reports')
          .select('id, store_visit_id, report_type, status, title, summary, visit_date, updated_at')
          .in('store_visit_id', visitIds)
          .order('updated_at', { ascending: false }),
      ])

      if (evidenceResult.error) {
        console.error('Error fetching visit evidence:', evidenceResult.error)
      } else {
        const signedUrls = await Promise.all(
          ((evidenceResult.data || []) as StoreVisitEvidenceRow[]).map(async (row) => {
            const { data } = await supabase.storage.from('tfs-attachments').createSignedUrl(row.file_path, 3600)
            return [row.id, data?.signedUrl || null] as const
          })
        )

        const signedUrlMap = new Map<string, string | null>(signedUrls)

        for (const row of (evidenceResult.data || []) as StoreVisitEvidenceRow[]) {
          if (!isStoreVisitActivityKey(row.activity_key)) continue

          const existing = evidenceByVisitId.get(row.visit_id) || []
          existing.push({
            id: row.id,
            activityKey: row.activity_key,
            fileName: row.file_name,
            fileType: row.file_type || null,
            fileSize: typeof row.file_size === 'number' ? row.file_size : null,
            filePath: row.file_path,
            createdAt: row.created_at,
            downloadUrl: signedUrlMap.get(row.id) || null,
          })
          evidenceByVisitId.set(row.visit_id, existing)
        }
      }

      if (linkedReportsResult.error) {
        console.error('Error fetching linked visit reports:', linkedReportsResult.error)
      } else {
        for (const report of (linkedReportsResult.data || []) as VisitReportRow[]) {
          if (!report.store_visit_id) continue
          const existing = linkedReportsByVisitId.get(report.store_visit_id) || []
          existing.push({
            id: report.id,
            reportType: report.report_type as VisitReportType,
            status: report.status === 'final' ? 'final' : 'draft',
            title: report.title || 'Untitled report',
            summary: report.summary || null,
            visitDate: report.visit_date,
            updatedAt: report.updated_at,
          })
          linkedReportsByVisitId.set(report.store_visit_id, existing)
        }
      }
    }

    for (const row of ((storeVisitsResult.data || []) as StoreVisitRow[])) {
      const storeId = String(row.store_id || '')
      if (!storeId) continue
      const completedActivityKeys = Array.isArray(row.completed_activity_keys)
        ? (row.completed_activity_keys as VisitHistoryEntry['completedActivityKeys'])
        : []
      const entry: VisitHistoryEntry = {
        id: row.id,
        source: 'visit_log',
        visitedAt: row.visited_at,
        status: row.status === 'draft' ? 'draft' : 'completed',
        visitType: row.visit_type as VisitHistoryEntry['visitType'],
        completedActivityKeys,
        completedActivityDetails: normalizeStoreVisitActivityDetails(
          row.completed_activity_details,
          completedActivityKeys
        ),
        completedActivityPayloads: normalizeStoreVisitActivityPayloads(
          row.completed_activity_payloads,
          completedActivityKeys
        ),
        evidenceFiles: evidenceByVisitId.get(row.id) || [],
        linkedReports: linkedReportsByVisitId.get(row.id) || [],
        notes: row.notes || null,
        followUpRequired: Boolean(row.follow_up_required),
        createdByName: profileMap.get(row.created_by_user_id) || null,
        needScoreSnapshot:
          typeof row.need_score_snapshot === 'number' ? row.need_score_snapshot : null,
        needLevelSnapshot: row.need_level_snapshot || null,
      }
      const existing = visitHistoryByStore.get(storeId) || []
      existing.push(entry)
      visitHistoryByStore.set(storeId, existing)
    }

    for (const row of ((routeVisitLogsResult.data || []) as RouteVisitLogRow[])) {
      const storeId = String(row.entity_id || '')
      if (!storeId) continue
      const visitedAt = row.details?.completed_at || row.created_at
      const existing = visitHistoryByStore.get(storeId) || []
      existing.push({
        id: row.id,
        source: 'route_completion',
        visitedAt,
        status: null,
        visitType: 'route_completion',
        completedActivityKeys: [],
        completedActivityDetails: {},
        completedActivityPayloads: {},
        evidenceFiles: [],
        linkedReports: [],
        notes: row.details?.planned_date
          ? `Route visit completed for plan date ${row.details.planned_date}.`
          : 'Route visit completed.',
        followUpRequired: false,
        createdByName: row.performed_by_user_id ? profileMap.get(row.performed_by_user_id) || null : null,
        needScoreSnapshot: null,
        needLevelSnapshot: null,
      })
      visitHistoryByStore.set(storeId, existing)
    }

    for (const report of ((unlinkedDraftReports || []) as VisitReportRow[])) {
      const storeId = String(report.store_id || '')
      if (!storeId) continue

      const existing = visitHistoryByStore.get(storeId) || []
      existing.push({
        id: `report-draft-${report.id}`,
        source: 'visit_log',
        visitedAt: report.updated_at || `${report.visit_date}T12:00:00.000Z`,
        status: 'draft',
        visitType: 'action_led',
        completedActivityKeys: [],
        completedActivityDetails: {},
        completedActivityPayloads: {},
        evidenceFiles: [],
        linkedReports: [
          {
            id: report.id,
            reportType: report.report_type as VisitReportType,
            status: 'draft',
            title: report.title || 'Untitled report',
            summary: report.summary || null,
            visitDate: report.visit_date,
            updatedAt: report.updated_at,
          },
        ],
        notes: 'Draft report created from Reports workspace (not yet linked to a visit session).',
        followUpRequired: false,
        createdByName: report.created_by_user_id ? profileMap.get(report.created_by_user_id) || null : null,
        needScoreSnapshot: null,
        needLevelSnapshot: null,
      })
      visitHistoryByStore.set(storeId, existing)
    }
  }

  const rows = stores.map((store) => {
    const storeId = String(store.id)
    const assignedManagerRelation = Array.isArray(store.assigned_manager)
      ? store.assigned_manager[0]
      : store.assigned_manager

    const allVisits = [...(visitHistoryByStore.get(storeId) || [])].sort(
      (a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime()
    )
    const recentVisits = allVisits.slice(0, 5)

    const activeDraftVisit =
      allVisits
        .filter((visit) => visit.status === 'draft')
        .sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime())[0] || null

    const lastCompletedVisit = allVisits.find((visit) => visit.status !== 'draft')
    const displayLastVisit = lastCompletedVisit || activeDraftVisit || null
    const lastVisitDate = displayLastVisit?.visitedAt || null
    const legacyPlannedVisitDate = getActivePlannedVisitDate(
      store.compliance_audit_2_planned_date || null,
      lastCompletedVisit?.visitedAt || null
    )
    const caseVisits = caseVisitsByStore.get(storeId) || []
    const primaryCaseVisit = caseVisits[0] || null
    const nextPlannedVisitDate = getDisplayPlannedVisitDate(legacyPlannedVisitDate, primaryCaseVisit)

    const assessment = computeStoreVisitNeed({
      actions: (openStoreActionsByStore.get(storeId) || []).map((action) => ({
        title: action.title,
        description: action.description,
        priority: action.priority,
        dueDate: action.due_date,
        status: action.status,
        sourceFlaggedItem: action.source_flagged_item,
        createdAt: action.created_at,
      })),
      incidents: (openIncidentsByStore.get(storeId) || []).map((incident) => ({
        summary: incident.summary,
        description: incident.description,
        category: incident.incident_category,
        severity: incident.severity,
        status: incident.status,
        occurredAt: incident.occurred_at,
      })),
      lastVisitAt: lastCompletedVisit?.visitedAt || null,
      nextPlannedVisitDate: nextPlannedVisitDate || legacyPlannedVisitDate,
    })
    return {
      storeId,
      storeCode: store.store_code || null,
      storeName: store.store_name,
      region: store.region || null,
      city: store.city || null,
      postcode: store.postcode || null,
      assignedManager: assignedManagerRelation?.full_name || null,
      lastVisitDate,
      lastVisitType:
        displayLastVisit?.status === 'draft'
          ? `${getLastVisitType(displayLastVisit || undefined) || 'Visit logged'} (Draft in progress)`
          : getLastVisitType(displayLastVisit || undefined),
      nextPlannedVisitDate,
      plannedVisitPurpose:
        primaryCaseVisit?.visitType ||
        String(store.compliance_audit_2_planned_purpose || '').trim() ||
        null,
      plannedVisitPurposeNote:
        primaryCaseVisit?.lastUpdateSummary ||
        primaryCaseVisit?.nextActionLabel ||
        String(store.compliance_audit_2_planned_note || '').trim() ||
        null,
      visitNeedScore: assessment.score,
      visitNeedLevel: assessment.level,
      visitNeeded: assessment.needsVisit,
      visitNeedReasons: assessment.reasons,
      visitState: buildVisitState(lastCompletedVisit || undefined, nextPlannedVisitDate, caseVisits.length > 0),
      openStoreActionCount: (openStoreActionsByStore.get(storeId) || []).length,
      openIncidentCount: (openIncidentsByStore.get(storeId) || []).length,
      isActive: Boolean(store.is_active),
      recentVisits,
      activeDraftVisit,
      caseVisits,
    } satisfies VisitTrackerRow
  })

  return {
    rows,
    visitsAvailable,
    visitsUnavailableMessage,
  }
}

export default async function VisitTrackerPage() {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])
  const [{ rows, visitsAvailable, visitsUnavailableMessage }, productCatalog] = await Promise.all([
    getVisitTrackerData(),
    getStoreVisitProductCatalog(),
  ])

  return (
    <VisitTrackerClient
      rows={rows}
      productCatalog={productCatalog}
      userRole={profile.role}
      currentUserName={profile.full_name}
      visitsAvailable={visitsAvailable}
      visitsUnavailableMessage={visitsUnavailableMessage}
    />
  )
}
