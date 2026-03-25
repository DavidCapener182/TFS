import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Store pasted H&S audit text for an FRA instance.
 * Same storage shape as PDF-extracted text (fra_pdf_text in first question response_json)
 * so extract-data and FRA report flow treat it identically.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const instanceId = body.instanceId as string | undefined
    const text = typeof body.text === 'string' ? body.text.trim() : ''

    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }
    if (!text) {
      return NextResponse.json({ error: 'text is required and must be non-empty' }, { status: 400 })
    }

    const { data: fraInstance, error: instanceError } = await supabase
      .from('tfs_audit_instances')
      .select('template_id')
      .eq('id', instanceId)
      .single()

    if (instanceError || !fraInstance?.template_id) {
      return NextResponse.json({ error: 'Invalid FRA instance or missing template' }, { status: 400 })
    }

    const templateId = fraInstance.template_id

    let firstSection: { id: string } | null = null
    let firstQuestion: { id: string } | null = null

    const { data: sections } = await supabase
      .from('tfs_audit_template_sections')
      .select('id, title, order_index')
      .eq('template_id', templateId)
      .order('order_index', { ascending: true })

    if (sections && sections.length > 0) {
      firstSection = sections[0]
      const { data: questions } = await supabase
        .from('tfs_audit_template_questions')
        .select('id')
        .eq('section_id', firstSection.id)
        .order('order_index', { ascending: true })
      firstQuestion = questions?.[0] ?? null
    }

    if (!firstSection || !firstQuestion) {
      const { data: storageSection, error: sectionError } = await supabase
        .from('tfs_audit_template_sections')
        .insert({
          template_id: templateId,
          title: 'PDF Storage',
          order_index: 0
        })
        .select('id')
        .single()

      if (sectionError || !storageSection) {
        return NextResponse.json({ error: 'Failed to create storage section' }, { status: 500 })
      }

      const { data: storageQuestion, error: questionError } = await supabase
        .from('tfs_audit_template_questions')
        .insert({
          section_id: storageSection.id,
          question_text: 'H&S Audit PDF Text Storage',
          question_type: 'text',
          order_index: 0,
          is_required: false
        })
        .select('id')
        .single()

      if (questionError || !storageQuestion) {
        return NextResponse.json({ error: 'Failed to create storage question' }, { status: 500 })
      }

      firstSection = storageSection
      firstQuestion = storageQuestion
    }

    const storageData = {
      fra_pdf_text: text,
      fra_pdf_path: null as string | null,
      parsed_at: new Date().toISOString(),
      source: 'pasted_text' as const
    }

    const { data: existingResponse } = await supabase
      .from('tfs_audit_responses')
      .select('id, response_json')
      .eq('audit_instance_id', instanceId)
      .eq('question_id', firstQuestion.id)
      .maybeSingle()

    const responseJson = {
      ...(existingResponse?.response_json && typeof existingResponse.response_json === 'object'
        ? existingResponse.response_json
        : {}),
      ...storageData
    }

    if (existingResponse) {
      const { error: updateError } = await supabase
        .from('tfs_audit_responses')
        .update({ response_json: responseJson })
        .eq('id', existingResponse.id)
      if (updateError) {
        return NextResponse.json({ error: 'Failed to store text' }, { status: 500 })
      }
    } else {
      const { error: insertError } = await supabase
        .from('tfs_audit_responses')
        .insert({
          audit_instance_id: instanceId,
          question_id: firstQuestion.id,
          response_json: responseJson
        })
      if (insertError) {
        return NextResponse.json({ error: 'Failed to store text' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      textLength: text.length,
      hasText: true
    })
  } catch (error: any) {
    console.error('[STORE-HS-TEXT] Error:', error)
    return NextResponse.json(
      { error: 'Failed to store H&S audit text', details: error?.message },
      { status: 500 }
    )
  }
}
