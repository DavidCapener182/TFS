'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'
import { revalidatePath } from 'next/cache'
import { FaInvestigationType, FaInvestigationStatus } from '@/types/db'

export interface CreateInvestigationInput {
  investigation_type: FaInvestigationType
  status?: FaInvestigationStatus
  lead_investigator_user_id: string
  root_cause?: string
  contributing_factors?: string
  findings?: string
  recommendations?: string
}

export async function createInvestigation(incidentId: string, input: CreateInvestigationInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const investigationData = {
    ...input,
    incident_id: incidentId,
    status: input.status || 'not_started',
    started_at: input.status === 'in_progress' ? new Date().toISOString() : null,
  }

  const { data: investigation, error } = await supabase
    .from('tfs_investigations')
    .insert(investigationData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create investigation: ${error.message}`)
  }

  await logActivity('investigation', investigation.id, 'CREATED', {
    new: investigation,
  })

  const { data: currentIncident } = await supabase
    .from('tfs_incidents')
    .select('status')
    .eq('id', incidentId)
    .single()

  if (currentIncident && currentIncident.status === 'open') {
    await supabase
      .from('tfs_incidents')
      .update({ status: 'under_investigation' })
      .eq('id', incidentId)
  }

  revalidatePath('/incidents')
  revalidatePath(`/incidents/${incidentId}`)
  return investigation
}

export async function updateInvestigation(id: string, updates: Partial<CreateInvestigationInput & { status?: FaInvestigationStatus }>) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: currentInvestigation } = await supabase
    .from('tfs_investigations')
    .select('*')
    .eq('id', id)
    .single()

  const updateData: Record<string, unknown> = { ...updates }
  
  // Set started_at if status changes to in_progress
  if (updates.status === 'in_progress' && currentInvestigation?.status !== 'in_progress') {
    updateData.started_at = new Date().toISOString()
  }
  
  // Set completed_at if status changes to complete
  if (updates.status === 'complete' && currentInvestigation?.status !== 'complete') {
    updateData.completed_at = new Date().toISOString()
  }

  const { data: investigation, error } = await supabase
    .from('tfs_investigations')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update investigation: ${error.message}`)
  }

  await logActivity('investigation', id, 'UPDATED', {
    old: currentInvestigation,
    new: investigation,
  })

  if (updates.status === 'in_progress') {
    const { data: currentIncident } = await supabase
      .from('tfs_incidents')
      .select('status')
      .eq('id', investigation.incident_id)
      .single()

    if (currentIncident && currentIncident.status === 'open') {
      await supabase
        .from('tfs_incidents')
        .update({ status: 'under_investigation' })
        .eq('id', investigation.incident_id)
    }
  }

  revalidatePath('/incidents')
  revalidatePath(`/incidents/${investigation.incident_id}`)
  return investigation
}

