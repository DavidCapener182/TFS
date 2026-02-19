import type { SupabaseClient } from '@supabase/supabase-js'
import { endOfMonth, format, isValid, parse, startOfMonth } from 'date-fns'
import { getFRAStatusFromDate, type FRAStatus } from '@/lib/compliance-forecast'
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
  compliance_audit_1_date: string | null
  compliance_audit_1_overall_pct: number | null
  compliance_audit_2_date: string | null
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
  fa_audit_templates:
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

function normalizeAreaCode(raw: string | null | undefined): string {
  const value = raw?.trim().toUpperCase()
  return value && value.length > 0 ? value : 'UNASSIGNED'
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
  return `${store.storeName}${store.storeCode ? ` (${store.storeCode})` : ''} - ${store.score.toFixed(1)}%`
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

function getTemplate(value: HSAuditInstanceRow['fa_audit_templates']): {
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
  const normalized = normalizeAreaCode(areaCode)
  const match = normalized.match(/^A(\d+)$/)
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
  supabase: SupabaseClient<any, 'public', any>,
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
      ? normalizeAreaCode(selectedAreaCodeRaw)
      : null

  const { data: storesRaw, error: storesError } = await supabase
    .from('fa_stores')
    .select(`
      id,
      store_name,
      store_code,
      region,
      compliance_audit_1_date,
      compliance_audit_1_overall_pct,
      compliance_audit_2_date,
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

  const stores = ((storesRaw || []) as StoreRow[]).filter((store) => !!store.id)
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

    {
      const result = await supabase
        .from('fa_store_actions')
        .select(selectWithSummary)
        .in('store_id', storeIds)
        .not('status', 'in', '(complete,cancelled)')
        .order('due_date', { ascending: true })
        .limit(5000)

      storeActionsRaw = (result.data as any[] | null) || null
      storeActionsError = result.error
    }

    if (storeActionsError && /priority_summary/i.test(storeActionsError.message || '')) {
      const retry = await supabase
        .from('fa_store_actions')
        .select(selectWithoutSummary)
        .in('store_id', storeIds)
        .not('status', 'in', '(complete,cancelled)')
        .order('due_date', { ascending: true })
        .limit(5000)

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

  const monthStartIso = `${period.startIso}T00:00:00.000Z`
  const monthEndIso = `${period.endIso}T23:59:59.999Z`

  const { data: auditsRaw, error: auditsError } = await supabase
    .from('fa_audit_instances')
    .select(`
      id,
      store_id,
      conducted_at,
      overall_score,
      fa_audit_templates (
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
    return isHealthSafetyAudit(getTemplate(audit.fa_audit_templates))
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
    const areaCode = normalizeAreaCode(store.region)
    const existing = areaGroupsByCode.get(areaCode)
    if (existing) {
      existing.stores.push(store)
      return
    }

    areaGroupsByCode.set(areaCode, {
      code: areaCode,
      label: areaCode,
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
          storeName: store.store_name,
          storeCode: store.store_code,
          latestAuditScore: latestAudit.score,
          latestAuditDate: latestAudit.date,
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
        storeName: store.store_name,
        storeCode: store.store_code,
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
