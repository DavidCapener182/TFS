import { DashboardClient } from '@/components/dashboard/dashboard-client'
import { requireAuth, isSupabaseConfigured } from '@/lib/auth'
import { getStoreRegionGroup } from '@/lib/store-region-groups'
import { formatStoreName } from '@/lib/store-display'
import { getStoreVisitsUnavailableMessage, isMissingStoreVisitsTableError } from '@/lib/store-visits-schema'
import { createClient } from '@/lib/supabase/server'
import { shouldHideStore } from '@/lib/store-normalization'
import {
  buildStoreVisitActivityDetailText,
  computeStoreVisitNeed,
  getStoreVisitActivityLabel,
  getStoreVisitCountedItemDelta,
  getStoreVisitTypeLabel,
  isStoreVisitActivityKey,
  normalizeStoreVisitActivityDetails,
  normalizeStoreVisitActivityPayloads,
  type StoreVisitActivityDetails,
  type StoreVisitActivityKey,
  type StoreVisitActivityPayloads,
  type StoreVisitNeedLevel,
  type StoreVisitType,
} from '@/lib/visit-needs'

type IncidentPeriod = 'fiscalYear' | 'month' | 'week'
type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'
type SeverityBreakdown = Record<SeverityLevel, number> & { total: number }

type StoreRow = {
  id: string
  store_name: string
  store_code: string | null
  region: string | null
  city: string | null
  postcode: string | null
  is_active: boolean | null
  compliance_audit_2_planned_date: string | null
  compliance_audit_2_assigned_manager_user_id: string | null
  compliance_audit_2_planned_purpose: string | null
  compliance_audit_2_planned_note: string | null
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

type IncidentActionRow = {
  status: string | null
  due_date: string | null
  incident:
    | {
        store_id: string | null
      }
    | Array<{
        store_id: string | null
      }>
    | null
}

type StoreVisitRow = {
  id: string
  store_id: string
  visited_at: string
  visit_type: string
  completed_activity_keys: string[] | null
  completed_activity_details: Record<string, unknown> | null
  completed_activity_payloads: Record<string, unknown> | null
  notes: string | null
  follow_up_required: boolean | null
  need_score_snapshot: number | null
  need_level_snapshot: StoreVisitNeedLevel | null
  need_reasons_snapshot: unknown
  created_by_user_id: string
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

type TheftReviewEmailRow = {
  id: string
  matched_store_id: string | null
  subject: string | null
  analysis_summary: string | null
  analysis_template_key: string | null
  analysis_needs_action: boolean | null
  analysis_needs_incident: boolean | null
  processing_status: string | null
  received_at: string | null
  created_at: string | null
}

type StocktakeReviewEmailRow = {
  id: string
  matched_store_id: string | null
  subject: string | null
  analysis_summary: string | null
  analysis_template_key: string | null
  analysis_needs_action: boolean | null
  analysis_needs_visit: boolean | null
  processing_status: string | null
  received_at: string | null
  created_at: string | null
}

type DashboardVisitEntry = {
  id: string
  source: 'visit_log' | 'route_completion'
  visitedAt: string
  visitType: StoreVisitType | 'route_completion'
  completedActivityKeys: StoreVisitActivityKey[]
  completedActivityDetails: StoreVisitActivityDetails
  completedActivityPayloads: StoreVisitActivityPayloads
  notes: string | null
  followUpRequired: boolean
  createdByName: string | null
}

type QueueCaseRow = {
  id: string
  store_id: string
  case_type: string
  stage: string
  last_update_summary: string | null
  updated_at: string
}

type DashboardStoreRow = {
  storeId: string
  storeName: string
  storeCode: string | null
  visitNeedScore: number
  visitNeedLevel: StoreVisitNeedLevel
  visitNeeded: boolean
  visitNeedReasons: string[]
  openStoreActionCount: number
  openIncidentCount: number
  lastVisitDate: string | null
  nextPlannedVisitDate: string | null
  lastVisitType: DashboardVisitEntry['visitType'] | null
  followUpRequired: boolean
}

type DashboardPriorityStore = {
  storeId: string
  storeName: string
  storeCode: string | null
  visitNeedScore: number
  visitNeedLevel: StoreVisitNeedLevel
  visitNeedReasons: string[]
  openStoreActionCount: number
  openIncidentCount: number
  lastVisitDate: string | null
  nextPlannedVisitDate: string | null
  followUpRequired: boolean
}

type DashboardRecentFinding = {
  visitId: string
  storeId: string
  storeName: string
  storeCode: string | null
  visitedAt: string
  visitTypeLabel: string
  activityLabel: string | null
  summary: string
  followUpRequired: boolean
  createdByName: string | null
}

type DashboardPlannedVisit = {
  storeId: string
  storeName: string
  storeCode: string | null
  plannedDate: string | null
  managerName: string | null
  purpose: string | null
  purposeNote: string | null
}

type DashboardTheftReview = {
  emailId: string
  storeId: string
  storeName: string
  storeCode: string | null
  subject: string
  summary: string | null
  receivedAt: string | null
}

type DashboardStocktakeReview = {
  emailId: string
  storeId: string
  storeName: string
  storeCode: string | null
  subject: string
  summary: string | null
  receivedAt: string | null
}

type DashboardQueueReviewCase = {
  caseId: string
  storeId: string
  storeName: string
  storeCode: string | null
  caseType: string
  summary: string | null
  updatedAt: string
}

type DashboardData = {
  openIncidents: number
  underInvestigation: number
  overdueActions: number
  totalStores: number
  incidentBreakdownByPeriod: Record<IncidentPeriod, SeverityBreakdown>
  visitStats: {
    visitsNeeded: number
    urgentStores: number
    followUpRequired: number
    recentlyLogged: number
    randomVisits: number
    plannedRoutes: number
    plannedRoutesNext14Days: number
    potentialTheftReviews: number
  }
  priorityStores: DashboardPriorityStore[]
  plannedVisits: DashboardPlannedVisit[]
  theftReviews: DashboardTheftReview[]
  stocktakeReviews: DashboardStocktakeReview[]
  queueReviews: DashboardQueueReviewCase[]
  recentFindings: DashboardRecentFinding[]
  visitsUnavailableMessage: string | null
}

function createEmptySeverityBreakdown(): SeverityBreakdown {
  return {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    total: 0,
  }
}

function getEmptyDashboardData(): DashboardData {
  return {
    openIncidents: 0,
    underInvestigation: 0,
    overdueActions: 0,
    totalStores: 0,
    incidentBreakdownByPeriod: {
      fiscalYear: createEmptySeverityBreakdown(),
      month: createEmptySeverityBreakdown(),
      week: createEmptySeverityBreakdown(),
    },
    visitStats: {
      visitsNeeded: 0,
      urgentStores: 0,
      followUpRequired: 0,
      recentlyLogged: 0,
      randomVisits: 0,
      plannedRoutes: 0,
      plannedRoutesNext14Days: 0,
      potentialTheftReviews: 0,
    },
    priorityStores: [],
    plannedVisits: [],
    theftReviews: [],
    stocktakeReviews: [],
    queueReviews: [],
    recentFindings: [],
    visitsUnavailableMessage: null,
  }
}

function isIncidentOpen(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return ['open', 'under_investigation', 'actions_in_progress'].includes(normalized)
}

function isActionOpen(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized !== 'complete' && normalized !== 'cancelled'
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

function daysSince(value: string | null | undefined, now = new Date()): number | null {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return null
  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
}

function isRecentVisit(value: string | null | undefined): boolean {
  const valueDaysSince = daysSince(value)
  return valueDaysSince !== null && valueDaysSince <= 30
}

function getActivePlannedVisitDate(plannedDate: string | null, lastVisitDate: string | null): string | null {
  if (!plannedDate) return null
  if (!lastVisitDate) return plannedDate

  const plannedTime = new Date(plannedDate).getTime()
  const visitTime = new Date(lastVisitDate).getTime()

  if (Number.isNaN(plannedTime) || Number.isNaN(visitTime)) {
    return plannedDate
  }

  return visitTime >= plannedTime ? null : plannedDate
}

function normalizeSeverity(value: unknown): SeverityLevel | null {
  const severity = String(value || '').trim().toLowerCase()
  if (severity === 'low' || severity === 'medium' || severity === 'high' || severity === 'critical') {
    return severity
  }
  return null
}

function buildSeverityBreakdownSince(
  incidents: IncidentRow[],
  startDate: Date,
  now: Date
): SeverityBreakdown {
  const breakdown = createEmptySeverityBreakdown()

  incidents.forEach((incident) => {
    const severity = normalizeSeverity(incident.severity)
    if (!severity) return

    const occurredAt = new Date(incident.occurred_at || '')
    if (Number.isNaN(occurredAt.getTime())) return
    if (occurredAt.getTime() < startDate.getTime() || occurredAt.getTime() > now.getTime()) return

    breakdown[severity] += 1
    breakdown.total += 1
  })

  return breakdown
}

function getRouteGroupKey(store: StoreRow): string {
  const areaGroup = getStoreRegionGroup(store.region, store.store_name, store.city, store.postcode)
  return `${store.compliance_audit_2_planned_date || 'undated'}-${store.compliance_audit_2_assigned_manager_user_id || 'unassigned'}-${areaGroup}`
}

function getPriorityStoreSortValue(level: StoreVisitNeedLevel): number {
  if (level === 'urgent') return 0
  if (level === 'needed') return 1
  if (level === 'monitor') return 2
  return 3
}

function summarizeFindingOutcome(value: string, maxLength = 220): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''

  const firstLine = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  const base = (firstLine || trimmed).replace(/\s+/g, ' ').trim()
  if (base.length <= maxLength) return base
  return `${base.slice(0, maxLength - 1).trimEnd()}…`
}

function buildRecentFinding(
  visit: DashboardVisitEntry,
  store: Pick<StoreRow, 'id' | 'store_name' | 'store_code'>,
  hasOpenRiskDrivers: boolean
): DashboardRecentFinding | null {
  const rankedActivities = visit.completedActivityKeys
    .map((activityKey) => {
      const payload = visit.completedActivityPayloads[activityKey]
      const detailText = buildStoreVisitActivityDetailText(
        activityKey,
        visit.completedActivityDetails[activityKey],
        payload
      )
      const hasItemVariance = Boolean(
        payload?.itemsChecked?.some((item) => {
          const delta = getStoreVisitCountedItemDelta(item)
          return delta !== null && delta !== 0
        })
      )
      const hasAmountMismatch = Boolean(
        payload?.amountConfirmed === false ||
          payload?.amountChecks?.some((item) => item.amountMatches === false)
      )

      return {
        activityKey,
        detailText,
        score:
          (hasItemVariance ? 4 : 0) +
          (hasAmountMismatch ? 4 : 0) +
          (detailText ? 1 : 0),
      }
    })
    .filter((activity) => activity.score > 0 || Boolean(activity.detailText))
    .sort((a, b) => b.score - a.score)

  const primaryActivity = rankedActivities[0]
  const rawSummary =
    primaryActivity?.detailText ||
    (visit.followUpRequired ? 'Follow-up visit requested from the latest site visit.' : null) ||
    visit.notes

  if (!rawSummary) return null
  const summary = summarizeFindingOutcome(rawSummary)
  if (!summary) return null

  return {
    visitId: visit.id,
    storeId: store.id,
    storeName: formatStoreName(store.store_name),
    storeCode: store.store_code || null,
    visitedAt: visit.visitedAt,
    visitTypeLabel:
      visit.visitType === 'route_completion'
        ? 'Planned route visit'
        : getStoreVisitTypeLabel(visit.visitType),
    activityLabel: primaryActivity ? getStoreVisitActivityLabel(primaryActivity.activityKey) : null,
    summary,
    followUpRequired: visit.followUpRequired && hasOpenRiskDrivers,
    createdByName: visit.createdByName,
  }
}

async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) {
    return getEmptyDashboardData()
  }

  const supabase = createClient()
  const empty = getEmptyDashboardData()
  const today = new Date().toISOString().split('T')[0]

  const { data: storeRows, error: storesError } = await supabase
    .from('tfs_stores')
    .select(`
      id,
      store_name,
      store_code,
      region,
      city,
      postcode,
      is_active,
      compliance_audit_2_planned_date,
      compliance_audit_2_assigned_manager_user_id,
      compliance_audit_2_planned_purpose,
      compliance_audit_2_planned_note
    `)
    .eq('is_active', true)
    .order('store_name', { ascending: true })

  if (storesError) {
    console.error('Error fetching dashboard stores:', storesError)
    return empty
  }

  const stores = ((storeRows || []) as StoreRow[]).filter((store) => !shouldHideStore(store))
  const storeIds = stores.map((store) => String(store.id)).filter(Boolean)

  if (storeIds.length === 0) {
    return empty
  }

  const [
    incidentRowsResult,
    incidentActionsResult,
    storeActionsResult,
    queueCasesResult,
    plannedRoutesResult,
    storeVisitsResult,
    routeVisitLogsResult,
    theftReviewEmailsResult,
    stocktakeReviewEmailsResult,
  ] = await Promise.all([
    supabase
      .from('tfs_incidents')
      .select('id, store_id, summary, description, incident_category, severity, status, occurred_at')
      .in('store_id', storeIds),
    supabase
      .from('tfs_actions')
      .select(`
        status,
        due_date,
        incident:tfs_incidents!tfs_actions_incident_id_fkey(
          store_id
        )
      `)
      .lt('due_date', today)
      .not('status', 'in', '(complete,cancelled)'),
    supabase
      .from('tfs_store_actions')
      .select('store_id, title, description, priority, due_date, status, source_flagged_item, created_at')
      .in('store_id', storeIds),
    supabase
      .from('tfs_cases')
      .select('id, store_id, case_type, stage, last_update_summary, updated_at')
      .in('store_id', storeIds)
      .in('stage', ['new_submission', 'under_review'])
      .order('updated_at', { ascending: false }),
    supabase
      .from('tfs_stores')
      .select(`
        id,
        store_name,
        store_code,
        region,
        city,
        postcode,
        is_active,
        compliance_audit_2_planned_date,
        compliance_audit_2_assigned_manager_user_id,
        compliance_audit_2_planned_purpose,
        compliance_audit_2_planned_note,
        assigned_manager:fa_profiles!tfs_stores_compliance_audit_2_assigned_manager_user_id_fkey(
          full_name
        )
      `)
      .not('compliance_audit_2_planned_date', 'is', null)
      .eq('is_active', true),
    supabase
      .from('tfs_store_visits')
      .select(`
        id,
        store_id,
        visited_at,
        visit_type,
        completed_activity_keys,
        completed_activity_details,
        completed_activity_payloads,
        notes,
        follow_up_required,
        need_score_snapshot,
        need_level_snapshot,
        need_reasons_snapshot,
        created_by_user_id
      `)
      .eq('status', 'completed')
      .in('store_id', storeIds)
      .order('visited_at', { ascending: false }),
    supabase
      .from('tfs_activity_log')
      .select('id, entity_id, created_at, performed_by_user_id, details')
      .eq('entity_type', 'store')
      .eq('action', 'ROUTE_VISIT_COMPLETED')
      .in('entity_id', storeIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('tfs_inbound_emails')
      .select(
        'id, matched_store_id, subject, analysis_summary, analysis_template_key, analysis_needs_action, analysis_needs_incident, processing_status, received_at, created_at'
      )
      .in('matched_store_id', storeIds)
      .eq('analysis_template_key', 'store_theft')
      .eq('processing_status', 'pending'),
    supabase
      .from('tfs_inbound_emails')
      .select(
        'id, matched_store_id, subject, analysis_summary, analysis_template_key, analysis_needs_action, analysis_needs_visit, processing_status, received_at, created_at'
      )
      .in('matched_store_id', storeIds)
      .eq('analysis_template_key', 'stocktake_result')
      .in('processing_status', ['pending', 'reviewed'])
      .eq('analysis_needs_visit', true),
  ])

  if (incidentRowsResult.error) {
    console.error('Error fetching dashboard incidents:', incidentRowsResult.error)
  }

  if (incidentActionsResult.error) {
    console.error('Error fetching dashboard incident actions:', incidentActionsResult.error)
  }

  if (storeActionsResult.error) {
    console.error('Error fetching dashboard store actions:', storeActionsResult.error)
  }
  if (queueCasesResult.error) {
    console.error('Error fetching dashboard queue reviews:', queueCasesResult.error)
  }

  if (plannedRoutesResult.error) {
    console.error('Error fetching planned routes:', plannedRoutesResult.error)
  }

  let visitsUnavailableMessage: string | null = null
  if (storeVisitsResult.error) {
    if (isMissingStoreVisitsTableError(storeVisitsResult.error)) {
      visitsUnavailableMessage = getStoreVisitsUnavailableMessage()
    } else {
      console.error('Error fetching dashboard store visits:', storeVisitsResult.error)
    }
  }

  if (routeVisitLogsResult.error) {
    console.error('Error fetching dashboard route visit history:', routeVisitLogsResult.error)
  }
  if (theftReviewEmailsResult.error) {
    console.error('Error fetching dashboard theft review emails:', theftReviewEmailsResult.error)
  }
  if (stocktakeReviewEmailsResult.error) {
    console.error('Error fetching dashboard stocktake review emails:', stocktakeReviewEmailsResult.error)
  }

  const incidentRows = (incidentRowsResult.data || []) as IncidentRow[]
  const incidentActionRows = (incidentActionsResult.data || []) as IncidentActionRow[]
  const storeActionRows = (storeActionsResult.data || []) as StoreActionRow[]
  const queueCaseRows = (queueCasesResult.data || []) as QueueCaseRow[]
  const plannedRouteStores = ((plannedRoutesResult.data || []) as StoreRow[]).filter(
    (store) => !shouldHideStore(store)
  )
  const storeVisitRows = (storeVisitsResult.data || []) as StoreVisitRow[]
  const routeVisitLogRows = (routeVisitLogsResult.data || []) as RouteVisitLogRow[]
  const theftReviewEmails = (theftReviewEmailsResult.data || []) as TheftReviewEmailRow[]
  const stocktakeReviewEmails = (stocktakeReviewEmailsResult.data || []) as StocktakeReviewEmailRow[]

  const incidentRowsByStore = new Map<string, IncidentRow[]>()
  incidentRows.forEach((incident) => {
    const storeId = String(incident.store_id || '')
    if (!storeId || !isIncidentOpen(incident.status)) return
    const existing = incidentRowsByStore.get(storeId) || []
    existing.push(incident)
    incidentRowsByStore.set(storeId, existing)
  })

  const storeActionsByStore = new Map<string, StoreActionRow[]>()
  storeActionRows.forEach((action) => {
    const storeId = String(action.store_id || '')
    if (!storeId || !isActionOpen(action.status)) return
    const existing = storeActionsByStore.get(storeId) || []
    existing.push(action)
    storeActionsByStore.set(storeId, existing)
  })

  const userIds = new Set<string>()
  storeVisitRows.forEach((visit) => {
    if (visit.created_by_user_id) userIds.add(visit.created_by_user_id)
  })
  routeVisitLogRows.forEach((log) => {
    if (log.performed_by_user_id) userIds.add(log.performed_by_user_id)
  })

  const profileMap = new Map<string, string | null>()
  if (userIds.size > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('fa_profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds))

    if (profilesError) {
      console.error('Error fetching dashboard visit profile names:', profilesError)
    } else {
      ;(profiles || []).forEach((profile) => {
        profileMap.set(profile.id, profile.full_name || null)
      })
    }
  }

  const combinedVisitHistoryByStore = new Map<string, DashboardVisitEntry[]>()
  const storeVisitLogsByStore = new Map<string, DashboardVisitEntry[]>()

  storeVisitRows.forEach((visit) => {
    const storeId = String(visit.store_id || '')
    if (!storeId) return

    const completedActivityKeys = Array.isArray(visit.completed_activity_keys)
      ? visit.completed_activity_keys.filter(isStoreVisitActivityKey)
      : []
    const entry: DashboardVisitEntry = {
      id: visit.id,
      source: 'visit_log',
      visitedAt: visit.visited_at,
      visitType: visit.visit_type as StoreVisitType,
      completedActivityKeys,
      completedActivityDetails: normalizeStoreVisitActivityDetails(
        visit.completed_activity_details,
        completedActivityKeys
      ),
      completedActivityPayloads: normalizeStoreVisitActivityPayloads(
        visit.completed_activity_payloads,
        completedActivityKeys
      ),
      notes: visit.notes || null,
      followUpRequired: Boolean(visit.follow_up_required),
      createdByName: profileMap.get(visit.created_by_user_id) || null,
    }

    const combinedEntries = combinedVisitHistoryByStore.get(storeId) || []
    combinedEntries.push(entry)
    combinedVisitHistoryByStore.set(storeId, combinedEntries)

    const visitLogs = storeVisitLogsByStore.get(storeId) || []
    visitLogs.push(entry)
    storeVisitLogsByStore.set(storeId, visitLogs)
  })

  routeVisitLogRows.forEach((log) => {
    const storeId = String(log.entity_id || '')
    const visitedAt = log.details?.completed_at || log.created_at
    if (!storeId || !visitedAt) return

    const entry: DashboardVisitEntry = {
      id: log.id,
      source: 'route_completion',
      visitedAt,
      visitType: 'route_completion',
      completedActivityKeys: [],
      completedActivityDetails: {},
      completedActivityPayloads: {},
      notes: null,
      followUpRequired: false,
      createdByName: log.performed_by_user_id ? profileMap.get(log.performed_by_user_id) || null : null,
    }

    const existing = combinedVisitHistoryByStore.get(storeId) || []
    existing.push(entry)
    combinedVisitHistoryByStore.set(storeId, existing)
  })

  combinedVisitHistoryByStore.forEach((entries) => {
    entries.sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime())
  })
  storeVisitLogsByStore.forEach((entries) => {
    entries.sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime())
  })

  const dashboardStoreRows: DashboardStoreRow[] = stores.map((store) => {
    const storeId = String(store.id)
    const combinedVisits = combinedVisitHistoryByStore.get(storeId) || []
    const lastVisit = combinedVisits[0]
    const lastVisitDate = lastVisit?.visitedAt || null
    const nextPlannedVisitDate = getActivePlannedVisitDate(
      store.compliance_audit_2_planned_date || null,
      lastVisitDate
    )
    const assessment = computeStoreVisitNeed({
      actions: (storeActionsByStore.get(storeId) || []).map((action) => ({
        title: action.title,
        description: action.description,
        priority: action.priority,
        dueDate: action.due_date,
        status: action.status,
        sourceFlaggedItem: action.source_flagged_item,
        createdAt: action.created_at,
      })),
      incidents: (incidentRowsByStore.get(storeId) || []).map((incident) => ({
        summary: incident.summary,
        description: incident.description,
        category: incident.incident_category,
        severity: incident.severity,
        status: incident.status,
        occurredAt: incident.occurred_at,
      })),
      lastVisitAt: lastVisitDate,
      nextPlannedVisitDate,
    })
    const latestVisitLog = (storeVisitLogsByStore.get(storeId) || [])[0]
    const openStoreActionCount = (storeActionsByStore.get(storeId) || []).length
    const openIncidentCount = (incidentRowsByStore.get(storeId) || []).length
    const hasOpenRiskDrivers = openStoreActionCount > 0 || openIncidentCount > 0

    return {
      storeId,
      storeName: formatStoreName(store.store_name),
      storeCode: store.store_code || null,
      visitNeedScore: assessment.score,
      visitNeedLevel: assessment.level,
      visitNeeded: assessment.needsVisit,
      visitNeedReasons: assessment.reasons,
      openStoreActionCount,
      openIncidentCount,
      lastVisitDate,
      nextPlannedVisitDate,
      lastVisitType: lastVisit?.visitType || null,
      followUpRequired: Boolean(latestVisitLog?.followUpRequired) && hasOpenRiskDrivers,
    }
  })

  const now = new Date()
  const startOfCurrentFiscalYear = (() => {
    const fiscalYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    return new Date(fiscalYear, 1, 1, 0, 0, 0, 0)
  })()
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfCurrentWeek = (() => {
    const weekStart = new Date(now)
    const day = weekStart.getDay()
    const diff = (day + 6) % 7
    weekStart.setDate(weekStart.getDate() - diff)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  })()

  const incidentBreakdownByPeriod = {
    fiscalYear: buildSeverityBreakdownSince(incidentRows, startOfCurrentFiscalYear, now),
    month: buildSeverityBreakdownSince(incidentRows, startOfCurrentMonth, now),
    week: buildSeverityBreakdownSince(incidentRows, startOfCurrentWeek, now),
  }

  const plannedRouteGroupKeys = new Set<string>()
  const plannedRouteGroupKeysNext14Days = new Set<string>()
  const todayDateOnly = parseDateOnly(today) || new Date()
  const fourteenDaysFromNow = new Date(todayDateOnly)
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)

  plannedRouteStores.forEach((store) => {
    const routeKey = getRouteGroupKey(store)
    plannedRouteGroupKeys.add(routeKey)

    const plannedDate = parseDateOnly(store.compliance_audit_2_planned_date)
    if (!plannedDate) return

    if (
      plannedDate.getTime() >= todayDateOnly.getTime() &&
      plannedDate.getTime() <= fourteenDaysFromNow.getTime()
    ) {
      plannedRouteGroupKeysNext14Days.add(routeKey)
    }
  })

  const plannedVisits = [...plannedRouteStores]
    .sort((a, b) => {
      const aDate = String(a.compliance_audit_2_planned_date || '')
      const bDate = String(b.compliance_audit_2_planned_date || '')
      if (aDate !== bDate) return aDate.localeCompare(bDate)
      return formatStoreName(a.store_name).localeCompare(formatStoreName(b.store_name))
    })
    .slice(0, 8)
    .map((store) => {
      const assignedManager = Array.isArray((store as any).assigned_manager)
        ? (store as any).assigned_manager[0]
        : (store as any).assigned_manager

      return {
        storeId: String(store.id),
        storeName: formatStoreName(store.store_name),
        storeCode: store.store_code || null,
        plannedDate: store.compliance_audit_2_planned_date || null,
        managerName: assignedManager?.full_name || null,
        purpose: store.compliance_audit_2_planned_purpose || null,
        purposeNote: store.compliance_audit_2_planned_note || null,
      } satisfies DashboardPlannedVisit
    })

  const priorityStores = [...dashboardStoreRows]
    .filter((row) => row.visitNeedScore > 0 || row.followUpRequired)
    .sort((a, b) => {
      if (a.followUpRequired !== b.followUpRequired) {
        return a.followUpRequired ? -1 : 1
      }

      const needDiff =
        getPriorityStoreSortValue(a.visitNeedLevel) - getPriorityStoreSortValue(b.visitNeedLevel)
      if (needDiff !== 0) return needDiff

      if (a.visitNeedScore !== b.visitNeedScore) {
        return b.visitNeedScore - a.visitNeedScore
      }

      if (a.openIncidentCount !== b.openIncidentCount) {
        return b.openIncidentCount - a.openIncidentCount
      }

      if (a.openStoreActionCount !== b.openStoreActionCount) {
        return b.openStoreActionCount - a.openStoreActionCount
      }

      return a.storeName.localeCompare(b.storeName)
    })
    .slice(0, 8)
    .map((row) => ({
      storeId: row.storeId,
      storeName: row.storeName,
      storeCode: row.storeCode,
      visitNeedScore: row.visitNeedScore,
      visitNeedLevel: row.visitNeedLevel,
      visitNeedReasons: row.visitNeedReasons,
      openStoreActionCount: row.openStoreActionCount,
      openIncidentCount: row.openIncidentCount,
      lastVisitDate: row.lastVisitDate,
      nextPlannedVisitDate: row.nextPlannedVisitDate,
      followUpRequired: row.followUpRequired,
    }))

  const storeMap = new Map<string, StoreRow>(stores.map((store) => [String(store.id), store]))
  const theftReviews = [...theftReviewEmails]
    .sort((a, b) => {
      const aTime = new Date(a.received_at || a.created_at || '').getTime()
      const bTime = new Date(b.received_at || b.created_at || '').getTime()
      return bTime - aTime
    })
    .map((email) => {
      const storeId = String(email.matched_store_id || '')
      const store = storeMap.get(storeId)
      if (!store || !storeId) return null
      return {
        emailId: email.id,
        storeId,
        storeName: formatStoreName(store.store_name),
        storeCode: store.store_code || null,
        subject: String(email.subject || 'Theft, Review'),
        summary: email.analysis_summary || null,
        receivedAt: email.received_at || email.created_at || null,
      } satisfies DashboardTheftReview
    })
    .filter((item): item is DashboardTheftReview => Boolean(item))
  const queueReviews = queueCaseRows
    .map((queueCase) => {
      const storeId = String(queueCase.store_id || '')
      const store = storeMap.get(storeId)
      if (!store || !storeId) return null
      return {
        caseId: queueCase.id,
        storeId,
        storeName: formatStoreName(store.store_name),
        storeCode: store.store_code || null,
        caseType: String(queueCase.case_type || ''),
        summary: queueCase.last_update_summary || null,
        updatedAt: queueCase.updated_at,
      } satisfies DashboardQueueReviewCase
    })
    .filter((item): item is DashboardQueueReviewCase => Boolean(item))
    .slice(0, 20)
  const stocktakeReviews = [...stocktakeReviewEmails]
    .sort((a, b) => {
      const aTime = new Date(a.received_at || a.created_at || '').getTime()
      const bTime = new Date(b.received_at || b.created_at || '').getTime()
      return bTime - aTime
    })
    .map((email) => {
      const storeId = String(email.matched_store_id || '')
      const store = storeMap.get(storeId)
      if (!store || !storeId) return null
      return {
        emailId: email.id,
        storeId,
        storeName: formatStoreName(store.store_name),
        storeCode: store.store_code || null,
        subject: String(email.subject || 'Stocktake Red'),
        summary: email.analysis_summary || null,
        receivedAt: email.received_at || email.created_at || null,
      } satisfies DashboardStocktakeReview
    })
    .filter((item): item is DashboardStocktakeReview => Boolean(item))
  const recentFindings = [...storeVisitRows]
    .sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime())
    .map((visit) => {
      const store = storeMap.get(String(visit.store_id || ''))
      const visitEntry = (storeVisitLogsByStore.get(String(visit.store_id || '')) || []).find(
        (entry) => entry.id === visit.id
      )
      const storeId = String(visit.store_id || '')
      const hasOpenRiskDrivers =
        (storeActionsByStore.get(storeId) || []).length > 0 ||
        (incidentRowsByStore.get(storeId) || []).length > 0

      if (!store || !visitEntry) return null
      return buildRecentFinding(visitEntry, store, hasOpenRiskDrivers)
    })
    .filter((finding): finding is DashboardRecentFinding => Boolean(finding))
    .slice(0, 6)

  const overdueIncidentActions = incidentActionRows.filter((action) => {
    const incidentRelation = Array.isArray(action.incident) ? action.incident[0] : action.incident
    const storeId = String(incidentRelation?.store_id || '')
    return storeId && storeMap.has(storeId)
  }).length

  const overdueStoreActions = storeActionRows.filter((action) => {
    if (!storeMap.has(String(action.store_id || ''))) return false
    if (!isActionOpen(action.status)) return false
    const dueDate = parseDateOnly(action.due_date)
    return dueDate ? dueDate.getTime() < todayDateOnly.getTime() : false
  }).length

  return {
    openIncidents: incidentRows.filter((incident) => isIncidentOpen(incident.status)).length,
    underInvestigation: incidentRows.filter(
      (incident) => String(incident.status || '').trim().toLowerCase() === 'under_investigation'
    ).length,
    overdueActions: overdueIncidentActions + overdueStoreActions,
    totalStores: stores.length,
    incidentBreakdownByPeriod,
    visitStats: {
      visitsNeeded: dashboardStoreRows.filter((row) => row.visitNeeded).length,
      urgentStores: dashboardStoreRows.filter((row) => row.visitNeedLevel === 'urgent').length,
      followUpRequired: dashboardStoreRows.filter((row) => row.followUpRequired).length,
      recentlyLogged: dashboardStoreRows.filter((row) => isRecentVisit(row.lastVisitDate)).length,
      randomVisits: dashboardStoreRows.filter((row) => {
        if (row.lastVisitType !== 'random_area') return false
        return isRecentVisit(row.lastVisitDate)
      }).length,
      plannedRoutes: plannedRouteGroupKeys.size,
      plannedRoutesNext14Days: plannedRouteGroupKeysNext14Days.size,
      potentialTheftReviews: queueReviews.filter((queueCase) =>
        String(queueCase.caseType || '').toLowerCase().includes('theft')
      ).length,
    },
    priorityStores,
    plannedVisits,
    theftReviews,
    stocktakeReviews,
    queueReviews,
    recentFindings,
    visitsUnavailableMessage,
  }
}

export default async function DashboardPage() {
  await requireAuth()
  const data = await getDashboardData()

  return <DashboardClient initialData={data} />
}
