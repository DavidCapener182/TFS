'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { FaActionPriority } from '@/types/db'

const WRITABLE_ROLES = new Set(['admin', 'ops'])

export interface CreateStoreActionInput {
  title: string
  description?: string
  sourceFlaggedItem?: string
  priority?: FaActionPriority
  dueDate?: string
  aiGenerated?: boolean
}

function isValidPriority(value: unknown): value is FaActionPriority {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'urgent'
}

function toDateOnly(value: string | undefined, fallbackDate: string): string {
  if (!value) return fallbackDate
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallbackDate
  return parsed.toISOString().split('T')[0]
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

  const { data: profile, error: profileError } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new Error('Unable to verify user role')
  }

  if (!WRITABLE_ROLES.has(profile.role)) {
    throw new Error('You do not have permission to create store actions')
  }

  const fallbackDueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const rowsToInsert = actions
    .map((action) => {
      const title = String(action.title || '').trim()
      if (!title) return null

      return {
        store_id: storeId,
        title,
        description: action.description?.trim() || null,
        source_flagged_item: action.sourceFlaggedItem?.trim() || null,
        priority: isValidPriority(action.priority) ? action.priority : 'medium',
        due_date: toDateOnly(action.dueDate, fallbackDueDate),
        status: 'open',
        ai_generated: action.aiGenerated !== false,
        created_by_user_id: user.id,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  if (rowsToInsert.length === 0) {
    throw new Error('No valid actions to create')
  }

  const { data, error } = await supabase
    .from('fa_store_actions')
    .insert(rowsToInsert)
    .select('id')

  if (error) {
    throw new Error(`Failed to create store actions: ${error.message}`)
  }

  revalidatePath('/audit-tracker')
  revalidatePath('/stores')

  return {
    count: data?.length ?? rowsToInsert.length,
    ids: data?.map((row) => row.id) ?? [],
  }
}
