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
  Info,
  Map as MapIcon,
  TrendingUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatStoreName } from '@/lib/store-display'
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
  const [riskFilter, setRiskFilter] = useState<'high' | 'medium' | 'low'>('high')
  const [showHealthTooltip, setShowHealthTooltip] = useState(false)

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
  const plannedRouteCount = plannedRoutes.length
  const plannedVisitCount = Number(data.complianceTracking?.secondAuditPlannedCount || 0)
  const completedVisitCount = Number(data.auditStats?.secondAuditsComplete || 0)
  const unplannedVisitCount = Number(data.complianceTracking?.secondAuditUnplannedCount || 0)
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
  const updatedTime = format(new Date(), 'HH:mm')

  const parseDateOnly = (value: string | null | undefined): Date | null => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    parsed.setHours(0, 0, 0, 0)
    return parsed
  }

  const todayDateOnly = new Date()
  todayDateOnly.setHours(0, 0, 0, 0)

  const getRiskBand = (store: any): 'high' | 'medium' | 'low' => {
    const directBand = typeof store?.riskBand === 'string' ? store.riskBand.toLowerCase() : ''
    if (directBand === 'high' || directBand === 'medium' || directBand === 'low') {
      return directBand
    }

    const score = Number(store?.riskScore ?? store?.probability ?? 0)
    if (score >= 70) return 'high'
    if (score >= 45) return 'medium'
    return 'low'
  }

  const forecastStores = Array.isArray(data.complianceForecast?.stores)
    ? data.complianceForecast.stores
    : []
  const filteredForecastStores = forecastStores.filter((store: any) => getRiskBand(store) === riskFilter)
  const selectedRiskLabel = riskFilter.charAt(0).toUpperCase() + riskFilter.slice(1)

  return (
    <div className="space-y-5 md:space-y-6">
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

      <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#112641_0%,#162c4d_52%,#1c3358_100%)] p-3 text-white shadow-[0_18px_38px_rgba(15,23,42,0.18)] sm:p-5 md:rounded-3xl md:bg-[#0f172a] md:p-8 md:shadow-xl md:shadow-slate-200/50">
        <div className="absolute right-0 top-0 h-72 w-72 translate-x-1/3 -translate-y-1/2 rounded-full bg-blue-400/10 blur-3xl md:h-96 md:w-96 md:bg-blue-500/10" />
        <div className="absolute bottom-0 left-0 h-56 w-56 -translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-400/10 blur-3xl md:h-64 md:w-64 md:bg-emerald-500/10" />

        <div className="relative z-10">
          <div className="mb-3 flex flex-col items-start justify-between gap-2 md:mb-8 md:flex-row md:items-center">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300 md:text-xs md:font-bold md:tracking-wider md:text-blue-400">
                <Activity size={14} />
                Compliance Overview
              </div>
              <h1 className="mb-1 text-[1.7rem] font-semibold tracking-[-0.04em] text-white sm:text-2xl md:text-3xl md:font-bold md:tracking-tight">Dashboard</h1>
              <p className="max-w-[28rem] text-[12.5px] leading-[1.3] text-slate-300 sm:text-sm md:text-sm md:text-slate-400">
                Real-time view of incidents, visits, and planned operations across your network.
              </p>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-row sm:items-center">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-[16px] bg-white/8 px-2.5 py-1 text-center font-mono text-[9px] text-slate-300 md:rounded-lg md:bg-slate-800 md:px-3 md:py-1.5 md:text-xs md:text-slate-400">
                <Clock size={10} className="md:hidden" />
                <span className="md:hidden">{updatedTime}</span>
                <span className="hidden md:inline">Updated: {updatedTime}</span>
              </span>
              <button
                onClick={handleGenerateReport}
                className="flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-[18px] bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.14)] transition-colors hover:bg-slate-100 sm:min-h-[44px] sm:w-auto sm:flex-none md:rounded-lg md:px-4 md:py-2 md:text-sm md:font-bold md:shadow-none"
              >
                <Download size={15} />
                Generate Report
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-6 md:gap-4">
            <div className="col-span-2 flex items-center justify-between rounded-[22px] border border-white/10 bg-white/[0.06] p-3 backdrop-blur-sm md:rounded-2xl md:border-slate-700/50 md:bg-slate-800/50 md:p-5">
              <div>
                <div className="mb-0.5 flex items-center gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:text-xs md:tracking-wider">
                    Completed Visits
                  </p>
                  <div
                    className="relative"
                    onMouseEnter={() => setShowHealthTooltip(true)}
                    onMouseLeave={() => setShowHealthTooltip(false)}
                  >
                    <button
                      type="button"
                      onClick={() => setShowHealthTooltip((prev) => !prev)}
                      onFocus={() => setShowHealthTooltip(true)}
                      onBlur={() => setShowHealthTooltip(false)}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 bg-slate-900/80 text-slate-300 transition-colors hover:border-blue-400 hover:text-blue-300"
                      aria-label="Explain planned visits"
                      aria-expanded={showHealthTooltip}
                    >
                      <Info size={11} />
                    </button>
                    {showHealthTooltip ? (
                      <div
                        role="tooltip"
                        className="absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-slate-600 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200 shadow-lg"
                      >
                        Completed visits count stores that have already received their follow-up compliance visit.
                      </div>
                    ) : null}
                  </div>
                </div>
                <p className="text-[1.85rem] font-black leading-none text-emerald-400 md:text-4xl">{completedVisitCount}</p>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 md:h-12 md:w-12">
                <CalendarDays size={18} className="md:hidden" />
                <CalendarDays size={24} className="hidden md:block" />
              </div>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.06] p-2.5 backdrop-blur-sm md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:border-slate-700/50 md:bg-slate-800/50 md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-400">
                <AlertTriangle size={14} className="text-blue-400" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">Open Incidents</span>
              </div>
              <p className="text-lg font-bold leading-none md:text-2xl">{Number(data.openIncidents || 0)}</p>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.06] p-2.5 backdrop-blur-sm md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:border-slate-700/50 md:bg-slate-800/50 md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-400">
                <Clock size={14} className="text-amber-400" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">Overdue Actions</span>
              </div>
              <p className="text-lg font-bold leading-none md:text-2xl">{totalOverdueActions}</p>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.06] p-2.5 backdrop-blur-sm md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:border-slate-700/50 md:bg-slate-800/50 md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-400">
                <TrendingUp size={14} className="text-emerald-400" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">High Risk Stores</span>
              </div>
              <p className="text-lg font-bold leading-none text-emerald-300 md:text-2xl">{highRiskStoresCount}</p>
            </div>

            <div className="flex min-h-[60px] items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.06] p-2.5 backdrop-blur-sm md:min-h-0 md:flex-col md:items-start md:justify-between md:rounded-2xl md:border-slate-700/50 md:bg-slate-800/50 md:p-4">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-400">
                <MapIcon size={14} className="text-cyan-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] md:text-xs md:tracking-normal">Planned Routes</span>
              </div>
              <p className="text-lg font-bold leading-none text-cyan-300 md:text-2xl">{plannedRouteCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CheckCircle2 size={18} className="text-emerald-500" /> Visit Activity
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {totalStores} Stores Total
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-slate-400">Completed Visits</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-bold text-slate-800">{completedVisitCount}</p>
                  <p className="mb-1 font-mono text-xs text-slate-500">{totalStores} total stores</p>
                </div>
                <ProgressBar
                  value={totalStores > 0 ? (completedVisitCount / totalStores) * 100 : 0}
                  colorClass="bg-emerald-500"
                />
              </div>

              <div className="space-y-2 border-slate-100 md:border-l md:pl-6">
                <p className="text-xs font-bold uppercase text-slate-400">Planned Visits</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-bold text-slate-800">{plannedVisitCount}</p>
                  <p className="mb-1 font-mono text-xs text-slate-500">scheduled now</p>
                </div>
                <ProgressBar
                  value={totalStores > 0 ? (plannedVisitCount / totalStores) * 100 : 0}
                  colorClass="bg-blue-500"
                />
              </div>

              <div className="space-y-2 border-slate-100 md:border-l md:pl-6">
                <p className="text-xs font-bold uppercase text-slate-400">Unplanned Stores</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-bold text-indigo-600">{unplannedVisitCount}</p>
                  <p className="mb-1 font-mono text-xs text-slate-500">need scheduling</p>
                </div>
                <ProgressBar
                  value={totalStores > 0 ? (unplannedVisitCount / totalStores) * 100 : 0}
                  colorClass="bg-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
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

        </div>

        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <TrendingUp size={18} className="text-blue-500" /> Risk Forecast
              </h2>
              <span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                Next 30 Days
              </span>
            </div>

            <div className="mb-6 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRiskFilter('high')}
                className={`flex-1 rounded-lg border p-3 text-left transition-all ${
                  riskFilter === 'high'
                    ? 'border-red-300 bg-red-100 ring-2 ring-red-200'
                    : 'border-red-100 bg-red-50 hover:border-red-200'
                }`}
                aria-pressed={riskFilter === 'high'}
              >
                <p className="text-[10px] font-bold uppercase text-red-500">High</p>
                <p className="text-xl font-bold text-red-700">{highRiskStoresCount}</p>
              </button>
              <button
                type="button"
                onClick={() => setRiskFilter('medium')}
                className={`flex-1 rounded-lg border p-3 text-left transition-all ${
                  riskFilter === 'medium'
                    ? 'border-amber-300 bg-amber-100 ring-2 ring-amber-200'
                    : 'border-amber-100 bg-amber-50 hover:border-amber-200'
                }`}
                aria-pressed={riskFilter === 'medium'}
              >
                <p className="text-[10px] font-bold uppercase text-amber-600">Medium</p>
                <p className="text-xl font-bold text-amber-700">{Number(data.complianceForecast?.mediumRiskCount || 0)}</p>
              </button>
              <button
                type="button"
                onClick={() => setRiskFilter('low')}
                className={`flex-1 rounded-lg border p-3 text-left transition-all ${
                  riskFilter === 'low'
                    ? 'border-emerald-300 bg-emerald-100 ring-2 ring-emerald-200'
                    : 'border-emerald-100 bg-emerald-50 hover:border-emerald-200'
                }`}
                aria-pressed={riskFilter === 'low'}
              >
                <p className="text-[10px] font-bold uppercase text-emerald-600">Low</p>
                <p className="text-xl font-bold text-emerald-700">{Number(data.complianceForecast?.lowRiskCount || 0)}</p>
              </button>
            </div>

            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              {selectedRiskLabel} Risk Stores
            </h3>
            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {filteredForecastStores.length === 0 ? (
                <p className="text-sm italic text-slate-500">No {riskFilter}-risk stores in this forecast.</p>
              ) : (
                filteredForecastStores.map((store: any) => {
                  const band = getRiskBand(store)
                  const scoreBadgeClass = band === 'high'
                    ? 'bg-red-100 text-red-600'
                    : band === 'medium'
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-emerald-100 text-emerald-700'
                  const hoverClass = band === 'high'
                    ? 'hover:border-red-200 hover:bg-red-50/30'
                    : band === 'medium'
                      ? 'hover:border-amber-200 hover:bg-amber-50/30'
                      : 'hover:border-emerald-200 hover:bg-emerald-50/30'

                  return (
                    <Link
                      key={store.storeId}
                      href={store.storeId ? `/stores/${store.storeId}` : '/stores'}
                      prefetch={false}
                      className={`group block rounded-[22px] border border-slate-100 p-3.5 transition-all md:rounded-xl md:p-3 ${hoverClass}`}
                    >
                      <div className="mb-1 flex items-start justify-between">
                        <div>
                          <span className="mr-2 font-bold text-slate-800">{formatStoreName(store.storeName)}</span>
                          <span className="text-xs font-mono text-slate-400">{store.storeCode || '—'}</span>
                        </div>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${scoreBadgeClass}`}>
                          {store.probability}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {Array.isArray(store.drivers) && store.drivers.length > 0
                          ? store.drivers.slice(0, 2).join(' • ')
                          : 'No recent visit or action drivers available'}
                      </p>
                    </Link>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)] md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Additional Signals</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[22px] border border-slate-100 bg-slate-50 p-3.5 md:rounded-lg md:p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Investigating</p>
                <p className="text-xl font-bold text-slate-900">{Number(data.underInvestigation || 0)}</p>
              </div>
              <div className="rounded-[22px] border border-slate-100 bg-slate-50 p-3.5 md:rounded-lg md:p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Planned Routes</p>
                <p className="text-xl font-bold text-rose-700">{plannedRouteCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
