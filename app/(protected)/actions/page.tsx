import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { ActionsTableRow } from '@/components/shared/actions-table-row'
import { ActionMobileCard } from '@/components/shared/action-mobile-card'
import { AutoSubmitSelect } from '@/components/shared/auto-submit-select'
import {
  WorkspaceHeader,
  WorkspaceShell,
  WorkspaceStat,
  WorkspaceStatGrid,
  ResponsiveDataView,
  WorkspaceEmptyState,
  workspaceDesktopDateInputClass,
  workspaceDesktopFilterActionsClass,
  workspaceDesktopFilterFormClass,
  workspaceDesktopFilterSearchClass,
  workspaceDesktopSelectClass,
} from '@/components/workspace/workspace-shell'
import { MobileFilterSheet } from '@/components/workspace/mobile-filter-sheet'
import { Search, CheckSquare2, FileText, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { getInternalAreaDisplayName } from '@/lib/areas'
import {
  formatStoreActionQuestionForDisplay,
  getStoreActionListTitle,
  getStoreActionQuestion,
  normalizeStoreActionQuestion,
} from '@/lib/store-action-titles'
import { formatStoreName } from '@/lib/store-display'
import { cn } from '@/lib/utils'

type ActionFilters = {
  assigned_to?: string
  status?: string
  overdue?: boolean
  priority?: string
  store_question?: string
  q?: string
  date_from?: string
  date_to?: string
}

function normalizeFilterValue(value: string | undefined): string | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized.length > 0 ? normalized : undefined
}

type UnifiedAction = {
  id: string
  title: string
  description: string | null
  source_flagged_item?: string | null
  training_completion_rate?: number | null
  priority: string
  due_date: string
  status: string
  incident_id: string | null
  incident: { reference_no: string } | null
  assigned_to: { id: string; full_name: string | null } | null
  source_type: 'incident' | 'store'
  store_question?: string | null
  store?: {
    id: string
    store_name: string
    store_code: string | null
    region: string | null
    compliance_audit_2_assigned_manager_user_id: string | null
  } | null
}

const TOOLBOX_REFRESHER_QUESTION =
  'H&S toolbox refresher training completed in the last 12 months and records available for Manual handling Housekeeping Fire Safety Stepladders?'
const ACTION_SUMMARY_MODEL = 'gpt-4o-mini'
const ACTION_SUMMARY_MAX_WORDS = 15
const ACTION_SUMMARY_CHUNK_SIZE = 15
const ACTION_SUMMARY_REQUEST_TIMEOUT_MS = 9000
const ACTION_SUMMARY_PARALLEL_CHUNKS = 2
const ACTION_SUMMARY_CACHE = new Map<string, string>()
const NON_ACTIONABLE_STORE_QUESTIONS = new Set<string>([
  'Young persons?',
  'Expectant mothers?',
  'PAT?',
  'Fixed Electrical Wiring?',
  'Air Conditioning?',
  'Lift?',
  'Lifting equipment?',
  'Fire Alarm Maintenance?',
  'Emergency Lighting Maintenance?',
  'Sprinkler System?',
  'Escalators - Service and Maintenance?',
  'Fire Extinguisher Service?',
])

const STORE_SUMMARY_OVERRIDES: Record<string, string> = {
  'Are all ladders clearly numbered for identification purposes?': 'Ensure ladders are clearly numbered',
  'Is manual handling being carried out safely and are good practices being followed and posters visible?':
    'Ensure manual handling is being carried out safely with a Manual Handling poster displayed',
  'Are contractors managed whilst working on site? (sign in/out, permit to work)':
    'Ensure contractors are signed in and out on arrival',
  'Is the visitors signing in / out book available and in use?': 'Ensure visitors are signed in and out on arrival',
  'H&S induction training onboarding up to date and at 100%?':
    'Ensure H&S induction training onboarding is at 100%',
}

function formatPercentage(value: number): string {
  const clamped = Math.min(100, Math.max(0, value))
  const rounded = Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1).replace(/\.0$/, '')
  return `${rounded}%`
}

function collapseSummaryWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function extractSubHundredPercentage(text: string): string | null {
  const matches = text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)
  for (const match of matches) {
    const parsed = Number.parseFloat(match[1])
    if (Number.isFinite(parsed) && parsed >= 0 && parsed < 100) {
      return formatPercentage(parsed)
    }
  }
  return null
}

function extractCompletionPercentage(action: UnifiedAction): string | null {
  if (
    typeof action.training_completion_rate === 'number' &&
    Number.isFinite(action.training_completion_rate) &&
    action.training_completion_rate < 100
  ) {
    return formatPercentage(action.training_completion_rate)
  }

  const candidates = [action.source_flagged_item, action.title, action.store_question]
  for (const candidate of candidates) {
    const text = String(candidate || '')
    if (!text) continue
    const percentage = extractSubHundredPercentage(text)
    if (percentage) return percentage
  }

  const description = String(action.description || '')
  if (description) {
    const percentage = extractSubHundredPercentage(description)
    if (percentage) return percentage
  }

  return null
}

function clampSummaryToMaxWords(summary: string, maxWords = ACTION_SUMMARY_MAX_WORDS): string {
  const cleaned = collapseSummaryWhitespace(summary)
  if (!cleaned) return ''

  const words = cleaned.split(' ')
  if (words.length <= maxWords) return cleaned
  return words.slice(0, maxWords).join(' ')
}

function sanitizeAiSummary(value: string): string {
  const trimmed = collapseSummaryWhitespace(
    String(value || '')
      .replace(/^[\-\u2022*]\s*/, '')
      .replace(/^\d+[\.)]\s*/, '')
      .replace(/[“”]/g, '"')
  )
  if (!trimmed) return ''

  const singleLine = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed
  return clampSummaryToMaxWords(singleLine)
}

function toEnsureStatement(question: string): string {
  const cleaned = question
    .replace(/\s*\((yes|no|n\/?a)\)\s*$/i, '')
    .replace(/[?!.]+$/, '')
    .trim()

  if (!cleaned) return 'Ensure this action is completed'

  const rewritten = cleaned
    .replace(/^Are\s+/i, '')
    .replace(/^Is\s+/i, '')
    .replace(/^Has\s+/i, '')
    .replace(/^Have\s+/i, '')
    .replace(/^Can\s+/i, '')
    .replace(/^Do\s+/i, '')
    .replace(/^Does\s+/i, '')
    .replace(/^Any\s+/i, 'any ')

  const sentence = rewritten.charAt(0).toLowerCase() + rewritten.slice(1)
  return `Ensure ${sentence}`.replace(/\s+/g, ' ').trim()
}

function getCanonicalStoreQuestion(action: UnifiedAction): string {
  const rawQuestion = action.store_question || getStoreActionQuestion(action) || getStoreActionListTitle(action)
  return normalizeStoreActionQuestion(rawQuestion) || rawQuestion
}

function isSuppressedStoreActionQuestion(question: string | null | undefined): boolean {
  const normalized = normalizeStoreActionQuestion(String(question || '').trim()) || String(question || '').trim()
  return NON_ACTIONABLE_STORE_QUESTIONS.has(normalized)
}

function buildFallbackStoreSummary(action: UnifiedAction): string | null {
  if (action.source_type !== 'store') return null

  const canonicalQuestion = getCanonicalStoreQuestion(action)

  if (canonicalQuestion === TOOLBOX_REFRESHER_QUESTION) {
    const completion = extractCompletionPercentage(action)
    if (completion) {
      return `Ensure H&S toolbox refresher training reaches 100% from current ${completion}, and update records.`
    }
    return 'Ensure H&S toolbox refresher training reaches 100% and records are updated.'
  }

  if (STORE_SUMMARY_OVERRIDES[canonicalQuestion]) {
    return STORE_SUMMARY_OVERRIDES[canonicalQuestion]
  }

  return toEnsureStatement(canonicalQuestion)
}

type StoreActionSummarySeed = {
  signature: string
  question: string
  context: string
  percentage: string | null
  fallback: string
  actionIds: string[]
}

function parseChatGptJsonObject(rawContent: string): any | null {
  try {
    return JSON.parse(rawContent)
  } catch {
    const firstBrace = rawContent.indexOf('{')
    const lastBrace = rawContent.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null
    try {
      return JSON.parse(rawContent.slice(firstBrace, lastBrace + 1))
    } catch {
      return null
    }
  }
}

function enforceHsToolboxLabel(summary: string): string {
  if (!summary) return summary
  if (/h\s*&\s*s/i.test(summary)) return summary
  if (/toolbox/i.test(summary)) {
    return summary.replace(/toolbox/i, 'H&S toolbox')
  }
  return `Ensure H&S ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`
}

async function requestActionSummaryChunk(
  apiKey: string,
  items: Array<{ id: string; failed_question: string; context: string; failed_percentage: string | null }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (items.length === 0) return result

  const prompt = [
    'You summarize failed retail health-and-safety checks for operations handoff.',
    'Each item is a failed check, so write the corrective action needed.',
    `Return exactly one sentence per item, 8 to ${ACTION_SUMMARY_MAX_WORDS} words.`,
    'No bullets, no numbering, no markdown.',
    'If failed_percentage is present, include that exact percentage in the sentence.',
    'For toolbox refresher items, include both current failed_percentage and target 100%.',
    'Return strict JSON only: {"summaries":[{"id":"...","summary":"..."}]}.',
    '',
    `Items JSON: ${JSON.stringify(items)}`,
  ].join('\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ACTION_SUMMARY_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: ACTION_SUMMARY_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: Math.min(1200, items.length * 60),
        messages: [
          {
            role: 'system',
            content: 'Write concise corrective action summaries for failed safety checks.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI action summary generation failed:', errorData)
      return result
    }

    const data = await response.json().catch(() => ({}))
    const content = String(data?.choices?.[0]?.message?.content || '')
    const parsed = parseChatGptJsonObject(content)
    const summaries = Array.isArray(parsed?.summaries) ? parsed.summaries : []

    summaries.forEach((entry: any) => {
      const id = String(entry?.id || '').trim()
      const summary = sanitizeAiSummary(String(entry?.summary || ''))
      if (!id || !summary) return
      result.set(id, summary)
    })
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.warn('OpenAI action summary request timed out')
      return result
    }
    console.error('OpenAI action summary request failed:', error)
    return result
  } finally {
    clearTimeout(timeout)
  }

  return result
}

async function buildStoreActionSummaryMap(actions: UnifiedAction[]): Promise<Map<string, string>> {
  const output = new Map<string, string>()
  const storeActions = actions.filter((action) => action.source_type === 'store')
  if (storeActions.length === 0) return output

  const seeds = new Map<string, StoreActionSummarySeed>()

  storeActions.forEach((action) => {
    const question = getCanonicalStoreQuestion(action)
    const percentage = question === TOOLBOX_REFRESHER_QUESTION ? extractCompletionPercentage(action) : null
    const fallback = clampSummaryToMaxWords(buildFallbackStoreSummary(action) || 'Resolve this failed check.')
    const context = clampSummaryToMaxWords(
      collapseSummaryWhitespace(
        `${action.description || ''} ${action.source_flagged_item || ''} ${action.store_question || ''}`
      ),
      30
    )
    const signature = `${question}||${percentage || ''}`

    if (!seeds.has(signature)) {
      seeds.set(signature, {
        signature,
        question,
        context,
        percentage,
        fallback,
        actionIds: [],
      })
    }

    seeds.get(signature)!.actionIds.push(action.id)
  })

  const seedList = Array.from(seeds.values())
  const apiKey = process.env.OPENAI_API_KEY

  const aiSummaryBySignature = new Map<string, string>()
  seedList.forEach((seed) => {
    const cached = ACTION_SUMMARY_CACHE.get(seed.signature)
    if (cached) aiSummaryBySignature.set(seed.signature, cached)
  })

  if (apiKey) {
    const uncachedSeeds = seedList.filter((seed) => !aiSummaryBySignature.has(seed.signature))
    const chunks: StoreActionSummarySeed[][] = []

    for (let index = 0; index < uncachedSeeds.length; index += ACTION_SUMMARY_CHUNK_SIZE) {
      chunks.push(uncachedSeeds.slice(index, index + ACTION_SUMMARY_CHUNK_SIZE))
    }

    for (let index = 0; index < chunks.length; index += ACTION_SUMMARY_PARALLEL_CHUNKS) {
      const batch = chunks.slice(index, index + ACTION_SUMMARY_PARALLEL_CHUNKS)
      const batchResults = await Promise.all(
        batch.map(async (chunk) => {
          const payload = chunk.map((seed) => ({
            id: seed.signature,
            failed_question: seed.question,
            context: seed.context,
            failed_percentage: seed.percentage,
          }))
          return requestActionSummaryChunk(apiKey, payload)
        })
      )

      batchResults.forEach((generated) => {
        generated.forEach((summary, id) => {
          aiSummaryBySignature.set(id, summary)
          ACTION_SUMMARY_CACHE.set(id, summary)
        })
      })
    }
  }

  if (apiKey) {
    const aiResolvedCount = seedList.filter((seed) => aiSummaryBySignature.has(seed.signature)).length
    if (aiResolvedCount === 0 && seedList.length > 0) {
      console.warn(
        `[actions] OpenAI summaries unavailable for ${seedList.length} seeds; using fallback summaries.`
      )
    }
  }

  seedList.forEach((seed) => {
    let summary = aiSummaryBySignature.get(seed.signature) || seed.fallback

    if (seed.percentage && !summary.includes(seed.percentage)) {
      summary = seed.fallback
    }
    if (seed.question === TOOLBOX_REFRESHER_QUESTION) {
      if (!summary.includes('100%')) {
        summary = seed.fallback
      }
      summary = enforceHsToolboxLabel(summary)
    }

    summary = clampSummaryToMaxWords(summary)
    if (!summary) summary = seed.fallback

    seed.actionIds.forEach((actionId) => {
      output.set(actionId, summary)
    })
  })

  actions.forEach((action) => {
    if (!output.has(action.id) && action.source_type === 'store') {
      const fallback = clampSummaryToMaxWords(buildFallbackStoreSummary(action) || 'Resolve this failed check.')
      output.set(action.id, fallback)
    }
  })

  return output
}

function buildStoreSummaryBullets(actions: UnifiedAction[], summaryByActionId: Map<string, string>): string[] {
  return actions
    .filter((action) => action.source_type === 'store')
    .map((action) => summaryByActionId.get(action.id) || clampSummaryToMaxWords(buildFallbackStoreSummary(action) || 'Resolve this failed check.'))
    .filter((summary): summary is string => Boolean(summary))
}

function dedupeVisibleStoreActions(actions: UnifiedAction[]): UnifiedAction[] {
  const activeByKey = new Map<string, UnifiedAction>()
  const nonActiveActions: UnifiedAction[] = []

  actions.forEach((action) => {
    const status = String(action.status || '').toLowerCase()
    if (!['open', 'in_progress'].includes(status)) {
      nonActiveActions.push(action)
      return
    }

    const storeId = String(action.store?.id || 'unknown')
    const normalizedQuestion =
      normalizeStoreActionQuestion(action.store_question || getStoreActionQuestion(action) || action.title || '') ||
      String(action.title || '').trim()
    const key = `${storeId}||${normalizedQuestion.toLowerCase()}||${status}`

    const existing = activeByKey.get(key)
    if (!existing) {
      activeByKey.set(key, action)
      return
    }

    const existingDue = Number.isFinite(new Date(existing.due_date).getTime())
      ? new Date(existing.due_date).getTime()
      : Number.POSITIVE_INFINITY
    const nextDue = Number.isFinite(new Date(action.due_date).getTime())
      ? new Date(action.due_date).getTime()
      : Number.POSITIVE_INFINITY

    if (nextDue < existingDue) {
      activeByKey.set(key, action)
    }
  })

  return [...activeByKey.values(), ...nonActiveActions]
}

async function getActions(filters?: ActionFilters): Promise<{ actions: UnifiedAction[]; storeQuestionOptions: string[] }> {
  const supabase = createClient()
  let incidentQuery = supabase
    .from('tfs_actions')
    .select(`
      *,
      assigned_to:fa_profiles!tfs_actions_assigned_to_user_id_fkey(*),
      incident:tfs_incidents!tfs_actions_incident_id_fkey(reference_no)
    `)
    .not('title', 'ilike', 'Implement visit report actions:%')
    .order('due_date', { ascending: true })

  const loadStoreActions = async () => {
    let query = supabase
      .from('tfs_store_actions')
      .select('id, store_id, title, source_flagged_item, description, priority, status, due_date, created_at')
      .order('due_date', { ascending: true })

    if (filters?.overdue && filters?.status !== 'complete') {
      const today = new Date().toISOString().split('T')[0]
      query = query
        .lt('due_date', today)
        .not('status', 'in', '(complete,cancelled)')
    }
    if (filters?.date_from && filters?.status !== 'complete') {
      query = query.gte('due_date', filters.date_from)
    }
    if (filters?.date_to && filters?.status !== 'complete') {
      query = query.lte('due_date', filters.date_to)
    }

    return query
  }

  if (filters?.overdue && filters?.status !== 'complete') {
    const today = new Date().toISOString().split('T')[0]
    incidentQuery = incidentQuery
      .lt('due_date', today)
      .not('status', 'in', '(complete,cancelled)')
  }
  if (filters?.date_from && filters?.status !== 'complete') {
    incidentQuery = incidentQuery.gte('due_date', filters.date_from)
  }
  if (filters?.date_to && filters?.status !== 'complete') {
    incidentQuery = incidentQuery.lte('due_date', filters.date_to)
  }

  const [{ data: incidentData, error: incidentError }, storeResult] = await Promise.all([
    incidentQuery,
    loadStoreActions(),
  ])

  let storeData = (storeResult.data || []) as any[]
  const storeError = storeResult.error

  if (incidentError) {
    console.error('Error fetching incident actions:', incidentError)
  }
  if (storeError) {
    console.error('Error fetching store actions:', storeError)
  }
  if (incidentError && storeError) {
    return { actions: [], storeQuestionOptions: [] }
  }

  const storeIds = Array.from(
    new Set(
      (storeData || [])
        .map((action: any) => String(action?.store_id || '').trim())
        .filter(Boolean)
    )
  )

  const storeById = new Map<string, any>()
  if (storeIds.length > 0) {
    const { data: stores, error: storesError } = await supabase
      .from('tfs_stores')
      .select('id, store_name, store_code, region, compliance_audit_2_assigned_manager_user_id')
      .in('id', storeIds)

    if (storesError) {
      console.error('Error fetching stores for store actions:', storesError)
    } else {
      for (const store of stores || []) {
        storeById.set(String(store.id), store)
      }
    }
  }

  const incidentActions: UnifiedAction[] = (incidentData || []).map((action: any) => ({
    ...action,
    source_type: 'incident',
    store: null,
  }))

  const storeActionsRaw: UnifiedAction[] = (storeData || []).map((action: any) => ({
    ...action,
    store: storeById.get(String(action.store_id || '')) || null,
    source_type: 'store',
    incident_id: null,
    store_question: getStoreActionQuestion(action),
    incident: storeById.get(String(action.store_id || ''))
      ? {
          reference_no: storeById.get(String(action.store_id || ''))?.store_code
            ? `${storeById.get(String(action.store_id || ''))?.store_code} - ${formatStoreName(storeById.get(String(action.store_id || ''))?.store_name)}`
            : formatStoreName(storeById.get(String(action.store_id || ''))?.store_name),
        }
      : { reference_no: 'Store Action' },
    assigned_to: (() => {
      const store = storeById.get(String(action.store_id || ''))
      const areaCode = typeof store?.region === 'string' ? store.region.trim().toUpperCase() : ''
      if (!areaCode) return null
      const label = getInternalAreaDisplayName(areaCode, { includeCode: false, fallback: `Area ${areaCode}` })
      return { id: `area:${areaCode}`, full_name: label }
    })(),
  }))

  const storeActions = storeActionsRaw.filter(
    (action) =>
      !isSuppressedStoreActionQuestion(action.store_question || getStoreActionQuestion(action) || action.title)
  )

  const dedupedStoreActions = dedupeVisibleStoreActions(storeActions)

  let actions: UnifiedAction[] = [...incidentActions, ...dedupedStoreActions].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  )

  if (filters?.assigned_to) {
    actions = actions.filter((action) => action.assigned_to?.id === filters.assigned_to)
  }

  if (filters?.priority) {
    actions = actions.filter((action) => action.priority === filters.priority)
  }

  if (filters?.status) {
    const normalizedStatus = String(filters.status).toLowerCase()
    actions = actions.filter(
      (action) => String(action.status || '').toLowerCase() === normalizedStatus
    )
  }

  if (filters?.q) {
    const q = filters.q.trim().toLowerCase()
    if (q.length > 0) {
      actions = actions.filter((action) => {
        const title =
          action.source_type === 'store'
            ? getStoreActionListTitle(action).toLowerCase()
            : String(action.title || '').toLowerCase()
        const storeQuestion = String(action.store_question || '').toLowerCase()
        const incidentRef = String(action.incident?.reference_no || '').toLowerCase()
        const assignee = String(action.assigned_to?.full_name || '').toLowerCase()
        const description = String(action.description || '').toLowerCase()
        const storeName = formatStoreName(action.store?.store_name).toLowerCase()

        return (
          title.includes(q) ||
          storeQuestion.includes(q) ||
          incidentRef.includes(q) ||
          assignee.includes(q) ||
          description.includes(q) ||
          storeName.includes(q)
        )
      })
    }
  }

  const storeQuestionOptions = Array.from(
    new Set(
      actions
        .filter((action) => action.source_type === 'store')
        .map((action) => action.store_question || getStoreActionQuestion(action))
        .filter((question): question is string => Boolean(question))
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  if (filters?.store_question && filters?.status !== 'complete') {
    const selectedQuestion = normalizeStoreActionQuestion(filters.store_question) || filters.store_question
    actions = actions.filter((action) => {
      if (action.source_type !== 'store') return false
      const normalizedQuestion =
        normalizeStoreActionQuestion(action.store_question || getStoreActionQuestion(action) || '') || ''
      return normalizedQuestion === selectedQuestion
    })
  }

  return { actions, storeQuestionOptions }
}

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: {
    assigned_to?: string
    status?: string
    overdue?: string
    priority?: string
    store_question?: string
    q?: string
    date_from?: string
    date_to?: string
  }
}) {
  await requireAuth()
  const filters: ActionFilters = {
    assigned_to: searchParams.assigned_to || undefined,
    status:
      normalizeFilterValue(searchParams.status) &&
      normalizeFilterValue(searchParams.status) !== 'all'
        ? normalizeFilterValue(searchParams.status)
        : undefined,
    overdue: searchParams.overdue === 'true',
    priority:
      normalizeFilterValue(searchParams.priority) &&
      normalizeFilterValue(searchParams.priority) !== 'all'
        ? normalizeFilterValue(searchParams.priority)
        : undefined,
    store_question:
      searchParams.store_question && searchParams.store_question !== 'all'
        ? searchParams.store_question
        : undefined,
    q: searchParams.q?.trim() || undefined,
    date_from: searchParams.date_from || undefined,
    date_to: searchParams.date_to || undefined,
  }
  const { actions, storeQuestionOptions } = await getActions(filters)

  // Calculate stats
  const totalActions = actions.length
  const overdueCount = actions.filter(action => {
    const isOverdue = new Date(action.due_date) < new Date() && 
      !['complete', 'cancelled'].includes(action.status)
    return isOverdue
  }).length
  const activeActions = actions.filter(action => 
    !['complete', 'cancelled'].includes(action.status)
  ).length
  const completedActions = actions.filter(action => 
    action.status === 'complete'
  ).length
  const hasActiveFilters = Boolean(
    filters.q ||
      filters.status ||
      filters.priority ||
      filters.store_question ||
      filters.overdue ||
      filters.date_from ||
      filters.date_to
  )
  const activeFilterCount = [
    filters.q,
    filters.status,
    filters.priority,
    filters.store_question,
    filters.overdue ? 'overdue' : null,
    filters.date_from,
    filters.date_to,
  ].filter(Boolean).length

  const storeSummaryByActionId = await buildStoreActionSummaryMap(actions)
  const tableActions =
    filters.status === 'complete'
      ? actions.filter((action) => String(action.status || '').toLowerCase() === 'complete')
      : actions.filter((action) => String(action.status || '').toLowerCase() !== 'complete')
  const hiddenCompletedCount =
    filters.status === 'complete' ? 0 : actions.filter((action) => String(action.status || '').toLowerCase() === 'complete').length

  const groupedActions = Array.from(
    tableActions.reduce((groups, action) => {
      const isStoreAction = action.source_type === 'store'
      const groupKey = isStoreAction
        ? `store:${action.store?.id || action.id}`
        : `incident:${action.incident_id || action.id}`
      const groupLabel = isStoreAction
        ? action.store?.store_code
          ? `${action.store.store_code} - ${formatStoreName(action.store.store_name)}`
          : formatStoreName(action.store?.store_name) || action.incident?.reference_no || 'Store Action'
        : action.incident?.reference_no || 'Incident Action'

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: groupLabel,
          isStoreGroup: isStoreAction,
          actions: [] as UnifiedAction[],
        })
      }

      groups.get(groupKey)!.actions.push(action)
      return groups
    }, new Map<string, { key: string; label: string; isStoreGroup: boolean; actions: UnifiedAction[] }>())
  )
    .map(([, value]) => ({
      ...value,
      summaryBullets: value.isStoreGroup ? buildStoreSummaryBullets(value.actions, storeSummaryByActionId) : [],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))

  return (
    <WorkspaceShell className="p-4 md:p-6">
      <WorkspaceHeader
        eyebrow="Actions"
        icon={CheckSquare2}
        title="Action workspace"
        description="Track action items, monitor due dates, and manage completion status across incidents and store follow-up work."
      />

      <WorkspaceStatGrid>
        <WorkspaceStat label="Total actions" value={totalActions} note="All tasks in the current data set" icon={FileText} tone="info" />
        <WorkspaceStat label="Active" value={activeActions} note="Open or in-progress tasks" icon={Clock} tone="info" />
        <WorkspaceStat label="Overdue" value={overdueCount} note="Tasks beyond their target date" icon={AlertCircle} tone="critical" />
        <WorkspaceStat label="Completed" value={completedActions} note="Tasks marked complete" icon={CheckCircle2} tone="success" />
      </WorkspaceStatGrid>

      {/* Main Table Card */}
      <Card className="shadow-sm border-slate-200 bg-white overflow-hidden">
        <CardHeader className="border-b bg-slate-50/40 px-4 py-4 md:px-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base font-semibold text-slate-800">
                Action Items {overdueCount > 0 && <span className="text-rose-600">({overdueCount} overdue)</span>}
              </CardTitle>
              {hasActiveFilters ? (
                <span className="text-xs text-slate-500">Filtered results</span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              Grouped by store/reference. Click a group to open tasks for that store.
            </p>

            <div className="space-y-3 md:hidden">
              <form method="get" className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  name="q"
                  defaultValue={searchParams.q || ''}
                  placeholder="Search action groups"
                  className="bg-white pl-12 sm:pl-12"
                />
              </form>

              <MobileFilterSheet
                activeFilterCount={activeFilterCount}
                description="Filter action groups by status, priority, store question, and due date."
              >
                <form method="get" className="space-y-3">
                  {searchParams.q ? <input type="hidden" name="q" value={searchParams.q} /> : null}
                  <select
                    name="store_question"
                    defaultValue={searchParams.store_question || 'all'}
                    className="min-h-[48px] w-full rounded-[16px] border border-slate-200 bg-white px-4 text-base"
                  >
                    <option value="all">All store questions</option>
                    {storeQuestionOptions.map((question) => (
                      <option key={question} value={question}>
                        {formatStoreActionQuestionForDisplay(question)}
                      </option>
                    ))}
                  </select>

                  <AutoSubmitSelect
                    name="status"
                    defaultValue={searchParams.status || 'all'}
                    className="min-h-[48px] w-full rounded-[16px] border border-slate-200 bg-white px-4 text-base"
                    options={[
                      { value: 'all', label: 'All statuses' },
                      { value: 'open', label: 'Open' },
                      { value: 'in_progress', label: 'In Progress' },
                      { value: 'complete', label: 'Complete' },
                      { value: 'cancelled', label: 'Cancelled' },
                    ]}
                  />

                  <select
                    name="priority"
                    defaultValue={searchParams.priority || 'all'}
                    className="min-h-[48px] w-full rounded-[16px] border border-slate-200 bg-white px-4 text-base"
                  >
                    <option value="all">All priorities</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      name="date_from"
                      defaultValue={searchParams.date_from || ''}
                      className="bg-white"
                    />
                    <Input
                      type="date"
                      name="date_to"
                      defaultValue={searchParams.date_to || ''}
                      className="bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button type="submit" className="w-full">
                      Apply
                    </Button>
                    <Button
                      type="submit"
                      name="overdue"
                      value="true"
                      variant={filters.overdue ? 'default' : 'outline'}
                      className="w-full"
                    >
                      Overdue Only
                    </Button>
                  </div>

                  <Button asChild variant="outline" className="w-full">
                    <Link href="/actions">Reset</Link>
                  </Button>
                </form>
              </MobileFilterSheet>
            </div>

            <form method="get" className={workspaceDesktopFilterFormClass}>
              <div className={workspaceDesktopFilterSearchClass}>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  name="q"
                  defaultValue={searchParams.q || ''}
                  placeholder="Search title/question, store, assignee..."
                  className="w-full bg-white pl-10"
                />
              </div>

              <select
                name="store_question"
                defaultValue={searchParams.store_question || 'all'}
                className={`${workspaceDesktopSelectClass} md:col-span-2 lg:col-span-6`}
              >
                <option value="all">All store questions</option>
                {storeQuestionOptions.map((question) => (
                  <option key={question} value={question}>
                    {formatStoreActionQuestionForDisplay(question)}
                  </option>
                ))}
              </select>

              <AutoSubmitSelect
                name="status"
                defaultValue={searchParams.status || 'all'}
                className={`${workspaceDesktopSelectClass} md:col-span-1 lg:col-span-3`}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'open', label: 'Open' },
                  { value: 'in_progress', label: 'In Progress' },
                  { value: 'complete', label: 'Complete' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />

              <select
                name="priority"
                defaultValue={searchParams.priority || 'all'}
                className={`${workspaceDesktopSelectClass} md:col-span-1 lg:col-span-3`}
              >
                <option value="all">All priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <Input
                type="date"
                name="date_from"
                defaultValue={searchParams.date_from || ''}
                className={workspaceDesktopDateInputClass}
              />
              <Input
                type="date"
                name="date_to"
                defaultValue={searchParams.date_to || ''}
                className={workspaceDesktopDateInputClass}
              />

              <div className={cn(workspaceDesktopFilterActionsClass, 'lg:col-span-6')}>
                <Button type="submit" size="sm" className="min-h-[44px] flex-1 sm:flex-none lg:min-h-9">
                  Apply Filters
                </Button>
                <Button
                  type="submit"
                  name="overdue"
                  value="true"
                  variant={filters.overdue ? 'default' : 'outline'}
                  size="sm"
                  className="min-h-[44px] flex-1 sm:flex-none lg:min-h-9"
                >
                  Overdue Only
                </Button>
                <Button asChild variant="outline" size="sm" className="min-h-[44px] flex-1 sm:flex-none lg:min-h-9">
                  <Link href="/actions">Reset</Link>
                </Button>
              </div>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ResponsiveDataView
            isEmpty={tableActions.length === 0}
            empty={
              <div className="p-4">
                <WorkspaceEmptyState
                  icon={FileText}
                  title="No actions found"
                  description={
                    hiddenCompletedCount > 0
                      ? `${hiddenCompletedCount} completed action${hiddenCompletedCount === 1 ? '' : 's'} hidden. Set Status to Complete to view.`
                      : 'Actions will appear here when created for incidents or stores.'
                  }
                />
              </div>
            }
            mobile={
              <div className="p-4 space-y-4">
                {groupedActions.map((group) => (
                  <details
                    key={group.key}
                    open={filters.status === 'complete'}
                    className="rounded-xl border border-slate-200 bg-white"
                  >
                    <summary className="cursor-pointer list-none px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-700">{group.label}</span>
                        <span className="text-[11px] text-slate-500">{group.actions.length} tasks</span>
                      </div>
                    </summary>
                    <div className="border-t p-3 space-y-3">
                      {group.actions.map((action: any) => (
                        <ActionMobileCard key={action.id} action={action} />
                      ))}
                      {group.isStoreGroup && group.summaryBullets.length > 0 ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            Ops copy summary
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-slate-700">{group.summaryBullets.map((bullet: string) => `- ${bullet}`).join('\n')}</pre>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            }
            desktop={
              <div className="p-4 space-y-3">
                {groupedActions.map((group) => (
                  <details
                    key={group.key}
                    open={filters.status === 'complete'}
                    className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                  >
                    <summary className="cursor-pointer list-none bg-slate-50 px-4 py-3 border-b">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-slate-700">{group.label}</span>
                        <span className="text-xs text-slate-500">{group.actions.length} tasks</span>
                      </div>
                    </summary>
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-semibold text-slate-500">Title</TableHead>
                          <TableHead className="font-semibold text-slate-500 w-[130px]">Reference</TableHead>
                          <TableHead className="font-semibold text-slate-500">Assigned To</TableHead>
                          <TableHead className="w-[100px] font-semibold text-slate-500">Priority</TableHead>
                          <TableHead className="font-semibold text-slate-500 w-[130px]">Due Date</TableHead>
                          <TableHead className="w-[120px] font-semibold text-slate-500">Status</TableHead>
                          <TableHead className="w-[160px] text-right font-semibold text-slate-500">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.actions.map((action: any) => (
                          <ActionsTableRow key={action.id} action={action} />
                        ))}
                      </TableBody>
                    </Table>
                    {group.isStoreGroup && group.summaryBullets.length > 0 ? (
                      <div className="border-t bg-slate-50/60 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Ops copy summary
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{group.summaryBullets.map((bullet: string) => `- ${bullet}`).join('\n')}</pre>
                      </div>
                    ) : null}
                  </details>
                ))}
              </div>
            }
          />
        </CardContent>
      </Card>
    </WorkspaceShell>
  )
}
