import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
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
  const rawNewsletter = sanitizeMarkdownText(
    aiPromptPack?.composeNewsletter?.trim() || report.newsletterMarkdown
  )
  const { subjectLine, body: newsletterBody } = extractSubjectAndBody(rawNewsletter, report.areaLabel)
  const composedNewsletter = personalizeGreeting(
    newsletterBody,
    resolveAreaManagerGreeting(report.areaLabel)
  )
  const riskPattern = sanitizeMarkdownText(aiPromptPack?.analyzeRegionalRisk || '')

  const chartRows = report.stores
    .filter((store) => typeof store.latestAuditScore === 'number')
    .slice(0, MAX_CHART_ROWS)

  const leaderboardSplitIndex = Math.ceil(report.stores.length / 2)
  const leaderboardFirstColumn = report.stores.slice(0, leaderboardSplitIndex)
  const leaderboardSecondColumn = report.stores.slice(leaderboardSplitIndex)
  const reminders = report.reminders
  const legislationUpdates = report.legislationUpdates
  const focusItems = report.storeActionMetrics.focusItems
  const focusSplitIndex = Math.ceil(focusItems.length / 2)
  const focusLeftColumn = focusItems.slice(0, focusSplitIndex)
  const focusRightColumn = focusItems.slice(focusSplitIndex)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.areaCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>{subjectLine}</Text>
              <Text style={styles.subtitle}>
                {report.areaLabel} | {report.storeCount} stores | Newsletter period data with audit + H&S insights
              </Text>
              <Text style={styles.subtitle}>Period: {periodLabel}</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.generated}>Generated: {generatedLabel}</Text>
            </View>
          </View>

          <View style={styles.briefingCard}>
            <Text style={styles.briefingBody}>{composedNewsletter}</Text>
            {riskPattern ? (
              <>
                <View style={styles.briefingDivider} />
                <Text style={styles.briefingSubTitle}>Risk Pattern</Text>
                <Text style={styles.briefingBody}>{riskPattern}</Text>
              </>
            ) : null}
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
            <View style={[styles.kpiCard, styles.kpiCardLast]}>
              <Text style={styles.kpiLabel}>Stores Below 85%</Text>
              <Text style={[styles.kpiValue, { color: '#b45309' }]}> 
                {report.auditMetrics.belowThresholdCount}
              </Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Audit Score Distribution</Text>
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

          <View style={styles.panelRow}>
            <View
              style={[
                styles.panel,
                styles.panelWide,
                {
                  borderColor: '#fde68a',
                  backgroundColor: '#fffbeb',
                },
              ]}
            >
              <Text style={[styles.panelTitle, { color: '#b45309' }]}>Area Focus From H&S Tasks</Text>
              <Text style={[styles.panelMuted, { marginBottom: 4 }]}> 
                Active: {report.storeActionMetrics.activeCount} | High/Urgent:{' '}
                {report.storeActionMetrics.highPriorityCount} | Overdue:{' '}
                {report.storeActionMetrics.overdueCount}
              </Text>
              {focusItems.length > 0 ? (
                <View style={styles.focusColumns}>
                  <View style={styles.focusColumn}>
                    {focusLeftColumn.map((item, index) => (
                      <Text key={`focus-left-${index}`} style={styles.panelItem}>
                        {toBulletLine(formatFocusLine(item))}
                      </Text>
                    ))}
                  </View>
                  {focusRightColumn.length > 0 ? (
                    <>
                      <View style={styles.focusSpacer} />
                      <View style={styles.focusColumn}>
                        {focusRightColumn.map((item, index) => (
                          <Text key={`focus-right-${index}`} style={styles.panelItem}>
                            {toBulletLine(formatFocusLine(item))}
                          </Text>
                        ))}
                      </View>
                    </>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.panelMuted}>No active H&S task themes available for this area.</Text>
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
              {reminders.map((line, index) => (
                <Text key={`rem-${index}`} style={styles.panelItem}>
                  {toBulletLine(line)}
                </Text>
              ))}
              <Text style={[styles.panelMuted, { marginTop: 3, marginBottom: 2 }]}> 
                Legislation / Policy
              </Text>
              {legislationUpdates.map((line, index) => (
                <Text key={`leg-${index}`} style={styles.panelItem}>
                  {toBulletLine(line)}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          KSS NW Monthly Area Newsletter For Footasylum | {report.areaLabel} | {periodLabel}
        </Text>
      </Page>
    </Document>
  )
}
