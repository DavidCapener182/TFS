import React from 'react'
import fs from 'fs'
import path from 'path'
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import type {
  AreaNewsletterReport,
  NewsletterAIPromptPack,
  NewsletterAreaStoreRow,
  NewsletterStoreActionFocusItem,
} from '@/lib/reports/monthly-newsletter-types'

interface MonthlyNewsletterPDFProps {
  report: AreaNewsletterReport
  periodLabel: string
  generatedAt: string
  aiPromptPack?: NewsletterAIPromptPack | null
}

const MAX_CHART_ROWS = 4
const MAX_POSTER_FOCUS_CARDS = 6
const FOCUS_IMAGE_FALLBACK_PATH = '/newsletter-placeholders/focus-generic.svg'
const imageDataUriCache = new Map<string, string | null>()

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  areaCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: {
    width: '74%',
  },
  headerRight: {
    width: '26%',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 1,
    fontSize: 7.5,
    color: '#475569',
  },
  generated: {
    marginTop: 1,
    fontSize: 7.5,
    color: '#64748b',
    textAlign: 'right',
  },
  kpiGrid: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginRight: 6,
  },
  kpiCardLast: {
    marginRight: 0,
  },
  kpiLabel: {
    fontSize: 7,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  kpiValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: 'bold',
  },
  briefingCard: {
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    padding: 6,
    marginBottom: 6,
  },
  briefingTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#4338ca',
    marginBottom: 4,
  },
  briefingBody: {
    fontSize: 6.8,
    color: '#334155',
    lineHeight: 1.2,
  },
  briefingDivider: {
    borderTopWidth: 1,
    borderTopColor: '#c7d2fe',
    marginVertical: 4,
  },
  briefingSubTitle: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#4338ca',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#334155',
    marginBottom: 6,
  },
  chartRow: {
    marginBottom: 3,
  },
  chartTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  chartStoreName: {
    fontSize: 7,
    color: '#0f172a',
    width: '78%',
  },
  chartScoreText: {
    fontSize: 7,
    color: '#334155',
    width: '22%',
    textAlign: 'right',
  },
  barTrack: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
  },
  leaderboardColumns: {
    flexDirection: 'row',
  },
  leaderboardColumn: {
    width: '49%',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 8,
    overflow: 'hidden',
  },
  leaderboardColumnFull: {
    width: '100%',
  },
  leaderboardSpacer: {
    width: '2%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 5,
    paddingVertical: 3.5,
  },
  tableHeaderCell: {
    fontSize: 7,
    color: '#64748b',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  tableColRank: {
    width: '10%',
  },
  tableColStore: {
    width: '66%',
  },
  tableColScore: {
    width: '24%',
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingHorizontal: 5,
    paddingVertical: 2.2,
  },
  tableCell: {
    fontSize: 7,
    color: '#0f172a',
  },
  tableRank: {
    fontSize: 7,
    color: '#64748b',
    fontWeight: 'bold',
  },
  tableStoreName: {
    fontSize: 7,
    color: '#0f172a',
    fontWeight: 'bold',
  },
  tableStoreCode: {
    fontSize: 7,
    color: '#64748b',
    marginTop: 1,
  },
  panelRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  panel: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    marginRight: 6,
  },
  panelWide: {
    width: '60%',
  },
  panelNarrow: {
    width: '40%',
  },
  panelLast: {
    marginRight: 0,
  },
  focusColumns: {
    flexDirection: 'row',
  },
  focusColumn: {
    width: '49%',
  },
  focusSpacer: {
    width: '2%',
  },
  panelTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  panelItem: {
    fontSize: 6.7,
    color: '#1e293b',
    marginBottom: 2,
    lineHeight: 1.15,
  },
  panelMuted: {
    fontSize: 6.7,
    color: '#475569',
  },
  posterPage: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#e2e8f0',
    backgroundColor: '#f1f5f9',
  },
  posterFrame: {
    borderWidth: 1,
    borderColor: '#1f314a',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#040b1c',
    minHeight: '100%',
  },
  posterHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#1f314a',
    paddingBottom: 8,
    marginBottom: 8,
  },
  posterBrand: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#f8fafc',
    textAlign: 'center',
    letterSpacing: 1.8,
  },
  posterUpdatePill: {
    marginTop: 6,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 7.2,
    letterSpacing: 0.7,
    fontWeight: 'bold',
    color: '#cbd5e1',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  posterMetricsRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  posterMetricTile: {
    flex: 1,
    marginRight: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0b3b8a',
    backgroundColor: '#05153b',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  posterMetricTileLast: {
    marginRight: 0,
  },
  posterMetricLabel: {
    fontSize: 6.6,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 0.6,
  },
  posterMetricValue: {
    marginTop: 7,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  posterStatusTile: {
    borderColor: '#334155',
    backgroundColor: '#27364f',
  },
  posterStatusHeadline: {
    marginTop: 4,
    fontSize: 9.8,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  posterStatusBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#f4be09',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    color: '#111827',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  posterStatusMeta: {
    marginTop: 6,
    fontSize: 6.8,
    color: '#d1d5db',
    lineHeight: 1.25,
  },
  posterTrendLine: {
    marginBottom: 8,
    fontSize: 8,
    color: '#cbd5e1',
  },
  posterSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  posterSectionRule: {
    width: 26,
    borderWidth: 1,
    borderColor: '#84cc16',
  },
  posterSectionTitle: {
    marginHorizontal: 8,
    fontSize: 8.4,
    fontWeight: 'bold',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#84cc16',
  },
  posterFocusRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  posterFocusCard: {
    width: '32.1%',
    borderWidth: 1,
    borderColor: '#0b3b8a',
    borderRadius: 10,
    backgroundColor: '#020c26',
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginRight: 6,
  },
  posterFocusCardLast: {
    marginRight: 0,
  },
  posterFocusCardEmpty: {
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 142,
  },
  posterFocusCardEmptyText: {
    fontSize: 7.2,
    color: '#475569',
    textTransform: 'uppercase',
  },
  posterPriorityBadge: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 6.8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  posterFocusTitle: {
    marginTop: 7,
    fontSize: 9.2,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#f8fafc',
    lineHeight: 1.1,
  },
  posterFocusImage: {
    width: '100%',
    height: 110,
    borderRadius: 7,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1e3a8a',
  },
  posterFocusPrompt: {
    marginTop: 8,
    fontSize: 7.2,
    color: '#94a3b8',
    lineHeight: 1.25,
  },
  posterBottomRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  posterRemindersPanel: {
    width: '88%',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    backgroundColor: '#020c26',
    paddingHorizontal: 9,
    paddingVertical: 8,
    marginRight: 8,
  },
  posterRemindersColumns: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  posterRemindersColumn: {
    width: '49%',
  },
  posterRemindersDivider: {
    width: '2%',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    marginHorizontal: 6,
  },
  posterTargetPanel: {
    width: '12%',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    backgroundColor: '#020c26',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  posterTargetValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  posterTargetLabel: {
    marginTop: 6,
    fontSize: 6.4,
    color: '#64748b',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  posterRemindersTitle: {
    fontSize: 7.4,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    color: '#fbbf24',
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  posterLegislationTitle: {
    fontSize: 7.2,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    color: '#60a5fa',
    marginBottom: 5,
    letterSpacing: 0.45,
  },
  posterReminderLine: {
    fontSize: 7.1,
    lineHeight: 1.24,
    color: '#d1d5db',
    marginBottom: 3,
  },
  posterReminderEmpty: {
    fontSize: 7.1,
    color: '#94a3b8',
  },
  posterAccountabilityLine: {
    marginTop: 2,
    paddingTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
    textAlign: 'center',
    fontSize: 7.8,
    color: '#d1d5db',
  },
  posterFooterMeta: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 7.2,
    color: '#94a3b8',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 4,
    fontSize: 7,
    color: '#64748b',
  },
})

function toScoreLabel(value: number | null): string {
  if (typeof value !== 'number') return 'N/A'
  return `${value.toFixed(1)}%`
}

function scoreColor(score: number | null): string {
  if (typeof score !== 'number') return '#64748b'
  if (score >= 90) return '#059669'
  if (score >= 85) return '#0284c7'
  if (score >= 80) return '#d97706'
  return '#dc2626'
}

function scoreBarWidth(score: number | null): string {
  if (typeof score !== 'number') return '5%'
  const clamped = Math.max(5, Math.min(100, Math.round(score)))
  return `${clamped}%`
}

function formatGeneratedLabel(generatedAt: string): string {
  const parsed = new Date(generatedAt)
  if (Number.isNaN(parsed.getTime())) return generatedAt
  return format(parsed, 'd MMM yyyy HH:mm')
}

function formatStoreLabel(store: NewsletterAreaStoreRow): string {
  return `${store.storeName}${store.storeCode ? ` (${store.storeCode})` : ''}`
}

function sanitizeMarkdownText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`/g, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function resolveAreaManagerGreeting(areaLabel: string): string {
  const normalized = areaLabel.trim().toUpperCase()
  const areaMatch = normalized.match(/^A(\d+)$/)
  if (areaMatch) {
    return `Dear Area ${Number(areaMatch[1])} Manager,`
  }
  if (!areaLabel.trim()) return 'Dear Area Manager,'
  return `Dear ${areaLabel.trim()} Manager,`
}

function extractSubjectAndBody(
  newsletter: string,
  fallbackAreaLabel: string
): { subjectLine: string; body: string } {
  const lines = newsletter.split('\n')
  let subject = ''
  let subjectRemoved = false
  const bodyLines: string[] = []

  lines.forEach((line) => {
    if (!subjectRemoved) {
      const match = line.match(/^\s*Subject:\s*(.+)\s*$/i)
      if (match) {
        subject = match[1].trim()
        subjectRemoved = true
        return
      }
    }
    bodyLines.push(line)
  })

  const fallbackSubject = `Monthly Health & Safety Update - ${fallbackAreaLabel}`
  return {
    subjectLine: `Subject: ${subject || fallbackSubject}`,
    body: bodyLines.join('\n').trim(),
  }
}

function personalizeGreeting(body: string, greeting: string): string {
  if (!body.trim()) return greeting
  if (/^Dear\s+.*?,/im.test(body)) {
    return body.replace(/^Dear\s+.*?,/im, greeting)
  }
  return `${greeting}\n\n${body}`
}

function toBulletLine(value: string): string {
  const normalized = value.trim().replace(/^[-*]\s+/, '')
  return `• ${normalized}`
}

function formatFocusLine(item: NewsletterStoreActionFocusItem): string {
  return `${item.topic} - ${item.actionCount} actions across ${item.storeCount} stores. ${item.managerPrompt}`
}

type ComplianceStatus = 'GREEN' | 'AMBER' | 'RED'

interface PosterFocusCard {
  title: string
  prompt: string
  imageSrc: string | null
  toneColor: string
  toneTextColor: string
}

function resolveComplianceStatus(
  metrics: AreaNewsletterReport['storeActionMetrics']
): ComplianceStatus {
  if (metrics.overdueCount > 0) return 'RED'
  if (metrics.highPriorityCount > 0 || metrics.activeCount > 0) return 'AMBER'
  return 'GREEN'
}

function toLocalPublicFilePath(assetPath: string): string {
  const normalized = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath
  return path.join(process.cwd(), 'public', normalized)
}

function mimeTypeFromAssetPath(assetPath: string): string {
  const ext = path.extname(assetPath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

function toDataUriFromPublicAsset(assetPath: string): string | null {
  if (imageDataUriCache.has(assetPath)) {
    return imageDataUriCache.get(assetPath) || null
  }

  try {
    const absolutePath = toLocalPublicFilePath(assetPath)
    if (!fs.existsSync(absolutePath)) {
      imageDataUriCache.set(assetPath, null)
      return null
    }

    const file = fs.readFileSync(absolutePath)
    const mime = mimeTypeFromAssetPath(assetPath)
    const dataUri = `data:${mime};base64,${file.toString('base64')}`
    imageDataUriCache.set(assetPath, dataUri)
    return dataUri
  } catch {
    imageDataUriCache.set(assetPath, null)
    return null
  }
}

function resolveImageDataUri(primaryPath: string, fallbackPath: string): string | null {
  return toDataUriFromPublicAsset(primaryPath) || toDataUriFromPublicAsset(fallbackPath)
}

function resolvePosterFocusImagePath(topic: string): string {
  const lower = topic.toLowerCase()
  if (lower.includes('emergency') && lower.includes('lighting')) {
    return '/newsletter-placeholders/focus-emergency-lighting-tests.png'
  }
  if (lower.includes('panel') && lower.includes('fault')) {
    return '/newsletter-placeholders/focus-fire-panel-fault-follow-up.png'
  }
  if (lower.includes('housekeeping') || lower.includes('slip') || lower.includes('trip')) {
    return '/newsletter-placeholders/focus-housekeeping-safe-access.png'
  }
  if (lower.includes('contractor') || lower.includes('visitor') || lower.includes('permit')) {
    return '/newsletter-placeholders/focus-contractor-visitor-controls.png'
  }
  if (
    lower.includes('fire') ||
    lower.includes('exit') ||
    lower.includes('door') ||
    lower.includes('escape')
  ) {
    return '/newsletter-placeholders/focus-fire-door-escape-routes.png'
  }
  if (lower.includes('height') || lower.includes('ladder') || lower.includes('step')) {
    return '/newsletter-placeholders/focus-work-at-height-equipment.png'
  }
  if (lower.includes('training') || lower.includes('refresher') || lower.includes('induction')) {
    return '/newsletter-placeholders/focus-training-refresher-completion.png'
  }
  if (
    lower.includes('coshh') ||
    lower.includes('hazardous') ||
    lower.includes('chemical') ||
    lower.includes('sds')
  ) {
    return '/newsletter-placeholders/focus-coshh-hazardous-substances.png'
  }
  return '/newsletter-placeholders/focus-generic.png'
}

function normalizePosterFocusTitle(topic: string, index: number): string {
  const trimmed = topic.trim()
  if (!trimmed) return `Focus Item ${index + 1}`

  const lower = trimmed.toLowerCase()
  if (lower.includes('housekeeping') || lower.includes('slip') || lower.includes('trip')) {
    return 'Housekeeping And Safe Access'
  }
  if (lower.includes('contractor') || lower.includes('visitor') || lower.includes('permit')) {
    return 'Contractor And Visitor Controls'
  }
  if (
    lower.includes('fire') &&
    (lower.includes('door') || lower.includes('exit') || lower.includes('escape'))
  ) {
    return 'Fire Door And Escape Route Controls'
  }
  if (lower.includes('height') || lower.includes('ladder') || lower.includes('step')) {
    return 'Work-At-Height Equipment Checks'
  }
  if (lower.includes('training') || lower.includes('refresher') || lower.includes('induction')) {
    return 'Training And Refresher Completion'
  }
  if (
    lower.includes('coshh') ||
    lower.includes('hazardous') ||
    lower.includes('chemical') ||
    lower.includes('sds')
  ) {
    return 'COSHH And Hazardous Substances'
  }
  if (lower.includes('emergency') && lower.includes('lighting')) {
    return 'Emergency Lighting Tests'
  }
  if (lower.includes('panel') && lower.includes('fault')) {
    return 'Fire Panel Fault Follow-Up'
  }

  const compact = trimmed.replace(/\s+/g, ' ').replace(/[.?!]+$/, '')
  const words = compact.split(' ')
  if (words.length <= 5) return compact
  return `${words.slice(0, 5).join(' ')}...`
}

function tightenPosterPrompt(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return 'Maintain controls and verify evidence is logged against each action.'

  return trimmed
    .replace(
      /reinforce daily housekeeping checks so walkways, stock areas, and exits stay clear throughout the trading day\./i,
      'Ensure sales floor and stock routes remain clear throughout trading hours.'
    )
    .replace(
      /check ladder and step equipment is uniquely identified, inspected, and used under the correct controls\./i,
      'Verify work-at-height equipment is identified, inspected and logged.'
    )
    .replace(/^ask store teams to\s+/i, 'Store teams must ')
    .replace(/^ask area managers to\s+/i, 'Area managers must ')
}

function buildPosterFocusCards(report: AreaNewsletterReport): PosterFocusCard[] {
  const tones = [
    { bg: '#10b981', text: '#042f2e' },
    { bg: '#6366f1', text: '#e0e7ff' },
    { bg: '#e11d48', text: '#ffe4e6' },
    { bg: '#f59e0b', text: '#3f2b01' },
    { bg: '#06b6d4', text: '#083344' },
    { bg: '#334155', text: '#e2e8f0' },
  ]

  return report.storeActionMetrics.focusItems
    .slice(0, MAX_POSTER_FOCUS_CARDS)
    .map((item, index): PosterFocusCard => {
      const imagePath = resolvePosterFocusImagePath(item.topic || '')
      const tone = tones[index % tones.length]
      return {
        title: normalizePosterFocusTitle(item.topic || '', index),
        prompt: tightenPosterPrompt(item.managerPrompt || ''),
        imageSrc: resolveImageDataUri(imagePath, FOCUS_IMAGE_FALLBACK_PATH),
        toneColor: tone.bg,
        toneTextColor: tone.text,
      }
    })
}

function renderLeaderboardColumn(
  rows: NewsletterAreaStoreRow[],
  rankOffset: number,
  keyPrefix: string,
  isFullWidth = false
) {
  const columnStyle = isFullWidth
    ? [styles.leaderboardColumn, styles.leaderboardColumnFull]
    : styles.leaderboardColumn

  return (
    <View style={columnStyle}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, styles.tableColRank]}>#</Text>
        <Text style={[styles.tableHeaderCell, styles.tableColStore]}>Store</Text>
        <Text style={[styles.tableHeaderCell, styles.tableColScore]}>Score</Text>
      </View>
      {rows.map((store, index) => (
        <View key={`${keyPrefix}-${index}`} style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.tableColRank, styles.tableRank]}>
            {rankOffset + index + 1}
          </Text>
          <View style={styles.tableColStore}>
            <Text style={styles.tableStoreName}>{store.storeName}</Text>
            {store.storeCode ? <Text style={styles.tableStoreCode}>{store.storeCode}</Text> : null}
          </View>
          <Text
            style={[
              styles.tableCell,
              styles.tableColScore,
              { color: scoreColor(store.latestAuditScore), fontWeight: 'bold' },
            ]}
          >
            {toScoreLabel(store.latestAuditScore)}
          </Text>
        </View>
      ))}
    </View>
  )
}

export function MonthlyNewsletterPDF({
  report,
  periodLabel,
  generatedAt,
  aiPromptPack = null,
}: MonthlyNewsletterPDFProps) {
  const generatedLabel = formatGeneratedLabel(generatedAt)
  const sortedStores = [...report.stores].sort(
    (a, b) => (b.latestAuditScore ?? -1) - (a.latestAuditScore ?? -1)
  )
  const chartRows = sortedStores
    .filter((store) => typeof store.latestAuditScore === 'number')
    .slice(0, MAX_CHART_ROWS)

  const leaderboardSplitIndex = Math.ceil(sortedStores.length / 2)
  const leaderboardFirstColumn = sortedStores.slice(0, leaderboardSplitIndex)
  const leaderboardSecondColumn = sortedStores.slice(leaderboardSplitIndex)
  const reminders = report.reminders
  const legislationUpdates = report.legislationUpdates
  const focusItems = report.storeActionMetrics.focusItems
  const focusSplitIndex = Math.ceil(focusItems.length / 2)
  const focusLeftColumn = focusItems.slice(0, focusSplitIndex)
  const focusRightColumn = focusItems.slice(focusSplitIndex)
  const complianceStatus = resolveComplianceStatus(report.storeActionMetrics)
  const complianceStatusMeta =
    complianceStatus === 'GREEN'
      ? 'No open actions. Maintain standards and continue daily checks.'
      : complianceStatus === 'AMBER'
        ? 'Open actions require active management and evidence upload.'
        : 'Escalation required. Immediate corrective action and evidence upload.'
  const complianceStatusHeadline =
    complianceStatus === 'GREEN'
      ? 'On Track'
      : complianceStatus === 'AMBER'
        ? 'Action Required'
        : 'Critical'
  const posterFocusCards = buildPosterFocusCards(report)
  const posterFocusSlots = Array.from(
    { length: MAX_POSTER_FOCUS_CARDS },
    (_, index) => posterFocusCards[index] || null
  )
  const posterFocusTopRow = posterFocusSlots.slice(0, 3)
  const posterFocusBottomRow = posterFocusSlots.slice(3, 6)
  const targetCompletionLabel = report.storeActionMetrics.activeCount === 0 ? '100%' : 'Action'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.areaCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Monthly Update</Text>
              <Text style={styles.subtitle}>
                {report.areaLabel} | {periodLabel}
              </Text>
              <Text style={styles.subtitle}>
                {report.storeCount} stores | Newsletter period data with audit + H&S insights
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.generated}>Generated: {generatedLabel}</Text>
            </View>
          </View>

          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Average Audit Score</Text>
              <Text style={[styles.kpiValue, { color: scoreColor(report.auditMetrics.averageLatestScore) }]}> 
                {toScoreLabel(report.auditMetrics.averageLatestScore)}
              </Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Audits Completed</Text>
              <Text style={[styles.kpiValue, { color: '#0f172a' }]}> 
                {report.auditMetrics.auditsCompletedThisMonth}
              </Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Stores Below 85%</Text>
              <Text style={[styles.kpiValue, { color: '#b45309' }]}> 
                {report.auditMetrics.belowThresholdCount}
              </Text>
            </View>
            <View style={[styles.kpiCard, styles.kpiCardLast]}>
              <Text style={styles.kpiLabel}>Compliance Status</Text>
              <Text
                style={[
                  styles.kpiValue,
                  {
                    color:
                      complianceStatus === 'GREEN'
                        ? '#059669'
                        : complianceStatus === 'AMBER'
                          ? '#d97706'
                          : '#dc2626',
                  },
                ]}
              >
                {complianceStatus}
              </Text>
              <Text style={[styles.panelMuted, { marginTop: 2 }]}>
                Open {report.storeActionMetrics.activeCount} | High {report.storeActionMetrics.highPriorityCount} | Overdue{' '}
                {report.storeActionMetrics.overdueCount}
              </Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Performance Trend</Text>
            {chartRows.length > 0 ? (
              chartRows.map((store, index) => (
                <View key={`chart-${index}`} style={styles.chartRow}>
                  <View style={styles.chartTopLine}>
                    <Text style={styles.chartStoreName}>{formatStoreLabel(store)}</Text>
                    <Text style={styles.chartScoreText}>{toScoreLabel(store.latestAuditScore)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={{
                        width: scoreBarWidth(store.latestAuditScore),
                        height: 6,
                        borderRadius: 999,
                        backgroundColor: scoreColor(store.latestAuditScore),
                      }}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.panelMuted}>No scored audits available for this area.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Store Leaderboard</Text>
            <View style={styles.leaderboardColumns}>
              {renderLeaderboardColumn(
                leaderboardFirstColumn,
                0,
                'left',
                leaderboardSecondColumn.length === 0
              )}
              {leaderboardSecondColumn.length > 0 ? (
                <>
                  <View style={styles.leaderboardSpacer} />
                  {renderLeaderboardColumn(
                    leaderboardSecondColumn,
                    leaderboardSplitIndex,
                    'right'
                  )}
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>H&S Priorities</Text>
            <Text style={[styles.panelMuted, { marginBottom: 4 }]}>
              Active: {report.storeActionMetrics.activeCount} | High/Urgent:{' '}
              {report.storeActionMetrics.highPriorityCount} | Overdue:{' '}
              {report.storeActionMetrics.overdueCount}
            </Text>
            {focusItems.length > 0 ? (
              <>
                {focusItems.slice(0, 6).map((item, index) => (
                  <Text key={`focus-priority-${index}`} style={styles.panelItem}>
                    {toBulletLine(formatFocusLine(item))}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={styles.panelMuted}>No active H&S task themes available for this area.</Text>
            )}
          </View>

          {aiPromptPack &&
          (aiPromptPack.generateBriefing || aiPromptPack.analyzeRegionalRisk || aiPromptPack.composeNewsletter) ? (
            <View style={styles.briefingCard}>
              <Text style={styles.briefingTitle}>KSS NW Consultant Briefing</Text>
              {aiPromptPack.generateBriefing ? (
                <>
                  <Text style={styles.briefingSubTitle}>Regional Summary</Text>
                  <Text style={styles.briefingBody}>{sanitizeMarkdownText(aiPromptPack.generateBriefing)}</Text>
                </>
              ) : null}
              {aiPromptPack.analyzeRegionalRisk ? (
                <>
                  <View style={styles.briefingDivider} />
                  <Text style={styles.briefingSubTitle}>Risk Pattern</Text>
                  <Text style={styles.briefingBody}>{sanitizeMarkdownText(aiPromptPack.analyzeRegionalRisk)}</Text>
                </>
              ) : null}
            </View>
          ) : null}

          <View style={styles.panelRow}>
            <View
              style={[
                styles.panel,
                styles.panelWide,
                {
                  borderColor: '#bfdbfe',
                  backgroundColor: '#eff6ff',
                },
              ]}
            >
              <Text style={[styles.panelTitle, { color: '#1d4ed8' }]}>H&S Highlights</Text>
              <Text style={[styles.panelMuted, { marginBottom: 4 }]}>
                Completed: {report.hsAuditMetrics.auditsCompletedThisMonth} | Avg:{' '}
                {toScoreLabel(report.hsAuditMetrics.averageScore)}
              </Text>
              {report.hsAuditMetrics.highlights.length > 0 ? (
                <>
                  {report.hsAuditMetrics.highlights.slice(0, 6).map((line, index) => (
                    <Text key={`highlight-${index}`} style={styles.panelItem}>
                      {toBulletLine(line)}
                    </Text>
                  ))}
                </>
              ) : (
                <Text style={styles.panelMuted}>No H&S highlights provided.</Text>
              )}
            </View>

            <View
              style={[
                styles.panel,
                styles.panelNarrow,
                styles.panelLast,
                {
                  borderColor: '#a7f3d0',
                  backgroundColor: '#ecfdf5',
                },
              ]}
            >
              <Text style={[styles.panelTitle, { color: '#047857' }]}>Reminders & Updates</Text>
              <Text style={[styles.panelMuted, { marginBottom: 2 }]}>Reminders</Text>
              {reminders.length > 0 ? (
                reminders.slice(0, 5).map((line, index) => (
                  <Text key={`rem-${index}`} style={styles.panelItem}>
                    {toBulletLine(line)}
                  </Text>
                ))
              ) : (
                <Text style={styles.panelMuted}>No reminder text provided.</Text>
              )}
              <Text style={[styles.panelMuted, { marginTop: 3, marginBottom: 2 }]}>
                Legislation / Policy
              </Text>
              {legislationUpdates.length > 0 ? (
                legislationUpdates.slice(0, 5).map((line, index) => (
                  <Text key={`leg-${index}`} style={styles.panelItem}>
                    {toBulletLine(line)}
                  </Text>
                ))
              ) : (
                <Text style={styles.panelMuted}>No legislation updates provided.</Text>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          KSS NW Monthly Area Newsletter For Footasylum | {report.areaLabel} | {periodLabel}
        </Text>
      </Page>

      <Page size="A4" style={styles.posterPage}>
        <View style={styles.posterFrame}>
          <View style={styles.posterHeader}>
            <Text style={styles.posterBrand}>FOOTASYLUM</Text>
            <Text style={styles.posterUpdatePill}>HEALTH &amp; SAFETY AUDIT UPDATE • {periodLabel}</Text>
          </View>

          <View style={styles.posterMetricsRow}>
            <View style={styles.posterMetricTile}>
              <Text style={styles.posterMetricLabel}>Open Actions</Text>
              <Text style={styles.posterMetricValue}>{report.storeActionMetrics.activeCount}</Text>
            </View>
            <View style={styles.posterMetricTile}>
              <Text style={styles.posterMetricLabel}>High Risk</Text>
              <Text style={styles.posterMetricValue}>{report.storeActionMetrics.highPriorityCount}</Text>
            </View>
            <View style={styles.posterMetricTile}>
              <Text style={styles.posterMetricLabel}>Overdue</Text>
              <Text style={styles.posterMetricValue}>{report.storeActionMetrics.overdueCount}</Text>
            </View>
            <View style={[styles.posterMetricTile, styles.posterMetricTileLast, styles.posterStatusTile]}>
              <Text style={styles.posterMetricLabel}>Current Status</Text>
              <Text style={styles.posterStatusHeadline}>{complianceStatusHeadline}</Text>
              <Text style={styles.posterStatusBadge}>{complianceStatus}</Text>
              <Text style={styles.posterStatusMeta}>{complianceStatusMeta}</Text>
            </View>
          </View>

          <Text style={styles.posterTrendLine}>
            Previous Month: Baseline pending | This Month: {report.storeActionMetrics.activeCount} Open |{' '}
            {report.storeActionMetrics.highPriorityCount} High Risk
          </Text>

          <View style={styles.posterSectionTitleRow}>
            <View style={styles.posterSectionRule} />
            <Text style={styles.posterSectionTitle}>Priority Focus Areas</Text>
            <View style={styles.posterSectionRule} />
          </View>

          <View style={styles.posterFocusRow}>
            {posterFocusTopRow.map((card, index) =>
              card ? (
                <View
                  key={`poster-focus-top-${index}`}
                  style={[
                    styles.posterFocusCard,
                    { marginRight: index === posterFocusTopRow.length - 1 ? 0 : 6 },
                  ]}
                >
                  <Text
                    style={{
                      ...styles.posterPriorityBadge,
                      backgroundColor: card.toneColor,
                      color: card.toneTextColor,
                    }}
                  >
                    PRIORITY {index + 1}
                  </Text>
                  <Text style={styles.posterFocusTitle}>{card.title}</Text>
                  {card.imageSrc ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image src={card.imageSrc} style={styles.posterFocusImage} />
                  ) : (
                    <View style={[styles.posterFocusCard, styles.posterFocusCardEmpty]}>
                      <Text style={styles.posterFocusCardEmptyText}>No image available</Text>
                    </View>
                  )}
                  <Text style={styles.posterFocusPrompt}>{card.prompt}</Text>
                </View>
              ) : (
                <View
                  key={`poster-focus-top-empty-${index}`}
                  style={[
                    styles.posterFocusCard,
                    styles.posterFocusCardEmpty,
                    { marginRight: index === posterFocusTopRow.length - 1 ? 0 : 6 },
                  ]}
                >
                  <Text style={styles.posterFocusCardEmptyText}>No active focus item</Text>
                </View>
              )
            )}
          </View>

          <View style={styles.posterFocusRow}>
            {posterFocusBottomRow.map((card, index) =>
              card ? (
                <View
                  key={`poster-focus-bottom-${index}`}
                  style={[
                    styles.posterFocusCard,
                    { marginRight: index === posterFocusBottomRow.length - 1 ? 0 : 6 },
                  ]}
                >
                  <Text
                    style={{
                      ...styles.posterPriorityBadge,
                      backgroundColor: card.toneColor,
                      color: card.toneTextColor,
                    }}
                  >
                    PRIORITY {index + 4}
                  </Text>
                  <Text style={styles.posterFocusTitle}>{card.title}</Text>
                  {card.imageSrc ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image src={card.imageSrc} style={styles.posterFocusImage} />
                  ) : (
                    <View style={[styles.posterFocusCard, styles.posterFocusCardEmpty]}>
                      <Text style={styles.posterFocusCardEmptyText}>No image available</Text>
                    </View>
                  )}
                  <Text style={styles.posterFocusPrompt}>{card.prompt}</Text>
                </View>
              ) : (
                <View
                  key={`poster-focus-bottom-empty-${index}`}
                  style={[
                    styles.posterFocusCard,
                    styles.posterFocusCardEmpty,
                    { marginRight: index === posterFocusBottomRow.length - 1 ? 0 : 6 },
                  ]}
                >
                  <Text style={styles.posterFocusCardEmptyText}>No active focus item</Text>
                </View>
              )
            )}
          </View>

          <View style={styles.posterBottomRow}>
            <View style={styles.posterRemindersPanel}>
              <View style={styles.posterRemindersColumns}>
                <View style={styles.posterRemindersColumn}>
                  <Text style={styles.posterRemindersTitle}>Reminders &amp; Updates</Text>
                  {reminders.length > 0 ? (
                    reminders.map((line, index) => (
                      <Text key={`poster-reminder-${index}`} style={styles.posterReminderLine}>
                        {toBulletLine(line)}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.posterReminderEmpty}>No reminder text provided.</Text>
                  )}
                </View>

                <View style={styles.posterRemindersDivider} />

                <View style={styles.posterRemindersColumn}>
                  <Text style={styles.posterLegislationTitle}>Legislation / Policy</Text>
                  {legislationUpdates.length > 0 ? (
                    legislationUpdates.map((line, index) => (
                      <Text key={`poster-legislation-${index}`} style={styles.posterReminderLine}>
                        {toBulletLine(line)}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.posterReminderEmpty}>No legislation updates provided.</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.posterTargetPanel}>
              <Text style={styles.posterTargetValue}>{targetCompletionLabel}</Text>
              <Text style={styles.posterTargetLabel}>Target Completion</Text>
            </View>
          </View>

          <Text style={styles.posterAccountabilityLine}>
            All actions must include an owner, target date and evidence upload.
          </Text>
          <Text style={styles.posterFooterMeta}>
            www.kssnwltd.co.uk - Health &amp; Safety Consultants
          </Text>
        </View>
      </Page>
    </Document>
  )
}
