import { computeFRARiskRating, type FRAOverallRisk, type FRARiskFindings } from '@/lib/fra/risk-rating'

export const FRA_OVERALL_RISK_ORDER = ['Tolerable', 'Moderate', 'Substantial', 'Intolerable'] as const

export type FRAResponseLike = {
  response_value?: unknown
  response_json?: unknown
  fa_audit_template_questions?: {
    question_text?: string | null
  } | Array<{
    question_text?: string | null
  }> | null
}

const YES_VALUES = new Set(['yes', 'y', 'true', 'pass'])
const NO_VALUES = new Set(['no', 'n', 'false', 'fail'])
const NA_VALUES = new Set(['na', 'n/a', 'not applicable'])

export function normalizeFraRiskRating(value: unknown): FRAOverallRisk | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const exact = FRA_OVERALL_RISK_ORDER.find((risk) => risk.toLowerCase() === normalized)
  if (exact) return exact

  if (normalized === 'moderate harm') return 'Moderate'
  return null
}

function normalizeYesNoAnswer(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (!normalized || NA_VALUES.has(normalized)) return null
  if (YES_VALUES.has(normalized)) return true
  if (NO_VALUES.has(normalized)) return false
  return null
}

function getResponseQuestionText(response: FRAResponseLike): string {
  const question =
    Array.isArray(response?.fa_audit_template_questions)
      ? response.fa_audit_template_questions[0]
      : response?.fa_audit_template_questions

  return String(question?.question_text || '').trim().toLowerCase()
}

function getResponseJson(response: FRAResponseLike): Record<string, unknown> | null {
  return response?.response_json && typeof response.response_json === 'object'
    ? response.response_json as Record<string, unknown>
    : null
}

function getExtractedData(responses: FRAResponseLike[]): Record<string, unknown> {
  for (const response of responses) {
    const responseJson = getResponseJson(response)
    if (responseJson?.fra_extracted_data && typeof responseJson.fra_extracted_data === 'object') {
      return responseJson.fra_extracted_data as Record<string, unknown>
    }
  }

  return {}
}

function textIncludesAny(value: unknown, patterns: RegExp[]): boolean {
  if (typeof value !== 'string') return false
  return patterns.some((pattern) => pattern.test(value))
}

function getResponseAnswer(response: FRAResponseLike): boolean | null {
  const responseJson = getResponseJson(response)
  return normalizeYesNoAnswer(
    response?.response_value
      ?? responseJson?.value
      ?? responseJson?.answer
      ?? null
  )
}

function getResponseNarrative(response: FRAResponseLike): string {
  const responseJson = getResponseJson(response)
  const parts = [
    typeof response?.response_value === 'string' ? response.response_value : '',
    typeof responseJson?.value === 'string' ? String(responseJson.value) : '',
    typeof responseJson?.comment === 'string' ? String(responseJson.comment) : '',
    typeof responseJson?.notes === 'string' ? String(responseJson.notes) : '',
  ]

  return parts
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase()
}

function matchesQuestion(questionText: string, matcher: string | RegExp): boolean {
  if (!questionText) return false
  if (typeof matcher === 'string') return questionText.includes(matcher)
  return matcher.test(questionText)
}

function findResponse(
  responses: FRAResponseLike[],
  matchers: Array<string | RegExp>
): FRAResponseLike | null {
  for (const response of responses) {
    const questionText = getResponseQuestionText(response)
    if (matchers.some((matcher) => matchesQuestion(questionText, matcher))) {
      return response
    }
  }

  return null
}

function findBooleanAnswer(
  responses: FRAResponseLike[],
  matchers: Array<string | RegExp>
): { answer: boolean | null; narrative: string } {
  const response = findResponse(responses, matchers)
  return {
    answer: response ? getResponseAnswer(response) : null,
    narrative: response ? getResponseNarrative(response) : '',
  }
}

function hasNarrativeSignal(narrative: string, positive: RegExp[], negative: RegExp[]): boolean | null {
  if (!narrative) return null
  if (negative.some((pattern) => pattern.test(narrative))) return false
  if (positive.some((pattern) => pattern.test(narrative))) return true
  return null
}

export function buildFraRiskFindingsFromResponses(responses: FRAResponseLike[]): FRARiskFindings {
  const extractedData = getExtractedData(responses)
  const fireExitRoutes = findBooleanAnswer(responses, [
    'fire exit routes clear and unobstructed',
    /escape routes?.*clear.*unobstructed/,
  ])
  const fireDoorsClosed = findBooleanAnswer(responses, ['fire doors closed and not held open'])
  const fireDoorsCondition = findBooleanAnswer(responses, ['fire doors in a good condition'])
  const intumescentStrips = findBooleanAnswer(responses, ['intumescent strips in place and intact'])
  const combustibleStorage = findBooleanAnswer(responses, ['combustible materials are stored correctly'])
  const weeklyFireTests = findBooleanAnswer(responses, ['weekly fire tests carried out and documented'])
  const recentFireDrill = findBooleanAnswer(responses, ['fire drill has been carried out in the past 6 months'])
  const emergencyLightingTests = findBooleanAnswer(responses, ['monthly emergency lighting test being conducted'])
  const extinguisherService = findBooleanAnswer(responses, ['fire extinguisher service'])
  const significantRisks = findBooleanAnswer(responses, ['site clear of any other significant risks'])

  const extractedEscapeRoutesObstructed =
    textIncludesAny(extractedData.escapeRoutesEvidence, [/\bblocked\b/i, /\bobstructed\b/i, /\bhinder\b/i])
    || textIncludesAny(extractedData.combustibleStorageEscapeCompromise, [/\bescape routes?\b/i, /\bfire doors?\b/i, /\bobstructed\b/i])

  const extractedCombustiblesInEscapeRoutes =
    textIncludesAny(extractedData.combustibleStorageEscapeCompromise, [/\bescape routes?\b/i, /\bfire doors?\b/i, /\bobstructed\b/i])

  const extractedDoorIssues =
    textIncludesAny(extractedData.fireDoorsCondition, [/\bheld open\b/i, /\bblocked\b/i, /\bobstructed\b/i])
    || textIncludesAny(extractedData.compartmentationStatus, [/\bbreach\b/i, /\bgap\b/i, /\bdamage\b/i, /\bmissing\b/i])

  const combustibleRouteSignal = hasNarrativeSignal(
    combustibleStorage.narrative,
    [/\bescape routes?\b/, /\bfire exits?\b/, /\bfinal exits?\b/],
    [/\bno obstruction\b/, /\bclear\b/, /\bunobstructed\b/]
  )

  const fireDoorsBlockedNarrative = hasNarrativeSignal(
    [fireDoorsClosed.narrative, fireDoorsCondition.narrative, intumescentStrips.narrative].filter(Boolean).join(' '),
    [/\bblocked\b/, /\bobstructed\b/],
    [/\bnot blocked\b/, /\bunobstructed\b/]
  )

  const hasAnyExplicitControls =
    fireExitRoutes.answer !== null
    || fireDoorsClosed.answer !== null
    || fireDoorsCondition.answer !== null
    || intumescentStrips.answer !== null
    || combustibleStorage.answer !== null
    || significantRisks.answer !== null

  const fireDoorIntegrityIssues =
    fireDoorsCondition.answer === false
    || intumescentStrips.answer === false
    || extractedDoorIssues

  const combustiblesInEscapeRoutes =
    extractedCombustiblesInEscapeRoutes
    || (combustibleStorage.answer === false && combustibleRouteSignal !== false)

  const combustiblesPoorlyStored =
    (combustibleStorage.answer === false || textIncludesAny(extractedData.combustibleStorageEscapeCompromise, [/\bstacked incorrectly\b/i, /\btipping hazards?\b/i]))
    && combustiblesInEscapeRoutes !== true

  return {
    escape_routes_obstructed: extractedEscapeRoutesObstructed || fireExitRoutes.answer === false,
    fire_exits_obstructed: extractedEscapeRoutesObstructed || fireExitRoutes.answer === false,
    fire_doors_held_open: fireDoorsClosed.answer === false,
    fire_doors_blocked: fireDoorsBlockedNarrative === true,
    combustibles_in_escape_routes: combustiblesInEscapeRoutes,
    combustibles_poorly_stored: combustiblesPoorlyStored,
    fire_panel_access_obstructed: false,
    fire_door_integrity_issues: fireDoorIntegrityIssues,
    housekeeping_poor_back_of_house: significantRisks.answer === false || combustiblesPoorlyStored,
    housekeeping_good:
      hasAnyExplicitControls
        ? !(significantRisks.answer === false || fireDoorIntegrityIssues || combustiblesPoorlyStored || fireExitRoutes.answer === false)
        : true,
    training_completion_rate: null,
    recent_fire_drill_within_6_months: recentFireDrill.answer,
    emergency_lighting_tests_current: emergencyLightingTests.answer,
    fire_alarm_tests_current: weeklyFireTests.answer,
    extinguishers_serviced_current: extinguisherService.answer,
  }
}

export function extractFraRiskRatingFromResponses(responses: FRAResponseLike[]): FRAOverallRisk | null {
  for (const response of responses) {
    const responseJson = getResponseJson(response)
    const extractedData =
      responseJson?.fra_extracted_data && typeof responseJson.fra_extracted_data === 'object'
        ? responseJson.fra_extracted_data as Record<string, unknown>
        : null
    const customData =
      responseJson?.fra_custom_data && typeof responseJson.fra_custom_data === 'object'
        ? responseJson.fra_custom_data as Record<string, unknown>
        : null

    const directCandidates = [
      responseJson?.riskRatingOverall,
      responseJson?.actionPlanLevel,
      responseJson?.overallRiskRating,
      responseJson?.overall_risk_rating,
      responseJson?.overallRisk,
      responseJson?.overall_risk,
      extractedData?.riskRatingOverall,
      extractedData?.actionPlanLevel,
      extractedData?.overallRiskRating,
      extractedData?.overall_risk_rating,
      extractedData?.overallRisk,
      extractedData?.overall_risk,
      customData?.riskRatingOverall,
      customData?.actionPlanLevel,
      customData?.overallRiskRating,
      customData?.overall_risk_rating,
      customData?.overallRisk,
      customData?.overall_risk,
      responseJson?.value,
      response?.response_value,
    ]

    for (const candidate of directCandidates) {
      const normalized = normalizeFraRiskRating(candidate)
      if (normalized) return normalized
    }

    const questionText = getResponseQuestionText(response)
    const isOverallRiskQuestion =
      questionText.includes('overall risk')
      || questionText.includes('overall fire risk')
      || questionText.includes('risk rating')

    if (!isOverallRiskQuestion) continue

    const questionCandidates = [response?.response_value, responseJson?.value, responseJson]
    for (const candidate of questionCandidates) {
      const normalized = normalizeFraRiskRating(candidate)
      if (normalized) return normalized

      if (typeof candidate === 'string') {
        for (const risk of FRA_OVERALL_RISK_ORDER) {
          if (candidate.toLowerCase().includes(risk.toLowerCase())) return risk
        }
      }
    }
  }

  if (!responses.length) return null

  const findings = buildFraRiskFindingsFromResponses(responses)
  return computeFRARiskRating(findings).overall
}
