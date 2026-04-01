'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { FaActionPriority } from '@/types/db'
import {
  matchCanonicalStoreActionQuestion,
  normalizeStoreActionQuestion,
  resolveStoreActionPriorityTheme,
} from '@/lib/store-action-titles'

const NON_ACTIONABLE_STORE_QUESTIONS = new Set<string>([
  'Young persons?',
  'Expectant mothers?',
  'PAT?',
  'Fixed Electrical Wiring?',
  'Air Conditioning?',
  'Lift?',
  'Lifting equipment?',
  'Fire Alarm Maintenance?',
  'Emergency Lighting Maintenance?',
  'Sprinkler System?',
  'Escalators - Service and Maintenance?',
  'Fire Extinguisher Service?',
])

export interface CreateStoreActionInput {
  title: string
  description?: string
  sourceFlaggedItem?: string
  priority?: FaActionPriority
  dueDate?: string
  aiGenerated?: boolean
  nonCanonicalConfirmed?: boolean
}

type StoreActionStatus = 'open' | 'in_progress' | 'blocked' | 'complete' | 'cancelled'

interface UpdateStoreActionInput {
  description?: string | null
  status?: StoreActionStatus
  priority?: FaActionPriority
  dueDate?: string
}

function isValidPriority(value: unknown): value is FaActionPriority {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'urgent'
}

function isValidStoreActionStatus(value: unknown): value is StoreActionStatus {
  return (
    value === 'open' ||
    value === 'in_progress' ||
    value === 'blocked' ||
    value === 'complete' ||
    value === 'cancelled'
  )
}

function toDateOnly(value: string | undefined, fallbackDate: string): string {
  if (!value) return fallbackDate
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallbackDate
  return parsed.toISOString().split('T')[0]
}

function toStoreActionDedupKey(title: string): string {
  const normalized = normalizeStoreActionQuestion(title, title) || title
  return normalized.trim().toLowerCase()
}

function isNonActionableStoreQuestion(question: string): boolean {
  const normalized = normalizeStoreActionQuestion(question, question) || question
  return NON_ACTIONABLE_STORE_QUESTIONS.has(normalized.trim())
}

export async function createStoreActions(
  storeId: string,
  actions: CreateStoreActionInput[]
) {
  if (!storeId) {
    throw new Error('Missing store id')
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('No actions to create')
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const fallbackDueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  let skippedNonActionableCount = 0

  const rowsToInsert = actions
    .map((action) => {
      const rawTitle = String(action.title || '').trim()
      const sourceFlaggedItem = String(action.sourceFlaggedItem || '').trim()
      const context = `${rawTitle} ${sourceFlaggedItem}`
      const canonicalTitle = matchCanonicalStoreActionQuestion(rawTitle, context)
      const title = canonicalTitle || normalizeStoreActionQuestion(rawTitle, context) || rawTitle
      if (!title) return null
      if (isNonActionableStoreQuestion(title)) {
        skippedNonActionableCount += 1
        return null
      }

      if (!canonicalTitle && action.nonCanonicalConfirmed !== true) {
        throw new Error(
          `Action question "${title}" is not in the approved question list. Confirm it before creating actions.`
        )
      }

      const priorityTheme = resolveStoreActionPriorityTheme({
        title,
        sourceFlaggedItem,
        description: action.description?.trim() || null,
      })

      return {
        store_id: storeId,
        title,
        description: action.description?.trim() || null,
        source_flagged_item: sourceFlaggedItem || null,
        priority_summary: priorityTheme.summary,
        priority: isValidPriority(action.priority) ? action.priority : 'medium',
        due_date: toDateOnly(action.dueDate, fallbackDueDate),
        status: 'open',
        ai_generated: action.aiGenerated !== false,
        created_by_user_id: user.id,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  if (rowsToInsert.length === 0) {
    return {
      count: 0,
      ids: [] as string[],
      skipped: 0,
      skippedNonActionable: skippedNonActionableCount,
    }
  }

  const { data: existingActiveRows, error: existingError } = await supabase
    .from('tfs_store_actions')
    .select('id, title, status')
    .eq('store_id', storeId)
    .in('status', ['open', 'in_progress'])

  if (existingError) {
    throw new Error(`Failed to check existing store actions: ${existingError.message}`)
  }

  const existingKeys = new Set(
    (existingActiveRows || []).map((row: any) => toStoreActionDedupKey(String(row?.title || '')))
  )
  const pendingKeys = new Set<string>()
  let skippedCount = 0
  const dedupedRowsToInsert = rowsToInsert.filter((row) => {
    const key = toStoreActionDedupKey(row.title)
    if (existingKeys.has(key) || pendingKeys.has(key)) {
      skippedCount += 1
      return false
    }
    pendingKeys.add(key)
    return true
  })

  if (dedupedRowsToInsert.length === 0) {
    return {
      count: 0,
      ids: [] as string[],
      skipped: skippedCount,
      skippedNonActionable: skippedNonActionableCount,
    }
  }

  let { data, error } = await supabase
    .from('tfs_store_actions')
    .insert(dedupedRowsToInsert)
    .select('id')

  // Backward compatibility if DB migration for priority_summary has not been applied yet.
  if (error && /priority_summary/i.test(error.message || '')) {
    const rowsWithoutSummary = dedupedRowsToInsert.map((row) => {
      const { priority_summary: _prioritySummary, ...rest } = row
      return rest
    })

    const retry = await supabase.from('tfs_store_actions').insert(rowsWithoutSummary).select('id')
    data = retry.data
    error = retry.error
  }

  if (error) {
    throw new Error(`Failed to create store actions: ${error.message}`)
  }

  revalidatePath('/visit-tracker')
  revalidatePath('/stores')
  revalidatePath('/actions')

  return {
    count: data?.length ?? dedupedRowsToInsert.length,
    ids: data?.map((row) => row.id) ?? [],
    skipped: skippedCount,
    skippedNonActionable: skippedNonActionableCount,
  }
}

export async function updateStoreAction(actionId: string, updates: UpdateStoreActionInput) {
  if (!actionId) {
    throw new Error('Missing store action id')
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const updateData: Record<string, unknown> = {}

  if (typeof updates.description !== 'undefined') {
    const description = String(updates.description || '').trim()
    updateData.description = description.length > 0 ? description : null
  }

  if (typeof updates.priority !== 'undefined') {
    if (!isValidPriority(updates.priority)) {
      throw new Error('Invalid priority')
    }
    updateData.priority = updates.priority
  }

  if (typeof updates.status !== 'undefined') {
    if (!isValidStoreActionStatus(updates.status)) {
      throw new Error('Invalid status')
    }
    updateData.status = updates.status
    updateData.completed_at = updates.status === 'complete' ? new Date().toISOString() : null
  }

  if (typeof updates.dueDate !== 'undefined') {
    const fallbackDate = new Date().toISOString().split('T')[0]
    updateData.due_date = toDateOnly(updates.dueDate, fallbackDate)
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('No changes provided')
  }

  const { data, error } = await supabase
    .from('tfs_store_actions')
    .update(updateData)
    .eq('id', actionId)
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to update store action: ${error.message}`)
  }

  revalidatePath('/visit-tracker')
  revalidatePath('/stores')
  revalidatePath('/actions')

  return data
}
