import { endOfMonth, format, isValid, parse, startOfMonth } from 'date-fns'
import {
  computeRevisitRiskForecast,
  getFRAStatusFromDate,
  type FRAStatus,
  type RevisitRiskStoreInput,
} from '@/lib/compliance-forecast'
import {
  getReportingAreaContact,
  getReportingAreaDisplayName,
  normalizeReportingAreaCode,
} from '@/lib/areas'
import { formatStoreName } from '@/lib/store-display'
import { isExtStoreCode, shouldHideStore } from '@/lib/store-normalization'
import { resolveStoreActionPriorityTheme } from '@/lib/store-action-titles'
import type {
  AreaNewsletterReport,
  MonthlyNewsletterRequestBody,
  MonthlyNewsletterResponse,
  NewsletterAreaStoreRow,
  NewsletterFRANotableItem,
  NewsletterStoreActionFocusItem,
  NewsletterStoreActionMetrics,
  NewsletterStoreScore,
} from '@/lib/reports/monthly-newsletter-types'

interface MonthPeriod {
  month: string
  label: string
  start: Date
  end: Date
  startIso: string
  endIso: string
}

interface StoreRow {
  id: string
  store_name: string
  store_code: string | null
  region: string | null
  reporting_area: string | null
  reporting_area_manager_name: string | null
  reporting_area_manager_email: string | null
  compliance_audit_1_date: string | null
  compliance_audit_1_overall_pct: number | null
  compliance_audit_2_date: string | null
  compliance_audit_2_planned_date: string | null
  compliance_audit_2_overall_pct: number | null
  compliance_audit_3_date: string | null
  compliance_audit_3_overall_pct: number | null
  fire_risk_assessment_date: string | null
  fire_risk_assessment_notes: string | null
}

interface HSAuditInstanceRow {
  id: string
  store_id: string | null
  conducted_at: string | null
  overall_score: number | null
  tfs_audit_templates:
    | {
        id: string
        title: string | null
        category: string | null
      }
    | Array<{
        id: string
        title: string | null
        category: string | null
      }>
    | null
}

interface StoreActionRow {
  id: string
  store_id: string | null
  title: string | null
  description: string | null
  source_flagged_item: string | null
  priority_summary?: string | null
  priority: string | null
  due_date: string | null
  status: string | null
  created_at: string | null
}

interface IncidentRow {
  id: string
  store_id: string | null
  status: string | null
}

interface StoreActionThemeAggregate {
  key: string
  topic: string
  managerPrompt: string
  actionCount: number
  storeIds: Set<string>
  highPriorityCount: number
  overdueCount: number
}

interface AreaGroup {
  code: string
  label: string
  managerName: string | null
  managerEmail: string | null
  stores: StoreRow[]
}

const DEFAULT_REMINDERS = [
  'Confirm weekly fire exit checks and document findings in the store logbook.',
  'Run a short team refresher on slips, trips, and housekeeping controls before weekend peaks.',
  'Ensure every open action has an owner, target date, and evidence upload attached.',
]

const DEFAULT_LEGISLATION_UPDATES = [
  'Reinforce duties under the Regulatory Reform (Fire Safety) Order 2005, especially clear escape routes and daily checks.',
  'Remind store teams to follow internal incident and near-miss reporting standards aligned with RIDDOR expectations.',
]

const STORE_ACTION_ACTIVE_STATUSES = new Set(['open', 'in_progress', 'blocked'])
const STORE_ACTION_HIGH_PRIORITIES = new Set(['high', 'urgent'])
const STORE_ACTION_P1_PRIORITIES = new Set(['urgent', 'critical', 'p1', 'priority 1', 'priority-1'])
const STORE_ACTION_P2_PRIORITIES = new Set(['high', 'p2', 'priority 2', 'priority-2'])
const INCIDENT_CLOSED_STATUSES = new Set(['closed', 'complete', 'completed', 'resolved', 'cancelled'])

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dateOnly = parse(trimmed, 'yyyy-MM-dd', new Date())
    if (!isValid(dateOnly)) return null
    return dateOnly
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function resolveMonthPeriod(rawMonth: string | undefined): MonthPeriod {
  const now = new Date()
  const parsed = rawMonth ? parse(`${rawMonth}-01`, 'yyyy-MM-dd', now) : now

  const monthStart = startOfMonth(isValid(parsed) ? parsed : now)
  const monthEnd = endOfMonth(monthStart)

  return {
    month: format(monthStart, 'yyyy-MM'),
    label: format(monthStart, 'MMMM yyyy'),
    start: monthStart,
    end: monthEnd,
    startIso: format(monthStart, 'yyyy-MM-dd'),
    endIso: format(monthEnd, 'yyyy-MM-dd'),
  }
}

function normalizeListInput(values: string[] | undefined, fallback: string[]): string[] {
  if (!values || values.length === 0) return fallback

  const sanitized = values.map((value) => value.trim()).filter((value) => value.length > 0)

  return sanitized.length > 0 ? sanitized : fallback
}

function getLatestAudit(store: StoreRow): { score: number | null; date: string | null } {
  const candidates: Array<{ score: number; date: string }> = []

  if (store.compliance_audit_1_date && typeof store.compliance_audit_1_overall_pct === 'number') {
    candidates.push({
      score: store.compliance_audit_1_overall_pct,
      date: store.compliance_audit_1_date,
    })
  }

  if (store.compliance_audit_2_date && typeof store.compliance_audit_2_overall_pct === 'number') {
    candidates.push({
      score: store.compliance_audit_2_overall_pct,
      date: store.compliance_audit_2_date,
    })
  }

  if (store.compliance_audit_3_date && typeof store.compliance_audit_3_overall_pct === 'number') {
    candidates.push({
      score: store.compliance_audit_3_overall_pct,
      date: store.compliance_audit_3_date,
    })
  }

  if (candidates.length === 0) {
    return { score: null, date: null }
  }

  candidates.sort((a, b) => {
    const dateA = parseDate(a.date)?.getTime() || 0
    const dateB = parseDate(b.date)?.getTime() || 0
    return dateB - dateA
  })

  return candidates[0]
}

function dateWithinMonth(value: string | null, period: MonthPeriod): boolean {
  const parsed = parseDate(value)
  if (!parsed) return false
  return parsed >= period.start && parsed <= period.end
}

function countAuditsCompletedInMonth(store: StoreRow, period: MonthPeriod): number {
  let count = 0

  if (dateWithinMonth(store.compliance_audit_1_date, period)) count += 1
  if (dateWithinMonth(store.compliance_audit_2_date, period)) count += 1
  if (dateWithinMonth(store.compliance_audit_3_date, period)) count += 1

  return count
}

function trimNote(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed
}

function buildManualHighlights(manualText: string): string[] {
  const normalized = manualText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (normalized.length === 0) return []

  const keywordMatches = normalized.filter((line) =>
    /(action|overdue|urgent|risk|hazard|missing|failed|training|remind|review|fire|evac)/i.test(
      line
    )
  )

  const prioritized = [...keywordMatches, ...normalized]
  const unique = Array.from(new Set(prioritized))

  return unique.slice(0, 6)
}

function normalizeStoreActionStatus(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function normalizeStoreActionPriority(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function isStoreActionActive(status: string | null | undefined): boolean {
  return STORE_ACTION_ACTIVE_STATUSES.has(normalizeStoreActionStatus(status))
}

function isStoreActionHighPriority(priority: string | null | undefined): boolean {
  return STORE_ACTION_HIGH_PRIORITIES.has(normalizeStoreActionPriority(priority))
}

function normalizeIncidentStatus(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function isIncidentActive(status: string | null | undefined): boolean {
  return !INCIDENT_CLOSED_STATUSES.has(normalizeIncidentStatus(status))
}

function buildStoreActionPriorityText(action: StoreActionRow): string {
  return [
    normalizeStoreActionPriority(action.priority),
    normalizeStoreActionPriority(action.priority_summary || null),
  ]
    .filter((value) => value.length > 0)
    .join(' ')
}

function resolveStoreActionPriorityTier(action: StoreActionRow): 'p1' | 'p2' | null {
  const priorityText = buildStoreActionPriorityText(action)
  if (!priorityText) return null

  const hasP1 =
    STORE_ACTION_P1_PRIORITIES.has(priorityText) ||
    /\bp[\s-]?1\b/.test(priorityText) ||
    /\bpriority[\s-]?1\b/.test(priorityText)
  if (hasP1) return 'p1'

  const hasP2 =
    STORE_ACTION_P2_PRIORITIES.has(priorityText) ||
    /\bp[\s-]?2\b/.test(priorityText) ||
    /\bpriority[\s-]?2\b/.test(priorityText)
  if (hasP2) return 'p2'

  return null
}

function isDueDateOverdue(dueDate: string | null | undefined, referenceDate: Date): boolean {
  const parsed = parseDate(dueDate || null)
  if (!parsed) return false

  const due = new Date(parsed)
  due.setHours(0, 0, 0, 0)
  const reference = new Date(referenceDate)
  reference.setHours(0, 0, 0, 0)
  return due.getTime() < reference.getTime()
}

function resolveStoreActionTheme(action: StoreActionRow): {
  key: string
  topic: string
  managerPrompt: string
} {
  const resolved = resolveStoreActionPriorityTheme(action)
  return {
    key: resolved.key,
    topic: resolved.summary,
    managerPrompt: resolved.managerPrompt,
  }
}

function formatStoreActionFocusLine(item: NewsletterStoreActionFocusItem): string {
  const detailParts = [`${item.actionCount} active actions`, `across ${item.storeCount} stores`]
  if (item.highPriorityCount > 0) detailParts.push(`${item.highPriorityCount} high/urgent`)
  if (item.overdueCount > 0) detailParts.push(`${item.overdueCount} overdue`)
  return `${item.topic}: ${detailParts.join(', ')}. ${item.managerPrompt}`
}

function buildStoreActionMetrics(
  actions: StoreActionRow[],
  period: MonthPeriod
): NewsletterStoreActionMetrics {
  const activeActions = actions.filter((action) => isStoreActionActive(action.status))
  const themeMap = new Map<string, StoreActionThemeAggregate>()

  let highPriorityCount = 0
  let overdueCount = 0
  let dueThisMonthCount = 0

  activeActions.forEach((action) => {
    if (isStoreActionHighPriority(action.priority)) highPriorityCount += 1
    if (isDueDateOverdue(action.due_date, period.end)) overdueCount += 1
    if (dateWithinMonth(action.due_date, period)) dueThisMonthCount += 1

    const resolved = resolveStoreActionTheme(action)
    const existing = themeMap.get(resolved.key)
    if (existing) {
      existing.actionCount += 1
      if (action.store_id) existing.storeIds.add(action.store_id)
      if (isStoreActionHighPriority(action.priority)) existing.highPriorityCount += 1
      if (isDueDateOverdue(action.due_date, period.end)) existing.overdueCount += 1
      return
    }

    themeMap.set(resolved.key, {
      key: resolved.key,
      topic: resolved.topic,
      managerPrompt: resolved.managerPrompt,
      actionCount: 1,
      storeIds: new Set(action.store_id ? [action.store_id] : []),
      highPriorityCount: isStoreActionHighPriority(action.priority) ? 1 : 0,
      overdueCount: isDueDateOverdue(action.due_date, period.end) ? 1 : 0,
    })
  })

  const focusItems: NewsletterStoreActionFocusItem[] = Array.from(themeMap.values())
    .sort((a, b) => {
      if (a.actionCount !== b.actionCount) return b.actionCount - a.actionCount
      if (a.highPriorityCount !== b.highPriorityCount) return b.highPriorityCount - a.highPriorityCount
      if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount
      return a.topic.localeCompare(b.topic)
    })
    .slice(0, 5)
    .map((item) => ({
      topic: item.topic,
      actionCount: item.actionCount,
      storeCount: item.storeIds.size,
      highPriorityCount: item.highPriorityCount,
      overdueCount: item.overdueCount,
      managerPrompt: item.managerPrompt,
    }))

  return {
    activeCount: activeActions.length,
    highPriorityCount,
    overdueCount,
    dueThisMonthCount,
    focusItems,
  }
}

function formatStoreScoreLine(store: NewsletterStoreScore): string {
  const displayStoreCode = sanitizeStoreCodeForDisplay(store.storeCode)
  return `${store.storeName}${displayStoreCode ? ` (${displayStoreCode})` : ''} - ${store.score.toFixed(1)}%`
}

function formatStoreLabel(store: { storeName: string; storeCode: string | null }): string {
  const displayStoreCode = sanitizeStoreCodeForDisplay(store.storeCode)
  return displayStoreCode ? `${store.storeName} (${displayStoreCode})` : store.storeName
}

function sanitizeStoreCodeForDisplay(storeCode: string | null | undefined): string | null {
  if (!storeCode) return null
  if (isExtStoreCode(storeCode)) return null

  return storeCode
}

function buildRevisitRiskNarrative(report: {
  borderlineStoreCount: number
  predictedRevisitCount: number
  alreadyBelowThresholdCount: number
  closeActionsTarget: number
  immediateActionTarget: number
  storesWithOpenIncidentsAtRiskCount: number
  predictedStores: Array<{
    storeName: string
    storeCode: string | null
  }>
  alreadyBelowStores: Array<{
    storeName: string
    storeCode: string | null
  }>
}): string {
  const predictedStoreNames = report.predictedStores.slice(0, 2).map((store) => formatStoreLabel(store))
  const alreadyBelowStoreNames = report.alreadyBelowStores
    .slice(0, 2)
    .map((store) => formatStoreLabel(store))

  if (report.borderlineStoreCount === 0) {
    if (report.alreadyBelowThresholdCount > 0) {
      const highlightedText =
        alreadyBelowStoreNames.length > 0 ? ` (including ${alreadyBelowStoreNames.join(' and ')})` : ''
      const closureText =
        report.immediateActionTarget > 0
          ? `Close ${report.immediateActionTarget} open high-priority compliance actions immediately to recover these stores above the revisit threshold.`
          : 'Prioritize immediate close-out of any remaining high-priority compliance actions to recover these stores above the revisit threshold.'
      const incidentText =
        report.storesWithOpenIncidentsAtRiskCount > 0
          ? ` ${report.storesWithOpenIncidentsAtRiskCount} at-risk store${report.storesWithOpenIncidentsAtRiskCount !== 1 ? 's also have' : ' also has'} open incidents, which increases volatility heading into End-of-Year audits.`
          : ''

      return `The Fragrance Shop Management: ${report.alreadyBelowThresholdCount} store${report.alreadyBelowThresholdCount !== 1 ? 's are' : ' is'} already below 80% and in mandatory revisit status${highlightedText}. ${closureText}${incidentText}`
    }

    return 'The Fragrance Shop Management: No stores are currently in the 80-84% Start-of-Year watch band. Keep open compliance actions, training gaps and other priority issues closed out to prevent revisit exposure.'
  }

  const predictedText =
    predictedStoreNames.length > 0 ? ` (including ${predictedStoreNames.join(' and ')})` : ''
  const alreadyBelowText =
    alreadyBelowStoreNames.length > 0 ? ` (including ${alreadyBelowStoreNames.join(' and ')})` : ''

  if (report.alreadyBelowThresholdCount > 0) {
    const immediateText =
      report.immediateActionTarget > 0
        ? `Immediate priority: close ${report.immediateActionTarget} open high-priority compliance actions at revisit stores.`
        : 'Immediate priority: clear any remaining high-priority compliance actions at revisit stores.'
    const forecastText =
      report.closeActionsTarget > 0
        ? `Secondary prevention: close ${report.closeActionsTarget} open compliance actions at watch-band stores this week to prevent additional revisits.`
        : 'Secondary prevention: keep compliance actions at watch-band stores closed out this week to prevent additional revisits.'
    const incidentText =
      report.storesWithOpenIncidentsAtRiskCount > 0
        ? ` ${report.storesWithOpenIncidentsAtRiskCount} at-risk store${report.storesWithOpenIncidentsAtRiskCount !== 1 ? 's also carry' : ' also carries'} open incidents.`
        : ''
    const forecastSentence =
      report.predictedRevisitCount > 0
        ? `Based on unresolved compliance actions, training gaps and open incidents, ${report.predictedRevisitCount} of the 80-84% stores${predictedText} are forecast to drop below 80% in the End-of-Year cycle.`
        : 'None of the current 80-84% watch-band stores are forecast to drop below 80% in the End-of-Year cycle at this point.'

    return `The Fragrance Shop Management: You currently have ${report.borderlineStoreCount} stores sitting between 80-84% from their Start-of-Year visits and ${report.alreadyBelowThresholdCount} stores already below 80% in mandatory revisit status${alreadyBelowText}. ${forecastSentence} ${immediateText} ${forecastText}${incidentText}`
  }

  const closureText =
    report.closeActionsTarget > 0
      ? `Closing these ${report.closeActionsTarget} open compliance action${report.closeActionsTarget !== 1 ? 's' : ''} this week will stabilize their scores and prevent revisit requirements.`
      : 'Ensure any remaining compliance actions are closed out promptly to stabilize scores and prevent revisit requirements.'
  const forecastSentence =
    report.predictedRevisitCount > 0
      ? `Based on unresolved compliance actions, training gaps and open incidents, ${report.predictedRevisitCount} of these stores${predictedText} are forecast to drop below 80% in the End-of-Year cycle, triggering mandatory revisits.`
      : 'None of these current 80-84% watch-band stores are forecast to drop below 80% in the End-of-Year cycle at this point.'

  return `The Fragrance Shop Management: You currently have ${report.borderlineStoreCount} stores sitting between 80-84% from their Start-of-Year visits. ${forecastSentence} ${closureText}`
}

function buildRevisitRiskInputs(
  stores: StoreRow[],
  storeActionsByStore: Map<string, StoreActionRow[]>,
  openIncidentsByStore: Map<string, number>,
  period: MonthPeriod
): RevisitRiskStoreInput[] {
  return stores.map((store) => {
    const openActions = (storeActionsByStore.get(store.id) || []).filter((action) =>
      isStoreActionActive(action.status)
    )

    let openP1Actions = 0
    let openP2Actions = 0
    let openFireSafetyActions = 0
    let overdueP1Actions = 0

    openActions.forEach((action) => {
      openFireSafetyActions += 1

      const tier = resolveStoreActionPriorityTier(action)
      if (tier === 'p1') {
        openP1Actions += 1
        if (isDueDateOverdue(action.due_date, period.end)) {
          overdueP1Actions += 1
        }
      }
      if (tier === 'p2') openP2Actions += 1
    })

    return {
      storeId: store.id,
      storeName: formatStoreName(store.store_name),
      storeCode: sanitizeStoreCodeForDisplay(store.store_code),
      region: store.region,
      startOfYearAuditScore: store.compliance_audit_1_overall_pct,
      openP1Actions,
      openP2Actions,
      openFireSafetyActions,
      overdueP1Actions,
      openIncidents: openIncidentsByStore.get(store.id) || 0,
    }
  })
}

function buildNewsletterMarkdown(
  report: Omit<AreaNewsletterReport, 'newsletterMarkdown'>,
  periodLabel: string
): string {
  const auditAverageLabel =
    typeof report.auditMetrics.averageLatestScore === 'number'
      ? `${report.auditMetrics.averageLatestScore.toFixed(1)}%`
      : 'No scored audits available'

  const hsAverageLabel =
    typeof report.hsAuditMetrics.averageScore === 'number'
      ? `${report.hsAuditMetrics.averageScore.toFixed(1)}%`
      : 'No completed H&S audits in period'

  const lines = [
    `# Monthly Safety Newsletter - ${periodLabel}`,
    `Area: ${report.areaLabel}`,
    `Coverage: ${report.storeCount} stores`,
    '',
    '## Audit Performance',
    `- Average latest audit score: ${auditAverageLabel}`,
    `- Audits completed this month: ${report.auditMetrics.auditsCompletedThisMonth}`,
    `- Stores below 85%: ${report.auditMetrics.belowThresholdCount}`,
    ...(report.auditMetrics.topStores.length > 0
      ? [
          '- Top performers:',
          ...report.auditMetrics.topStores.map((store) => `  - ${formatStoreScoreLine(store)}`),
        ]
      : ['- Top performers: None available']),
    ...(report.auditMetrics.focusStores.length > 0
      ? [
          '- Priority focus stores:',
          ...report.auditMetrics.focusStores.map((store) => `  - ${formatStoreScoreLine(store)}`),
        ]
      : ['- Priority focus stores: None available']),
    '',
    '## Revisit Risk Forecast',
    `- Total at-risk stores (<85% combined): ${report.revisitRiskMetrics.atRiskStoreCount}`,
    `- Stores in 80-84% Start-of-Year band: ${report.revisitRiskMetrics.borderlineStoreCount}`,
    `- Predicted to drop below 80%: ${report.revisitRiskMetrics.predictedRevisitCount}`,
    `- Already below 80% (mandatory revisit): ${report.revisitRiskMetrics.alreadyBelowThresholdCount}`,
    `- Open priority 1 actions (watch-band stores): ${report.revisitRiskMetrics.openP1Count}`,
    `- Open priority 2 actions (watch-band stores): ${report.revisitRiskMetrics.openP2Count}`,
    `- Overdue P1 actions (at-risk stores): ${report.revisitRiskMetrics.overdueP1AtRiskCount}`,
    `- At-risk stores with open incidents: ${report.revisitRiskMetrics.storesWithOpenIncidentsAtRiskCount}`,
    `- Compliance action closures needed this week: ${report.revisitRiskMetrics.closeActionsTarget}`,
    `- Immediate compliance action closures for already-below-80 stores: ${report.revisitRiskMetrics.immediateActionTarget}`,
    ...(report.revisitRiskMetrics.highRiskStores.length > 0
      ? [
          '- Highest risk stores:',
          ...report.revisitRiskMetrics.highRiskStores.map((store) => {
            const startLabel =
              typeof store.startOfYearAuditScore === 'number'
                ? `${store.startOfYearAuditScore.toFixed(1)}%`
                : 'N/A'
            const projectedLabel =
              typeof store.projectedEndOfYearScore === 'number'
                ? `${store.projectedEndOfYearScore.toFixed(1)}%`
                : 'N/A'
            return `  - ${formatStoreLabel(store)} | Start-of-year audit: ${startLabel} | Projected end-of-year: ${projectedLabel} | Revisit risk: ${store.riskScore}%`
          }),
        ]
      : ['- Highest risk stores: None identified']),
    `- Revisit forecast: ${report.revisitRiskMetrics.narrative}`,
    '',
    '## H&S Audit Notes',
    `- H&S audits completed this month: ${report.hsAuditMetrics.auditsCompletedThisMonth}`,
    `- Average H&S score: ${hsAverageLabel}`,
    ...(report.hsAuditMetrics.highlights.length > 0
      ? [
          '- Key H&S highlights:',
          ...report.hsAuditMetrics.highlights.map((line) => `  - ${line}`),
        ]
      : ['- Key H&S highlights: None submitted']),
    '',
    '## Area Manager Focus (H&S Task Themes)',
    `- Active H&S tasks: ${report.storeActionMetrics.activeCount}`,
    `- High/Urgent active tasks: ${report.storeActionMetrics.highPriorityCount}`,
    `- Overdue active tasks: ${report.storeActionMetrics.overdueCount}`,
    `- Active tasks due this month: ${report.storeActionMetrics.dueThisMonthCount}`,
    ...(report.storeActionMetrics.focusItems.length > 0
      ? [
          '- Focus themes for area managers:',
          ...report.storeActionMetrics.focusItems.map(
            (item) => `  - ${formatStoreActionFocusLine(item)}`
          ),
        ]
      : ['- Focus themes for area managers: None identified from active H&S tasks.']),
    '',
    '## Reminders For Store Teams',
    ...report.reminders.map((line) => `- ${line}`),
    '',
    '## Legislation / Policy Updates',
    ...report.legislationUpdates.map((line) => `- ${line}`),
  ]

  return lines.join('\n')
}

function getTemplate(value: HSAuditInstanceRow['tfs_audit_templates']): {
  title: string | null
  category: string | null
} {
  if (!value) return { title: null, category: null }
  if (Array.isArray(value)) {
    const first = value[0]
    return {
      title: first?.title || null,
      category: first?.category || null,
    }
  }

  return {
    title: value.title,
    category: value.category,
  }
}

function isHealthSafetyAudit(template: { title: string | null; category: string | null }): boolean {
  if (template.category === 'footasylum_audit') return true

  const title = (template.title || '').toLowerCase()
  return /(health|safety|h&s|hs audit|compliance)/i.test(title)
}

function areaSortValue(areaCode: string): { bucket: number; numeric: number; text: string } {
  const normalized = normalizeReportingAreaCode(areaCode) || areaCode.trim().toUpperCase()
  const match = normalized.match(/^AREA(\d+)$/)
  if (match) {
    return { bucket: 0, numeric: Number(match[1]), text: normalized }
  }

  if (normalized === 'UNASSIGNED') {
    return { bucket: 2, numeric: Number.MAX_SAFE_INTEGER, text: normalized }
  }

  return { bucket: 1, numeric: Number.MAX_SAFE_INTEGER, text: normalized }
}

function sortAreas(a: AreaGroup, b: AreaGroup): number {
  const aSort = areaSortValue(a.code)
  const bSort = areaSortValue(b.code)

  if (aSort.bucket !== bSort.bucket) return aSort.bucket - bSort.bucket
  if (aSort.numeric !== bSort.numeric) return aSort.numeric - bSort.numeric
  return aSort.text.localeCompare(bSort.text)
}

function isFraNotableStatus(status: FRAStatus): status is 'due' | 'overdue' | 'required' {
  return status === 'due' || status === 'overdue' || status === 'required'
}

export async function buildMonthlyNewsletterData(
  supabase: any,
  rawBody: MonthlyNewsletterRequestBody
): Promise<MonthlyNewsletterResponse> {
  const period = resolveMonthPeriod(rawBody.month)
  const reminders = normalizeListInput(rawBody.reminders, DEFAULT_REMINDERS)
  const legislationUpdates = normalizeListInput(
    rawBody.legislationUpdates,
    DEFAULT_LEGISLATION_UPDATES
  )
  const manualHighlights = buildManualHighlights(rawBody.hsAuditText || '')

  const selectedAreaCodeRaw = rawBody.areaCode || rawBody.managerId || null
  const selectedAreaCode =
    selectedAreaCodeRaw && selectedAreaCodeRaw !== 'all'
      ? normalizeReportingAreaCode(selectedAreaCodeRaw)
      : null

  const { data: storesRaw, error: storesError } = await supabase
    .from('tfs_stores')
    .select(`
      id,
      store_name,
      store_code,
      region,
      reporting_area,
      reporting_area_manager_name,
      reporting_area_manager_email,
      compliance_audit_1_date,
      compliance_audit_1_overall_pct,
      compliance_audit_2_date,
      compliance_audit_2_planned_date,
      compliance_audit_2_overall_pct,
      compliance_audit_3_date,
      compliance_audit_3_overall_pct,
      fire_risk_assessment_date,
      fire_risk_assessment_notes
    `)
    .eq('is_active', true)

  if (storesError) {
    throw new Error(`Failed to load stores: ${storesError.message}`)
  }

  const stores = ((storesRaw || []) as StoreRow[])
    .filter((store) => !!store.id)
    .filter((store) => !shouldHideStore(store))
  const storeIds = stores.map((store) => store.id)

  let storeActions: StoreActionRow[] = []

  if (storeIds.length > 0) {
    const selectWithSummary = `
      id,
      store_id,
      title,
      description,
      source_flagged_item,
      priority_summary,
      priority,
      due_date,
      status,
      created_at
    `
    const selectWithoutSummary = `
      id,
      store_id,
      title,
      description,
      source_flagged_item,
      priority,
      due_date,
      status,
      created_at
    `

    let storeActionsRaw: any[] | null = null
    let storeActionsError: { message?: string } | null = null
    const loadStoreActions = async (selectClause: string) =>
      supabase
        .from('tfs_store_actions')
        .select(selectClause)
        .in('store_id', storeIds)
        .not('status', 'in', '(complete,cancelled)')
        .order('due_date', { ascending: true })
        .limit(5000)

    {
      const result = await loadStoreActions(selectWithSummary)
      storeActionsRaw = (result.data as any[] | null) || null
      storeActionsError = result.error
    }

    if (storeActionsError && /priority_summary/i.test(storeActionsError.message || '')) {
      const retry = await loadStoreActions(selectWithoutSummary)

      storeActionsRaw = (retry.data as any[] | null) || null
      storeActionsError = retry.error
    }

    if (storeActionsError) {
      throw new Error(`Failed to load store actions: ${storeActionsError.message}`)
    }

    storeActions = ((storeActionsRaw || []) as StoreActionRow[]).filter((action) => !!action.store_id)
  }

  const storeActionsByStore = new Map<string, StoreActionRow[]>()

  storeActions.forEach((action) => {
    if (!action.store_id) return
    const existing = storeActionsByStore.get(action.store_id) || []
    existing.push(action)
    storeActionsByStore.set(action.store_id, existing)
  })

  const openIncidentsByStore = new Map<string, number>()

  if (storeIds.length > 0) {
    const { data: incidentsRaw, error: incidentsError } = await supabase
      .from('tfs_incidents')
      .select('id,store_id,status')
      .in('store_id', storeIds)
      .limit(10000)

    if (incidentsError) {
      throw new Error(`Failed to load incidents: ${incidentsError.message}`)
    }

    const incidents = ((incidentsRaw || []) as IncidentRow[]).filter(
      (incident) => !!incident.store_id && isIncidentActive(incident.status)
    )

    incidents.forEach((incident) => {
      if (!incident.store_id) return
      openIncidentsByStore.set(
        incident.store_id,
        (openIncidentsByStore.get(incident.store_id) || 0) + 1
      )
    })
  }

  const monthStartIso = `${period.startIso}T00:00:00.000Z`
  const monthEndIso = `${period.endIso}T23:59:59.999Z`

  const { data: auditsRaw, error: auditsError } = await supabase
    .from('tfs_audit_instances')
    .select(`
      id,
      store_id,
      conducted_at,
      overall_score,
      tfs_audit_templates (
        id,
        title,
        category
      )
    `)
    .eq('status', 'completed')
    .gte('conducted_at', monthStartIso)
    .lte('conducted_at', monthEndIso)
    .order('conducted_at', { ascending: false })
    .limit(2000)

  if (auditsError) {
    throw new Error(`Failed to load H&S audits: ${auditsError.message}`)
  }

  const hsAuditInstances = ((auditsRaw || []) as HSAuditInstanceRow[]).filter((audit) => {
    if (!audit.store_id) return false
    return isHealthSafetyAudit(getTemplate(audit.tfs_audit_templates))
  })

  const hsAuditsByStore = new Map<string, HSAuditInstanceRow[]>()

  hsAuditInstances.forEach((audit) => {
    if (!audit.store_id) return
    const existing = hsAuditsByStore.get(audit.store_id) || []
    existing.push(audit)
    hsAuditsByStore.set(audit.store_id, existing)
  })

  const areaGroupsByCode = new Map<string, AreaGroup>()

  stores.forEach((store) => {
    const normalizedReportingArea = normalizeReportingAreaCode(store.reporting_area)
    const areaCode = normalizedReportingArea || 'UNASSIGNED'
    const reportingContact = getReportingAreaContact(normalizedReportingArea)
    const managerName =
      store.reporting_area_manager_name || reportingContact?.managerName || null
    const managerEmail =
      store.reporting_area_manager_email || reportingContact?.managerEmail || null
    const existing = areaGroupsByCode.get(areaCode)
    if (existing) {
      existing.stores.push(store)
      return
    }

    areaGroupsByCode.set(areaCode, {
      code: areaCode,
      label: getReportingAreaDisplayName(areaCode),
      managerName,
      managerEmail,
      stores: [store],
    })
  })

  let areaGroups = Array.from(areaGroupsByCode.values()).sort(sortAreas)

  if (selectedAreaCode) {
    areaGroups = areaGroups.filter((group) => group.code === selectedAreaCode)
  }

  const storeNameById = new Map(
    stores.map((store) => [store.id, `${store.store_name}${store.store_code ? ` (${store.store_code})` : ''}`])
  )

  const networkRevisitRiskForecast = computeRevisitRiskForecast(
    buildRevisitRiskInputs(stores, storeActionsByStore, openIncidentsByStore, period)
  )
  const networkRadarByAxis = new Map(
    networkRevisitRiskForecast.radar.map((point) => [point.axis, point.risk] as const)
  )

  const areaReports: AreaNewsletterReport[] = areaGroups.map((group) => {
    const storeRows: NewsletterAreaStoreRow[] = group.stores
      .map((store) => {
        const latestAudit = getLatestAudit(store)
        const fraStatus = getFRAStatusFromDate(store.fire_risk_assessment_date, period.end)
        const requiresAction =
          (typeof latestAudit.score === 'number' && latestAudit.score < 85) ||
          fraStatus === 'overdue' ||
          fraStatus === 'required'

        return {
          storeName: formatStoreName(store.store_name),
          storeCode: sanitizeStoreCodeForDisplay(store.store_code),
          latestAuditScore: latestAudit.score,
          latestAuditDate: latestAudit.date,
          plannedVisitDate: store.compliance_audit_2_planned_date,
          fraStatus,
          requiresAction,
        }
      })
      .sort((a, b) => {
        const scoreA = typeof a.latestAuditScore === 'number' ? a.latestAuditScore : -1
        const scoreB = typeof b.latestAuditScore === 'number' ? b.latestAuditScore : -1
        if (scoreA !== scoreB) return scoreB - scoreA
        return a.storeName.localeCompare(b.storeName)
      })

    const latestScores: NewsletterStoreScore[] = storeRows
      .filter((row): row is NewsletterAreaStoreRow & { latestAuditScore: number } => {
        return typeof row.latestAuditScore === 'number' && Number.isFinite(row.latestAuditScore)
      })
      .map((row) => ({
        storeName: row.storeName,
        storeCode: row.storeCode,
        score: row.latestAuditScore,
        auditDate: row.latestAuditDate,
      }))

    const latestScoresSortedHigh = [...latestScores].sort((a, b) => b.score - a.score)
    const latestScoresSortedLow = [...latestScores].sort((a, b) => a.score - b.score)

    const averageLatestScore =
      latestScores.length > 0
        ? roundToOneDecimal(
            latestScores.reduce((sum, row) => sum + row.score, 0) / latestScores.length
          )
        : null

    const auditsCompletedThisMonth = group.stores.reduce(
      (sum, store) => sum + countAuditsCompletedInMonth(store, period),
      0
    )

    const belowThresholdCount = latestScores.filter((row) => row.score < 85).length

    const fraCounts = {
      upToDate: 0,
      dueSoon: 0,
      overdue: 0,
      required: 0,
    }

    const fraNotableItems: NewsletterFRANotableItem[] = []

    group.stores.forEach((store) => {
      const status = getFRAStatusFromDate(store.fire_risk_assessment_date, period.end)

      if (status === 'up_to_date') fraCounts.upToDate += 1
      if (status === 'due') fraCounts.dueSoon += 1
      if (status === 'overdue') fraCounts.overdue += 1
      if (status === 'required') fraCounts.required += 1

      if (!isFraNotableStatus(status)) return

      fraNotableItems.push({
        storeName: formatStoreName(store.store_name),
        storeCode: sanitizeStoreCodeForDisplay(store.store_code),
        status,
        fraDate: store.fire_risk_assessment_date,
        note: trimNote(store.fire_risk_assessment_notes),
      })
    })

    const fraPriorityRank: Record<NewsletterFRANotableItem['status'], number> = {
      required: 1,
      overdue: 2,
      due: 3,
    }

    fraNotableItems.sort((a, b) => {
      const byPriority = fraPriorityRank[a.status] - fraPriorityRank[b.status]
      if (byPriority !== 0) return byPriority
      return a.storeName.localeCompare(b.storeName)
    })

    const areaStoreActions = group.stores.flatMap((store) => storeActionsByStore.get(store.id) || [])
    const storeActionMetrics = buildStoreActionMetrics(areaStoreActions, period)

    const revisitRiskInputs = buildRevisitRiskInputs(
      group.stores,
      storeActionsByStore,
      openIncidentsByStore,
      period
    )

    const revisitRiskForecast = computeRevisitRiskForecast(revisitRiskInputs)
    const revisitRiskRadar = revisitRiskForecast.radar.map((point) => ({
      ...point,
      benchmark: networkRadarByAxis.get(point.axis) ?? point.benchmark,
    }))
    const revisitRiskHighStores = Array.from(
      new Map(
        [
          ...revisitRiskForecast.alreadyBelowThresholdStores,
          ...revisitRiskForecast.predictedStores,
          ...revisitRiskForecast.stores.filter((store) => store.isBorderlineStartScore),
        ].map((store) => [store.storeId, store] as const)
      ).values()
    ).slice(0, 5)

    const revisitRiskNarrative = buildRevisitRiskNarrative({
      borderlineStoreCount: revisitRiskForecast.borderlineStoreCount,
      predictedRevisitCount: revisitRiskForecast.predictedRevisitCount,
      alreadyBelowThresholdCount: revisitRiskForecast.alreadyBelowThresholdCount,
      closeActionsTarget: revisitRiskForecast.closeActionsTarget,
      immediateActionTarget: revisitRiskForecast.immediateActionTarget,
      storesWithOpenIncidentsAtRiskCount:
        revisitRiskForecast.storesWithOpenIncidentsAtRiskCount,
      predictedStores: revisitRiskForecast.predictedStores.map((store) => ({
        storeName: store.storeName,
        storeCode: store.storeCode,
      })),
      alreadyBelowStores: revisitRiskForecast.alreadyBelowThresholdStores.map((store) => ({
        storeName: store.storeName,
        storeCode: store.storeCode,
      })),
    })

    const areaHSAudits = group.stores.flatMap((store) => hsAuditsByStore.get(store.id) || [])

    const hsScores = areaHSAudits
      .map((audit) => audit.overall_score)
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))

    const averageHsScore =
      hsScores.length > 0
        ? roundToOneDecimal(hsScores.reduce((sum, score) => sum + score, 0) / hsScores.length)
        : null

    const hsAuditHighlights = areaHSAudits
      .filter((audit) => typeof audit.overall_score === 'number' && audit.overall_score < 85)
      .slice(0, 3)
      .map((audit) => {
        const storeLabel = storeNameById.get(audit.store_id || '') || 'Unknown store'
        const conductedLabel = audit.conducted_at
          ? format(parseDate(audit.conducted_at) || new Date(), 'd MMM yyyy')
          : 'unknown date'
        return `${storeLabel} scored ${Number(audit.overall_score).toFixed(1)}% on ${conductedLabel}.`
      })

    const combinedHighlights = Array.from(new Set([...hsAuditHighlights, ...manualHighlights])).slice(
      0,
      6
    )

    const reportWithoutMarkdown: Omit<AreaNewsletterReport, 'newsletterMarkdown'> = {
      areaCode: group.code,
      areaLabel: group.label,
      areaManagerName: group.managerName,
      areaManagerEmail: group.managerEmail,
      storeCount: group.stores.length,
      stores: storeRows,
      auditMetrics: {
        averageLatestScore,
        auditsCompletedThisMonth,
        belowThresholdCount,
        topStores: latestScoresSortedHigh.slice(0, 3),
        focusStores: latestScoresSortedLow.slice(0, 5),
      },
      fraMetrics: {
        upToDate: fraCounts.upToDate,
        dueSoon: fraCounts.dueSoon,
        overdue: fraCounts.overdue,
        required: fraCounts.required,
        notableItems: fraNotableItems.slice(0, 6),
      },
      hsAuditMetrics: {
        auditsCompletedThisMonth: areaHSAudits.length,
        averageScore: averageHsScore,
        highlights: combinedHighlights,
        manualInputUsed: manualHighlights.length > 0,
      },
      storeActionMetrics,
      revisitRiskMetrics: {
        atRiskStoreCount: revisitRiskForecast.atRiskStoreCount,
        borderlineStoreCount: revisitRiskForecast.borderlineStoreCount,
        predictedRevisitCount: revisitRiskForecast.predictedRevisitCount,
        alreadyBelowThresholdCount: revisitRiskForecast.alreadyBelowThresholdCount,
        openP1Count: revisitRiskForecast.openP1Count,
        openP2Count: revisitRiskForecast.openP2Count,
        overdueP1AtRiskCount: revisitRiskForecast.overdueP1AtRiskCount,
        storesWithOpenIncidentsAtRiskCount:
          revisitRiskForecast.storesWithOpenIncidentsAtRiskCount,
        closeActionsTarget: revisitRiskForecast.closeActionsTarget,
        immediateActionTarget: revisitRiskForecast.immediateActionTarget,
        radar: revisitRiskRadar,
        highRiskStores: revisitRiskHighStores.map((store) => ({
          storeName: store.storeName,
          storeCode: store.storeCode,
          startOfYearAuditScore: store.startOfYearAuditScore,
          projectedEndOfYearScore: store.projectedEndOfYearScore,
          riskScore: store.riskScore,
          openP1Actions: store.openP1Actions,
          openP2Actions: store.openP2Actions,
          predictedRevisit: store.predictedRevisit,
        })),
        narrative: revisitRiskNarrative,
      },
      reminders,
      legislationUpdates,
    }

    return {
      ...reportWithoutMarkdown,
      newsletterMarkdown: buildNewsletterMarkdown(reportWithoutMarkdown, period.label),
    }
  })

  const summary = {
    areaCount: areaReports.length,
    storeCount: areaReports.reduce((sum, report) => sum + report.storeCount, 0),
    storesWithAuditScore: areaReports.reduce(
      (sum, report) =>
        sum + report.stores.filter((store) => typeof store.latestAuditScore === 'number').length,
      0
    ),
    fraOverdueOrRequired: areaReports.reduce(
      (sum, report) => sum + report.fraMetrics.overdue + report.fraMetrics.required,
      0
    ),
    activeStoreActions: areaReports.reduce(
      (sum, report) => sum + report.storeActionMetrics.activeCount,
      0
    ),
  }

  const availableAreas = Array.from(areaGroupsByCode.values())
    .sort(sortAreas)
    .map((group) => ({
      code: group.code,
      label: group.label,
      managerName: group.managerName,
      managerEmail: group.managerEmail,
      storeCount: group.stores.length,
    }))

  return {
    generatedAt: new Date().toISOString(),
    period: {
      month: period.month,
      label: period.label,
      start: period.startIso,
      end: period.endIso,
    },
    summary,
    availableAreas,
    areaReports,
  }
}
