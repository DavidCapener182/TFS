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
  Shield,
  MapPin,
  Calendar,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatStoreName } from '@/lib/store-display'
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
  'Confirm weekly fire checks including exit routes, emergency lighting and call point checks are carried out, documented on the weekly checks, and uploaded to Zipline.',
  'Ensure tool box training on slips, trips, and housekeeping controls is monitored and achieves the 100% completion rate set out.',
  'Actions are uploaded by KSS to Zipline, ensure these are actioned upon.',
].join('\n')

const DEFAULT_LEGISLATION_TEXT = [
  'Reinforce duties under the Regulatory Reform (Fire Safety) Order 2005, especially clear escape routes and daily checks.',
  'Remind store teams to follow internal incident and near-miss reporting standards aligned with RIDDOR expectations.',
].join('\n')

interface RadarAxisMeta {
  shortLabel: string
  detail: string
}

const RADAR_AXIS_META: Record<string, RadarAxisMeta> = {
  'Stores <80% (%)': {
    shortLabel: 'Stores <80%',
    detail: 'Percentage of stores already in mandatory revisit status.',
  },
  'Stores 80-84% (%)': {
    shortLabel: 'Stores 80-84%',
    detail: 'Percentage of stores in the watch band near the threshold.',
  },
  'Predicted Fails (%)': {
    shortLabel: 'Predicted Fails',
    detail: 'Watch-band stores forecast to fall below 80% at End-of-Year.',
  },
  'Overdue P1 Actions (%)': {
    shortLabel: 'Overdue P1',
    detail: 'Share of P1 actions overdue across at-risk stores.',
  },
  'At-Risk Stores with Open Incidents (%)': {
    shortLabel: 'Incident Burden',
    detail: 'At-risk stores currently carrying one or more open incidents.',
  },
}

function getRadarAxisMeta(axis: string): RadarAxisMeta {
  return RADAR_AXIS_META[axis] || { shortLabel: axis, detail: axis }
}

function getRadarStatus(risk: number, target: number): {
  label: string
  className: string
} {
  const delta = risk - target
  if (delta <= 0) {
    return {
      label: 'On Target',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    }
  }

  if (delta <= 10) {
    return {
      label: 'Watch',
      className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    }
  }

  return {
    label: 'High',
    className: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  }
}

function getRiskBarFillClass(risk: number, target: number): string {
  const delta = risk - target
  if (delta <= 0) return 'bg-emerald-500'
  if (delta <= 10) return 'bg-amber-500'
  return 'bg-rose-500'
}

function getRiskProfileValueLabel(
  axis: string,
  metrics: AreaNewsletterReport['revisitRiskMetrics']
): string {
  if (axis === 'Stores <80% (%)') {
    return `${metrics.alreadyBelowThresholdCount} Stores`
  }
  if (axis === 'Stores 80-84% (%)') {
    return `${metrics.borderlineStoreCount} Stores`
  }
  if (axis === 'Predicted Fails (%)') {
    return `${metrics.predictedRevisitCount} Stores`
  }
  if (axis === 'Overdue P1 Actions (%)') {
    return `${metrics.overdueP1AtRiskCount} Actions`
  }
  if (axis === 'At-Risk Stores with Open Incidents (%)') {
    return `${metrics.storesWithOpenIncidentsAtRiskCount} Stores`
  }
  return `${axis}`
}

function getRiskProfileValueCount(
  axis: string,
  metrics: AreaNewsletterReport['revisitRiskMetrics']
): number {
  if (axis === 'Stores <80% (%)') return metrics.alreadyBelowThresholdCount
  if (axis === 'Stores 80-84% (%)') return metrics.borderlineStoreCount
  if (axis === 'Predicted Fails (%)') return metrics.predictedRevisitCount
  if (axis === 'Overdue P1 Actions (%)') return metrics.overdueP1AtRiskCount
  if (axis === 'At-Risk Stores with Open Incidents (%)') return metrics.storesWithOpenIncidentsAtRiskCount
  return 0
}

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

function getScoreTextClass(score: number | null): string {
  if (typeof score !== 'number') return 'text-slate-400'
  if (score >= 90) return 'text-emerald-600'
  if (score >= 85) return 'text-blue-600'
  if (score >= 80) return 'text-amber-600'
  return 'text-rose-600'
}

function getScoreBarClass(score: number | null): string {
  if (typeof score !== 'number') return 'bg-slate-300'
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 85) return 'bg-blue-500'
  if (score >= 80) return 'bg-amber-500'
  return 'bg-rose-500'
}

function getScoreBadgeClass(score: number | null): string {
  if (typeof score !== 'number') return 'bg-slate-100 text-slate-500 ring-slate-300/80'
  if (score >= 90) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
  if (score >= 85) return 'bg-blue-50 text-blue-700 ring-blue-600/20'
  if (score >= 80) return 'bg-amber-50 text-amber-700 ring-amber-600/20'
  return 'bg-rose-50 text-rose-700 ring-rose-600/20'
}

function getNewsletterCardElementId(areaCode: string): string {
  return `newsletter-card-${areaCode.toLowerCase()}`
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function collectPdfHeadMarkup(): string {
  const nodes = Array.from(
    document.head.querySelectorAll('style, link[rel="stylesheet"], link[rel="preload"][as="font"]')
  )
  return nodes.map((node) => node.outerHTML).join('\n')
}

function collectRootCssVariableMarkup(): string {
  const computed = window.getComputedStyle(document.documentElement)
  return Array.from(computed)
    .filter((property) => property.startsWith('--'))
    .map((property) => `${property}:${computed.getPropertyValue(property)};`)
    .join('')
}

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function isFontAssetPath(value: string): boolean {
  return /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(value)
}

function guessMimeTypeFromFontAsset(assetUrl: string): string {
  const lower = assetUrl.toLowerCase()
  if (lower.includes('.woff2')) return 'font/woff2'
  if (lower.includes('.woff')) return 'font/woff'
  if (lower.includes('.ttf')) return 'font/ttf'
  if (lower.includes('.otf')) return 'font/otf'
  if (lower.includes('.eot')) return 'application/vnd.ms-fontobject'
  return 'application/octet-stream'
}

async function toDataUriFromAssetUrl(assetUrl: string): Promise<string | null> {
  try {
    const response = await fetch(assetUrl, { credentials: 'include' })
    if (!response.ok) return null

    const blob = await response.blob()
    const mimeType = blob.type || guessMimeTypeFromFontAsset(assetUrl)
    const dataBuffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(dataBuffer)
    let binary = ''
    const chunkSize = 0x8000

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      let chunkBinary = ''
      for (let idx = 0; idx < chunk.length; idx += 1) {
        chunkBinary += String.fromCharCode(chunk[idx])
      }
      binary += chunkBinary
    }

    return `data:${mimeType};base64,${btoa(binary)}`
  } catch {
    return null
  }
}

async function inlineFontAssetUrlsInCss(cssText: string): Promise<string> {
  const matches = Array.from(cssText.matchAll(/url\(([^)]+)\)/gi))
  if (matches.length === 0) return cssText

  const urlReplacements = new Map<string, string>()
  const urlCache = new Map<string, string | null>()

  for (const match of matches) {
    const rawToken = match[1] || ''
    const cleanToken = stripWrappingQuotes(rawToken)
    if (!cleanToken || cleanToken.startsWith('data:') || !isFontAssetPath(cleanToken)) {
      continue
    }

    const absoluteUrl = new URL(cleanToken, window.location.origin).toString()
    if (!urlCache.has(absoluteUrl)) {
      urlCache.set(absoluteUrl, await toDataUriFromAssetUrl(absoluteUrl))
    }

    const replacement = urlCache.get(absoluteUrl)
    if (!replacement) continue
    urlReplacements.set(cleanToken, replacement)
    urlReplacements.set(absoluteUrl, replacement)
  }

  if (urlReplacements.size === 0) return cssText

  let output = cssText
  urlReplacements.forEach((replacement, original) => {
    output = output.split(original).join(replacement)
  })

  return output
}

async function collectEmbeddedFontFaceCss(): Promise<string> {
  const cssBlocks: string[] = []

  const styleBlocks = Array.from(document.head.querySelectorAll('style'))
    .map((node) => node.textContent || '')
    .filter((text) => text.includes('@font-face'))
  cssBlocks.push(...styleBlocks)

  const stylesheetLinks = Array.from(
    document.head.querySelectorAll('link[rel="stylesheet"][href]')
  ) as HTMLLinkElement[]

  const linkedCssBlocks = await Promise.all(
    stylesheetLinks.map(async (linkNode) => {
      try {
        const response = await fetch(linkNode.href, { credentials: 'include' })
        if (!response.ok) return ''
        const cssText = await response.text()
        return cssText.includes('@font-face') ? cssText : ''
      } catch {
        return ''
      }
    })
  )

  cssBlocks.push(...linkedCssBlocks.filter(Boolean))

  if (cssBlocks.length === 0) return ''

  const inlinedBlocks = await Promise.all(
    cssBlocks.map((cssText) => inlineFontAssetUrlsInCss(cssText))
  )

  return inlinedBlocks.filter(Boolean).join('\n')
}

function copyComputedStylesRecursive(source: Element, target: Element): void {
  const computedStyle = window.getComputedStyle(source)
  const declarations = Array.from(computedStyle)
    .map((property) => `${property}:${computedStyle.getPropertyValue(property)};`)
    .join('')

  target.setAttribute('style', declarations)

  const sourceChildren = Array.from(source.children)
  const targetChildren = Array.from(target.children)
  sourceChildren.forEach((child, index) => {
    const targetChild = targetChildren[index]
    if (targetChild) {
      copyComputedStylesRecursive(child, targetChild)
    }
  })
}

async function buildExactPdfHtmlFromCardElement(cardElement: HTMLElement): Promise<string> {
  const clone = cardElement.cloneNode(true) as HTMLElement
  copyComputedStylesRecursive(cardElement, clone)
  clone.querySelectorAll('[data-pdf-exclude="true"]').forEach((node) => node.remove())
  clone.querySelectorAll<HTMLElement>('[data-pdf-force-white-card="true"]').forEach((node) => {
    node.style.background = '#ffffff'
    node.style.backgroundColor = '#ffffff'
    node.style.backgroundImage = 'none'
    node.style.boxShadow = 'none'
  })

  const embeddedFontFaceCss = await collectEmbeddedFontFaceCss()
  const width = Math.max(1, Math.ceil(cardElement.getBoundingClientRect().width))
  const headMarkup = collectPdfHeadMarkup()
  const rootCssVariables = collectRootCssVariableMarkup()
  const htmlClass = escapeHtmlAttribute(document.documentElement.className || '')
  const bodyClass = escapeHtmlAttribute(document.body.className || '')
  const resolvedBodyFontFamily = escapeHtmlAttribute(
    window.getComputedStyle(document.body).fontFamily || 'Inter, Arial, sans-serif'
  )
  const baseHref = escapeHtmlAttribute(
    window.location.origin.endsWith('/') ? window.location.origin : `${window.location.origin}/`
  )
  const pdfFooterMarkup = `
    <section class="pdf-brand-footer">
      <img src="/kss-logo.png" alt="KSS NW Ltd" class="pdf-brand-footer__logo pdf-brand-footer__logo--kss" />
      <img src="/tfs-logo.svg" alt="The Fragrance Shop" class="pdf-brand-footer__logo pdf-brand-footer__logo--fa" />
    </section>
  `

  return `<!doctype html>
<html lang="en" class="${htmlClass}" style="${escapeHtmlAttribute(rootCssVariables)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base href="${baseHref}" />
    ${headMarkup}
    ${embeddedFontFaceCss ? `<style id="pdf-embedded-fonts">${embeddedFontFaceCss}</style>` : ''}
    <style>
      html, body { margin: 0; padding: 0; background: #f8fafc; }
      body { width: ${width}px; margin: 0 auto; }
      #pdf-root { width: ${width}px; margin: 0 auto; box-sizing: border-box; }
      html, body, #pdf-root { font-family: ${resolvedBodyFontFamily}; }
      body, #pdf-root { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .pdf-brand-footer {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 72px;
        margin-top: 12px;
        padding: 8px 24px 0;
      }
      .pdf-brand-footer__logo {
        display: block;
        object-fit: contain;
      }
      .pdf-brand-footer__logo--kss {
        max-height: 120px;
        width: auto;
      }
      .pdf-brand-footer__logo--fa {
        max-height: 92px;
        width: auto;
      }
    </style>
  </head>
  <body class="${bodyClass}">
    <main id="pdf-root">${clone.outerHTML}${pdfFooterMarkup}</main>
  </body>
</html>`
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
  const monthDate = new Date(`${newsletterMonth}-01T00:00:00`)
  const periodLabel = Number.isNaN(monthDate.getTime())
    ? newsletterMonth
    : format(monthDate, 'MMMM yyyy')

  const rankedStores = [...report.stores].sort(
    (a, b) => (b.latestAuditScore ?? -1) - (a.latestAuditScore ?? -1)
  )
  const storesWithRank = rankedStores.map((store, index) => ({
    ...store,
    rank: index + 1,
  }))
  const revisitRiskRadar = report.revisitRiskMetrics.radar.map((point) => {
    const meta = getRadarAxisMeta(point.axis)
    return {
      ...point,
      axisLabel: meta.shortLabel,
      axisDetail: meta.detail,
      valueLabel: getRiskProfileValueLabel(point.axis, report.revisitRiskMetrics),
      valueCount: getRiskProfileValueCount(point.axis, report.revisitRiskMetrics),
    }
  })
  const visibleRiskProfileItems = revisitRiskRadar.filter((point) => point.valueCount > 0)
  const riskSummaryChips = [
    {
      label: '80-84% Watch',
      value: report.revisitRiskMetrics.borderlineStoreCount,
      className: 'border-amber-100 bg-amber-50 text-amber-700',
    },
    {
      label: 'Predicted Revisits',
      value: report.revisitRiskMetrics.predictedRevisitCount,
      className: 'border-rose-100 bg-rose-50 text-rose-700',
    },
    {
      label: 'Close This Week',
      value: report.revisitRiskMetrics.closeActionsTarget,
      className: 'border-blue-100 bg-blue-50 text-blue-700',
    },
    {
      label: 'Already <80%',
      value: report.revisitRiskMetrics.alreadyBelowThresholdCount,
      className: 'border-red-100 bg-red-50 text-red-700',
    },
  ].filter((chip) => chip.value > 0)
  const revisitRiskStores = report.revisitRiskMetrics.highRiskStores.slice(0, 4)

  const { activeCount, highPriorityCount, overdueCount } = report.storeActionMetrics
  const complianceStatus: 'GREEN' | 'AMBER' | 'RED' =
    overdueCount > 0 ? 'RED' : highPriorityCount > 0 || activeCount > 2 ? 'AMBER' : 'GREEN'
  const complianceStatusClass =
    complianceStatus === 'GREEN'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
      : complianceStatus === 'AMBER'
        ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
        : 'bg-rose-50 text-rose-700 ring-rose-600/20'
  const formatPlannedVisitLabel = (plannedVisitDate: string | null) => {
    if (!plannedVisitDate) return 'Not yet visited'
    const parsedDate = new Date(plannedVisitDate)
    return Number.isNaN(parsedDate.getTime())
      ? 'Not yet visited'
      : `Planned visit on ${format(parsedDate, 'dd/MM/yyyy')}`
  }

  const renderLeaderboardColumn = (
    stores: Array<typeof storesWithRank[number]>
  ) => (
    <div className="divide-y divide-slate-100">
      {stores.map((store) => (
        <div
          key={`${store.storeName}-${store.storeCode || 'na'}-${store.rank}`}
          className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors"
        >
          <div className="w-7 text-center">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold bg-slate-900 text-white">
              {store.rank}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-800">{formatStoreName(store.storeName)}</p>
            {store.storeCode ? (
              <p className="text-[10px] font-medium text-slate-400">{store.storeCode}</p>
            ) : null}
          </div>
          <div className="text-right">
            {typeof store.latestAuditScore === 'number' ? (
              <span
                className={`inline-flex rounded px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${getScoreBadgeClass(
                  store.latestAuditScore
                )}`}
              >
                {`${store.latestAuditScore.toFixed(1)}%`}
              </span>
            ) : (
              <span className="text-[10px] font-medium text-slate-500">
                {formatPlannedVisitLabel(store.plannedVisitDate)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <article
      id={getNewsletterCardElementId(report.areaCode)}
      className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm"
    >
      <div className="mb-6 border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-indigo-600">
              <Shield className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                Safety & Compliance
              </span>
            </div>
            <div>
              <h4 className="text-3xl font-black tracking-tight text-slate-900">Quarterly Update</h4>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  {report.areaLabel}
                </span>
                {report.areaManagerName ? (
                  <>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span>{report.areaManagerName}</span>
                  </>
                ) : null}
                {report.areaManagerEmail ? (
                  <>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span>{report.areaManagerEmail}</span>
                  </>
                ) : null}
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {periodLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <Button
              data-pdf-exclude="true"
              variant="outline"
              onClick={() => onDownloadPdf(report)}
              disabled={pdfLoadingAreaCode === report.areaCode}
              className="min-h-[42px] rounded-full px-5"
            >
              {pdfLoadingAreaCode === report.areaCode ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing PDF...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Download {report.areaLabel} PDF
                </>
              )}
            </Button>
            <p className="text-[11px] font-medium text-slate-500">
              Report generated: {format(new Date(), 'MMMM d, yyyy')}
            </p>
            <p className="text-[11px] text-slate-400">{report.storeCount} stores reporting</p>
          </div>
        </div>

      </div>

      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]"
          data-pdf-force-white-card="true"
        >
          <div className="mb-3 inline-flex rounded-lg bg-emerald-50 p-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Avg Score</p>
          <p className={`text-2xl font-black tracking-tight ${getScoreTextClass(report.auditMetrics.averageLatestScore)}`}>
            {toPercentLabel(report.auditMetrics.averageLatestScore)}
          </p>
        </div>
        <div
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]"
          data-pdf-force-white-card="true"
        >
          <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-2">
            <CheckCircle2 className="h-4 w-4 text-slate-700" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Completed</p>
          <p className="text-2xl font-black tracking-tight text-slate-900">
            {report.auditMetrics.auditsCompletedThisMonth}
          </p>
        </div>
        <div
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]"
          data-pdf-force-white-card="true"
        >
          <div className="mb-3 inline-flex rounded-lg bg-amber-50 p-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Below 85%</p>
          <p className="text-2xl font-black tracking-tight text-amber-600">
            {report.auditMetrics.belowThresholdCount}
          </p>
        </div>
        <div
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]"
          data-pdf-force-white-card="true"
        >
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Compliance Status
          </p>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${complianceStatusClass}`}>
            {complianceStatus}
          </span>
          <p className="mt-2 text-[11px] font-medium text-slate-500">
            Open {activeCount} | High {highPriorityCount} | Overdue {overdueCount}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <TrendingUp className="h-3.5 w-3.5" />
              Revisit Risk Profile
            </h5>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              Shows stores most at risk of falling into revisit status, based on start-of-year audit position,
              unresolved fire safety actions and open incident pressure.
            </p>
            {visibleRiskProfileItems.length > 0 ? (
              <div>
                <div className="mb-3">
                  <p className="text-[11px] text-slate-500">
                    Use this card to spot where revisit exposure is above target and which stores need early action.
                  </p>
                </div>
                <div className="space-y-4">
                  {visibleRiskProfileItems.map((point) => {
                    const status = getRadarStatus(point.risk, point.target)
                    const exceedsThreshold = point.risk > point.target
                    const targetLeft = Math.max(0, Math.min(100, point.target))
                    const benchmarkLeft = Math.max(0, Math.min(100, point.benchmark))

                    return (
                      <div key={`risk-profile-${point.axis}`} className="rounded-lg border border-slate-200 bg-white/60 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">{point.axisLabel}</p>
                          <p className="text-xs font-semibold text-slate-700">
                            {point.valueLabel}
                            <span className="text-slate-400"> | Target: {point.target}%</span>
                          </p>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">{point.axisDetail}</p>
                        <div className="relative mt-2 h-4 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${getRiskBarFillClass(point.risk, point.target)}`}
                            style={{ width: `${point.risk}%` }}
                          />
                          <div
                            className="absolute inset-y-0 w-0.5 border-l border-dashed border-white/90"
                            style={{ left: `${targetLeft}%` }}
                          />
                          <div
                            className="absolute inset-y-0 w-0.5 bg-blue-700/70"
                            style={{ left: `${benchmarkLeft}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p
                            className={`text-[10px] font-bold uppercase tracking-wide ${
                              exceedsThreshold ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {exceedsThreshold
                              ? 'Exceeds acceptable risk threshold'
                              : 'Within acceptable risk threshold'}
                          </p>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${status.className}`}
                          >
                            Area {point.risk}% | Network {point.benchmark}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {riskSummaryChips.length > 0 ? (
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${riskSummaryChips.length}, minmax(0, 1fr))` }}
                  >
                    {riskSummaryChips.map((chip) => (
                      <div
                        key={`risk-chip-${chip.label}`}
                        className={`rounded-lg border px-2.5 py-2 text-center ${chip.className}`}
                      >
                        <p className="text-[10px] uppercase tracking-wide">{chip.label}</p>
                        <p className="text-sm font-bold">{chip.value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {revisitRiskStores.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 text-[11px] text-slate-600">
                    {revisitRiskStores.map((store, idx) => (
                      <li key={`${store.storeName}-${store.storeCode || 'na'}-${idx}`}>
                        {typeof store.startOfYearAuditScore === 'number' && store.startOfYearAuditScore < 80
                          ? 'Mandatory revisit'
                          : 'Watch list'}{' '}
                        -{' '}
                        {formatStoreName(store.storeName)}
                        {store.storeCode ? ` (${store.storeCode})` : ''} | Revisit risk {store.riskScore}%
                        {typeof store.startOfYearAuditScore === 'number'
                          ? ` | Start-of-year audit ${store.startOfYearAuditScore.toFixed(0)}%`
                          : ''}
                        {store.openP1Actions + store.openP2Actions > 0
                          ? ` | High-priority actions ${store.openP1Actions + store.openP2Actions}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No active revisit store/action risk indicators for this area.</p>
            )}

            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-700">
                Revisit Prevention Alert
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                {report.revisitRiskMetrics.narrative}
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
            <div className="pointer-events-none absolute -top-8 -right-6 h-24 w-24 rounded-full bg-amber-100 blur-2xl" />
            <h5 className="relative mb-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              H&S Priorities
            </h5>
          <p className="relative mb-3 text-[11px] leading-relaxed text-amber-800/80">
            Summarises the most common open H&amp;S action themes in this area, so managers can focus on the issues
            affecting the most stores.
          </p>
            {report.storeActionMetrics.focusItems.length > 0 ? (
              <ul className="relative space-y-3">
                {report.storeActionMetrics.focusItems.map((item, idx) => (
                  <li key={`${item.topic}-${idx}`} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">{item.topic}</p>
                      <p className="text-[11px] font-medium text-slate-500">
                        {item.actionCount} actions | {item.storeCount} stores
                      </p>
                      <p className="text-[11px] text-slate-600">{item.managerPrompt}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="relative text-sm text-slate-600">No active H&S task themes available.</p>
            )}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3">
              <h5 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <Shield className="h-3.5 w-3.5" />
                Store Leaderboard
              </h5>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                By audit score
              </span>
            </div>
            <div className="border-b border-slate-100 px-4 py-2.5">
              <p className="text-[11px] leading-relaxed text-slate-500">
                Ranks stores by their latest completed audit score only. This is separate from revisit risk and
                reflects current audit performance.
              </p>
            </div>
            <div>{renderLeaderboardColumn(storesWithRank)}</div>
          </div>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        {report.hsAuditMetrics.highlights.length > 0 ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
            <h5 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <BarChart3 className="h-3.5 w-3.5" /> H&S Highlights
            </h5>
            <p className="mb-3 text-[11px] leading-relaxed text-blue-900/70">
              Highlights recent H&amp;S audit outcomes for this area, including completions, average score and notable
              low-scoring results.
            </p>
            <div className="mb-2 text-xs text-slate-600">
              Completed: <span className="font-semibold">{report.hsAuditMetrics.auditsCompletedThisMonth}</span>
              {' | '}
              Avg: <span className="font-semibold">{toPercentLabel(report.hsAuditMetrics.averageScore)}</span>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {report.hsAuditMetrics.highlights.map((line, idx) => (
                <li key={`${line.slice(0, 20)}-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h5 className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Reminders &amp; Updates
          </h5>
          <p className="mb-3 text-[11px] leading-relaxed text-emerald-900/70">
            Pulls together the key operational reminders and policy updates that should be reinforced across stores in
            this area.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-white/70 p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Reminders</p>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {report.reminders.map((line, idx) => (
                  <li key={`r-${idx}`}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white/70 p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Legislation / Policy</p>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {report.legislationUpdates.map((line, idx) => (
                  <li key={`l-${idx}`}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4" data-pdf-exclude="true">
          <h5 className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" /> KSS NW Consultant Briefing
          </h5>
          {aiPromptPack ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-indigo-100 bg-white/80 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                    Regional Summary
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">{aiPromptPack.generateBriefing}</p>
                </div>
                <div className="rounded-lg border border-indigo-100 bg-white/80 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                    Risk Pattern
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">{aiPromptPack.analyzeRegionalRisk}</p>
                </div>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-white/80 p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                  Newsletter Email Draft
                </p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
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
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50/60" data-pdf-exclude="true">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Show newsletter copy (for email body)
        </summary>
        <pre className="max-h-[260px] overflow-auto border-t border-slate-200 bg-white p-3 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
          {report.newsletterMarkdown}
        </pre>
      </details>
    </article>
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

  const visibleAvailableAreas = (newsletterData?.availableAreas ?? []).filter(
    (area) => area.code !== 'UNASSIGNED'
  )
  const visibleAreaReports = (newsletterData?.areaReports ?? []).filter(
    (report) => report.areaCode !== 'UNASSIGNED'
  )
  const visibleAiPromptCount = visibleAreaReports.filter(
    (report) => newsletterAiByArea[report.areaCode]
  ).length

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
      ? `${formatStoreName(scoredStores[0].storeName)} (${scoredStores[0].latestAuditScore.toFixed(1)}%)`
      : 'N/A'

    const bottomStore = scoredStores[scoredStores.length - 1]
      ? `${formatStoreName(scoredStores[scoredStores.length - 1].storeName)} (${scoredStores[scoredStores.length - 1].latestAuditScore.toFixed(1)}%)`
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
          storeName: formatStoreName(store.storeName),
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
    const reports = visibleAreaReports
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
      const cardElement = document.getElementById(
        getNewsletterCardElementId(report.areaCode)
      ) as HTMLElement | null

      if (!cardElement) {
        throw new Error('Could not find the rendered newsletter card to export.')
      }

      const html = await buildExactPdfHtmlFromCardElement(cardElement)
      const preferredName = `monthly-newsletter-${newsletterMonth}-${report.areaCode.toLowerCase()}-exact-v2.pdf`

      const response = await fetch('/api/reports/monthly-newsletter/pdf-exact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html,
          filename: preferredName,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Failed to export exact on-screen PDF')
      }

      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/)
      const filename = filenameMatch?.[1] || preferredName

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
    <div className="flex flex-col gap-6 md:gap-8 bg-slate-50/50 min-h-screen max-w-full overflow-x-hidden">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-slate-900">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-sm flex-shrink-0">
              <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports & Exports</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-500 max-w-2xl md:ml-11">
            Download detailed compliance data or generate AI-powered insights for your team.
          </p>
        </div>
      </div>

      <Tabs defaultValue="monthly" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 items-center rounded-[20px] bg-slate-100 p-1 text-slate-600 md:inline-flex md:w-auto md:justify-start md:rounded-md">
          <TabsTrigger value="monthly" className="min-h-[46px] rounded-[16px] md:min-h-[40px]">
            Monthly Dashboard
          </TabsTrigger>
          <TabsTrigger value="export" className="min-h-[46px] rounded-[16px] md:min-h-[40px]">
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
                className="min-h-[44px] w-full rounded-2xl bg-amber-600 hover:bg-amber-700 md:w-auto md:rounded-md"
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
                  className="h-11 min-h-[48px] w-full rounded-[16px] border border-input bg-background px-4 py-3 text-base ring-offset-background md:h-10 md:min-h-10 md:rounded-md md:px-3 md:py-2 md:text-sm"
                >
                  <option value="all">All Areas</option>
                  {visibleAvailableAreas.map((area) => (
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

            {newsletterData && visibleAreaReports.length > 0 && (
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
                      Generated: {visibleAiPromptCount}/{visibleAreaReports.length}
                      {newsletterAiLoadingArea ? ` | Currently: ${newsletterAiLoadingArea}` : ''}
                    </p>
                  </div>
                  <Button
                    onClick={handleGenerateAllAiPromptPacks}
                    disabled={newsletterAiBulkLoading || newsletterLoading}
                    className="min-h-[44px] w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 md:w-auto md:rounded-md"
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

            {newsletterData && visibleAreaReports.length > 0 && (
              <div className="space-y-5">
                {visibleAreaReports.map((report) => (
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

            {newsletterData && visibleAreaReports.length === 0 && !newsletterLoading && (
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
