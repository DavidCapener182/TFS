import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractConductedDateFromPdfText, parseAuditDateString } from '@/lib/fra/pdf-parser'
import { persistFraRiskRatingForInstance } from '@/lib/fra/persist-risk-rating'

export const dynamic = 'force-dynamic'

/**
 * Mark FRA as complete and align dates with the linked H&S audit date.
 * The completion date should reflect when the H&S audit was conducted,
 * not when the FRA was saved.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const instanceId = body?.instanceId

    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    // Get the audit instance and ensure it's an FRA
    const { data: instance, error: instanceError } = await supabase
      .from('tfs_audit_instances')
      .select(`
        id,
        template_id,
        store_id,
        conducted_at,
        created_at,
        tfs_audit_templates ( category )
      `)
      .eq('id', instanceId)
      .single()

    if (instanceError || !instance) {
      return NextResponse.json({ error: 'FRA instance not found' }, { status: 404 })
    }

    const template = instance.tfs_audit_templates as { category?: string } | null
    if (template?.category !== 'fire_risk_assessment') {
      return NextResponse.json({ error: 'Not a Fire Risk Assessment instance' }, { status: 400 })
    }

    const resolveAssessmentDate = async (): Promise<{ date: Date; source: string }> => {
      const { data: responses } = await supabase
        .from('tfs_audit_responses')
        .select('response_json')
        .eq('audit_instance_id', instanceId)

      for (const row of responses || []) {
        const extractedDate = (row as any)?.response_json?.fra_extracted_data?.conductedDate
        const parsed = parseAuditDateString(extractedDate)
        if (parsed) return { date: parsed, source: 'fra_extracted_data.conductedDate' }
      }

      for (const row of responses || []) {
        const pdfText = (row as any)?.response_json?.fra_pdf_text
        if (typeof pdfText !== 'string' || !pdfText.trim()) continue
        const parsed = parseAuditDateString(extractConductedDateFromPdfText(pdfText))
        if (parsed) return { date: parsed, source: 'fra_pdf_text' }
      }

      const existing = parseAuditDateString((instance as any).conducted_at) || parseAuditDateString((instance as any).created_at)
      if (existing) return { date: existing, source: 'existing_instance_date' }

      return { date: new Date(), source: 'now_fallback' }
    }

    const storeId = instance.store_id
    const now = new Date()
    const resolvedAssessment = await resolveAssessmentDate()
    const assessmentIso = resolvedAssessment.date.toISOString()
    const assessmentDay = assessmentIso.slice(0, 10) // YYYY-MM-DD

    // 1. Mark audit instance as completed
    const { error: updateInstanceError } = await supabase
      .from('tfs_audit_instances')
      .update({
        status: 'completed',
        conducted_at: assessmentIso,
        updated_at: now.toISOString(),
      })
      .eq('id', instanceId)

    if (updateInstanceError) {
      console.error('Error updating FRA instance:', updateInstanceError)
      return NextResponse.json(
        { error: 'Failed to mark FRA as completed', details: updateInstanceError.message },
        { status: 500 }
      )
    }

    // 2. Set store's fire_risk_assessment_date to the H&S audit date so tracker aligns with the real assessment date
    const { error: updateStoreError } = await supabase
      .from('tfs_stores')
      .update({ fire_risk_assessment_date: assessmentDay })
      .eq('id', storeId)

    if (updateStoreError) {
      console.error('Error updating store FRA date:', updateStoreError)
      // Instance is already updated; log but don't fail the request
    }

    const { data: ratingResponses, error: ratingResponsesError } = await supabase
      .from('tfs_audit_responses')
      .select('response_value, response_json, tfs_audit_template_questions(question_text)')
      .eq('audit_instance_id', instanceId)

    if (ratingResponsesError) {
      console.error('Error loading FRA responses for risk rating persistence:', ratingResponsesError)
    } else if (instance.template_id) {
      try {
        await persistFraRiskRatingForInstance({
          supabase,
          instanceId,
          templateId: instance.template_id,
          responses: ratingResponses || [],
        })
      } catch (persistError) {
        console.error('Error persisting FRA risk rating during completion:', persistError)
      }
    }

    return NextResponse.json({
      success: true,
      fire_risk_assessment_date: assessmentDay,
      assessment_date_source: resolvedAssessment.source,
    })
  } catch (error: any) {
    console.error('Error completing FRA:', error)
    return NextResponse.json(
      { error: 'Failed to save FRA', details: error.message },
      { status: 500 }
    )
  }
}
