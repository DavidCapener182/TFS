import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type {
  FaSeverity,
  TfsCaseEventRow,
  TfsCaseLinkRole,
  TfsCaseRow,
  TfsCaseStage,
  TfsIntakeSource,
  TfsReviewOutcome,
  TfsVisitOutcome,
  TfsVisitRow,
} from '@/types/db'
import {
  buildContinueWorkResolution,
  deriveCaseStageFromIncident,
  deriveCaseStageFromStoreAction,
  deriveDefaultNextAction,
  sortQueueCases,
  type ContinueWorkResolution,
  type QueueCaseRecord,
} from '@/lib/cases/workflow'

type SupabaseLike = {
  from: (table: string) => any
  auth?: {
    getUser?: () => Promise<{ data: { user: { id: string } | null } }>
  }
}

type IncidentLike = {
  id: string
  store_id: string
  reference_no: string | null
  summary: string | null
  severity: string | null
  status: string | null
  reported_at?: string | null
  updated_at?: string | null
  occurred_at?: string | null
  assigned_investigator_user_id?: string | null
  target_close_date?: string | null
  persons_involved?: unknown
}

type StoreActionLike = {
  id: string
  store_id: string
  title: string | null
  description?: string | null
  priority: string | null
  status: string | null
  due_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  created_by_user_id?: string | null
}

type ReviewCaseInput = {
  caseId: string
  outcome: TfsReviewOutcome
  summary?: string
  ownerUserId?: string | null
  dueAt?: string | null
  storeActionTitle?: string
  storeActionDescription?: string
  scheduledFor?: string | null
  visitAssigneeUserId?: string | null
}

type AdvanceCaseInput = {
  caseId: string
  stage: TfsCaseStage
  summary: string
  nextActionCode?: string | null
  nextActionLabel?: string | null
  closureOutcome?: string | null
}

type PlanVisitInput = {
  caseId: string
  scheduledFor?: string | null
  assignedUserId?: string | null
  visitType?: string
  summary?: string
}

type CompleteVisitOutcomeInput = {
  caseId: string
  visitId: string
  outcome: TfsVisitOutcome
  summary?: string
  linkedStoreVisitId?: string | null
  taskTitle?: string
  taskDueDate?: string | null
}

type CloseCaseInput = {
  caseId: string
  closureOutcome: string
  summary?: string
}

type ListQueueCasesInput = {
  storeIds?: string[]
  includeClosed?: boolean
}

export type StoreCaseFileData = {
  cases: QueueCaseRecord[]
  events: Array<
    TfsCaseEventRow & {
      caseReference: string | null
      caseStage: TfsCaseStage
      caseType: string
      actorName: string | null
    }
  >
}

function normalizeSeverity(value: string | null | undefined): FaSeverity {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  return 'low'
}

function mapPriorityToSeverity(value: string | null | undefined): FaSeverity {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'urgent') return 'critical'
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  return 'low'
}

function isCaseTablesMissingError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return (
    String(error.code || '').trim() === '42P01' ||
    /tfs_cases|tfs_case_events|tfs_case_links|tfs_visits/i.test(String(error.message || ''))
  )
}

function isMissingRelationError(error: { code?: string } | null | undefined): boolean {
  return String(error?.code || '').trim() === '42P01'
}

function inferIncidentSource(personsInvolved: unknown): TfsIntakeSource {
  if (!personsInvolved || typeof personsInvolved !== 'object' || Array.isArray(personsInvolved)) {
    return 'legacy_incident'
  }

  const payload = personsInvolved as Record<string, unknown>
  return String(payload.source || '').trim().toLowerCase() === 'store_portal'
    ? 'store_portal'
    : 'legacy_incident'
}

function inferIncidentCaseType(incident: IncidentLike, intakeSource?: TfsIntakeSource): string {
  const source = intakeSource || inferIncidentSource(incident.persons_involved)
  if (source === 'store_portal') {
    const reportType =
      incident.persons_involved &&
      typeof incident.persons_involved === 'object' &&
      !Array.isArray(incident.persons_involved)
        ? String((incident.persons_involved as Record<string, unknown>).reportType || '').trim().toLowerCase()
        : ''

    return reportType === 'theft' ? 'portal_theft' : 'portal_incident'
  }

  return 'legacy_incident'
}

function isBlockingActionStatusOpen(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized !== 'complete' && normalized !== 'cancelled'
}

function isBlockingVisitStatusOpen(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized !== 'completed' && normalized !== 'cancelled'
}

async function getActorUserId(supabase: SupabaseLike): Promise<string | null> {
  if (!supabase.auth?.getUser) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id || null
}

async function insertCaseEvent(
  supabase: SupabaseLike,
  input: {
    caseId: string
    storeId: string
    eventType: string
    stage?: TfsCaseStage | null
    summary: string
    detail?: string | null
    actorUserId?: string | null
    eventAt?: string | null
    metadata?: Record<string, unknown> | null
  }
) {
  const { error } = await supabase.from('tfs_case_events').insert({
    case_id: input.caseId,
    store_id: input.storeId,
    event_type: input.eventType,
    stage: input.stage || null,
    summary: input.summary,
    detail: input.detail || null,
    actor_user_id: input.actorUserId || null,
    event_at: input.eventAt || new Date().toISOString(),
    metadata: input.metadata || null,
  })

  if (error && !isCaseTablesMissingError(error)) {
    throw new Error(`Failed to record case event: ${error.message}`)
  }
}

async function insertCaseLink(
  supabase: SupabaseLike,
  input: {
    caseId: string
    role: TfsCaseLinkRole
    targetTable: string
    targetId: string
    label?: string | null
    metadata?: Record<string, unknown> | null
  }
) {
  const { error } = await supabase.from('tfs_case_links').upsert(
    {
      case_id: input.caseId,
      link_role: input.role,
      target_table: input.targetTable,
      target_id: input.targetId,
      label: input.label || null,
      metadata: input.metadata || null,
    },
    {
      onConflict: 'case_id,target_table,target_id,link_role',
    }
  )

  if (error && !isCaseTablesMissingError(error)) {
    throw new Error(`Failed to record case link: ${error.message}`)
  }
}

async function getOriginCaseId(
  supabase: SupabaseLike,
  targetTable: string,
  targetId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('tfs_case_links')
    .select('case_id')
    .eq('target_table', targetTable)
    .eq('target_id', targetId)
    .eq('link_role', 'origin')
    .maybeSingle()

  if (error) {
    if (isCaseTablesMissingError(error)) return null
    throw new Error(`Failed to load case origin link: ${error.message}`)
  }

  return String((data as { case_id?: string | null } | null)?.case_id || '').trim() || null
}

async function getCaseIdForTargetTables(
  supabase: SupabaseLike,
  targetTables: string[],
  targetId: string
): Promise<string | null> {
  const normalizedTables = Array.from(
    new Set(targetTables.map((value) => String(value || '').trim()).filter(Boolean))
  )

  if (normalizedTables.length === 0) return null

  const { data, error } = await supabase
    .from('tfs_case_links')
    .select('case_id')
    .eq('target_id', targetId)
    .eq('link_role', 'origin')
    .in('target_table', normalizedTables)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isCaseTablesMissingError(error)) return null
    throw new Error(`Failed to load linked case origin: ${error.message}`)
  }

  return String((data as { case_id?: string | null } | null)?.case_id || '').trim() || null
}

async function getOriginIncidentIdsForCase(supabase: SupabaseLike, caseId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('tfs_case_links')
    .select('*')
    .eq('case_id', caseId)
    .eq('link_role', 'origin')

  if (error) {
    if (isCaseTablesMissingError(error)) return []
    throw new Error(`Failed to load incident origin links: ${error.message}`)
  }

  return Array.from(
    new Set(
      ((data || []) as Array<Record<string, unknown>>)
        .filter((link) => {
          const table = String(link.target_table || link.record_type || '').trim().toLowerCase()
          return table === 'tfs_incidents' || table === 'fa_incident'
        })
        .map((link) => String(link.target_id || link.record_id || '').trim())
        .filter(Boolean)
    )
  )
}

async function closeLinkedIncidentsForCase(
  supabase: SupabaseLike,
  caseId: string,
  summary: string
): Promise<void> {
  const incidentIds = await getOriginIncidentIdsForCase(supabase, caseId)
  if (incidentIds.length === 0) return

  const { error } = await supabase
    .from('tfs_incidents')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closure_summary: summary,
    })
    .in('id', incidentIds)

  if (error && !isCaseTablesMissingError(error)) {
    throw new Error(`Failed to close linked incident: ${error.message}`)
  }
}

async function getIncidentCaseId(
  supabase: SupabaseLike,
  incidentId: string
): Promise<string | null> {
  return getCaseIdForTargetTables(supabase, ['tfs_incidents', 'tfs_closed_incidents'], incidentId)
}

async function getCaseRow(supabase: SupabaseLike, caseId: string): Promise<TfsCaseRow | null> {
  const { data, error } = await supabase
    .from('tfs_cases')
    .select('*')
    .eq('id', caseId)
    .maybeSingle()

  if (error) {
    if (isCaseTablesMissingError(error)) return null
    throw new Error(`Failed to load case: ${error.message}`)
  }

  return (data as TfsCaseRow | null) || null
}

async function getBlockingLinkCounts(
  supabase: SupabaseLike,
  caseIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (caseIds.length === 0) return counts

  const { data: links, error: linksError } = await supabase
    .from('tfs_case_links')
    .select('case_id, target_table, target_id')
    .in('case_id', caseIds)
    .eq('link_role', 'blocking')

  if (linksError) {
    if (isCaseTablesMissingError(linksError)) return counts
    throw new Error(`Failed to load case links: ${linksError.message}`)
  }

  const blockingLinks = (links || []) as Array<{
    case_id: string
    target_table: string
    target_id: string
  }>

  const actionIds = blockingLinks.filter((link) => link.target_table === 'tfs_actions').map((link) => link.target_id)
  const storeActionIds = blockingLinks
    .filter((link) => link.target_table === 'tfs_store_actions')
    .map((link) => link.target_id)
  const visitIds = blockingLinks.filter((link) => link.target_table === 'tfs_visits').map((link) => link.target_id)

  const [actionsResult, storeActionsResult, visitsResult] = await Promise.all([
    actionIds.length > 0
      ? supabase.from('tfs_actions').select('id, status').in('id', actionIds)
      : Promise.resolve({ data: [], error: null }),
    storeActionIds.length > 0
      ? supabase.from('tfs_store_actions').select('id, status').in('id', storeActionIds)
      : Promise.resolve({ data: [], error: null }),
    visitIds.length > 0
      ? supabase.from('tfs_visits').select('id, status').in('id', visitIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (actionsResult.error && !isCaseTablesMissingError(actionsResult.error)) {
    throw new Error(`Failed to load linked incident actions: ${actionsResult.error.message}`)
  }
  if (storeActionsResult.error && !isCaseTablesMissingError(storeActionsResult.error)) {
    throw new Error(`Failed to load linked store actions: ${storeActionsResult.error.message}`)
  }
  if (visitsResult.error && !isCaseTablesMissingError(visitsResult.error)) {
    throw new Error(`Failed to load linked case visits: ${visitsResult.error.message}`)
  }

  const openTargetIds = new Set<string>()

  for (const action of ((actionsResult.data || []) as Array<{ id: string; status: string | null }>)) {
    if (isBlockingActionStatusOpen(action.status)) {
      openTargetIds.add(action.id)
    }
  }

  for (const action of ((storeActionsResult.data || []) as Array<{ id: string; status: string | null }>)) {
    if (isBlockingActionStatusOpen(action.status)) {
      openTargetIds.add(action.id)
    }
  }

  for (const visit of ((visitsResult.data || []) as Array<{ id: string; status: string | null }>)) {
    if (isBlockingVisitStatusOpen(visit.status)) {
      openTargetIds.add(visit.id)
    }
  }

  for (const link of blockingLinks) {
    if (!openTargetIds.has(link.target_id)) continue
    counts.set(link.case_id, (counts.get(link.case_id) || 0) + 1)
  }

  return counts
}

async function refreshCaseFromBlockingLinks(
  supabase: SupabaseLike,
  caseId: string,
  summary?: string
) {
  const caseRow = await getCaseRow(supabase, caseId)
  if (!caseRow || caseRow.stage === 'closed') return caseRow

  const blockerCount = (await getBlockingLinkCounts(supabase, [caseId])).get(caseId) || 0

  let nextStage = caseRow.stage
  if (blockerCount === 0 && ['action_agreed', 'visit_required', 'awaiting_follow_up'].includes(caseRow.stage)) {
    nextStage = 'ready_to_close'
  } else if (blockerCount > 0 && caseRow.stage === 'ready_to_close') {
    nextStage = 'awaiting_follow_up'
  }

  if (nextStage === caseRow.stage && !summary) return caseRow

  const nextAction = deriveDefaultNextAction({
    stage: nextStage,
    intakeSource: caseRow.intake_source,
    reviewOutcome: caseRow.review_outcome,
  })

  const { data, error } = await supabase
    .from('tfs_cases')
    .update({
      stage: nextStage,
      next_action_code: nextAction.code,
      next_action_label: nextAction.label,
      last_update_summary: summary || caseRow.last_update_summary,
    })
    .eq('id', caseId)
    .select('*')
    .single()

  if (error) {
    if (isCaseTablesMissingError(error)) return caseRow
    throw new Error(`Failed to refresh case blockers: ${error.message}`)
  }

  return data as TfsCaseRow
}

export async function ensureCaseForIncidentRecord(input: {
  incident: IncidentLike
  intakeSource?: TfsIntakeSource
  actorUserId?: string | null
  supabase?: SupabaseLike
  originTable?: 'tfs_incidents' | 'tfs_closed_incidents'
}) {
  const supabase = input.supabase || createClient()
  const existingCaseId = await getIncidentCaseId(supabase, input.incident.id)
  if (existingCaseId) return existingCaseId

  const intakeSource = input.intakeSource || inferIncidentSource(input.incident.persons_involved)
  const stage = deriveCaseStageFromIncident({
    status: input.incident.status,
    intakeSource,
  })
  const nextAction = deriveDefaultNextAction({ stage, intakeSource })

  const { data, error } = await supabase
    .from('tfs_cases')
    .insert({
      store_id: input.incident.store_id,
      case_type: inferIncidentCaseType(input.incident, intakeSource),
      intake_source: intakeSource,
      origin_reference: input.incident.reference_no,
      severity: normalizeSeverity(input.incident.severity),
      owner_user_id: input.incident.assigned_investigator_user_id || null,
      due_at: input.incident.target_close_date || null,
      stage,
      next_action_code: nextAction.code,
      next_action_label: nextAction.label,
      last_update_summary: input.incident.summary || input.incident.reference_no || 'Incident imported into queue',
    })
    .select('id')
    .single()

  if (error) {
    if (isCaseTablesMissingError(error)) return null
    throw new Error(`Failed to create incident case: ${error.message}`)
  }

  const caseId = String((data as { id: string }).id)
  const originTable = input.originTable || 'tfs_incidents'
  await insertCaseLink(supabase, {
    caseId,
    role: 'origin',
    targetTable: originTable,
    targetId: input.incident.id,
    label: input.incident.reference_no,
  })
  await insertCaseEvent(supabase, {
    caseId,
    storeId: input.incident.store_id,
    eventType: 'case_created',
    stage,
    summary:
      intakeSource === 'store_portal'
        ? 'Store portal submission added to the operational queue.'
        : 'Legacy incident imported into the operational queue.',
    detail: input.incident.summary || null,
    actorUserId: input.actorUserId || null,
    eventAt: input.incident.reported_at || input.incident.updated_at || input.incident.occurred_at || null,
  })

  return caseId
}

async function ensureCaseForStoreActionRecord(input: {
  action: StoreActionLike
  actorUserId?: string | null
  supabase?: SupabaseLike
}) {
  const supabase = input.supabase || createClient()
  const existingCaseId = await getOriginCaseId(supabase, 'tfs_store_actions', input.action.id)
  if (existingCaseId) return existingCaseId

  const stage = deriveCaseStageFromStoreAction({
    status: input.action.status,
    dueAt: input.action.due_date,
  })
  const nextAction = deriveDefaultNextAction({
    stage,
    intakeSource: 'legacy_store_action',
  })

  const { data, error } = await supabase
    .from('tfs_cases')
    .insert({
      store_id: input.action.store_id,
      case_type: 'store_action',
      intake_source: 'legacy_store_action',
      origin_reference: input.action.title || null,
      severity: mapPriorityToSeverity(input.action.priority),
      owner_user_id: input.action.created_by_user_id || null,
      due_at: input.action.due_date || null,
      stage,
      next_action_code: nextAction.code,
      next_action_label: nextAction.label,
      last_update_summary: input.action.title || 'Store action imported into queue',
    })
    .select('id')
    .single()

  if (error) {
    if (isCaseTablesMissingError(error)) return null
    throw new Error(`Failed to create store action case: ${error.message}`)
  }

  const caseId = String((data as { id: string }).id)
  await insertCaseLink(supabase, {
    caseId,
    role: 'origin',
    targetTable: 'tfs_store_actions',
    targetId: input.action.id,
    label: input.action.title || null,
  })
  await insertCaseLink(supabase, {
    caseId,
    role: 'blocking',
    targetTable: 'tfs_store_actions',
    targetId: input.action.id,
    label: input.action.title || null,
  })
  await insertCaseEvent(supabase, {
    caseId,
    storeId: input.action.store_id,
    eventType: 'case_created',
    stage,
    summary: 'Store action imported into the operational queue.',
    detail: input.action.title || null,
    actorUserId: input.actorUserId || null,
    eventAt: input.action.created_at || input.action.updated_at || null,
  })

  return caseId
}

export async function importLegacyCases() {
  const supabase = createClient()
  const actorUserId = await getActorUserId(supabase)

  const [incidentsResult, archivedIncidentsResult, storeActionsResult] = await Promise.all([
    supabase
      .from('tfs_incidents')
      .select(
        'id, store_id, reference_no, summary, severity, status, reported_at, updated_at, occurred_at, assigned_investigator_user_id, target_close_date, persons_involved'
      ),
    supabase
      .from('tfs_closed_incidents')
      .select(
        'id, store_id, reference_no, summary, severity, status, reported_at, updated_at, occurred_at, assigned_investigator_user_id, target_close_date, persons_involved'
      ),
    supabase
      .from('tfs_store_actions')
      .select('id, store_id, title, description, priority, status, due_date, created_at, updated_at, created_by_user_id')
      .not('status', 'in', '(complete,cancelled)'),
  ])

  if (incidentsResult.error) {
    if (isCaseTablesMissingError(incidentsResult.error)) {
      return { created: 0, importedIncidents: 0, importedStoreActions: 0 }
    }
    throw new Error(`Failed to load incidents for case import: ${incidentsResult.error.message}`)
  }

  if (archivedIncidentsResult.error) {
    if (isCaseTablesMissingError(archivedIncidentsResult.error)) {
      return { created: 0, importedIncidents: 0, importedStoreActions: 0 }
    }
    throw new Error(`Failed to load archived incidents for case import: ${archivedIncidentsResult.error.message}`)
  }

  if (storeActionsResult.error) {
    if (isCaseTablesMissingError(storeActionsResult.error)) {
      return { created: 0, importedIncidents: 0, importedStoreActions: 0 }
    }
    throw new Error(`Failed to load store actions for case import: ${storeActionsResult.error.message}`)
  }

  let importedIncidents = 0
  for (const incident of (incidentsResult.data || []) as IncidentLike[]) {
    const existingCaseId = await getIncidentCaseId(supabase, incident.id)
    if (existingCaseId) continue

    const caseId = await ensureCaseForIncidentRecord({
      incident,
      actorUserId,
      supabase,
    })
    if (caseId) importedIncidents += 1
  }

  for (const incident of (archivedIncidentsResult.data || []) as IncidentLike[]) {
    const existingCaseId = await getIncidentCaseId(supabase, incident.id)
    if (existingCaseId) continue

    const caseId = await ensureCaseForIncidentRecord({
      incident,
      actorUserId,
      supabase,
      originTable: 'tfs_closed_incidents',
    })
    if (caseId) importedIncidents += 1
  }

  let importedStoreActions = 0
  for (const action of (storeActionsResult.data || []) as StoreActionLike[]) {
    const existingCaseId = await getOriginCaseId(supabase, 'tfs_store_actions', action.id)
    if (existingCaseId) continue

    const caseId = await ensureCaseForStoreActionRecord({
      action,
      actorUserId,
      supabase,
    })
    if (caseId) importedStoreActions += 1
  }

  return {
    created: importedIncidents + importedStoreActions,
    importedIncidents,
    importedStoreActions,
  }
}

export async function listQueueCases(input: ListQueueCasesInput = {}): Promise<QueueCaseRecord[]> {
  const supabase = createClient()
  let query = supabase.from('tfs_cases').select('*').order('updated_at', { ascending: false })

  if (input.storeIds && input.storeIds.length > 0) {
    query = query.in('store_id', input.storeIds)
  }

  if (!input.includeClosed) {
    query = query.neq('stage', 'closed')
  }

  const { data: caseRows, error } = await query

  if (error) {
    if (isCaseTablesMissingError(error)) return []
    throw new Error(`Failed to load queue cases: ${error.message}`)
  }

  const cases = (caseRows || []) as TfsCaseRow[]
  if (cases.length === 0) return []

  const storeIds = Array.from(new Set(cases.map((record) => record.store_id)))
  const ownerIds = Array.from(new Set(cases.map((record) => record.owner_user_id).filter(Boolean))) as string[]

  const [storesResult, ownersResult, blockerCounts, originLinksResult] = await Promise.all([
    supabase.from('tfs_stores').select('id, store_name, store_code').in('id', storeIds),
    ownerIds.length > 0
      ? supabase.from('fa_profiles').select('id, full_name').in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
    getBlockingLinkCounts(supabase, cases.map((record) => record.id)),
    supabase
      .from('tfs_case_links')
      .select('*')
      .in('case_id', cases.map((record) => record.id))
      .eq('link_role', 'origin'),
  ])

  if (storesResult.error && !isMissingRelationError(storesResult.error)) {
    throw new Error(`Failed to load queue stores: ${storesResult.error.message}`)
  }
  if (ownersResult.error) {
    throw new Error(`Failed to load queue owners: ${ownersResult.error.message}`)
  }
  if (originLinksResult.error && !isCaseTablesMissingError(originLinksResult.error)) {
    throw new Error(`Failed to load queue origin links: ${originLinksResult.error.message}`)
  }

  const storesById = new Map(
    ((storesResult.data || []) as Array<{ id: string; store_name: string; store_code: string | null }>).map((store) => [
      store.id,
      store,
    ])
  )
  const ownersById = new Map(
    ((ownersResult.data || []) as Array<{ id: string; full_name: string | null }>).map((owner) => [owner.id, owner])
  )
  const originLinksByCaseId = new Map<string, { targetTable: string | null; targetId: string | null }>()
  ;((originLinksResult.data || []) as Array<Record<string, unknown>>).forEach((rawLink) => {
    const caseId = String(rawLink.case_id || '').trim()
    if (!caseId || originLinksByCaseId.has(caseId)) return

    const targetTable = String(rawLink.target_table || rawLink.record_type || '').trim() || null
    const targetId = String(rawLink.target_id || rawLink.record_id || '').trim() || null
    originLinksByCaseId.set(caseId, { targetTable, targetId })
  })
  const linkedIncidentIds = Array.from(
    new Set(
      Array.from(originLinksByCaseId.values())
        .map((link) => String(link.targetId || '').trim())
        .filter(Boolean)
    )
  )
  const [openOriginIncidentsResult, closedOriginIncidentsResult] = await Promise.all([
    linkedIncidentIds.length > 0
      ? supabase
          .from('tfs_incidents')
          .select('id, summary, description, persons_involved')
          .in('id', linkedIncidentIds)
      : Promise.resolve({ data: [], error: null }),
    linkedIncidentIds.length > 0
      ? supabase
          .from('tfs_closed_incidents')
          .select('id, summary, description, persons_involved')
          .in('id', linkedIncidentIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (openOriginIncidentsResult.error && !isCaseTablesMissingError(openOriginIncidentsResult.error)) {
    throw new Error(`Failed to load linked incidents: ${openOriginIncidentsResult.error.message}`)
  }
  if (closedOriginIncidentsResult.error && !isCaseTablesMissingError(closedOriginIncidentsResult.error)) {
    throw new Error(`Failed to load linked closed incidents: ${closedOriginIncidentsResult.error.message}`)
  }
  const incidentDetailsById = new Map<
    string,
    {
      summary: string | null
      description: string | null
      theftValueGbp: number | null
      theftItemsSummary: string | null
    }
  >()
  const mapIncidentDetails = (
    incidents: Array<{
      id: string
      summary: string | null
      description: string | null
      persons_involved?: unknown
    }>
  ) => {
    incidents.forEach((incident) => {
      if (incidentDetailsById.has(incident.id)) return
      const meta =
        incident.persons_involved &&
        typeof incident.persons_involved === 'object' &&
        !Array.isArray(incident.persons_involved)
          ? (incident.persons_involved as Record<string, unknown>)
          : null
      const theftValueRaw = Number(meta?.theftValueGbp)
      const theftValueGbp = Number.isFinite(theftValueRaw) ? theftValueRaw : null
      const theftItems = Array.isArray(meta?.theftItems) ? meta?.theftItems : []
      const theftItemsSummary = theftItems
        .map((item) => {
          const payload = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
          const title = String(payload.title || '').trim()
          if (!title) return null
          const quantity = Math.max(1, Number(payload.quantity) || 1)
          const unitPrice = Number(payload.unitPrice)
          if (Number.isFinite(unitPrice)) {
            const lineTotal = quantity * unitPrice
            return `${title} x${quantity} @ £${unitPrice.toFixed(2)} = £${lineTotal.toFixed(2)}`
          }
          return `${title} x${quantity}`
        })
        .filter(Boolean)
        .join(', ')

      incidentDetailsById.set(incident.id, {
        summary: incident.summary || null,
        description: incident.description || null,
        theftValueGbp,
        theftItemsSummary: theftItemsSummary || null,
      })
    })
  }
  mapIncidentDetails(
    (openOriginIncidentsResult.data || []) as Array<{
      id: string
      summary: string | null
      description: string | null
      persons_involved?: unknown
    }>
  )
  mapIncidentDetails(
    (closedOriginIncidentsResult.data || []) as Array<{
      id: string
      summary: string | null
      description: string | null
      persons_involved?: unknown
    }>
  )

  const records = cases.map((record): QueueCaseRecord => {
    const store = storesById.get(record.store_id)
    const owner = record.owner_user_id ? ownersById.get(record.owner_user_id) : null
    const originLink = originLinksByCaseId.get(record.id)
    const originIncidentDetails =
      originLink?.targetId ? incidentDetailsById.get(String(originLink.targetId).trim()) : null

    return {
      id: record.id,
      storeId: record.store_id,
      storeName: store?.store_name || 'Unknown store',
      storeCode: store?.store_code || null,
      caseType: record.case_type,
      intakeSource: record.intake_source,
      originReference: record.origin_reference,
      originTargetTable: originLink?.targetTable || null,
      originTargetId: originLink?.targetId || null,
      originIncidentSummary: originIncidentDetails?.summary || null,
      originIncidentDescription: originIncidentDetails?.description || null,
      originTheftValueGbp: originIncidentDetails?.theftValueGbp || null,
      originTheftItemsSummary: originIncidentDetails?.theftItemsSummary || null,
      severity: normalizeSeverity(record.severity),
      ownerUserId: record.owner_user_id,
      ownerName: owner?.full_name || null,
      dueAt: record.due_at,
      stage: record.stage,
      nextActionCode: record.next_action_code,
      nextActionLabel: record.next_action_label,
      lastUpdateSummary: record.last_update_summary,
      reviewOutcome: record.review_outcome,
      closureOutcome: record.closure_outcome,
      closedAt: record.closed_at,
      openBlockerCount: blockerCounts.get(record.id) || 0,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    }
  })

  return sortQueueCases(records)
}

export async function listStoreCaseFileData(storeIds: string[]): Promise<StoreCaseFileData> {
  const supabase = createClient()
  const cases = await listQueueCases({ storeIds, includeClosed: true })
  if (cases.length === 0) {
    return { cases: [], events: [] }
  }

  const caseIds = cases.map((record) => record.id)
  const actorIds = Array.from(new Set(cases.map((record) => record.ownerUserId).filter(Boolean))) as string[]

  const { data: eventsData, error: eventsError } = await supabase
    .from('tfs_case_events')
    .select('*')
    .in('case_id', caseIds)
    .order('event_at', { ascending: false })

  if (eventsError) {
    if (isCaseTablesMissingError(eventsError)) return { cases, events: [] }
    throw new Error(`Failed to load store case events: ${eventsError.message}`)
  }

  const eventActorIds = Array.from(
    new Set(((eventsData || []) as Array<{ actor_user_id?: string | null }>).map((event) => event.actor_user_id).filter(Boolean))
  ) as string[]

  const allActorIds = Array.from(new Set([...actorIds, ...eventActorIds]))
  const { data: actorsData, error: actorsError } =
    allActorIds.length > 0
      ? await supabase.from('fa_profiles').select('id, full_name').in('id', allActorIds)
      : { data: [], error: null as { message?: string } | null }

  if (actorsError) {
    throw new Error(`Failed to load case event actors: ${actorsError.message}`)
  }

  const actorsById = new Map(
    ((actorsData || []) as Array<{ id: string; full_name: string | null }>).map((actor) => [actor.id, actor.full_name])
  )
  const casesById = new Map(cases.map((record) => [record.id, record]))

  const events = ((eventsData || []) as TfsCaseEventRow[])
    .map((event) => {
      const caseRecord = casesById.get(event.case_id)
      if (!caseRecord) return null

      return {
        ...event,
        caseReference: caseRecord.originReference,
        caseStage: caseRecord.stage,
        caseType: caseRecord.caseType,
        actorName: event.actor_user_id ? actorsById.get(event.actor_user_id) || null : null,
      }
    })
    .filter((event): event is NonNullable<typeof event> => event !== null)

  return { cases, events }
}

export async function resolveContinueWork(input: {
  caseId?: string
  storeId?: string
}): Promise<ContinueWorkResolution | null> {
  if (input.caseId) {
    const caseRow = await getCaseRow(createClient(), input.caseId)
    if (!caseRow) return null

    const records = await listQueueCases({ storeIds: [caseRow.store_id], includeClosed: true })
    const match = records.find((record) => record.id === caseRow.id)
    return match ? buildContinueWorkResolution(match) : null
  }

  if (input.storeId) {
    const records = await listQueueCases({ storeIds: [input.storeId], includeClosed: false })
    const activeRecord = records.find((record) => record.stage !== 'closed')
    return activeRecord ? buildContinueWorkResolution(activeRecord) : null
  }

  return null
}

export async function advanceCase(input: AdvanceCaseInput) {
  const supabase = createClient()
  const actorUserId = await getActorUserId(supabase)
  const caseRow = await getCaseRow(supabase, input.caseId)

  if (!caseRow) {
    throw new Error('Case not found.')
  }

  const nextAction =
    input.nextActionCode || input.nextActionLabel
      ? {
          code: input.nextActionCode || null,
          label: input.nextActionLabel || null,
        }
      : deriveDefaultNextAction({
          stage: input.stage,
          intakeSource: caseRow.intake_source,
          reviewOutcome: caseRow.review_outcome,
        })

  const { data, error } = await supabase
    .from('tfs_cases')
    .update({
      stage: input.stage,
      next_action_code: nextAction.code,
      next_action_label: nextAction.label,
      last_update_summary: input.summary,
      closure_outcome: input.closureOutcome || caseRow.closure_outcome,
      closed_at: input.stage === 'closed' ? new Date().toISOString() : null,
    })
    .eq('id', input.caseId)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to advance case: ${error.message}`)
  }

  await insertCaseEvent(supabase, {
    caseId: input.caseId,
    storeId: caseRow.store_id,
    eventType: input.stage === 'closed' ? 'case_closed' : 'case_advanced',
    stage: input.stage,
    summary: input.summary,
    actorUserId,
  })

  return data as TfsCaseRow
}

export async function planVisit(input: PlanVisitInput) {
  const supabase = createClient()
  const actorUserId = await getActorUserId(supabase)
  const caseRow = await getCaseRow(supabase, input.caseId)

  if (!caseRow) {
    throw new Error('Case not found.')
  }

  const { data: existingVisit, error: existingVisitError } = await supabase
    .from('tfs_visits')
    .select('*')
    .eq('case_id', input.caseId)
    .in('status', ['planned', 'in_progress'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (existingVisitError && !isCaseTablesMissingError(existingVisitError)) {
    throw new Error(`Failed to load existing case visit: ${existingVisitError.message}`)
  }

  const visitPayload = {
    case_id: input.caseId,
    store_id: caseRow.store_id,
    visit_type: input.visitType || 'follow_up',
    status: 'planned',
    scheduled_for: input.scheduledFor || null,
    assigned_user_id: input.assignedUserId || null,
    created_by_user_id: actorUserId,
  }

  const visitResult = existingVisit
    ? await supabase
        .from('tfs_visits')
        .update({
          scheduled_for: visitPayload.scheduled_for,
          assigned_user_id: visitPayload.assigned_user_id,
          visit_type: visitPayload.visit_type,
        })
        .eq('id', existingVisit.id)
        .select('*')
        .single()
    : await supabase.from('tfs_visits').insert(visitPayload).select('*').single()

  if (visitResult.error) {
    throw new Error(`Failed to plan visit: ${visitResult.error.message}`)
  }

  const visit = visitResult.data as TfsVisitRow
  await insertCaseLink(supabase, {
    caseId: input.caseId,
    role: 'result',
    targetTable: 'tfs_visits',
    targetId: visit.id,
    label: 'Case visit',
  })
  await insertCaseLink(supabase, {
    caseId: input.caseId,
    role: 'blocking',
    targetTable: 'tfs_visits',
    targetId: visit.id,
    label: 'Case visit',
  })

  const nextAction = deriveDefaultNextAction({
    stage: 'visit_required',
    intakeSource: caseRow.intake_source,
    reviewOutcome: caseRow.review_outcome,
  })

  const { error: caseError } = await supabase
    .from('tfs_cases')
    .update({
      stage: 'visit_required',
      owner_user_id: input.assignedUserId || caseRow.owner_user_id,
      next_action_code: nextAction.code,
      next_action_label: nextAction.label,
      last_update_summary: input.summary || 'Visit follow-up is required.',
    })
    .eq('id', input.caseId)

  if (caseError) {
    throw new Error(`Failed to update case for visit planning: ${caseError.message}`)
  }

  await insertCaseEvent(supabase, {
    caseId: input.caseId,
    storeId: caseRow.store_id,
    eventType: 'visit_planned',
    stage: 'visit_required',
    summary: input.summary || 'Visit planned from the case workflow.',
    actorUserId,
    metadata: {
      visitId: visit.id,
      scheduledFor: input.scheduledFor || null,
      assignedUserId: input.assignedUserId || null,
    },
  })

  return visit
}

export async function reviewCase(input: ReviewCaseInput) {
  const supabase = createClient()
  const actorUserId = await getActorUserId(supabase)
  const caseRow = await getCaseRow(supabase, input.caseId)

  if (!caseRow) {
    throw new Error('Case not found.')
  }

  if (caseRow.stage === 'closed') {
    throw new Error('This case is already closed.')
  }

  let nextStage: TfsCaseStage = caseRow.stage
  let nextSummary =
    String(input.summary || '').trim() ||
    caseRow.last_update_summary ||
    'Case review updated.'
  let closureOutcome: string | null = caseRow.closure_outcome

  if (input.outcome === 'store_action_created') {
    const dueDate = input.dueAt ? String(input.dueAt).split('T')[0] : new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]
    const { data: storeAction, error: storeActionError } = await supabase
      .from('tfs_store_actions')
      .insert({
        store_id: caseRow.store_id,
        title: String(input.storeActionTitle || caseRow.origin_reference || 'Follow up case action').trim(),
        description: String(input.storeActionDescription || nextSummary).trim() || null,
        priority: normalizeSeverity(caseRow.severity) === 'critical' ? 'urgent' : normalizeSeverity(caseRow.severity),
        due_date: dueDate,
        status: 'open',
        ai_generated: false,
        created_by_user_id: actorUserId,
      })
      .select('id, title')
      .single()

    if (storeActionError) {
      throw new Error(`Failed to create linked store action: ${storeActionError.message}`)
    }

    await insertCaseLink(supabase, {
      caseId: input.caseId,
      role: 'result',
      targetTable: 'tfs_store_actions',
      targetId: storeAction.id,
      label: storeAction.title,
    })
    await insertCaseLink(supabase, {
      caseId: input.caseId,
      role: 'blocking',
      targetTable: 'tfs_store_actions',
      targetId: storeAction.id,
      label: storeAction.title,
    })

    nextStage = 'action_agreed'
    nextSummary = nextSummary || 'Store action created from review.'
  } else if (input.outcome === 'visit_required') {
    await planVisit({
      caseId: input.caseId,
      scheduledFor: input.scheduledFor || null,
      assignedUserId: input.visitAssigneeUserId || input.ownerUserId || null,
      summary: nextSummary || 'Visit required from review.',
    })

    nextStage = 'visit_required'
  } else if (input.outcome === 'incident_escalated') {
    const { data: originIncidentLink, error: originIncidentLinkError } = await supabase
      .from('tfs_case_links')
      .select('target_id')
      .eq('case_id', input.caseId)
      .eq('link_role', 'origin')
      .eq('target_table', 'tfs_incidents')
      .maybeSingle()

    if (originIncidentLinkError && !isCaseTablesMissingError(originIncidentLinkError)) {
      throw new Error(`Failed to locate incident origin link: ${originIncidentLinkError.message}`)
    }

    if (originIncidentLink?.target_id) {
      const { error: incidentError } = await supabase
        .from('tfs_incidents')
        .update({
          status: 'under_investigation',
          assigned_investigator_user_id: input.ownerUserId || caseRow.owner_user_id,
          target_close_date: input.dueAt ? String(input.dueAt).split('T')[0] : null,
        })
        .eq('id', originIncidentLink.target_id)

      if (incidentError) {
        throw new Error(`Failed to escalate linked incident: ${incidentError.message}`)
      }
    }

    nextStage = 'under_review'
    nextSummary = nextSummary || 'Incident escalated for investigation.'
  } else if (input.outcome === 'acknowledged_only') {
    const blockerCount = (await getBlockingLinkCounts(supabase, [input.caseId])).get(input.caseId) || 0
    if (blockerCount === 0) {
      nextStage = 'closed'
      closureOutcome = 'reviewed_only'
      nextSummary = nextSummary || 'Submission acknowledged and closed.'
    } else {
      nextStage = 'ready_to_close'
      nextSummary = nextSummary || 'Submission acknowledged and ready to close.'
    }
  } else if (input.outcome === 'closed_no_further_action') {
    nextStage = 'closed'
    nextSummary = nextSummary || 'Closed with no further action.'
    closureOutcome = 'closed_no_further_action'
  }

  const nextAction = deriveDefaultNextAction({
    stage: nextStage,
    intakeSource: caseRow.intake_source,
    reviewOutcome: input.outcome,
  })

  const { data, error } = await supabase
    .from('tfs_cases')
    .update({
      owner_user_id: input.ownerUserId || caseRow.owner_user_id,
      due_at: input.dueAt || caseRow.due_at,
      stage: nextStage,
      review_outcome: input.outcome,
      next_action_code: nextAction.code,
      next_action_label: nextAction.label,
      last_update_summary: nextSummary,
      closure_outcome: closureOutcome,
      closed_at: nextStage === 'closed' ? new Date().toISOString() : null,
    })
    .eq('id', input.caseId)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to review case: ${error.message}`)
  }

  await insertCaseEvent(supabase, {
    caseId: input.caseId,
    storeId: caseRow.store_id,
    eventType: 'review_completed',
    stage: nextStage,
    summary: nextSummary,
    actorUserId,
    metadata: {
      outcome: input.outcome,
    },
  })

  if (nextStage === 'closed') {
    await closeLinkedIncidentsForCase(supabase, input.caseId, nextSummary)
  }

  return data as TfsCaseRow
}

export async function completeVisitOutcome(input: CompleteVisitOutcomeInput) {
  const supabase = createClient()
  const actorUserId = await getActorUserId(supabase)
  const caseRow = await getCaseRow(supabase, input.caseId)

  if (!caseRow) {
    throw new Error('Case not found.')
  }

  const { data: visit, error: visitError } = await supabase
    .from('tfs_visits')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      visit_outcome: input.outcome,
      outcome_summary: input.summary || null,
      linked_store_visit_id: input.linkedStoreVisitId || null,
    })
    .eq('id', input.visitId)
    .eq('case_id', input.caseId)
    .select('*')
    .single()

  if (visitError) {
    throw new Error(`Failed to complete visit outcome: ${visitError.message}`)
  }

  let nextStage: TfsCaseStage = 'ready_to_close'
  let nextSummary = String(input.summary || '').trim() || 'Visit outcome completed.'
  let shouldRefreshFromBlockers = true

  if (input.outcome === 'follow_up_visit_required') {
    const { data: followUpVisit, error: followUpVisitError } = await supabase
      .from('tfs_visits')
      .insert({
        case_id: input.caseId,
        store_id: caseRow.store_id,
        visit_type: 'follow_up',
        status: 'planned',
        assigned_user_id: actorUserId,
        created_by_user_id: actorUserId,
      })
      .select('id')
      .single()

    if (followUpVisitError) {
      throw new Error(`Failed to create follow-up visit: ${followUpVisitError.message}`)
    }

    await insertCaseLink(supabase, {
      caseId: input.caseId,
      role: 'result',
      targetTable: 'tfs_visits',
      targetId: followUpVisit.id,
      label: 'Follow-up case visit',
    })
    await insertCaseLink(supabase, {
      caseId: input.caseId,
      role: 'blocking',
      targetTable: 'tfs_visits',
      targetId: followUpVisit.id,
      label: 'Follow-up case visit',
    })

    nextStage = 'visit_required'
  } else if (input.outcome === 'report_required' || input.outcome === 'escalated_to_manager') {
    nextStage = 'awaiting_follow_up'
    shouldRefreshFromBlockers = false
  } else if (input.outcome === 'store_action_created' || input.outcome === 'incident_task_created') {
    const dueDate = input.taskDueDate ? String(input.taskDueDate).split('T')[0] : new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]

    if (input.outcome === 'incident_task_created') {
      const { data: incidentOriginLink } = await supabase
        .from('tfs_case_links')
        .select('target_id')
        .eq('case_id', input.caseId)
        .eq('target_table', 'tfs_incidents')
        .eq('link_role', 'origin')
        .maybeSingle()

      if (incidentOriginLink?.target_id) {
        const { data: incidentAction, error: incidentActionError } = await supabase
          .from('tfs_actions')
          .insert({
            incident_id: incidentOriginLink.target_id,
            title: String(input.taskTitle || 'Case follow-up action').trim(),
            description: nextSummary,
            priority: normalizeSeverity(caseRow.severity) === 'critical' ? 'urgent' : normalizeSeverity(caseRow.severity),
            assigned_to_user_id: actorUserId,
            due_date: dueDate,
            status: 'open',
          })
          .select('id, title')
          .single()

        if (incidentActionError) {
          throw new Error(`Failed to create incident task: ${incidentActionError.message}`)
        }

        await insertCaseLink(supabase, {
          caseId: input.caseId,
          role: 'result',
          targetTable: 'tfs_actions',
          targetId: incidentAction.id,
          label: incidentAction.title,
        })
        await insertCaseLink(supabase, {
          caseId: input.caseId,
          role: 'blocking',
          targetTable: 'tfs_actions',
          targetId: incidentAction.id,
          label: incidentAction.title,
        })
      }
    } else {
      const { data: storeAction, error: storeActionError } = await supabase
        .from('tfs_store_actions')
        .insert({
          store_id: caseRow.store_id,
          title: String(input.taskTitle || 'Case follow-up action').trim(),
          description: nextSummary,
          priority: normalizeSeverity(caseRow.severity) === 'critical' ? 'urgent' : normalizeSeverity(caseRow.severity),
          due_date: dueDate,
          status: 'open',
          ai_generated: false,
          created_by_user_id: actorUserId,
        })
        .select('id, title')
        .single()

      if (storeActionError) {
        throw new Error(`Failed to create store action from visit outcome: ${storeActionError.message}`)
      }

      await insertCaseLink(supabase, {
        caseId: input.caseId,
        role: 'result',
        targetTable: 'tfs_store_actions',
        targetId: storeAction.id,
        label: storeAction.title,
      })
      await insertCaseLink(supabase, {
        caseId: input.caseId,
        role: 'blocking',
        targetTable: 'tfs_store_actions',
        targetId: storeAction.id,
        label: storeAction.title,
      })
    }

    nextStage = 'action_agreed'
  }

  const nextAction = deriveDefaultNextAction({
    stage: nextStage,
    intakeSource: caseRow.intake_source,
    reviewOutcome: caseRow.review_outcome,
  })

  const { error: caseError } = await supabase
    .from('tfs_cases')
    .update({
      stage: nextStage,
      next_action_code: nextAction.code,
      next_action_label: nextAction.label,
      last_update_summary: nextSummary,
    })
    .eq('id', input.caseId)

  if (caseError) {
    throw new Error(`Failed to update case after visit outcome: ${caseError.message}`)
  }

  await insertCaseEvent(supabase, {
    caseId: input.caseId,
    storeId: caseRow.store_id,
    eventType: 'visit_completed',
    stage: nextStage,
    summary: nextSummary,
    actorUserId,
    metadata: {
      visitId: visit.id,
      outcome: input.outcome,
      linkedStoreVisitId: input.linkedStoreVisitId || null,
    },
  })

  if (shouldRefreshFromBlockers) {
    await refreshCaseFromBlockingLinks(supabase, input.caseId, nextSummary)
  }
  return visit as TfsVisitRow
}

export async function closeCase(input: CloseCaseInput) {
  const supabase = createClient()
  const actorUserId = await getActorUserId(supabase)
  const caseRow = await getCaseRow(supabase, input.caseId)

  if (!caseRow) {
    throw new Error('Case not found.')
  }

  const blockerCount = (await getBlockingLinkCounts(supabase, [input.caseId])).get(input.caseId) || 0
  if (blockerCount > 0) {
    throw new Error('This case still has open blockers and cannot be closed yet.')
  }

  const { data, error } = await supabase
    .from('tfs_cases')
    .update({
      stage: 'closed',
      next_action_code: 'view_case',
      next_action_label: 'View case',
      last_update_summary: input.summary || 'Case closed.',
      closure_outcome: input.closureOutcome,
      closed_at: new Date().toISOString(),
    })
    .eq('id', input.caseId)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to close case: ${error.message}`)
  }

  await insertCaseEvent(supabase, {
    caseId: input.caseId,
    storeId: caseRow.store_id,
    eventType: 'case_closed',
    stage: 'closed',
    summary: input.summary || `Case closed: ${input.closureOutcome}`,
    actorUserId,
    metadata: {
      closureOutcome: input.closureOutcome,
    },
  })

  await closeLinkedIncidentsForCase(
    supabase,
    input.caseId,
    input.summary || `Case closed: ${input.closureOutcome}`
  )

  return data as TfsCaseRow
}

export async function linkIncidentActionToCase(incidentId: string, actionId: string, actionTitle: string | null) {
  const supabase = createClient()
  const actorUserId = await getActorUserId(supabase)
  const caseId = await getIncidentCaseId(supabase, incidentId)
  if (!caseId) return

  const caseRow = await getCaseRow(supabase, caseId)
  if (!caseRow) return

  await insertCaseLink(supabase, {
    caseId,
    role: 'result',
    targetTable: 'tfs_actions',
    targetId: actionId,
    label: actionTitle,
  })
  await insertCaseLink(supabase, {
    caseId,
    role: 'blocking',
    targetTable: 'tfs_actions',
    targetId: actionId,
    label: actionTitle,
  })
  await insertCaseEvent(supabase, {
    caseId,
    storeId: caseRow.store_id,
    eventType: 'action_created',
    stage: 'action_agreed',
    summary: actionTitle ? `Linked action created: ${actionTitle}` : 'Linked action created from the incident workflow.',
    actorUserId,
    metadata: {
      actionId,
      incidentId,
    },
  })

  await refreshCaseFromBlockingLinks(supabase, caseId, actionTitle ? `Action created: ${actionTitle}` : undefined)
}

export async function refreshLinkedCasesForRecord(targetTable: string, targetId: string, summary?: string) {
  const supabase = createClient()
  let query = supabase
    .from('tfs_case_links')
    .select('case_id')
    .eq('target_id', targetId)

  if (targetTable === 'tfs_incidents' || targetTable === 'tfs_closed_incidents') {
    query = query.in('target_table', ['tfs_incidents', 'tfs_closed_incidents'])
  } else {
    query = query.eq('target_table', targetTable)
  }

  const { data, error } = await query

  if (error) {
    if (isCaseTablesMissingError(error)) return
    throw new Error(`Failed to load linked cases: ${error.message}`)
  }

  const caseIds = Array.from(new Set(((data || []) as Array<{ case_id: string }>).map((row) => row.case_id)))
  for (const caseId of caseIds) {
    await refreshCaseFromBlockingLinks(supabase, caseId, summary)
  }
}

export async function createCaseFromStorePortalIncident(input: {
  incidentId: string
  referenceNo: string
  storeId: string
  summary: string
  severity: FaSeverity
  personsInvolved?: unknown
}) {
  let supabase: SupabaseLike

  try {
    supabase = createAdminSupabaseClient()
  } catch {
    supabase = createClient()
  }

  return ensureCaseForIncidentRecord({
    incident: {
      id: input.incidentId,
      store_id: input.storeId,
      reference_no: input.referenceNo,
      summary: input.summary,
      severity: input.severity,
      status: 'open',
      persons_involved: input.personsInvolved,
      reported_at: new Date().toISOString(),
    },
    intakeSource: 'store_portal',
    supabase,
  })
}
