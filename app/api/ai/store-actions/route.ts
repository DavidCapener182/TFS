import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeStoreActionQuestion } from '@/lib/store-action-titles'

type ActionPriority = 'low' | 'medium' | 'high' | 'urgent'

interface GeneratedStoreAction {
  flaggedItem: string
  title: string
  description: string
  priority: ActionPriority
  dueDate: string
}

interface ParsedFlaggedItem {
  section: string | null
  question: string
  context: string
}

const REVIEW_MONTH_OFFSET = 6

function toDateOnlyFromNow(daysFromNow: number): string {
  const clampedDays = Number.isFinite(daysFromNow)
    ? Math.min(90, Math.max(1, Math.round(daysFromNow)))
    : 14

  const date = new Date(Date.now() + clampedDays * 24 * 60 * 60 * 1000)
  return date.toISOString().split('T')[0]
}

function normalizePriority(value: unknown): ActionPriority {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'urgent') {
    return value
  }
  return 'medium'
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isNoiseLine(line: string): boolean {
  return (
    /^photo\b/i.test(line) ||
    /^private\s*&\s*confidential/i.test(line) ||
    /^flagged items\b/i.test(line) ||
    /^page\s+\d+/i.test(line) ||
    /^\d+\s*\/\s*\d+$/.test(line)
  )
}

function isAnswerLine(line: string): boolean {
  return /^(yes|no|n\/a|na)$/i.test(line)
}

function isNoAnswer(line: string): boolean {
  return /^no$/i.test(line)
}

function isLikelySectionHeading(line: string): boolean {
  const value = collapseWhitespace(line)
  if (!value) return false
  if (value.length > 60) return false
  if (/[?.,:;]/.test(value)) return false
  const words = value.split(' ')
  if (words.length > 8) return false
  return /^[a-zA-Z&\-\s/()]+$/.test(value)
}

function parseChunkToFlaggedItem(chunkLines: string[]): ParsedFlaggedItem | null {
  const lines = chunkLines
    .map((line) =>
      collapseWhitespace(
        line
          .replace(/^\s*[-*\u2022]+\s*/, '')
          .replace(/^\s*\d+[\.)]\s*/, '')
      )
    )
    .filter((line) => line.length > 0 && !isNoiseLine(line))

  if (lines.length === 0) return null

  let section: string | null = null
  let contentLines = lines

  if (lines.length > 1 && isLikelySectionHeading(lines[0])) {
    section = lines[0]
    contentLines = lines.slice(1)
  }

  if (contentLines.length === 0) return null

  let question = ''
  const contextParts: string[] = []

  const questionParts: string[] = []
  let questionFound = false

  for (const line of contentLines) {
    if (!questionFound) {
      questionParts.push(line)
      const joined = collapseWhitespace(questionParts.join(' '))
      const qIdx = joined.indexOf('?')
      if (qIdx !== -1) {
        question = collapseWhitespace(joined.slice(0, qIdx + 1))
        const trailing = collapseWhitespace(joined.slice(qIdx + 1))
        if (trailing) contextParts.push(trailing)
        questionFound = true
      }
      continue
    }
    contextParts.push(line)
  }

  if (!questionFound) {
    const fallback = collapseWhitespace(contentLines.join(' '))
    if (!fallback) return null
    question = fallback.length > 220 ? `${fallback.slice(0, 217).trimEnd()}...` : fallback
  }

  const context = collapseWhitespace(contextParts.join(' '))
  if (!question) return null

  return { section, question, context }
}

function parseFlaggedItems(raw: string): ParsedFlaggedItem[] {
  const cleanedLines = raw
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter((line) => line.length > 0 && !isNoiseLine(line))

  const chunks: string[][] = []
  let currentChunk: string[] = []

  for (const line of cleanedLines) {
    if (isAnswerLine(line)) {
      if (isNoAnswer(line) && currentChunk.length > 0) {
        chunks.push(currentChunk)
      }
      currentChunk = []
      continue
    }
    currentChunk.push(line)
  }

  if (chunks.length === 0 && currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  const parsed = chunks
    .map(parseChunkToFlaggedItem)
    .filter((item): item is ParsedFlaggedItem => item !== null)
    .slice(0, 30)

  const deduped = new Map<string, ParsedFlaggedItem>()
  parsed.forEach((item) => {
    const key = `${item.section || ''}|${item.question}`.toLowerCase()
    if (!deduped.has(key)) {
      deduped.set(key, item)
    }
  })

  return Array.from(deduped.values())
}

function formatParsedFlaggedItem(item: ParsedFlaggedItem): string {
  const sectionPrefix = item.section ? `${item.section}: ` : ''
  const detail = item.context ? ` Context: ${item.context}` : ''
  return `${sectionPrefix}${item.question}${detail}`
}

function addMonthsDateOnly(dateValue: string | null, monthsToAdd: number): string | null {
  if (!dateValue) return null

  const normalized = dateValue.trim()
  if (!normalized) return null

  const parsed = new Date(normalized.length === 10 ? `${normalized}T00:00:00` : normalized)
  if (Number.isNaN(parsed.getTime())) return null

  const d = new Date(parsed)
  d.setMonth(d.getMonth() + monthsToAdd)
  return d.toISOString().split('T')[0]
}

function inferPriority(item: ParsedFlaggedItem): ActionPriority {
  const sourceText = `${item.section || ''} ${item.question} ${item.context}`.toLowerCase()
  if (/(fire door|fire|alarm|emergency exit|combustible|blocked|electrical|evac)/i.test(sourceText)) {
    return 'high'
  }
  if (/(coshh|contractor|visitor|working at height|ladder|stepladder|manual handling|training)/i.test(sourceText)) {
    return 'medium'
  }
  return 'low'
}

function stripTrailingQuestionMark(value: string): string {
  return value.replace(/\?+\s*$/, '').trim()
}

function buildCompletionInstructions(item: ParsedFlaggedItem): string {
  const q = item.question.toLowerCase()

  if (/induction/.test(q) && /onboarding/.test(q)) {
    return 'Complete H&S induction onboarding for every staff member and close any outstanding records. Verify the training matrix shows 100% completion.'
  }

  if (/toolbox/.test(q) && /refresher/.test(q)) {
    return 'Schedule and complete toolbox refresher training for all required topics. Update the records and verify the completion rate is 100%.'
  }

  if ((/contractor/.test(q) || /visitor/.test(q)) && (/sign/.test(q) || /permit/.test(q))) {
    return 'Enforce contractor and visitor sign-in/sign-out on every visit. Apply permit-to-work controls for all applicable tasks and keep records available.'
  }

  if (/coshh/.test(q) && /data sheet/.test(q)) {
    return 'Place current COSHH data sheets on site in a clearly accessible location. Brief staff on where they are stored and how to use them.'
  }

  if (/stock room|stockroom/.test(q) || (/safe condition/.test(q) && /hazard/.test(q))) {
    return 'Remove obstructions from stockroom routes and door areas and reorganize storage safely. Confirm walkways and exits remain clear during trading.'
  }

  if (/ladder|step stool|stepladder/.test(q) && /number/.test(q)) {
    return 'Assign a unique identification number to every ladder and step stool. Update the equipment register and link checks to each ID.'
  }

  if (/combustible/.test(q) && /stored/.test(q)) {
    return 'Store combustible materials safely away from doors and escape routes. Keep stacks stable and verify storage standards are maintained.'
  }

  if (/fire doors?/.test(q) && (/closed/.test(q) || /held open/.test(q))) {
    return 'Remove all door props and wedges and keep fire doors closed at all times. Carry out routine checks so compartmentation is maintained.'
  }

  if (/intumescent/.test(q) || (/fire door/.test(q) && /strip/.test(q))) {
    return 'Install or replace missing or damaged intumescent strips on all fire doors. Verify each fire door meets required fire-resisting standards.'
  }

  return `Put controls in place so this check can be answered Yes: ${stripTrailingQuestionMark(item.question)}. Verify completion with documented evidence.`
}

function questionActions(items: ParsedFlaggedItem[], reviewDate: string): GeneratedStoreAction[] {
  return items.map((item) => {
    const sourceText = formatParsedFlaggedItem(item)
    const normalizedQuestion =
      normalizeStoreActionQuestion(item.question, sourceText) || collapseWhitespace(item.question)
    const description = buildCompletionInstructions(item)

    return {
      flaggedItem: sourceText,
      // Keep title equal to a normalized failed question for consistent analytics/search.
      title: normalizedQuestion,
      description,
      priority: normalizePriority(inferPriority(item)),
      dueDate: reviewDate,
    }
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const flaggedItemsText = String(body?.flaggedItemsText || '').trim()
    const auditDate = typeof body?.auditDate === 'string' ? body.auditDate : null
    const storeName = String(body?.storeName || 'Unknown store').trim()
    const storeCode = String(body?.storeCode || '').trim()
    const latestAuditScore = body?.latestAuditScore
    const fraCompleted = Boolean(body?.fraCompleted)

    if (!flaggedItemsText) {
      return NextResponse.json({ error: 'Please paste flagged items first.' }, { status: 400 })
    }

    const parsedItems = parseFlaggedItems(flaggedItemsText)
    if (parsedItems.length === 0) {
      return NextResponse.json({ error: 'No flagged items were detected in the pasted text.' }, { status: 400 })
    }

    const reviewDate =
      addMonthsDateOnly(auditDate, REVIEW_MONTH_OFFSET) ||
      addMonthsDateOnly(new Date().toISOString().split('T')[0], REVIEW_MONTH_OFFSET) ||
      toDateOnlyFromNow(14)

    const actions = questionActions(parsedItems, reviewDate).slice(0, 30)

    return NextResponse.json({
      source: 'parsed',
      meta: {
        storeName,
        storeCode,
        latestAuditScore: typeof latestAuditScore === 'number' ? latestAuditScore : null,
        fraCompleted,
        auditDate,
        reviewDate,
      },
      actions,
    })
  } catch (error) {
    console.error('Error generating store actions:', error)
    return NextResponse.json({ error: 'Failed to generate actions' }, { status: 500 })
  }
}
