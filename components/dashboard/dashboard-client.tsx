'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Flame,
  Map as MapIcon,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatPercent, getDisplayStoreCode } from '@/lib/utils'

// --- Helper Components ---
function ProgressBar({ value, colorClass = "bg-blue-600", heightClass = "h-2" }: { value: number, colorClass?: string, heightClass?: string }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${heightClass}`}>
      <div
        className={`h-full ${colorClass} transition-all duration-700 ease-out`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

const ReportModal = dynamic(
  () =>
    import('./report-modal').then((mod) => mod.ReportModal),
  { ssr: false }
)

type IncidentPeriod = 'fiscalYear' | 'month' | 'week'

const INCIDENT_PERIOD_OPTIONS: Array<{ key: IncidentPeriod; label: string; badgeLabel: string }> = [
  { key: 'fiscalYear', label: 'Fiscal Year', badgeLabel: 'FY to Date' },
  { key: 'month', label: 'Month', badgeLabel: 'This Month' },
  { key: 'week', label: 'Week', badgeLabel: 'This Week' },
]

// --- Main Client Component ---

interface DashboardClientProps {
  initialData: any
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [data] = useState(initialData)
  const [incidentPeriod, setIncidentPeriod] = useState<IncidentPeriod>('fiscalYear')

  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportContent, setReportContent] = useState('')
  const [reportSnapshot, setReportSnapshot] = useState<any>(null)
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null)

  const handleGenerateReport = async () => {
    setIsReportOpen(true)
    if (!reportContent || !reportSnapshot) {
      setReportLoading(true)
      try {
        const response = await fetch('/api/ai/compliance-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ dashboardData: data }),
        })

        if (!response.ok) {
          throw new Error('Failed to generate report')
        }

        const result = await response.json()
        setReportContent(result.content || '<p>Error generating report. Please check your API configuration.</p>')
        setReportSnapshot(result.snapshot || null)
        setReportGeneratedAt(result.generatedAt || null)
      } catch (error) {
        console.error('Error generating report:', error)
        setReportContent('<p>Error generating report. Please check your API configuration.</p>')
        setReportSnapshot(null)
        setReportGeneratedAt(null)
      } finally {
        setReportLoading(false)
      }
    }
  }

  const plannedRoutes = Array.isArray(data.plannedRoutes) ? data.plannedRoutes : []
  const storesNeedingSecondVisit = Array.isArray(data.storesNeedingSecondVisit) ? data.storesNeedingSecondVisit : []
  const plannedStoreCount = plannedRoutes.reduce(
    (total: number, route: any) => total + (route.stores?.length || route.storeCount || 0),
    0
  )
  const plannedRouteCount = plannedRoutes.length
  const totalOverdueActions = Number(data.combinedActionStats?.totalOverdue ?? data.overdueActions ?? 0)
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((Number(data.auditStats?.totalAuditPercentage || 0)) * 0.65) +
        ((100 - Math.min(totalOverdueActions * 3, 100)) * 0.35)
      )
    )
  )

  const firstAuditRate = Number(data.auditStats?.firstAuditPercentage || 0)
  const secondAuditRate = Number(data.auditStats?.secondAuditPercentage || 0)
  const fullyCompliantRate = Number(data.auditStats?.totalAuditPercentage || 0)
  const totalStores = Number(data.auditStats?.totalStores || 0)
  const firstAuditCount = Number(data.auditStats?.firstAuditsComplete || 0)
  const secondAuditCount = Number(data.auditStats?.secondAuditsComplete || 0)
  const fullyCompliantCount = Number(data.auditStats?.totalAuditsComplete || 0)

  const severityCounts = data.severityCounts || {}
  const incidentBreakdownByPeriod = data.incidentBreakdownByPeriod || {}
  const selectedIncidentBreakdown = incidentBreakdownByPeriod?.[incidentPeriod] || {}
  const lowSeverityCount = Number(selectedIncidentBreakdown.low ?? severityCounts.low ?? 0)
  const mediumSeverityCount = Number(selectedIncidentBreakdown.medium ?? severityCounts.medium ?? 0)
  const highSeverityCount = Number(selectedIncidentBreakdown.high ?? severityCounts.high ?? 0) +
    Number(selectedIncidentBreakdown.critical ?? severityCounts.critical ?? 0)
  const incidentBreakdownTotal = Number(
    selectedIncidentBreakdown.total ??
    data.totalIncidents ??
    (lowSeverityCount + mediumSeverityCount + highSeverityCount)
  )
  const activeIncidentPeriodOption = INCIDENT_PERIOD_OPTIONS.find((option) => option.key === incidentPeriod)

  const highRiskStoresCount = Number(data.complianceForecast?.highRiskCount || 0)
  const fraRequiredCount = Number(data.storesRequiringFRA || 0)
  const fraOverdueCount = Number(data.fraStats?.overdue || 0)
  const updatedTime = format(new Date(), 'HH:mm')

  const daysUntilYearEnd = (() => {
    const now = new Date()
    const endOfYear = new Date(now.getFullYear(), 11, 31)
    return Math.max(0, Math.ceil((endOfYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  })()

  const dueVisits = storesNeedingSecondVisit.map((store: any) => ({
    id: store.id,
    name: store.store_name || 'Unknown Store',
    code: getDisplayStoreCode(store.store_code) || '—',
    status: store.compliance_audit_2_planned_date ? 'Planned' : 'Not Planned',
  }))

  const parseDateOnly = (value: string | null | undefined): Date | null => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    parsed.setHours(0, 0, 0, 0)
    return parsed
  }

  const todayDateOnly = new Date()
  todayDateOnly.setHours(0, 0, 0, 0)

  const dueRoutesCount = plannedRoutes.filter((route: any) => {
    const plannedDate = parseDateOnly(route?.plannedDate)
    return plannedDate ? plannedDate.getTime() <= todayDateOnly.getTime() : false
  }).length
  const upcomingRoutesCount = Math.max(0, plannedRouteCount - dueRoutesCount)

  const nextRoutes = [...plannedRoutes]
    .sort((a: any, b: any) => {
      const aTime = parseDateOnly(a?.plannedDate)?.getTime() || Number.MAX_SAFE_INTEGER
      const bTime = parseDateOnly(b?.plannedDate)?.getTime() || Number.MAX_SAFE_INTEGER
      return aTime - bTime
    })
    .slice(0, 3)

  const topForecastStores = Array.isArray(data.complianceForecast?.stores)
    ? data.complianceForecast.stores.slice(0, 4)
    : []

  return (
    <div className="space-y-6">
      {isReportOpen ? (
        <ReportModal
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          content={reportContent}
          isLoading={reportLoading}
          snapshot={reportSnapshot}
          generatedAt={reportGeneratedAt}
        />
      ) : null}

      <div className="relative overflow-hidden rounded-2xl bg-[#0f172a] p-4 text-white shadow-xl shadow-slate-200/50 sm:p-5 md:rounded-3xl md:p-8">
        <div className="absolute right-0 top-0 h-96 w-96 translate-x-1/3 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10">
          <div className="mb-5 flex flex-col items-start justify-between gap-4 md:mb-8 md:flex-row md:items-center">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                <Activity size={14} />
                Compliance Overview
              </div>
              <h1 className="mb-1 text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
              <p className="text-sm text-slate-400">
                Real-time view of incidents, audits, and planned operations across your network.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-[11px] text-slate-400 md:px-3 md:py-1.5 md:text-xs">
                Updated: {updatedTime}
              </span>
              <button
                onClick={handleGenerateReport}
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100 md:px-4 md:py-2"
              >
                <Download size={16} />
                Generate Report
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-6 md:gap-4">
            <div className="col-span-2 flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm md:rounded-2xl md:p-5">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Network Health</p>
                <p className="text-3xl font-black text-emerald-400 md:text-4xl">{healthScore}%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 md:h-12 md:w-12">
                <BarChart3 size={24} />
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-700/50 bg-slate-800/50 p-3 backdrop-blur-sm md:rounded-2xl md:p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <AlertTriangle size={14} className="text-blue-400" />
                <span className="text-xs font-bold uppercase">Open Incidents</span>
              </div>
              <p className="text-xl font-bold md:text-2xl">{Number(data.openIncidents || 0)}</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-700/50 bg-slate-800/50 p-3 backdrop-blur-sm md:rounded-2xl md:p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Clock size={14} className="text-amber-400" />
                <span className="text-xs font-bold uppercase">Overdue Actions</span>
              </div>
              <p className="text-xl font-bold md:text-2xl">{totalOverdueActions}</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-700/50 bg-slate-800/50 p-3 backdrop-blur-sm md:rounded-2xl md:p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <ShieldAlert size={14} className="text-red-400" />
                <span className="text-xs font-bold uppercase">High Risk Stores</span>
              </div>
              <p className="text-xl font-bold text-red-400 md:text-2xl">{highRiskStoresCount}</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-700/50 bg-slate-800/50 p-3 backdrop-blur-sm md:rounded-2xl md:p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Flame size={14} className="text-orange-400" />
                <span className="text-xs font-bold uppercase">FRA Required</span>
              </div>
              <p className="text-xl font-bold text-orange-400 md:text-2xl">{fraRequiredCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CheckCircle2 size={18} className="text-emerald-500" /> Audit Completion Rates
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {totalStores} Stores Total
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-slate-400">First Audit</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-bold text-slate-800">{formatPercent(firstAuditRate)}</p>
                  <p className="mb-1 font-mono text-xs text-slate-500">{firstAuditCount}/{totalStores}</p>
                </div>
                <ProgressBar value={firstAuditRate} colorClass="bg-emerald-500" />
              </div>

              <div className="space-y-2 border-slate-100 md:border-l md:pl-6">
                <p className="text-xs font-bold uppercase text-slate-400">Second Audit</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-bold text-slate-800">{formatPercent(secondAuditRate)}</p>
                  <p className="mb-1 font-mono text-xs text-slate-500">{secondAuditCount}/{totalStores}</p>
                </div>
                <ProgressBar value={secondAuditRate} colorClass="bg-blue-500" />
              </div>

              <div className="space-y-2 border-slate-100 md:border-l md:pl-6">
                <p className="text-xs font-bold uppercase text-slate-400">Fully Compliant</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-bold text-indigo-600">{formatPercent(fullyCompliantRate)}</p>
                  <p className="mb-1 font-mono text-xs text-slate-500">{fullyCompliantCount}/{totalStores}</p>
                </div>
                <ProgressBar value={fullyCompliantRate} colorClass="bg-indigo-500" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                  {incidentBreakdownTotal} {activeIncidentPeriodOption?.badgeLabel || 'Total Active'}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold text-slate-600">Severity: Low</span>
                  <span className="font-bold">{lowSeverityCount}</span>
                </div>
                <ProgressBar
                  value={incidentBreakdownTotal > 0 ? (lowSeverityCount / incidentBreakdownTotal) * 100 : 0}
                  colorClass="bg-slate-400"
                  heightClass="h-3"
                />
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold text-slate-600">Severity: Medium</span>
                  <span className="font-bold text-amber-600">{mediumSeverityCount}</span>
                </div>
                <ProgressBar
                  value={incidentBreakdownTotal > 0 ? (mediumSeverityCount / incidentBreakdownTotal) * 100 : 0}
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
                  value={incidentBreakdownTotal > 0 ? (highSeverityCount / incidentBreakdownTotal) * 100 : 0}
                  colorClass="bg-red-500"
                  heightClass="h-3"
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-amber-50/50 p-6">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-amber-900">
                <AlertTriangle size={18} className="text-amber-500" /> Compliance Visits Due
              </h2>
              <p className="text-sm text-amber-700">
                {storesNeedingSecondVisit.length} stores still need a second visit this year. Minimum deadline is {daysUntilYearEnd} days.
              </p>
            </div>

            <div className="max-h-[460px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-bold">Store</th>
                    <th className="px-6 py-4 font-bold">Status</th>
                    <th className="px-6 py-4 font-bold">Deadline</th>
                    <th className="px-6 py-4 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dueVisits.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-6 text-center text-sm italic text-slate-500">
                        No due visits at the moment.
                      </td>
                    </tr>
                  ) : (
                    dueVisits.map((visit: any) => (
                      <tr key={visit.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900">{visit.name}</p>
                          <p className="text-xs font-mono text-slate-400">{visit.code}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${
                            visit.status === 'Planned'
                              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                              : 'border-red-100 bg-red-50 text-red-600'
                          }`}>
                            <AlertCircle size={10} />
                            {visit.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono font-medium text-amber-600">{daysUntilYearEnd} days</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href="/route-planning"
                            prefetch={false}
                            className="text-xs font-bold uppercase tracking-wider text-blue-600 transition-colors hover:text-blue-800"
                          >
                            Plan Visit
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <TrendingUp size={18} className="text-blue-500" /> Risk Forecast
              </h2>
              <span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                Next 30 Days
              </span>
            </div>

            <div className="mb-6 flex gap-2">
              <div className="flex-1 rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-[10px] font-bold uppercase text-red-500">High</p>
                <p className="text-xl font-bold text-red-700">{highRiskStoresCount}</p>
              </div>
              <div className="flex-1 rounded-lg border border-amber-100 bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase text-amber-600">Medium</p>
                <p className="text-xl font-bold text-amber-700">{Number(data.complianceForecast?.mediumRiskCount || 0)}</p>
              </div>
              <div className="flex-1 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-[10px] font-bold uppercase text-emerald-600">Low</p>
                <p className="text-xl font-bold text-emerald-700">{Number(data.complianceForecast?.lowRiskCount || 0)}</p>
              </div>
            </div>

            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Attention Required</h3>
            <div className="space-y-3">
              {topForecastStores.length === 0 ? (
                <p className="text-sm italic text-slate-500">No stores currently flagged for elevated risk.</p>
              ) : (
                topForecastStores.map((store: any) => (
                  <Link
                    key={store.storeId}
                    href={store.storeId ? `/stores/${store.storeId}` : '/stores'}
                    prefetch={false}
                    className="group block rounded-xl border border-slate-100 p-3 transition-all hover:border-amber-200 hover:bg-amber-50/30"
                  >
                    <div className="mb-1 flex items-start justify-between">
                      <div>
                        <span className="mr-2 font-bold text-slate-800">{store.storeName}</span>
                        <span className="text-xs font-mono text-slate-400">{store.storeCode || '—'}</span>
                      </div>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-600">
                        {store.probability}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {Array.isArray(store.drivers) && store.drivers.length > 0
                        ? store.drivers.slice(0, 2).join(' • ')
                        : 'No recent audit score • No in-date FRA'}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-bold">
              <MapIcon size={18} className="text-blue-500" /> Planned Rounds
            </h2>

            <div className="mb-6 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Due</p>
                <p className="text-lg font-bold text-red-500">{dueRoutesCount}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Upcoming</p>
                <p className="text-lg font-bold text-blue-600">{upcomingRoutesCount}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Stops</p>
                <p className="text-lg font-bold text-slate-800">{plannedStoreCount}</p>
              </div>
            </div>

            {plannedRouteCount === 0 ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center">
                <CalendarDays size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-800">No planned rounds scheduled.</p>
                <p className="mt-1 text-xs text-emerald-600">You&apos;re all caught up for this week.</p>
                <Link
                  href="/route-planning"
                  prefetch={false}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-emerald-200 bg-white py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  Create New Route
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {nextRoutes.map((route: any) => (
                  <div key={route.key} className="rounded-xl border border-slate-100 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">{route.managerName || 'Unassigned'}</p>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {(route.stores?.length || route.storeCount || 0)} stops
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {route.area || 'Unknown area'} • {route.plannedDate || 'No date'}
                    </p>
                  </div>
                ))}
                <Link
                  href="/route-planning"
                  prefetch={false}
                  className="inline-flex items-center text-sm font-semibold text-blue-600 transition-colors hover:text-blue-800"
                >
                  Open Route Planner
                  <ChevronRight size={14} className="ml-1" />
                </Link>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Additional Signals</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Investigating</p>
                <p className="text-xl font-bold text-slate-900">{Number(data.underInvestigation || 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">FRA Overdue</p>
                <p className="text-xl font-bold text-rose-700">{fraOverdueCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
