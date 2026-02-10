'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  Download,
  Sparkles,
  FileSpreadsheet,
  ChevronRight,
  BarChart3,
  PieChart,
  Loader2,
  Newspaper,
  FileDown,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { format } from 'date-fns'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts'
import type {
  AreaNewsletterReport,
  MonthlyNewsletterResponse,
  NewsletterAIPromptPack,
} from '@/lib/reports/monthly-newsletter-types'

// --- REAL IMPORTS (Uncomment these in your project) ---
// import { requireAuth } from '@/lib/auth'

// --- MOCK AUTH FOR PREVIEW (Delete this in production) ---
const requireAuth = async () => {}
// -----------------------------------------------------------

const DEFAULT_REMINDERS_TEXT = [
  'Confirm weekly fire exit checks and document findings in the store logbook.',
  'Run a short team refresher on slips, trips, and housekeeping controls before weekend peaks.',
  'Ensure every open action has an owner, target date, and evidence upload attached.',
].join('\n')

const DEFAULT_LEGISLATION_TEXT = [
  'Reinforce duties under the Regulatory Reform (Fire Safety) Order 2005, especially clear escape routes and daily checks.',
  'Remind store teams to follow internal incident and near-miss reporting standards aligned with RIDDOR expectations.',
].join('\n')

function toLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function toPercentLabel(value: number | null): string {
  if (typeof value !== 'number') return 'N/A'
  return `${value.toFixed(1)}%`
}

function getScoreColor(score: number | null): string {
  if (typeof score !== 'number') return '#94a3b8'
  if (score >= 90) return '#059669'
  if (score >= 85) return '#0284c7'
  if (score >= 80) return '#d97706'
  return '#dc2626'
}

interface AreaNewsletterDashboardCardProps {
  report: AreaNewsletterReport
  newsletterMonth: string
  onDownloadPdf: (report: AreaNewsletterReport) => Promise<void>
  aiPromptPack: NewsletterAIPromptPack | null
  aiLoadingAreaCode: string | null
  pdfLoadingAreaCode: string | null
}

function AreaNewsletterDashboardCard({
  report,
  newsletterMonth,
  onDownloadPdf,
  aiPromptPack,
  aiLoadingAreaCode,
  pdfLoadingAreaCode,
}: AreaNewsletterDashboardCardProps) {
  const chartData = report.stores
    .filter((store) => typeof store.latestAuditScore === 'number')
    .slice(0, 12)
    .map((store) => ({
      name: store.storeName,
      score: store.latestAuditScore as number,
    }))

  const leaderboardSplitIndex = Math.ceil(report.stores.length / 2)
  const leaderboardFirstColumn = report.stores.slice(0, leaderboardSplitIndex)
  const leaderboardSecondColumn = report.stores.slice(leaderboardSplitIndex)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div>
          <h4 className="text-lg font-extrabold tracking-tight text-slate-900">{report.areaLabel}</h4>
          <p className="text-sm text-slate-500">
            {report.storeCount} stores | Newsletter period data with audit + H&S insights
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => onDownloadPdf(report)}
          disabled={pdfLoadingAreaCode === report.areaCode}
          className="min-h-[40px]"
        >
          {pdfLoadingAreaCode === report.areaCode ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Preparing PDF...
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4 mr-2" />
              Download {report.areaCode} PDF
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-3 mb-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Average Audit Score</p>
          <p className="text-2xl font-black" style={{ color: getScoreColor(report.auditMetrics.averageLatestScore) }}>
            {toPercentLabel(report.auditMetrics.averageLatestScore)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Audits Completed</p>
          <p className="text-2xl font-black text-slate-900">{report.auditMetrics.auditsCompletedThisMonth}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Stores Below 85%</p>
          <p className="text-2xl font-black text-amber-700">{report.auditMetrics.belowThresholdCount}</p>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 mb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-indigo-700 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> KSS NW Consultant Briefing
          </h5>
        </div>

        {aiPromptPack ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-indigo-100 bg-white/80 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 mb-1">
                  Regional Summary
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{aiPromptPack.generateBriefing}</p>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-white/80 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 mb-1">
                  Risk Pattern
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{aiPromptPack.analyzeRegionalRisk}</p>
              </div>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-white/80 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 mb-1">
                Newsletter Email Draft
              </p>
              <pre className="max-h-56 overflow-auto text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {aiPromptPack.composeNewsletter}
              </pre>
            </div>
          </div>
        ) : aiLoadingAreaCode === report.areaCode ? (
          <div className="flex items-center gap-2 text-sm text-indigo-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating KSS NW briefing for {report.areaCode}...
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Use the top-level consultant briefing button to generate outputs for all visible areas.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 p-3 mb-4">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">
          Audit Score Distribution
        </h5>
        {chartData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={65}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    borderColor: '#cbd5e1',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Score']}
                />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={`score-cell-${idx}`} fill={getScoreColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No scored audits available for charting in {newsletterMonth}.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 p-3 overflow-hidden mb-4">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">
          Store Leaderboard
        </h5>
        <div className={`grid gap-3 ${leaderboardSecondColumn.length > 0 ? 'md:grid-cols-2' : ''}`}>
          <div className="rounded-lg border border-slate-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold w-10">#</th>
                  <th className="px-2 py-2 font-semibold">Store</th>
                  <th className="px-2 py-2 font-semibold text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardFirstColumn.map((store, idx) => (
                  <tr key={`${store.storeName}-left-${idx}`} className="border-t border-slate-100 text-sm">
                    <td className="px-2 py-2 text-[11px] font-semibold text-slate-500">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <div className="font-semibold text-slate-800">{store.storeName}</div>
                      {store.storeCode && <div className="text-[11px] text-slate-500">{store.storeCode}</div>}
                    </td>
                    <td className="px-2 py-2 text-right font-bold" style={{ color: getScoreColor(store.latestAuditScore) }}>
                      {typeof store.latestAuditScore === 'number'
                        ? `${store.latestAuditScore.toFixed(1)}%`
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {leaderboardSecondColumn.length > 0 ? (
            <div className="rounded-lg border border-slate-100 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50">
                  <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold w-10">#</th>
                    <th className="px-2 py-2 font-semibold">Store</th>
                    <th className="px-2 py-2 font-semibold text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardSecondColumn.map((store, idx) => (
                    <tr key={`${store.storeName}-right-${idx}`} className="border-t border-slate-100 text-sm">
                      <td className="px-2 py-2 text-[11px] font-semibold text-slate-500">
                        {leaderboardSplitIndex + idx + 1}
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-semibold text-slate-800">{store.storeName}</div>
                        {store.storeCode && <div className="text-[11px] text-slate-500">{store.storeCode}</div>}
                      </td>
                      <td className="px-2 py-2 text-right font-bold" style={{ color: getScoreColor(store.latestAuditScore) }}>
                        {typeof store.latestAuditScore === 'number'
                          ? `${store.latestAuditScore.toFixed(1)}%`
                          : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3 mb-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Area Focus From H&S Tasks
          </h5>
          <div className="mb-2 text-xs text-slate-600">
            Active: <span className="font-semibold">{report.storeActionMetrics.activeCount}</span>
            {' | '}
            High/Urgent: <span className="font-semibold">{report.storeActionMetrics.highPriorityCount}</span>
            {' | '}
            Overdue: <span className="font-semibold">{report.storeActionMetrics.overdueCount}</span>
          </div>
          {report.storeActionMetrics.focusItems.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-slate-700">
              {report.storeActionMetrics.focusItems.map((item, idx) => (
                <li key={`${item.topic.slice(0, 20)}-${idx}`}>
                  <span className="font-semibold">{item.topic}</span> - {item.actionCount} actions across{' '}
                  {item.storeCount} stores. {item.managerPrompt}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No active H&S task themes available for this area.</p>
          )}
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> H&S Highlights
          </h5>
          <div className="mb-2 text-xs text-slate-600">
            Completed: <span className="font-semibold">{report.hsAuditMetrics.auditsCompletedThisMonth}</span>
            {' | '}
            Avg: <span className="font-semibold">{toPercentLabel(report.hsAuditMetrics.averageScore)}</span>
          </div>
          {report.hsAuditMetrics.highlights.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-slate-700">
              {report.hsAuditMetrics.highlights.map((line, idx) => (
                <li key={`${line.slice(0, 20)}-${idx}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No H&S highlights provided.</p>
          )}
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Reminders & Updates
          </h5>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Reminders</p>
          <ul className="space-y-1 text-sm text-slate-700 mb-3">
            {report.reminders.map((line, idx) => (
              <li key={`r-${idx}`}>{line}</li>
            ))}
          </ul>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Legislation / Policy</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {report.legislationUpdates.map((line, idx) => (
              <li key={`l-${idx}`}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50/60">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Show newsletter copy (for email body)
        </summary>
        <pre className="max-h-[260px] overflow-auto border-t border-slate-200 bg-white p-3 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
          {report.newsletterMarkdown}
        </pre>
      </details>
    </div>
  )
}

export default function ReportsPage() {
  // useEffect(() => { requireAuth(); }, []); // Simulate auth check
  const [newsletterMonth, setNewsletterMonth] = useState<string>(format(new Date(), 'yyyy-MM'))
  const [newsletterAreaCode, setNewsletterAreaCode] = useState<string>('all')
  const [hsAuditText, setHsAuditText] = useState<string>('')
  const [remindersText, setRemindersText] = useState<string>(DEFAULT_REMINDERS_TEXT)
  const [legislationText, setLegislationText] = useState<string>(DEFAULT_LEGISLATION_TEXT)
  const [newsletterData, setNewsletterData] = useState<MonthlyNewsletterResponse | null>(null)
  const [newsletterLoading, setNewsletterLoading] = useState(false)
  const [newsletterError, setNewsletterError] = useState<string | null>(null)
  const [newsletterPdfLoading, setNewsletterPdfLoading] = useState<string | null>(null)
  const [newsletterAiByArea, setNewsletterAiByArea] = useState<Record<string, NewsletterAIPromptPack>>({})
  const [newsletterAiBulkLoading, setNewsletterAiBulkLoading] = useState(false)
  const [newsletterAiLoadingArea, setNewsletterAiLoadingArea] = useState<string | null>(null)

  const buildNewsletterPayload = () => ({
    month: newsletterMonth,
    areaCode: newsletterAreaCode === 'all' ? undefined : newsletterAreaCode,
    hsAuditText,
    reminders: toLines(remindersText),
    legislationUpdates: toLines(legislationText),
  })

  const handleGenerateMonthlyNewsletter = async () => {
    setNewsletterLoading(true)
    setNewsletterError(null)
    setNewsletterAiByArea({})
    setNewsletterAiBulkLoading(false)
    setNewsletterAiLoadingArea(null)

    try {
      const response = await fetch('/api/reports/monthly-newsletter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildNewsletterPayload()),
      })

      const data = (await response.json()) as MonthlyNewsletterResponse & { error?: string }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to generate monthly newsletter')
      }

      setNewsletterData(data)
    } catch (error) {
      setNewsletterError(
        error instanceof Error ? error.message : 'Failed to generate monthly newsletter'
      )
    } finally {
      setNewsletterLoading(false)
    }
  }

  const requestAreaAiPromptPack = async (
    report: AreaNewsletterReport
  ): Promise<NewsletterAIPromptPack> => {
    const scoredStores = report.stores
      .filter(
        (store): store is typeof store & { latestAuditScore: number } =>
          typeof store.latestAuditScore === 'number' && Number.isFinite(store.latestAuditScore)
      )
      .sort((a, b) => b.latestAuditScore - a.latestAuditScore)

    const topStore = scoredStores[0]
      ? `${scoredStores[0].storeName} (${scoredStores[0].latestAuditScore.toFixed(1)}%)`
      : 'N/A'

    const bottomStore = scoredStores[scoredStores.length - 1]
      ? `${scoredStores[scoredStores.length - 1].storeName} (${scoredStores[scoredStores.length - 1].latestAuditScore.toFixed(1)}%)`
      : 'N/A'

    const response = await fetch('/api/reports/monthly-newsletter/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selectedArea: report.areaCode,
        metrics: {
          avg: report.auditMetrics.averageLatestScore,
        },
        topStore,
        bottomStore,
        leaderboard: report.stores.map((store) => ({
          storeName: store.storeName,
          score: store.latestAuditScore,
        })),
        scores: scoredStores.map((store) => store.latestAuditScore),
      }),
    })

      const data = (await response.json()) as NewsletterAIPromptPack & { error?: string }
      if (!response.ok) {
      throw new Error(data.error || `Failed to generate KSS NW briefing for ${report.areaCode}`)
      }

    return {
      generateBriefing: data.generateBriefing || '',
      composeNewsletter: data.composeNewsletter || '',
      analyzeRegionalRisk: data.analyzeRegionalRisk || '',
    }
  }

  const handleGenerateAllAiPromptPacks = async () => {
    const reports = newsletterData?.areaReports || []
    if (reports.length === 0) return

    setNewsletterError(null)
    setNewsletterAiBulkLoading(true)
    setNewsletterAiByArea({})

    const errors: string[] = []

    for (const report of reports) {
      setNewsletterAiLoadingArea(report.areaCode)
      try {
        const aiPromptPack = await requestAreaAiPromptPack(report)
        setNewsletterAiByArea((prev) => ({
          ...prev,
          [report.areaCode]: aiPromptPack,
        }))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Failed to generate KSS NW briefings for ${report.areaCode}`
        errors.push(message)
      }
    }

    if (errors.length > 0) {
      setNewsletterError(errors.join(' | '))
    }

    setNewsletterAiLoadingArea(null)
    setNewsletterAiBulkLoading(false)
  }

  const handleDownloadAreaNewsletter = async (report: AreaNewsletterReport) => {
    setNewsletterPdfLoading(report.areaCode)
    setNewsletterError(null)

    try {
      const response = await fetch('/api/reports/monthly-newsletter/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...buildNewsletterPayload(),
          areaCode: report.areaCode,
          aiPromptPack: newsletterAiByArea[report.areaCode] || undefined,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Failed to download newsletter PDF')
      }

      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/)
      const fallbackName = `monthly-newsletter-${newsletterMonth}-${report.areaCode.toLowerCase()}.pdf`
      const filename = filenameMatch?.[1] || fallbackName

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      setNewsletterError(error instanceof Error ? error.message : 'Failed to download newsletter')
    } finally {
      setNewsletterPdfLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8 bg-slate-50/50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-slate-900">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-sm flex-shrink-0">
              <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports & Exports</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-500 max-w-2xl ml-9 sm:ml-11">
            Download detailed compliance data or generate AI-powered insights for your team.
          </p>
        </div>
      </div>

      <Tabs defaultValue="monthly" className="w-full">
        <TabsList className="inline-flex h-auto items-center justify-start rounded-md bg-slate-100 p-1 text-slate-600">
          <TabsTrigger value="monthly" className="min-h-[40px]">
            Monthly Dashboard
          </TabsTrigger>
          <TabsTrigger value="export" className="min-h-[40px]">
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="md:col-span-2 lg:col-span-3 border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 shadow-sm">
          <CardHeader className="border-b border-amber-100">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Newspaper className="h-5 w-5 text-amber-600" />
                  Monthly Area Manager Newsletter Dashboard
                </CardTitle>
                <CardDescription className="text-slate-600 mt-1">
                  Generate visual monthly dashboards for area codes (A1, A2, A3...) with audit
                  scores, H&S findings, reminders, and legislation updates.
                </CardDescription>
              </div>
              <Button
                onClick={handleGenerateMonthlyNewsletter}
                disabled={newsletterLoading}
                className="min-h-[44px] bg-amber-600 hover:bg-amber-700"
              >
                {newsletterLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Area Dashboards
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {newsletterError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {newsletterError}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Newsletter Month</label>
                <Input
                  type="month"
                  value={newsletterMonth}
                  onChange={(event) => setNewsletterMonth(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Area Scope</label>
                <select
                  value={newsletterAreaCode}
                  onChange={(event) => setNewsletterAreaCode(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="all">All Areas</option>
                  {newsletterData?.availableAreas.map((area) => (
                    <option key={area.code} value={area.code}>
                      {area.label} ({area.storeCount} stores)
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Areas In Report</p>
                <p className="text-lg font-semibold text-slate-900">
                  {newsletterData?.summary.areaCount ?? '-'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Active H&S Tasks</p>
                <p className="text-lg font-semibold text-slate-900">
                  {newsletterData?.summary.activeStoreActions ?? '-'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="lg:col-span-1 space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  H&S Text Input (optional)
                </label>
                <Textarea
                  value={hsAuditText}
                  onChange={(event) => setHsAuditText(event.target.value)}
                  className="min-h-[140px] bg-white"
                  placeholder="Paste key lines from individual H&S audits here."
                />
              </div>
              <div className="lg:col-span-1 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Store Team Reminders</label>
                <Textarea
                  value={remindersText}
                  onChange={(event) => setRemindersText(event.target.value)}
                  className="min-h-[140px] bg-white"
                  placeholder="One reminder per line"
                />
              </div>
              <div className="lg:col-span-1 space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  Legislation / Policy Updates
                </label>
                <Textarea
                  value={legislationText}
                  onChange={(event) => setLegislationText(event.target.value)}
                  className="min-h-[140px] bg-white"
                  placeholder="One update per line"
                />
              </div>
            </div>

            {newsletterData && newsletterData.areaReports.length > 0 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> KSS NW Consultant Briefing
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      One click generates KSS NW monthly briefing content for all visible areas and
                      fills each area card automatically.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Generated: {Object.keys(newsletterAiByArea).length}/{newsletterData.areaReports.length}
                      {newsletterAiLoadingArea ? ` | Currently: ${newsletterAiLoadingArea}` : ''}
                    </p>
                  </div>
                  <Button
                    onClick={handleGenerateAllAiPromptPacks}
                    disabled={newsletterAiBulkLoading || newsletterLoading}
                    className="min-h-[40px] bg-indigo-600 hover:bg-indigo-700"
                  >
                    {newsletterAiBulkLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating For All Areas...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Prompts For All Areas
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {newsletterData && newsletterData.areaReports.length > 0 && (
              <div className="space-y-5">
                {newsletterData.areaReports.map((report) => (
                  <AreaNewsletterDashboardCard
                    key={report.areaCode}
                    report={report}
                    newsletterMonth={newsletterMonth}
                    onDownloadPdf={handleDownloadAreaNewsletter}
                    aiPromptPack={newsletterAiByArea[report.areaCode] || null}
                    aiLoadingAreaCode={newsletterAiLoadingArea}
                    pdfLoadingAreaCode={newsletterPdfLoading}
                  />
                ))}
              </div>
            )}

            {newsletterData && newsletterData.areaReports.length === 0 && !newsletterLoading && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                No area data matched this filter/month. Try selecting &quot;All Areas&quot; or a different month.
              </div>
            )}
          </CardContent>
        </Card>
          </div>
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Incidents Report Card */}
        <Card className="group relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border-slate-200 bg-white">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                <AlertIcon className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                CSV
              </span>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">Incidents Data</CardTitle>
            <CardDescription className="text-slate-500">
              Full export of all reported incidents, including status, severity, and resolution
              details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/reports/incidents" method="GET">
              <Button
                type="submit"
                className="w-full bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-700 transition-all font-semibold shadow-sm min-h-[44px]"
              >
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Actions Report Card */}
        <Card className="group relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border-slate-200 bg-white">
          <div className="absolute top-0 left-0 w-1 h-full bg-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors duration-300">
                <ChecklistIcon className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                CSV
              </span>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">Actions Log</CardTitle>
            <CardDescription className="text-slate-500">
              Comprehensive list of corrective actions, assigned owners, due dates, and completion
              status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/reports/actions" method="GET">
              <Button
                type="submit"
                className="w-full bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-purple-200 hover:text-purple-700 transition-all font-semibold shadow-sm min-h-[44px]"
              >
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Store Audit Summary */}
        <Card className="group relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border-slate-200 bg-white">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <StoreIcon className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                PDF
              </span>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">Store Audit Summary</CardTitle>
            <CardDescription className="text-slate-500">
              High-level summary of audit scores across all regions for the current fiscal quarter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/reports/audit-summary" method="GET">
              <Button
                type="submit"
                className="w-full bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-emerald-200 hover:text-emerald-700 transition-all font-semibold shadow-sm min-h-[44px]"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Summary
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* AI Analysis Card (Full Width on mobile, spanned on large) */}
        <Card className="md:col-span-2 lg:col-span-3 bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-100 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg shadow-sm">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <CardTitle className="text-indigo-900">AI Compliance Intelligence</CardTitle>
            </div>
            <CardDescription className="text-indigo-600/80">
              Generate an on-demand executive summary using our advanced AI analysis engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
            <div className="space-y-2 max-w-2xl w-full">
              <div className="flex flex-wrap gap-3 md:gap-4 text-xs md:text-sm text-indigo-800/70">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3 w-3 md:h-4 md:w-4" />
                  <span>Trend Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  <PieChart className="h-3 w-3 md:h-4 md:w-4" />
                  <span>Risk Distribution</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 md:h-4 md:w-4" />
                  <span>Executive Summary</span>
                </div>
              </div>
              <p className="text-xs md:text-sm text-indigo-900/60 leading-relaxed">
                The AI Compliance Report analyzes your live dashboard data to identify patterns,
                highlight top risks, and provide strategic recommendations for your management
                team. This report is generated dynamically on the Dashboard.
              </p>
            </div>

            <Button
              asChild
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md border-0 w-full md:w-auto min-h-[44px] md:min-h-0"
            >
              <a href="/dashboard" className="flex items-center justify-center">
                <span className="hidden sm:inline">Go to Dashboard Analysis</span>
                <span className="sm:hidden">Dashboard Analysis</span>
                <ChevronRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </CardContent>
        </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Icons for the cards (using Lucide)
function AlertIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function ChecklistIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="20" x="2" y="2" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function StoreIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
      <path d="M2 7h20" />
      <path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7" />
    </svg>
  )
}
