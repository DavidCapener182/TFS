import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IncidentInvestigation } from '@/components/incidents/incident-investigation'
import { IncidentActions } from '@/components/incidents/incident-actions'
import { IncidentAttachments } from '@/components/incidents/incident-attachments'
import { IncidentActivity } from '@/components/incidents/incident-activity'
import { EditIncidentDialog } from '@/components/incidents/edit-incident-dialog'
import { AssignInvestigator } from '@/components/incidents/assign-investigator'
import { IncidentBreadcrumb } from '@/components/incidents/incident-breadcrumb'
import { CloseIncidentButton } from '@/components/shared/close-incident-button'
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  MapPin,
  Printer,
  ShieldAlert,
  User,
  UserCheck,
} from 'lucide-react'
import { format } from 'date-fns'
import {
  buildVisitReportPdfUrl,
  extractLinkedVisitReportId,
  getIncidentPeople,
  getIncidentPersonLabel,
} from '@/lib/incidents/incident-utils'
import { formatStoreName } from '@/lib/store-display'

async function getIncident(id: string) {
  const supabase = createClient()
  const { data: openIncident } = await supabase
    .from('tfs_incidents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  const { data: closedIncident } = openIncident
    ? ({ data: null } as any)
    : await supabase
        .from('tfs_closed_incidents')
        .select('*')
        .eq('id', id)
        .maybeSingle()

  const incident = openIncident || closedIncident
  if (!incident) {
    return null
  }
  const sourceTable = openIncident ? 'tfs_incidents' : 'tfs_closed_incidents'

  const [storeResult, reporterResult, investigatorResult] = await Promise.all([
    incident.store_id
      ? supabase
          .from('tfs_stores')
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
    tfs_stores: storeResult.data || null,
    reporter: reporterResult.data || null,
    investigator: investigatorResult.data || null,
  }
}

async function getInvestigation(incidentId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('tfs_investigations')
    .select(`
      *,
      lead_investigator:fa_profiles!tfs_investigations_lead_investigator_user_id_fkey(*)
    `)
    .eq('incident_id', incidentId)
    .single()

  return data
}

async function getActions(incidentId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('tfs_actions')
    .select(`
      *,
      assigned_to:fa_profiles!tfs_actions_assigned_to_user_id_fkey(*)
    `)
    .eq('incident_id', incidentId)
    .not('title', 'ilike', 'Implement visit report actions:%')
    .order('created_at', { ascending: false })

  return data || []
}

async function getAttachments(entityType: string, entityId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('tfs_attachments')
    .select(`
      *,
      uploaded_by:fa_profiles!tfs_attachments_uploaded_by_user_id_fkey(*)
    `)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  return data || []
}

async function getActivityLog(entityType: string, entityId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('tfs_activity_log')
    .select(`
      *,
      performed_by:fa_profiles!tfs_activity_log_performed_by_user_id_fkey(*)
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
  const shouldShowClosed = String(incident.status || '').toLowerCase() === 'closed'
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

function titleFromSnake(value: string | null | undefined) {
  if (!value) return '—'
  return value
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function safeDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return format(parsed, 'dd MMM yyyy, HH:mm')
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

function pickBoolean(source: Record<string, any> | null, keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['yes', 'true', 'y'].includes(normalized)) return true
      if (['no', 'false', 'n'].includes(normalized)) return false
    }
  }
  return null
}

function boolLabel(value: boolean | null) {
  if (value === null) return '—'
  return value ? 'YES' : 'NO'
}

function statusPillClass(status: string | null | undefined) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'closed') return 'bg-slate-100 text-slate-700 border-slate-200'
  if (normalized === 'actions_in_progress') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (normalized === 'under_investigation') return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function severityPillClass(severity: string | null | undefined) {
  const normalized = String(severity || '').toLowerCase()
  if (normalized === 'critical') return 'bg-red-50 text-red-700 border-red-200'
  if (normalized === 'high') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (normalized === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-green-50 text-green-700 border-green-200'
}

function activityTitle(action: string) {
  if (action === 'CREATED') return 'Incident Reported'
  if (action === 'CLOSED') return 'Case Closed'
  if (action === 'UPDATED') return 'Record Updated'
  if (action === 'DELETED') return 'Record Deleted'
  return titleFromSnake(action)
}

function isStoreManagerLabel(value: string | null | undefined) {
  if (typeof value !== 'string') return false
  return /\s-\smanager$/i.test(value.trim())
}

function resolveActivityActorName(
  activity: any,
  userMap: Map<string, string | null>,
  incidentActorOverrideName?: string | null
) {
  if (activity?.entity_type === 'incident' && isStoreManagerLabel(incidentActorOverrideName)) {
    return incidentActorOverrideName!.trim()
  }

  const profileName = activity?.performed_by?.full_name
  if (typeof profileName === 'string' && profileName.trim()) {
    return profileName.trim()
  }

  const userId = activity?.performed_by_user_id
  if (typeof userId === 'string') {
    const mapped = userMap.get(userId)
    if (mapped) return mapped
  }

  return 'System'
}

export default async function IncidentDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { tab?: string; newAction?: string }
}) {
  await requireAuth()
  const incident = await getIncident(params.id)

  if (!incident) {
    notFound()
  }
  const isArchivedClosedIncident = incident._source_table === 'tfs_closed_incidents'

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

  const userIds = new Set<string>()
  activityLog.forEach((activity: any) => {
    if (activity.performed_by_user_id) userIds.add(activity.performed_by_user_id)
    if (activity.details?.old) {
      Object.entries(activity.details.old).forEach(([fieldName, value]: [string, any]) => {
        if (
          fieldName.includes('_user_id') &&
          typeof value === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ) {
          userIds.add(value)
        }
      })
    }
    if (activity.details?.new) {
      Object.entries(activity.details.new).forEach(([fieldName, value]: [string, any]) => {
        if (
          fieldName.includes('_user_id') &&
          typeof value === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ) {
          userIds.add(value)
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

    userProfiles?.forEach((profile) => {
      userMap.set(profile.id, profile.full_name)
    })
  }

  const personsObject = normalizeJsonObject(incident.persons_involved)
  const injuryObject = normalizeJsonObject(incident.injury_details)
  const incidentPeople = getIncidentPeople(incident, incident.incident_category)
  const linkedVisitReportId = extractLinkedVisitReportId(incident)
  const pdfVersionToken = incident.updated_at || incident.reported_at || incident.occurred_at || ''
  const linkedVisitReportPdfUrl =
    linkedVisitReportId && pdfVersionToken
      ? `${buildVisitReportPdfUrl(linkedVisitReportId)}&v=${encodeURIComponent(pdfVersionToken)}`
      : linkedVisitReportId
        ? buildVisitReportPdfUrl(linkedVisitReportId)
        : null
  const linkedVisitReportDownloadUrl =
    linkedVisitReportId && pdfVersionToken
      ? `/api/reports/visit-reports/${linkedVisitReportId}/pdf?mode=download&v=${encodeURIComponent(
          pdfVersionToken
        )}`
      : linkedVisitReportId
        ? `/api/reports/visit-reports/${linkedVisitReportId}/pdf?mode=download`
        : null
  const reportedByLabel = pickString(personsObject, ['reported_by_label', 'reportedByLabel'])
  const incidentActorOverrideName = isStoreManagerLabel(reportedByLabel) ? reportedByLabel : null
  const reportedByDisplay = reportedByLabel || incident.reporter?.full_name || 'Unknown'

  const personFirstName = pickString(personsObject, ['first_name', 'firstName', 'firstname', 'forename'])
  const personLastName = pickString(personsObject, ['last_name', 'lastName', 'lastname', 'surname'])
  const personFullName = pickString(personsObject, ['full_name', 'name', 'person_name'])
  const personType = getIncidentPersonLabel(incident, incident.incident_category)
  const childInvolved = pickBoolean(personsObject, ['child_involved', 'childInvolved', 'is_child', 'minor'])

  const displayPersonName =
    [personFirstName, personLastName].filter(Boolean).join(' ') ||
    personFullName ||
    incident.reporter?.full_name ||
    'Unknown'

  const injuryRootCause =
    pickString(injuryObject, ['root_cause', 'rootCause', 'cause', 'main_cause']) ||
    'Not recorded'
  const injuryIncidentType = pickString(injuryObject, ['incident_type', 'incidentType', 'injury_type', 'type'])
  const firstAidAction =
    pickString(injuryObject, ['first_aid_action', 'firstAidAction', 'first_aid', 'firstAid']) ||
    'None recorded'
  const someoneInjured =
    pickBoolean(injuryObject, ['someone_injured', 'someoneInjured']) ||
    incidentPeople.some((person) => person.injured)
  const injurySummary = pickString(injuryObject, ['injury_summary', 'injurySummary'])

  const foreseeable = pickBoolean(injuryObject, ['foreseeable', 'is_foreseeable'])
  const reportedToInsurers = pickBoolean(injuryObject, ['reported_to_insurers', 'reportedToInsurers'])

  const overviewSubtitle = [
    titleFromSnake(incident.incident_category),
    injuryIncidentType,
    personType,
  ]
    .filter(Boolean)
    .join(' - ')

  const closureDate = incident.closed_at || incident.reported_at || incident.occurred_at
  const recentActivity = activityLog.slice(0, 4)
  const isClosed = String(incident.status || '').toLowerCase() === 'closed'
  const initialTab = ['overview', 'investigation', 'actions', 'attachments', 'activity'].includes(
    String(searchParams?.tab || '')
  )
    ? String(searchParams?.tab)
    : 'overview'

  return (
    <div className="space-y-6 p-0">
      <IncidentBreadcrumb referenceNo={incident.reference_no} />

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="mb-2 break-words font-mono text-3xl font-bold tracking-tight text-slate-800">
            {incident.reference_no}
          </h1>
          <p className="text-lg font-medium text-slate-600">
            {overviewSubtitle || incident.summary}
          </p>
          {isArchivedClosedIncident ? (
            <Badge variant="outline" className="mt-2 text-xs">
              Archived closed incident (read-only)
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {linkedVisitReportPdfUrl ? (
            <>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="h-9 rounded-lg border-slate-200 px-4 text-sm font-semibold text-slate-700"
              >
                <Link href={linkedVisitReportPdfUrl} target="_blank">
                  <FileText size={16} className="mr-2" />
                  Open Report PDF
                </Link>
              </Button>
              {linkedVisitReportDownloadUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-9 rounded-lg border-slate-200 px-4 text-sm font-semibold text-slate-700"
                >
                  <Link href={linkedVisitReportDownloadUrl} target="_blank">
                    <Download size={16} className="mr-2" />
                    Download PDF
                  </Link>
                </Button>
              ) : null}
            </>
          ) : null}
          {!isArchivedClosedIncident ? (
            <>
              <EditIncidentDialog incident={incident} />
              <Button
                variant="outline"
                size="sm"
                asChild
                className="h-9 rounded-lg border-slate-200 px-4 text-sm font-semibold text-slate-700"
              >
                <Link href={`/incidents/${incident.id}/print`} target="_blank">
                  <Printer size={16} className="mr-2" />
                  Print
                </Link>
              </Button>
              <CloseIncidentButton
                incidentId={incident.id}
                incidentReference={incident.reference_no}
                currentStatus={incident.status}
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Current Status</p>
            <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 ${statusPillClass(incident.status)}`}>
              <span className="text-sm font-semibold">{titleFromSnake(incident.status)}</span>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Severity Level</p>
            <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 ${severityPillClass(incident.severity)}`}>
              <span className="text-sm font-bold">{titleFromSnake(incident.severity)}</span>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-500">
            <Activity size={24} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Location</p>
            <p className="text-base font-bold text-slate-900">
              {formatStoreName(incident.tfs_stores?.store_name) || 'Unknown Store'}
            </p>
            <p className="mt-0.5 text-xs font-mono text-slate-500">
              Store Code: {incident.tfs_stores?.store_code || '—'}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <MapPin size={24} />
          </div>
        </div>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="no-scrollbar h-auto w-full justify-start gap-8 overflow-x-auto rounded-none border-b border-slate-200 bg-transparent p-0 pt-2">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 pt-0 text-sm font-semibold text-slate-400 shadow-none data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
          >
            Overview
          </TabsTrigger>
          {!isArchivedClosedIncident ? (
            <TabsTrigger
              value="investigation"
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 pt-0 text-sm font-semibold text-slate-400 shadow-none data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
            >
              Investigation
            </TabsTrigger>
          ) : null}
          {!isArchivedClosedIncident ? (
            <TabsTrigger
              value="actions"
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 pt-0 text-sm font-semibold text-slate-400 shadow-none data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
            >
              Actions
            </TabsTrigger>
          ) : null}
          {!isArchivedClosedIncident ? (
            <TabsTrigger
              value="attachments"
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 pt-0 text-sm font-semibold text-slate-400 shadow-none data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
            >
              Attachments
            </TabsTrigger>
          ) : null}
          <TabsTrigger
            value="activity"
            className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 pt-0 text-sm font-semibold text-slate-400 shadow-none data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
          >
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="m-0">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="space-y-6 md:col-span-8">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
                  <FileText size={18} className="text-blue-500" />
                  Incident Description
                </h3>
                {linkedVisitReportPdfUrl ? (
                  <div className="mb-6 overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <iframe
                      title="Visit report PDF"
                      src={linkedVisitReportPdfUrl}
                      className="h-[70vh] w-full bg-white"
                    />
                  </div>
                ) : (
                  <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm leading-relaxed text-slate-700">
                      {incident.description || 'No description recorded for this incident.'}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-6 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">Foreseeable:</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">
                      {boolLabel(foreseeable)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">Reported to Insurers:</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">
                      {boolLabel(reportedToInsurers)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">RIDDOR:</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">
                      {incident.riddor_reportable ? 'YES' : 'NO'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-800">
                  <Clock size={18} className="text-blue-500" />
                  Operational Details
                </h3>
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2">
                  <div className="flex gap-4">
                    <div className="mt-1 text-slate-400">
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Category</p>
                      <p className="font-medium text-slate-900">{titleFromSnake(incident.incident_category)}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 text-slate-400">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Occurred At</p>
                      <p className="font-medium text-slate-900">{safeDateTime(incident.occurred_at)}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 text-slate-400">
                      <Clock size={18} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Reported At</p>
                      <p className="font-medium text-slate-900">{safeDateTime(incident.reported_at)}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 text-slate-400">
                      <User size={18} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Reported By</p>
                      <p className="font-medium text-slate-900">{reportedByDisplay}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 text-md font-bold text-slate-800">
                    <User size={16} className="text-slate-400" />
                    Persons Involved
                  </h3>
                  <div className="space-y-4">
                    {incidentPeople.length > 0 ? (
                      incidentPeople.map((person, index) => (
                        <div key={`incident-person-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {person.name || `Person ${index + 1}`}
                            </span>
                            <span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                              {person.role}
                            </span>
                            {person.injured ? (
                              <span className="rounded bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">
                                Injured
                              </span>
                            ) : null}
                            {childInvolved === true && index === 0 ? (
                              <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                                Child
                              </span>
                            ) : null}
                          </div>
                          {person.involvement ? (
                            <p className="mt-2 text-sm text-slate-600">{person.involvement}</p>
                          ) : null}
                          {person.injuryDetails ? (
                            <p className="mt-2 text-sm text-rose-700">{person.injuryDetails}</p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div>
                        <p className="mb-1 text-xs text-slate-500">Primary Person</p>
                        <p className="font-semibold text-slate-900">{displayPersonName}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 text-md font-bold text-slate-800">
                    <ShieldAlert size={16} className="text-slate-400" />
                    Injury Details
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="mb-1 text-xs text-slate-500">Injury Reported</p>
                      <p className="text-sm font-semibold text-slate-900">{someoneInjured ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">Root Cause</p>
                      <p className="text-sm font-semibold text-slate-900">{injuryRootCause}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">Incident Type</p>
                      <p className="text-sm font-medium text-slate-700">
                        {injuryIncidentType || titleFromSnake(incident.incident_category)}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">Injury Summary</p>
                      <p className="text-sm font-medium text-slate-700">
                        {injurySummary || (someoneInjured ? 'Recorded in person notes.' : 'No injury recorded')}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">First Aid Action</p>
                      <p className="text-sm font-medium italic text-slate-600">{firstAidAction}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 md:col-span-4">
              <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-xl" />

                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-emerald-900">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  Resolution & Closure
                </h3>

                <div className="relative z-10 space-y-4">
                  {isClosed || isArchivedClosedIncident ? (
                    <>
                      <div className="rounded-lg border border-emerald-100 bg-white/60 p-3">
                        <p className="mb-1 text-xs font-bold text-emerald-600">Case Closed On</p>
                        <p className="text-sm font-medium text-emerald-900">{safeDateTime(closureDate)}</p>
                      </div>

                      <div className="flex items-start gap-2 border-t border-emerald-200/50 pt-3 text-xs text-emerald-700">
                        <Activity size={14} className="mt-0.5 shrink-0" />
                        <p>
                          {incident.closure_summary ||
                            (isArchivedClosedIncident
                              ? 'Imported historical closure record.'
                              : 'Closed through the incident workflow.')}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-emerald-100 bg-white/60 p-3">
                      <p className="mb-1 text-xs font-bold text-emerald-600">Case Status</p>
                      <p className="text-sm font-medium text-emerald-900">Open</p>
                      <p className="mt-1 text-xs text-emerald-700">
                        This case is currently active. Use the workflow buttons above to manage progress.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
                  <UserCheck size={18} className="text-slate-400" />
                  Assigned Investigator
                </h3>

                {!isArchivedClosedIncident && profiles && profiles.length > 0 ? (
                  <AssignInvestigator
                    incidentId={incident.id}
                    currentInvestigatorId={incident.assigned_investigator_user_id}
                    profiles={profiles}
                  />
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                    {incident.investigator?.full_name || 'Unassigned'}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
                  <Clock size={16} className="text-slate-400" />
                  Recent Activity
                </h3>

                <div className="space-y-4">
                  {recentActivity.length === 0 ? (
                    <p className="text-sm text-slate-500">No activity recorded yet.</p>
                  ) : (
                    recentActivity.map((activity: any, index: number) => {
                      const actorName = resolveActivityActorName(activity, userMap, incidentActorOverrideName)
                      return (
                        <div
                          key={activity.id || `${activity.action}-${index}`}
                          className={`flex gap-3 text-sm ${index > 0 ? 'opacity-90' : ''}`}
                        >
                          <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${index === 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <div>
                            <p className="font-medium text-slate-900">{activityTitle(activity.action)}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{actorName}</p>
                            <p className="mt-1 text-[10px] font-mono text-slate-400">
                              {safeDateTime(activity.created_at)}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {!isArchivedClosedIncident ? (
          <TabsContent value="investigation" className="m-0">
            <IncidentInvestigation incident={incident} investigation={investigation} profiles={profiles || []} />
          </TabsContent>
        ) : null}

        {!isArchivedClosedIncident ? (
          <TabsContent value="actions" className="m-0">
            <IncidentActions
              incidentId={params.id}
              actions={actions}
              profiles={profiles || []}
              initialOpen={String(searchParams?.newAction || '') === '1'}
            />
          </TabsContent>
        ) : null}

        {!isArchivedClosedIncident ? (
          <TabsContent value="attachments" className="m-0">
            <IncidentAttachments incidentId={params.id} attachments={attachments} />
          </TabsContent>
        ) : null}

        <TabsContent value="activity" className="m-0">
          <IncidentActivity
            activityLog={activityLog}
            userMap={userMap}
            incidentActorOverrideName={incidentActorOverrideName}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
