'use client'

import { useState } from 'react'
import Link from 'next/link'
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
  Loader2,
  Map as MapIcon,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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

function prettifyKey(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function toCountData(counts: Record<string, number> | undefined, limit = 6) {
  return Object.entries(counts || {})
    .map(([key, value]) => ({ name: prettifyKey(key), value: Number(value || 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

function toCombinedTrendData(snapshot: any) {
  const incidentsTrend = Array.isArray(snapshot?.incidentsPage?.monthlyTrend) ? snapshot.incidentsPage.monthlyTrend : []
  const actionsTrend = Array.isArray(snapshot?.actionsPage?.monthlyTrend) ? snapshot.actionsPage.monthlyTrend : []

  const orderedKeys: string[] = []
  const rowMap = new Map<string, { month: string; incidents: number; actions: number; overdueActions: number; riddor: number }>()

  incidentsTrend.forEach((row: any) => {
    const key = String(row?.monthKey || row?.month || `incidents-${orderedKeys.length}`)
    if (!rowMap.has(key)) {
      orderedKeys.push(key)
      rowMap.set(key, {
        month: String(row?.month || key),
        incidents: 0,
        actions: 0,
        overdueActions: 0,
        riddor: 0,
      })
    }

    const existing = rowMap.get(key)!
    existing.incidents = Number(row?.incidents || 0)
    existing.riddor = Number(row?.riddor || 0)
  })

  actionsTrend.forEach((row: any) => {
    const key = String(row?.monthKey || row?.month || `actions-${orderedKeys.length}`)
    if (!rowMap.has(key)) {
      orderedKeys.push(key)
      rowMap.set(key, {
        month: String(row?.month || key),
        incidents: 0,
        actions: 0,
        overdueActions: 0,
        riddor: 0,
      })
    }

    const existing = rowMap.get(key)!
    existing.actions = Number(row?.total || 0)
    existing.overdueActions = Number(row?.overdue || 0)
  })

  return orderedKeys.map((key) => rowMap.get(key)!).slice(-12)
}

function ReportAnalyticsPanel({ snapshot }: { snapshot: any }) {
  const incidents = snapshot?.incidentsPage || {}
  const actions = snapshot?.actionsPage || {}
  const fra = snapshot?.fraTracking || {}
  const risk = snapshot?.predictiveRisk || {}

  const metrics = [
    {
      label: 'Open Incidents',
      value: Number(incidents.openIncidents ?? snapshot?.incidentRisk?.openIncidents ?? 0),
      classes: 'border-blue-200 bg-blue-50 text-blue-800',
    },
    {
      label: 'Open Claims',
      value: Number(incidents?.claims?.open ?? 0),
      classes: 'border-violet-200 bg-violet-50 text-violet-800',
    },
    {
      label: 'Active Actions',
      value: Number(actions.activeActions ?? 0),
      classes: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    },
    {
      label: 'Overdue Actions',
      value: Number(actions.overdueActions ?? snapshot?.combinedActions?.totalOverdue ?? 0),
      classes: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    {
      label: 'FRA Overdue',
      value: Number(fra.overdue ?? 0),
      classes: 'border-rose-200 bg-rose-50 text-rose-800',
    },
    {
      label: 'High Risk Stores',
      value: Number(risk.highRiskCount ?? 0),
      classes: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    },
  ]

  const trendData = toCombinedTrendData(snapshot)
  const priorityData = toCountData(actions.byPriority, 5)
  const severityData = toCountData(incidents.bySeverity, 5)

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-bold text-slate-900">Live Incidents + Actions Analytics</h4>
        <p className="mt-1 text-xs text-slate-500">Sourced from the same datasets used by incidents and actions pages.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div key={metric.label} className={`rounded-lg border p-2.5 ${metric.classes}`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest">{metric.label}</p>
            <p className="mt-1 text-lg font-bold">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Trend: Incidents vs Actions</p>
        <div className="h-52">
          {trendData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs italic text-slate-400">No trend data available</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Line type="monotone" dataKey="incidents" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="actions" stroke="#7c3aed" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="overdueActions" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Action Priority Mix</p>
        <div className="h-44">
          {priorityData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs italic text-slate-400">No action priority data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="value" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Incident Severity Profile</p>
        <div className="h-44">
          {severityData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs italic text-slate-400">No incident severity data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Report Modal Component ---
function ReportModal({
  isOpen,
  onClose,
  content,
  isLoading,
  snapshot,
  generatedAt,
}: {
  isOpen: boolean
  onClose: () => void
  content: string
  isLoading: boolean
  snapshot: any
  generatedAt: string | null
}) {
  if (!isOpen) return null

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .ai-report-content h3 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
          margin-top: 0;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .ai-report-content h3:first-child {
          margin-top: 0;
        }
        .ai-report-content h3::before {
          content: '';
          width: 4px;
          height: 1.25rem;
          background: linear-gradient(to bottom, #3b82f6, #6366f1);
          border-radius: 2px;
        }
        .ai-report-content p {
          color: #475569;
          line-height: 1.7;
          margin-bottom: 1rem;
          font-size: 0.95rem;
        }
        .ai-report-content ul {
          list-style: none;
          padding-left: 0;
          margin: 1rem 0;
        }
        .ai-report-content li {
          color: #475569;
          line-height: 1.7;
          padding-left: 1.5rem;
          position: relative;
          margin-bottom: 0.75rem;
          font-size: 0.95rem;
        }
        .ai-report-content li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: #6366f1;
          font-weight: bold;
          font-size: 1.25rem;
          line-height: 1.4;
        }
        .ai-report-content strong {
          color: #1e293b;
          font-weight: 600;
        }
      `}} />
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="flex h-full w-full flex-col overflow-hidden bg-slate-100">
          <div className="safe-top border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="rounded-lg bg-blue-600 p-1.5">
                  <Sparkles className="h-4 w-4 text-white md:h-5 md:w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-slate-900 md:text-lg">Intelligence Report</h3>
                  <p className="text-xs text-slate-500">
                    Powered by OpenAI
                    {generatedAt ? ` • Generated ${format(new Date(generatedAt), 'dd MMM yyyy HH:mm')}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-2 flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {isLoading ? (
              <div className="flex h-full flex-col items-center justify-center space-y-4 bg-white px-6">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                <p className="text-center text-sm font-medium text-slate-500 md:text-base">
                  Analyzing incidents, actions, claims, and compliance metrics...
                </p>
              </div>
            ) : (
              <div className="grid h-full grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)]">
                <aside className="overflow-y-auto border-b border-slate-200 bg-slate-50 p-4 md:p-5 xl:border-b-0 xl:border-r">
                  <ReportAnalyticsPanel snapshot={snapshot} />
                </aside>
                <main className="overflow-y-auto bg-white p-4 md:p-8">
                  <div
                    className="ai-report-content mx-auto w-full max-w-4xl space-y-4 md:space-y-6"
                    dangerouslySetInnerHTML={{ __html: content }}
                  />
                </main>
              </div>
            )}
          </div>

          <div className="safe-bottom flex justify-end border-t border-slate-200 bg-slate-50 p-4">
            <button
              onClick={onClose}
              className="w-full min-h-[44px] min-w-[140px] rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 md:w-auto"
            >
              Close Report
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// --- Main Client Component ---

interface DashboardClientProps {
  initialData: any
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [data] = useState(initialData)

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
  const lowSeverityCount = Number(severityCounts.low || 0)
  const mediumSeverityCount = Number(severityCounts.medium || 0)
  const highSeverityCount = Number(severityCounts.high || 0) + Number(severityCounts.critical || 0)
  const incidentBreakdownTotal = Number(data.totalIncidents || (lowSeverityCount + mediumSeverityCount + highSeverityCount))

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
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        content={reportContent}
        isLoading={reportLoading}
        snapshot={reportSnapshot}
        generatedAt={reportGeneratedAt}
      />

      <div className="relative overflow-hidden rounded-3xl bg-[#0f172a] p-6 text-white shadow-xl shadow-slate-200/50 md:p-8">
        <div className="absolute right-0 top-0 h-96 w-96 translate-x-1/3 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10">
          <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                <Activity size={14} />
                Compliance Overview
              </div>
              <h1 className="mb-1 text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-sm text-slate-400">
                Real-time view of incidents, audits, and planned operations across your network.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-400">
                Updated: {updatedTime}
              </span>
              <button
                onClick={handleGenerateReport}
                className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100"
              >
                <Download size={16} />
                Generate Report
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
            <div className="col-span-2 flex items-center justify-between rounded-2xl border border-slate-700/50 bg-slate-800/50 p-5 backdrop-blur-sm">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Network Health</p>
                <p className="text-4xl font-black text-emerald-400">{healthScore}%</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <BarChart3 size={24} />
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <AlertTriangle size={14} className="text-blue-400" />
                <span className="text-xs font-bold uppercase">Open Incidents</span>
              </div>
              <p className="text-2xl font-bold">{Number(data.openIncidents || 0)}</p>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Clock size={14} className="text-amber-400" />
                <span className="text-xs font-bold uppercase">Overdue Actions</span>
              </div>
              <p className="text-2xl font-bold">{totalOverdueActions}</p>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <ShieldAlert size={14} className="text-red-400" />
                <span className="text-xs font-bold uppercase">High Risk Stores</span>
              </div>
              <p className="text-2xl font-bold text-red-400">{highRiskStoresCount}</p>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Flame size={14} className="text-orange-400" />
                <span className="text-xs font-bold uppercase">FRA Required</span>
              </div>
              <p className="text-2xl font-bold text-orange-400">{fraRequiredCount}</p>
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
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <AlertCircle size={18} className="text-red-500" /> Incident Breakdown
              </h2>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {incidentBreakdownTotal} Total Active
              </span>
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
