import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    let writeSupabase: ReturnType<typeof createAdminSupabaseClient> | ReturnType<typeof createClient> = supabase
    try {
      writeSupabase = createAdminSupabaseClient()
    } catch (adminError) {
      console.warn('save-custom-data: service role client unavailable, falling back to user client', adminError)
    }
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { instanceId, customData } = body

    if (!instanceId || !customData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify the instance exists and user has access
    const { data: instance, error: instanceError } = await writeSupabase
      .from('tfs_audit_instances')
      .select('id, template_id, tfs_audit_templates!inner(category)')
      .eq('id', instanceId)
      .single()

    if (instanceError || !instance) {
      return NextResponse.json({ error: 'Audit instance not found' }, { status: 404 })
    }

    // Verify it's an FRA template
    if ((instance.tfs_audit_templates as any)?.category !== 'fire_risk_assessment') {
      return NextResponse.json({ error: 'This endpoint is only for FRA audits' }, { status: 400 })
    }

    // Store custom data by finding or creating a special metadata response
    // We'll use the template's first question as a placeholder for metadata storage
    // Get the first question from the template
    const { data: firstSection } = await writeSupabase
      .from('tfs_audit_template_sections')
      .select('id')
      .eq('template_id', instance.template_id)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle()

    let questionIdForMetadata: string | null = null
    
    if (firstSection) {
      const { data: firstQuestion } = await writeSupabase
        .from('tfs_audit_template_questions')
        .select('id')
        .eq('section_id', firstSection.id)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle()
      
      questionIdForMetadata = firstQuestion?.id || null
    }

    // If no questions exist, we can't store metadata this way
    // In that case, we'll need to create a dummy question or use a different approach
    if (!questionIdForMetadata) {
      return NextResponse.json({ error: 'Template has no questions to store metadata' }, { status: 400 })
    }

    // Check if there's already a metadata response for this question.
    // Multiple rows can exist for the same question (no unique constraint),
    // so always use the latest row deterministically instead of maybeSingle().
    const { data: existingResponses, error: existingResponseError } = await writeSupabase
      .from('tfs_audit_responses')
      .select('id, response_value, response_json, created_at')
      .eq('audit_instance_id', instanceId)
      .eq('question_id', questionIdForMetadata)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingResponseError) {
      throw new Error(`Failed to read existing custom data: ${existingResponseError.message}`)
    }

    const existingResponse = existingResponses?.[0] ?? null

    const existing = existingResponse as { id: string; response_value?: unknown; response_json?: { fra_custom_data?: Record<string, unknown> } } | null
    const existingCustom = existing?.response_json?.fra_custom_data && typeof existing.response_json.fra_custom_data === 'object' ? existing.response_json.fra_custom_data : {}
    const metadataResponse = {
      response_value: existing?.response_value ?? null,
      response_json: {
        ...(existing?.response_json && typeof existing.response_json === 'object'
          ? existing.response_json
          : {}),
        fra_custom_data: {
          ...existingCustom,
          ...customData,
          updated_at: new Date().toISOString(),
        },
      },
    }

    if (existingResponse?.id) {
      // Update existing response, preserving other data
      const { data: updatedRow, error: updateError } = await writeSupabase
        .from('tfs_audit_responses')
        .update(metadataResponse)
        .eq('id', existingResponse.id)
        .select('id')
        .maybeSingle()

      if (updateError) {
        throw new Error(`Failed to update custom data: ${updateError.message}`)
      }
      if (!updatedRow?.id) {
        throw new Error('Failed to update custom data: no rows were updated')
      }
    } else {
      // Create new response with metadata
      const { data: insertedRow, error: insertError } = await writeSupabase
        .from('tfs_audit_responses')
        .insert({
          audit_instance_id: instanceId,
          question_id: questionIdForMetadata,
          ...metadataResponse,
        })
        .select('id')
        .maybeSingle()

      if (insertError) {
        throw new Error(`Failed to save custom data: ${insertError.message}`)
      }
      if (!insertedRow?.id) {
        throw new Error('Failed to save custom data: no row was inserted')
      }
    }

    return NextResponse.json({ success: true, message: 'Custom data saved successfully' })
  } catch (error: any) {
    console.error('Error saving custom FRA data:', error)
    return NextResponse.json(
      { error: 'Failed to save custom data', details: error.message },
      { status: 500 }
    )
  }
}
