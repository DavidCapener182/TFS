'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ActionForm } from '@/components/incidents/action-form'
import { EditIncidentDialog } from '@/components/incidents/edit-incident-dialog'
import {
  StoreCrmDisplayContact,
  StoreCrmPanel,
  StoreCrmContact,
  StoreCrmNote,
  StoreCrmTrackerEntry,
} from '@/components/stores/store-crm-panel'
import { InboundEmailStorePanel } from '@/components/inbound-emails/inbound-email-store-panel'
import { StoreInboundEmailDialog } from '@/components/inbound-emails/store-inbound-email-dialog'
import { StoreVisitModal } from '@/components/visit-tracker/store-visit-modal'
import { StoreVisitActivitySummary } from '@/components/visit-tracker/store-visit-activity-summary'
import type { InboundEmailRow } from '@/lib/inbound-emails'
import type { VisitHistoryEntry, VisitTrackerRow } from '@/components/visit-tracker/types'
import { UserRole } from '@/lib/auth'
import { getStoreActionListTitle } from '@/lib/store-action-titles'
import { getInternalAreaDisplayName, getReportingAreaDisplayName } from '@/lib/areas'
import { formatStoreName } from '@/lib/store-display'
import { getVisitReportTypeLabel } from '@/lib/reports/visit-report-types'
import type { StoreVisitProductCatalogItem } from '@/lib/store-visit-product-catalog'
import {
  getStoreVisitNeedLevelLabel,
  getStoreVisitTypeLabel,
} from '@/lib/visit-needs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  buildVisitReportPdfUrl,
  extractLinkedVisitReportId,
  getIncidentPersonLabel,
} from '@/lib/incidents/incident-utils'
import { CloseIncidentButton } from '@/components/shared/close-incident-button'
import { ViewActionModal } from '@/components/shared/view-action-modal'
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
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
  profiles: Array<{ id: string; full_name: string | null }>
  crmData: {
    contacts: StoreCrmContact[]
    notes: StoreCrmNote[]
    trackerEntries: StoreCrmTrackerEntry[]
    userMap: Record<string, string | null>
    isAvailable: boolean
    unavailableMessage: string | null
  }
  inboundEmails: InboundEmailRow[]
  canEdit: boolean
  visitTrackerRow: VisitTrackerRow
  productCatalog: StoreVisitProductCatalogItem[]
  currentUserName: string | null
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
  profiles,
  crmData,
  inboundEmails,
  canEdit,
  visitTrackerRow,
  productCatalog,
  currentUserName,
}: StoreDetailWorkspaceProps) {
  const [activeTab, setActiveTab] = useState('crm')
  const [selectedActionIncident, setSelectedActionIncident] = useState<any | null>(null)
  const [selectedStoreAction, setSelectedStoreAction] = useState<any | null>(null)
  const [selectedInboundEmailId, setSelectedInboundEmailId] = useState<string | null>(null)
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false)

  const normalizeStatus = (value: unknown) => String(value || '').trim().toLowerCase()

  const ongoingIncidents = useMemo(
    () => incidents.filter((incident) => !['closed', 'cancelled'].includes(normalizeStatus(incident.status))),
    [incidents]
  )

  const completedIncidents = useMemo(
    () => incidents.filter((incident) => normalizeStatus(incident.status) === 'closed'),
    [incidents]
  )

  const ongoingActions = useMemo(
    () => actions.filter((action) => !['complete', 'cancelled'].includes(normalizeStatus(action.status))),
    [actions]
  )

  const completedActions = useMemo(
    () => actions.filter((action) => normalizeStatus(action.status) === 'complete'),
    [actions]
  )
  const reviewableInboundEmails = useMemo(
    () =>
      inboundEmails.filter((email) =>
        ['pending'].includes(normalizeStatus(email.processing_status))
      ),
    [inboundEmails]
  )
  const selectedInboundEmail = useMemo(
    () => inboundEmails.find((email) => email.id === selectedInboundEmailId) || null,
    [inboundEmails, selectedInboundEmailId]
  )
  const inboundEmailAlertCounts = useMemo(() => {
    return {
      total: reviewableInboundEmails.length,
      linked: inboundEmails.length,
      action: reviewableInboundEmails.filter((email) => email.analysis_needs_action).length,
      visit: reviewableInboundEmails.filter((email) => email.analysis_needs_visit).length,
      incident: reviewableInboundEmails.filter((email) => email.analysis_needs_incident).length,
    }
  }, [inboundEmails, reviewableInboundEmails])
  const directStoreActions = useMemo(
    () => actions.filter((action) => action.source_type === 'store'),
    [actions]
  )
  const incidentActionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    actions.forEach((action) => {
      if (!action.incident_id) return
      counts.set(action.incident_id, (counts.get(action.incident_id) || 0) + 1)
    })
    return counts
  }, [actions])
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
  const canManageIncidents = userRole === 'admin' || userRole === 'ops'
  const canLaunchVisitWorkspace = canEdit && visitsAvailable
  const visitWorkspaceButtonLabel = visitTrackerRow.activeDraftVisit ? 'Continue Draft Visit' : 'Start Visit'
  const hasLinkedInboundEmails = inboundEmailAlertCounts.linked > 0
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

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/stores" className="transition-colors hover:text-blue-600">
          CRM
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
              {inboundEmailAlertCounts.linked > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {inboundEmailAlertCounts.linked} linked email{inboundEmailAlertCounts.linked === 1 ? '' : 's'}
                  </span>
                  {inboundEmailAlertCounts.total > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                      {inboundEmailAlertCounts.total} to review
                    </span>
                  ) : null}
                </div>
              ) : null}
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
            <p className="mb-1 text-xs font-medium uppercase text-slate-400">Open Actions</p>
            <p className="text-2xl font-bold text-blue-600">{ongoingActions.length}</p>
          </div>
          <div className="flex-1 px-6 md:text-right">
            <p className="mb-1 text-xs font-medium uppercase text-slate-400">Latest Visit</p>
            <p className="text-2xl font-bold text-slate-900">
              {latestVisitDate ? format(new Date(latestVisitDate), 'dd MMM') : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={getVisitNeedTone(visitTrackerRow.visitNeedLevel)}>
                {getStoreVisitNeedLevelLabel(visitTrackerRow.visitNeedLevel)} ({visitTrackerRow.visitNeedScore})
              </Badge>
              {visitTrackerRow.nextPlannedVisitDate ? (
                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                  Planned {format(new Date(visitTrackerRow.nextPlannedVisitDate), 'dd MMM yyyy')}
                </Badge>
              ) : null}
              {visitTrackerRow.activeDraftVisit ? (
                <Badge variant="outline" className="border-[#dcd6ef] bg-[#f6f2fe] text-[#4b3a78]">
                  Draft visit in progress
                </Badge>
              ) : null}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Store Visit Workspace</h2>
              <p className="text-sm text-slate-500">
                Open the same live visit workflow used in Stores without leaving this CRM page.
              </p>
            </div>
            <p className="text-sm text-slate-600">
              {visitTrackerRow.visitNeedReasons.length > 0
                ? visitTrackerRow.visitNeedReasons.join(' • ')
                : 'No current LP or security drivers are pushing a visit.'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={() => setIsVisitModalOpen(true)}
              disabled={!canLaunchVisitWorkspace}
              className="bg-[#232154] text-white hover:bg-[#1c0259]"
            >
              {visitWorkspaceButtonLabel}
            </Button>
            <Button asChild type="button" variant="outline" className="border-slate-200">
              <Link href="/visit-tracker">Open Stores Board</Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Open actions</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{visitTrackerRow.openStoreActionCount}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Open incidents</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{visitTrackerRow.openIncidentCount}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last visit</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {visitTrackerRow.lastVisitDate ? format(new Date(visitTrackerRow.lastVisitDate), 'dd MMM yyyy') : 'No visit logged'}
            </div>
            <div className="mt-1 text-xs text-slate-500">{visitTrackerRow.lastVisitType || 'No visit logged yet'}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Planned purpose</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {visitTrackerRow.plannedVisitPurpose
                ? visitTrackerRow.plannedVisitPurpose.replace(/_/g, ' ')
                : 'No planned purpose'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {visitTrackerRow.plannedVisitPurposeNote || 'No additional planning note'}
            </div>
          </div>
        </div>
      </div>

      <div className="no-scrollbar flex gap-8 overflow-x-auto border-b border-slate-200">
        {[
          { label: 'CRM', value: 'crm' },
          { label: 'Store Actions', value: 'store actions' },
          { label: 'Operational Data', value: 'operational data' },
          { label: 'Incidents & Safety', value: 'incidents & safety' },
          { label: 'Visit History', value: 'visit history' },
          ...(hasLinkedInboundEmails
            ? [{ label: 'Emails', value: 'emails' as const }]
            : []),
        ].map((tab) => {
          const isEmailTab = tab.value === 'emails'
          const isActive = !isEmailTab && activeTab === tab.value
          const showInboundEmailCount = isEmailTab && inboundEmailAlertCounts.total > 0

          return (
            <button
              key={tab.value}
              onClick={() => {
                if (isEmailTab) {
                  const targetEmail = reviewableInboundEmails[0] || inboundEmails[0]
                  if (targetEmail?.id) setSelectedInboundEmailId(targetEmail.id)
                  return
                }
                setActiveTab(tab.value)
              }}
              className={`relative whitespace-nowrap pb-4 text-sm font-semibold transition-all ${
                isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>{tab.label}</span>
                {showInboundEmailCount ? (
                  <span className="inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    {inboundEmailAlertCounts.total > 99 ? '99+' : inboundEmailAlertCounts.total}
                  </span>
                ) : null}
              </span>
              {isActive ? <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600" /> : null}
            </button>
          )
        })}
      </div>

      {activeTab === 'crm' ? (
        <div className="space-y-6">
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
            contactsFooter={
              hasLinkedInboundEmails ? (
                <InboundEmailStorePanel
                  emails={inboundEmails}
                  onOpenEmail={(email) => setSelectedInboundEmailId(email.id)}
                  variant="compact"
                  maxItems={3}
                />
              ) : null
            }
          />
        </div>
      ) : null}

      {activeTab === 'store actions' ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Store Actions</h3>
            <p className="text-sm text-slate-500">
              Review direct store actions and incident-linked tasks for this store.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {ongoingActions.length} open actions • {completedActions.length} completed actions
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4">
              <h4 className="font-bold text-slate-900">Action List</h4>
            </div>
            <div className="divide-y divide-slate-100">
              {ongoingActions.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No open actions for this store.</div>
              ) : (
                ongoingActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => setSelectedStoreAction(action)}
                    className="w-full space-y-3 p-5 text-left transition-colors hover:bg-slate-50"
                  >
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
                  </button>
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
              <div>
                <h3 className="font-bold text-slate-900">Active Cases</h3>
                <p className="text-sm text-slate-500">
                  Review current LP cases, open the linked report PDF, create actions, and move the case through investigation or closure.
                </p>
              </div>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                {ongoingIncidents.length} open
              </Badge>
            </div>

            <div className="divide-y divide-slate-100">
              {ongoingIncidents.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No open incidents are active for this store.</div>
              ) : (
                ongoingIncidents.map((incident) => {
                  const linkedVisitReportId = extractLinkedVisitReportId(incident)
                  const linkedVisitReportUrl = linkedVisitReportId
                    ? buildVisitReportPdfUrl(linkedVisitReportId)
                    : null
                  const linkedActionCount = incidentActionCounts.get(incident.id) || 0
                  const incidentCategoryLabel = String(incident.incident_category || 'security')
                    .split('_')
                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                    .join(' ')

                  return (
                    <div key={incident.id} className="space-y-4 p-6">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-500">
                              {incident.reference_no}
                            </span>
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              {String(incident.status || 'open').replace(/_/g, ' ')}
                            </Badge>
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              {String(incident.severity || 'low')}
                            </Badge>
                            {linkedVisitReportUrl ? (
                              <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                                Visit report linked
                              </Badge>
                            ) : null}
                          </div>

                          <div>
                            <p className="text-base font-semibold text-slate-900">
                              {incident.summary || 'No summary recorded'}
                            </p>
                            {linkedVisitReportUrl ? (
                              <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-white">
                                <iframe
                                  title="Visit report PDF"
                                  src={linkedVisitReportUrl}
                                  className="h-[60vh] w-full bg-white"
                                />
                              </div>
                            ) : incident.description ? (
                              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                                {incident.description}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                            <span>Occurred: {formatActionDate(incident.occurred_at)}</span>
                            <span>Category: {incidentCategoryLabel}</span>
                            <span>People: {getIncidentPersonLabel(incident, incident.incident_category)}</span>
                            <span>Linked actions: {linkedActionCount}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:max-w-[420px] xl:justify-end">
                          {linkedVisitReportUrl ? (
                            <Button variant="outline" size="sm" asChild className="h-9">
                              <Link href={linkedVisitReportUrl} target="_blank">
                                <FileText className="mr-2 h-4 w-4" />
                                Open PDF
                              </Link>
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" asChild className="h-9">
                            <Link href={`/incidents/${incident.id}`}>
                              Manage Case
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild className="h-9">
                            <Link href={`/incidents/${incident.id}?tab=investigation`}>
                              Investigation
                            </Link>
                          </Button>
                          {canManageIncidents ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-9"
                              onClick={() => setSelectedActionIncident(incident)}
                            >
                              New Action
                            </Button>
                          ) : null}
                          {canManageIncidents ? <EditIncidentDialog incident={incident} /> : null}
                          {canManageIncidents ? (
                            <CloseIncidentButton
                              incidentId={incident.id}
                              incidentReference={incident.reference_no}
                              currentStatus={incident.status}
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-6 py-4">
              <div>
                <h3 className="font-bold text-slate-900">Active Actions</h3>
                <p className="text-sm text-slate-500">
                  Open tasks linked to incidents or directly to the store.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  {ongoingActions.length} active
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setActiveTab('store actions')}
                >
                  View all
                </Button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {ongoingActions.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No active actions for this store.</div>
              ) : (
                ongoingActions.slice(0, 6).map((action) => {
                  const title =
                    action.source_type === 'store'
                      ? getStoreActionListTitle(action)
                      : action.title || 'Untitled action'
                  const incidentHref = action.incident_id
                    ? `/incidents/${action.incident_id}?tab=actions`
                    : null
                  const incidentReference =
                    action.incident?.reference_no || action.incident?.referenceNo || null

                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => setSelectedStoreAction(action)}
                      className="w-full space-y-3 p-5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-900">{title}</p>
                          {incidentHref ? (
                            <Link
                              href={incidentHref}
                              className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline"
                            >
                              {incidentReference ? (
                                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-500">
                                  {incidentReference}
                                </span>
                              ) : null}
                              View incident actions
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={action.source_type === 'store'
                              ? 'border-violet-200 bg-violet-50 text-violet-700'
                              : 'border-sky-200 bg-sky-50 text-sky-700'}
                          >
                            {action.source_type === 'store' ? 'Store' : 'Incident'}
                          </Badge>
                          <Badge variant="outline" className={getActionPriorityTone(action.priority)}>
                            {String(action.priority || 'medium')}
                          </Badge>
                          <Badge variant="outline" className={getActionStatusTone(action.status)}>
                            {String(action.status || 'open').replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>Due: {formatActionDate(action.due_date)}</span>
                      </div>
                    </button>
                  )
                })
              )}
              {ongoingActions.length > 6 ? (
                <div className="px-6 py-4 text-sm text-slate-500">
                  Showing 6 of {ongoingActions.length} active actions.
                </div>
              ) : null}
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
                      <div className="flex flex-wrap justify-end gap-2">
                        {extractLinkedVisitReportId(incident) ? (
                          <Link
                            href={buildVisitReportPdfUrl(extractLinkedVisitReportId(incident)!)}
                            target="_blank"
                            className="whitespace-nowrap rounded border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-white"
                          >
                            Open PDF
                          </Link>
                        ) : null}
                        {canManageIncidents ? (
                          <CloseIncidentButton
                            incidentId={incident.id}
                            incidentReference={incident.reference_no}
                            currentStatus={String(incident.status || 'closed')}
                          />
                        ) : null}
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="whitespace-nowrap rounded border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-white"
                        >
                          View Details
                        </Link>
                      </div>
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
                      ) : visit.status === 'draft' ? (
                        <Badge variant="outline" className="border-[#dcd6ef] bg-[#f6f2fe] text-[#4b3a78]">
                          Draft visit
                        </Badge>
                      ) : visit.followUpRequired ? (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                          Follow-up required
                        </Badge>
                      ) : (
                        <p className="text-sm font-semibold text-[#4b3a78]">Completed</p>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {format(new Date(visit.visitedAt), 'dd MMM yyyy HH:mm')}
                    </p>
                    {visit.linkedReports.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {visit.linkedReports.map((report) => (
                          <div
                            key={report.id}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{report.title}</p>
                                <p className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                                  <span>{getVisitReportTypeLabel(report.reportType)}</span>
                                  <span>{report.status === 'final' ? 'Final' : 'Draft'}</span>
                                  <span>{format(new Date(report.updatedAt), 'dd MMM yyyy HH:mm')}</span>
                                </p>
                                {report.summary ? (
                                  <p className="mt-2 text-sm text-slate-600">{report.summary}</p>
                                ) : null}
                              </div>
                              <Link
                                href={
                                  report.status === 'final'
                                    ? `/api/reports/visit-reports/${report.id}/pdf?mode=view`
                                    : `/reports?sheet=1&reportId=${report.id}`
                                }
                                target={report.status === 'final' ? '_blank' : undefined}
                                className="inline-flex items-center rounded border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
                              >
                                Open report
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {visit.completedActivityKeys.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {visit.completedActivityKeys.map((activityKey) => (
                          <StoreVisitActivitySummary
                            key={`${visit.id}-${activityKey}`}
                            activityKey={activityKey}
                            detailText={visit.completedActivityDetails[activityKey]}
                            payload={visit.completedActivityPayloads[activityKey]}
                            evidenceFiles={visit.evidenceFiles.filter((file) => file.activityKey === activityKey)}
                          />
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

      <Dialog
        open={Boolean(selectedActionIncident)}
        onOpenChange={(open) => {
          if (!open) setSelectedActionIncident(null)
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedActionIncident
                ? `Create Action for ${selectedActionIncident.reference_no}`
                : 'Create Action'}
            </DialogTitle>
          </DialogHeader>
          {selectedActionIncident ? (
            <ActionForm
              incidentId={selectedActionIncident.id}
              profiles={profiles}
              onSuccess={() => setSelectedActionIncident(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <StoreVisitModal
        open={isVisitModalOpen}
        onOpenChange={setIsVisitModalOpen}
        row={visitTrackerRow}
        productCatalog={productCatalog}
        canEdit={canEdit}
        currentUserName={currentUserName}
        visitsAvailable={visitsAvailable}
        visitsUnavailableMessage={visitsUnavailableMessage}
      />

      <StoreInboundEmailDialog
        email={selectedInboundEmail}
        open={Boolean(selectedInboundEmail)}
        onOpenChange={(open) => {
          if (!open) setSelectedInboundEmailId(null)
        }}
        store={{
          id: String(store.id),
          store_name: store.store_name,
          compliance_audit_2_assigned_manager_user_id:
            store.compliance_audit_2_assigned_manager_user_id || null,
        }}
      />

      <ViewActionModal
        action={selectedStoreAction}
        open={Boolean(selectedStoreAction)}
        onOpenChange={(open) => {
          if (!open) setSelectedStoreAction(null)
        }}
        onActionUpdated={() => {
          setSelectedStoreAction(null)
        }}
      />
    </div>
  )
}
