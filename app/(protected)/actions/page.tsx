import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { ActionsTableRow } from '@/components/shared/actions-table-row'
import { ActionMobileCard } from '@/components/shared/action-mobile-card'
import { Search, CheckSquare2, FileText, Clock, AlertCircle, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { getInternalAreaDisplayName } from '@/lib/areas'
import {
  formatStoreActionQuestionForDisplay,
  getStoreActionListTitle,
  getStoreActionQuestion,
  normalizeStoreActionQuestion,
} from '@/lib/store-action-titles'
import { formatStoreName } from '@/lib/store-display'

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
    .order('due_date', { ascending: true })

  let storeQuery = supabase
    .from('tfs_store_actions')
    .select(`
      *,
      store:tfs_stores!tfs_store_actions_store_id_fkey(id, store_name, store_code, region, compliance_audit_2_assigned_manager_user_id)
    `)
    .order('due_date', { ascending: true })

  if (filters?.status) {
    incidentQuery = incidentQuery.eq('status', filters.status)
    storeQuery = storeQuery.eq('status', filters.status)
  }
  if (filters?.overdue) {
    const today = new Date().toISOString().split('T')[0]
    incidentQuery = incidentQuery
      .lt('due_date', today)
      .not('status', 'in', '(complete,cancelled)')
    storeQuery = storeQuery
      .lt('due_date', today)
      .not('status', 'in', '(complete,cancelled)')
  }
  if (filters?.date_from) {
    incidentQuery = incidentQuery.gte('due_date', filters.date_from)
    storeQuery = storeQuery.gte('due_date', filters.date_from)
  }
  if (filters?.date_to) {
    incidentQuery = incidentQuery.lte('due_date', filters.date_to)
    storeQuery = storeQuery.lte('due_date', filters.date_to)
  }

  const [
    { data: incidentData, error: incidentError },
    { data: storeData, error: storeError },
  ] = await Promise.all([incidentQuery, storeQuery])

  if (incidentError) {
    console.error('Error fetching incident actions:', incidentError)
  }
  if (storeError) {
    console.error('Error fetching store actions:', storeError)
  }
  if (incidentError && storeError) {
    return { actions: [], storeQuestionOptions: [] }
  }

  const incidentActions: UnifiedAction[] = (incidentData || []).map((action: any) => ({
    ...action,
    source_type: 'incident',
    store: null,
  }))

  const storeActionsRaw: UnifiedAction[] = (storeData || []).map((action: any) => ({
    ...action,
    source_type: 'store',
    incident_id: null,
    store_question: getStoreActionQuestion(action),
    incident: action.store
      ? {
          reference_no: action.store.store_code
            ? `${action.store.store_code} - ${formatStoreName(action.store.store_name)}`
            : formatStoreName(action.store.store_name),
        }
      : { reference_no: 'Store Action' },
    assigned_to: (() => {
      const areaCode = typeof action?.store?.region === 'string' ? action.store.region.trim().toUpperCase() : ''
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

  if (filters?.store_question) {
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
    status: searchParams.status && searchParams.status !== 'all' ? searchParams.status : undefined,
    overdue: searchParams.overdue === 'true',
    priority: searchParams.priority && searchParams.priority !== 'all' ? searchParams.priority : undefined,
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

  const groupedActions = Array.from(
    actions.reduce((groups, action) => {
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
    <div className="flex flex-col gap-8 p-6 md:p-8 bg-slate-50/50 min-h-screen">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-slate-900">
            <div className="p-2 bg-blue-600 rounded-lg shadow-sm flex-shrink-0">
              <CheckSquare2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Actions</h1>
          </div>
          <p className="max-w-2xl text-sm text-slate-500 sm:text-base md:ml-11">
            Track action items, monitor due dates, and manage completion status across all incidents.
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-3 md:gap-4">
        <Card className="bg-white shadow-sm border-slate-200">
          <CardContent className="flex h-full flex-col justify-between gap-3 p-3 md:flex-row md:items-center md:p-6">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 md:text-xs">Total Actions</p>
              <p className="text-xl md:text-2xl font-bold text-slate-900">{totalActions}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 md:ml-2 md:h-10 md:w-10">
              <FileText className="h-4 w-4 md:h-5 md:w-5 text-slate-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardContent className="flex h-full flex-col justify-between gap-3 p-3 md:flex-row md:items-center md:p-6">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 md:text-xs">Active</p>
              <p className="text-xl md:text-2xl font-bold text-blue-600">{activeActions}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 md:ml-2 md:h-10 md:w-10">
              <Clock className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardContent className="flex h-full flex-col justify-between gap-3 p-3 md:flex-row md:items-center md:p-6">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 md:text-xs">Overdue</p>
              <p className="text-xl md:text-2xl font-bold text-rose-600">{overdueCount}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 md:ml-2 md:h-10 md:w-10">
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-rose-600" />
            </div>
          </CardContent>
        </Card>
      </div>

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

            <form method="get" className="space-y-3 md:hidden">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  name="q"
                  defaultValue={searchParams.q || ''}
                  placeholder="Search action groups"
                  className="bg-white pl-10"
                />
              </div>

              <details open={hasActiveFilters} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                    Filters
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    {activeFilterCount > 0 ? `${activeFilterCount} active` : 'Optional'}
                  </span>
                </summary>

                <div className="space-y-3 border-t border-slate-200 bg-white px-4 py-4">
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

                  <select
                    name="status"
                    defaultValue={searchParams.status || 'all'}
                    className="min-h-[48px] w-full rounded-[16px] border border-slate-200 bg-white px-4 text-base"
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                    <option value="cancelled">Cancelled</option>
                  </select>

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
                </div>
              </details>
            </form>

            <form method="get" className="hidden grid-cols-1 gap-2 md:grid md:grid-cols-8">
              <div className="relative md:col-span-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  name="q"
                  defaultValue={searchParams.q || ''}
                  placeholder="Search title/question, store, assignee..."
                  className="pl-9 bg-white"
                />
              </div>

              <select
                name="store_question"
                defaultValue={searchParams.store_question || 'all'}
                className="h-10 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm md:col-span-2"
              >
                <option value="all">All store questions</option>
                {storeQuestionOptions.map((question) => (
                  <option key={question} value={question}>
                    {formatStoreActionQuestionForDisplay(question)}
                  </option>
                ))}
              </select>

              <select
                name="status"
                defaultValue={searchParams.status || 'all'}
                className="h-10 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <select
                name="priority"
                defaultValue={searchParams.priority || 'all'}
                className="h-10 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm"
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
                className="bg-white"
              />
              <Input
                type="date"
                name="date_to"
                defaultValue={searchParams.date_to || ''}
                className="bg-white"
              />

              <div className="md:col-span-6 flex flex-wrap gap-2">
                <Button type="submit" size="sm" className="h-9 min-h-[44px] md:min-h-0">
                  Apply Filters
                </Button>
                <Button
                  type="submit"
                  name="overdue"
                  value="true"
                  variant={filters.overdue ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 min-h-[44px] md:min-h-0"
                >
                  Overdue Only
                </Button>
                <Button asChild variant="outline" size="sm" className="h-9 min-h-[44px] md:min-h-0">
                  <Link href="/actions">Reset</Link>
                </Button>
              </div>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="md:hidden p-4 space-y-4">
            {actions.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-500 py-12">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <FileText className="h-5 w-5 text-slate-400" />
                </div>
                <p className="font-medium text-slate-900">No actions found</p>
                <p className="text-sm mt-1 text-center">Actions will appear here when created for incidents or stores.</p>
              </div>
            ) : (
              groupedActions.map((group) => (
                <details
                  key={group.key}
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
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block p-4 space-y-3">
            {actions.length === 0 ? (
              <div className="h-40 flex items-center justify-center">
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <FileText className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-900">No actions found</p>
                  <p className="text-sm mt-1">Actions will appear here when created for incidents or stores.</p>
                </div>
              </div>
            ) : (
              groupedActions.map((group) => (
                <details
                  key={group.key}
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
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
