import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  buildVisitReportSummary,
  getVisitReportTypeLabel,
  type ActivityVisitReportPayload,
  type ActivityVisitReportType,
  type VisitReportStatus,
} from '@/lib/reports/visit-report-types'
import {
  buildStoreVisitActivityDetailText,
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
    fontSize: 9.5,
    marginTop: 8,
    lineHeight: 1.4,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  metaCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
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
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
  },
  sectionTitle: {
    fontSize: 10,
    color: '#1e1b4b',
    fontWeight: 700,
    marginBottom: 6,
  },
  row: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowLabel: {
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: 700,
    width: '34%',
    paddingRight: 8,
  },
  rowValue: {
    fontSize: 9.5,
    color: '#0f172a',
    width: '66%',
  },
  subheading: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: 700,
  },
  card: {
    marginTop: 6,
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
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
  const summary = buildVisitReportSummary(reportType, payload)
  const itemChecks = payload.activityPayload.itemsChecked || []
  const amountChecks = payload.activityPayload.amountChecks || []

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
          <Text style={styles.heroSummary}>{summary || 'Structured visit report export.'}</Text>
        </View>

        <View style={styles.metaGrid}>
          <MetaCard label="Store" value={storeCode ? `${storeName} (${storeCode})` : storeName} />
          <MetaCard label="Visit status" value={formatStatus(status)} />
          <MetaCard label="Prepared by" value={valueOrFallback(payload.preparedBy || createdByName)} />
          <MetaCard label="Store manager" value={valueOrFallback(payload.storeManager)} />
          <MetaCard label="Time in / out" value={`${valueOrFallback(payload.timeIn)} / ${valueOrFallback(payload.timeOut)}`} />
          <MetaCard label="Visited by / rep" value={`${valueOrFallback(payload.signOff.visitedBy)} / ${valueOrFallback(payload.signOff.storeRepresentative)}`} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. What Was Checked</Text>
          {activitySummary ? <DataRow label="Summary" value={activitySummary} /> : null}
          {whatCheckedFields.map((field) => {
            const fieldValue = payload.activityPayload.fields?.[field.key]
            if (!fieldValue) return null
            return <DataRow key={field.key} label={field.label} value={fieldValue} />
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
            return <DataRow key={field.key} label={field.label} value={fieldValue} />
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Action Taken / Escalation</Text>
          <DataRow label="Actions" value={valueOrFallback(payload.actionsTaken)} />
          {actionFields.map((field) => {
            const fieldValue = payload.activityPayload.fields?.[field.key]
            if (!fieldValue) return null
            return <DataRow key={field.key} label={field.label} value={fieldValue} />
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
