import type { FRAOverallRisk } from '@/lib/fra/risk-rating'
import { extractFraRiskRatingFromResponses, type FRAResponseLike } from '@/lib/fra/risk-rating-from-responses'

type SupabaseLike = {
  from: (table: string) => any
}

async function getMetadataQuestionId(
  supabase: SupabaseLike,
  templateId: string
): Promise<string | null> {
  const { data: firstSection } = await supabase
    .from('fa_audit_template_sections')
    .select('id')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!firstSection?.id) return null

  const { data: firstQuestion } = await supabase
    .from('fa_audit_template_questions')
    .select('id')
    .eq('section_id', firstSection.id)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle()

  return firstQuestion?.id ?? null
}

async function persistFraRiskRatingOnInstance(
  supabase: SupabaseLike,
  instanceId: string,
  rating: FRAOverallRisk
): Promise<boolean> {
  const { error } = await supabase
    .from('fa_audit_instances')
    .update({ fra_overall_risk_rating: rating })
    .eq('id', instanceId)

  if (!error) return true

  // Keep current deployments working until the migration is applied.
  if (error.message?.includes('fra_overall_risk_rating')) {
    return false
  }

  throw new Error(`Failed to update FRA instance risk rating: ${error.message}`)
}

export async function persistFraRiskRatingForInstance(params: {
  supabase: SupabaseLike
  instanceId: string
  templateId: string
  responses: FRAResponseLike[]
}): Promise<FRAOverallRisk | null> {
  const rating = extractFraRiskRatingFromResponses(params.responses)
  if (!rating) return null

  const persistedOnInstance = await persistFraRiskRatingOnInstance(
    params.supabase,
    params.instanceId,
    rating
  )

  if (persistedOnInstance) {
    return rating
  }

  const questionId = await getMetadataQuestionId(params.supabase, params.templateId)
  if (!questionId) return rating

  const { data: existingRows, error: readError } = await params.supabase
    .from('fa_audit_responses')
    .select('id, response_value, response_json, created_at')
    .eq('audit_instance_id', params.instanceId)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (readError) {
    throw new Error(`Failed to read FRA metadata row: ${readError.message}`)
  }

  const existing = existingRows?.[0] ?? null
  const existingJson =
    existing?.response_json && typeof existing.response_json === 'object'
      ? existing.response_json
      : {}
  const existingCustom =
    existingJson.fra_custom_data && typeof existingJson.fra_custom_data === 'object'
      ? existingJson.fra_custom_data
      : {}

  const payload = {
    response_value: existing?.response_value ?? null,
    response_json: {
      ...existingJson,
      fra_custom_data: {
        ...existingCustom,
        actionPlanLevel: rating,
        riskRatingOverall: rating,
        overallRiskRating: rating,
        updated_at: new Date().toISOString(),
      },
    },
  }

  if (existing?.id) {
    const { error: updateError } = await params.supabase
      .from('fa_audit_responses')
      .update(payload)
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(`Failed to update FRA risk rating: ${updateError.message}`)
    }

    return rating
  }

  const { error: insertError } = await params.supabase
    .from('fa_audit_responses')
    .insert({
      audit_instance_id: params.instanceId,
      question_id: questionId,
      ...payload,
    })

  if (insertError) {
    throw new Error(`Failed to insert FRA risk rating: ${insertError.message}`)
  }

  return rating
}
