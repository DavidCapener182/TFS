'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, TrendingUp, Clock, AlertCircle, Store, FileCheck, Sparkles, X, Loader2, Calendar, Flame, ShieldCheck, ArrowUpRight } from 'lucide-react'
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
import { ComplianceVisitsTracking } from '@/components/dashboard/compliance-visits-tracking'
import { PlannedRounds } from '@/components/dashboard/planned-rounds'
import { formatPercent } from '@/lib/utils'

// --- Helper Components ---

function MetricCard({ title, value, icon: Icon, colorClass, bgClass, href, accentClass }: any) {
  const cardContent = (
    <Card className={`relative overflow-hidden flex flex-row items-center justify-between p-4 md:p-5 bg-white/95 shadow-sm border-slate-200 transition-all hover:shadow-md hover:-translate-y-0.5 ${href ? 'cursor-pointer' : ''}`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${accentClass || 'bg-slate-200'}`} />
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{title}</span>
        <span className="text-2xl md:text-[1.75rem] leading-tight font-bold text-slate-900">{value}</span>
      </div>
      <div className={`h-10 w-10 md:h-11 md:w-11 rounded-xl ${bgClass} flex items-center justify-center transition-colors flex-shrink-0 ml-2`}>
        <Icon className={`h-5 w-5 md:h-6 md:w-6 ${colorClass}`} />
      </div>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        {cardContent}
      </Link>
    )
  }

  return cardContent
}

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

function LabeledProgressBar({ label, value, total, colorClass }: { label: string, value: number, total: number, colorClass: string }) {
  const percentage = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 capitalize">{label.replace(/_/g, ' ')}</span>
        <span className="text-xs font-bold text-slate-500">{value}</span>
      </div>
      <ProgressBar value={percentage} colorClass={colorClass} heightClass="h-1.5" />
    </div>
  )
}

function HeroStatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
      <p className="text-[10px] uppercase tracking-widest text-slate-300">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
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
  
  // AI State
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportContent, setReportContent] = useState("")
  const [reportSnapshot, setReportSnapshot] = useState<any>(null)
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null)

  const handleGenerateReport = async () => {
    setIsReportOpen(true)
    if (!reportContent || !reportSnapshot) { // Only generate if not already generated this session
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

  const plannedStoreCount = data.plannedRoutes?.reduce(
    (total: number, route: any) => total + (route.stores?.length || route.storeCount || 0),
    0
  ) || 0
  const plannedRouteCount = data.plannedRoutes?.length || 0
  const healthScore = Math.round(((data.auditStats?.totalAuditPercentage || 0) * 0.65) + ((100 - Math.min(data.overdueActions * 3, 100)) * 0.35))
  const priorityAlerts = (data.overdueActions || 0) + (data.highCritical || 0)
  const topForecastStores = data.complianceForecast?.stores?.slice(0, 5) || []

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      
      <ReportModal 
        isOpen={isReportOpen} 
        onClose={() => setIsReportOpen(false)} 
        content={reportContent} 
        isLoading={reportLoading} 
        snapshot={reportSnapshot}
        generatedAt={reportGeneratedAt}
      />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 sm:p-6 md:p-7 shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Compliance Overview
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
              Real-time view of incidents, audits, and planned operations across your store network.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
            <button
              onClick={handleGenerateReport}
              className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-slate-900 shadow-sm font-medium transition-all hover:bg-slate-100 active:scale-[0.98] min-h-[44px]"
            >
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span className="hidden sm:inline">Generate report</span>
              <span className="sm:hidden">Generate report</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
            </button>
            <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-center text-xs font-medium text-slate-200 min-h-[44px] flex items-center justify-center">
              Updated: {format(new Date(), 'HH:mm')}
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <HeroStatPill label="Health Score" value={`${healthScore}%`} />
          <HeroStatPill label="Priority Alerts" value={priorityAlerts} />
          <HeroStatPill label="Planned Stores" value={plannedStoreCount} />
          <HeroStatPill label="Routes Planned" value={plannedRouteCount} />
        </div>
      </div>

      {/* KPI Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Risk Snapshot</h2>
        </div>
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-5">
        <MetricCard 
          title="Open Incidents" 
          value={data.openIncidents} 
          icon={AlertTriangle} 
          colorClass="text-blue-600" 
          bgClass="bg-blue-50" 
          accentClass="bg-gradient-to-r from-blue-500 to-cyan-500"
        />
        <MetricCard 
          title="Investigating" 
          value={data.underInvestigation} 
          icon={TrendingUp} 
          colorClass="text-purple-600" 
          bgClass="bg-purple-50" 
          accentClass="bg-gradient-to-r from-indigo-500 to-violet-500"
        />
        <MetricCard 
          title="Overdue Actions" 
          value={data.overdueActions} 
          icon={Clock} 
          colorClass="text-orange-600" 
          bgClass="bg-orange-50" 
          accentClass="bg-gradient-to-r from-orange-500 to-amber-500"
        />
        <MetricCard 
          title="High Risk (30d)" 
          value={data.highCritical} 
          icon={AlertCircle} 
          colorClass="text-rose-600" 
          bgClass="bg-rose-50" 
          accentClass="bg-gradient-to-r from-rose-500 to-red-500"
        />
        <MetricCard 
          title="Stores Requiring FRA" 
          value={data.storesRequiringFRA || 0} 
          icon={Flame} 
          colorClass="text-orange-600" 
          bgClass="bg-orange-50"
          accentClass="bg-gradient-to-r from-amber-500 to-orange-500"
          href="/fire-risk-assessment"
        />
      </div>
      </div>

      {data.complianceForecast && (
        <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-slate-50/60 px-4 py-4 md:px-6 md:py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 md:text-base">
                <TrendingUp className="h-4 w-4 text-indigo-600" />
                Compliance Forecast (Next 30 Days)
              </CardTitle>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                avg risk {data.complianceForecast.avgRiskScore}%
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 md:p-5">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">High Risk</p>
                <p className="text-lg font-bold text-rose-800">{data.complianceForecast.highRiskCount}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Medium</p>
                <p className="text-lg font-bold text-amber-800">{data.complianceForecast.mediumRiskCount}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Low</p>
                <p className="text-lg font-bold text-emerald-800">{data.complianceForecast.lowRiskCount}</p>
              </div>
            </div>

            {topForecastStores.length > 0 ? (
              <div className="space-y-2">
                {topForecastStores.map((store: any) => (
                  <div key={store.storeId} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {store.storeName}
                        {store.storeCode ? <span className="ml-1 text-slate-500">({store.storeCode})</span> : null}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          store.riskBand === 'high'
                            ? 'border border-rose-200 bg-rose-50 text-rose-700'
                            : store.riskBand === 'medium'
                            ? 'border border-amber-200 bg-amber-50 text-amber-700'
                            : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {store.probability}% risk
                      </span>
                    </div>
                    {store.drivers?.length > 0 && (
                      <p className="mt-1 text-xs text-slate-600">
                        {store.drivers[0]}
                        {store.drivers[1] ? ` • ${store.drivers[1]}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-slate-500">No forecast data available.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bento Grid: Planned Visits, Audit Completion, Top Stores */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {/* Planned Visits - Small card */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm md:col-span-1 h-[180px]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-300/35 blur-2xl" />
          <div className="pb-1.5 px-3 pt-3 relative z-10">
            <h3 className="text-emerald-900 flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4" />
              Planned Visits
            </h3>
          </div>
          <div className="px-3 pb-3 relative z-10">
            <div className="flex flex-col gap-1.5">
              <p className="text-3xl font-bold text-emerald-900">
                {plannedStoreCount}
              </p>
              <p className="text-xs text-emerald-700">
                {plannedStoreCount === 1 ? 'store' : 'stores'} with planned visits
              </p>
              <p className="text-sm font-semibold text-emerald-700 mt-1">
                {plannedRouteCount} {plannedRouteCount === 1 ? 'route' : 'routes'} planned
              </p>
            </div>
          </div>
        </div>

        {/* Audit Completion Rates - Large card spanning 2 columns */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm md:col-span-2 lg:col-span-2 h-[180px] flex flex-col">
          <div className="pb-1.5 px-3 pt-3 border-b border-slate-100/80">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <h3 className="text-sm font-semibold text-slate-800">Audit Completion Rates</h3>
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {data.auditStats.totalStores} stores
              </span>
            </div>
          </div>
          <div className="px-3 pb-3 pt-2 flex-1 overflow-y-auto">
            <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
              {/* First Audit */}
              <div className="flex h-full flex-col p-2.5 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200 hover:border-emerald-300 transition-colors">
                <div className="min-h-[2rem]">
                  <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">First Audit</span>
                  <p className="text-[10px] leading-4 text-slate-400">Audit 1 completion</p>
                </div>
                <div className="mt-1 flex items-end justify-between">
                  <span className="text-2xl font-bold text-slate-900">{formatPercent(data.auditStats.firstAuditPercentage)}</span>
                  <span className="text-xs font-medium text-slate-400">{data.auditStats.firstAuditsComplete}/{data.auditStats.totalStores}</span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={data.auditStats.firstAuditPercentage} colorClass="bg-emerald-500" />
                </div>
              </div>

              {/* Second Audit */}
              <div className="flex h-full flex-col p-2.5 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200 hover:border-blue-300 transition-colors">
                 <div className="min-h-[2rem]">
                   <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">Second Audit</span>
                   <p className="text-[10px] leading-4 text-slate-400">Audit 2 completion</p>
                 </div>
                 <div className="mt-1 flex items-end justify-between">
                  <span className="text-2xl font-bold text-slate-900">{formatPercent(data.auditStats.secondAuditPercentage)}</span>
                  <span className="text-xs font-medium text-slate-400">{data.auditStats.secondAuditsComplete}/{data.auditStats.totalStores}</span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={data.auditStats.secondAuditPercentage} colorClass="bg-blue-500" />
                </div>
              </div>

              {/* Total Complete */}
              <div className="flex h-full flex-col p-2.5 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200 hover:border-violet-300 transition-colors">
                 <div className="min-h-[2rem]">
                   <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">Fully Compliant</span>
                   <p className="text-[10px] leading-4 text-slate-400">Audit &gt;=80% + FRA in date</p>
                 </div>
                 <div className="mt-1 flex items-end justify-between">
                  <span className="text-2xl font-bold text-slate-900">{formatPercent(data.auditStats.totalAuditPercentage)}</span>
                  <span className="text-xs font-medium text-slate-400">{data.auditStats.totalAuditsComplete}/{data.auditStats.totalStores}</span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={data.auditStats.totalAuditPercentage} colorClass="bg-purple-500" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Stores - Medium card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm md:col-span-1 h-[180px] flex flex-col">
          <div className="pb-1.5 border-b border-slate-100 bg-slate-50/60 px-3 pt-3">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">Top Stores (Open Incidents)</h3>
            </div>
          </div>
          <div className="pt-2 px-3 pb-3 flex-1 overflow-y-auto">
            {data.topStores.length === 0 ? (
              <p className="text-slate-400 text-sm py-1 italic">No data available</p>
            ) : (
              <div className="space-y-2">
                {data.topStores.map((store: any, idx: number) => (
                  <div key={store.id} className="group">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-slate-700 truncate w-2/3 group-hover:text-emerald-700 transition-colors flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                          {idx + 1}
                        </span>
                        {store.name}
                      </span>
                      <span className="font-bold text-slate-800">{store.count}</span>
                    </div>
                    {/* Visual Bar relative to Max */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out" 
                        style={{ width: `${(store.count / data.maxStoreCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Compliance Visits Due & Planned Rounds row */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 lg:grid-cols-[10fr_3fr]">
        <div className="h-full min-w-0">
          <ComplianceVisitsTracking 
            stores={data.storesNeedingSecondVisit}
          />
        </div>
        <div className="h-full min-w-0">
          <PlannedRounds 
            plannedRoutes={data.plannedRoutes || []} 
          />
        </div>
      </div>

      {/* Incident Breakdown - Full width below compliance visits */}
      {data.totalIncidents > 0 && (
        <Card className="shadow-sm border-slate-200 bg-white rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 border-b bg-slate-50/50 px-4 md:px-6 pt-4 md:pt-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-bold text-slate-800">Incident Breakdown</CardTitle>
              <div className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {data.totalIncidents} active
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 md:pt-5 px-3 md:px-6 pb-4 md:pb-6">
            <div className="grid gap-5 md:grid-cols-2">
              {/* By Status */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">By Status</h4>
                {Object.keys(data.statusCounts).length === 0 ? (
                  <p className="text-slate-400 text-xs italic">No data available</p>
                ) : (
                  Object.entries(data.statusCounts).map(([status, count]) => (
                    <LabeledProgressBar 
                      key={status} 
                      label={status} 
                      value={count as number} 
                      total={data.totalIncidents} 
                      colorClass="bg-indigo-500" 
                    />
                  ))
                )}
              </div>

              {/* By Severity */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">By Severity</h4>
                {Object.keys(data.severityCounts).length === 0 ? (
                  <p className="text-slate-400 text-xs italic">No data available</p>
                ) : (
                  Object.entries(data.severityCounts).map(([severity, count]) => (
                    <LabeledProgressBar 
                      key={severity} 
                      label={severity} 
                      value={count as number} 
                      total={data.totalIncidents} 
                      colorClass={
                        severity === 'critical' ? 'bg-red-600' : 
                        severity === 'high' ? 'bg-orange-500' : 'bg-slate-500'
                      } 
                    />
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
