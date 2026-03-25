'use client'

import { format } from 'date-fns'
import { Loader2, Sparkles, X } from 'lucide-react'
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
  const incidentsTrend = Array.isArray(snapshot?.incidentsPage?.monthlyTrend)
    ? snapshot.incidentsPage.monthlyTrend
    : []
  const actionsTrend = Array.isArray(snapshot?.actionsPage?.monthlyTrend)
    ? snapshot.actionsPage.monthlyTrend
    : []

  const orderedKeys: string[] = []
  const rowMap = new Map<
    string,
    {
      month: string
      incidents: number
      actions: number
      overdueActions: number
      riddor: number
    }
  >()

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
  const risk = snapshot?.predictiveRisk || {}
  const complianceTracking = snapshot?.complianceTracking || {}

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
      label: 'Planned Visits',
      value: Number(complianceTracking.secondAuditPlannedCount ?? 0),
      classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
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

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  content: string
  isLoading: boolean
  snapshot: any
  generatedAt: string | null
}

export function ReportModal({
  isOpen,
  onClose,
  content,
  isLoading,
  snapshot,
  generatedAt,
}: ReportModalProps) {
  if (!isOpen) return null

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
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
          content: '\\2022';
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
      `,
        }}
      />
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
