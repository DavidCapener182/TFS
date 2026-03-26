import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { type TargetedTheftVisitPayload, type VisitReportStatus } from '@/lib/reports/visit-report-types'

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
    marginBottom: 4,
  },
  rowLabel: {
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: 700,
  },
  rowValue: {
    fontSize: 9.5,
    color: '#0f172a',
    marginTop: 1,
  },
  bullet: {
    fontSize: 9.5,
    color: '#0f172a',
    marginTop: 2,
  },
})

type VisitReportPdfProps = {
  reportTitle: string
  status: VisitReportStatus
  visitDate: string
  storeName: string
  storeCode: string | null
  createdByName: string | null
  generatedAt: string
  payload: TargetedTheftVisitPayload
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No'
}

function formatDate(value: string): string {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB')
}

function joinTruthy(values: Array<string | null | undefined>): string {
  return values.map((value) => String(value || '').trim()).filter(Boolean).join(' | ')
}

export function VisitReportPdfDocument(props: VisitReportPdfProps) {
  const {
    reportTitle,
    status,
    visitDate,
    storeName,
    storeCode,
    createdByName,
    generatedAt,
    payload,
  } = props

  const sections = [
    {
      title: 'Incident overview',
      items: [
        ['Incidents confirmed', payload.incidentOverview.incidentCount || 'N/A'],
        ['Duration (seconds)', payload.incidentOverview.durationSeconds || 'N/A'],
        ['Dates/times recorded', yesNo(payload.incidentOverview.datesTimesRecorded)],
        ['Repeat pattern suspected', yesNo(payload.incidentOverview.sameOffendersSuspected)],
        ['Violence/threat involved', yesNo(payload.incidentOverview.violenceInvolved)],
        ['Primary products', payload.incidentOverview.primaryProducts || 'N/A'],
        ['Entry point', payload.incidentOverview.entryPoint || 'N/A'],
        ['Summary', payload.incidentOverview.summary || 'N/A'],
      ],
    },
    {
      title: 'Store layout and controls',
      items: [
        ['High-value visible from entrance', yesNo(payload.storeLayoutExposure.highValueVisibleFromEntrance)],
        ['Reachable in 3-5 seconds', yesNo(payload.storeLayoutExposure.highValueReachableWithinFiveSeconds)],
        ['Counter lean-over access', yesNo(payload.storeLayoutExposure.counterLeanOverAccess)],
        ['Counter bypass possible', yesNo(payload.storeLayoutExposure.counterBypassPossible)],
        ['Escape route behind counter', yesNo(payload.storeLayoutExposure.clearEscapeRouteBehindCounter)],
        ['Layout observations', payload.storeLayoutExposure.observations || 'N/A'],
      ],
    },
    {
      title: 'Product and team response',
      items: [
        ['Testers instead of live stock', yesNo(payload.productControlMeasures.testersUsedInsteadOfLiveStock)],
        ['Empty boxes used', yesNo(payload.productControlMeasures.emptyBoxesUsedForDisplay)],
        ['High-value stock reduced', yesNo(payload.productControlMeasures.highValueStockReducedOnShopFloor)],
        ['At-risk SKUs', payload.productControlMeasures.atRiskSkus || 'N/A'],
        ['Product recommendations', payload.productControlMeasures.recommendations || 'N/A'],
        ['Observed staff behaviour', payload.staffPositioningBehaviour.observedBehaviour || 'N/A'],
        ['Staff safety response', payload.staffSafetyResponse.responseDescription || 'N/A'],
      ],
    },
    {
      title: 'Surveillance, communications, and environment',
      items: [
        ['CCTV issues identified', payload.cctvSurveillance.issuesIdentified || 'N/A'],
        ['Radio effectiveness', payload.communicationRadioUse.effectiveness || 'N/A'],
        ['External risks', payload.environmentalExternalFactors.externalRisks || 'N/A'],
        ['Immediate actions completed', payload.immediateActionsTaken.actionsCompleted || 'N/A'],
      ],
    },
    {
      title: 'Recommendations and sign-off',
      items: [
        ['Risk rating', payload.riskRating ? payload.riskRating.toUpperCase() : 'N/A'],
        ['Risk justification', payload.riskJustification || 'N/A'],
        ['Detailed recommendations', payload.recommendations.details || 'N/A'],
        ['Prepared by', payload.preparedBy || 'N/A'],
        ['Store manager', payload.storeManager || 'N/A'],
        ['Visited by', payload.signOff.visitedBy || 'N/A'],
        ['Store representative', payload.signOff.storeRepresentative || 'N/A'],
      ],
    },
  ] as const

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>TFS VISIT REPORT</Text>
          <Text style={styles.headerMeta}>{formatDate(generatedAt)}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated from TFS Reporting</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Targeted theft visit report</Text>
          <Text style={styles.heroTitle}>{reportTitle}</Text>
          <Text style={styles.heroSummary}>
            {joinTruthy([
              `Store: ${storeName}${storeCode ? ` (${storeCode})` : ''}`,
              `Visit date: ${formatDate(visitDate)}`,
              `Status: ${status === 'final' ? 'Final' : 'Draft'}`,
              createdByName ? `Created by: ${createdByName}` : null,
            ])}
          </Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Prepared by</Text>
            <Text style={styles.metaValue}>{payload.preparedBy || 'N/A'}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Store manager</Text>
            <Text style={styles.metaValue}>{payload.storeManager || 'N/A'}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Time in/out</Text>
            <Text style={styles.metaValue}>{joinTruthy([payload.timeIn || 'N/A', payload.timeOut || 'N/A'])}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Risk</Text>
            <Text style={styles.metaValue}>{payload.riskRating ? payload.riskRating.toUpperCase() : 'N/A'}</Text>
          </View>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map(([label, value]) => (
              <View key={`${section.title}-${label}`} style={styles.row}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue}>{value}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist summary</Text>
          <Text style={styles.bullet}>- CCTV facial identification possible: {yesNo(payload.cctvSurveillance.facialIdentificationPossible)}</Text>
          <Text style={styles.bullet}>- Early warning system in place: {yesNo(payload.communicationRadioUse.earlyWarningSystemInPlace)}</Text>
          <Text style={styles.bullet}>- Staff understand do-not-engage: {yesNo(payload.staffSafetyResponse.staffUnderstandDoNotEngage)}</Text>
          <Text style={styles.bullet}>- High-risk stock removed: {yesNo(payload.immediateActionsTaken.highRiskStockRemoved)}</Text>
        </View>
      </Page>
    </Document>
  )
}

