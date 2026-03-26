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

  const needScoreSnapshot = Number.isFinite(input.needScoreSnapshot)
    ? Math.max(0, Math.min(100, Math.round(Number(input.needScoreSnapshot))))
    : 0

  const needLevelSnapshot = VALID_NEED_LEVELS.has(input.needLevelSnapshot || 'none')
    ? (input.needLevelSnapshot as StoreVisitNeedLevel)
    : 'none'

  const payload = {
    store_id: input.storeId,
    visit_type: input.visitType,
    visited_at: parseVisitTimestamp(input.visitedAt),
    completed_activity_keys: completedActivityKeys,
    completed_activity_details: completedActivityDetails,
    completed_activity_payloads: completedActivityPayloads,
    notes: trimmedNotes || null,
    follow_up_required: Boolean(input.followUpRequired),
    need_score_snapshot: needScoreSnapshot,
    need_level_snapshot: needLevelSnapshot,
    need_reasons_snapshot:
      Array.isArray(input.needReasonsSnapshot) && input.needReasonsSnapshot.length > 0
        ? input.needReasonsSnapshot.map((reason) => String(reason || '').trim()).filter(Boolean)
        : null,
    created_by_user_id: user.id,
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
      need_score_snapshot: needScoreSnapshot,
      need_level_snapshot: needLevelSnapshot,
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
