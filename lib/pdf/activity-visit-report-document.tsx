import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  getVisitReportTypeLabel,
  type ActivityVisitReportPayload,
  type ActivityVisitReportType,
  type VisitReportStatus,
} from '@/lib/reports/visit-report-types'
import {
  buildStoreVisitActivityDetailText,
  formatStoreVisitActivityFieldValue,
  formatStoreVisitCurrency,
  getStoreVisitActivityFieldDefinitions,
  getStoreVisitActivityFieldSection,
  getStoreVisitCountedItemDelta,
  getStoreVisitCountedItemVarianceValue,
  type StoreVisitAmountCheck,
  type StoreVisitCountedItem,
} from '@/lib/visit-needs'

const styles = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 46,
    paddingHorizontal: 36,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    color: '#0f172a',
    fontSize: 10,
    lineHeight: 1.45,
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
    marginBottom: 16,
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
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  metaCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  metaLabel: {
    color: '#475569',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
    fontWeight: 700,
  },
  metaValue: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: 600,
  },
  section: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 10,
    color: '#1e1b4b',
    fontWeight: 700,
    marginBottom: 10,
  },
  rowGroup: {
    marginBottom: 10,
  },
  row: {
    marginBottom: 3,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowLabelColumn: {
    width: '34%',
    paddingRight: 10,
  },
  rowLabel: {
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: 700,
  },
  rowValueColumn: {
    width: '66%',
  },
  rowValue: {
    fontSize: 9.5,
    color: '#0f172a',
    lineHeight: 1.5,
  },
  subheading: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: 700,
  },
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#f8fafc',
  },
  cardTitle: {
    fontSize: 9.5,
    color: '#0f172a',
    fontWeight: 700,
    marginBottom: 4,
  },
  cardText: {
    fontSize: 9,
    color: '#334155',
    marginBottom: 2,
  },
})

type ActivityVisitReportPdfProps = {
  reportTitle: string
  reportType: ActivityVisitReportType
  status: VisitReportStatus
  visitDate: string
  storeName: string
  storeCode: string | null
  createdByName: string | null
  generatedAt: string
  payload: ActivityVisitReportPayload
}

function formatDate(value: string): string {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB')
}

function valueOrFallback(value: string | null | undefined): string {
  const trimmed = String(value || '').trim()
  return trimmed || 'N/A'
}

function chunkWords(value: string, maxLength: number): string[] {
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const chunks: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxLength) {
      current = candidate
      continue
    }

    if (current) {
      chunks.push(current)
      current = word
      continue
    }

    for (let index = 0; index < word.length; index += maxLength) {
      chunks.push(word.slice(index, index + maxLength))
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function chunkParagraph(value: string, maxLength = 200): string[] {
  const text = value.trim()
  if (!text) return []

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (sentences.length <= 1) {
    return chunkWords(text, maxLength)
  }

  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length <= maxLength) {
      current = candidate
      continue
    }

    if (current) {
      chunks.push(current)
      current = ''
    }

    const sentenceChunks = chunkWords(sentence, maxLength)
    if (sentenceChunks.length === 0) continue
    if (sentenceChunks.length === 1) {
      current = sentenceChunks[0] || ''
      continue
    }

    chunks.push(...sentenceChunks.slice(0, -1))
    current = sentenceChunks[sentenceChunks.length - 1] || ''
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function chunkValueForRows(value: string, maxLength = 200): string[] {
  const paragraphs = value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return ['N/A']
  }

  const chunks = paragraphs.flatMap((paragraph) => chunkParagraph(paragraph, maxLength))
  return chunks.length > 0 ? chunks : ['N/A']
}

function formatStatus(value: VisitReportStatus): string {
  return value === 'final' ? 'Final' : 'Draft'
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return 'Not set'
}

function buildCountedItemTitle(item: StoreVisitCountedItem): string {
  return [item.productLabel, item.variantLabel, item.sizeLabel].filter(Boolean).join(' • ') || 'Counted item'
}

function buildAmountCheckTitle(item: StoreVisitAmountCheck): string {
  return item.label || 'Amount check'
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCard}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  const lines = chunkValueForRows(valueOrFallback(value))

  return (
    <View style={styles.rowGroup}>
      {lines.map((line, index) => (
        <View key={`${label}-${index}`} style={styles.row} wrap={false}>
          <View style={styles.rowLabelColumn}>
            <Text style={styles.rowLabel}>{index === 0 ? label : ' '}</Text>
          </View>
          <View style={styles.rowValueColumn}>
            <Text style={styles.rowValue}>{line}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export function ActivityVisitReportPdfDocument({
  reportTitle,
  reportType,
  status,
  visitDate,
  storeName,
  storeCode,
  createdByName,
  generatedAt,
  payload,
}: ActivityVisitReportPdfProps) {
  const fieldDefinitions = getStoreVisitActivityFieldDefinitions(reportType)
  const whatCheckedFields = fieldDefinitions.filter(
    (field) => getStoreVisitActivityFieldSection(reportType, field) === 'what_checked'
  )
  const findingsFields = fieldDefinitions.filter(
    (field) => getStoreVisitActivityFieldSection(reportType, field) === 'findings'
  )
  const actionFields = fieldDefinitions.filter(
    (field) => getStoreVisitActivityFieldSection(reportType, field) === 'actions'
  )
  const activitySummary = buildStoreVisitActivityDetailText(reportType, undefined, payload.activityPayload)
  const itemChecks = payload.activityPayload.itemsChecked || []
  const amountChecks = payload.activityPayload.amountChecks || []
  const confidenceLabel = formatStoreVisitActivityFieldValue(
    reportType,
    'caseConfidence',
    payload.activityPayload.fields?.caseConfidence
  )
  const outcomeStatusLabel = formatStoreVisitActivityFieldValue(
    reportType,
    'outcomeStatus',
    payload.activityPayload.fields?.outcomeStatus
  )

  return (
    <Document title={reportTitle}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>TFS VISIT REPORT</Text>
          <Text style={styles.headerMeta}>{formatStatus(status)}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated {formatDate(generatedAt)}</Text>
          <Text style={styles.footerText}>Visit date {formatDate(visitDate)}</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{getVisitReportTypeLabel(reportType)}</Text>
          <Text style={styles.heroTitle}>{reportTitle}</Text>
        </View>

        <View style={styles.metaGrid}>
          <MetaCard label="Store" value={storeCode ? `${storeName} (${storeCode})` : storeName} />
          <MetaCard label="Visit status" value={formatStatus(status)} />
          <MetaCard label="Prepared by" value={valueOrFallback(payload.preparedBy || createdByName)} />
          <MetaCard label="Store manager" value={valueOrFallback(payload.storeManager)} />
          <MetaCard label="Visit date" value={formatDate(visitDate)} />
          <MetaCard label="Created by" value={valueOrFallback(createdByName)} />
          <MetaCard label="Time in / out" value={`${valueOrFallback(payload.timeIn)} / ${valueOrFallback(payload.timeOut)}`} />
          <MetaCard label="Visited by / rep" value={`${valueOrFallback(payload.signOff.visitedBy)} / ${valueOrFallback(payload.signOff.storeRepresentative)}`} />
          {confidenceLabel ? <MetaCard label="Confidence" value={confidenceLabel} /> : null}
          {outcomeStatusLabel ? <MetaCard label="Outcome" value={outcomeStatusLabel} /> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. What Was Checked</Text>
          {activitySummary ? <DataRow label="Summary" value={activitySummary} /> : null}
          {whatCheckedFields.map((field) => {
            const fieldValue = payload.activityPayload.fields?.[field.key]
            if (!fieldValue) return null
            return (
              <DataRow
                key={field.key}
                label={field.label}
                value={formatStoreVisitActivityFieldValue(reportType, field.key, fieldValue)}
              />
            )
          })}
          {payload.activityPayload.amountConfirmed !== null &&
          payload.activityPayload.amountConfirmed !== undefined ? (
            <DataRow
              label="Correct amount present"
              value={formatBoolean(payload.activityPayload.amountConfirmed)}
            />
          ) : null}
          {fieldDefinitions.length === 0 && !activitySummary && itemChecks.length === 0 && amountChecks.length === 0 ? (
            <DataRow label="Recorded details" value="No structured checks recorded." />
          ) : null}

          {itemChecks.length > 0 ? <Text style={styles.subheading}>Line checks</Text> : null}
          {itemChecks.map((item, index) => {
            const delta = getStoreVisitCountedItemDelta(item)
            const varianceValue = getStoreVisitCountedItemVarianceValue(item)
            const varianceSummary =
              delta === null || delta === 0
                ? 'No variance recorded'
                : `${delta < 0 ? `${Math.abs(delta)} missing` : `${delta} extra`}${
                    varianceValue !== null ? ` • ${formatStoreVisitCurrency(varianceValue)}` : ''
                  }`

            return (
              <View key={`${buildCountedItemTitle(item)}-${index}`} style={styles.card}>
                <Text style={styles.cardTitle}>{buildCountedItemTitle(item)}</Text>
                <Text style={styles.cardText}>
                  System {typeof item.systemQuantity === 'number' ? item.systemQuantity : 'N/A'} • Counted{' '}
                  {typeof item.countedQuantity === 'number' ? item.countedQuantity : 'N/A'}
                </Text>
                <Text style={styles.cardText}>{varianceSummary}</Text>
                {item.notes ? <Text style={styles.cardText}>{item.notes}</Text> : null}
              </View>
            )
          })}

          {amountChecks.length > 0 ? <Text style={styles.subheading}>Cash checks</Text> : null}
          {amountChecks.map((item, index) => (
            <View key={`${buildAmountCheckTitle(item)}-${index}`} style={styles.card}>
              <Text style={styles.cardTitle}>{buildAmountCheckTitle(item)}</Text>
              <Text style={styles.cardText}>
                System {typeof item.systemAmount === 'number' ? formatStoreVisitCurrency(item.systemAmount) : 'N/A'} • Counted{' '}
                {typeof item.countedAmount === 'number' ? formatStoreVisitCurrency(item.countedAmount) : 'N/A'}
              </Text>
              <Text style={styles.cardText}>Match status: {formatBoolean(item.amountMatches)}</Text>
              {item.notes ? <Text style={styles.cardText}>{item.notes}</Text> : null}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Findings / Variance</Text>
          <DataRow label="Findings" value={valueOrFallback(payload.findings)} />
          {findingsFields.map((field) => {
            const fieldValue = payload.activityPayload.fields?.[field.key]
            if (!fieldValue) return null
            return (
              <DataRow
                key={field.key}
                label={field.label}
                value={formatStoreVisitActivityFieldValue(reportType, field.key, fieldValue)}
              />
            )
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Action Taken / Escalation</Text>
          <DataRow label="Actions" value={valueOrFallback(payload.actionsTaken)} />
          {actionFields.map((field) => {
            const fieldValue = payload.activityPayload.fields?.[field.key]
            if (!fieldValue) return null
            return (
              <DataRow
                key={field.key}
                label={field.label}
                value={formatStoreVisitActivityFieldValue(reportType, field.key, fieldValue)}
              />
            )
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Sign-Off</Text>
          <DataRow label="Visited by" value={valueOrFallback(payload.signOff.visitedBy)} />
          <DataRow
            label="Store representative"
            value={valueOrFallback(payload.signOff.storeRepresentative)}
          />
        </View>
      </Page>
    </Document>
  )
}
