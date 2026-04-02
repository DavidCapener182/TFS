import { buildDeterministicMonthlyVisitSummary } from '@/lib/ai/monthly-report-summarize'
import { type createClient } from '@/lib/supabase/server'
import { extractLinkedVisitReportId } from '@/lib/incidents/incident-utils'
import { buildVisitReportSourceMarker } from '@/lib/reports/visit-report-follow-ups'
import { formatStoreName } from '@/lib/store-display'
import {
  enrichTheftLineItemsWithCatalog,
  extractStoreTheftLineItems,
  extractStoreTheftReportedValue,
  type ParsedTheftLineItem,
} from '@/lib/inbound-email-parser'
import {
  APP_LOCALE,
  APP_TIME_ZONE,
  getDisplayStoreCode,
} from '@/lib/utils'
import {
  buildVisitReportSummary,
  getVisitReportTypeLabel,
  normalizeActivityVisitReportPayload,
  normalizeVisitReportPayload,
  normalizeTargetedTheftVisitPayload,
  type VisitReportType,
} from '@/lib/reports/visit-report-types'
import {
  buildStoreVisitActivityDetailText,
  formatStoreVisitActivityFieldValue,
  getStoreVisitActivityFieldDefinitions,
  getStoreVisitActivityLabel,
  getStoreVisitTypeLabel,
  isStoreVisitActivityKey,
  normalizeStoreVisitActivityDetails,
  normalizeStoreVisitActivityPayloads,
  type StoreVisitActivityFieldDefinition,
  type StoreVisitActivityKey,
  type StoreVisitActivityDetails,
  type StoreVisitActivityPayloads,
} from '@/lib/visit-needs'

type SupabaseClient = ReturnType<typeof createClient>

type RelatedStoreRow = {
  store_name: string | null
  store_code: string | null
}

type RelatedProfileRow = {
  full_name: string | null
}

type MonthlyStoreVisitRow = {
  id: string
  store_id: string
  visited_at: string
  visit_type: string
  completed_activity_keys: string[] | null
  completed_activity_details: Record<string, string> | null
  completed_activity_payloads: Record<string, unknown> | null
  notes: string | null
  store: RelatedStoreRow | RelatedStoreRow[] | null
  created_by: RelatedProfileRow | RelatedProfileRow[] | null
}

type MonthlyVisitReportRow = {
  id: string
  store_id: string
  store_visit_id: string | null
  report_type: string
  title: string
  summary: string | null
  visit_date: string
  payload: unknown
  updated_at: string
  store: RelatedStoreRow | RelatedStoreRow[] | null
  created_by: RelatedProfileRow | RelatedProfileRow[] | null
}

type MonthlyIncidentEmailRow = {
  id: string
  matched_store_id: string | null
  subject: string | null
  analysis_summary: string | null
  analysis_template_key: string | null
  analysis_payload: unknown
  received_at: string | null
  created_at: string
  body_text: string | null
  body_preview: string | null
  store: RelatedStoreRow | RelatedStoreRow[] | null
}

type MonthlyLinkedIncidentRow = {
  id: string
  summary: string | null
  description: string | null
  severity: string | null
  status: string | null
  reported_at: string | null
  created_at: string
  occurred_at: string | null
  updated_at: string | null
  closed_at: string | null
  persons_involved: unknown
}

type MonthlyLinkedActionRow = {
  id: string
  incident_id: string
  title: string
  description: string | null
  status: string | null
  priority: string | null
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string | null
}

export interface MonthlyReportRow {
  id: string
  storeId: string | null
  storeName: string
  storeCode: string | null
  visitedAt: string
  createdByName: string | null
  generatedDetails: string
  summarySourceDetails: string
  reportCount: number
  reportLabels: string[]
  source: 'visit' | 'report' | 'incident'
  incidentTemplateKey: string | null
  incidentCategory: 'theft' | 'other' | null
  theftValueGbp: number | null
}

export interface MonthlyReportData {
  period: {
    month: string
    label: string
    start: string
    endExclusive: string
    startDate: string
    endDateExclusive: string
  }
  summary: {
    storesVisited: number
    incidentsReported: number
    investigationsCarried: number
    lpManagers: string[]
  }
  rows: MonthlyReportRow[]
  warnings: string[]
}

export interface MonthlyReportPdfRequestBody {
  month?: string | null
  areaManagerSupportCalls?: number | string | null
  detailOverrides?: Record<string, string> | null
  useAiSummaries?: boolean | null
}

function getRelatedRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function normalizeMonthInput(month?: string | null) {
  const trimmed = String(month || '').trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function getMonthlyPeriod(month?: string | null) {
  const normalizedMonth = normalizeMonthInput(month)
  const [year, monthIndex] = normalizedMonth.split('-').map((value) => Number(value))
  const start = new Date(Date.UTC(year, monthIndex - 1, 1))
  const endExclusive = new Date(Date.UTC(year, monthIndex, 1))

  return {
    month: normalizedMonth,
    label: start.toLocaleDateString(APP_LOCALE, {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }),
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: endExclusive.toISOString().slice(0, 10),
  }
}

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function collapseWhitespace(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function uniqueLines(lines: Array<string | null | undefined>) {
  const output: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const normalized = toText(line)
    if (!normalized) continue
    const dedupeKey = normalized.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    output.push(normalized)
  }

  return output
}

function truncateMonthlyText(value: string | null | undefined, maxLength = 600) {
  const normalized = collapseWhitespace(value)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

function summarizeNarrativeText(value: string | null | undefined, maxLength = 220) {
  const paragraphs = String(value || '')
    .split(/\n\s*\n/)
    .map((paragraph) => collapseWhitespace(paragraph))
    .filter(Boolean)
    .filter((paragraph) => hasMeaningfulText(paragraph))

  if (paragraphs.length === 0) return null

  const preferredParagraphs =
    paragraphs.length > 1 && /^visit summary:/i.test(paragraphs[0])
      ? paragraphs.slice(1)
      : paragraphs

  const summaryParts: string[] = []
  for (const paragraph of preferredParagraphs) {
    const candidate = [...summaryParts, paragraph].join(' ')
    if (summaryParts.length > 0 && candidate.length > maxLength) break
    summaryParts.push(paragraph)
    if (candidate.length >= Math.floor(maxLength * 0.72) || summaryParts.length >= 2) {
      break
    }
  }

  return truncateMonthlyText(summaryParts.join(' '), maxLength) || null
}

function stripPlaceholderPrefix(value: string) {
  return value.replace(/^[A-Za-z][A-Za-z0-9 /&(),._-]*:\s*/, '').trim()
}

function isPlaceholderText(value: string | null | undefined) {
  const normalized = collapseWhitespace(value)
  if (!normalized) return true

  const candidate = stripPlaceholderPrefix(normalized).toLowerCase()
  if (!candidate) return true

  return (
    /^(?:n\/?a|none|not stated|not recorded|not provided|unknown|blank|nil)$/i.test(candidate) ||
    candidate === 'n/a.' ||
    candidate === 'na'
  )
}

function hasMeaningfulText(value: string | null | undefined) {
  const normalized = String(value || '').trim()
  if (!normalized) return false

  return normalized
    .split(/\n|•/)
    .map((segment) => collapseWhitespace(segment))
    .filter(Boolean)
    .some((segment) => !isPlaceholderText(segment))
}

function isGenericReportSummary(summary: string | null | undefined, title: string | null | undefined) {
  const normalizedSummary = collapseWhitespace(summary).toLowerCase()
  const normalizedTitle = collapseWhitespace(title).toLowerCase()

  if (!hasMeaningfulText(summary)) return true
  if (normalizedSummary === normalizedTitle) return true
  if (normalizedSummary.startsWith('visit report follow-up:')) return true

  return false
}

function sanitizeVisitNote(note: string | null | undefined) {
  const normalized = toText(note)
  if (!normalized) return null

  const cleaned = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^Source visit report ID:/i.test(line) && !/^Created from final visit report:/i.test(line))
    .join('\n')
    .trim()

  return cleaned || null
}

function isSupportedVisitReportType(value: string): value is VisitReportType {
  return value === 'targeted_theft_visit' || isStoreVisitActivityKey(value)
}

function getMonthlyReportLabel(report: MonthlyVisitReportRow) {
  const reportType = String(report.report_type || '')
  if (isSupportedVisitReportType(reportType)) {
    return getVisitReportTypeLabel(reportType)
  }

  const title = toText(report.title)
  return title || 'Completed report'
}

function buildActivityPayloadFieldLines(
  reportType: StoreVisitActivityKey
): Array<{ field: StoreVisitActivityFieldDefinition; index: number }> {

  const excludedKeys = new Set([
    'activityReference',
    'timeWindowInScope',
    'storeArea',
    'evidenceReference',
    'caseConfidence',
    'outcomeStatus',
    'followUpOwner',
    'followUpDeadline',
    'followUpStatus',
    'followUpCompletedAt',
    'followUpOwnerDeadline',
  ])
  const preferredFieldOrder = [
    'lpObjective',
    'investigationFocus',
    'recordsReviewed',
    'evidenceReviewed',
    'systemsChecked',
    'controlsChecked',
    'paperworkChecked',
    'openingChecksCompleted',
    'closingChecksCompleted',
    'statementPurpose',
    'rootCauseOrWeakness',
    'faultsFound',
    'weaknessesFound',
    'issuesAtOpen',
    'issuesAtClose',
    'keyLPConcern',
    'lossValueImpact',
    'functionTestCompleted',
    'workCompleted',
    'actionsAgreed',
    'correctiveAction',
    'actionsBeforeTrading',
    'actionsBeforeLeaving',
    'immediateContainment',
    'outcomeOrEscalation',
    'peoplePresent',
    'peopleSpokenTo',
    'teamPresent',
    'teamPresentAtOpen',
  ]
  const priorityByKey = new Map(preferredFieldOrder.map((key, index) => [key, index]))

  return getStoreVisitActivityFieldDefinitions(reportType)
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !excludedKeys.has(field.key))
    .sort((left, right) => {
      const leftPriority = priorityByKey.get(left.field.key) ?? Number.MAX_SAFE_INTEGER
      const rightPriority = priorityByKey.get(right.field.key) ?? Number.MAX_SAFE_INTEGER
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      return left.index - right.index
    })
}

function buildActivityVisitReportDetailLines(report: MonthlyVisitReportRow) {
  if (!isStoreVisitActivityKey(report.report_type)) return [] as string[]

  const activityKey: StoreVisitActivityKey = report.report_type
  const normalizedPayload = normalizeActivityVisitReportPayload(activityKey, report.payload)
  const detailText = buildStoreVisitActivityDetailText(
    activityKey,
    undefined,
    normalizedPayload.activityPayload
  )
  const fieldLines = buildActivityPayloadFieldLines(activityKey)
    .map(({ field }) => {
      const rawValue = toText(normalizedPayload.activityPayload?.fields?.[field.key])
      const formattedValue = formatStoreVisitActivityFieldValue(activityKey, field.key, rawValue)
      if (!hasMeaningfulText(formattedValue)) return null
      return `${field.label}: ${truncateMonthlyText(formattedValue, 1200)}`
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 4)
  const reportLabel = getVisitReportTypeLabel(activityKey)
  const explicitSummary = !isGenericReportSummary(report.summary, report.title)
    ? truncateMonthlyText(report.summary, 1200)
    : ''

  return uniqueLines([
    hasMeaningfulText(explicitSummary) ? `${reportLabel}: ${explicitSummary}` : null,
    hasMeaningfulText(detailText) ? `${reportLabel}: ${truncateMonthlyText(detailText, 1200)}` : null,
    ...fieldLines,
    hasMeaningfulText(normalizedPayload.findings)
      ? `Findings: ${truncateMonthlyText(normalizedPayload.findings, 1200)}`
      : null,
    hasMeaningfulText(normalizedPayload.actionsTaken)
      ? `Action: ${truncateMonthlyText(normalizedPayload.actionsTaken, 1200)}`
      : null,
  ])
}

function buildTargetedTheftVisitReportDetailLines(report: MonthlyVisitReportRow) {
  const normalizedPayload = normalizeTargetedTheftVisitPayload(report.payload)
  const explicitSummary = !isGenericReportSummary(report.summary, report.title)
    ? truncateMonthlyText(report.summary, 1200)
    : ''
  const incidentOverview = truncateMonthlyText(normalizedPayload.incidentOverview.summary, 1200)
  const targetedProducts = truncateMonthlyText(normalizedPayload.incidentOverview.primaryProducts, 500)
  const headlineParts = [
    normalizedPayload.riskRating ? `Risk ${normalizedPayload.riskRating.toUpperCase()}` : null,
    normalizedPayload.incidentOverview.incidentCount
      ? `${normalizedPayload.incidentOverview.incidentCount} recent incident(s) reviewed`
      : null,
    targetedProducts ? `Targeted products: ${targetedProducts}` : null,
  ].filter(Boolean)
  const immediateActions = truncateMonthlyText(normalizedPayload.immediateActionsTaken.actionsCompleted, 1200)

  return uniqueLines([
    headlineParts.length > 0
      ? `${getVisitReportTypeLabel('targeted_theft_visit')}: ${headlineParts.join(' • ')}`
      : null,
    hasMeaningfulText(immediateActions)
      ? `Immediate actions: ${immediateActions}`
      : null,
    hasMeaningfulText(explicitSummary)
      ? `Follow-up summary: ${explicitSummary}`
      : null,
    hasMeaningfulText(incidentOverview) && !isGenericReportSummary(incidentOverview, report.title)
      ? `Incident overview: ${incidentOverview}`
      : null,
  ])
}

function buildReportDetailLines(report: MonthlyVisitReportRow) {
  const reportType = String(report.report_type || '')
  const summary = toText(report.summary)
  const title = toText(report.title) || 'Completed report'

  if (!isSupportedVisitReportType(reportType)) {
    return [`${title}${summary ? `: ${summary}` : ''}`]
  }

  if (reportType === 'targeted_theft_visit') {
    const detailLines = buildTargetedTheftVisitReportDetailLines(report)
    return detailLines.length > 0 ? detailLines : [title]
  }

  const detailLines = buildActivityVisitReportDetailLines(report)
  if (detailLines.length > 0) return detailLines

  const payload = normalizeVisitReportPayload(reportType, report.payload)
  const generatedSummary = buildVisitReportSummary(reportType, payload)
  const finalSummary = !isGenericReportSummary(summary, title) ? summary : generatedSummary || title

  return [`${getVisitReportTypeLabel(reportType)}: ${finalSummary}`]
}

function buildVisitActivityDetails(
  visit: MonthlyStoreVisitRow,
  options?: { includeVisitTypeFallback?: boolean }
) {
  const includeVisitTypeFallback = options?.includeVisitTypeFallback !== false
  const selectedKeys = (Array.isArray(visit.completed_activity_keys) ? visit.completed_activity_keys : [])
    .filter((key): key is Parameters<typeof buildStoreVisitActivityDetailText>[0] => isStoreVisitActivityKey(key))

  const detailMap: StoreVisitActivityDetails = normalizeStoreVisitActivityDetails(
    visit.completed_activity_details,
    selectedKeys
  )
  const payloadMap: StoreVisitActivityPayloads = normalizeStoreVisitActivityPayloads(
    visit.completed_activity_payloads,
    selectedKeys
  )

  const detailLines = selectedKeys.map((key) => {
    const detailText =
      (hasMeaningfulText(buildStoreVisitActivityDetailText(key, undefined, payloadMap[key]))
        ? buildStoreVisitActivityDetailText(key, undefined, payloadMap[key])
        : null) ||
      summarizeNarrativeText(detailMap[key], 220) ||
      (hasMeaningfulText(detailMap[key]) ? truncateMonthlyText(detailMap[key], 220) : null) ||
      `${getStoreVisitActivityLabel(key)} completed.`

    return `${getStoreVisitActivityLabel(key)}: ${detailText}`
  })

  const cleanedNote = sanitizeVisitNote(visit.notes)

  return uniqueLines([
    ...detailLines,
    detailLines.length === 0 && cleanedNote
      ? `Visit note: ${truncateMonthlyText(cleanedNote, 220)}`
      : null,
    includeVisitTypeFallback && detailLines.length === 0 && !cleanedNote
      ? `${getStoreVisitTypeLabel(visit.visit_type as Parameters<typeof getStoreVisitTypeLabel>[0])} completed.`
      : null,
  ])
}

function buildIncidentEmailDetails(email: MonthlyIncidentEmailRow) {
  const isTheftIncident = isTheftIncidentEmail(email)
  const subject = toText(email.subject)
  const summary = toText(email.analysis_summary)
  const theftLineItems = getTheftLineItems(email)
  const monthlyTheftSubject = isTheftIncident ? normalizeMonthlyTheftText(subject) : subject
  const catalogTotalValueGbp = getTheftCatalogTotalValue(email, theftLineItems)
  const reportedTotalValueGbp = getTheftReportedTotalValue(email, theftLineItems)
  const totalValueLine = catalogTotalValueGbp !== null
    ? `Estimated website value: ${formatCurrency(catalogTotalValueGbp)}`
    : reportedTotalValueGbp !== null
      ? `Reported total value: ${formatCurrency(reportedTotalValueGbp)}`
      : 'Reported total value: Not stated in email'

  if (!isTheftIncident) {
    return uniqueLines([
      summary ? `Incident reported by email: ${summary}` : 'Incident reported by email',
      subject ? `Email subject: ${subject}` : null,
    ]).join('\n')
  }

  if (theftLineItems.length > 0) {
    return uniqueLines([
      'Theft reported by email.',
      'Lines stolen:',
      ...theftLineItems.map(formatTheftLineItem),
      totalValueLine,
      monthlyTheftSubject ? `Email subject: ${monthlyTheftSubject}` : null,
    ]).join('\n')
  }

  return uniqueLines([
    'Theft reported by email.',
    'Lines stolen: Not stated in email',
    totalValueLine,
    monthlyTheftSubject ? `Email subject: ${monthlyTheftSubject}` : null,
  ]).join('\n')
}

function getDisplayedTheftValueGbp(email: MonthlyIncidentEmailRow, lineItems: ParsedTheftLineItem[]) {
  const catalogTotalValueGbp = getTheftCatalogTotalValue(email, lineItems)
  if (catalogTotalValueGbp !== null) return catalogTotalValueGbp
  return getTheftReportedTotalValue(email, lineItems)
}

function normalizeMonthlyTheftText(value: string) {
  return value
    .replace(/\bTheft,\s*Review\s*-\s*/g, 'Theft - ')
    .replace(/\btheft,\s*review\s*-\s*/g, 'theft - ')
    .replace(/\bTheft,\s*Review\b/g, 'Theft')
    .replace(/\btheft,\s*review\b/g, 'theft')
    .replace(/\bTheft\s+Review\b/g, 'Theft')
    .replace(/\btheft\s+review\b/g, 'theft')
}

function getMonthlyTheftSummary(
  email: MonthlyIncidentEmailRow,
  theftLineItems: ParsedTheftLineItem[],
  summary: string
) {
  const normalizedSummary = normalizeMonthlyTheftText(summary)
  if (
    normalizedSummary &&
    !/\bstock\s*(?:id|code)?\b/i.test(normalizedSummary) &&
    !/^store theft reported\.?$/i.test(normalizedSummary)
  ) {
    return normalizedSummary
  }

  const extractedFields = getExtractedFields(email)
  const relatedStore = getRelatedRow(email.store)
  const storeName = toText(relatedStore?.store_name) || toText(extractedFields?.storeName)
  const firstLineDescription = theftLineItems[0]
    ? getTheftLineDisplayDescription(theftLineItems[0])
    : toText(extractedFields?.productDescription)

  return [
    'Store theft reported',
    storeName ? `by ${formatStoreName(storeName)}` : null,
    firstLineDescription ? `involving ${firstLineDescription}` : null,
  ].filter(Boolean).join(' ')
}

function getAnalysisPayloadObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getExtractedFields(email: MonthlyIncidentEmailRow) {
  const payload = getAnalysisPayloadObject(email.analysis_payload)
  const extractedFields = payload?.extractedFields
  if (!extractedFields || typeof extractedFields !== 'object' || Array.isArray(extractedFields)) return null
  return extractedFields as Record<string, unknown>
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[£,\s]/g, '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeTheftLineItem(value: unknown): ParsedTheftLineItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const item = value as Record<string, unknown>
  const quantity = toFiniteNumber(item.quantity)
  const stockId = toText(item.stockId)
  const description = toText(item.description)
  const valueGbp = toFiniteNumber(item.valueGbp)
  const catalogProductId = toText(item.catalogProductId)
  const catalogProductTitle = toText(item.catalogProductTitle)
  const catalogUnitPriceGbp = toFiniteNumber(item.catalogUnitPriceGbp)
  const catalogLineValueGbp = toFiniteNumber(item.catalogLineValueGbp)
  const catalogMatchType =
    item.catalogMatchType === 'stock_id' || item.catalogMatchType === 'description'
      ? item.catalogMatchType
      : null

  if (
    !stockId &&
    !description &&
    quantity === null &&
    valueGbp === null &&
    !catalogProductId &&
    !catalogProductTitle &&
    catalogUnitPriceGbp === null &&
    catalogLineValueGbp === null
  ) {
    return null
  }

  return {
    quantity: quantity === null ? null : Math.round(quantity),
    stockId: stockId || null,
    description: description || null,
    valueGbp,
    catalogProductId: catalogProductId || null,
    catalogProductTitle: catalogProductTitle || null,
    catalogUnitPriceGbp,
    catalogLineValueGbp,
    catalogMatchType,
  }
}

function getTheftBodyText(email: MonthlyIncidentEmailRow) {
  return [email.body_text, email.body_preview].map((value) => String(value || '').trim()).filter(Boolean).join('\n')
}

function dedupeTheftLineItems(items: ParsedTheftLineItem[]) {
  const output = new Map<string, ParsedTheftLineItem>()

  for (const item of items) {
    const normalizedDescription = toText(item.description).toLowerCase()
    const key = item.stockId
      ? `stock:${item.quantity ?? ''}:${item.stockId}`
      : `description:${item.quantity ?? ''}:${normalizedDescription}`
    const existing = output.get(key)

    if (!existing) {
      output.set(key, item)
      continue
    }

    const existingScore =
      (existing.catalogProductTitle ? 50 : 0) +
      (typeof existing.catalogLineValueGbp === 'number' ? 25 : 0) +
      (typeof existing.catalogUnitPriceGbp === 'number' ? 10 : 0) +
      (typeof existing.valueGbp === 'number' ? 5 : 0) +
      (existing.description && !/^(stock\s*(?:id|code)?|sku)\b/i.test(existing.description) ? 5 : 0)
    const nextScore =
      (item.catalogProductTitle ? 50 : 0) +
      (typeof item.catalogLineValueGbp === 'number' ? 25 : 0) +
      (typeof item.catalogUnitPriceGbp === 'number' ? 10 : 0) +
      (typeof item.valueGbp === 'number' ? 5 : 0) +
      (item.description && !/^(stock\s*(?:id|code)?|sku)\b/i.test(item.description) ? 5 : 0)

    if (nextScore > existingScore) {
      output.set(key, item)
    }
  }

  return Array.from(output.values())
}

function getTheftLineItems(email: MonthlyIncidentEmailRow) {
  const extractedFields = getExtractedFields(email)
  const extractedLineItems = Array.isArray(extractedFields?.lineItems)
    ? extractedFields.lineItems.map(normalizeTheftLineItem).filter((item): item is ParsedTheftLineItem => Boolean(item))
    : []
  const bodyLineItems = extractStoreTheftLineItems(getTheftBodyText(email))

  const stockId = toText(extractedFields?.stockId)
  const productDescription = toText(extractedFields?.productDescription)
  if (stockId || productDescription) {
    const fallbackLineItem: ParsedTheftLineItem = {
      quantity: 1,
      stockId: stockId || null,
      description: productDescription || null,
      valueGbp: toFiniteNumber(extractedFields?.valueGbp),
      catalogProductId: toText(extractedFields?.catalogProductId) || null,
      catalogProductTitle: toText(extractedFields?.catalogProductTitle) || null,
      catalogUnitPriceGbp: toFiniteNumber(extractedFields?.catalogUnitPriceGbp),
      catalogLineValueGbp: toFiniteNumber(extractedFields?.catalogLineValueGbp),
      catalogMatchType:
        extractedFields?.catalogMatchType === 'stock_id' || extractedFields?.catalogMatchType === 'description'
          ? extractedFields.catalogMatchType
          : null,
    }

    return dedupeTheftLineItems([
      ...extractedLineItems,
      fallbackLineItem,
      ...bodyLineItems,
    ])
  }

  return dedupeTheftLineItems([
    ...extractedLineItems,
    ...bodyLineItems,
  ])
}

async function hydrateIncidentEmailForMonthlyReport(email: MonthlyIncidentEmailRow) {
  if (!isTheftIncidentEmail(email)) return email

  const theftLineItems = getTheftLineItems(email)
  if (theftLineItems.length === 0) return email

  const enrichedLineItems = dedupeTheftLineItems(
    await enrichTheftLineItemsWithCatalog(theftLineItems)
  )
  const existingPayload = getAnalysisPayloadObject(email.analysis_payload) || {}
  const existingExtractedFields = getExtractedFields(email) || {}
  const existingReportedTotal =
    toFiniteNumber(existingExtractedFields.reportedTotalValueGbp) ??
    toFiniteNumber(existingExtractedFields.totalValueGbp) ??
    toFiniteNumber(existingExtractedFields.valueGbp) ??
    toFiniteNumber(existingExtractedFields.lossValueGbp)
  const catalogTotalValueRaw = enrichedLineItems.reduce((total, item) => {
    return typeof item.catalogLineValueGbp === 'number' ? total + item.catalogLineValueGbp : total
  }, 0)
  const catalogTotalValueGbp = catalogTotalValueRaw > 0
    ? Math.round(catalogTotalValueRaw * 100) / 100
    : null

  return {
    ...email,
    analysis_payload: {
      ...existingPayload,
      extractedFields: {
        ...existingExtractedFields,
        lineItems: enrichedLineItems,
        productDescription:
          toText(existingExtractedFields.productDescription) ||
          enrichedLineItems[0]?.description ||
          null,
        reportedTotalValueGbp: existingReportedTotal,
        catalogTotalValueGbp,
        totalValueGbp: existingReportedTotal ?? catalogTotalValueGbp,
      },
    },
  }
}

function hasTheftSignal(value: string | null | undefined) {
  return /\b(theft|stolen|shoplift(?:ed|ing)?)\b/i.test(String(value || ''))
}

function isTheftIncidentEmail(email: MonthlyIncidentEmailRow) {
  if (toText(email.analysis_template_key).toLowerCase() === 'store_theft') {
    return true
  }

  const extractedFields = getExtractedFields(email)
  if (Array.isArray(extractedFields?.lineItems) && extractedFields.lineItems.length > 0) {
    return true
  }

  return (
    hasTheftSignal(email.subject) ||
    hasTheftSignal(email.analysis_summary) ||
    hasTheftSignal(getTheftBodyText(email))
  )
}

function getTheftReportedTotalValue(email: MonthlyIncidentEmailRow, lineItems: ParsedTheftLineItem[]) {
  const extractedFields = getExtractedFields(email)
  const extractedTotal =
    toFiniteNumber(extractedFields?.reportedTotalValueGbp) ??
    toFiniteNumber(extractedFields?.totalValueGbp) ??
    toFiniteNumber(extractedFields?.valueGbp) ??
    toFiniteNumber(extractedFields?.lossValueGbp)

  if (extractedTotal !== null) return extractedTotal
  return extractStoreTheftReportedValue(getTheftBodyText(email), lineItems)
}

function getTheftCatalogTotalValue(email: MonthlyIncidentEmailRow, lineItems: ParsedTheftLineItem[]) {
  const extractedFields = getExtractedFields(email)
  const extractedTotal = toFiniteNumber(extractedFields?.catalogTotalValueGbp)

  if (extractedTotal !== null) return extractedTotal

  const catalogLineValueTotal = lineItems.reduce((total, item) => {
    return typeof item.catalogLineValueGbp === 'number' ? total + item.catalogLineValueGbp : total
  }, 0)

  return catalogLineValueTotal > 0 ? Math.round(catalogLineValueTotal * 100) / 100 : null
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function getTheftLineDisplayDescription(item: ParsedTheftLineItem) {
  const normalizedDescription = toText(item.description)

  if (
    normalizedDescription &&
    !/^(stock\s*(?:id|code)?|sku)\b/i.test(normalizedDescription) &&
    !/\b(?:crime|police|incident)\s+reference\b/i.test(normalizedDescription)
  ) {
    return normalizedDescription
  }

  return toText(item.catalogProductTitle) || 'Unknown'
}

function formatTheftLineItem(item: ParsedTheftLineItem) {
  const quantity = item.quantity && item.quantity > 0 ? `${item.quantity} x ` : ''
  const description = getTheftLineDisplayDescription(item)
  const stockId = item.stockId ? ` (Stock ID ${item.stockId})` : ''
  const value = typeof item.catalogLineValueGbp === 'number'
    ? ` - Website value ${formatCurrency(item.catalogLineValueGbp)}`
    : typeof item.valueGbp === 'number'
      ? ` - Reported value ${formatCurrency(item.valueGbp)}`
      : ''
  return `${quantity}${description}${stockId}${value}`
}

function getStoreLabelParts(store: RelatedStoreRow | null, fallbackStoreName?: string | null) {
  return {
    storeName: formatStoreName(store?.store_name || fallbackStoreName || 'Unknown Store'),
    storeCode: getDisplayStoreCode(store?.store_code || null),
  }
}

function getSortTime(value: string) {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function formatMonthlyDate(value: string | null | undefined) {
  const candidate = String(value || '').trim()
  if (!candidate) return null

  const parsed = new Date(candidate)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toLocaleDateString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatStatusLabel(value: string | null | undefined) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'open'
  if (normalized === 'under_investigation') return 'under investigation'
  if (normalized === 'actions_in_progress') return 'actions in progress'
  return normalized.replace(/_/g, ' ')
}

function buildLinkedFollowUpLines(
  reportId: string,
  incidentsByReportId: Map<string, MonthlyLinkedIncidentRow[]>,
  actionsByIncidentId: Map<string, MonthlyLinkedActionRow[]>
) {
  const incidents = [...(incidentsByReportId.get(reportId) || [])].sort((left, right) => {
    const leftTime = getSortTime(left.closed_at || left.updated_at || left.reported_at || left.created_at)
    const rightTime = getSortTime(right.closed_at || right.updated_at || right.reported_at || right.created_at)
    return rightTime - leftTime
  })

  if (incidents.length === 0) return [] as string[]

  const latestIncident = incidents[0]
  const incidentStatus = formatStatusLabel(latestIncident.status)
  const incidentClosedAt = formatMonthlyDate(
    latestIncident.closed_at || latestIncident.updated_at || latestIncident.reported_at || latestIncident.created_at
  )
  const incidentReportedAt = formatMonthlyDate(
    latestIncident.reported_at || latestIncident.created_at || latestIncident.occurred_at
  )

  const manualActions = incidents.flatMap((incident) => actionsByIncidentId.get(incident.id) || [])
  const completedActions = manualActions
    .filter((action) => String(action.status || '').trim().toLowerCase() === 'complete')
    .sort((left, right) => getSortTime(right.completed_at || right.updated_at || right.created_at) - getSortTime(left.completed_at || left.updated_at || left.created_at))
  const openActions = manualActions.filter((action) => {
    const status = String(action.status || '').trim().toLowerCase()
    return status && status !== 'complete' && status !== 'cancelled'
  })

  return uniqueLines([
    String(latestIncident.status || '').trim().toLowerCase() === 'closed'
      ? `Follow-up incident closed${incidentClosedAt ? ` on ${incidentClosedAt}` : ''}.`
      : `Follow-up incident${incidentReportedAt ? ` raised ${incidentReportedAt}` : ''} and is ${incidentStatus}.`,
    completedActions.length === 1
      ? `Completed action: ${truncateMonthlyText(completedActions[0].title, 160)}${formatMonthlyDate(completedActions[0].completed_at || completedActions[0].updated_at || completedActions[0].created_at) ? ` (${formatMonthlyDate(completedActions[0].completed_at || completedActions[0].updated_at || completedActions[0].created_at)})` : ''}.`
      : completedActions.length > 1
        ? `${completedActions.length} follow-up actions completed${formatMonthlyDate(completedActions[0].completed_at || completedActions[0].updated_at || completedActions[0].created_at) ? `, latest ${formatMonthlyDate(completedActions[0].completed_at || completedActions[0].updated_at || completedActions[0].created_at)}` : ''}.`
        : null,
    openActions.length === 1
      ? `Open action: ${truncateMonthlyText(openActions[0].title, 160)}${formatMonthlyDate(openActions[0].due_date) ? ` due ${formatMonthlyDate(openActions[0].due_date)}` : ''}.`
      : openActions.length > 1
        ? `${openActions.length} follow-up actions remain open.`
        : null,
  ])
}

async function getCompletedStoreVisits(
  supabase: SupabaseClient,
  period: ReturnType<typeof getMonthlyPeriod>,
  warnings: string[]
) {
  const result = await supabase
    .from('tfs_store_visits')
    .select(`
      id,
      store_id,
      visited_at,
      visit_type,
      completed_activity_keys,
      completed_activity_details,
      completed_activity_payloads,
      notes,
      store:tfs_stores!tfs_store_visits_store_id_fkey(store_name, store_code),
      created_by:fa_profiles!tfs_store_visits_created_by_user_id_fkey(full_name)
    `)
    .eq('status', 'completed')
    .gte('visited_at', period.start)
    .lt('visited_at', period.endExclusive)
    .order('visited_at', { ascending: false })

  if (result.error) {
    console.error('Error fetching monthly report store visits:', result.error)
    warnings.push('Completed store visits could not be loaded for this month.')
    return [] as MonthlyStoreVisitRow[]
  }

  return (result.data || []) as MonthlyStoreVisitRow[]
}

async function getCompletedVisitReports(
  supabase: SupabaseClient,
  period: ReturnType<typeof getMonthlyPeriod>,
  warnings: string[]
) {
  const result = await supabase
    .from('tfs_visit_reports')
    .select(`
      id,
      store_id,
      store_visit_id,
      report_type,
      title,
      summary,
      visit_date,
      payload,
      updated_at,
      store:tfs_stores!tfs_visit_reports_store_id_fkey(store_name, store_code),
      created_by:fa_profiles!tfs_visit_reports_created_by_user_id_fkey(full_name)
    `)
    .eq('status', 'final')
    .gte('visit_date', period.startDate)
    .lt('visit_date', period.endDateExclusive)
    .order('visit_date', { ascending: false })
    .order('updated_at', { ascending: false })

  if (result.error) {
    console.error('Error fetching monthly report visit reports:', result.error)
    warnings.push('Completed report templates could not be loaded for this month.')
    return [] as MonthlyVisitReportRow[]
  }

  return (result.data || []) as MonthlyVisitReportRow[]
}

async function getIncidentEmailCount(
  supabase: SupabaseClient,
  period: ReturnType<typeof getMonthlyPeriod>,
  warnings: string[]
) {
  const result = await supabase
    .from('tfs_inbound_emails')
    .select('id', { count: 'exact', head: true })
    .gte('received_at', period.start)
    .lt('received_at', period.endExclusive)
    .eq('analysis_needs_incident', true)
    .neq('processing_status', 'ignored')
    .or('analysis_template_key.is.null,analysis_template_key.neq.stocktake_result')

  if (result.error) {
    console.error('Error fetching monthly report incident email count:', result.error)
    warnings.push('Inbound-email incident totals could not be loaded for this month.')
    return 0
  }

  return result.count || 0
}

async function getIncidentEmailRows(
  supabase: SupabaseClient,
  period: ReturnType<typeof getMonthlyPeriod>,
  warnings: string[]
) {
  const result = await supabase
    .from('tfs_inbound_emails')
    .select(`
      id,
      matched_store_id,
      subject,
      analysis_summary,
      analysis_template_key,
      analysis_payload,
      received_at,
      created_at,
      body_text,
      body_preview,
      store:tfs_stores!tfs_inbound_emails_matched_store_id_fkey(store_name, store_code)
    `)
    .gte('received_at', period.start)
    .lt('received_at', period.endExclusive)
    .eq('analysis_needs_incident', true)
    .neq('processing_status', 'ignored')
    .or('analysis_template_key.is.null,analysis_template_key.neq.stocktake_result')
    .order('received_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (result.error) {
    console.error('Error fetching monthly report incident email rows:', result.error)
    warnings.push('Incident email rows could not be loaded for this month.')
    return [] as MonthlyIncidentEmailRow[]
  }

  return (result.data || []) as MonthlyIncidentEmailRow[]
}

async function getLinkedVisitReportIncidentsFromTable(
  supabase: SupabaseClient,
  tableName: 'tfs_incidents' | 'tfs_closed_incidents',
  reportIds: string[],
  warnings: string[]
) {
  if (reportIds.length === 0) return [] as MonthlyLinkedIncidentRow[]

  const select =
    'id, summary, description, severity, status, reported_at, created_at, occurred_at, updated_at, closed_at, persons_involved'
  const result = await supabase
    .from(tableName)
    .select(select)
    .in('persons_involved->>visit_report_id', reportIds)

  if (result.error) {
    console.error(`Error fetching linked monthly report incidents from ${tableName}:`, result.error)
    warnings.push('Linked follow-up incident details could not be fully loaded for some visit reports.')
    return [] as MonthlyLinkedIncidentRow[]
  }

  const directRows = (result.data || []) as MonthlyLinkedIncidentRow[]
  const matchedReportIds = new Set(
    directRows
      .map((incident) => extractLinkedVisitReportId(incident))
      .filter((reportId): reportId is string => Boolean(reportId))
  )
  const missingReportIds = reportIds.filter((reportId) => !matchedReportIds.has(reportId))

  if (missingReportIds.length === 0) {
    return directRows
  }

  const fallbackResults = await Promise.all(
    missingReportIds.map(async (reportId) => {
      const fallback = await supabase
        .from(tableName)
        .select(select)
        .ilike('description', `%${buildVisitReportSourceMarker(reportId)}%`)
        .order('updated_at', { ascending: false })
        .limit(1)

      if (fallback.error) {
        console.error(`Error running fallback linked-incident lookup in ${tableName}:`, fallback.error)
        return [] as MonthlyLinkedIncidentRow[]
      }

      return (fallback.data || []) as MonthlyLinkedIncidentRow[]
    })
  )

  return [...directRows, ...fallbackResults.flat()]
}

async function getLinkedVisitReportFollowUpData(
  supabase: SupabaseClient,
  reports: MonthlyVisitReportRow[],
  warnings: string[]
) {
  const targetedReportIds = Array.from(
    new Set(
      reports
        .filter((report) => report.report_type === 'targeted_theft_visit')
        .map((report) => report.id)
    )
  )

  const incidentsByReportId = new Map<string, MonthlyLinkedIncidentRow[]>()
  const actionsByIncidentId = new Map<string, MonthlyLinkedActionRow[]>()

  if (targetedReportIds.length === 0) {
    return { incidentsByReportId, actionsByIncidentId }
  }

  const [openIncidents, closedIncidents] = await Promise.all([
    getLinkedVisitReportIncidentsFromTable(supabase, 'tfs_incidents', targetedReportIds, warnings),
    getLinkedVisitReportIncidentsFromTable(supabase, 'tfs_closed_incidents', targetedReportIds, warnings),
  ])

  const incidentMap = new Map<string, MonthlyLinkedIncidentRow>()
  for (const incident of [...openIncidents, ...closedIncidents]) {
    if (!incident?.id) continue
    const existing = incidentMap.get(incident.id)
    if (!existing) {
      incidentMap.set(incident.id, incident)
      continue
    }

    const existingTime = getSortTime(existing.closed_at || existing.updated_at || existing.reported_at || existing.created_at)
    const nextTime = getSortTime(incident.closed_at || incident.updated_at || incident.reported_at || incident.created_at)
    if (nextTime > existingTime) {
      incidentMap.set(incident.id, incident)
    }
  }

  const incidents = Array.from(incidentMap.values())
  for (const incident of incidents) {
    const reportId = extractLinkedVisitReportId(incident)
    if (!reportId) continue

    const existing = incidentsByReportId.get(reportId) || []
    existing.push(incident)
    incidentsByReportId.set(reportId, existing)
  }

  const incidentIds = incidents.map((incident) => incident.id)
  if (incidentIds.length === 0) {
    return { incidentsByReportId, actionsByIncidentId }
  }

  const actionsResult = await supabase
    .from('tfs_actions')
    .select('id, incident_id, title, description, status, priority, due_date, completed_at, created_at, updated_at')
    .in('incident_id', incidentIds)
    .not('title', 'ilike', 'Implement visit report actions:%')
    .order('created_at', { ascending: false })

  if (actionsResult.error) {
    console.error('Error fetching linked monthly report actions:', actionsResult.error)
    warnings.push('Linked follow-up action details could not be fully loaded for some visit reports.')
    return { incidentsByReportId, actionsByIncidentId }
  }

  for (const action of (actionsResult.data || []) as MonthlyLinkedActionRow[]) {
    const existing = actionsByIncidentId.get(action.incident_id) || []
    existing.push(action)
    actionsByIncidentId.set(action.incident_id, existing)
  }

  return { incidentsByReportId, actionsByIncidentId }
}

export async function buildMonthlyReportData(
  supabase: SupabaseClient,
  month?: string | null
): Promise<MonthlyReportData> {
  const period = getMonthlyPeriod(month)
  const warnings: string[] = []

  const [visits, reports, incidentsReported, incidentEmails] = await Promise.all([
    getCompletedStoreVisits(supabase, period, warnings),
    getCompletedVisitReports(supabase, period, warnings),
    getIncidentEmailCount(supabase, period, warnings),
    getIncidentEmailRows(supabase, period, warnings),
  ])
  const { incidentsByReportId, actionsByIncidentId } = await getLinkedVisitReportFollowUpData(
    supabase,
    reports,
    warnings
  )

  const reportsByVisitId = new Map<string, MonthlyVisitReportRow[]>()
  const unlinkedReports: MonthlyVisitReportRow[] = []

  for (const report of reports) {
    if (report.store_visit_id) {
      const existing = reportsByVisitId.get(report.store_visit_id) || []
      existing.push(report)
      reportsByVisitId.set(report.store_visit_id, existing)
      continue
    }

    unlinkedReports.push(report)
  }

  const rows: MonthlyReportRow[] = visits.map((visit) => {
    const store = getRelatedRow(visit.store)
    const createdBy = getRelatedRow(visit.created_by)
    const linkedReports = (reportsByVisitId.get(visit.id) || []).sort(
      (a, b) => getSortTime(b.updated_at || b.visit_date) - getSortTime(a.updated_at || a.visit_date)
    )
    const reportLabels = Array.from(
      new Set(linkedReports.map(getMonthlyReportLabel).filter(Boolean))
    )
    const reportLines = linkedReports.flatMap((report) => buildReportDetailLines(report))
    const visitActivityLines = buildVisitActivityDetails(visit, {
      includeVisitTypeFallback: linkedReports.length === 0,
    })
    const followUpLines = linkedReports.flatMap((report) =>
      report.report_type === 'targeted_theft_visit'
        ? buildLinkedFollowUpLines(report.id, incidentsByReportId, actionsByIncidentId)
        : []
    )
    const { storeName, storeCode } = getStoreLabelParts(store)

    const summarySourceDetails = uniqueLines([
      ...reportLines,
      ...visitActivityLines,
      ...followUpLines,
    ]).join('\n')

    return {
      id: `visit-${visit.id}`,
      storeId: visit.store_id || null,
      storeName,
      storeCode,
      visitedAt: visit.visited_at,
      createdByName: createdBy?.full_name?.trim() || null,
      generatedDetails: buildDeterministicMonthlyVisitSummary({
        storeName,
        reportLabels,
        detailText: summarySourceDetails,
      }),
      summarySourceDetails,
      reportCount: linkedReports.length,
      reportLabels,
      source: 'visit',
      incidentTemplateKey: null,
      incidentCategory: null,
      theftValueGbp: null,
    }
  })

  for (const report of unlinkedReports) {
    const store = getRelatedRow(report.store)
    const createdBy = getRelatedRow(report.created_by)
    const { storeName, storeCode } = getStoreLabelParts(store)
    const reportLabels = [getMonthlyReportLabel(report)]
    const visitedAt = /^\d{4}-\d{2}-\d{2}$/.test(report.visit_date)
      ? `${report.visit_date}T12:00:00.000Z`
      : report.updated_at

    const summarySourceDetails = uniqueLines([
      ...buildReportDetailLines(report),
      ...(report.report_type === 'targeted_theft_visit'
        ? buildLinkedFollowUpLines(report.id, incidentsByReportId, actionsByIncidentId)
        : []),
    ]).join('\n')

    rows.push({
      id: `report-${report.id}`,
      storeId: report.store_id || null,
      storeName,
      storeCode,
      visitedAt,
      createdByName: createdBy?.full_name?.trim() || null,
      generatedDetails: buildDeterministicMonthlyVisitSummary({
        storeName,
        reportLabels,
        detailText: summarySourceDetails,
      }),
      summarySourceDetails,
      reportCount: 1,
      reportLabels,
      source: 'report',
      incidentTemplateKey: null,
      incidentCategory: null,
      theftValueGbp: null,
    })
  }

  const hydratedIncidentEmails = await Promise.all(
    incidentEmails.map((email) => hydrateIncidentEmailForMonthlyReport(email))
  )

  for (const email of hydratedIncidentEmails) {
    const store = getRelatedRow(email.store)
    const { storeName, storeCode } = getStoreLabelParts(store)
    const incidentCategory = isTheftIncidentEmail(email) ? 'theft' : 'other'
    const theftLineItems = incidentCategory === 'theft' ? getTheftLineItems(email) : []

    rows.push({
      id: `incident-${email.id}`,
      storeId: email.matched_store_id || null,
      storeName,
      storeCode,
      visitedAt: email.received_at || email.created_at,
      createdByName: null,
      generatedDetails: buildIncidentEmailDetails(email),
      summarySourceDetails: buildIncidentEmailDetails(email),
      reportCount: 0,
      reportLabels: [],
      source: 'incident',
      incidentTemplateKey: email.analysis_template_key,
      incidentCategory,
      theftValueGbp: incidentCategory === 'theft' ? getDisplayedTheftValueGbp(email, theftLineItems) : null,
    })
  }

  rows.sort((a, b) => getSortTime(b.visitedAt) - getSortTime(a.visitedAt))

  const storeKeys = new Set(
    visits.map((visit) => String(visit.store_id || '').trim()).filter(Boolean)
  )
  const lpManagers = Array.from(
    new Set(
      visits
        .map((visit) => toText(getRelatedRow(visit.created_by)?.full_name))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, APP_LOCALE))

  return {
    period,
    summary: {
      storesVisited: storeKeys.size,
      incidentsReported,
      investigationsCarried: reports.length,
      lpManagers,
    },
    rows,
    warnings,
  }
}
