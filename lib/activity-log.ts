import { createClient } from '@/lib/supabase/server'
import { FaEntityType } from '@/types/db'

export interface ActivityLogDetails {
  old?: Record<string, unknown>
  new?: Record<string, unknown>
  [key: string]: unknown
}

export async function logActivity(
  entityType: FaEntityType,
  entityId: string,
  action: string,
  details?: ActivityLogDetails
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User must be authenticated to log activity')
  }

  const { error } = await supabase
    .from('tfs_activity_log')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      action,
      performed_by_user_id: user.id,
      details: details || null,
    })

  if (error) {
    console.error('Failed to log activity:', error)
    throw error
  }
}


