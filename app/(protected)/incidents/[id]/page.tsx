import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IncidentOverview } from '@/components/incidents/incident-overview'
import { IncidentInvestigation } from '@/components/incidents/incident-investigation'
import { IncidentActions } from '@/components/incidents/incident-actions'
import { IncidentAttachments } from '@/components/incidents/incident-attachments'
import { IncidentActivity } from '@/components/incidents/incident-activity'
import { EditIncidentDialog } from '@/components/incidents/edit-incident-dialog'
import { CloseIncidentButton } from '@/components/shared/close-incident-button'
import { ChevronRight } from 'lucide-react'

async function getIncident(id: string) {
  const supabase = createClient()
  const { data: openIncident } = await supabase
    .from('fa_incidents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  const { data: closedIncident } = openIncident
    ? ({ data: null } as any)
    : await supabase
        .from('fa_closed_incidents')
        .select('*')
        .eq('id', id)
        .maybeSingle()

  const incident = openIncident || closedIncident
  if (!incident) {
    return null
  }
  const sourceTable = openIncident ? 'fa_incidents' : 'fa_closed_incidents'

  const [storeResult, reporterResult, investigatorResult] = await Promise.all([
    incident.store_id
      ? supabase
          .from('fa_stores')
          .select('*')
          .eq('id', incident.store_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
    incident.reported_by_user_id
      ? supabase
          .from('fa_profiles')
          .select('*')
          .eq('id', incident.reported_by_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
    incident.assigned_investigator_user_id
      ? supabase
          .from('fa_profiles')
          .select('*')
          .eq('id', incident.assigned_investigator_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
  ])

  return {
    ...incident,
    _source_table: sourceTable,
    fa_stores: storeResult.data || null,
    reporter: reporterResult.data || null,
    investigator: investigatorResult.data || null,
  }
}

async function getInvestigation(incidentId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('fa_investigations')
    .select(`
      *,
      lead_investigator:fa_profiles!fa_investigations_lead_investigator_user_id_fkey(*)
    `)
    .eq('incident_id', incidentId)
    .single()

  return data
}

async function getActions(incidentId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('fa_actions')
    .select(`
      *,
      assigned_to:fa_profiles!fa_actions_assigned_to_user_id_fkey(*)
    `)
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false })

  return data || []
}

async function getAttachments(entityType: string, entityId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('fa_attachments')
    .select(`
      *,
      uploaded_by:fa_profiles!fa_attachments_uploaded_by_user_id_fkey(*)
    `)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  return data || []
}

async function getActivityLog(entityType: string, entityId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('fa_activity_log')
    .select(`
      *,
      performed_by:fa_profiles!fa_activity_log_performed_by_user_id_fkey(*)
    `)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(50)

  return data || []
}

function hasClosedEvent(activity: any): boolean {
  if (activity.action === 'CLOSED') return true
  if (activity.action !== 'UPDATED') return false
  const newStatus = activity.details?.new?.status
  const oldStatus = activity.details?.old?.status
  return newStatus === 'closed' || (oldStatus !== 'closed' && newStatus === 'closed')
}

function withBaselineIncidentActivity(activityLog: any[], incident: any) {
  const events = [...activityLog]
  const hasCreated = events.some((entry) => entry.action === 'CREATED')
  const hasClosed = events.some(hasClosedEvent)

  const createdAt = incident.reported_at || incident.created_at || incident.occurred_at
  if (!hasCreated && createdAt) {
    events.push({
      id: `synthetic-created-${incident.id}`,
      entity_type: 'incident',
      entity_id: incident.id,
      action: 'CREATED',
      created_at: createdAt,
      performed_by_user_id: incident.reported_by_user_id || null,
      performed_by: incident.reporter
        ? { full_name: incident.reporter.full_name }
        : null,
      details: {
        synthetic: true,
        source: 'baseline-timestamp',
      },
    })
  }

  const closedAt = incident.closed_at || null
  const shouldShowClosed = incident.status === 'closed' || Boolean(closedAt)
  if (!hasClosed && shouldShowClosed) {
    events.push({
      id: `synthetic-closed-${incident.id}`,
      entity_type: 'incident',
      entity_id: incident.id,
      action: 'CLOSED',
      created_at: closedAt || createdAt || new Date().toISOString(),
      performed_by_user_id: incident.assigned_investigator_user_id || incident.reported_by_user_id || null,
      performed_by: incident.investigator?.full_name
        ? { full_name: incident.investigator.full_name }
        : incident.reporter?.full_name
          ? { full_name: incident.reporter.full_name }
          : null,
      details: {
        synthetic: true,
        source: 'baseline-timestamp',
      },
    })
  }

  return events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export default async function IncidentDetailPage({
  params,
}: {
  params: { id: string }
}) {
  await requireAuth()
  const incident = await getIncident(params.id)

  if (!incident) {
    notFound()
  }
  const isArchivedClosedIncident = incident._source_table === 'fa_closed_incidents'

  // Fetch all profiles for user selection
  const supabase = createClient()
  const { data: profiles } = await supabase
    .from('fa_profiles')
    .select('id, full_name')
    .order('full_name', { ascending: true })

  const [investigation, actions, attachments, activityLogRaw] = await Promise.all([
    isArchivedClosedIncident ? Promise.resolve(null) : getInvestigation(params.id),
    isArchivedClosedIncident ? Promise.resolve([] as any[]) : getActions(params.id),
    isArchivedClosedIncident ? Promise.resolve([] as any[]) : getAttachments('incident', params.id),
    getActivityLog('incident', params.id),
  ])
  const activityLog = withBaselineIncidentActivity(activityLogRaw, incident)

  // Build user map for activity log
  const userIds = new Set<string>()
  activityLog.forEach((activity: any) => {
    if (activity.performed_by_user_id) userIds.add(activity.performed_by_user_id)
    if (activity.details?.old) {
      Object.entries(activity.details.old).forEach(([fieldName, val]: [string, any]) => {
        if (fieldName.includes('_user_id') && typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
          userIds.add(val)
        }
      })
    }
    if (activity.details?.new) {
      Object.entries(activity.details.new).forEach(([fieldName, val]: [string, any]) => {
        if (fieldName.includes('_user_id') && typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
          userIds.add(val)
        }
      })
    }
  })
  
  const userMap = new Map<string, string | null>()
  if (userIds.size > 0) {
    const { data: userProfiles } = await supabase
      .from('fa_profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds))
    
    userProfiles?.forEach(profile => {
      userMap.set(profile.id, profile.full_name)
    })
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <nav className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-3 md:mb-4 overflow-x-auto">
        <Link 
          href="/incidents" 
          className="hover:text-foreground transition-colors whitespace-nowrap"
        >
          Incidents
        </Link>
        <ChevronRight className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
        <span className="text-foreground font-medium truncate">{incident.reference_no}</span>
      </nav>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold break-words">{incident.reference_no}</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 break-words">{incident.summary}</p>
          {isArchivedClosedIncident ? (
            <Badge variant="outline" className="mt-2 text-xs">
              Archived closed incident (read-only)
            </Badge>
          ) : null}
        </div>
        {!isArchivedClosedIncident ? (
          <div className="flex flex-wrap items-center gap-2">
            <EditIncidentDialog incident={incident} />
            <CloseIncidentButton
              incidentId={incident.id}
              incidentReference={incident.reference_no}
              currentStatus={incident.status}
            />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/incidents/${incident.id}/print`} target="_blank">
                Print
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto max-w-full -mx-1 px-1 md:mx-0 md:px-0">
          <TabsTrigger value="overview" className="shrink-0 min-h-[44px] px-3 md:px-4">Overview</TabsTrigger>
          {!isArchivedClosedIncident ? (
            <TabsTrigger value="investigation" className="shrink-0 min-h-[44px] px-3 md:px-4">Investigation</TabsTrigger>
          ) : null}
          {!isArchivedClosedIncident ? (
            <TabsTrigger value="actions" className="shrink-0 min-h-[44px] px-3 md:px-4">Actions</TabsTrigger>
          ) : null}
          {!isArchivedClosedIncident ? (
            <TabsTrigger value="attachments" className="shrink-0 min-h-[44px] px-3 md:px-4">Attachments</TabsTrigger>
          ) : null}
          <TabsTrigger value="activity" className="shrink-0 min-h-[44px] px-3 md:px-4">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <IncidentOverview incident={incident} profiles={profiles || []} />
        </TabsContent>

        {!isArchivedClosedIncident ? (
          <TabsContent value="investigation">
            <IncidentInvestigation incident={incident} investigation={investigation} />
          </TabsContent>
        ) : null}

        {!isArchivedClosedIncident ? (
          <TabsContent value="actions">
            <IncidentActions incidentId={params.id} actions={actions} profiles={profiles || []} />
          </TabsContent>
        ) : null}

        {!isArchivedClosedIncident ? (
          <TabsContent value="attachments">
            <IncidentAttachments incidentId={params.id} attachments={attachments} />
          </TabsContent>
        ) : null}

        <TabsContent value="activity">
          <IncidentActivity activityLog={activityLog} userMap={userMap} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
