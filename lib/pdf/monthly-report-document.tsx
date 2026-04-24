import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  getMonthlyTheftRowKindLabel,
  MONTHLY_STORE_PORTAL_THEFT_TEMPLATE_KEY,
  type MonthlyReportData,
  type MonthlyReportRow,
} from '@/lib/reports/monthly-report'

interface MonthlyReportPdfDocumentProps {
  data: MonthlyReportData
  generatedAt: string
  generatedByName: string | null
  areaManagerSupportCalls: number
  detailOverrides?: Record<string, string> | null
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 46,
    paddingHorizontal: 36,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    color: '#0f172a',
    fontSize: 9.5,
    lineHeight: 1.4,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 36,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 9,
    color: '#1e1b4b',
    fontWeight: 700,
    letterSpacing: 0.6,
  },
  headerMeta: {
    fontSize: 9,
    color: '#475569',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 34,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 36,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 8,
    color: '#64748b',
  },
  hero: {
    backgroundColor: '#1e1b4b',
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  heroEyebrow: {
    color: '#c7d2fe',
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 6,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  heroSummary: {
    color: '#e2e8f0',
    fontSize: 9,
    marginTop: 8,
    lineHeight: 1.4,
  },
  section: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
  },
  sectionTitle: {
    fontSize: 9.6,
    color: '#1e1b4b',
    fontWeight: 700,
    marginBottom: 6,
  },
  infoStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  infoCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#f8fafc',
  },
  infoLabel: {
    color: '#475569',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
    fontWeight: 700,
  },
  infoValue: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: 600,
  },
  summaryTable: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
  },
  summaryHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  summaryRow: {
    flexDirection: 'row',
  },
  summaryCellBase: {
    paddingVertical: 7,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  summaryHeaderText: {
    fontSize: 6.2,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    fontWeight: 700,
    lineHeight: 1.25,
  },
  summaryValueText: {
    fontSize: 9.2,
    color: '#0f172a',
    fontWeight: 600,
  },
  summaryManagersText: {
    fontSize: 8.1,
    color: '#0f172a',
    lineHeight: 1.35,
  },
  activityTable: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  activityHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 5,
    paddingHorizontal: 7,
  },
  activityHeaderText: {
    fontSize: 7,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: 700,
  },
  activityRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  activityCellDate: {
    width: '16%',
    paddingRight: 7,
  },
  activityCellStore: {
    width: '22%',
    paddingRight: 8,
  },
  activityCellDetails: {
    width: '62%',
  },
  activityPrimary: {
    fontSize: 8.9,
    color: '#0f172a',
    fontWeight: 600,
    marginBottom: 2,
  },
  activitySecondary: {
    fontSize: 7.4,
    color: '#64748b',
    marginBottom: 2,
  },
  detailParagraph: {
    fontSize: 8.1,
    color: '#0f172a',
    marginBottom: 3,
    lineHeight: 1.32,
  },
  warningBox: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    padding: 9,
    backgroundColor: '#fffbeb',
  },
  warningTitle: {
    fontSize: 8.5,
    color: '#92400e',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: 700,
    marginBottom: 4,
  },
  warningText: {
    fontSize: 8.5,
    color: '#92400e',
    marginBottom: 3,
  },
  emptyState: {
    fontSize: 9.5,
    color: '#475569',
  },
  totalWrap: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalCard: {
    minWidth: 156,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
  },
  totalLabel: {
    fontSize: 7.5,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: 700,
    textAlign: 'right',
  },
  totalValue: {
    marginTop: 3,
    fontSize: 9.6,
    color: '#0f172a',
    fontWeight: 700,
    textAlign: 'right',
  },
})

function formatDate(value: string): string {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value: string): string {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function toSafeLineArray(value: string | null | undefined) {
  const normalized = String(value || '').trim()
  if (!normalized) return ['-']

  const lines = normalized
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.length > 0 ? lines : ['-']
}

function getDetailValue(
  row: MonthlyReportRow,
  detailOverrides?: Record<string, string> | null
) {
  const override = detailOverrides?.[row.id]
  return typeof override === 'string' ? override : row.generatedDetails
}

function getRowSourceLabel(row: MonthlyReportRow) {
  if (row.source === 'report') return 'Final template'
  if (row.source === 'incident') {
    return row.incidentTemplateKey === MONTHLY_STORE_PORTAL_THEFT_TEMPLATE_KEY
      ? 'Store portal theft'
      : 'Incident email'
  }
  return 'Completed visit'
}

function SummaryCell({
  width,
  isLast = false,
  children,
}: {
  width: string
  isLast?: boolean
  children: React.ReactNode
}) {
  return (
    <View
      style={[
        styles.summaryCellBase,
        { width },
        isLast ? { borderRightWidth: 0 } : {},
      ]}
    >
      {children}
    </View>
  )
}

function SummaryHeaderLabel({ lines }: { lines: string[] }) {
  return (
    <Text
      style={styles.summaryHeaderText}
      hyphenationCallback={(word) => [String(word || '')]}
    >
      {lines.join('\n')}
    </Text>
  )
}

export function MonthlyReportPdfDocument({
  data,
  generatedAt,
  generatedByName,
  areaManagerSupportCalls,
  detailOverrides,
}: MonthlyReportPdfDocumentProps) {
  const summaryManagers = data.summary.lpManagers.length > 0 ? data.summary.lpManagers.join('\n') : 'None recorded'
  const activityRows = data.rows.filter((row) => row.source !== 'incident')
  const theftRows = data.rows.filter(
    (row) => row.source === 'incident' && row.incidentCategory === 'theft'
  )
  const theftTotalValueGbp = theftRows.reduce((total, row) => total + (row.theftValueGbp ?? 0), 0)

  return (
    <Document title={`Monthly report - ${data.period.label}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>TFS MONTHLY REPORT</Text>
          <Text style={styles.headerMeta}>{data.period.label}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated {formatDateTime(generatedAt)}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Loss prevention monthly reporting</Text>
          <Text style={styles.heroTitle}>Monthly Report - {data.period.label}</Text>
          <Text style={styles.heroSummary}>
            Consolidated monthly view of completed LP activity, reported store thefts (emails and store portal), and final report templates across The Fragrance Shop estate.
          </Text>
        </View>

        <View style={styles.infoStrip}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Period</Text>
            <Text style={styles.infoValue}>{data.period.label}</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Generated by</Text>
            <Text style={styles.infoValue}>{generatedByName || 'TFS user'}</Text>
          </View>
        </View>

        {data.warnings.length > 0 ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Data coverage note</Text>
            {data.warnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                {warning}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Monthly Summary</Text>
          <View style={styles.summaryTable}>
            <View style={styles.summaryHeader}>
              <SummaryCell width="13%">
                <SummaryHeaderLabel lines={['Stores']} />
              </SummaryCell>
              <SummaryCell width="14%">
                <SummaryHeaderLabel lines={['Incidents']} />
              </SummaryCell>
              <SummaryCell width="19%">
                <SummaryHeaderLabel lines={['Investigation', 'Count']} />
              </SummaryCell>
              <SummaryCell width="16%">
                <SummaryHeaderLabel lines={['AM Calls']} />
              </SummaryCell>
              <SummaryCell width="38%" isLast>
                <SummaryHeaderLabel lines={['LP Managers']} />
              </SummaryCell>
            </View>
            <View style={styles.summaryRow}>
              <SummaryCell width="13%">
                <Text style={styles.summaryValueText}>{String(data.summary.storesVisited)}</Text>
              </SummaryCell>
              <SummaryCell width="14%">
                <Text style={styles.summaryValueText}>{String(data.summary.incidentsReported)}</Text>
              </SummaryCell>
              <SummaryCell width="19%">
                <Text style={styles.summaryValueText}>{String(data.summary.investigationsCarried)}</Text>
              </SummaryCell>
              <SummaryCell width="16%">
                <Text style={styles.summaryValueText}>{String(areaManagerSupportCalls)}</Text>
              </SummaryCell>
              <SummaryCell width="38%" isLast>
                <Text style={styles.summaryManagersText}>{summaryManagers}</Text>
              </SummaryCell>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Completed Activity</Text>
          {activityRows.length === 0 ? (
            <Text style={styles.emptyState}>No completed store visits or final report templates were found for this month.</Text>
          ) : (
            <View style={styles.activityTable}>
              <View style={styles.activityHeader}>
                <View style={styles.activityCellDate}>
                  <Text style={styles.activityHeaderText}>Date</Text>
                </View>
                <View style={styles.activityCellStore}>
                  <Text style={styles.activityHeaderText}>Store</Text>
                </View>
                <View style={styles.activityCellDetails}>
                  <Text style={styles.activityHeaderText}>Details</Text>
                </View>
              </View>

              {activityRows.map((row, index) => {
                const detailLines = toSafeLineArray(getDetailValue(row, detailOverrides))

                return (
                  <View
                    key={row.id}
                    style={[
                      styles.activityRow,
                      index === activityRows.length - 1 ? { borderBottomWidth: 0 } : {},
                    ]}
                  >
                    <View style={styles.activityCellDate}>
                      <Text style={styles.activityPrimary}>{formatDate(row.visitedAt)}</Text>
                      <Text style={styles.activitySecondary}>{getRowSourceLabel(row)}</Text>
                    </View>

                    <View style={styles.activityCellStore}>
                      <Text style={styles.activityPrimary}>{row.storeName}</Text>
                      <Text style={styles.activitySecondary}>
                        {row.storeCode ? `Store ${row.storeCode}` : 'Store code unavailable'}
                      </Text>
                      {row.createdByName ? (
                        <Text style={styles.activitySecondary}>LP manager: {row.createdByName}</Text>
                      ) : null}
                      {row.reportLabels.length > 0 ? (
                        <Text style={styles.activitySecondary}>
                          {row.reportLabels.join(' | ')}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.activityCellDetails}>
                      {detailLines.map((line, lineIndex) => (
                        <Text key={`${row.id}-${lineIndex}`} style={styles.detailParagraph}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Thefts Reported</Text>
          {theftRows.length === 0 ? (
            <Text style={styles.emptyState}>No store thefts were reported for this month.</Text>
          ) : (
            <React.Fragment>
              <View style={styles.activityTable}>
                <View style={styles.activityHeader}>
                  <View style={styles.activityCellDate}>
                    <Text style={styles.activityHeaderText}>Date</Text>
                  </View>
                  <View style={styles.activityCellStore}>
                    <Text style={styles.activityHeaderText}>Store</Text>
                  </View>
                  <View style={styles.activityCellDetails}>
                    <Text style={styles.activityHeaderText}>Details</Text>
                  </View>
                </View>

                {theftRows.map((row, index) => {
                  const detailLines = toSafeLineArray(getDetailValue(row, detailOverrides))

                  return (
                    <View
                      key={row.id}
                      style={[
                        styles.activityRow,
                        index === theftRows.length - 1 ? { borderBottomWidth: 0 } : {},
                      ]}
                    >
                      <View style={styles.activityCellDate}>
                        <Text style={styles.activityPrimary}>{formatDate(row.visitedAt)}</Text>
                        <Text style={styles.activitySecondary}>{getMonthlyTheftRowKindLabel(row)}</Text>
                      </View>

                      <View style={styles.activityCellStore}>
                        <Text style={styles.activityPrimary}>{row.storeName}</Text>
                        <Text style={styles.activitySecondary}>
                          {row.storeCode ? `Store ${row.storeCode}` : 'Store code unavailable'}
                        </Text>
                      </View>

                      <View style={styles.activityCellDetails}>
                        {detailLines.map((line, lineIndex) => (
                          <Text key={`${row.id}-${lineIndex}`} style={styles.detailParagraph}>
                            {line}
                          </Text>
                        ))}
                      </View>
                    </View>
                  )
                })}
              </View>

              <View style={styles.totalWrap} wrap={false}>
                <View style={styles.totalCard}>
                  <Text style={styles.totalLabel}>Total Reported</Text>
                  <Text style={styles.totalValue}>{formatCurrency(theftTotalValueGbp)}</Text>
                </View>
              </View>
            </React.Fragment>
          )}
        </View>
      </Page>
    </Document>
  )
}
