'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Map as MapIcon,
  ShieldAlert,
  Shuffle,
} from 'lucide-react'
import { format } from 'date-fns'

import { getStoreVisitNeedLevelLabel, type StoreVisitNeedLevel } from '@/lib/visit-needs'
import { cn, formatAppDate, getDisplayStoreCode } from '@/lib/utils'

type IncidentPeriod = 'fiscalYear' | 'month' | 'week'

interface SeverityBreakdown {
  low: number
  medium: number
  high: number
  critical: number
  total: number
}

interface DashboardPriorityStore {
  storeId: string
  storeName: string
  storeCode: string | null
  visitNeedScore: number
  visitNeedLevel: StoreVisitNeedLevel
  visitNeedReasons: string[]
  openStoreActionCount: number
  openIncidentCount: number
  lastVisitDate: string | null
  nextPlannedVisitDate: string | null
  followUpRequired: boolean
}

interface DashboardRecentFinding {
  visitId: string
  storeId: string
  storeName: string
  storeCode: string | null
  visitedAt: string
  visitTypeLabel: string
  activityLabel: string | null
  summary: string
  followUpRequired: boolean
  createdByName: string | null
}

interface DashboardPlannedVisit {
  storeId: string
  storeName: string
  storeCode: string | null
  plannedDate: string | null
  managerName: string | null
  purpose: string | null
  purposeNote: string | null
}

interface DashboardTheftReview {
  emailId: string
  storeId: string
  storeName: string
  storeCode: string | null
  subject: string
  summary: string | null
  receivedAt: string | null
}

interface DashboardData {
  openIncidents: number
  underInvestigation: number
  overdueActions: number
  totalStores: number
  incidentBreakdownByPeriod: Record<IncidentPeriod, SeverityBreakdown>
  visitStats: {
    visitsNeeded: number
    urgentStores: number
    followUpRequired: number
    recentlyLogged: number
    randomVisits: number
    plannedRoutes: number
    plannedRoutesNext14Days: number
    potentialTheftReviews: number
  }
  priorityStores: DashboardPriorityStore[]
  plannedVisits: DashboardPlannedVisit[]
  theftReviews: DashboardTheftReview[]
  recentFindings: DashboardRecentFinding[]
  visitsUnavailableMessage: string | null
}

interface DashboardClientProps {
  initialData: DashboardData
}

const INCIDENT_PERIOD_OPTIONS: Array<{ key: IncidentPeriod; label: string; badgeLabel: string }> = [
  { key: 'fiscalYear', label: 'Fiscal Year', badgeLabel: 'FY to Date' },
  { key: 'month', label: 'Month', badgeLabel: 'This Month' },
  { key: 'week', label: 'Week', badgeLabel: 'This Week' },
]

function ProgressBar({
  value,
  colorClass = 'bg-blue-600',
  heightClass = 'h-2',
}: {
  value: number
  colorClass?: string
  heightClass?: string
}) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${heightClass}`}>
      <div
        className={`h-full ${colorClass} transition-all duration-700 ease-out`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function visitNeedClasses(level: StoreVisitNeedLevel): string {
  if (level === 'urgent') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (level === 'needed') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (level === 'monitor') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function formatVisitDate(value: string | null): string {
  return value ? formatAppDate(value) : 'Not recorded'
}

function formatPlannedPurpose(value: string | null): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'General follow-up visit'
  return normalized
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [incidentPeriod, setIncidentPeriod] = useState<IncidentPeriod>('fiscalYear')

  const incidentBreakdown =
    initialData.incidentBreakdownByPeriod?.[incidentPeriod] ||
    initialData.incidentBreakdownByPeriod?.fiscalYear || {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
      total: 0,
    }
  const highSeverityCount = Number(incidentBreakdown.high || 0) + Number(incidentBreakdown.critical || 0)
  const activeIncidentPeriodOption =
    INCIDENT_PERIOD_OPTIONS.find((option) => option.key === incidentPeriod) || INCIDENT_PERIOD_OPTIONS[0]
  const updatedTime = format(new Date(), 'HH:mm')

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="relative overflow-hidden rounded-[28px] tfs-page-hero p-3 text-white sm:p-5 md:rounded-3xl md:p-8">
        <div className="tfs-page-hero-orb-top" />
        <div className="tfs-page-hero-orb-bottom" />

        <div className="tfs-page-hero-body">
          <div className="mb-3 flex flex-col items-start justify-between gap-2 md:mb-8 md:flex-row md:items-center">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c9c2eb] md:text-xs md:font-bold md:tracking-wider">
                <Activity size={14} />
                LP Operations Overview
              </div>
              <h1 className="mb-1 text-[1.7rem] font-semibold tracking-[-0.04em] text-white sm:text-2xl md:text-3xl md:font-bold md:tracking-tight">
                Dashboard
              </h1>
              <p className="max-w-[34rem] text-[12.5px] leading-[1.3] text-white/75 sm:text-sm md:text-sm">
                Live view of loss-prevention visits, store issues, route planning, and recent on-site findings.
              </p>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-row sm:items-center">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-[16px] border px-2.5 py-1 text-center font-mono text-[9px] md:rounded-lg md:px-3 md:py-1.5 md:text-xs tfs-page-hero-pill">
                <Clock size={10} className="md:hidden" />
                <span className="md:hidden">{updatedTime}</span>
                <span className="hidden md:inline">Updated: {updatedTime}</span>
              </span>
              <Link
                href="/visit-tracker"
                className="flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-[18px] bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.14)] transition-colors hover:bg-slate-100 sm:min-h-[44px] sm:w-auto sm:flex-none md:rounded-lg md:px-4 md:py-2 md:text-sm md:font-bold md:shadow-none"
              >
                <ClipboardList size={15} />
                Open Stores
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-6 md:gap-3">
            <div className="col-span-2 flex min-h-[72px] items-center justify-between rounded-[22px] border p-3 tfs-page-hero-glass md:col-span-1 md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/65 md:text-xs md:tracking-wider">
                  Visits Needed
                </p>
                <p className="mt-1 text-lg font-bold leading-none text-amber-300 md:text-2xl">
                  {initialData.visitStats.visitsNeeded}
                </p>
                <p className="mt-1 text-[10px] text-white/65">{initialData.visitStats.urgentStores} urgent right now</p>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 md:h-9 md:w-9">
                <ClipboardList size={18} className="md:hidden" />
                <ClipboardList size={18} className="hidden md:block" />
              </div>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border p-2.5 tfs-page-hero-glass md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-white/65">
                <AlertTriangle size={14} className="text-blue-400" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">Open Incidents</span>
              </div>
              <p className="text-lg font-bold leading-none md:text-2xl">{initialData.openIncidents}</p>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border p-2.5 tfs-page-hero-glass md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-white/65">
                <Clock size={14} className="text-amber-400" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">Overdue Actions</span>
              </div>
              <p className="text-lg font-bold leading-none md:text-2xl">{initialData.overdueActions}</p>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border p-2.5 tfs-page-hero-glass md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-white/65">
                <ShieldAlert size={14} className="text-fuchsia-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">Follow-up Visits</span>
              </div>
              <p className="text-lg font-bold leading-none text-fuchsia-200 md:text-2xl">
                {initialData.visitStats.followUpRequired}
              </p>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border p-2.5 tfs-page-hero-glass md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-white/65">
                <CalendarDays size={14} className="text-cyan-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">Routes Next 14 Days</span>
              </div>
              <p className="text-lg font-bold leading-none text-cyan-200 md:text-2xl">
                {initialData.visitStats.plannedRoutesNext14Days}
              </p>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border p-2.5 tfs-page-hero-glass md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-white/65">
                <CheckCircle2 size={14} className="text-emerald-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">Recently Logged</span>
              </div>
              <p className="text-lg font-bold leading-none text-emerald-200 md:text-2xl">
                {initialData.visitStats.recentlyLogged}
              </p>
            </div>
          </div>
        </div>
      </div>

      {initialData.visitsUnavailableMessage ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 md:px-6">
          {initialData.visitsUnavailableMessage}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-bold text-amber-900 md:text-sm">
              <AlertTriangle size={18} className="text-amber-600" /> Potential Theft Reviews
            </h2>
            <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-amber-700">
              {initialData.theftReviews.length} showing
            </span>
          </div>
          {initialData.theftReviews.length === 0 ? (
            <div className="mt-1 text-xs text-amber-800">
              No theft-review emails are currently flagged.
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {initialData.theftReviews.map((email) => (
                <Link
                  key={email.emailId}
                  href={`/stores/${email.storeId}`}
                  prefetch={false}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-slate-800 hover:bg-amber-50"
                >
                  <span className="font-medium text-slate-900">{email.storeName}</span>
                  <span className="text-slate-500">({getDisplayStoreCode(email.storeCode) || '—'} • {formatVisitDate(email.receivedAt)})</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-5 md:shadow-sm xl:col-span-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <ClipboardList size={18} className="text-emerald-500" /> Visit Signals
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {initialData.totalStores} Stores
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                  <AlertTriangle className="h-4 w-4" />
                  Urgent stores
                </div>
                <p className="mt-2 text-3xl font-bold text-rose-900">{initialData.visitStats.urgentStores}</p>
                <p className="mt-1 text-sm text-rose-700">Highest-pressure stores from current incidents and store actions.</p>
              </div>

              <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-fuchsia-700">
                  <ShieldAlert className="h-4 w-4" />
                  Follow-up required
                </div>
                <p className="mt-2 text-3xl font-bold text-fuchsia-900">{initialData.visitStats.followUpRequired}</p>
                <p className="mt-1 text-sm text-fuchsia-700">Latest visits that still need another return visit logged.</p>
              </div>

              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-700">
                  <MapIcon className="h-4 w-4" />
                  Planned routes
                </div>
                <p className="mt-2 text-3xl font-bold text-cyan-900">{initialData.visitStats.plannedRoutes}</p>
                <p className="mt-1 text-sm text-cyan-700">Live route groups scheduled through the route-planning workflow.</p>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
                  <Shuffle className="h-4 w-4" />
                  Random visits
                </div>
                <p className="mt-2 text-3xl font-bold text-sky-900">{initialData.visitStats.randomVisits}</p>
                <p className="mt-1 text-sm text-sky-700">Stores recently attended through in-area, unplanned LP calls.</p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  Theft reviews
                </div>
                <p className="mt-2 text-3xl font-bold text-amber-900">{initialData.visitStats.potentialTheftReviews}</p>
                <p className="mt-1 text-sm text-amber-700">Potential theft emails awaiting or requiring follow-up review.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-5 md:shadow-sm xl:col-span-4">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <AlertCircle size={18} className="text-red-500" /> Incident Breakdown
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {INCIDENT_PERIOD_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setIncidentPeriod(option.key)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                        incidentPeriod === option.key
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      aria-pressed={incidentPeriod === option.key}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  {incidentBreakdown.total} {activeIncidentPeriodOption.badgeLabel}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                  {initialData.underInvestigation} under investigation
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold text-slate-600">Severity: Low</span>
                  <span className="font-bold">{incidentBreakdown.low}</span>
                </div>
                <ProgressBar
                  value={incidentBreakdown.total > 0 ? (incidentBreakdown.low / incidentBreakdown.total) * 100 : 0}
                  colorClass="bg-slate-400"
                  heightClass="h-3"
                />
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold text-slate-600">Severity: Medium</span>
                  <span className="font-bold text-amber-600">{incidentBreakdown.medium}</span>
                </div>
                <ProgressBar
                  value={incidentBreakdown.total > 0 ? (incidentBreakdown.medium / incidentBreakdown.total) * 100 : 0}
                  colorClass="bg-amber-500"
                  heightClass="h-3"
                />
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold text-slate-600">Severity: High/Critical</span>
                  <span className="font-bold text-red-600">{highSeverityCount}</span>
                </div>
                <ProgressBar
                  value={incidentBreakdown.total > 0 ? (highSeverityCount / incidentBreakdown.total) * 100 : 0}
                  colorClass="bg-red-500"
                  heightClass="h-3"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-5 md:shadow-sm xl:col-span-4">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CalendarDays size={18} className="text-cyan-500" /> Planned Visits
              </h2>
              <span className="rounded bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-700">
                Next up
              </span>
            </div>

            <div className="space-y-3">
              {initialData.plannedVisits.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No planned visits scheduled.
                </div>
              ) : (
                initialData.plannedVisits.map((visit) => (
                  <Link
                    key={`${visit.storeId}-${visit.plannedDate || 'undated'}`}
                    href={`/stores/${visit.storeId}`}
                    prefetch={false}
                    className="group block rounded-[22px] border border-slate-100 p-4 transition-all hover:border-slate-200 hover:bg-slate-50/70 md:rounded-xl"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-800">{visit.storeName}</div>
                        <div className="text-xs font-mono text-slate-400">{getDisplayStoreCode(visit.storeCode) || '—'}</div>
                      </div>
                      <span className="text-xs text-slate-500">{formatVisitDate(visit.plannedDate)}</span>
                    </div>
                    <p className="text-xs font-semibold text-cyan-700">
                      {visit.managerName || 'Unassigned'} plans {formatPlannedPurpose(visit.purpose)}.
                    </p>
                    {visit.purposeNote ? (
                      <p className="mt-1 text-xs text-slate-500">{visit.purposeNote}</p>
                    ) : null}
                  </Link>
                ))
              )}
            </div>

            <div className="mt-4">
              <Link
                href="/route-planning"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#232154] hover:text-[#1c0259]"
              >
                Open Route Planning
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-5 md:shadow-sm xl:col-span-4">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <ShieldAlert size={18} className="text-blue-500" /> Priority Stores
              </h2>
              <span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                Visit need
              </span>
            </div>

            <div className="space-y-3">
              {initialData.priorityStores.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No stores currently need LP follow-up.
                </div>
              ) : (
                initialData.priorityStores.map((store) => (
                  <Link
                    key={store.storeId}
                    href={`/stores/${store.storeId}`}
                    prefetch={false}
                    className="group block rounded-[22px] border border-slate-100 p-4 transition-all hover:border-slate-200 hover:bg-slate-50/70 md:rounded-xl"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-800">{store.storeName}</div>
                        <div className="text-xs font-mono text-slate-400">{getDisplayStoreCode(store.storeCode) || '—'}</div>
                      </div>
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                          visitNeedClasses(store.visitNeedLevel)
                        )}
                      >
                        {getStoreVisitNeedLevelLabel(store.visitNeedLevel)} ({store.visitNeedScore})
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {store.followUpRequired ? (
                        <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 font-semibold text-fuchsia-700">
                          Follow-up required
                        </span>
                      ) : null}
                      <span>{store.openStoreActionCount} open actions</span>
                      <span>{store.openIncidentCount} open incidents</span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      {store.visitNeedReasons.length > 0
                        ? store.visitNeedReasons.join(' • ')
                        : 'Store is being tracked without an active urgent LP driver.'}
                    </p>

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Last visit: {formatVisitDate(store.lastVisitDate)}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#232154]">
                        Open store
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="mt-4">
              <Link
                href="/visit-tracker"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#232154] hover:text-[#1c0259]"
              >
                Open Stores
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-5 md:shadow-sm xl:col-span-4">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CheckCircle2 size={18} className="text-emerald-500" /> Recent On-Site Findings
              </h2>
              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                Latest visits
              </span>
            </div>

            <div className="space-y-3 xl:max-h-[280px] xl:overflow-y-auto xl:pr-1">
              {initialData.recentFindings.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No visit findings have been logged yet.
                </div>
              ) : (
                initialData.recentFindings.map((finding) => (
                  <Link
                    key={finding.visitId}
                    href={`/stores/${finding.storeId}`}
                    prefetch={false}
                    className="group block rounded-[22px] border border-slate-100 p-4 transition-all hover:border-slate-200 hover:bg-slate-50/70 md:rounded-xl"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-800">{finding.storeName}</div>
                        <div className="text-xs font-mono text-slate-400">{getDisplayStoreCode(finding.storeCode) || '—'}</div>
                      </div>
                      <span className="text-xs text-slate-500">{formatVisitDate(finding.visitedAt)}</span>
                    </div>

                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                        {finding.visitTypeLabel}
                      </span>
                      {finding.activityLabel ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                          {finding.activityLabel}
                        </span>
                      ) : null}
                      {finding.followUpRequired ? (
                        <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 font-semibold text-fuchsia-700">
                          Follow-up required
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs leading-relaxed text-slate-600">{finding.summary}</p>

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{finding.createdByName ? `Logged by ${finding.createdByName}` : 'Visit logged'}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#232154]">
                        View store
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
