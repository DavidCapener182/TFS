'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'
import { revalidatePath } from 'next/cache'
import { FaActionPriority, FaActionStatus } from '@/types/db'

export interface CreateActionInput {
  title: string
  description?: string
  priority: FaActionPriority
  assigned_to_user_id: string
  due_date: string
  status?: FaActionStatus
  evidence_required?: boolean
  investigation_id?: string | null
}

export async function createAction(incidentId: string, input: CreateActionInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: action, error } = await supabase
    .from('tfs_actions')
    .insert({
      ...input,
      incident_id: incidentId,
      status: input.status || 'open',
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create action: ${error.message}`)
  }

  try {
    await logActivity('action', action.id, 'CREATED', {
      new: action,
    })
  } catch (logError) {
    // Do not fail action creation if activity logging is blocked by RLS/policy.
    console.error('Failed to log activity for action creation:', logError)
  }

  // Update incident status to 'actions_in_progress' if not already closed/cancelled
  const { data: incident } = await supabase
    .from('tfs_incidents')
    .select('status')
    .eq('id', incidentId)
    .single()

  if (incident && !['closed', 'cancelled'].includes(incident.status)) {
    const { error: incidentStatusError } = await supabase
      .from('tfs_incidents')
      .update({ status: 'actions_in_progress' })
      .eq('id', incidentId)

    if (incidentStatusError) {
      // Action has already been created; do not surface non-critical status sync failures.
      console.error('Failed to sync incident status after action creation:', incidentStatusError)
    }
  }

  revalidatePath(`/incidents/${incidentId}`)
  revalidatePath('/actions')
  return action
}

export async function updateAction(id: string, updates: Partial<CreateActionInput & { status?: FaActionStatus; completion_notes?: string }>) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: currentAction } = await supabase
    .from('tfs_actions')
    .select('*')
    .eq('id', id)
    .single()

  const updateData: Record<string, unknown> = { ...updates }
  
  // Set completed_at if status changes to complete
  if (updates.status === 'complete' && currentAction?.status !== 'complete') {
    updateData.completed_at = new Date().toISOString()
  }

  const { data: action, error } = await supabase
    .from('tfs_actions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update action: ${error.message}`)
  }

  await logActivity('action', id, 'UPDATED', {
    old: currentAction,
    new: action,
  })

  // Check if we need to update incident status based on action status
  const { data: actions } = await supabase
    .from('tfs_actions')
    .select('status')
    .eq('incident_id', action.incident_id)

  const hasOpenActions = actions?.some(a => 
    ['open', 'in_progress', 'blocked'].includes(a.status)
  ) ?? false

  const { data: incident } = await supabase
    .from('tfs_incidents')
    .select('status')
    .eq('id', action.incident_id)
    .single()

  if (incident && !['closed', 'cancelled'].includes(incident.status)) {
    if (hasOpenActions && incident.status !== 'actions_in_progress') {
      // Update to actions_in_progress if there are open actions
      await supabase
        .from('tfs_incidents')
        .update({ status: 'actions_in_progress' })
        .eq('id', action.incident_id)
    } else if (!hasOpenActions && incident.status === 'actions_in_progress') {
      // All actions complete, revert to under_investigation (if investigator assigned) or open
      const { data: incidentData } = await supabase
        .from('tfs_incidents')
        .select('assigned_investigator_user_id')
        .eq('id', action.incident_id)
        .single()
      
      const newStatus = incidentData?.assigned_investigator_user_id 
        ? 'under_investigation' 
        : 'open'
      
      await supabase
        .from('tfs_incidents')
        .update({ status: newStatus })
        .eq('id', action.incident_id)
    }
  }

  revalidatePath(`/incidents/${action.incident_id}`)
  revalidatePath('/actions')
  return action
}

export async function deleteAction(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Get current action for activity log (before deletion)
  const { data: currentAction } = await supabase
    .from('tfs_actions')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('tfs_actions')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete action: ${error.message}`)
  }

  // Log activity (trigger may also log). Do not fail delete if logging is blocked.
  try {
    await logActivity('action', id, 'DELETED', {
      old: currentAction,
    })
  } catch (logError) {
    console.error('Failed to log activity for action deletion:', logError)
  }

  if (currentAction?.incident_id) {
    // Check if we need to update incident status after deleting action
    const { data: remainingActions } = await supabase
      .from('tfs_actions')
      .select('status')
      .eq('incident_id', currentAction.incident_id)

    const hasOpenActions = remainingActions?.some(a => 
      ['open', 'in_progress', 'blocked'].includes(a.status)
    ) ?? false

    const { data: incident } = await supabase
      .from('tfs_incidents')
      .select('status')
      .eq('id', currentAction.incident_id)
      .single()

    if (incident && !['closed', 'cancelled'].includes(incident.status)) {
      if (!hasOpenActions && incident.status === 'actions_in_progress') {
        // No more open actions, revert status
        const { error: incidentStatusError } = await supabase
          .from('tfs_incidents')
          .update({ status: 'under_investigation' })
          .eq('id', currentAction.incident_id)

        if (incidentStatusError) {
          // Action already deleted; keep UX successful and log non-critical sync failure.
          console.error('Failed to sync incident status after action deletion:', incidentStatusError)
        }
      }
    }

    revalidatePath(`/incidents/${currentAction.incident_id}`)
  }
  revalidatePath('/actions')
  revalidatePath('/dashboard')
}


