import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { StoreDetailWorkspace } from '@/components/stores/store-detail-workspace'
import { getMissingStoreCrmTables, getStoreCrmUnavailableMessage } from '@/lib/store-crm-schema'
import { getStoreVisitsUnavailableMessage, isMissingStoreVisitsTableError } from '@/lib/store-visits-schema'
import {
  isStoreVisitActivityKey,
  normalizeStoreVisitActivityDetails,
  normalizeStoreVisitActivityPayloads,
} from '@/lib/visit-needs'
import {
  buildStoreMergeContext,
  getStoreIdsIncludingAliases,
  shouldHideStore,
  StoreMergeContext,
} from '@/lib/store-normalization'
import type { VisitHistoryEntry } from '@/components/visit-tracker/types'
import type { VisitReportType } from '@/lib/reports/visit-report-types'

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

type VisitReportRow = {
  id: string
  store_visit_id: string | null
  report_type: string
  status: string
  title: string
  summary: string | null
  visit_date: string
  updated_at: string
}

async function getStore(storeId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tfs_stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching store:', error)
    return null
  }

  return data
}

async function getStoreMergeContext(): Promise<StoreMergeContext> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tfs_stores')
    .select('id, store_name, store_code, address_line_1, city, postcode, latitude, longitude')

  if (error) {
    console.error('Error fetching stores for merge context:', error)
    return buildStoreMergeContext([])
  }

  return buildStoreMergeContext(data || [])
}

async function getStoreIncidents(storeIds: string[]) {
  if (storeIds.length === 0) return []

  const supabase = createClient()

  const [openResult, closedResult] = await Promise.all([
    supabase
      .from('tfs_incidents')
      .select(`
        id,
        reference_no,
        summary,
        description,
        incident_category,
        status,
        closed_at,
        occurred_at,
        severity,
        riddor_reportable,
        persons_involved,
        injury_details,
        witnesses,
        assigned_investigator_user_id,
        target_close_date
      `)
      .in('store_id', storeIds),
    supabase
      .from('tfs_closed_incidents')
      .select(`
        id,
        reference_no,
        summary,
        description,
        incident_category,
        status,
        closed_at,
        occurred_at,
        severity,
        riddor_reportable,
        persons_involved,
        injury_details,
        witnesses,
        assigned_investigator_user_id,
        target_close_date
      `)
      .in('store_id', storeIds),
  ])

  if (openResult.error) {
    console.error('Error fetching open store incidents:', openResult.error)
  }
  if (closedResult.error) {
    console.error('Error fetching closed store incidents:', closedResult.error)
  }

  const openIncidents = openResult.data || []
  const closedIncidents = (closedResult.data || []).map((incident) => ({
    ...incident,
    status: incident.status || 'closed',
  }))

  return [...openIncidents, ...closedIncidents].sort((a, b) => {
    const aTime = a?.occurred_at ? new Date(a.occurred_at).getTime() : 0
    const bTime = b?.occurred_at ? new Date(b.occurred_at).getTime() : 0
    return bTime - aTime
  })
}

async function getIncidentProfiles() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fa_profiles')
    .select('id, full_name')
    .order('full_name', { ascending: true })

  if (error) {
    console.error('Error fetching incident profiles:', error)
    return []
  }

  return data || []
}

async function getStoreActions(storeIds: string[]) {
  if (storeIds.length === 0) return []

  const supabase = createClient()

  const { data: incidents, error: incidentsError } = await supabase
    .from('tfs_incidents')
    .select('id')
    .in('store_id', storeIds)

  if (incidentsError) {
    console.error('Error fetching store incidents for actions:', incidentsError)
  }

  const incidentIds = (incidents || []).map((incident: { id: string }) => incident.id)

  const { data: storeActions, error: storeActionsError } = await supabase
    .from('tfs_store_actions')
    .select('id, title, source_flagged_item, description, priority, status, due_date, completed_at, created_at')
    .in('store_id', storeIds)
    .order('due_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (storeActionsError) {
    console.error('Error fetching direct store actions:', storeActionsError)
  }

  let incidentActions: any[] = []
  if (incidentIds.length > 0) {
    const { data, error } = await supabase
      .from('tfs_actions')
      .select(`
        id,
        title,
        status,
        due_date,
        completed_at,
        incident_id,
        incident:tfs_incidents!tfs_actions_incident_id_fkey(reference_no)
      `)
      .in('incident_id', incidentIds)
      .not('title', 'ilike', 'Implement visit report actions:%')
      .order('due_date', { ascending: false })

    if (error) {
      console.error('Error fetching incident-linked store actions:', error)
    } else {
      incidentActions = data || []
    }
  }

  const mappedIncidentActions = incidentActions.map((action: any) => ({
    ...action,
    source_type: 'incident' as const,
  }))

  const mappedStoreActions = (storeActions || []).map((action: any) => ({
    ...action,
    incident_id: null,
    incident: null,
    source_type: 'store' as const,
  }))

  return [...mappedIncidentActions, ...mappedStoreActions].sort((a, b) => {
    const aTime = a?.due_date ? new Date(a.due_date).getTime() : 0
    const bTime = b?.due_date ? new Date(b.due_date).getTime() : 0
    return bTime - aTime
  })
}

async function getStoreCrmData(storeId: string) {
  const supabase = createClient()
  const [contactsResult, notesResult, trackerResult] = await Promise.all([
    supabase
      .from('tfs_store_contacts')
      .select('id, contact_name, job_title, email, phone, preferred_method, is_primary, notes, created_by_user_id, created_at')
      .eq('store_id', storeId)
      .order('is_primary', { ascending: false })
      .order('contact_name', { ascending: true }),
    supabase
      .from('tfs_store_notes')
      .select('id, note_type, title, body, created_by_user_id, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tfs_store_contact_tracker')
      .select('id, contact_id, interaction_type, subject, details, outcome, interaction_at, follow_up_date, created_by_user_id, created_at')
      .eq('store_id', storeId)
      .order('interaction_at', { ascending: false }),
  ])

  const missingTables = getMissingStoreCrmTables({
    tfs_store_contacts: contactsResult.error,
    tfs_store_notes: notesResult.error,
    tfs_store_contact_tracker: trackerResult.error,
  })

  if (contactsResult.error && !missingTables.includes('tfs_store_contacts')) {
    console.error('Error fetching store contacts:', contactsResult.error)
  }
  if (notesResult.error && !missingTables.includes('tfs_store_notes')) {
    console.error('Error fetching store notes:', notesResult.error)
  }
  if (trackerResult.error && !missingTables.includes('tfs_store_contact_tracker')) {
    console.error('Error fetching store contact tracker:', trackerResult.error)
  }

  const contacts = contactsResult.data || []
  const notes = notesResult.data || []
  const trackerEntries = trackerResult.data || []

  const userIds = new Set<string>()
  contacts.forEach((contact) => {
    if (contact.created_by_user_id) userIds.add(contact.created_by_user_id)
  })
  notes.forEach((note) => {
    if (note.created_by_user_id) userIds.add(note.created_by_user_id)
  })
  trackerEntries.forEach((entry) => {
    if (entry.created_by_user_id) userIds.add(entry.created_by_user_id)
  })

  let profileRows: Array<{ id: string; full_name: string | null }> = []
  if (userIds.size > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('fa_profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds))

    if (profilesError) {
      console.error('Error fetching CRM profile names:', profilesError)
    } else {
      profileRows = profiles || []
    }
  }

  const userMap = profileRows.reduce<Record<string, string | null>>((accumulator, profile) => {
    accumulator[profile.id] = profile.full_name
    return accumulator
  }, {})

  return {
    contacts,
    notes,
    trackerEntries,
    userMap,
    isAvailable: missingTables.length === 0,
    unavailableMessage:
      missingTables.length > 0 ? getStoreCrmUnavailableMessage(missingTables) : null,
  }
}

async function getStoreVisits(storeIds: string[]) {
  if (storeIds.length === 0) {
    return {
      visits: [] as VisitHistoryEntry[],
      isAvailable: true,
      unavailableMessage: null as string | null,
    }
  }

  const supabase = createClient()
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

  let isAvailable = true
  let unavailableMessage: string | null = null

  if (storeVisitsResult.error) {
    if (isMissingStoreVisitsTableError(storeVisitsResult.error)) {
      isAvailable = false
      unavailableMessage = getStoreVisitsUnavailableMessage()
    } else {
      console.error('Error fetching store visits:', storeVisitsResult.error)
    }
  }

  if (routeVisitLogsResult.error) {
    console.error('Error fetching store route visit history:', routeVisitLogsResult.error)
  }

  const userIds = new Set<string>()
  const visitIds: string[] = []
  ;(storeVisitsResult.data || []).forEach((visit: any) => {
    if (visit.created_by_user_id) userIds.add(visit.created_by_user_id)
    if (visit.id) visitIds.push(visit.id)
  })
  ;(routeVisitLogsResult.data || []).forEach((visit: any) => {
    if (visit.performed_by_user_id) userIds.add(visit.performed_by_user_id)
  })

  const userMap = new Map<string, string | null>()
  if (userIds.size > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('fa_profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds))

    if (profilesError) {
      console.error('Error fetching store visit profile names:', profilesError)
    } else {
      ;(profiles || []).forEach((profile) => {
        userMap.set(profile.id, profile.full_name || null)
      })
    }
  }

  const evidenceByVisitId = new Map<string, VisitHistoryEntry['evidenceFiles']>()
  const linkedReportsByVisitId = new Map<string, VisitHistoryEntry['linkedReports']>()

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
      console.error('Error fetching store visit evidence:', evidenceResult.error)
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

  const visitsFromLogs: VisitHistoryEntry[] = ((storeVisitsResult.data || []) as any[]).map((visit) => {
    const completedActivityKeys = Array.isArray(visit.completed_activity_keys) ? visit.completed_activity_keys : []

    return {
      id: visit.id,
      source: 'visit_log' as const,
      visitedAt: visit.visited_at,
      status: String(visit.status || '').toLowerCase() === 'draft' ? 'draft' : 'completed',
      visitType: visit.visit_type,
      completedActivityKeys,
      completedActivityDetails: normalizeStoreVisitActivityDetails(
        visit.completed_activity_details,
        completedActivityKeys
      ),
      completedActivityPayloads: normalizeStoreVisitActivityPayloads(
        visit.completed_activity_payloads,
        completedActivityKeys
      ),
      evidenceFiles: evidenceByVisitId.get(visit.id) || [],
      linkedReports: linkedReportsByVisitId.get(visit.id) || [],
      notes: visit.notes || null,
      followUpRequired: Boolean(visit.follow_up_required),
      createdByName: userMap.get(visit.created_by_user_id) || null,
      needScoreSnapshot:
        typeof visit.need_score_snapshot === 'number' ? visit.need_score_snapshot : null,
      needLevelSnapshot: visit.need_level_snapshot || null,
    }
  })

  const visits: VisitHistoryEntry[] = [
    ...visitsFromLogs,
    ...((routeVisitLogsResult.data || []) as any[]).map((visit) => ({
      id: visit.id,
      source: 'route_completion' as const,
      visitedAt: visit.details?.completed_at || visit.created_at,
      status: null,
      visitType: 'route_completion' as const,
      completedActivityKeys: [],
      completedActivityDetails: {},
      completedActivityPayloads: {},
      evidenceFiles: [],
      linkedReports: [],
      notes: visit.details?.planned_date
        ? `Route visit completed for plan date ${visit.details.planned_date}.`
        : 'Route visit completed.',
      followUpRequired: false,
      createdByName: visit.performed_by_user_id ? userMap.get(visit.performed_by_user_id) || null : null,
      needScoreSnapshot: null,
      needLevelSnapshot: null,
    })),
  ].sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime())

  return {
    visits,
    isAvailable,
    unavailableMessage,
  }
}

export default async function StoreCrmPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])

  const [store, mergeContext] = await Promise.all([
    getStore(params.id),
    getStoreMergeContext(),
  ])

  if (!store) {
    notFound()
  }

  if (shouldHideStore(store)) {
    notFound()
  }

  const mergedStoreIds = getStoreIdsIncludingAliases(params.id, mergeContext)

  const [incidents, actions, crmData, visitData, profiles] = await Promise.all([
    getStoreIncidents(mergedStoreIds),
    getStoreActions(mergedStoreIds),
    getStoreCrmData(params.id),
    getStoreVisits(mergedStoreIds),
    getIncidentProfiles(),
  ])

  const canEdit = profile.role === 'admin' || profile.role === 'ops'

  return (
    <StoreDetailWorkspace
      store={store}
      incidents={incidents}
      actions={actions}
      loggedVisits={visitData.visits}
      visitsAvailable={visitData.isAvailable}
      visitsUnavailableMessage={visitData.unavailableMessage}
      userRole={profile.role}
      profiles={profiles}
      crmData={crmData}
      canEdit={canEdit}
    />
  )
}
