'use client'

import Link from 'next/link'
import { useState } from 'react'
import { format } from 'date-fns'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Mail,
  Route,
  ShieldAlert,
} from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

interface DashboardStocktakeReview {
  emailId: string
  storeId: string
  storeName: string
  storeCode: string | null
  subject: string
  summary: string | null
  receivedAt: string | null
}

interface DashboardQueueReviewCase {
  caseId: string
  storeId: string
  storeName: string
  storeCode: string | null
  caseType: string
  summary: string | null
  updatedAt: string
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
  stocktakeReviews: DashboardStocktakeReview[]
  queueReviews: DashboardQueueReviewCase[]
  recentFindings: DashboardRecentFinding[]
  visitsUnavailableMessage: string | null
}

interface DashboardClientProps {
  initialData: DashboardData
}

const INCIDENT_PERIOD_OPTIONS: Array<{ key: IncidentPeriod; label: string }> = [
  { key: 'fiscalYear', label: 'FY to date' },
  { key: 'month', label: 'This month' },
  { key: 'week', label: 'This week' },
]

function toneClass(tone: 'critical' | 'warning' | 'info' | 'success' | 'neutral') {
  if (tone === 'critical') return 'tone-critical'
  if (tone === 'warning') return 'tone-warning'
  if (tone === 'info') return 'tone-info'
  if (tone === 'success') return 'tone-success'
  return 'tone-neutral'
}

function needTone(level: StoreVisitNeedLevel): 'critical' | 'warning' | 'info' | 'success' {
  if (level === 'urgent') return 'critical'
  if (level === 'needed') return 'warning'
  if (level === 'monitor') return 'info'
  return 'success'
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

function formatCaseTypeLabel(value: string): string {
  return String(value || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function ProgressStrip({
  value,
  tone,
}: {
  value: number
  tone: 'critical' | 'warning' | 'info' | 'success' | 'neutral'
}) {
  const fillClass =
    tone === 'critical'
      ? 'bg-critical'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'info'
          ? 'bg-info'
          : tone === 'success'
            ? 'bg-success'
            : 'bg-ink-muted'

  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
      <div
        className={cn('h-full rounded-full transition-all duration-500', fillClass)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function EmptyState({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-subtle/72 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{body}</p>
    </div>
  )
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

  const updatedTime = format(new Date(), 'HH:mm')
  const reviewItems = [...initialData.theftReviews, ...initialData.stocktakeReviews]
  const reviewQueueCount = initialData.queueReviews.length + reviewItems.length
  const severityRows = [
    { label: 'Critical', value: incidentBreakdown.critical, tone: 'critical' as const },
    { label: 'High', value: incidentBreakdown.high, tone: 'warning' as const },
    { label: 'Medium', value: incidentBreakdown.medium, tone: 'info' as const },
    { label: 'Low', value: incidentBreakdown.low, tone: 'neutral' as const },
  ]
  const kpis = [
    {
      label: 'Visits needed',
      value: initialData.visitStats.visitsNeeded,
      note: `${initialData.visitStats.urgentStores} urgent`,
      icon: ClipboardList,
      tone: 'warning' as const,
    },
    {
      label: 'Open incidents',
      value: initialData.openIncidents,
      note: `${initialData.underInvestigation} under investigation`,
      icon: AlertTriangle,
      tone: 'critical' as const,
    },
    {
      label: 'Overdue actions',
      value: initialData.overdueActions,
      note: `${initialData.visitStats.followUpRequired} follow-ups required`,
      icon: Clock3,
      tone: 'warning' as const,
    },
    {
      label: 'Reviews queued',
      value: reviewQueueCount,
      note: `${initialData.queueReviews.length} from case queue`,
      icon: Mail,
      tone: 'info' as const,
    },
    {
      label: 'Planned routes',
      value: initialData.visitStats.plannedRoutes,
      note: `${initialData.visitStats.plannedRoutesNext14Days} in 14 days`,
      icon: Route,
      tone: 'success' as const,
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="flex flex-col gap-4 rounded-[1.75rem] border border-line bg-surface-raised px-4 py-4 shadow-panel sm:px-5 lg:flex-row lg:items-end lg:justify-between md:px-6 md:py-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-subtle px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            <Activity className="h-3.5 w-3.5" />
            Command Centre
          </div>
          <h1 className="mt-3 text-[1.8rem] font-semibold tracking-[-0.04em] text-foreground md:text-[2.1rem]">
            Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft md:text-base">
            Focus the next store visit, investigation, review, and route decision from one control surface.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-subtle px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
          <span className="h-2 w-2 rounded-full bg-success" />
          Updated {updatedTime}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon

          return (
            <div key={kpi.label} className="app-panel rounded-[1.35rem] px-4 py-4">
              <div className={cn('inline-flex rounded-full border px-2 py-1', toneClass(kpi.tone))}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{kpi.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{kpi.value}</p>
              <p className="mt-1 text-sm text-ink-soft">{kpi.note}</p>
            </div>
          )
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr,1.35fr,0.95fr]">
        <div className="app-panel rounded-[1.5rem] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Priority queues</h2>
              <p className="text-sm text-ink-soft">Stores and reviews demanding action first.</p>
            </div>
            <Link href="/visit-tracker" className="text-sm font-semibold text-primary hover:underline">
              Open queue
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {initialData.priorityStores.length === 0 ? (
              <EmptyState title="No urgent stores" body="Priority store drivers will appear here when visits or follow-ups are needed." />
            ) : (
              initialData.priorityStores.slice(0, 5).map((store) => (
                <Link
                  key={store.storeId}
                  href={`/visit-tracker?storeId=${encodeURIComponent(store.storeId)}`}
                  className="block rounded-xl border border-line bg-surface-raised px-4 py-3 transition-colors hover:bg-surface-subtle"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{store.storeName}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {getDisplayStoreCode(store.storeCode) || 'No code'} • {store.visitNeedReasons[0] || getStoreVisitNeedLevelLabel(store.visitNeedLevel)}
                      </p>
                    </div>
                    <span className={cn('inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]', toneClass(needTone(store.visitNeedLevel)))}>
                      {store.visitNeedScore}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-soft">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">Actions</p>
                      <p className="mt-1 font-semibold text-foreground">{store.openStoreActionCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">Incidents</p>
                      <p className="mt-1 font-semibold text-foreground">{store.openIncidentCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">Last visit</p>
                      <p className="mt-1 font-semibold text-foreground">{formatVisitDate(store.lastVisitDate)}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="mt-5 rounded-xl border border-line bg-surface-subtle/72 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Reviews waiting</p>
                <p className="text-sm text-ink-soft">Queue and inbound items currently waiting for review.</p>
              </div>
              <Link href="/queue" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Review <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {initialData.queueReviews.slice(0, 3).map((review) => (
                <Link
                  key={review.caseId}
                  href="/queue"
                  className="block rounded-lg border border-line bg-surface-raised px-3 py-2.5"
                >
                  <p className="text-sm font-semibold text-foreground">{review.storeName}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{formatCaseTypeLabel(review.caseType)}</p>
                </Link>
              ))}
              {initialData.queueReviews.length === 0 && reviewItems.length === 0 ? (
                <p className="text-sm text-ink-soft">No review items are waiting right now.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="app-panel rounded-[1.5rem] p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Risk + activity</h2>
              <p className="text-sm text-ink-soft">Current severity mix and latest store intelligence.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {INCIDENT_PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setIncidentPeriod(option.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
                    incidentPeriod === option.key
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-line bg-surface-raised text-ink-soft hover:bg-surface-subtle'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-raised p-4">
              <p className="text-sm font-semibold text-foreground">Severity breakdown</p>
              <div className="mt-3 space-y-3">
                {severityRows.map((row) => (
                  <div key={row.label}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="text-sm text-ink-soft">{row.label}</span>
                      <span className="text-sm font-semibold text-foreground">{row.value}</span>
                    </div>
                    <ProgressStrip
                      value={incidentBreakdown.total > 0 ? (row.value / incidentBreakdown.total) * 100 : 0}
                      tone={row.tone}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-surface-subtle px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">Open</p>
                  <p className="mt-1 font-semibold text-foreground">{initialData.openIncidents}</p>
                </div>
                <div className="rounded-lg bg-surface-subtle px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">Investigating</p>
                  <p className="mt-1 font-semibold text-foreground">{initialData.underInvestigation}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Recent findings</p>
                <Link href="/activity" className="text-sm font-semibold text-primary hover:underline">
                  Activity
                </Link>
              </div>
              <div className="mt-3 space-y-3">
                {initialData.recentFindings.length === 0 ? (
                  <EmptyState title="No recent findings" body="Latest visit evidence and findings will surface here." />
                ) : (
                  initialData.recentFindings.slice(0, 4).map((finding) => (
                    <Link
                      key={finding.visitId}
                      href={`/visit-tracker?storeId=${encodeURIComponent(finding.storeId)}`}
                      className="block rounded-lg border border-line bg-surface-subtle/72 px-3 py-3 transition-colors hover:bg-surface-subtle"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{finding.storeName}</p>
                        <span className="text-[11px] text-ink-muted">{formatVisitDate(finding.visitedAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {finding.activityLabel || finding.visitTypeLabel}
                        {finding.createdByName ? ` • ${finding.createdByName}` : ''}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{finding.summary}</p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="app-panel rounded-[1.5rem] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Planned visits</h2>
              <p className="text-sm text-ink-soft">Upcoming activity and route commitments.</p>
            </div>
            <Link href="/route-planning" className="text-sm font-semibold text-primary hover:underline">
              Routes
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-success" />
                Next 14 days
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                {initialData.visitStats.plannedRoutesNext14Days}
              </p>
              <p className="mt-1 text-sm text-ink-soft">Active route stops already scheduled.</p>
            </div>

            <div className="rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldAlert className="h-4 w-4 text-warning" />
                Follow-up visits
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                {initialData.visitStats.followUpRequired}
              </p>
              <p className="mt-1 text-sm text-ink-soft">Stores still needing follow-up handling.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {initialData.plannedVisits.length === 0 ? (
              <EmptyState title="No planned visits" body="Scheduled visits will appear here once routes and visits are logged." />
            ) : (
              initialData.plannedVisits.slice(0, 5).map((visit) => (
                <Link
                  key={`${visit.storeId}-${visit.plannedDate || 'unscheduled'}`}
                  href={`/visit-tracker?storeId=${encodeURIComponent(visit.storeId)}`}
                  className="block rounded-xl border border-line bg-surface-raised px-4 py-3 transition-colors hover:bg-surface-subtle"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{visit.storeName}</p>
                      <p className="text-xs text-ink-muted">
                        {getDisplayStoreCode(visit.storeCode) || 'No code'}
                        {visit.managerName ? ` • ${visit.managerName}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full border border-success/20 bg-success-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-success">
                      {visit.plannedDate ? formatVisitDate(visit.plannedDate) : 'Pending'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-soft">{formatPlannedPurpose(visit.purpose)}</p>
                  {visit.purposeNote ? <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{visit.purposeNote}</p> : null}
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="app-panel rounded-[1.6rem] p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">What needs attention today</h2>
            <p className="text-sm text-ink-soft">One workspace for stores, incidents, reviews, and route signals.</p>
          </div>
          <Link href="/reports" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Open reports <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <Tabs defaultValue="stores" className="mt-4">
          <TabsList className="w-full justify-start overflow-x-auto md:w-auto">
            <TabsTrigger value="stores">Stores</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="routes">Routes</TabsTrigger>
          </TabsList>

          <TabsContent value="stores">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {initialData.priorityStores.slice(0, 6).map((store) => (
                <Link
                  key={store.storeId}
                  href={`/visit-tracker?storeId=${encodeURIComponent(store.storeId)}`}
                  className="rounded-xl border border-line bg-surface-raised px-4 py-4 transition-colors hover:bg-surface-subtle"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{store.storeName}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {getDisplayStoreCode(store.storeCode) || 'No code'}
                      </p>
                    </div>
                    <span className={cn('rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]', toneClass(needTone(store.visitNeedLevel)))}>
                      {getStoreVisitNeedLevelLabel(store.visitNeedLevel)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-ink-soft">
                    {store.visitNeedReasons.join(' • ') || 'Visit attention required.'}
                  </p>
                </Link>
              ))}
              {initialData.priorityStores.length === 0 ? (
                <EmptyState title="No store actions queued" body="Store visit priorities will show here once action is required." />
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="incidents">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <p className="text-sm font-semibold text-foreground">Open incidents</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{initialData.openIncidents}</p>
                <p className="mt-1 text-sm text-ink-soft">Live operational risk still being worked.</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <p className="text-sm font-semibold text-foreground">Under investigation</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{initialData.underInvestigation}</p>
                <p className="mt-1 text-sm text-ink-soft">Cases actively progressing through review.</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <p className="text-sm font-semibold text-foreground">Overdue actions</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{initialData.overdueActions}</p>
                <p className="mt-1 text-sm text-ink-soft">Action items already beyond target date.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reviews">
            <div className="grid gap-3 md:grid-cols-2">
              {initialData.queueReviews.map((review) => (
                <Link
                  key={review.caseId}
                  href="/queue"
                  className="rounded-xl border border-line bg-surface-raised px-4 py-4 transition-colors hover:bg-surface-subtle"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{review.storeName}</p>
                    <span className="rounded-full border border-warning/20 bg-warning-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
                      Queue
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{formatCaseTypeLabel(review.caseType)}</p>
                  {review.summary ? <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{review.summary}</p> : null}
                </Link>
              ))}
              {reviewItems.map((review) => (
                <Link
                  key={review.emailId}
                  href="/inbound-emails"
                  className="rounded-xl border border-line bg-surface-raised px-4 py-4 transition-colors hover:bg-surface-subtle"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{review.storeName}</p>
                    <span className="rounded-full border border-info/20 bg-info-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-info">
                      Review
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{review.subject}</p>
                  {review.summary ? <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{review.summary}</p> : null}
                </Link>
              ))}
              {initialData.queueReviews.length === 0 && reviewItems.length === 0 ? (
                <EmptyState title="No queued reviews" body="Queue or inbound review work will surface here when triage is needed." />
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="routes">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <p className="text-sm font-semibold text-foreground">Planned routes</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{initialData.visitStats.plannedRoutes}</p>
                <p className="mt-1 text-sm text-ink-soft">Route sequences currently on the board.</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <p className="text-sm font-semibold text-foreground">Recent visits</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{initialData.visitStats.recentlyLogged}</p>
                <p className="mt-1 text-sm text-ink-soft">Visit activity logged recently across the estate.</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <p className="text-sm font-semibold text-foreground">Random visits</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{initialData.visitStats.randomVisits}</p>
                <p className="mt-1 text-sm text-ink-soft">Random-area visits recorded in the current cycle.</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {initialData.visitsUnavailableMessage ? (
        <section className="rounded-xl border border-warning/20 bg-warning-soft px-4 py-4 text-warning">
          <p className="font-semibold">Visit tracker data is not fully available.</p>
          <p className="mt-1 text-sm">{initialData.visitsUnavailableMessage}</p>
        </section>
      ) : null}
    </div>
  )
}
