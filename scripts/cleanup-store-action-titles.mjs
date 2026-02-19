#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

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
]

const QUESTION_START_PATTERN =
  /(Are|Is|Do|Does|Did|Can|Could|Would|Should|Has|Have|Will|H&S|COSHH|FRA|PAT|Any|Slips|Working|Manual|Display|Customer|Opening|Use|Student|Young|Expectant|Additional|Fixed|Air|Lift|Lifting|Fire|Emergency|Escalators|Stock|Goods|Appropriate|Adequate|Accident|Structure|Evidence|If|Weekly)\b/i

const SECTION_PREFIX_PATTERN =
  /^(Contractor\s*&\s*Visitor\s*Safety|Fire\s*Safety|Training|COSHH|Premises\s*and\s*Equipment|Working\s*at\s*Height|Manual\s*Handling|Statutory\s*Testing|Risk\s*Assessments?)\s+/i

const COMMON_MERGED_WORD_FIXES = [
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

function normalizeUnicode(value) {
  return value
    .replace(/\u00A0/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeQuestionSpacing(value) {
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

function stripAnswerSuffix(value) {
  return value.replace(/\s*\((yes|no|n\/?a)\)\s*$/i, '').trim()
}

function stripKnownSectionPrefix(value) {
  return value.replace(SECTION_PREFIX_PATTERN, '').trim()
}

function ensureQuestionMark(value) {
  const trimmed = value.replace(/[.\s]+$/, '').trim()
  if (!trimmed) return trimmed
  return trimmed.endsWith('?') ? trimmed : `${trimmed}?`
}

function normalizeForMatching(value) {
  return normalizeQuestionSpacing(stripAnswerSuffix(value))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactForMatching(value) {
  return normalizeForMatching(value).replace(/\s+/g, '')
}

function tokenize(value) {
  return new Set(
    normalizeForMatching(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
  )
}

function diceCoefficient(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const aBigrams = new Map()
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

function tokenOverlapScore(a, b) {
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

function contextualMatch(candidate, context) {
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

function scoreAgainstCanonical(candidate, canonical) {
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

function bestCanonicalMatch(candidate, context) {
  const contextOverride = contextualMatch(candidate, context)
  if (contextOverride) return contextOverride

  let bestQuestion = null
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

function extractLastQuestion(value) {
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

function extractFallbackQuestion(value) {
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

function normalizeStoreActionQuestion(value, context = '') {
  const cleaned = stripKnownSectionPrefix(normalizeQuestionSpacing(stripAnswerSuffix(value)))
  if (!cleaned) return null

  const maybeQuestion = ensureQuestionMark(cleaned)
  const canonical = bestCanonicalMatch(maybeQuestion, context)
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

function getStoreActionQuestion(row) {
  const title = String(row?.title || '')
  const source = String(row?.source_flagged_item || '')
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

function parseArgs() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const limitArg = args.find((arg) => arg.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null

  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid --limit value: ${limitArg}`)
  }

  return { apply, limit }
}

async function fetchStoreActions(supabase, limit) {
  const pageSize = 500
  const rows = []
  let offset = 0

  while (true) {
    const to = offset + pageSize - 1
    const { data, error } = await supabase
      .from('fa_store_actions')
      .select('id, title, source_flagged_item, ai_generated, created_at')
      .order('created_at', { ascending: true })
      .range(offset, to)

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...data)
    offset += data.length

    if (limit && rows.length >= limit) {
      return rows.slice(0, limit)
    }

    if (data.length < pageSize) break
  }

  return rows
}

async function main() {
  const { apply, limit } = parseArgs()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(url, key)
  const rows = await fetchStoreActions(supabase, limit)

  const candidates = rows.filter((row) => row.ai_generated || row.source_flagged_item)

  const changes = []
  for (const row of candidates) {
    const normalized = getStoreActionQuestion(row)
    if (!normalized) continue
    if (!CANONICAL_STORE_AUDIT_QUESTIONS.includes(normalized)) continue

    const currentTitle = collapseWhitespace(String(row.title || ''))
    if (!currentTitle) continue

    if (currentTitle !== normalized) {
      changes.push({
        id: row.id,
        previous: String(row.title || ''),
        next: normalized,
        source: String(row.source_flagged_item || ''),
      })
    }
  }

  console.log(`Scanned: ${rows.length} rows`)
  console.log(`Eligible (AI/source rows): ${candidates.length}`)
  console.log(`Rows requiring normalization: ${changes.length}`)

  if (changes.length === 0) {
    return
  }

  console.log('\nSample changes:')
  for (const change of changes.slice(0, 20)) {
    console.log(`- ${change.id}`)
    console.log(`  from: ${change.previous}`)
    console.log(`  to:   ${change.next}`)
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to update Supabase.')
    return
  }

  let success = 0
  const failures = []

  for (const [index, change] of changes.entries()) {
    const { error } = await supabase
      .from('fa_store_actions')
      .update({ title: change.next })
      .eq('id', change.id)

    if (error) {
      failures.push({ id: change.id, error: error.message })
    } else {
      success += 1
    }

    if ((index + 1) % 50 === 0) {
      console.log(`Updated ${index + 1}/${changes.length}...`)
    }
  }

  console.log(`\nUpdated successfully: ${success}`)
  console.log(`Failed updates: ${failures.length}`)

  if (failures.length > 0) {
    console.log('\nFailure details:')
    for (const failure of failures.slice(0, 20)) {
      console.log(`- ${failure.id}: ${failure.error}`)
    }
  }
}

main().catch((error) => {
  console.error('Cleanup failed:', error)
  process.exit(1)
})
