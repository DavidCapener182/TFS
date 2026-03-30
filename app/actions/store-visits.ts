'use server'

import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/activity-log'
import { createClient } from '@/lib/supabase/server'
import {
  buildStoreVisitActivityDetailText,
  normalizeStoreVisitActivityDetails,
  normalizeStoreVisitActivityPayloads,
  STORE_VISIT_ACTIVITY_OPTIONS,
  STORE_VISIT_TYPE_OPTIONS,
  type StoreVisitActivityDetails,
  type StoreVisitActivityKey,
  type StoreVisitNeedLevel,
  type StoreVisitActivityPayloads,
  type StoreVisitType,
} from '@/lib/visit-needs'
import { formatStoreVisitsActionError } from '@/lib/store-visits-schema'

const WRITABLE_ROLES = new Set(['admin', 'ops'])
const VALID_VISIT_TYPES = new Set<StoreVisitType>(STORE_VISIT_TYPE_OPTIONS.map((option) => option.value))
const VALID_ACTIVITY_KEYS = new Set<StoreVisitActivityKey>(STORE_VISIT_ACTIVITY_OPTIONS.map((option) => option.key))
const VALID_NEED_LEVELS = new Set<StoreVisitNeedLevel>(['none', 'monitor', 'needed', 'urgent'])

export interface LogStoreVisitInput {
  storeId: string
  visitType: StoreVisitType
  visitedAt?: string
  completedActivityKeys: StoreVisitActivityKey[]
  completedActivityDetails?: StoreVisitActivityDetails
  completedActivityPayloads?: StoreVisitActivityPayloads
  notes?: string
  followUpRequired?: boolean
  needScoreSnapshot?: number
  needLevelSnapshot?: StoreVisitNeedLevel
  needReasonsSnapshot?: string[]
}

export interface SaveStoreVisitSessionInput {
  visitId?: string
  storeId: string
  visitType: StoreVisitType
  visitedAt?: string
  notes?: string
  followUpRequired?: boolean
  needScoreSnapshot?: number
  needLevelSnapshot?: StoreVisitNeedLevel
  needReasonsSnapshot?: string[]
}

function parseVisitTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Visit date and time is invalid.')
  }
  return parsed.toISOString()
}

function normalizeActivityKeys(keys: StoreVisitActivityKey[]): StoreVisitActivityKey[] {
  const uniqueKeys = Array.from(
    new Set(
      (Array.isArray(keys) ? keys : [])
        .map((key) => String(key || '').trim())
        .filter((key): key is StoreVisitActivityKey => VALID_ACTIVITY_KEYS.has(key as StoreVisitActivityKey))
    )
  )

  return uniqueKeys
}

async function getWritableVisitContext() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: profile, error: profileError } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new Error('Unable to verify user role.')
  }

  if (!WRITABLE_ROLES.has(profile.role)) {
    throw new Error('You do not have permission to log store visits.')
  }

  return { supabase, userId: user.id }
}

function normalizeNeedSnapshot(input: {
  needScoreSnapshot?: number
  needLevelSnapshot?: StoreVisitNeedLevel
  needReasonsSnapshot?: string[]
}) {
  const needScoreSnapshot = Number.isFinite(input.needScoreSnapshot)
    ? Math.max(0, Math.min(100, Math.round(Number(input.needScoreSnapshot))))
    : 0

  const needLevelSnapshot = VALID_NEED_LEVELS.has(input.needLevelSnapshot || 'none')
    ? (input.needLevelSnapshot as StoreVisitNeedLevel)
    : 'none'

  const needReasonsSnapshot =
    Array.isArray(input.needReasonsSnapshot) && input.needReasonsSnapshot.length > 0
      ? input.needReasonsSnapshot.map((reason) => String(reason || '').trim()).filter(Boolean)
      : null

  return {
    needScoreSnapshot,
    needLevelSnapshot,
    needReasonsSnapshot,
  }
}

function buildVisitSessionPayload(
  input: SaveStoreVisitSessionInput,
  status: 'draft' | 'completed',
  userId: string
) {
  const snapshots = normalizeNeedSnapshot(input)

  return {
    store_id: input.storeId,
    visit_type: input.visitType,
    visited_at: parseVisitTimestamp(input.visitedAt),
    completed_activity_keys: [] as StoreVisitActivityKey[],
    completed_activity_details: {},
    completed_activity_payloads: {},
    notes: String(input.notes || '').trim() || null,
    follow_up_required: Boolean(input.followUpRequired),
    need_score_snapshot: snapshots.needScoreSnapshot,
    need_level_snapshot: snapshots.needLevelSnapshot,
    need_reasons_snapshot: snapshots.needReasonsSnapshot,
    status,
    created_by_user_id: userId,
  }
}

export async function saveDraftStoreVisitSession(input: SaveStoreVisitSessionInput) {
  if (!input.storeId) {
    throw new Error('Missing store id.')
  }

  if (!VALID_VISIT_TYPES.has(input.visitType)) {
    throw new Error('Visit type is invalid.')
  }

  const { supabase, userId } = await getWritableVisitContext()
  const payload = buildVisitSessionPayload(input, 'draft', userId)

  if (input.visitId) {
    const { data: visit, error } = await supabase
      .from('tfs_store_visits')
      .update({
        visit_type: payload.visit_type,
        visited_at: payload.visited_at,
        notes: payload.notes,
        follow_up_required: payload.follow_up_required,
        need_score_snapshot: payload.need_score_snapshot,
        need_level_snapshot: payload.need_level_snapshot,
        need_reasons_snapshot: payload.need_reasons_snapshot,
        status: 'draft',
      })
      .eq('id', input.visitId)
      .select('id, visited_at, visit_type, status')
      .single()

    if (error) {
      throw new Error(formatStoreVisitsActionError('Failed to save draft visit', error))
    }

    revalidatePath('/visit-tracker')
    revalidatePath('/stores')
    revalidatePath(`/stores/${input.storeId}`)
    revalidatePath('/dashboard')

    return {
      id: visit.id,
      visitedAt: visit.visited_at,
      visitType: visit.visit_type,
      status: visit.status,
    }
  }

  const { data: visit, error } = await supabase
    .from('tfs_store_visits')
    .insert(payload)
    .select('id, visited_at, visit_type, status')
    .single()

  if (error) {
    throw new Error(formatStoreVisitsActionError('Failed to create draft visit', error))
  }

  revalidatePath('/visit-tracker')
  revalidatePath('/stores')
  revalidatePath(`/stores/${input.storeId}`)
  revalidatePath('/dashboard')

  return {
    id: visit.id,
    visitedAt: visit.visited_at,
    visitType: visit.visit_type,
    status: visit.status,
  }
}

export async function completeStoreVisitSession(input: SaveStoreVisitSessionInput & { visitId: string }) {
  if (!input.visitId) {
    throw new Error('Missing visit session id.')
  }

  if (!input.storeId) {
    throw new Error('Missing store id.')
  }

  if (!VALID_VISIT_TYPES.has(input.visitType)) {
    throw new Error('Visit type is invalid.')
  }

  const trimmedNotes = String(input.notes || '').trim()
  const { supabase, userId } = await getWritableVisitContext()
  const payload = buildVisitSessionPayload(input, 'completed', userId)

  const { data: linkedReports, count: linkedReportCount, error: linkedReportsError } = await supabase
    .from('tfs_visit_reports')
    .select('id, title, status', { count: 'exact' })
    .eq('store_visit_id', input.visitId)

  if (linkedReportsError) {
    throw new Error('Failed to validate linked reports before completing the visit.')
  }

  const outstandingReports = (linkedReports || []).filter(
    (report) => String(report.status || '').toLowerCase() !== 'final'
  )

  if (outstandingReports.length > 0) {
    const outstandingTitles = outstandingReports
      .slice(0, 3)
      .map((report) => String(report.title || 'Untitled report').trim())
      .filter(Boolean)

    const titleSuffix =
      outstandingTitles.length > 0
        ? ` Outstanding draft reports: ${outstandingTitles.join(', ')}${outstandingReports.length > outstandingTitles.length ? ', ...' : ''}.`
        : ''

    throw new Error(
      `Complete all linked reports before finishing the visit.${titleSuffix}`
    )
  }

  if (!trimmedNotes && !linkedReportCount) {
    throw new Error('Add visit notes or complete at least one linked report before finishing the visit.')
  }

  const { data: visit, error } = await supabase
    .from('tfs_store_visits')
    .update({
      visit_type: payload.visit_type,
      visited_at: payload.visited_at,
      notes: payload.notes,
      follow_up_required: payload.follow_up_required,
      need_score_snapshot: payload.need_score_snapshot,
      need_level_snapshot: payload.need_level_snapshot,
      need_reasons_snapshot: payload.need_reasons_snapshot,
      status: 'completed',
    })
    .eq('id', input.visitId)
    .select('id, visited_at, visit_type, status')
    .single()

  if (error) {
    throw new Error(formatStoreVisitsActionError('Failed to complete visit session', error))
  }

  try {
    await logActivity('store', input.storeId, 'VISIT_LOGGED', {
      visit_id: visit.id,
      visit_type: visit.visit_type,
      visited_at: visit.visited_at,
      follow_up_required: Boolean(input.followUpRequired),
      need_score_snapshot: payload.need_score_snapshot,
      need_level_snapshot: payload.need_level_snapshot,
      source: 'visit_session_complete',
      linked_report_count: linkedReportCount || 0,
    })
  } catch (activityError) {
    console.error('Failed to log store visit completion activity:', activityError)
  }

  revalidatePath('/visit-tracker')
  revalidatePath('/stores')
  revalidatePath(`/stores/${input.storeId}`)
  revalidatePath('/dashboard')
  revalidatePath('/reports')

  return {
    id: visit.id,
    visitedAt: visit.visited_at,
    visitType: visit.visit_type,
    status: visit.status,
  }
}

export async function logStoreVisit(input: LogStoreVisitInput) {
  if (!input.storeId) {
    throw new Error('Missing store id.')
  }

  if (!VALID_VISIT_TYPES.has(input.visitType)) {
    throw new Error('Visit type is invalid.')
  }

  const completedActivityKeys = normalizeActivityKeys(input.completedActivityKeys)
  const normalizedInputDetails = normalizeStoreVisitActivityDetails(
    input.completedActivityDetails,
    completedActivityKeys
  )
  const completedActivityPayloads = normalizeStoreVisitActivityPayloads(
    input.completedActivityPayloads,
    completedActivityKeys
  )
  const completedActivityDetails = completedActivityKeys.reduce<StoreVisitActivityDetails>((details, key) => {
    const detailText = buildStoreVisitActivityDetailText(
      key,
      normalizedInputDetails[key],
      completedActivityPayloads[key]
    )

    if (detailText) {
      details[key] = detailText
    }

    return details
  }, {})
  const trimmedNotes = String(input.notes || '').trim()

  if (completedActivityKeys.length === 0 && trimmedNotes.length === 0) {
    throw new Error('Select at least one on-site activity or add a note.')
  }

  if (completedActivityKeys.includes('other') && !completedActivityDetails.other) {
    throw new Error('Add details for the Other activity before saving the visit.')
  }

  const { supabase, userId } = await getWritableVisitContext()
  const snapshots = normalizeNeedSnapshot(input)

  const payload = {
    store_id: input.storeId,
    visit_type: input.visitType,
    visited_at: parseVisitTimestamp(input.visitedAt),
    completed_activity_keys: completedActivityKeys,
    completed_activity_details: completedActivityDetails,
    completed_activity_payloads: completedActivityPayloads,
    notes: trimmedNotes || null,
    follow_up_required: Boolean(input.followUpRequired),
    need_score_snapshot: snapshots.needScoreSnapshot,
    need_level_snapshot: snapshots.needLevelSnapshot,
    need_reasons_snapshot: snapshots.needReasonsSnapshot,
    status: 'completed',
    created_by_user_id: userId,
  }

  const { data: visit, error } = await supabase
    .from('tfs_store_visits')
    .insert(payload)
    .select('id, visited_at, visit_type')
    .single()

  if (error) {
    throw new Error(formatStoreVisitsActionError('Failed to log store visit', error))
  }

  try {
    await logActivity('store', input.storeId, 'VISIT_LOGGED', {
      visit_id: visit.id,
      visit_type: input.visitType,
      visited_at: visit.visited_at,
      completed_activity_keys: completedActivityKeys,
      completed_activity_details: completedActivityDetails,
      completed_activity_payloads: completedActivityPayloads,
      follow_up_required: Boolean(input.followUpRequired),
      need_score_snapshot: snapshots.needScoreSnapshot,
      need_level_snapshot: snapshots.needLevelSnapshot,
    })
  } catch (activityError) {
    console.error('Failed to log store visit activity:', activityError)
  }

  revalidatePath('/visit-tracker')
  revalidatePath('/stores')
  revalidatePath(`/stores/${input.storeId}`)
  revalidatePath('/dashboard')

  return {
    id: visit.id,
    visitedAt: visit.visited_at,
    visitType: visit.visit_type,
  }
}
