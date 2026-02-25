'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { StoreCrmPanel, StoreCrmContact, StoreCrmNote, StoreCrmTrackerEntry } from '@/components/stores/store-crm-panel'
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
  crmData: {
    contacts: StoreCrmContact[]
    notes: StoreCrmNote[]
    trackerEntries: StoreCrmTrackerEntry[]
    userMap: Record<string, string | null>
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

export function StoreDetailWorkspace({ store, incidents, actions, crmData, canEdit }: StoreDetailWorkspaceProps) {
  const [activeTab, setActiveTab] = useState('store crm')

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

  const fullAddress = [store.address_line_1, store.city, store.postcode].filter(Boolean).join(', ')
  const mapsSearchUrl = fullAddress
    ? `https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`
    : null
  const mapsNavigationUrl = fullAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
    : null

  const actionResolutionPct = actions.length > 0 ? Math.round((completedActions.length / actions.length) * 100) : 0
  const severityIndex = getSeverityIndexLabel(ongoingIncidents)

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/stores" className="transition-colors hover:text-blue-600">
          Stores / CRM
        </Link>
        <ChevronRight size={14} />
        <span className="font-medium text-slate-900">{store.store_name}</span>
      </nav>

      <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div className="flex items-center gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Store size={32} />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{store.store_name}</h1>
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
              <span className="font-medium">Region: {store.region || 'Unassigned'}</span>
            </div>
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
            <p className="mb-1 text-xs font-medium uppercase text-slate-400">Audit</p>
            <p className="text-2xl font-bold text-slate-900">
              {typeof latestAuditScore === 'number' ? `${latestAuditScore.toFixed(2)}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="no-scrollbar flex gap-8 overflow-x-auto border-b border-slate-200">
        {['Store CRM', 'Operational Data', 'Incidents & Safety', 'Audit History'].map((tab) => {
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
          notes={crmData.notes}
          trackerEntries={crmData.trackerEntries}
          userMap={crmData.userMap}
          safetyCompliancePct={latestAuditScore ?? 0}
          actionResolutionPct={actionResolutionPct}
        />
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
                  title={`${store.store_name} map`}
                />
              ) : (
                <div className="absolute inset-0 opacity-40 [background-size:20px_20px] bg-[radial-gradient(#94a3b8_1px,transparent_1px)]" />
              )}
            </div>
          </div>

          <div className="space-y-6 md:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold">Audit Performance</h3>
              <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-green-600">Latest Audit Score</p>
                <p className={`text-5xl font-black ${typeof latestAuditScore === 'number' ? getScoreColor(latestAuditScore) : 'text-slate-700'}`}>
                  {typeof latestAuditScore === 'number' ? `${latestAuditScore.toFixed(2)}%` : '—'}
                </p>
                {auditEntries[0]?.date ? (
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-green-600">
                    <Calendar size={14} /> {format(new Date(auditEntries[0].date), 'MMM d, yyyy')}
                  </div>
                ) : null}
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-500">Historical Average</span>
                  <span className="text-sm font-bold">
                    {typeof averageCompliance === 'number' ? `${averageCompliance.toFixed(2)}%` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Audit Completion</span>
                  <span className="text-sm font-bold text-blue-600">
                    {auditEntries.length > 0 ? 'On Schedule' : 'No Audits Logged'}
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

      {activeTab === 'audit history' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">Audit Timeline</h3>
            <div className="space-y-3">
              {auditEntries.length === 0 ? (
                <p className="text-sm text-slate-500">No audit rounds logged yet.</p>
              ) : (
                auditEntries.map((audit) => (
                  <div key={audit.auditNumber} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">Audit {audit.auditNumber}</p>
                      <p className={`text-lg font-bold ${getScoreColor(audit.score || 0)}`}>
                        {typeof audit.score === 'number' ? `${audit.score.toFixed(2)}%` : '—'}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {audit.date ? format(new Date(audit.date), 'dd MMM yyyy') : 'No date recorded'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">Compliance Snapshot</h3>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Fire Risk Assessment</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {typeof store.fire_risk_assessment_pct === 'number'
                    ? `${store.fire_risk_assessment_pct.toFixed(2)}%`
                    : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {store.fire_risk_assessment_date
                    ? format(new Date(store.fire_risk_assessment_date), 'dd MMM yyyy')
                    : 'No FRA date logged'}
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
