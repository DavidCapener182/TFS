const CANONICAL_STORE_AUDIT_QUESTIONS = [
  'Any know enforcement action in relation to H&S or Fire Safety in last 12 months?',
  'Is the Health and Safety Policy available on site?',
  'Is the Health and Safety Policy Statement on display?',
  'Has the Health and Policy Statement been signed in the last 12 months?',
  'Slips, trips and falls?',
  'Working at height?',
  'Manual Handling?',
  'Display stands and furniture?',
  'Customer violence?',
  'Opening boxes, wrapping and strapex?',
  'Use of escalators?',
  'Use of fan heaters?',
  'Student nights?',
  'Additional site specific where required? (Fire hazards in the window, falling mannequins)',
  'Young persons?',
  'Expectant mothers?',
  'Can management / employees demonstrate their knowledge and understanding (Choose one risk assessment)?',
  'H&S induction training onboarding up to date and at 100%?',
  'H&S toolbox refresher training completed in the last 12 months and records available for Manual handling Housekeeping Fire Safety Stepladders?',
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
  'Are contractors managed whilst working on site? (sign in/out, permit to work)',
  'Is the visitors signing in / out book available and in use?',
  'Is manual handling being carried out safely and are good practices being followed and posters visible?',
  'Are goods stored in a manner whereby safe manual handling can be followed?',
  'Is there evidence of suitable delivery management?',
  'Are only Company authorised chemicals being used?',
  'Are chemicals stored correctly?',
  'COSHH data sheets available on site?',
  'Is equipment in a good condition?',
  'Are the premises in a good condition?',
  'Are all floor surfaces in a good condition? (clean, no defects / damage noted)',
  'Are slips, trips and falls being managed?',
  'A clean as you go policy is in place and evident?',
  'Is lighting in a good condition and working correctly and deemed to be suitable and sufficient?',
  'Appropriate cleaning equipment is available and used?',
  'Are adequate facilities provided to rest and eat meals?',
  'Are welfare facilities in a clean, hygienic condition with hot and cold running water available?',
  'If asbestos is present is it being managed?',
  'Customer areas found to be in good condition (shelving, benches, storage at height)?',
  'Goods in areas found to be in safe condition with no hazards found?',
  'Stock rooms (clothing and shoes) found to be in a safe condition with no hazards found?',
  'Are fixtures and fittings throughout the site in a safe condition?',
  'Working at height / use of ladders and other work at height equipment managed?',
  'Are all ladders clearly numbered for identification purposes?',
  'Ladder checks completed and recorded on weekly H&S checks?',
  'Adequate number of first aid boxes, appropriately stocked and employees are aware of their location?',
  'Appropriate first aid assistance available if required and management team / employees aware of their responsibilities in the event of an injury / incident in store?',
  'Accident book available on site and employees aware of the procedure to follow in the event of an accident?',
  'Accident investigations have been completed in store and documentation available. Corrective action has been taken where applicable?',
  'FRA available - actions completed and signed?',
  'Combustible materials are stored correctly?',
  'Fire doors closed and not held open?',
  'Fire doors in a good condition?',
  'Are fire door intumescent strips in place and intact, to ensure the door retains its fire resisting properties and holds back the blaze to enable persons to escape?',
  'Structure found to be in a good condition with no evidence of damage which would compromise fire safety - EG Missing ceiling tiles / gaps from area to area?',
  'Fire exit routes clear and unobstructed?',
  'Are all Fire Extinguishers clear and easily accessible?',
  'Are all call points clear and easily accessible?',
  'Weekly Fire Tests carried out and documented?',
  'Fire drill has been carried out in the past 6 months and records available on site?',
  'Evidence of Monthly Emergency Lighting test being conducted?',
  'Is there a 50mm clearance from stock to sprinkler head on clearance?',
  'Are plugs and Extension leads managed and not overloaded?',
  'Is panel free of faults?',
  'Evidence of weekly health and safety checks being conducted?',
  'Evidence of wet floor signs availability and being used?',
  'Is the site clear of any other significant risks?',
  'Has the water system been flushed and Legionella compliant?',
] as const

const QUESTION_START_PATTERN =
  /(Are|Is|Do|Does|Did|Can|Could|Would|Should|Has|Have|Will|H&S|COSHH|FRA|PAT|Any|Slips|Working|Manual|Display|Customer|Opening|Use|Student|Young|Expectant|Additional|Fixed|Air|Lift|Lifting|Fire|Emergency|Escalators|Stock|Goods|Appropriate|Adequate|Accident|Structure|Evidence|If|Weekly)\b/i

const SECTION_PREFIX_PATTERN =
  /^(Contractor\s*&\s*Visitor\s*Safety|Fire\s*Safety|Training|COSHH|Premises\s*and\s*Equipment|Working\s*at\s*Height|Manual\s*Handling|Statutory\s*Testing|Risk\s*Assessments?)\s+/i

const COMMON_MERGED_WORD_FIXES: Array<[RegExp, string]> = [
  [/\bH&S(?=[A-Za-z])/g, 'H&S '],
  [/\bCOSHH(?=[A-Za-z])/g, 'COSHH '],
  [/\bOnarrival\b/gi, 'On arrival'],
  [/\bandrecords\b/gi, 'and records'],
  [/\bmembertocomplete\b/gi, 'member to complete'],
  [/\bdeemedtobesuitable\b/gi, 'deemed to be suitable'],
  [/\bAclean\b/gi, 'A clean'],
  [/\bgopolicy\b/gi, 'go policy'],
  [/\bdatasheets\b/gi, 'data sheets'],
  [/\bsignin\b/gi, 'sign in'],
  [/\bsignout\b/gi, 'sign out'],
]

function normalizeUnicode(value: string): string {
  return value
    .replace(/\u00A0/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeQuestionSpacing(value: string): string {
  let output = normalizeUnicode(value)
  output = output
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')

  for (const [pattern, replacement] of COMMON_MERGED_WORD_FIXES) {
    output = output.replace(pattern, replacement)
  }

  output = output
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?!\s|$)/g, '$1 ')

  return collapseWhitespace(output)
}

function stripAnswerSuffix(value: string): string {
  return value.replace(/\s*\((yes|no|n\/?a)\)\s*$/i, '').trim()
}

function stripKnownSectionPrefix(value: string): string {
  return value.replace(SECTION_PREFIX_PATTERN, '').trim()
}

function ensureQuestionMark(value: string): string {
  const trimmed = value.replace(/[.\s]+$/, '').trim()
  if (!trimmed) return trimmed
  return trimmed.endsWith('?') ? trimmed : `${trimmed}?`
}

function normalizeForMatching(value: string): string {
  return normalizeQuestionSpacing(stripAnswerSuffix(value))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactForMatching(value: string): string {
  return normalizeForMatching(value).replace(/\s+/g, '')
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeForMatching(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
  )
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const aBigrams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i += 1) {
    const bigram = a.slice(i, i + 2)
    aBigrams.set(bigram, (aBigrams.get(bigram) || 0) + 1)
  }

  let intersection = 0
  for (let i = 0; i < b.length - 1; i += 1) {
    const bigram = b.slice(i, i + 2)
    const count = aBigrams.get(bigram) || 0
    if (count > 0) {
      intersection += 1
      aBigrams.set(bigram, count - 1)
    }
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1))
}

function tokenOverlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0

  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
  let matches = 0
  for (const token of smaller) {
    if (larger.has(token)) matches += 1
  }

  return matches / Math.max(a.size, b.size)
}

const CANONICAL_QUESTION_INDEX = CANONICAL_STORE_AUDIT_QUESTIONS.map((question) => ({
  question,
  normalized: normalizeForMatching(question),
  compact: compactForMatching(question),
  tokens: tokenize(question),
}))

const CANONICAL_QUESTION_BY_NORMALIZED = new Map(
  CANONICAL_QUESTION_INDEX.map((item) => [item.normalized, item.question] as const)
)

interface StoreActionPriorityThemeRule {
  key: string
  summary: string
  managerPrompt: string
  matcher: RegExp
}

export interface StoreActionPriorityTheme {
  key: string
  summary: string
  managerPrompt: string
}

const DEFAULT_STORE_ACTION_PRIORITY_SUMMARY = 'General H&S control gaps'
const DEFAULT_STORE_ACTION_MANAGER_PROMPT =
  'Ask area managers to verify this failed check is corrected consistently and evidenced in local follow-up.'

const STORE_ACTION_PRIORITY_THEME_RULES: StoreActionPriorityThemeRule[] = [
  {
    key: 'contractor-management',
    summary: 'Contractor and visitor controls',
    managerPrompt:
      'Ask store teams to enforce sign-in/out, permits-to-work, and active supervision for every contractor visit.',
    matcher: /(contractor|visitor|permit[\s-]*to[\s-]*work|sign[\s-]*in|sign[\s-]*out)/i,
  },
  {
    key: 'training-completion',
    summary: 'Training and refresher completion',
    managerPrompt:
      'Target 100% completion for required inductions and refreshers, then verify records are current and auditable.',
    matcher: /(training|induction|onboarding|toolbox|refresher|competenc)/i,
  },
  {
    key: 'housekeeping-and-access',
    summary: 'Housekeeping and safe access',
    managerPrompt:
      'Reinforce daily housekeeping checks so walkways, stock areas, and exits stay clear throughout the trading day.',
    matcher: /(housekeeping|stock\s*room|stockroom|walkway|trip|slip|obstruction|clutter|access route)/i,
  },
  {
    key: 'fire-door-and-escape',
    summary: 'Fire door and escape route controls',
    managerPrompt:
      'Prioritize checks on fire doors and escape routes to ensure compartmentation and emergency egress are maintained.',
    matcher: /(fire\s*door|escape route|emergency exit|fire exit|intumescent|evac)/i,
  },
  {
    key: 'coshh-and-chemicals',
    summary: 'COSHH and hazardous substances',
    managerPrompt:
      'Confirm COSHH controls are in place, data sheets are available on site, and teams know the safe handling process.',
    matcher: /(coshh|hazardous substance|chemical|data sheet|sds)/i,
  },
  {
    key: 'work-at-height-equipment',
    summary: 'Work-at-height equipment checks',
    managerPrompt:
      'Check ladder and step equipment is uniquely identified, inspected, and used under the correct controls.',
    matcher: /(ladder|step stool|stepladder|working at height|equipment register)/i,
  },
]

function contextualMatch(candidate: string, context: string): string | null {
  const combined = `${candidate} ${context}`.toLowerCase()

  if (/toolbox\s+refresher\s+training/i.test(combined)) {
    return 'H&S toolbox refresher training completed in the last 12 months and records available for Manual handling Housekeeping Fire Safety Stepladders?'
  }

  if (/induction\s+training\s+onboarding/i.test(combined)) {
    return 'H&S induction training onboarding up to date and at 100%?'
  }

  if (/coshh\s+data\s*sheets?\s+available\s+on\s+site/i.test(combined) || /datasheets\s+available\s+on\s+site/i.test(combined)) {
    return 'COSHH data sheets available on site?'
  }

  if (/visitors?\s+sign(ing)?\s+in\s*\/\s*out\s+book/i.test(combined)) {
    return 'Is the visitors signing in / out book available and in use?'
  }

  if (/contractors?\s+managed\s+whilst\s+working\s+on\s+site/i.test(combined)) {
    return 'Are contractors managed whilst working on site? (sign in/out, permit to work)'
  }

  if (/a\s+clean\s+as\s+you\s+go\s+policy/i.test(combined)) {
    return 'A clean as you go policy is in place and evident?'
  }

  if (/are\s+stored\s+correctly\??/i.test(candidate)) {
    if (/combustible|fire\s+safety|sprinkler|fire\s+door|fire\s+exit/i.test(combined)) {
      return 'Combustible materials are stored correctly?'
    }
    if (/coshh|chemical|data\s*sheet/i.test(combined)) {
      return 'Are chemicals stored correctly?'
    }
  }

  return null
}

function scoreAgainstCanonical(candidate: string, canonical: (typeof CANONICAL_QUESTION_INDEX)[number]): number {
  const candidateNormalized = normalizeForMatching(candidate)
  if (!candidateNormalized) return 0

  if (candidateNormalized === canonical.normalized) return 1
  if (candidateNormalized.includes(canonical.normalized) || canonical.normalized.includes(candidateNormalized)) {
    return 0.95
  }

  const candidateCompact = compactForMatching(candidate)
  const candidateTokens = tokenize(candidate)
  if (candidateTokens.size >= 6 && canonical.tokens.size <= 2) {
    return 0
  }

  const dice = diceCoefficient(candidateCompact, canonical.compact)
  const tokenOverlap = tokenOverlapScore(candidateTokens, canonical.tokens)
  return dice * 0.65 + tokenOverlap * 0.35
}

function bestCanonicalMatch(candidate: string, context: string): string | null {
  const contextOverride = contextualMatch(candidate, context)
  if (contextOverride) return contextOverride

  let bestQuestion: string | null = null
  let bestScore = 0

  for (const canonical of CANONICAL_QUESTION_INDEX) {
    const score = scoreAgainstCanonical(candidate, canonical)
    if (score > bestScore) {
      bestScore = score
      bestQuestion = canonical.question
    }
  }

  return bestScore >= 0.7 ? bestQuestion : null
}

function extractLastQuestion(value: string): string | null {
  const normalized = normalizeQuestionSpacing(value)
  if (!normalized) return null

  const finalQuestionIndex = normalized.lastIndexOf('?')
  if (finalQuestionIndex === -1) return null

  const upToQuestion = normalized.slice(0, finalQuestionIndex + 1)
  const separators = ['. ', '! ', '; ', ': ']

  let startIndex = 0
  for (const separator of separators) {
    const idx = upToQuestion.lastIndexOf(separator)
    if (idx !== -1) {
      startIndex = Math.max(startIndex, idx + separator.length)
    }
  }

  let candidate = collapseWhitespace(upToQuestion.slice(startIndex))
  candidate = stripKnownSectionPrefix(candidate)

  const questionStartMatch = candidate.match(
    /(Are|Is|Do|Does|Did|Can|Could|Would|Should|Has|Have|Will|H&S|COSHH|FRA|PAT|Any|Slips|Working|Manual|Display|Customer|Opening|Use|Student|Young|Expectant|Additional|Fixed|Air|Lift|Lifting|Fire|Emergency|Escalators|Stock|Goods|Appropriate|Adequate|Accident|Structure|Evidence|If|Weekly)\b[\s\S]*\?$/i
  )
  if (questionStartMatch) {
    candidate = collapseWhitespace(questionStartMatch[0])
  }

  if (candidate.split(' ').length < 3) return null
  return candidate
}

function extractFallbackQuestion(value: string): string | null {
  const normalized = normalizeQuestionSpacing(stripAnswerSuffix(value))
  if (!normalized) return null

  const startIndex = normalized.search(QUESTION_START_PATTERN)
  const candidate = startIndex === -1 ? normalized : normalized.slice(startIndex)
  if (!candidate) return null

  const trimmed = stripKnownSectionPrefix(
    collapseWhitespace(candidate.replace(/\bcontext:\b.*$/i, '').replace(/^[-,;:.\s]+/, ''))
  )
  if (!trimmed) return null

  return ensureQuestionMark(trimmed)
}

export function matchCanonicalStoreActionQuestion(value: string, context = ''): string | null {
  const cleaned = stripKnownSectionPrefix(normalizeQuestionSpacing(stripAnswerSuffix(value)))
  if (!cleaned) return null

  const maybeQuestion = ensureQuestionMark(cleaned)
  const normalizedMaybeQuestion = normalizeForMatching(maybeQuestion)
  const exactMatch = CANONICAL_QUESTION_BY_NORMALIZED.get(normalizedMaybeQuestion)
  if (exactMatch) return exactMatch

  return bestCanonicalMatch(maybeQuestion, context)
}

export function normalizeStoreActionQuestion(value: string, context = ''): string | null {
  const cleaned = stripKnownSectionPrefix(normalizeQuestionSpacing(stripAnswerSuffix(value)))
  if (!cleaned) return null

  const maybeQuestion = ensureQuestionMark(cleaned)
  const canonical = matchCanonicalStoreActionQuestion(maybeQuestion, context)
  if (canonical) return canonical

  let fallback = maybeQuestion
  const questionStartIndex = fallback.search(QUESTION_START_PATTERN)
  if (questionStartIndex !== -1) {
    fallback = fallback.slice(questionStartIndex)
  }

  fallback = collapseWhitespace(fallback.replace(/^[-,;:.\s]+/, ''))
  if (!fallback) return null

  const first = fallback.charAt(0).toUpperCase()
  const rest = fallback.slice(1)
  return ensureQuestionMark(`${first}${rest}`)
}

function toThemeKey(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim() || 'general'
  )
}

function normalizePrioritySummaryLabel(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim().replace(/[.?!,:;]+$/g, '')
  return compact
}

function toStoreActionSourceText(action: {
  title?: string | null
  description?: string | null
  source_flagged_item?: string | null
  sourceFlaggedItem?: string | null
}): string {
  const question = getStoreActionQuestion({
    title: action.title,
    source_flagged_item: action.source_flagged_item ?? action.sourceFlaggedItem,
  })

  return collapseWhitespace(
    `${question || ''} ${action.title || ''} ${action.source_flagged_item || action.sourceFlaggedItem || ''} ${
      action.description || ''
    }`
  )
}

export function resolveStoreActionPriorityTheme(action: {
  title?: string | null
  description?: string | null
  source_flagged_item?: string | null
  sourceFlaggedItem?: string | null
  priority_summary?: string | null
  prioritySummary?: string | null
}): StoreActionPriorityTheme {
  const explicitSummary = normalizePrioritySummaryLabel(
    String(action.priority_summary || action.prioritySummary || '')
  )

  if (explicitSummary) {
    const matchedRule = STORE_ACTION_PRIORITY_THEME_RULES.find(
      (rule) => rule.summary.toLowerCase() === explicitSummary.toLowerCase()
    )
    if (matchedRule) {
      return {
        key: matchedRule.key,
        summary: matchedRule.summary,
        managerPrompt: matchedRule.managerPrompt,
      }
    }

    return {
      key: `custom:${toThemeKey(explicitSummary)}`,
      summary: explicitSummary,
      managerPrompt: DEFAULT_STORE_ACTION_MANAGER_PROMPT,
    }
  }

  const sourceText = toStoreActionSourceText(action)
  const matchedRule = STORE_ACTION_PRIORITY_THEME_RULES.find((rule) => rule.matcher.test(sourceText))
  if (matchedRule) {
    return {
      key: matchedRule.key,
      summary: matchedRule.summary,
      managerPrompt: matchedRule.managerPrompt,
    }
  }

  return {
    key: 'general-hs-control-gaps',
    summary: DEFAULT_STORE_ACTION_PRIORITY_SUMMARY,
    managerPrompt: DEFAULT_STORE_ACTION_MANAGER_PROMPT,
  }
}

export function getStoreActionQuestion(action: any): string | null {
  const title = String(action?.title || '')
  const source = String(action?.source_flagged_item || '')
  const context = `${title} ${source}`

  const explicitCandidates = [extractLastQuestion(title), extractLastQuestion(source)]
  for (const candidate of explicitCandidates) {
    if (!candidate) continue
    const normalized = normalizeStoreActionQuestion(candidate, context)
    if (normalized) return normalized
  }

  const fallbackCandidates = [extractFallbackQuestion(title), extractFallbackQuestion(source)]
  for (const candidate of fallbackCandidates) {
    if (!candidate) continue
    const normalized = normalizeStoreActionQuestion(candidate, context)
    if (normalized) return normalized
  }

  return null
}

export function formatStoreActionQuestionForDisplay(question: string): string {
  const normalized = normalizeStoreActionQuestion(question) || question
  if (/\(\s*no\s*\)$/i.test(normalized)) return normalized
  return `${normalized} (No)`
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3).trimEnd()}...` : value
}

export function getStoreActionListTitle(action: any): string {
  const question = getStoreActionQuestion(action)
  if (question) {
    return formatStoreActionQuestionForDisplay(question)
  }

  const fallback = normalizeQuestionSpacing(String(action?.title || '').trim()) || 'Store action'
  return truncate(fallback, 180)
}

export function getCanonicalStoreActionQuestions(): string[] {
  return [...CANONICAL_STORE_AUDIT_QUESTIONS]
}
