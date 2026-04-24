import { createClient } from '@/lib/supabase/server'
import { getIncidentDisplayReference } from '@/lib/incidents/incident-reference-display'
import { requireAuth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatStoreName } from '@/lib/store-display'

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
    .order('created_at', { ascending: false })

  return data || []
}

export default async function IncidentPrintPage({
  params,
}: {
  params: { id: string }
}) {
  await requireAuth()
  const incident = await getIncident(params.id)

  if (!incident) {
    notFound()
  }

  const supabase = createClient()
  const [investigation, actions, displayReference] = await Promise.all([
    getInvestigation(params.id),
    getActions(params.id),
    getIncidentDisplayReference(supabase, {
      incidentId: String(incident.id),
      referenceNo: incident.reference_no,
      storeCode: incident.tfs_stores?.store_code,
      storeName: incident.tfs_stores?.store_name,
      occurredAt: incident.occurred_at,
      storeId: incident.store_id,
    }),
  ])
  const personsObject = normalizeJsonObject(incident.persons_involved)
  const reportedByLabel = pickString(personsObject, ['reported_by_label', 'reportedByLabel'])
  const reportedByDisplay = reportedByLabel || incident.reporter?.full_name || 'Unknown'

  return (
    <div className="p-8 max-w-4xl mx-auto print:p-4">
      <div className="space-y-6">
        <div className="border-b pb-4">
          <h1 className="text-3xl font-bold">{displayReference}</h1>
          <p className="text-lg mt-2">{incident.summary}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Status</div>
            <div className="mt-1">
              <StatusBadge status={incident.status} type="incident" />
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Severity</div>
            <div className="mt-1">
              <StatusBadge status={incident.severity} type="severity" />
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Store</div>
            <div className="mt-1">{formatStoreName(incident.tfs_stores?.store_name)}</div>
            {incident.tfs_stores?.store_code && (
              <div className="text-sm text-muted-foreground">Code: {incident.tfs_stores.store_code}</div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Category</div>
            <div className="mt-1">
              {incident.incident_category.split('_').map((w: string) => 
                w.charAt(0).toUpperCase() + w.slice(1)
              ).join(' ')}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Occurred At</div>
            <div className="mt-1">{format(new Date(incident.occurred_at), 'dd MMM yyyy HH:mm')}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Reported At</div>
            <div className="mt-1">{format(new Date(incident.reported_at), 'dd MMM yyyy HH:mm')}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Reported By</div>
            <div className="mt-1">{reportedByDisplay}</div>
          </div>
          {incident.assigned_investigator_user_id && (
            <div>
              <div className="text-sm font-medium text-muted-foreground">Investigator</div>
              <div className="mt-1">{incident.investigator?.full_name || 'Unknown'}</div>
            </div>
          )}
        </div>

        {incident.riddor_reportable && (
          <div className="border-l-4 border-red-500 bg-red-50 p-4">
            <div className="font-medium text-red-800">RIDDOR Reportable</div>
            <div className="text-sm text-red-700">This incident is RIDDOR reportable</div>
          </div>
        )}

        <div>
          <h2 className="text-xl font-semibold mb-2">Description</h2>
          <p className="whitespace-pre-wrap">{incident.description || 'No description provided'}</p>
        </div>

        {investigation && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Investigation</h2>
            <div className="space-y-2">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Type</div>
                <div>{investigation.investigation_type.split('_').map((w: string) => 
                  w.charAt(0).toUpperCase() + w.slice(1)
                ).join(' ')}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Status</div>
                <div>
                  <StatusBadge status={investigation.status} type="investigation" />
                </div>
              </div>
              {investigation.root_cause && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Root Cause</div>
                  <p className="whitespace-pre-wrap">{investigation.root_cause}</p>
                </div>
              )}
              {investigation.findings && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Findings</div>
                  <p className="whitespace-pre-wrap">{investigation.findings}</p>
                </div>
              )}
              {investigation.recommendations && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Recommendations</div>
                  <p className="whitespace-pre-wrap">{investigation.recommendations}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {actions.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Actions</h2>
            <div className="space-y-3">
              {actions.map((action: any) => (
                <div key={action.id} className="border p-3 rounded">
                  <div className="font-medium">{action.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Assigned to: {action.assigned_to?.full_name || 'Unknown'} • 
                    Due: {format(new Date(action.due_date), 'dd MMM yyyy')} • 
                    Status: <StatusBadge status={action.status} type="action" />
                  </div>
                  {action.description && (
                    <p className="text-sm mt-2 whitespace-pre-wrap">{action.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {incident.closure_summary && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Closure Summary</h2>
            <p className="whitespace-pre-wrap">{incident.closure_summary}</p>
            {incident.closed_at && (
              <p className="text-sm text-muted-foreground mt-2">
                Closed: {format(new Date(incident.closed_at), 'dd MMM yyyy HH:mm')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
