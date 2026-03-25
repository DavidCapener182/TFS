import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Save edited extracted data to the FRA instance
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { instanceId, extractedData } = await request.json()

    if (!instanceId || !extractedData) {
      return NextResponse.json({ error: 'instanceId and extractedData are required' }, { status: 400 })
    }

    // Get the FRA instance and find a response row to store fra_extracted_data
    const { data: fraInstance } = await supabase
      .from('tfs_audit_instances')
      .select('template_id')
      .eq('id', instanceId)
      .single()

    if (!fraInstance) {
      return NextResponse.json({ error: 'FRA instance not found' }, { status: 404 })
    }

    // Find any existing response for this instance (e.g. the one that has fra_pdf_text)
    const { data: existingResponses } = await supabase
      .from('tfs_audit_responses')
      .select('id, question_id, response_json')
      .eq('audit_instance_id', instanceId)

    let targetResponse = existingResponses?.[0] ?? null
    if (!targetResponse && fraInstance.template_id) {
      // No response yet - get first section/question so we can create one
      const { data: sections } = await supabase
        .from('tfs_audit_template_sections')
        .select('id')
        .eq('template_id', fraInstance.template_id)
        .order('order_index', { ascending: true })
      const firstSection = sections?.[0]
      if (firstSection) {
        const { data: firstQuestion } = await supabase
          .from('tfs_audit_template_questions')
          .select('id')
          .eq('section_id', firstSection.id)
          .order('order_index', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (firstQuestion) {
          // Insert new response with only fra_extracted_data (no fra_pdf_text here)
          const { data: inserted } = await supabase
            .from('tfs_audit_responses')
            .insert({
              audit_instance_id: instanceId,
              question_id: firstQuestion.id,
              response_json: {
                fra_extracted_data: extractedData,
                fra_extracted_data_updated_at: new Date().toISOString(),
              },
            })
            .select('id')
            .single()
          if (inserted) {
            return NextResponse.json({ success: true })
          }
        }
      }
      return NextResponse.json({ error: 'Template has no section/question to store data' }, { status: 404 })
    }

    const existingJson = (targetResponse?.response_json as Record<string, unknown>) || {}
    const updatedJson = {
      ...existingJson,
      fra_extracted_data: extractedData,
      fra_extracted_data_updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('tfs_audit_responses')
      .update({ response_json: updatedJson })
      .eq('id', targetResponse!.id)

    if (updateError) {
      console.error('Error saving extracted data:', updateError)
      return NextResponse.json(
        { error: 'Failed to save extracted data', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error saving extracted data:', error)
    return NextResponse.json(
      { error: 'Failed to save extracted data', details: error.message },
      { status: 500 }
    )
  }
}
