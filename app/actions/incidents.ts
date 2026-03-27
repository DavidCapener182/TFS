'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'
import { revalidatePath } from 'next/cache'
import { FaIncidentCategory, FaSeverity, FaIncidentStatus } from '@/types/db'
import { extractLinkedVisitReportId } from '@/lib/incidents/incident-utils'

export interface CreateIncidentInput {
  store_id: string
  incident_category: FaIncidentCategory
  severity: FaSeverity
  summary: string
  description?: string
  occurred_at: string
  persons_involved?: unknown
  injury_details?: unknown
  witnesses?: unknown
  riddor_reportable?: boolean
}

function toVisitReportRiskRating(
  severity: string | null | undefined
): 'low' | 'medium' | 'high' | 'critical' | '' {
  const normalized = String(severity || '').trim().toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  if (normalized === 'low') return 'low'
  return ''
}

function isPermissionDeniedError(error: any): boolean {
  return String(error?.code || '').trim() === '42501'
}

async function syncLinkedVisitReportFromIncident(supabase: ReturnType<typeof createClient>, incident: any) {
  const reportId =
    extractLinkedVisitReportId(incident?.persons_involved) ||
    extractLinkedVisitReportId(incident)

  if (!reportId) return

  const { data: report, error: reportError } = await supabase
    .from('tfs_visit_reports')
    .select('id, payload, summary')
    .eq('id', reportId)
    .maybeSingle()

  if (reportError || !report) {
    if (reportError) {
      console.error('Failed to fetch linked visit report during incident sync:', reportError)
    }
    return
  }

  const payload =
    report.payload && typeof report.payload === 'object' && !Array.isArray(report.payload)
      ? { ...(report.payload as Record<string, any>) }
      : {}
  const incidentOverview =
    payload.incidentOverview &&
    typeof payload.incidentOverview === 'object' &&
    !Array.isArray(payload.incidentOverview)
      ? { ...payload.incidentOverview }
      : {}

  if (incident.summary) {
    incidentOverview.summary = incident.summary
  }

  const mappedRisk = toVisitReportRiskRating(incident.severity)
  if (mappedRisk) {
    payload.riskRating = mappedRisk
  }

  payload.incidentOverview = incidentOverview

  const { error: updateError } = await supabase
    .from('tfs_visit_reports')
    .update({
      summary: incident.summary || report.summary || null,
      payload,
    })
    .eq('id', reportId)

  if (updateError) {
    console.error('Failed to sync linked visit report after incident update:', updateError)
  }
}

export async function createIncident(input: CreateIncidentInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Generate reference number
  const { data: refData } = await supabase.rpc('tfs_generate_incident_reference')
  const reference_no = refData || `INC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

  const { data: incident, error } = await supabase
    .from('tfs_incidents')
    .insert({
      ...input,
      reference_no,
      reported_by_user_id: user.id,
      reported_at: new Date().toISOString(),
      status: 'open',
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create incident: ${error.message}`)
  }

  // Log activity (trigger will also log, but explicit log for clarity)
  try {
    await logActivity('incident', incident.id, 'CREATED', {
      new: incident,
    })
  } catch (logError) {
    // Log error but don't fail the incident creation
    console.error('Failed to log activity for incident creation:', logError)
  }

  revalidatePath('/incidents')
  return incident
}

export async function updateIncident(
  id: string,
  updates: Partial<
    CreateIncidentInput & {
      status?: FaIncidentStatus
      assigned_investigator_user_id?: string | null
      target_close_date?: string | null
      closure_summary?: string | null
      reported_at?: string | null
      closed_at?: string | null
    }
  >
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Get current incident for activity log
  const { data: currentIncident } = await supabase
    .from('tfs_incidents')
    .select('*')
    .eq('id', id)
    .single()

  if (!currentIncident) {
    throw new Error('Incident not found')
  }

  // Keep closed incidents in the live table so linked actions/investigations remain intact.
  if (updates.status === 'closed' && currentIncident.status !== 'closed') {
    const closedAt = new Date().toISOString()
    const { data: incident, error: closeError } = await supabase
      .from('tfs_incidents')
      .update({
        status: 'closed' as FaIncidentStatus,
        closed_at: closedAt,
        closure_summary: updates.closure_summary || currentIncident.closure_summary,
      })
      .eq('id', id)
      .select()
      .single()

    if (closeError) {
      throw new Error(`Failed to close incident: ${closeError.message}`)
    }

    // Log activity (skip if no authenticated user, as per our updated trigger)
    try {
      await logActivity('incident', id, 'CLOSED', {
        old: currentIncident,
        new: incident,
      })
    } catch (logError) {
      // Log error but don't fail the close operation
      console.error('Failed to log activity for incident closure:', logError)
    }

    revalidatePath('/incidents')
    revalidatePath(`/incidents/${id}`)
    revalidatePath('/reports')
    await syncLinkedVisitReportFromIncident(supabase, incident)
    return incident
  }

  // Regular update for non-closing status changes
  const updateData: Record<string, unknown> = { ...updates }
  let { data: incident, error } = await supabase
    .from('tfs_incidents')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  // Some environments block updates to audit timestamps (e.g. reported_at/closed_at).
  // Retry without those fields so the rest of the incident still saves.
  if (error && isPermissionDeniedError(error)) {
    const retryData = { ...updateData }
    delete retryData.reported_at
    delete retryData.closed_at

    const retryResult = await supabase
      .from('tfs_incidents')
      .update(retryData)
      .eq('id', id)
      .select()
      .single()

    incident = retryResult.data
    error = retryResult.error
  }

  if (error || !incident) {
    throw new Error(`Failed to update incident: ${error?.message || 'Unknown database error'}`)
  }

  // Log activity, but don't block successful incident saves if logging is denied.
  try {
    await logActivity('incident', id, 'UPDATED', {
      old: currentIncident,
      new: incident,
    })
  } catch (logError) {
    console.error('Failed to log activity for incident update:', logError)
  }

  await syncLinkedVisitReportFromIncident(supabase, incident)
  revalidatePath('/incidents')
  revalidatePath(`/incidents/${id}`)
  revalidatePath('/reports')
  return incident
}

export async function reopenIncident(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: openIncident, error: openFetchError } = await supabase
    .from('tfs_incidents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (openFetchError) {
    throw new Error(`Failed to fetch incident: ${openFetchError.message}`)
  }

  if (openIncident) {
    const { data: reopened, error: reopenError } = await supabase
      .from('tfs_incidents')
      .update({
        status: 'open' as FaIncidentStatus,
        closed_at: null,
      })
      .eq('id', id)
      .select()
      .single()

    if (reopenError) {
      throw new Error(`Failed to reopen incident: ${reopenError.message}`)
    }

    try {
      await logActivity('incident', id, 'REOPENED', {
        old: openIncident,
        new: reopened,
      })
    } catch (logError) {
      console.error('Failed to log activity for incident reopen:', logError)
    }

    revalidatePath('/incidents')
    revalidatePath('/dashboard')
    revalidatePath(`/incidents/${id}`)
    return reopened
  }

  const { data: closedIncident, error: closedFetchError } = await supabase
    .from('tfs_closed_incidents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (closedFetchError) {
    throw new Error(`Failed to fetch archived incident: ${closedFetchError.message}`)
  }

  if (!closedIncident) {
    throw new Error('Incident not found')
  }

  const { data: reopened, error: insertError } = await supabase
    .from('tfs_incidents')
    .insert({
      ...closedIncident,
      status: 'open' as FaIncidentStatus,
      closed_at: null,
    })
    .select()
    .single()

  if (insertError) {
    throw new Error(`Failed to reopen archived incident: ${insertError.message}`)
  }

  const { error: deleteError } = await supabase
    .from('tfs_closed_incidents')
    .delete()
    .eq('id', id)

  if (deleteError) {
    throw new Error(`Reopened incident but failed to remove archive copy: ${deleteError.message}`)
  }

  try {
    await logActivity('incident', id, 'REOPENED', {
      old: closedIncident,
      new: reopened,
      source_table: 'tfs_closed_incidents',
    })
  } catch (logError) {
    console.error('Failed to log activity for archived incident reopen:', logError)
  }

  revalidatePath('/incidents')
  revalidatePath('/dashboard')
  revalidatePath(`/incidents/${id}`)
  return reopened
}

export async function assignInvestigator(incidentId: string, investigatorId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Handle unassigning (empty string or 'unassigned')
  const updateData: any = {
    assigned_investigator_user_id: investigatorId === 'unassigned' || !investigatorId ? null : investigatorId,
  }

  // Only update status if we're assigning (not unassigning)
  if (investigatorId && investigatorId !== 'unassigned') {
    const { data: currentIncident, error: currentIncidentError } = await supabase
      .from('tfs_incidents')
      .select('status')
      .eq('id', incidentId)
      .single()

    if (currentIncidentError) {
      console.error('Failed to fetch incident status before assignment:', currentIncidentError)
    }

    // Only change to under_investigation if currently open
    if (currentIncident?.status === 'open') {
      updateData.status = 'under_investigation'
    }
  }

  const { data: incident, error } = await supabase
    .from('tfs_incidents')
    .update(updateData)
    .eq('id', incidentId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to assign investigator: ${error.message}`)
  }

  try {
    await logActivity('incident', incidentId, 'UPDATED', {
      action: investigatorId === 'unassigned' || !investigatorId ? 'Investigator unassigned' : 'Investigator assigned',
      investigator_id: updateData.assigned_investigator_user_id,
    })
  } catch (logError) {
    // Don't block assignment success if activity logging fails.
    console.error('Failed to log investigator assignment activity:', logError)
  }

  revalidatePath('/incidents')
  revalidatePath(`/incidents/${incidentId}`)
  return incident
}

export async function deleteIncident(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check if incident is in closed_incidents table first
  const { data: closedIncident, error: closedError } = await supabase
    .from('tfs_closed_incidents')
    .select('reference_no')
    .eq('id', id)
    .maybeSingle()

  let currentIncident: any = null
  let tableName = 'tfs_incidents'

  // If found in closed_incidents, use that table
  if (closedIncident) {
    currentIncident = closedIncident
    tableName = 'tfs_closed_incidents'
  } else {
    // If not in closed_incidents, check open incidents
    const { data: openIncident, error: openError } = await supabase
      .from('tfs_incidents')
      .select('reference_no')
      .eq('id', id)
      .maybeSingle()
    
    if (openIncident) {
      currentIncident = openIncident
      tableName = 'tfs_incidents'
    }
  }

  if (!currentIncident) {
    throw new Error('Incident not found')
  }

  // Delete from the appropriate table
  const { error: deleteError } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id)

  if (deleteError) {
    throw new Error(`Failed to delete incident: ${deleteError.message}`)
  }

  // Log activity (trigger will also log, but explicit log for clarity)
  try {
    await logActivity('incident', id, 'DELETED', {
      old: currentIncident,
      message: `Incident ${currentIncident.reference_no || id} deleted.`,
    })
  } catch (logError) {
    // Log error but don't fail the deletion
    console.error('Failed to log activity for incident deletion:', logError)
  }

  revalidatePath('/incidents')
  revalidatePath('/dashboard')
  return { success: true }
}

