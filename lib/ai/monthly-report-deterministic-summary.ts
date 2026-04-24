/**
 * Deterministic monthly visit summary (no Node fs, no AI).
 * Safe to import from client components via shared report modules.
 */

export interface MonthlyVisitSummaryInput {
  storeName: string
  reportLabels: string[]
  detailText: string
}

export function collapseWhitespace(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function uniqueLines(lines: Array<string | null | undefined>) {
  const output: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const normalized = collapseWhitespace(line)
    if (!normalized) continue

    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }

  return output
}

export function truncateSmart(value: string, maxLength: number) {
  const normalized = collapseWhitespace(value)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized

  const sentenceBoundary = normalized.slice(0, maxLength).search(/[.!?](?=\s|$)/)
  if (sentenceBoundary >= 0) {
    return normalized.slice(0, sentenceBoundary + 1).trim()
  }

  const clauseIndex = Math.max(
    normalized.slice(0, maxLength).lastIndexOf(' • '),
    normalized.slice(0, maxLength).lastIndexOf('; '),
    normalized.slice(0, maxLength).lastIndexOf(', ')
  )
  if (clauseIndex >= Math.floor(maxLength * 0.55)) {
    return `${normalized.slice(0, clauseIndex).trim()}...`
  }

  const spaceIndex = normalized.slice(0, maxLength).lastIndexOf(' ')
  if (spaceIndex >= Math.floor(maxLength * 0.6)) {
    return `${normalized.slice(0, spaceIndex).trim()}...`
  }

  return `${normalized.slice(0, maxLength - 3).trim()}...`
}

export function sanitizeSummaryLine(value: string) {
  const normalized = collapseWhitespace(value)
    .replace(/(?:\.\.\.|…)+\s*$/g, '')
    .trim()
  if (!normalized) return ''

  const withoutDanglingPreposition = normalized
    .replace(/\b(at|in|on|to|for|with|by|from|of|and|or)\s*$/i, '')
    .trim()
    .replace(/[,:;\-]\s*$/g, '')
    .trim()

  return withoutDanglingPreposition
}

export function isUsableSummaryLine(value: string) {
  const line = sanitizeSummaryLine(value)
  if (!line) return false
  const visibleChars = line.replace(/[\s\-•]/g, '').length
  if (visibleChars < 35) return false
  return !/\b(at|in|on|to|for|with|by|from|of|and|or)\s*$/i.test(line)
}

function toBulletLines(value: string) {
  return uniqueLines(
    String(value || '')
      .split(/\r?\n+/)
      .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
  )
}

function isActionFocusedLine(value: string) {
  const normalized = collapseWhitespace(value).toLowerCase()
  if (!normalized) return false

  return [
    'action',
    'actions',
    'immediate',
    'follow-up',
    'follow up',
    'completed',
    'implemented',
    'agreed',
    'escalat',
    'containment',
    'controls',
    'corrective',
    'next step',
    'outcome',
  ].some((token) => normalized.includes(token))
}

export function isMetaSummaryLine(value: string) {
  const normalized = collapseWhitespace(value).toLowerCase()
  return (
    normalized.includes("here's a rewritten summary") ||
    normalized.includes('rewritten summary') ||
    normalized.includes('management reporting') ||
    normalized.includes('summary for')
  )
}

function compressDeterministicLine(line: string) {
  const trimmed = collapseWhitespace(line)
  if (!trimmed) return null

  const delimiterIndex = trimmed.indexOf(': ')
  if (delimiterIndex > 0) {
    const label = trimmed.slice(0, delimiterIndex).trim()
    const remainder = trimmed.slice(delimiterIndex + 2).trim()
    if (!remainder) return label

    const remainderLimit = Math.max(160, 420 - label.length)
    return `${label}: ${truncateSmart(remainder, remainderLimit)}`
  }

  return truncateSmart(trimmed, 420)
}

export function buildDeterministicMonthlyVisitSummary(input: MonthlyVisitSummaryInput) {
  const sourceLines = toBulletLines(input.detailText)
  const actionLines = sourceLines.filter(isActionFocusedLine)
  const selectedSourceLines =
    actionLines.length >= 2
      ? actionLines
      : uniqueLines([...actionLines, ...sourceLines])
  const selectedLines = selectedSourceLines
    .map(compressDeterministicLine)
    .filter((line): line is string => typeof line === 'string' && !isMetaSummaryLine(line))
    .slice(0, 4)

  if (selectedLines.length === 0) return '- No main actions recorded.'

  const additionalLines = sourceLines
    .map(compressDeterministicLine)
    .filter((line): line is string => typeof line === 'string' && !isMetaSummaryLine(line))
  const minimumLines = uniqueLines([...selectedLines, ...additionalLines]).slice(0, 4)

  return minimumLines.map((line) => `- ${line}`).join('\n')
}
