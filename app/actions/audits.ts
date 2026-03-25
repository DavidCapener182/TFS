'use server'

import { createClient } from '@/lib/supabase/server'

export async function getAuditInstance(instanceId: string) {
  const supabase = createClient()

  const { data: instance, error: instanceError } = await supabase
    .from('tfs_audit_instances')
    .select('*')
    .eq('id', instanceId)
    .maybeSingle()

  if (instanceError) {
    throw instanceError
  }
  if (!instance) return null

  const [templateResult, storeResult, responsesResult, mediaResult] = await Promise.all([
    supabase
      .from('tfs_audit_templates')
      .select('*')
      .eq('id', instance.template_id)
      .maybeSingle(),
    instance.store_id
      ? supabase.from('tfs_stores').select('*').eq('id', instance.store_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from('tfs_audit_responses').select('*').eq('audit_instance_id', instanceId),
    supabase.from('tfs_audit_media').select('*').eq('audit_instance_id', instanceId),
  ])

  return {
    ...instance,
    tfs_audit_templates: templateResult.data || null,
    tfs_stores: storeResult.data || null,
    responses: responsesResult.data || [],
    media: mediaResult.data || [],
  }
}

export async function getTemplate(templateId: string) {
  const supabase = createClient()

  const { data: template, error: templateError } = await supabase
    .from('tfs_audit_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle()

  if (templateError) {
    throw templateError
  }
  if (!template) return null

  const { data: sections, error: sectionsError } = await supabase
    .from('tfs_audit_template_sections')
    .select('*')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true })

  if (sectionsError) {
    throw sectionsError
  }

  const sectionIds = (sections || []).map((s: any) => s.id).filter(Boolean)
  const { data: questions, error: questionsError } = sectionIds.length
    ? await supabase
        .from('tfs_audit_template_questions')
        .select('*')
        .in('section_id', sectionIds)
        .order('order_index', { ascending: true })
    : { data: [], error: null }

  if (questionsError) {
    throw questionsError
  }

  const questionsBySection = new Map<string, any[]>()
  ;(questions || []).forEach((q: any) => {
    const list = questionsBySection.get(q.section_id) || []
    list.push(q)
    questionsBySection.set(q.section_id, list)
  })

  const sectionsWithQuestions = (sections || []).map((section: any) => ({
    ...section,
    questions: questionsBySection.get(section.id) || [],
  }))

  return {
    ...template,
    sections: sectionsWithQuestions,
  }
}

