'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart3, CalendarDays, Download, RefreshCw, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import type { MonthlyReportData } from '@/lib/reports/monthly-report'
import { formatStoreName } from '@/lib/store-display'
import { formatAppDate, getDisplayStoreCode, parseContentDispositionFilename } from '@/lib/utils'

interface MonthlyReportWorkspaceProps {
  data: MonthlyReportData
  canEdit: boolean
}

function getRowSourceLabel(source: MonthlyReportData['rows'][number]['source']) {
  if (source === 'report') return 'Final template'
  if (source === 'incident') return 'Incident email'
  return 'Completed visit'
}

function shiftMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split('-').map((value) => Number(value))
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1))
  const shiftedYear = shifted.getUTCFullYear()
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  return `${shiftedYear}-${shiftedMonth}`
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function MonthlyReportWorkspace({ data, canEdit }: MonthlyReportWorkspaceProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedMonth, setSelectedMonth] = useState(data.period.month)
  const [areaManagerSupportCalls, setAreaManagerSupportCalls] = useState('0')
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [summarizingRowIds, setSummarizingRowIds] = useState<Record<string, boolean>>({})
  const generatedDetailsRef = useRef<Record<string, string>>(
    Object.fromEntries(data.rows.map((row) => [row.id, row.generatedDetails]))
  )
  const [detailEdits, setDetailEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.rows.map((row) => [row.id, row.generatedDetails]))
  )
  const activityRows = useMemo(
    () => data.rows.filter((row) => row.source !== 'incident'),
    [data.rows]
  )
  const theftRows = useMemo(
    () => data.rows.filter((row) => row.source === 'incident' && row.incidentCategory === 'theft'),
    [data.rows]
  )
  const theftTotalValueGbp = useMemo(
    () => theftRows.reduce((total, row) => total + (row.theftValueGbp ?? 0), 0),
    [theftRows]
  )

  const editableCount = useMemo(
    () =>
      data.rows.filter((row) => {
        const currentValue = detailEdits[row.id] ?? row.generatedDetails
        const baselineValue = generatedDetailsRef.current[row.id] ?? row.generatedDetails
        return currentValue.trim() !== baselineValue.trim()
      }).length,
    [data.rows, detailEdits]
  )

  useEffect(() => {
    setDetailEdits((current) => {
      const nextEntries = data.rows.map((row) => {
        const previousGeneratedValue = generatedDetailsRef.current[row.id]
        const currentValue = current[row.id]

        if (
          typeof currentValue !== 'string' ||
          currentValue.trim() === String(previousGeneratedValue || '').trim()
        ) {
          return [row.id, row.generatedDetails] as const
        }

        return [row.id, currentValue] as const
      })

      return Object.fromEntries(nextEntries)
    })

    generatedDetailsRef.current = Object.fromEntries(
      data.rows.map((row) => [row.id, row.generatedDetails])
    )
  }, [data.rows])

  function handleMonthChange(nextMonth: string) {
    if (!nextMonth || nextMonth === selectedMonth) return

    setSelectedMonth(nextMonth)
    startTransition(() => {
      router.replace(`/monthly-reports?month=${encodeURIComponent(nextMonth)}`, { scroll: false })
    })
  }

  function handleDetailChange(rowId: string, value: string) {
    setDetailEdits((current) => ({
      ...current,
      [rowId]: value,
    }))
  }

  async function resetDetail(row: MonthlyReportData['rows'][number]) {
    if (row.source === 'incident') {
      generatedDetailsRef.current = {
        ...generatedDetailsRef.current,
        [row.id]: row.generatedDetails,
      }
      setDetailEdits((current) => ({
        ...current,
        [row.id]: row.generatedDetails,
      }))
      return
    }

    if (summarizingRowIds[row.id]) return

    setSummarizingRowIds((current) => ({
      ...current,
      [row.id]: true,
    }))

    try {
      const response = await fetch('/api/reports/monthly-reports/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          storeName: row.storeName,
          reportLabels: row.reportLabels,
          detailText: row.summarySourceDetails || row.generatedDetails,
          forceRefresh: true,
        }),
      })

      if (!response.ok) {
        throw new Error('Unable to refresh the visit summary.')
      }

      const payload = (await response.json().catch(() => ({}))) as {
        summary?: string
        provider?: 'openai' | 'gemini' | 'none'
        usedAi?: boolean
        errorMessage?: string | null
      }
      const nextDetails =
        typeof payload.summary === 'string' && payload.summary.trim()
          ? payload.summary
          : row.generatedDetails
      const previousDetails = (detailEdits[row.id] ?? row.generatedDetails).trim()
      const hasChanged = previousDetails !== nextDetails.trim()

      generatedDetailsRef.current = {
        ...generatedDetailsRef.current,
        [row.id]: nextDetails,
      }
      setDetailEdits((current) => ({
        ...current,
        [row.id]: nextDetails,
      }))

      if (!payload.usedAi) {
        const providerLabel =
          payload.provider === 'openai'
            ? 'OpenAI'
            : payload.provider === 'gemini'
              ? 'Gemini'
              : 'deterministic fallback'
        const normalizedReason = String(payload.errorMessage || '').toLowerCase()
        const fallbackReason = normalizedReason.includes('low-detail')
          ? `${providerLabel} returned low-detail output, so fallback text was used.`
          : payload.errorMessage
            ? `${providerLabel} was unavailable, so fallback text was used.`
            : `Used ${providerLabel}.`
        toast({
          title: 'Summary refreshed without AI',
          description: fallbackReason,
        })
      } else if (payload.provider === 'openai' || payload.provider === 'gemini') {
        toast({
          title: 'Summary refreshed',
          description: hasChanged
            ? `Used ${payload.provider === 'openai' ? 'OpenAI' : 'Gemini'}.`
            : `Used ${payload.provider === 'openai' ? 'OpenAI' : 'Gemini'}; no wording change returned.`,
        })
      } else if (!hasChanged) {
        toast({
          title: 'Summary refreshed',
          description: 'No wording change was returned for this row.',
        })
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Summary refresh failed',
        description:
          error instanceof Error ? error.message : 'Could not refresh the visit summary.',
      })
    } finally {
      setSummarizingRowIds((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
    }
  }

  async function handleDownloadPdf() {
    if (isDownloadingPdf) return

    setIsDownloadingPdf(true)

    try {
      const response = await fetch('/api/reports/monthly-reports/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          month: selectedMonth,
          areaManagerSupportCalls,
          detailOverrides: detailEdits,
          useAiSummaries: true,
        }),
      })

      if (!response.ok) {
        throw new Error('Unable to generate monthly report PDF.')
      }

      const pdfBlob = await response.blob()
      const blobUrl = window.URL.createObjectURL(pdfBlob)
      const contentDisposition = response.headers.get('Content-Disposition')
      const downloadFileName = parseContentDispositionFilename(
        contentDisposition,
        `monthly-report-${selectedMonth}.pdf`
      )
      const downloadLink = document.createElement('a')

      downloadLink.href = blobUrl
      downloadLink.download = downloadFileName
      downloadLink.rel = 'noopener'
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'PDF export failed',
        description: error instanceof Error ? error.message : 'Could not generate the monthly report PDF.',
      })
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden pb-24 md:pb-0">
      <div className="relative min-w-0 overflow-hidden rounded-3xl bg-[linear-gradient(145deg,#10223d_0%,#17304f_52%,#23567a_100%)] p-4 text-white shadow-[0_20px_44px_rgba(16,34,61,0.18)] sm:p-5 md:p-8">
        <div className="absolute right-0 top-0 h-72 w-72 translate-x-1/3 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-56 w-56 -translate-x-1/3 translate-y-1/3 rounded-full bg-[#5fc2ff]/20 blur-3xl" />

        <div className="relative z-10 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-100/80">
              <BarChart3 className="h-4 w-4" />
              Monthly Reports
            </div>
            <h1 className="text-[2rem] font-bold tracking-tight sm:text-2xl md:text-3xl">LP Monthly Report</h1>
            <p className="mt-2 whitespace-normal break-words text-[13px] leading-snug text-white/75 sm:text-sm">
              <span className="sm:hidden">
                Monthly view of LP activity, store visits, theft emails, and completed templates.
              </span>
              <span className="hidden sm:inline">
                Monthly view of completed LP activity, store visits, reported theft emails, and completed report templates.
              </span>
            </p>
            <p className="mt-2 hidden whitespace-normal break-words text-xs leading-snug text-white/60 sm:block">
              The detail text is auto-filled from completed visit templates and theft emails. Add or amend wording before printing if needed.
            </p>
          </div>

          <div className="w-full min-w-0 max-w-full space-y-2 lg:w-auto lg:max-w-[360px] lg:space-y-2">
            <div className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2">
              <CalendarDays className="h-4 w-4 text-white/75" />
              <Input
                type="month"
                value={selectedMonth}
                onChange={(event) => handleMonthChange(event.target.value)}
                className="h-10 min-h-0 min-w-0 border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus-visible:ring-white/40"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleMonthChange(shiftMonth(selectedMonth, -1))}
              className="min-h-[44px] w-full rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleMonthChange(shiftMonth(selectedMonth, 1))}
              className="min-h-[44px] w-full rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              Next
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadPdf}
              className="min-h-[44px] w-full rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloadingPdf ? 'Building PDF...' : 'PDF'}
            </Button>
          </div>
        </div>
      </div>

      {data.warnings.length > 0 ? (
        <Card className="border border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-950">Some monthly totals are incomplete</CardTitle>
            <CardDescription className="text-amber-900/80">
              One or more data sources could not be loaded fully for this month.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1 text-sm text-amber-900">
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <Card className="border border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle>Monthly Summary</CardTitle>
            <CardDescription>{data.period.label}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-3 md:hidden">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stores Visited</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{data.summary.storesVisited}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Incidents Reported</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{data.summary.incidentsReported}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Investigations Carried</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{data.summary.investigationsCarried}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Area Manager Support Calls</div>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={areaManagerSupportCalls}
                  onChange={(event) => setAreaManagerSupportCalls(event.target.value)}
                  readOnly={!canEdit}
                  className="mt-2 h-10 max-w-[180px]"
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">LP Managers</div>
                {data.summary.lpManagers.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.summary.lpManagers.map((manager) => (
                      <span
                        key={manager}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                      >
                        {manager}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="mt-2 block text-sm text-slate-500">No completed visits for this month.</span>
                )}
              </div>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stores Visited</TableHead>
                  <TableHead>Incidents Reported</TableHead>
                  <TableHead>Investigations Carried</TableHead>
                  <TableHead>Area Manager Support Calls</TableHead>
                  <TableHead>LP Managers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="align-top text-base font-semibold text-slate-900">
                    {data.summary.storesVisited}
                  </TableCell>
                  <TableCell className="align-top text-base font-semibold text-slate-900">
                    {data.summary.incidentsReported}
                  </TableCell>
                  <TableCell className="align-top text-base font-semibold text-slate-900">
                    {data.summary.investigationsCarried}
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={areaManagerSupportCalls}
                      onChange={(event) => setAreaManagerSupportCalls(event.target.value)}
                      readOnly={!canEdit}
                      className="max-w-[140px]"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    {data.summary.lpManagers.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {data.summary.lpManagers.map((manager) => (
                          <span
                            key={manager}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                          >
                            {manager}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">No completed visits for this month.</span>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle>Month Snapshot</CardTitle>
            <CardDescription>Quick status for the report builder.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-0">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reporting Month</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{data.period.label}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Rows Ready</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{activityRows.length + theftRows.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Manual Edits</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{editableCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {canEdit
                ? 'Area Manager support calls and detail edits stay in the current browser session so the PDF can be tailored before export.'
                : 'This account can view the generated monthly report, but only admin and ops users can amend the report text.'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200">
        <CardHeader className="pb-4">
          <CardTitle>Completed Activity</CardTitle>
          <CardDescription>
            Date, store, and monthly-report detail text pulled from completed visit templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {activityRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No completed store visits or final templates were found for {data.period.label}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Date</TableHead>
                  <TableHead className="w-[260px]">Store</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityRows.map((row) => {
                  const detailValue = detailEdits[row.id] ?? row.generatedDetails
                  const displayStoreCode = getDisplayStoreCode(row.storeCode)
                  const isSummarizing = Boolean(summarizingRowIds[row.id])

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="align-top">
                        <div className="font-medium text-slate-900">
                          {formatAppDate(row.visitedAt, { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {getRowSourceLabel(row.source)}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {row.storeId ? (
                          <Link
                            href={`/stores/${row.storeId}`}
                            className="font-medium text-slate-900 underline-offset-4 hover:underline"
                          >
                            {formatStoreName(row.storeName)}
                          </Link>
                        ) : (
                          <div className="font-medium text-slate-900">{formatStoreName(row.storeName)}</div>
                        )}
                        <div className="mt-1 text-sm text-slate-500">
                          {displayStoreCode ? `Store ${displayStoreCode}` : 'Store code unavailable'}
                        </div>
                        {row.createdByName ? (
                          <div className="mt-2 text-xs text-slate-500">LP manager: {row.createdByName}</div>
                        ) : null}
                        {row.reportLabels.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {row.reportLabels.map((label) => (
                              <span
                                key={`${row.id}-${label}`}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-3">
                          <div className="text-xs text-slate-500">
                            Auto-filled from completed templates and visit activity. Edit or add extra report wording below.
                          </div>
                          {canEdit ? (
                            <Textarea
                              value={detailValue}
                              onChange={(event) => handleDetailChange(row.id, event.target.value)}
                              className="min-h-[160px] whitespace-pre-wrap"
                            />
                          ) : (
                            <div className="min-h-[160px] whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              {detailValue || '-'}
                            </div>
                          )}
                          {canEdit ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => resetDetail(row)}
                                disabled={isSummarizing}
                              >
                                <RotateCcw className={`mr-1.5 h-3.5 w-3.5${isSummarizing ? ' animate-spin' : ''}`} />
                                {isSummarizing ? 'Refreshing...' : 'Reset'}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-slate-200">
        <CardHeader className="pb-4">
          <CardTitle>Thefts Reported</CardTitle>
          <CardDescription>
            Theft emails reported that month, including stolen lines and any value captured in the email.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {theftRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No theft emails were reported for {data.period.label}.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Date</TableHead>
                    <TableHead className="w-[260px]">Store</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {theftRows.map((row) => {
                    const detailValue = detailEdits[row.id] ?? row.generatedDetails
                    const displayStoreCode = getDisplayStoreCode(row.storeCode)

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="align-top">
                          <div className="font-medium text-slate-900">
                            {formatAppDate(row.visitedAt, { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">Theft email</div>
                        </TableCell>
                        <TableCell className="align-top">
                          {row.storeId ? (
                            <Link
                              href={`/stores/${row.storeId}`}
                              className="font-medium text-slate-900 underline-offset-4 hover:underline"
                            >
                              {formatStoreName(row.storeName)}
                            </Link>
                          ) : (
                            <div className="font-medium text-slate-900">{formatStoreName(row.storeName)}</div>
                          )}
                          <div className="mt-1 text-sm text-slate-500">
                            {displayStoreCode ? `Store ${displayStoreCode}` : 'Store code unavailable'}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-3">
                            <div className="text-xs text-slate-500">
                              Auto-filled from theft email analysis. Edit the wording or value details below if needed.
                            </div>
                            {canEdit ? (
                              <Textarea
                                value={detailValue}
                                onChange={(event) => handleDetailChange(row.id, event.target.value)}
                                className="min-h-[160px] whitespace-pre-wrap"
                              />
                            ) : (
                              <div className="min-h-[160px] whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                {detailValue || '-'}
                              </div>
                            )}
                            {canEdit ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resetDetail(row)}
                                >
                                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                  Reset
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                </Table>
              </div>

              <div className="flex justify-end border-t border-slate-200 pt-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Total Reported
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {formatCurrency(theftTotalValueGbp)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isPending ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading monthly report...
        </div>
      ) : null}
    </div>
  )
}
