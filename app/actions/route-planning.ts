'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function isMissingRouteSequenceError(error: { message?: string } | null | undefined): boolean {
  return /route_sequence/i.test(error?.message || '')
}

async function updateTfsStoreWithRouteSequenceFallback(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  values: Record<string, unknown>
) {
  const result = await supabase
    .from('tfs_stores')
    .update(values)
    .eq('id', storeId)

  if (!result.error || !isMissingRouteSequenceError(result.error)) {
    return result
  }

  const fallbackValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => key !== 'route_sequence')
  )

  if (Object.keys(fallbackValues).length === 0) {
    return { error: null }
  }

  return supabase
    .from('tfs_stores')
    .update(fallbackValues)
    .eq('id', storeId)
}

export async function updateStoreLocation(
  storeId: string,
  latitude: number | null,
  longitude: number | null
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('tfs_stores')
    .update({
      latitude: latitude || null,
      longitude: longitude || null,
    })
    .eq('id', storeId)

  if (error) {
    console.error('Error updating store location:', error)
    return { error: error.message }
  }

  revalidatePath('/route-planning')
  return { success: true }
}

export async function updateManagerHomeAddress(
  userId: string,
  homeAddress: string | null,
  latitude: number | null,
  longitude: number | null
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('fa_profiles')
    .update({
      home_address: homeAddress || null,
      home_latitude: latitude || null,
      home_longitude: longitude || null,
    })
    .eq('id', userId)

  if (error) {
    console.error('Error updating manager home address:', error)
    return { error: error.message }
  }

  revalidatePath('/route-planning')
  return { success: true }
}

export async function updateRoutePlannedDate(
  storeId: string,
  plannedDate: string | null
) {
  const supabase = createClient()

  const { error } = await updateTfsStoreWithRouteSequenceFallback(supabase, storeId, {
      compliance_audit_2_planned_date: plannedDate || null,
      // Clear route sequence when clearing planned date
      ...(plannedDate === null && { route_sequence: null }),
    })

  if (error) {
    console.error('Error updating planned date:', error)
    return { error: error.message }
  }

  revalidatePath('/route-planning')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateRouteSequence(
  storeIds: string[],
  routeKey: string
) {
  const supabase = createClient()

  // Update each store with its sequence number
  const updates = storeIds.map((storeId, index) => {
    const sequence = index + 1 // Start from 1
    return updateTfsStoreWithRouteSequenceFallback(supabase, storeId, { route_sequence: sequence })
  })

  const results = await Promise.all(updates)
  const errors = results.filter(r => r.error)

  if (errors.length > 0) {
    console.error('Error updating route sequence:', errors)
    return { error: 'Failed to update route sequence' }
  }

  revalidatePath('/route-planning')
  return { success: true }
}

export async function completeRoute(storeIds: string[]) {
  const supabase = createClient()

  // Update all stores in the route: clear planned date (don't set audit date - audit hasn't happened yet)
  const updates = storeIds.map(storeId => {
    return updateTfsStoreWithRouteSequenceFallback(supabase, storeId, {
        compliance_audit_2_planned_date: null,
        route_sequence: null,
      })
  })

  const results = await Promise.all(updates)
  const errors = results.filter(r => r.error)

  if (errors.length > 0) {
    console.error('Error completing route:', errors)
    return { error: 'Failed to complete route' }
  }

  revalidatePath('/route-planning')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function rescheduleRoute(storeIds: string[], newDate: string) {
  const supabase = createClient()

  // Update all stores in the route with new planned date
  const updates = storeIds.map(storeId => {
    return supabase
      .from('tfs_stores')
      .update({
        compliance_audit_2_planned_date: newDate,
      })
      .eq('id', storeId)
  })

  const results = await Promise.all(updates)
  const errors = results.filter(r => r.error)

  if (errors.length > 0) {
    console.error('Error rescheduling route:', errors)
    return { error: 'Failed to reschedule route' }
  }

  revalidatePath('/route-planning')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function cleanupIncompleteAudit2Dates() {
  const supabase = createClient()

  // Clear compliance_audit_2_date for stores where audit 2 percentage is null (audit not actually completed)
  const { error } = await supabase
    .from('tfs_stores')
    .update({
      compliance_audit_2_date: null,
    })
    .not('compliance_audit_2_date', 'is', null)
    .is('compliance_audit_2_overall_pct', null)

  if (error) {
    console.error('Error cleaning up incomplete audit 2 dates:', error)
    return { error: error.message }
  }

  revalidatePath('/visit-tracker')
  revalidatePath('/dashboard')
  return { success: true }
}

export interface OperationalItem {
  id: string
  title: string
  location: string | null
  start_time: string
  duration_minutes: number
}

export async function getRouteOperationalItems(
  managerUserId: string,
  plannedDate: string,
  region: string | null
): Promise<{ data: OperationalItem[] | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('tfs_route_operational_items')
    .select('id, title, location, start_time, duration_minutes')
    .eq('manager_user_id', managerUserId)
    .eq('planned_date', plannedDate)
    .eq('region', region)
    .order('start_time')

  if (error) {
    console.error('Error fetching operational items:', error)
    return { data: null, error: error.message }
  }

  return { data: data || [], error: null }
}

export async function saveRouteOperationalItem(
  managerUserId: string,
  plannedDate: string,
  region: string | null,
  title: string,
  location: string | null,
  startTime: string,
  durationMinutes: number
): Promise<{ data: OperationalItem | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('tfs_route_operational_items')
    .insert({
      manager_user_id: managerUserId,
      planned_date: plannedDate,
      region: region,
      title: title,
      location: location,
      start_time: startTime,
      duration_minutes: durationMinutes,
    })
    .select('id, title, location, start_time, duration_minutes')
    .single()

  if (error) {
    console.error('Error saving operational item:', error)
    return { data: null, error: error.message }
  }

  revalidatePath('/route-planning')
  return { data, error: null }
}

export async function updateRouteOperationalItem(
  id: string,
  title: string,
  location: string | null,
  startTime: string,
  durationMinutes: number
): Promise<{ data: OperationalItem | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('tfs_route_operational_items')
    .update({
      title: title,
      location: location,
      start_time: startTime,
      duration_minutes: durationMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, title, location, start_time, duration_minutes')
    .single()

  if (error) {
    console.error('Error updating operational item:', error)
    return { data: null, error: error.message }
  }

  revalidatePath('/route-planning')
  return { data, error: null }
}

export async function deleteRouteOperationalItem(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('tfs_route_operational_items')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting operational item:', error)
    return { error: error.message }
  }

  revalidatePath('/route-planning')
  return { error: null }
}

export interface VisitTime {
  id: string
  store_id: string
  start_time: string
  end_time: string
}

export async function getRouteVisitTimes(
  managerUserId: string,
  plannedDate: string,
  region: string | null
): Promise<{ data: VisitTime[] | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('tfs_route_visit_times')
    .select('id, store_id, start_time, end_time')
    .eq('manager_user_id', managerUserId)
    .eq('planned_date', plannedDate)
    .eq('region', region)

  if (error) {
    console.error('Error fetching visit times:', error)
    return { data: null, error: error.message }
  }

  return { data: data || [], error: null }
}

export async function saveRouteVisitTime(
  managerUserId: string,
  plannedDate: string,
  region: string | null,
  storeId: string,
  startTime: string,
  endTime: string
): Promise<{ data: VisitTime | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('tfs_route_visit_times')
    .upsert({
      manager_user_id: managerUserId,
      planned_date: plannedDate,
      region: region,
      store_id: storeId,
      start_time: startTime,
      end_time: endTime,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'manager_user_id,planned_date,region,store_id'
    })
    .select('id, store_id, start_time, end_time')
    .single()

  if (error) {
    console.error('Error saving visit time:', error)
    return { data: null, error: error.message }
  }

  revalidatePath('/route-planning')
  return { data, error: null }
}

export async function deleteRouteVisitTime(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('tfs_route_visit_times')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting visit time:', error)
    return { error: error.message }
  }

  revalidatePath('/route-planning')
  return { error: null }
}

export async function deleteAllRouteVisitTimes(
  managerUserId: string,
  plannedDate: string,
  region: string | null
): Promise<{ error: string | null }> {
  const supabase = createClient()

  let query = supabase
    .from('tfs_route_visit_times')
    .delete()
    .eq('manager_user_id', managerUserId)
    .eq('planned_date', plannedDate)
  
  if (region !== null) {
    query = query.eq('region', region)
  } else {
    query = query.is('region', null)
  }

  const { error } = await query

  if (error) {
    console.error('Error deleting all visit times:', error)
    return { error: error.message }
  }

  revalidatePath('/route-planning')
  return { error: null }
}

export async function deleteAllRouteOperationalItems(
  managerUserId: string,
  plannedDate: string,
  region: string | null
): Promise<{ error: string | null }> {
  const supabase = createClient()

  let query = supabase
    .from('tfs_route_operational_items')
    .delete()
    .eq('manager_user_id', managerUserId)
    .eq('planned_date', plannedDate)
  
  if (region !== null) {
    query = query.eq('region', region)
  } else {
    query = query.is('region', null)
  }

  const { error } = await query

  if (error) {
    console.error('Error deleting all operational items:', error)
    return { error: error.message }
  }

  revalidatePath('/route-planning')
  return { error: null }
}

export async function getCompletedRouteVisits(
  managerUserId: string,
  plannedDate: string,
  region: string | null,
  storeIds: string[]
): Promise<{ data: string[] | null; error: string | null }> {
  const supabase = createClient()

  let query = supabase
    .from('tfs_activity_log')
    .select('entity_id, details')
    .eq('entity_type', 'store')
    .eq('action', 'ROUTE_VISIT_COMPLETED')
    .contains('details', {
      manager_user_id: managerUserId,
      planned_date: plannedDate,
      region: region,
    })

  if (storeIds.length > 0) {
    query = query.in('entity_id', storeIds)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching completed route visits:', error)
    return { data: null, error: error.message }
  }

  const completedStoreIds = Array.from(
    new Set((data || []).map((row: any) => row.entity_id).filter(Boolean))
  )

  return { data: completedStoreIds, error: null }
}

export async function markRouteVisitComplete(
  storeId: string,
  managerUserId: string,
  plannedDate: string,
  region: string | null
): Promise<{ success: boolean; alreadyCompleted?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('tfs_activity_log')
    .select('id')
    .eq('entity_type', 'store')
    .eq('entity_id', storeId)
    .eq('action', 'ROUTE_VISIT_COMPLETED')
    .contains('details', {
      manager_user_id: managerUserId,
      planned_date: plannedDate,
      region: region,
    })
    .limit(1)

  if (existingError) {
    console.error('Error checking completed route visit:', existingError)
    return { success: false, error: existingError.message }
  }

  if (existing && existing.length > 0) {
    return { success: true, alreadyCompleted: true }
  }

  const { error } = await supabase
    .from('tfs_activity_log')
    .insert({
      entity_type: 'store',
      entity_id: storeId,
      action: 'ROUTE_VISIT_COMPLETED',
      performed_by_user_id: user.id,
      details: {
        manager_user_id: managerUserId,
        planned_date: plannedDate,
        region: region,
        completed_at: new Date().toISOString(),
      },
    })

  if (error) {
    console.error('Error marking route visit complete:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/route-planning')
  revalidatePath('/dashboard')
  revalidatePath('/calendar')
  revalidatePath('/activity')

  return { success: true }
}

export interface PreVisitBriefingAction {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  created_at: string | null
}

export interface PreVisitBriefingIncident {
  id: string
  reference_no: string
  summary: string
  severity: string
  status: string
  occurred_at: string
}

export interface PreVisitBriefingStoreSummary {
  store_id: string
  previous_score: number | null
  previous_score_date: string | null
  previous_score_source: 'safehub' | 'legacy' | 'none'
  open_actions: PreVisitBriefingAction[]
  recent_incidents: PreVisitBriefingIncident[]
}

function getLegacyPreviousScore(store: any): { score: number; date: string | null } | null {
  const rows = [
    {
      auditNumber: 1,
      score: typeof store?.compliance_audit_1_overall_pct === 'number' ? store.compliance_audit_1_overall_pct : null,
      date: store?.compliance_audit_1_date ?? null,
    },
    {
      auditNumber: 2,
      score: typeof store?.compliance_audit_2_overall_pct === 'number' ? store.compliance_audit_2_overall_pct : null,
      date: store?.compliance_audit_2_date ?? null,
    },
    {
      auditNumber: 3,
      score: typeof store?.compliance_audit_3_overall_pct === 'number' ? store.compliance_audit_3_overall_pct : null,
      date: store?.compliance_audit_3_date ?? null,
    },
  ].filter((row): row is { auditNumber: number; score: number; date: string | null } => row.score !== null)

  if (rows.length === 0) return null

  rows.sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0
    const bTime = b.date ? new Date(b.date).getTime() : 0
    if (aTime !== bTime) return bTime - aTime
    return b.auditNumber - a.auditNumber
  })

  return {
    score: rows[0].score,
    date: rows[0].date,
  }
}

export async function getRoutePreVisitBriefing(
  storeIds: string[],
  incidentLookbackDays = 30
): Promise<{ data: PreVisitBriefingStoreSummary[] | null; error: string | null }> {
  const uniqueStoreIds = Array.from(
    new Set(
      (storeIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0)
    )
  )

  if (uniqueStoreIds.length === 0) {
    return { data: [], error: null }
  }

  const supabase = createClient()
  const lookbackDate = new Date()
  lookbackDate.setDate(lookbackDate.getDate() - Math.max(1, incidentLookbackDays))

  const [
    templatesResult,
    auditsResult,
    storesResult,
    actionsResult,
    incidentsResult,
  ] = await Promise.all([
    supabase
      .from('tfs_audit_templates')
      .select('id')
      .eq('category', 'footasylum_audit'),
    supabase
      .from('tfs_audit_instances')
      .select('store_id, template_id, overall_score, conducted_at, created_at, status')
      .in('store_id', uniqueStoreIds)
      .eq('status', 'completed')
      .not('overall_score', 'is', null),
    supabase
      .from('tfs_stores')
      .select(`
        id,
        compliance_audit_1_date,
        compliance_audit_1_overall_pct,
        compliance_audit_2_date,
        compliance_audit_2_overall_pct,
        compliance_audit_3_date,
        compliance_audit_3_overall_pct
      `)
      .in('id', uniqueStoreIds),
    supabase
      .from('tfs_store_actions')
      .select('id, store_id, title, status, priority, due_date, created_at')
      .in('store_id', uniqueStoreIds)
      .in('status', ['open', 'in_progress', 'blocked'])
      .order('due_date', { ascending: true }),
    supabase
      .from('tfs_incidents')
      .select('id, store_id, reference_no, summary, severity, status, occurred_at')
      .in('store_id', uniqueStoreIds)
      .gte('occurred_at', lookbackDate.toISOString())
      .neq('status', 'cancelled')
      .order('occurred_at', { ascending: false }),
  ])

  const queryError =
    templatesResult.error ||
    auditsResult.error ||
    storesResult.error ||
    actionsResult.error ||
    incidentsResult.error

  if (queryError) {
    console.error('Error fetching pre-visit briefing data:', queryError)
    return { data: null, error: queryError.message }
  }

  const footasylumTemplateIds = new Set((templatesResult.data || []).map((row: any) => row.id))
  const latestSafehubScoreByStore = new Map<string, { score: number; date: string | null }>()

  const completedAudits = (auditsResult.data || [])
    .filter((audit: any) => footasylumTemplateIds.has(audit.template_id))
    .sort((a: any, b: any) => {
      const aTime = new Date(a.conducted_at || a.created_at || 0).getTime()
      const bTime = new Date(b.conducted_at || b.created_at || 0).getTime()
      return bTime - aTime
    })

  for (const audit of completedAudits as any[]) {
    if (latestSafehubScoreByStore.has(audit.store_id)) continue
    latestSafehubScoreByStore.set(audit.store_id, {
      score: Number(audit.overall_score),
      date: audit.conducted_at || audit.created_at || null,
    })
  }

  const storeRowsById = new Map<string, any>((storesResult.data || []).map((store: any) => [store.id, store]))
  const openActionsByStore = new Map<string, PreVisitBriefingAction[]>()
  const recentIncidentsByStore = new Map<string, PreVisitBriefingIncident[]>()

  for (const action of (actionsResult.data || []) as any[]) {
    const current = openActionsByStore.get(action.store_id) || []
    current.push({
      id: action.id,
      title: action.title,
      status: action.status,
      priority: action.priority,
      due_date: action.due_date || null,
      created_at: action.created_at || null,
    })
    openActionsByStore.set(action.store_id, current)
  }

  for (const incident of (incidentsResult.data || []) as any[]) {
    const current = recentIncidentsByStore.get(incident.store_id) || []
    current.push({
      id: incident.id,
      reference_no: incident.reference_no,
      summary: incident.summary,
      severity: incident.severity,
      status: incident.status,
      occurred_at: incident.occurred_at,
    })
    recentIncidentsByStore.set(incident.store_id, current)
  }

  const summaries: PreVisitBriefingStoreSummary[] = uniqueStoreIds.map((storeId) => {
    const safehubScore = latestSafehubScoreByStore.get(storeId) || null
    const legacyScore = getLegacyPreviousScore(storeRowsById.get(storeId))

    const previousScore = safehubScore?.score ?? legacyScore?.score ?? null
    const previousScoreDate = safehubScore?.date ?? legacyScore?.date ?? null
    const previousScoreSource: PreVisitBriefingStoreSummary['previous_score_source'] =
      safehubScore ? 'safehub' : legacyScore ? 'legacy' : 'none'

    return {
      store_id: storeId,
      previous_score: previousScore,
      previous_score_date: previousScoreDate,
      previous_score_source: previousScoreSource,
      open_actions: (openActionsByStore.get(storeId) || []).slice(0, 5),
      recent_incidents: (recentIncidentsByStore.get(storeId) || []).slice(0, 5),
    }
  })

  return { data: summaries, error: null }
}
