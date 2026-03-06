import { createClient } from '@supabase/supabase-js'

const FRA_OVERALL_RISK_ORDER = ['Tolerable', 'Moderate', 'Substantial', 'Intolerable']
const YES_VALUES = new Set(['yes', 'y', 'true', 'pass'])
const NO_VALUES = new Set(['no', 'n', 'false', 'fail'])
const NA_VALUES = new Set(['na', 'n/a', 'not applicable'])

function normalizeFraRiskRating(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const exact = FRA_OVERALL_RISK_ORDER.find((risk) => risk.toLowerCase() === normalized)
  if (exact) return exact
  if (normalized === 'moderate harm') return 'Moderate'
  return null
}

function normalizeYesNoAnswer(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (!normalized || NA_VALUES.has(normalized)) return null
  if (YES_VALUES.has(normalized)) return true
  if (NO_VALUES.has(normalized)) return false
  return null
}

function getResponseJson(response) {
  return response?.response_json && typeof response.response_json === 'object'
    ? response.response_json
    : null
}

function getResponseQuestionText(response) {
  return String(response?.fa_audit_template_questions?.question_text || '').trim().toLowerCase()
}

function getExtractedData(responses) {
  for (const response of responses) {
    const responseJson = getResponseJson(response)
    if (responseJson?.fra_extracted_data && typeof responseJson.fra_extracted_data === 'object') {
      return responseJson.fra_extracted_data
    }
  }
  return {}
}

function textIncludesAny(value, patterns) {
  if (typeof value !== 'string') return false
  return patterns.some((pattern) => pattern.test(value))
}

function getResponseAnswer(response) {
  const responseJson = getResponseJson(response)
  return normalizeYesNoAnswer(
    response?.response_value
      ?? responseJson?.value
      ?? responseJson?.answer
      ?? null
  )
}

function getResponseNarrative(response) {
  const responseJson = getResponseJson(response)
  return [
    typeof response?.response_value === 'string' ? response.response_value : '',
    typeof responseJson?.value === 'string' ? responseJson.value : '',
    typeof responseJson?.comment === 'string' ? responseJson.comment : '',
    typeof responseJson?.notes === 'string' ? responseJson.notes : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase()
}

function findResponse(responses, matchers) {
  for (const response of responses) {
    const questionText = getResponseQuestionText(response)
    if (matchers.some((matcher) => typeof matcher === 'string' ? questionText.includes(matcher) : matcher.test(questionText))) {
      return response
    }
  }
  return null
}

function findBooleanAnswer(responses, matchers) {
  const response = findResponse(responses, matchers)
  return {
    answer: response ? getResponseAnswer(response) : null,
    narrative: response ? getResponseNarrative(response) : '',
  }
}

function computeFraRiskRating(findings) {
  const highLikelihoodTriggers =
    findings.escape_routes_obstructed
    || findings.fire_exits_obstructed
    || findings.combustibles_in_escape_routes
    || findings.fire_doors_held_open
    || findings.fire_doors_blocked

  let likelihood = 'Normal'
  if (highLikelihoodTriggers) {
    likelihood = 'High'
  } else if (findings.combustibles_poorly_stored || findings.housekeeping_poor_back_of_house) {
    likelihood = 'Normal'
  } else if (findings.housekeeping_good) {
    likelihood = 'Low'
  }

  const routeCompromise = findings.escape_routes_obstructed || findings.fire_exits_obstructed
  const fireDoorCompromise = findings.fire_doors_held_open || findings.fire_doors_blocked
  const criticalFailures = [
    findings.fire_exits_obstructed,
    findings.fire_alarm_tests_current === false,
    findings.emergency_lighting_tests_current === false,
    findings.extinguishers_serviced_current === false,
    findings.fire_door_integrity_issues,
    findings.fire_panel_access_obstructed,
  ].filter(Boolean).length

  let consequence = 'Slight Harm'
  if (routeCompromise && fireDoorCompromise && criticalFailures >= 2) {
    consequence = 'Extreme Harm'
  } else if (
    findings.escape_routes_obstructed
    || findings.fire_exits_obstructed
    || findings.fire_doors_held_open
    || findings.fire_doors_blocked
    || findings.combustibles_in_escape_routes
  ) {
    consequence = 'Moderate Harm'
  }

  const matrix = {
    Low: { 'Slight Harm': 'Tolerable', 'Moderate Harm': 'Tolerable', 'Extreme Harm': 'Moderate' },
    Normal: { 'Slight Harm': 'Tolerable', 'Moderate Harm': 'Moderate', 'Extreme Harm': 'Substantial' },
    High: { 'Slight Harm': 'Moderate', 'Moderate Harm': 'Substantial', 'Extreme Harm': 'Intolerable' },
  }

  return matrix[likelihood][consequence]
}

function deriveFraRiskRating(responses) {
  const extractedData = getExtractedData(responses)
  if (responses.length > 0 && Object.keys(extractedData).length > 0) {
    const fireExitRoutes = findBooleanAnswer(responses, ['fire exit routes clear and unobstructed', /escape routes?.*clear.*unobstructed/])
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

    const combustiblesInEscapeRoutes =
      extractedCombustiblesInEscapeRoutes
      || (combustibleStorage.answer === false
        && !/\bclear\b|\bunobstructed\b|\bno obstruction\b/.test(combustibleStorage.narrative))

    const combustiblesPoorlyStored =
      (combustibleStorage.answer === false || textIncludesAny(extractedData.combustibleStorageEscapeCompromise, [/\bstacked incorrectly\b/i, /\btipping hazards?\b/i]))
      && combustiblesInEscapeRoutes !== true

    const fireDoorIntegrityIssues = fireDoorsCondition.answer === false || intumescentStrips.answer === false || extractedDoorIssues
    const hasAnyExplicitControls =
      fireExitRoutes.answer !== null
      || fireDoorsClosed.answer !== null
      || fireDoorsCondition.answer !== null
      || intumescentStrips.answer !== null
      || combustibleStorage.answer !== null
      || significantRisks.answer !== null

    return computeFraRiskRating({
      escape_routes_obstructed: extractedEscapeRoutesObstructed || fireExitRoutes.answer === false,
      fire_exits_obstructed: extractedEscapeRoutesObstructed || fireExitRoutes.answer === false,
      fire_doors_held_open: fireDoorsClosed.answer === false,
      fire_doors_blocked: /\bblocked\b|\bobstructed\b/.test(
        [fireDoorsClosed.narrative, fireDoorsCondition.narrative, intumescentStrips.narrative].join(' ')
      ),
      combustibles_in_escape_routes: combustiblesInEscapeRoutes,
      combustibles_poorly_stored: combustiblesPoorlyStored,
      fire_panel_access_obstructed: false,
      fire_door_integrity_issues: fireDoorIntegrityIssues,
      housekeeping_poor_back_of_house: significantRisks.answer === false || combustiblesPoorlyStored,
      housekeeping_good: hasAnyExplicitControls
        ? !(significantRisks.answer === false || fireDoorIntegrityIssues || combustiblesPoorlyStored || fireExitRoutes.answer === false)
        : true,
      training_completion_rate: null,
      recent_fire_drill_within_6_months: recentFireDrill.answer,
      emergency_lighting_tests_current: emergencyLightingTests.answer,
      fire_alarm_tests_current: weeklyFireTests.answer,
      extinguishers_serviced_current: extinguisherService.answer,
    })
  }

  for (const response of responses) {
    const responseJson = getResponseJson(response)
    const extractedData = responseJson?.fra_extracted_data && typeof responseJson.fra_extracted_data === 'object'
      ? responseJson.fra_extracted_data
      : null
    const customData = responseJson?.fra_custom_data && typeof responseJson.fra_custom_data === 'object'
      ? responseJson.fra_custom_data
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
  }
}

async function getMetadataQuestionId(supabase, templateId) {
  const { data: firstSection, error: sectionError } = await supabase
    .from('fa_audit_template_sections')
    .select('id')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (sectionError || !firstSection?.id) return null

  const { data: firstQuestion, error: questionError } = await supabase
    .from('fa_audit_template_questions')
    .select('id')
    .eq('section_id', firstSection.id)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (questionError) return null
  return firstQuestion?.id ?? null
}

async function upsertFraRiskRating(supabase, instance) {
  const rating = deriveFraRiskRating(instance.fa_audit_responses || [])
  if (!rating) {
    return { rating: null, updated: false }
  }

  const questionId = await getMetadataQuestionId(supabase, instance.template_id)
  if (!questionId) {
    return { rating, updated: false }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('fa_audit_responses')
    .select('id, response_value, response_json, created_at')
    .eq('audit_instance_id', instance.id)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (existingError) {
    throw new Error(`Failed reading metadata row for ${instance.id}: ${existingError.message}`)
  }

  const existing = existingRows?.[0] ?? null
  const responseJson = existing?.response_json && typeof existing.response_json === 'object' ? existing.response_json : {}
  const fraCustomData = responseJson.fra_custom_data && typeof responseJson.fra_custom_data === 'object' ? responseJson.fra_custom_data : {}

  const payload = {
    response_value: existing?.response_value ?? null,
    response_json: {
      ...responseJson,
      fra_custom_data: {
        ...fraCustomData,
        actionPlanLevel: rating,
        riskRatingOverall: rating,
        overallRiskRating: rating,
        updated_at: new Date().toISOString(),
      },
    },
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('fa_audit_responses')
      .update(payload)
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(`Failed updating metadata row for ${instance.id}: ${updateError.message}`)
    }
  } else {
    const { error: insertError } = await supabase
      .from('fa_audit_responses')
      .insert({
        audit_instance_id: instance.id,
        question_id: questionId,
        ...payload,
      })

    if (insertError) {
      throw new Error(`Failed inserting metadata row for ${instance.id}: ${insertError.message}`)
    }
  }

  return { rating, updated: true }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(url, key)
  const { data: instances, error } = await supabase
    .from('fa_audit_instances')
    .select(`
      id,
      template_id,
      store_id,
      status,
      conducted_at,
      fa_audit_templates ( category ),
      fa_stores ( store_name, store_code ),
      fa_audit_responses (
        response_value,
        response_json,
        fa_audit_template_questions ( question_text )
      )
    `)
    .eq('status', 'completed')
    .order('conducted_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(`Failed to load FRA instances: ${error.message}`)
  }

  const fras = (instances || []).filter((instance) => instance.fa_audit_templates?.category === 'fire_risk_assessment')

  let updatedCount = 0
  let skippedCount = 0
  const results = []

  for (const instance of fras) {
    const result = await upsertFraRiskRating(supabase, instance)
    if (result.updated) {
      updatedCount += 1
    } else {
      skippedCount += 1
    }

    results.push({
      instanceId: instance.id,
      store: instance.fa_stores?.store_name || null,
      storeCode: instance.fa_stores?.store_code || null,
      rating: result.rating,
      updated: result.updated,
    })
  }

  console.log(JSON.stringify({
    scanned: fras.length,
    updated: updatedCount,
    skipped: skippedCount,
    sample: results.slice(0, 20),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
