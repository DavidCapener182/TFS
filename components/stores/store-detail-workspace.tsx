'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  StoreCrmDisplayContact,
  StoreCrmPanel,
  StoreCrmContact,
  StoreCrmNote,
  StoreCrmTrackerEntry,
} from '@/components/stores/store-crm-panel'
import { StoreActionsModal } from '@/components/audit/store-actions-modal'
import { AuditRow } from '@/components/audit/audit-table-helpers'
import type { VisitHistoryEntry } from '@/components/visit-tracker/types'
import { UserRole } from '@/lib/auth'
import { getStoreActionListTitle } from '@/lib/store-action-titles'
import { getInternalAreaDisplayName, getReportingAreaDisplayName } from '@/lib/areas'
import { formatStoreName } from '@/lib/store-display'
import {
  getStoreVisitActivityLabel,
  getStoreVisitNeedLevelLabel,
  getStoreVisitTypeLabel,
} from '@/lib/visit-needs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  MapPin,
  Store,
} from 'lucide-react'

interface StoreDetailWorkspaceProps {
  store: any
  incidents: any[]
  actions: any[]
  loggedVisits: VisitHistoryEntry[]
  visitsAvailable: boolean
  visitsUnavailableMessage: string | null
  userRole: UserRole
  crmData: {
    contacts: StoreCrmContact[]
    notes: StoreCrmNote[]
    trackerEntries: StoreCrmTrackerEntry[]
    userMap: Record<string, string | null>
    isAvailable: boolean
    unavailableMessage: string | null
  }
  canEdit: boolean
}

function getScoreColor(score: number) {
  if (score >= 90) return 'text-green-700'
  if (score >= 80) return 'text-amber-600'
  return 'text-red-600'
}

function getSeverityIndexLabel(openIncidents: any[]) {
  const severities = openIncidents
    .map((incident) => String(incident.severity || '').toLowerCase())
    .filter(Boolean)

  if (severities.some((severity) => severity === 'critical' || severity === 'high')) {
    return { label: 'High', className: 'text-red-500' }
  }
  if (severities.some((severity) => severity === 'medium')) {
    return { label: 'Medium', className: 'text-amber-500' }
  }
  return { label: 'Low', className: 'text-green-500' }
}

function formatActionDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return format(parsed, 'dd MMM yyyy')
}

function getActionStatusTone(status: string | null | undefined): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized === 'cancelled') return 'border-slate-200 bg-slate-100 text-slate-600'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function getActionPriorityTone(priority: string | null | undefined): string {
  const normalized = String(priority || '').toLowerCase()
  if (normalized === 'urgent') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (normalized === 'high') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (normalized === 'low') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function getVisitNeedTone(level: string | null | undefined): string {
  const normalized = String(level || '').toLowerCase()
  if (normalized === 'urgent') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (normalized === 'needed') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (normalized === 'monitor') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function getActivePlannedVisitDate(plannedDate: string | null, lastVisitDate: string | null): string | null {
  if (!plannedDate) return null
  if (!lastVisitDate) return plannedDate

  const plannedTime = new Date(plannedDate).getTime()
  const lastVisitTime = new Date(lastVisitDate).getTime()
  if (Number.isNaN(plannedTime) || Number.isNaN(lastVisitTime)) return plannedDate
  return lastVisitTime >= plannedTime ? null : plannedDate
}

export function StoreDetailWorkspace({
  store,
  incidents,
  actions,
  loggedVisits,
  visitsAvailable,
  visitsUnavailableMessage,
  userRole,
  crmData,
  canEdit,
}: StoreDetailWorkspaceProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('store crm')
  const [storeActionsModalOpen, setStoreActionsModalOpen] = useState(false)
  const [actionsMessage, setActionsMessage] = useState<string | null>(null)

  const ongoingIncidents = useMemo(
    () => incidents.filter((incident) => !['closed', 'cancelled'].includes(String(incident.status || '').toLowerCase())),
    [incidents]
  )

  const completedIncidents = useMemo(
    () => incidents.filter((incident) => String(incident.status || '').toLowerCase() === 'closed'),
    [incidents]
  )

  const ongoingActions = useMemo(
    () => actions.filter((action) => !['complete', 'cancelled'].includes(String(action.status || '').toLowerCase())),
    [actions]
  )

  const completedActions = useMemo(
    () => actions.filter((action) => String(action.status || '').toLowerCase() === 'complete'),
    [actions]
  )
  const directStoreActions = useMemo(
    () => actions.filter((action) => action.source_type === 'store'),
    [actions]
  )
  const incidentLinkedActions = useMemo(
    () => actions.filter((action) => action.source_type !== 'store'),
    [actions]
  )

  const complianceScores = useMemo(
    () =>
      [
        store.compliance_audit_1_overall_pct,
        store.compliance_audit_2_overall_pct,
        store.compliance_audit_3_overall_pct,
      ].filter((score): score is number => score !== null && score !== undefined),
    [
      store.compliance_audit_1_overall_pct,
      store.compliance_audit_2_overall_pct,
      store.compliance_audit_3_overall_pct,
    ]
  )

  const averageCompliance =
    complianceScores.length > 0
      ? complianceScores.reduce((sum, score) => sum + score, 0) / complianceScores.length
      : null

  const auditEntries = useMemo(() => {
    const rows = [1, 2, 3]
      .map((auditNumber) => ({
        auditNumber,
        score: store[`compliance_audit_${auditNumber}_overall_pct`] as number | null,
        date: store[`compliance_audit_${auditNumber}_date`] as string | null,
      }))
      .filter((row) => row.score !== null && row.score !== undefined)

    return rows.sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0
      const bTime = b.date ? new Date(b.date).getTime() : 0
      if (aTime !== bTime) return bTime - aTime
      return b.auditNumber - a.auditNumber
    })
  }, [store])

  const latestAuditScore = auditEntries[0]?.score ?? averageCompliance ?? null
  const latestVisitDate = loggedVisits[0]?.visitedAt || null
  const plannedVisitDate = getActivePlannedVisitDate(
    store.compliance_audit_2_planned_date || null,
    latestVisitDate
  )

  const fullAddress = [store.address_line_1, store.city, store.postcode].filter(Boolean).join(', ')
  const mapsSearchUrl = fullAddress
    ? `https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`
    : null
  const mapsNavigationUrl = fullAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
    : null

  const actionResolutionPct = actions.length > 0 ? Math.round((completedActions.length / actions.length) * 100) : 0
  const severityIndex = getSeverityIndexLabel(ongoingIncidents)
  const canCreateStoreActions = userRole === 'admin' || userRole === 'ops'
  const supplementalContacts = useMemo<StoreCrmDisplayContact[]>(() => {
    if (!store.reporting_area_manager_name && !store.reporting_area_manager_email) {
      return []
    }

    return [
      {
        id: `reporting-area-manager-${store.id}`,
        contact_name: store.reporting_area_manager_name || 'Area Manager',
        job_title: store.reporting_area
          ? `Area Manager • ${getReportingAreaDisplayName(store.reporting_area)}`
          : 'Area Manager',
        email: store.reporting_area_manager_email || null,
        phone: null,
        preferred_method: store.reporting_area_manager_email ? 'email' : null,
        is_primary: false,
        notes: null,
        created_by_user_id: '',
        created_at: '',
        badgeLabel: 'Area Manager',
        isReadOnly: true,
      },
    ]
  }, [
    store.id,
    store.reporting_area,
    store.reporting_area_manager_email,
    store.reporting_area_manager_name,
  ])

  const storeActionsModalRow = useMemo<AuditRow>(
    () => ({
      id: store.id,
      region: store.region || null,
      store_code: store.store_code || null,
      store_name: store.store_name,
      is_active: Boolean(store.is_active),
      compliance_audit_1_date: store.compliance_audit_1_date || null,
      compliance_audit_1_overall_pct: store.compliance_audit_1_overall_pct ?? null,
      action_plan_1_sent: store.action_plan_1_sent ?? null,
      compliance_audit_1_pdf_path: store.compliance_audit_1_pdf_path || null,
      compliance_audit_2_date: store.compliance_audit_2_date || null,
      compliance_audit_2_overall_pct: store.compliance_audit_2_overall_pct ?? null,
      action_plan_2_sent: store.action_plan_2_sent ?? null,
      compliance_audit_2_pdf_path: store.compliance_audit_2_pdf_path || null,
      compliance_audit_3_date: store.compliance_audit_3_date || null,
      compliance_audit_3_overall_pct: store.compliance_audit_3_overall_pct ?? null,
      action_plan_3_sent: store.action_plan_3_sent ?? null,
      area_average_pct: store.area_average_pct ?? null,
      total_audits_to_date: store.total_audits_to_date ?? null,
      fire_risk_assessment_date: store.fire_risk_assessment_date || null,
      fire_risk_assessment_pdf_path: store.fire_risk_assessment_pdf_path || null,
      fire_risk_assessment_notes: store.fire_risk_assessment_notes || null,
      fire_risk_assessment_pct: store.fire_risk_assessment_pct ?? null,
    }),
    [store]
  )

  const handleStoreActionsCreated = (count: number, storeName: string) => {
    setActionsMessage(
      count === 1
        ? `1 action created for ${storeName}.`
        : `${count} actions created for ${storeName}.`
    )
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/stores" className="transition-colors hover:text-blue-600">
          Stores / CRM
        </Link>
        <ChevronRight size={14} />
        <span className="font-medium text-slate-900">{formatStoreName(store.store_name)}</span>
      </nav>

      <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div className="flex items-center gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Store size={32} />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{formatStoreName(store.store_name)}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  store.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {store.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-700">
                {store.store_code || 'No code'}
              </span>
              <span className="font-medium">
                Region: {getInternalAreaDisplayName(store.region, { fallback: 'Unassigned', includeCode: false })}
              </span>
            </div>
            {store.reporting_area && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
                  Reporting Area: {getReportingAreaDisplayName(store.reporting_area)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full gap-4 border-t border-slate-100 pt-4 md:w-auto md:border-t-0 md:pt-0">
          <div className="flex-1 border-r border-slate-100 px-6 md:text-right">
            <p className="mb-1 text-xs font-medium uppercase text-slate-400">Incidents</p>
            <p className="text-2xl font-bold text-red-500">{incidents.length}</p>
          </div>
          <div className="flex-1 border-r border-slate-100 px-6 md:text-right">
            <p className="mb-1 text-xs font-medium uppercase text-slate-400">Actions</p>
            <p className="text-2xl font-bold text-blue-600">{actions.length}</p>
          </div>
          <div className="flex-1 px-6 md:text-right">
            <p className="mb-1 text-xs font-medium uppercase text-slate-400">Latest Visit</p>
            <p className="text-2xl font-bold text-slate-900">
              {latestVisitDate ? format(new Date(latestVisitDate), 'dd MMM') : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="no-scrollbar flex gap-8 overflow-x-auto border-b border-slate-200">
        {['Store CRM', 'Store Actions', 'Operational Data', 'Incidents & Safety', 'Visit History'].map((tab) => {
          const value = tab.toLowerCase()
          const isActive = activeTab === value

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(value)}
              className={`relative whitespace-nowrap pb-4 text-sm font-semibold transition-all ${
                isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab}
              {isActive ? <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600" /> : null}
            </button>
          )
        })}
      </div>

      {activeTab === 'store crm' ? (
        <StoreCrmPanel
          storeId={store.id}
          canEdit={canEdit}
          contacts={crmData.contacts}
          supplementalContacts={supplementalContacts}
          notes={crmData.notes}
          trackerEntries={crmData.trackerEntries}
          userMap={crmData.userMap}
          isAvailable={crmData.isAvailable}
          unavailableMessage={crmData.unavailableMessage}
          safetyCompliancePct={latestAuditScore ?? 0}
          actionResolutionPct={actionResolutionPct}
        />
      ) : null}

      {activeTab === 'store actions' ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Store Actions</h3>
                <p className="text-sm text-slate-500">
                  Add direct store actions from flagged audit text or review existing open/completed tasks.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {directStoreActions.length} direct store actions • {incidentLinkedActions.length} incident-linked actions
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setStoreActionsModalOpen(true)}
                disabled={!canCreateStoreActions}
                className="w-full sm:w-auto"
              >
                Add Actions From Parser
              </Button>
            </div>
            {!canCreateStoreActions ? (
              <p className="mt-3 text-xs text-amber-700">
                You have read-only access. Ask an admin or ops user to create store actions.
              </p>
            ) : null}
            {actionsMessage ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {actionsMessage}
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4">
              <h4 className="font-bold text-slate-900">Action List</h4>
            </div>
            <div className="divide-y divide-slate-100">
              {actions.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No actions logged for this store.</div>
              ) : (
                actions.map((action) => (
                  <div key={action.id} className="space-y-3 p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-slate-900">
                        {action.source_type === 'store' ? getStoreActionListTitle(action) : action.title || 'Untitled action'}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={action.source_type === 'store'
                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                            : 'border-sky-200 bg-sky-50 text-sky-700'}
                        >
                          {action.source_type === 'store' ? 'Store' : 'Incident'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={getActionPriorityTone(action.priority)}
                        >
                          {String(action.priority || 'medium')}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={getActionStatusTone(action.status)}
                        >
                          {String(action.status || 'open').replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>

                    {action.description ? (
                      <p className="text-sm text-slate-600">{action.description}</p>
                    ) : null}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Due: {formatActionDate(action.due_date)}</span>
                      {action.completed_at ? <span>Completed: {formatActionDate(action.completed_at)}</span> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'operational data' ? (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="flex h-[500px] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-8">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Location Details</h3>
                <p className="text-sm text-slate-500">{fullAddress || 'No address available'}</p>
              </div>
              {mapsNavigationUrl ? (
                <a
                  href={mapsNavigationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline"
                >
                  <ExternalLink size={14} /> Open in Maps
                </a>
              ) : null}
            </div>

            <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {mapsSearchUrl ? (
                <iframe
                  src={mapsSearchUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-full w-full"
                  title={`${formatStoreName(store.store_name)} map`}
                />
              ) : (
                <div className="absolute inset-0 opacity-40 [background-size:20px_20px] bg-[radial-gradient(#94a3b8_1px,transparent_1px)]" />
              )}
            </div>
          </div>

          <div className="space-y-6 md:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold">Visit Activity</h3>
              <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-green-600">Latest Visit</p>
                <p className="text-4xl font-black text-slate-800">
                  {latestVisitDate ? format(new Date(latestVisitDate), 'dd MMM yyyy') : '—'}
                </p>
                {plannedVisitDate ? (
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-green-600">
                    <Calendar size={14} /> Planned {format(new Date(plannedVisitDate), 'MMM d, yyyy')}
                  </div>
                ) : null}
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-500">Visit Coverage</span>
                  <span className="text-sm font-bold">
                    {loggedVisits.length > 0 ? `${loggedVisits.length} logged` : 'No visits logged'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Visit Status</span>
                  <span className="text-sm font-bold text-blue-600">
                    {plannedVisitDate ? 'Planned' : latestVisitDate ? 'Recently visited' : 'No current plan'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'incidents & safety' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-1 text-xs font-bold uppercase text-slate-400">Open Cases</p>
              <p className="text-3xl font-bold">{ongoingIncidents.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-1 text-xs font-bold uppercase text-slate-400">Total Reported</p>
              <p className="text-3xl font-bold">{incidents.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-1 text-xs font-bold uppercase text-slate-400">Severity Index</p>
              <p className={`text-3xl font-bold ${severityIndex.className}`}>{severityIndex.label}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-6 py-4">
              <h3 className="font-bold">Closed History</h3>
              <Link href="/reports" className="text-sm font-bold text-blue-600 hover:underline">
                Export Logs
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {completedIncidents.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No closed incidents available for this store.</div>
              ) : (
                completedIncidents.map((incident) => (
                  <div key={incident.id} className="flex flex-col gap-6 p-6 transition-colors hover:bg-slate-50 sm:flex-row">
                    <div className="shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <AlertCircle size={20} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="mb-2 flex justify-between gap-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-400">
                          {incident.reference_no}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock size={12} />{' '}
                          {incident.closed_at
                            ? format(new Date(incident.closed_at), 'dd MMM yyyy')
                            : format(new Date(incident.occurred_at), 'dd MMM yyyy')}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-relaxed text-slate-700">{incident.summary}</p>
                    </div>
                    <div className="shrink-0">
                      <Link
                        href={`/incidents/${incident.id}`}
                        className="whitespace-nowrap rounded border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-white"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'visit history' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">Visit Timeline</h3>
            <div className="space-y-3">
              {!visitsAvailable && visitsUnavailableMessage ? (
                <p className="text-sm text-amber-700">{visitsUnavailableMessage}</p>
              ) : loggedVisits.length === 0 ? (
                <p className="text-sm text-slate-500">No LP visits logged yet.</p>
              ) : (
                loggedVisits.map((visit) => (
                  <div key={visit.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {visit.visitType === 'route_completion'
                            ? 'Planned route visit'
                            : getStoreVisitTypeLabel(visit.visitType)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {visit.createdByName || 'Unknown officer'}
                        </p>
                      </div>
                      {visit.needLevelSnapshot ? (
                        <Badge variant="outline" className={getVisitNeedTone(visit.needLevelSnapshot)}>
                          {getStoreVisitNeedLevelLabel(visit.needLevelSnapshot)}
                          {typeof visit.needScoreSnapshot === 'number' ? ` (${visit.needScoreSnapshot})` : ''}
                        </Badge>
                      ) : (
                        <p className="text-sm font-semibold text-[#4b3a78]">Completed</p>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {format(new Date(visit.visitedAt), 'dd MMM yyyy HH:mm')}
                    </p>
                    {visit.completedActivityKeys.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {visit.completedActivityKeys.map((key) => (
                          <Badge
                            key={key}
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            {getStoreVisitActivityLabel(key)}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {visit.notes ? (
                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        {visit.notes}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">Visit Snapshot</h3>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Next Planned Visit</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {plannedVisitDate ? format(new Date(plannedVisitDate), 'dd MMM yyyy') : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {plannedVisitDate ? 'Scheduled visit date' : 'No visit scheduled'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Store Actions</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{actions.length}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {ongoingActions.length} pending • {completedActions.length} completed
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Incident Summary</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{incidents.length}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {ongoingIncidents.length} open • {completedIncidents.length} closed
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Logged Visits</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{loggedVisits.length}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {latestVisitDate ? `Latest on ${format(new Date(latestVisitDate), 'dd MMM yyyy')}` : 'No recent visit logged'}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <StoreActionsModal
        open={storeActionsModalOpen}
        onOpenChange={setStoreActionsModalOpen}
        row={storeActionsModalRow}
        userRole={userRole}
        onActionsCreated={handleStoreActionsCreated}
      />
    </div>
  )
}
