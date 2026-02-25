'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function normalizeJsonObject(value: any): Record<string, any> | null {
  if (!value) return null
  if (Array.isArray(value)) {
    const firstObject = value.find((item) => item && typeof item === 'object')
    return (firstObject as Record<string, any>) || null
  }
  if (typeof value === 'object') {
    return value as Record<string, any>
  }
  return null
}

function pickString(source: Record<string, any> | null, keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function getReportedByDisplay(incident: any) {
  const persons = normalizeJsonObject(incident.persons_involved)
  return pickString(persons, ['reported_by_label', 'reportedByLabel']) || incident.reporter?.full_name || ''
}

export async function exportIncidentsCSV() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: incidents, error } = await supabase
    .from('fa_incidents')
    .select(`
      *,
      fa_stores(store_name, store_code),
      reporter:fa_profiles!fa_incidents_reported_by_user_id_fkey(full_name),
      investigator:fa_profiles!fa_incidents_assigned_investigator_user_id_fkey(full_name)
    `)
    .order('occurred_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch incidents: ${error.message}`)
  }

  // Convert to CSV
  const headers = [
    'Reference No',
    'Store',
    'Store Code',
    'Category',
    'Severity',
    'Status',
    'Summary',
    'Occurred At',
    'Reported At',
    'Reported By',
    'Investigator',
    'RIDDOR Reportable',
  ]

  const rows = incidents?.map((incident: any) => [
    incident.reference_no,
    incident.fa_stores?.store_name || '',
    incident.fa_stores?.store_code || '',
    incident.incident_category,
    incident.severity,
    incident.status,
    incident.summary.replace(/"/g, '""'), // Escape quotes
    incident.occurred_at,
    incident.reported_at,
    getReportedByDisplay(incident),
    incident.investigator?.full_name || '',
    incident.riddor_reportable ? 'Yes' : 'No',
  ]) || []

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  // Return as downloadable file
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="incidents-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}

export async function exportActionsCSV() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: actions, error } = await supabase
    .from('fa_actions')
    .select(`
      *,
      assigned_to:fa_profiles!fa_actions_assigned_to_user_id_fkey(full_name),
      incident:fa_incidents!fa_actions_incident_id_fkey(reference_no)
    `)
    .order('due_date', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch actions: ${error.message}`)
  }

  // Convert to CSV
  const headers = [
    'Title',
    'Incident Reference',
    'Assigned To',
    'Priority',
    'Status',
    'Due Date',
    'Completed At',
    'Evidence Required',
  ]

  const rows = actions?.map((action: any) => [
    action.title.replace(/"/g, '""'),
    action.incident?.reference_no || '',
    action.assigned_to?.full_name || '',
    action.priority,
    action.status,
    action.due_date,
    action.completed_at || '',
    action.evidence_required ? 'Yes' : 'No',
  ]) || []

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  // Return as downloadable file
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="actions-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}

