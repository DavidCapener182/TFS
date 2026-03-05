import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Activity,
  ShieldCheck,
  Clock3,
  PlusCircle,
  CheckCircle2,
  PencilLine,
  Trash2,
  Sparkles,
  UserRound,
  Layers3,
} from 'lucide-react'
import { format } from 'date-fns'

function hasClosedEvent(activity: any): boolean {
  if (activity?.action === 'CLOSED') return true
  if (activity?.action !== 'UPDATED') return false
  const newStatus = activity?.details?.new?.status
  const oldStatus = activity?.details?.old?.status
  return newStatus === 'closed' || (oldStatus !== 'closed' && newStatus === 'closed')
}

function normalizeIncidentCreatedAt(incident: any): string | null {
  return incident?.reported_at || incident?.created_at || incident?.occurred_at || null
}

function normalizeIncidentClosedAt(incident: any): string | null {
  return incident?.closed_at || incident?.updated_at || normalizeIncidentCreatedAt(incident)
}

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

function toHistoricalIncidentActorLabel(incident: any): string | null {
  const personsObject = normalizeJsonObject(incident?.persons_involved)
  const reportedByLabel = pickString(personsObject, ['reported_by_label', 'reportedByLabel'])
  if (!reportedByLabel) return null
  if (!/\s-\smanager$/i.test(reportedByLabel)) return null
  return reportedByLabel
}

async function getRecentActivity() {
  const supabase = createClient()
  const [
    { data: recentActivity, error: activityError },
    { data: openIncidents, error: openIncidentError },
    { data: closedIncidents, error: closedIncidentError },
  ] = await Promise.all([
    supabase
      .from('fa_activity_log')
      .select(`*, performed_by:fa_profiles!fa_activity_log_performed_by_user_id_fkey(full_name)`)
      .order('created_at', { ascending: false })
      .limit(180),
    supabase
      .from('fa_incidents')
      .select('id, status, reported_at, created_at, occurred_at, closed_at, updated_at, reported_by_user_id, assigned_investigator_user_id, persons_involved')
      .order('created_at', { ascending: false })
      .limit(180),
    supabase
      .from('fa_closed_incidents')
      .select('id, status, reported_at, created_at, occurred_at, closed_at, updated_at, reported_by_user_id, assigned_investigator_user_id, persons_involved')
      .order('closed_at', { ascending: false })
      .limit(180),
  ])

  if (activityError) {
    console.error('Error fetching recent activity:', activityError)
    return []
  }
  if (openIncidentError) {
    console.error('Error fetching open incidents for activity baseline:', openIncidentError)
  }
  if (closedIncidentError) {
    console.error('Error fetching closed incidents for activity baseline:', closedIncidentError)
  }

  const activityRows = recentActivity || []
  const incidentEventState = new Map<string, { created: boolean; closed: boolean }>()

  activityRows.forEach((activity: any) => {
    if (activity.entity_type !== 'incident' || !activity.entity_id) return
    const current = incidentEventState.get(activity.entity_id) || { created: false, closed: false }
    if (activity.action === 'CREATED') current.created = true
    if (hasClosedEvent(activity)) current.closed = true
    incidentEventState.set(activity.entity_id, current)
  })

  const syntheticEvents: any[] = []
  const syntheticEventIds = new Set<string>()

  const appendSyntheticEvents = (incident: any, forceClosed = false) => {
    if (!incident?.id) return
    const state = incidentEventState.get(incident.id) || { created: false, closed: false }
    const createdAt = normalizeIncidentCreatedAt(incident)
    const closedAt = normalizeIncidentClosedAt(incident)
    const isClosed = forceClosed || incident?.status === 'closed' || Boolean(incident?.closed_at)

    if (!state.created && createdAt) {
      const eventId = `synthetic-incident-created-${incident.id}`
      if (!syntheticEventIds.has(eventId)) {
        syntheticEvents.push({
          id: eventId,
          entity_type: 'incident',
          entity_id: incident.id,
          action: 'CREATED',
          created_at: createdAt,
          performed_by_user_id: incident.reported_by_user_id || null,
          performed_by: null,
          details: { synthetic: true, source: 'incident-baseline' },
        })
        syntheticEventIds.add(eventId)
      }
    }

    if (!state.closed && isClosed && closedAt) {
      const eventId = `synthetic-incident-closed-${incident.id}`
      if (!syntheticEventIds.has(eventId)) {
        syntheticEvents.push({
          id: eventId,
          entity_type: 'incident',
          entity_id: incident.id,
          action: 'CLOSED',
          created_at: closedAt,
          performed_by_user_id: incident.assigned_investigator_user_id || incident.reported_by_user_id || null,
          performed_by: null,
          details: { synthetic: true, source: 'incident-baseline' },
        })
        syntheticEventIds.add(eventId)
      }
    }
  }

  ;(openIncidents || []).forEach((incident: any) => appendSyntheticEvents(incident, false))
  ;(closedIncidents || []).forEach((incident: any) => appendSyntheticEvents(incident, true))

  const latestActivity = [...activityRows, ...syntheticEvents]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 100)

  const incidentIds = Array.from(
    new Set(
      latestActivity
        .filter((activity: any) => activity?.entity_type === 'incident' && typeof activity?.entity_id === 'string')
        .map((activity: any) => activity.entity_id)
    )
  )

  const incidentActorOverrides = new Map<string, string>()
  if (incidentIds.length > 0) {
    const [{ data: openIncidentActors }, { data: closedIncidentActors }] = await Promise.all([
      supabase.from('fa_incidents').select('id, persons_involved').in('id', incidentIds),
      supabase.from('fa_closed_incidents').select('id, persons_involved').in('id', incidentIds),
    ])

    ;[...(openIncidentActors || []), ...(closedIncidentActors || [])].forEach((incident: any) => {
      const actorLabel = toHistoricalIncidentActorLabel(incident)
      if (incident?.id && actorLabel) {
        incidentActorOverrides.set(incident.id, actorLabel)
      }
    })
  }

  return latestActivity.map((activity: any) => ({
    ...activity,
    actor_override_name:
      activity?.entity_type === 'incident' && typeof activity?.entity_id === 'string'
        ? incidentActorOverrides.get(activity.entity_id) || null
        : null,
  }))
}

// Helper to format field names to be more readable
function formatFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    store_name: 'Store Name',
    store_code: 'Store Code',
    status: 'Status',
    severity: 'Severity',
    summary: 'Summary',
    incident_category: 'Category',
    occurred_at: 'Occurred At',
    reported_at: 'Reported At',
    assigned_investigator_user_id: 'Assigned Investigator',
    reference_no: 'Reference Number',
    compliance_audit_1_date: 'Compliance Audit 1 Date',
    compliance_audit_1_overall_pct: 'Compliance Audit 1 Score',
    compliance_audit_2_date: 'Compliance Audit 2 Date',
    compliance_audit_2_overall_pct: 'Compliance Audit 2 Score',
    compliance_audit_3_date: 'Compliance Audit 3 Date',
    compliance_audit_3_overall_pct: 'Compliance Audit 3 Score',
    action_plan_1_sent: 'Action Plan 1 Sent',
    action_plan_2_sent: 'Action Plan 2 Sent',
    action_plan_3_sent: 'Action Plan 3 Sent',
    compliance_audit_2_assigned_manager_user_id: 'Assigned Manager',
    compliance_audit_2_planned_date: 'Planned Date',
    title: 'Title',
    description: 'Description',
    priority: 'Priority',
    due_date: 'Due Date',
    completed_at: 'Completed At',
    completion_notes: 'Completion Notes',
    evidence_required: 'Evidence Required',
    region: 'Region',
    city: 'City',
    is_active: 'Active Status',
  }
  return fieldMap[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Helper to check if a string is a UUID
function isUUID(str: any): boolean {
  if (typeof str !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

function resolveActivityActorName(activity: any, userMap: Map<string, string | null>): string {
  const actorOverride = typeof activity?.actor_override_name === 'string' ? activity.actor_override_name.trim() : ''
  if (actorOverride) return actorOverride

  const profileName = activity?.performed_by?.full_name
  if (typeof profileName === 'string' && profileName.trim()) {
    return profileName.trim()
  }

  if (isUUID(activity?.performed_by_user_id)) {
    const userName = userMap.get(activity.performed_by_user_id)
    if (userName) return userName
  }

  return 'System'
}

// Helper to format field values (with user name mapping)
function formatFieldValue(value: any, fieldName: string, userMap?: Map<string, string | null>): string {
  if (value === null || value === undefined) return '—'
  
  // If this is a user_id field and we have a user map, try to resolve the name
  if (fieldName.includes('_user_id') && userMap && isUUID(value)) {
    const userName = userMap.get(value)
    if (userName) return userName
  }
  
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      return format(new Date(value), 'dd MMM yyyy')
    } catch {
      return value
    }
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Helper to get changed fields from details
function getChangedFields(details: any): Array<{ field: string; oldValue: any; newValue: any }> {
  if (!details || !details.old || !details.new) return []
  
  const oldData = details.old as Record<string, any>
  const newData = details.new as Record<string, any>
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = []
  
  // Ignore these fields as they change frequently and aren't meaningful
  const ignoreFields = ['updated_at', 'id']
  
  // Check all fields in new data
  Object.keys(newData).forEach(key => {
    if (ignoreFields.includes(key)) return
    
    const oldVal = oldData[key]
    const newVal = newData[key]
    
    // Compare values (handling null/undefined)
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal })
    }
  })
  
  return changes
}

// Helper to batch fetch user names from all user IDs in activities
async function getUserNamesFromActivities(activities: any[]): Promise<Map<string, string | null>> {
  const supabase = createClient()
  const userMap = new Map<string, string | null>()
  
  // Collect user IDs from actor fields and any changed *_user_id fields
  const userIds = new Set<string>()
  activities.forEach(activity => {
    if (isUUID(activity.performed_by_user_id)) {
      userIds.add(activity.performed_by_user_id)
    }
    if (activity.details?.old) {
      Object.entries(activity.details.old as Record<string, any>).forEach(([key, val]) => {
        if (key.includes('_user_id') && isUUID(val)) {
          userIds.add(val)
        }
      })
    }
    if (activity.details?.new) {
      Object.entries(activity.details.new as Record<string, any>).forEach(([key, val]) => {
        if (key.includes('_user_id') && isUUID(val)) {
          userIds.add(val)
        }
      })
    }
  })
  
  // Batch fetch all users
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('fa_profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds))
    
    profiles?.forEach(profile => {
      userMap.set(profile.id, profile.full_name || 'Unknown User')
    })
  }
  
  return userMap
}

// Helper to batch fetch entity display names
async function getEntityDisplayNames(activities: any[]): Promise<Map<string, string | null>> {
  const supabase = createClient()
  const nameMap = new Map<string, string | null>()
  
  // Group activities by entity type
  const byType: Record<string, string[]> = {}
  activities.forEach(activity => {
    if (!byType[activity.entity_type]) {
      byType[activity.entity_type] = []
    }
    byType[activity.entity_type].push(activity.entity_id)
  })
  
  // Batch fetch incidents (both open and closed)
  if (byType.incident?.length) {
    const [openIncidents, closedIncidents] = await Promise.all([
      supabase
        .from('fa_incidents')
        .select('id, reference_no, summary')
        .in('id', byType.incident),
      supabase
        .from('fa_closed_incidents')
        .select('id, reference_no, summary')
        .in('id', byType.incident)
    ])
    
    openIncidents.data?.forEach(incident => {
      nameMap.set(`incident:${incident.id}`, 
        `${incident.reference_no}${incident.summary ? `: ${incident.summary}` : ''}`
      )
    })
    
    closedIncidents.data?.forEach(incident => {
      nameMap.set(`incident:${incident.id}`, 
        `${incident.reference_no}${incident.summary ? `: ${incident.summary}` : ''}`
      )
    })
  }
  
  // Batch fetch stores
  if (byType.store?.length) {
    const { data: stores } = await supabase
      .from('fa_stores')
      .select('id, store_name, store_code')
      .in('id', byType.store)
    
    stores?.forEach(store => {
      nameMap.set(`store:${store.id}`, 
        `${store.store_name}${store.store_code ? ` (${store.store_code})` : ''}`
      )
    })
  }
  
  // Batch fetch actions
  if (byType.action?.length) {
    const { data: actions } = await supabase
      .from('fa_actions')
      .select('id, title')
      .in('id', byType.action)
    
    actions?.forEach(action => {
      nameMap.set(`action:${action.id}`, action.title)
    })
  }
  
  return nameMap
}

// Helper to format entity type for display
function formatEntityType(entityType: string): string {
  const typeMap: Record<string, string> = {
    incident: 'Incident',
    store: 'Store',
    action: 'Action',
    investigation: 'Investigation',
  }
  return typeMap[entityType] || entityType
}

function getActionBadgeStyles(action: string): string {
  if (action === 'CREATED') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (action === 'UPDATED') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (action === 'CLOSED') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (action === 'DELETED') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function getActionCardAccent(action: string): string {
  if (action === 'CREATED') return 'border-l-emerald-400'
  if (action === 'UPDATED') return 'border-l-blue-400'
  if (action === 'CLOSED') return 'border-l-amber-400'
  if (action === 'DELETED') return 'border-l-rose-400'
  return 'border-l-slate-300'
}

function getActionIcon(action: string) {
  if (action === 'CREATED') return <PlusCircle className="h-3.5 w-3.5" />
  if (action === 'UPDATED') return <PencilLine className="h-3.5 w-3.5" />
  if (action === 'CLOSED') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (action === 'DELETED') return <Trash2 className="h-3.5 w-3.5" />
  return <Activity className="h-3.5 w-3.5" />
}

export default async function ActivityPage() {
  // Restrict access to admin, ops, and readonly roles only (exclude client)
  await requireRole(['admin', 'ops', 'readonly'])
  const recentActivity = await getRecentActivity()
  
  // Batch fetch entity names and user names
  const [entityNameMap, userMap] = await Promise.all([
    getEntityDisplayNames(recentActivity),
    getUserNamesFromActivities(recentActivity)
  ])
  
  // Map entity names to activities, with fallback to extract from details if entity was deleted
  const activitiesWithNames = recentActivity.map((activity: any) => {
    const key = `${activity.entity_type}:${activity.entity_id}`
    let entityName = entityNameMap.get(key) || null
    
    // If we don't have a name and this is a DELETED action, try to extract from details.old
    if (!entityName && activity.action === 'DELETED' && activity.details?.old) {
      const oldData = activity.details.old as Record<string, any>
      
      if (activity.entity_type === 'incident') {
        // Try to get reference_no or summary from deleted incident
        entityName = oldData.reference_no 
          ? `${oldData.reference_no}${oldData.summary ? `: ${oldData.summary}` : ''}`
          : null
      } else if (activity.entity_type === 'action') {
        // Try to get title from deleted action
        entityName = oldData.title || null
      } else if (activity.entity_type === 'store') {
        // Try to get store name from deleted store
        entityName = oldData.store_name 
          ? `${oldData.store_name}${oldData.store_code ? ` (${oldData.store_code})` : ''}`
          : null
      }
    }
    
    // If we still don't have a name and this is a CREATED/UPDATED action, try to extract from details.new
    if (!entityName && activity.details?.new) {
      const newData = activity.details.new as Record<string, any>
      
      if (activity.entity_type === 'incident') {
        entityName = newData.reference_no 
          ? `${newData.reference_no}${newData.summary ? `: ${newData.summary}` : ''}`
          : null
      } else if (activity.entity_type === 'action') {
        entityName = newData.title || null
      } else if (activity.entity_type === 'store') {
        entityName = newData.store_name 
          ? `${newData.store_name}${newData.store_code ? ` (${newData.store_code})` : ''}`
          : null
      }
    }
    
    return { ...activity, entityName }
  })

  const totalActivities = activitiesWithNames.length
  const actionCounts = activitiesWithNames.reduce(
    (acc, activity: any) => {
      if (activity.action === 'CREATED') acc.created += 1
      else if (activity.action === 'UPDATED') acc.updated += 1
      else if (activity.action === 'CLOSED') acc.closed += 1
      else if (activity.action === 'DELETED') acc.deleted += 1
      else acc.other += 1
      return acc
    },
    { created: 0, updated: 0, closed: 0, deleted: 0, other: 0 }
  )

  const entityCounts = activitiesWithNames.reduce((acc: Record<string, number>, activity: any) => {
    const label = formatEntityType(activity.entity_type)
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})
  const sortedEntityCounts = Object.entries(entityCounts).sort((a, b) => b[1] - a[1])

  const userCounts = activitiesWithNames.reduce((acc: Record<string, number>, activity: any) => {
    const name = resolveActivityActorName(activity, userMap)
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {})
  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const activeUsers = Object.keys(userCounts).length
  const last24HoursCount = activitiesWithNames.filter(
    (activity: any) => Date.now() - new Date(activity.created_at).getTime() <= 24 * 60 * 60 * 1000
  ).length

  const activitiesByDay = activitiesWithNames.reduce((acc: Record<string, any[]>, activity: any) => {
    const dayKey = format(new Date(activity.created_at), 'yyyy-MM-dd')
    if (!acc[dayKey]) acc[dayKey] = []
    acc[dayKey].push(activity)
    return acc
  }, {})
  const dayGroups = Object.entries(activitiesByDay).sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 sm:p-4 md:rounded-3xl md:p-7 shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-slate-200 md:px-3 md:text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5" />
              System Audit Trail
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl md:text-3xl">Recent Activity</h1>
            <p className="mt-1.5 max-w-2xl text-xs leading-snug text-slate-300 sm:text-sm md:text-base">
              Live timeline of system events, record changes, and user actions across incidents, stores, and tasks.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 md:rounded-xl md:px-3 md:py-2 md:text-xs">
            <Clock3 className="h-3.5 w-3.5 text-slate-300" />
            Last 24h: {last24HoursCount}
          </div>
        </div>

        <div className="relative z-10 mt-3 grid grid-cols-2 gap-2 md:mt-5 md:grid-cols-4 md:gap-2.5">
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm md:rounded-xl md:px-3 md:py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Events</p>
            <p className="mt-0.5 text-base font-semibold text-white md:mt-1 md:text-lg">{totalActivities}</p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm md:rounded-xl md:px-3 md:py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Created</p>
            <p className="mt-0.5 text-base font-semibold text-white md:mt-1 md:text-lg">{actionCounts.created}</p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm md:rounded-xl md:px-3 md:py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Updated</p>
            <p className="mt-0.5 text-base font-semibold text-white md:mt-1 md:text-lg">{actionCounts.updated}</p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm md:rounded-xl md:px-3 md:py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Active Users</p>
            <p className="mt-0.5 text-base font-semibold text-white md:mt-1 md:text-lg">{activeUsers}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-slate-50/60 px-4 py-4 md:px-6 md:py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-sm font-bold text-slate-800 md:text-base">Activity Timeline</CardTitle>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {totalActivities} events
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-4 md:p-5">
            {dayGroups.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 text-slate-500">
                <Activity className="mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm italic">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-6">
                {dayGroups.map(([day, dayActivities]) => (
                  <section key={day} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        {format(new Date(day), 'EEEE, d MMM yyyy')}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {dayActivities.length} event{dayActivities.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {dayActivities.map((activity: any) => {
                        const changedFields = getChangedFields(activity.details)
                        const entityDisplayName = activity.entityName

                        return (
                          <article
                            key={activity.id}
                            className={`rounded-xl border border-slate-200 border-l-4 bg-white p-3 shadow-sm md:p-4 ${getActionCardAccent(activity.action)}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getActionBadgeStyles(activity.action)}`}
                                >
                                  {getActionIcon(activity.action)}
                                  {activity.action}
                                </span>
                                <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  {formatEntityType(activity.entity_type)}
                                </span>
                                {entityDisplayName && (
                                  <span className="truncate text-xs font-medium text-slate-600">{entityDisplayName}</span>
                                )}
                              </div>
                              <p className="text-[11px] font-medium text-slate-500">
                                {format(new Date(activity.created_at), 'HH:mm')}
                              </p>
                            </div>

                            {activity.action === 'UPDATED' && changedFields.length > 0 && (
                              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Changes</p>
                                <div className="mt-2 space-y-1.5">
                                  {changedFields.slice(0, 4).map((change, idx) => (
                                    <p key={idx} className="text-xs text-slate-600">
                                      <span className="font-semibold text-slate-700">{formatFieldName(change.field)}:</span>{' '}
                                      <span className="line-through text-rose-500/80">
                                        {formatFieldValue(change.oldValue, change.field, userMap)}
                                      </span>{' '}
                                      <span className="text-slate-400">→</span>{' '}
                                      <span className="font-medium text-emerald-600">
                                        {formatFieldValue(change.newValue, change.field, userMap)}
                                      </span>
                                    </p>
                                  ))}
                                </div>
                                {changedFields.length > 4 && (
                                  <p className="mt-1 text-[11px] italic text-slate-500">
                                    +{changedFields.length - 4} more change{changedFields.length - 4 !== 1 ? 's' : ''}
                                  </p>
                                )}
                              </div>
                            )}

                            {activity.action === 'CREATED' && (
                              <p className="mt-3 text-xs text-slate-600">
                                New {formatEntityType(activity.entity_type).toLowerCase()} recorded
                                {entityDisplayName ? (
                                  <span className="ml-1 font-semibold text-emerald-700">{entityDisplayName}</span>
                                ) : null}
                              </p>
                            )}

                            {activity.action === 'CLOSED' && (
                              <p className="mt-3 text-xs text-slate-600">
                                {formatEntityType(activity.entity_type)} closed
                                {entityDisplayName ? (
                                  <span className="ml-1 font-semibold text-amber-700">{entityDisplayName}</span>
                                ) : null}
                              </p>
                            )}

                            {activity.action === 'DELETED' && entityDisplayName && (
                              <p className="mt-3 text-xs font-medium text-rose-600">
                                Deleted {formatEntityType(activity.entity_type).toLowerCase()}: {entityDisplayName}
                              </p>
                            )}

                            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                              {(() => {
                                const actorName = resolveActivityActorName(activity, userMap)
                                return (
                                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-600">
                                      {actorName[0]}
                                    </span>
                                    {actorName}
                                  </p>
                                )
                              })()}
                              <p className="text-[11px] text-slate-400">
                                {format(new Date(activity.created_at), 'dd MMM yyyy')}
                              </p>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-slate-50/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Action Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {[
                { label: 'Created', value: actionCounts.created, color: 'bg-emerald-500' },
                { label: 'Updated', value: actionCounts.updated, color: 'bg-blue-500' },
                { label: 'Closed', value: actionCounts.closed, color: 'bg-amber-500' },
                { label: 'Deleted', value: actionCounts.deleted, color: 'bg-rose-500' },
                { label: 'Other', value: actionCounts.other, color: 'bg-slate-500' },
              ].map((item) => {
                const percentage = totalActivities > 0 ? Math.round((item.value / totalActivities) * 100) : 0
                return (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">{item.label}</span>
                      <span className="font-semibold text-slate-800">
                        {item.value} <span className="text-slate-400">({percentage}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-slate-50/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Layers3 className="h-4 w-4 text-indigo-500" />
                Entity Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {sortedEntityCounts.length === 0 ? (
                <p className="text-xs italic text-slate-500">No entity activity</p>
              ) : (
                sortedEntityCounts.slice(0, 6).map(([entity, count]) => (
                  <div key={entity} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                    <span className="text-xs font-medium text-slate-600">{entity}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {count}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-slate-50/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <UserRound className="h-4 w-4 text-slate-600" />
                Top Contributors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {topUsers.length === 0 ? (
                <p className="text-xs italic text-slate-500">No user activity</p>
              ) : (
                topUsers.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <span className="truncate text-xs font-medium text-slate-600">{name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                      {count}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
