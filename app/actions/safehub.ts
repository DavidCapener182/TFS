'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================
// TEMPLATE ACTIONS
// ============================================

export async function getTemplates() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data, error } = await supabase
    .from('fa_audit_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching templates:', error)
    throw new Error(`Failed to fetch templates: ${error.message}`)
  }

  return data || []
}

export async function getTemplate(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Get template with sections and questions
  const { data: template, error: templateError } = await supabase
    .from('fa_audit_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (templateError || !template) {
    throw new Error('Template not found')
  }

  // Get sections
  const { data: sections, error: sectionsError } = await supabase
    .from('fa_audit_template_sections')
    .select('*')
    .eq('template_id', id)
    .order('order_index', { ascending: true })

  if (sectionsError) {
    throw new Error('Failed to fetch sections')
  }

  // Get questions for each section
  if (sections && sections.length > 0) {
    const sectionIds = sections.map(s => s.id)
    const { data: questions, error: questionsError } = await supabase
      .from('fa_audit_template_questions')
      .select('*')
      .in('section_id', sectionIds)
      .order('order_index', { ascending: true })

    if (questionsError) {
      throw new Error('Failed to fetch questions')
    }

    // Attach questions to sections
    sections.forEach(section => {
      ;(section as any).questions = questions?.filter(q => q.section_id === section.id) || []
    })
  }

  return {
    ...template,
    sections: sections || []
  }
}

export async function createTemplate(data: {
  title: string
  description?: string
  category: 'footasylum_audit' | 'fire_risk_assessment' | 'custom'
  sections?: Array<{
    title: string
    order_index: number
    questions?: Array<{
      question_text: string
      question_type: string
      order_index: number
      is_required?: boolean
      options?: any
      conditional_logic?: any
      scoring_rules?: any
    }>
  }>
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Get profile to get user ID
  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    throw new Error('Profile not found')
  }

  // Create template
  const { data: template, error: templateError } = await supabase
    .from('fa_audit_templates')
    .insert({
      title: data.title,
      description: data.description || null,
      category: data.category,
      created_by_user_id: profile.id,
      is_active: true,
    })
    .select()
    .single()

  if (templateError || !template) {
    throw new Error(`Failed to create template: ${templateError?.message}`)
  }

  // Create sections and questions
  if (data.sections && data.sections.length > 0) {
    for (const sectionData of data.sections) {
      const { data: section, error: sectionError } = await supabase
        .from('fa_audit_template_sections')
        .insert({
          template_id: template.id,
          title: sectionData.title,
          order_index: sectionData.order_index,
        })
        .select()
        .single()

      if (sectionError || !section) {
        throw new Error('Failed to create section')
      }

      // Create questions for this section
      if (sectionData.questions && sectionData.questions.length > 0) {
        const questionsToInsert = sectionData.questions.map(q => ({
          section_id: section.id,
          question_text: q.question_text,
          question_type: q.question_type,
          order_index: q.order_index,
          is_required: q.is_required || false,
          options: q.options || null,
          conditional_logic: q.conditional_logic || null,
          scoring_rules: q.scoring_rules || null,
        }))

        const { error: questionsError } = await supabase
          .from('fa_audit_template_questions')
          .insert(questionsToInsert)

        if (questionsError) {
          throw new Error('Failed to create questions')
        }
      }
    }
  }

  revalidatePath('/audit-lab')
  return template
}

export async function updateTemplate(id: string, data: {
  title?: string
  description?: string
  category?: 'footasylum_audit' | 'fire_risk_assessment' | 'custom'
  is_active?: boolean
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
  }

  if (data.title !== undefined) updateData.title = data.title
  if (data.description !== undefined) updateData.description = data.description
  if (data.category !== undefined) updateData.category = data.category
  if (data.is_active !== undefined) updateData.is_active = data.is_active

  const { error } = await supabase
    .from('fa_audit_templates')
    .update(updateData)
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to update template: ${error.message}`)
  }

  revalidatePath('/audit-lab')
  return { success: true }
}

export async function deleteTemplate(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Soft delete - set is_active to false
  const { error } = await supabase
    .from('fa_audit_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete template: ${error.message}`)
  }

  revalidatePath('/audit-lab')
  return { success: true }
}

// ============================================
// AUDIT INSTANCE ACTIONS
// ============================================

export async function createAuditInstance(templateId: string, storeId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    throw new Error('Profile not found')
  }

  const { data: instance, error } = await supabase
    .from('fa_audit_instances')
    .insert({
      template_id: templateId,
      store_id: storeId,
      conducted_by_user_id: profile.id,
      status: 'draft',
    })
    .select()
    .single()

  if (error || !instance) {
    throw new Error(`Failed to create audit instance: ${error?.message}`)
  }

  revalidatePath('/audit-lab')
  return instance
}

export async function saveAuditResponse(
  instanceId: string,
  questionId: string,
  response: {
    response_value?: string | null
    response_json?: any
    score?: number | null
  }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check if response already exists
  const { data: existing } = await supabase
    .from('fa_audit_responses')
    .select('id')
    .eq('audit_instance_id', instanceId)
    .eq('question_id', questionId)
    .single()

  if (existing) {
    // Update existing response
    const { error } = await supabase
      .from('fa_audit_responses')
      .update({
        response_value: response.response_value || null,
        response_json: response.response_json || null,
        score: response.score || null,
      })
      .eq('id', existing.id)

    if (error) {
      throw new Error(`Failed to update response: ${error.message}`)
    }
  } else {
    // Insert new response
    const { error } = await supabase
      .from('fa_audit_responses')
      .insert({
        audit_instance_id: instanceId,
        question_id: questionId,
        response_value: response.response_value || null,
        response_json: response.response_json || null,
        score: response.score || null,
      })

    if (error) {
      throw new Error(`Failed to save response: ${error.message}`)
    }
  }

  // Update instance status to in_progress
  await supabase
    .from('fa_audit_instances')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', instanceId)

  revalidatePath('/audit-lab')
  return { success: true }
}

export async function uploadAuditMedia(
  instanceId: string,
  questionId: string | null,
  file: File
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const fileExt = file.name.split('.').pop()
  const fileName = `${instanceId}/${questionId || 'general'}/${Date.now()}.${fileExt}`
  const filePath = `audits/${fileName}`

  // Upload to storage (assuming audits bucket exists or using fa-attachments)
  const { error: uploadError } = await supabase.storage
    .from('fa-attachments')
    .upload(filePath, file)

  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`)
  }

  // Create media record
  const { data: media, error: dbError } = await supabase
    .from('fa_audit_media')
    .insert({
      audit_instance_id: instanceId,
      question_id: questionId || null,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
    })
    .select()
    .single()

  if (dbError) {
    // Clean up uploaded file if DB insert fails
    await supabase.storage.from('fa-attachments').remove([filePath])
    throw new Error(`Failed to create media record: ${dbError.message}`)
  }

  revalidatePath('/audit-lab')
  return media
}

export async function completeAudit(instanceId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: instanceMeta, error: instanceMetaError } = await supabase
    .from('fa_audit_instances')
    .select(`
      id,
      store_id,
      conducted_at,
      created_at,
      fa_audit_templates ( category )
    `)
    .eq('id', instanceId)
    .single()

  if (instanceMetaError || !instanceMeta) {
    throw new Error(`Failed to load audit instance: ${instanceMetaError?.message || 'Instance not found'}`)
  }

  const templateCategory = ((instanceMeta as any).fa_audit_templates as { category?: string } | null)?.category
  const isFRA = templateCategory === 'fire_risk_assessment'

  const buildNoonUtcDate = (year: number, month1Based: number, day: number) =>
    new Date(Date.UTC(year, month1Based - 1, day, 12, 0, 0))

  const parseAuditDateString = (raw: unknown): Date | null => {
    if (typeof raw !== 'string') return null
    const value = raw.trim()
    if (!value) return null

    const dmy = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
    if (dmy) {
      const day = parseInt(dmy[1], 10)
      const month = parseInt(dmy[2], 10)
      let year = parseInt(dmy[3], 10)
      if (year < 100) year += 2000
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return buildNoonUtcDate(year, month, day)
      }
    }

    const monthMap: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    }
    const dMonY = value.match(/^(\d{1,2})\s+([a-z]{3,9})\w*\s+(\d{4})$/i)
    if (dMonY) {
      const day = parseInt(dMonY[1], 10)
      const month = monthMap[dMonY[2].toLowerCase().slice(0, 3)]
      const year = parseInt(dMonY[3], 10)
      if (month && day >= 1 && day <= 31) {
        return buildNoonUtcDate(year, month, day)
      }
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return buildNoonUtcDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate())
    }
    return null
  }

  const extractConductedDateFromPdfText = (pdfText: string): Date | null => {
    const patterns = [
      /(?:conducted on|conducted at|assessment date)[\s:]*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      /conducted[\s\S]{0,100}?(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      /(?:conducted on|conducted at|assessment date)[\s:]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    ]
    for (const pattern of patterns) {
      const match = pdfText.match(pattern)
      const parsed = parseAuditDateString(match?.[1])
      if (parsed) return parsed
    }
    return null
  }

  // Calculate overall score from yes/no answers (exclude N/A)
  const { data: responses } = await supabase
    .from('fa_audit_responses')
    .select(`
      response_value,
      response_json,
      fa_audit_template_questions (
        question_type,
        question_text
      )
    `)
    .eq('audit_instance_id', instanceId)

  let fraCompletedAt: Date | null = null
  if (isFRA && responses && responses.length > 0) {
    for (const response of responses as any[]) {
      const extractedDate = response?.response_json?.fra_extracted_data?.conductedDate
      const parsed = parseAuditDateString(extractedDate)
      if (parsed) {
        fraCompletedAt = parsed
        break
      }
    }

    if (!fraCompletedAt) {
      for (const response of responses as any[]) {
        const pdfText = response?.response_json?.fra_pdf_text
        if (typeof pdfText !== 'string' || !pdfText.trim()) continue
        const parsed = extractConductedDateFromPdfText(pdfText)
        if (parsed) {
          fraCompletedAt = parsed
          break
        }
      }
    }
  }

  if (isFRA && !fraCompletedAt) {
    fraCompletedAt =
      parseAuditDateString((instanceMeta as any).conducted_at)
      || parseAuditDateString((instanceMeta as any).created_at)
      || new Date()
  }

  let overallScore: number | null = null
  if (responses && responses.length > 0) {
    let total = 0
    let passed = 0

    responses.forEach((response: any) => {
      const question = response.fa_audit_template_questions
      if (!question || question.question_type !== 'yesno') return

      const rawAnswer = response.response_value || response.response_json?.value || response.response_json
      if (!rawAnswer) return
      const answer = String(rawAnswer).toLowerCase()
      if (answer === 'na' || answer === 'n/a') return

      const isEnforcement = question.question_text?.toLowerCase().includes('enforcement action')
      const isPass = isEnforcement ? answer === 'no' : answer === 'yes'

      total += 1
      if (isPass) passed += 1
    })

    if (total > 0) {
      overallScore = Math.round((passed / total) * 100)
    }
  }

  // Update instance
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('fa_audit_instances')
    .update({
      status: 'completed',
      overall_score: overallScore,
      conducted_at: isFRA ? (fraCompletedAt as Date).toISOString() : nowIso,
      updated_at: nowIso,
    })
    .eq('id', instanceId)

  if (error) {
    throw new Error(`Failed to complete audit: ${error.message}`)
  }

  if (isFRA && (instanceMeta as any).store_id) {
    const fraDate = (fraCompletedAt as Date).toISOString().slice(0, 10)
    const { error: storeDateError } = await supabase
      .from('fa_stores')
      .update({ fire_risk_assessment_date: fraDate })
      .eq('id', (instanceMeta as any).store_id)

    if (storeDateError) {
      console.error('Failed to update store fire_risk_assessment_date in completeAudit:', storeDateError)
    }
  }

  revalidatePath('/audit-lab')
  return { success: true, overall_score: overallScore }
}

export async function getAuditHistory(filters?: {
  templateId?: string
  storeId?: string
  status?: string | string[]
  dateFrom?: string
  dateTo?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  let query = supabase
    .from('fa_audit_instances')
    .select(`
      *,
      fa_audit_templates (
        id,
        title,
        category
      ),
      fa_stores (
        id,
        store_name,
        store_code,
        city
      )
    `)
    .order('created_at', { ascending: false })

  if (filters?.templateId) {
    query = query.eq('template_id', filters.templateId)
  }

  if (filters?.storeId) {
    query = query.eq('store_id', filters.storeId)
  }

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status)
    } else {
      query = query.eq('status', filters.status)
    }
  }

  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }

  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch audit history: ${error.message}`)
  }

  return data || []
}

export async function getAuditDashboardData() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data, error } = await supabase
    .from('fa_audit_instances')
    .select(`
      id,
      template_id,
      store_id,
      conducted_at,
      created_at,
      overall_score,
      status,
      fa_audit_templates (
        id,
        title,
        category
      ),
      fa_stores (
        id,
        store_name,
        store_code,
        city,
        region
      ),
      fa_audit_responses (
        id,
        response_value,
        response_json,
        question_id,
        fa_audit_template_questions (
          id,
          question_text,
          question_type,
          fa_audit_template_sections (
            id,
            title
          )
        )
      )
    `)
    .eq('status', 'completed')
    .order('conducted_at', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(`Failed to fetch dashboard data: ${error.message}`)
  }

  return data || []
}

export async function getAuditInstance(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: instance, error } = await supabase
    .from('fa_audit_instances')
    .select(`
      *,
      fa_audit_templates (
        id,
        title,
        category
      ),
      fa_stores (
        id,
        store_name,
        store_code,
        address_line_1,
        city,
        postcode,
        region,
        latitude,
        longitude
      )
    `)
    .eq('id', id)
    .single()

  if (error || !instance) {
    throw new Error('Audit instance not found')
  }

  // Get responses
  const { data: responses } = await supabase
    .from('fa_audit_responses')
    .select('*')
    .eq('audit_instance_id', id)

  // Get media
  const { data: media } = await supabase
    .from('fa_audit_media')
    .select('*')
    .eq('audit_instance_id', id)

  return {
    ...instance,
    responses: responses || [],
    media: media || [],
  }
}

export async function deleteAuditInstance(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check if user has permission (admin or owner)
  const { data: instance } = await supabase
    .from('fa_audit_instances')
    .select('conducted_by_user_id')
    .eq('id', id)
    .single()

  if (!instance) {
    throw new Error('Audit instance not found')
  }

  // Check if user is admin or owner
  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const isOwner = instance.conducted_by_user_id === user.id

  if (!isAdmin && !isOwner) {
    throw new Error('Unauthorized - You can only delete your own audits or be an admin')
  }

  // Delete the instance (cascade will handle responses and media)
  const { error } = await supabase
    .from('fa_audit_instances')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete audit instance: ${error.message}`)
  }

  revalidatePath('/audit-lab')
  return { success: true }
}

/**
 * Bulk delete multiple audit instances in one operation.
 * Intended for cleanup of old history records.
 * Only admins are allowed to perform bulk deletes.
 */
export async function bulkDeleteAuditInstances(ids: string[]) {
  if (!ids || ids.length === 0) {
    return { success: true, deleted: 0 }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  if (!isAdmin) {
    throw new Error('Unauthorized - Only admins can bulk delete audits')
  }

  const { error } = await supabase
    .from('fa_audit_instances')
    .delete()
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to bulk delete audit instances: ${error.message}`)
  }

  revalidatePath('/audit-lab')
  return { success: true, deleted: ids.length }
}

// ============================================
// SEED INITIAL TEMPLATES
// ============================================

export async function seedFootAsylumSafetyCultureTemplate() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    throw new Error('Profile not found')
  }

  // Check if template already exists
  const { data: existing } = await supabase
    .from('fa_audit_templates')
    .select('id')
    .eq('title', 'FootAsylum SafeHub')
    .eq('category', 'footasylum_audit')
    .single()

  if (existing) {
    return { success: false, message: 'FootAsylum SafeHub template already exists' }
  }

  const disclaimerText = `Health and Safety Assessment Terms and Conditions:
It is agreed that to enable a thorough inspection and assessment, the Assessor will be allowed open and free access to any sites and any areas within those sites covered by the contract.
It is the responsibility of the Customer to ensure that all relevant personnel are fully aware of the Assessors visit and that the Assessor or others working on behalf of the Assessing Company are not hindered in any way in the carrying out of their duties
The Assessor will use all best endeavours to advise the Customer as to the status, regulations and systems of work appropriate to the Customer's fire risk assessment so as to assist the Customer to fulfil their duties in accordance with such statutes, regulations, standards and such systems of work which may be applicable to the Customers specific industry.
The Assessment will be based on a sample of the working environment as identified at the time of the Assessors visit. It is possible that this sample may not be entirely representative of all aspects of the working environment.
Whilst the Assessor will use best endeavours to identify those matters which are considered unacceptable to current fire safety regulations and which have been observed during the inspection, KSS NW Ltd cannot be held responsible for non-compliance with relevant statutes, regulations and standards or systems of work or for failing to observe industry fire and safety working practices whether such non-compliance or failure is by the Customer, it's servants, agents, contractors or sub-contractors.
The Assessor should be notified of any visit or intended visit to be made to the premises by an Enforcement Authority or Insurance assessor prior to carrying out the assessment.
The Assessment will be based on a visual inspection or the working environment, no testing of the luminance levels or sounders, of the design or the HVAC system will be carried out.
If requirements or recommendations are made by an Enforcement Authority, Insurance Risk Assessor or KSS NW Ltd, it is recommended that Customer carry out these requirements or recommendations as soon as is reasonably practicable. Notification of completion of relevant parts should be made to KSS NW Ltd in writing.
The Assessor must be immediately notified at the time of the visit of any recommendation or requirements made by the Enforcement Authority or Insurance Risk Assessor. It is the Customer's responsibility to comply with such recommendations or requirements.
When hazards are identified which in the opinion of the Assessor requires the advice of a particular specialist, KSS NW Ltd will notify the Customer accordingly and will indicate where in its opinion such advice and service may be obtained. It shall be the Customer's decision whether or not to use the particular specialist. The cost of such specialist advice shall at all times remain the responsibility of the Customer.
KSS NW Ltd limits its liability for any loss, damage or injury (or consequential or indirect loss) arising form the performance of, or failure by, KSS NW Ltd to perform any of its duties (whether or not such loss damage or injury or consequential or indirect loss be due to the negligence of KSS NW Ltd, its servants or agents or to any other cause whatsoever) to that determined by our Insurance Policy.`

  const templateData = {
    title: 'FootAsylum SafeHub',
    description: 'Comprehensive safety culture audit template for FootAsylum stores. Includes disclaimer and all standard sections.',
    category: 'footasylum_audit' as const,
    sections: [
      {
        title: 'Disclaimer',
        order_index: 0,
        questions: [
          {
            question_text: disclaimerText,
            question_type: 'text',
            order_index: 0,
            is_required: false,
          }
        ]
      },
      {
        title: 'General Site Information',
        order_index: 1,
        questions: [
          {
            question_text: 'Number of floors (list ie Basement; Ground; 1st, 2nd in comments section)',
            question_type: 'multiple',
            order_index: 0,
            is_required: true,
            options: ['1', '2', '3', '4', 'other'],
          },
          {
            question_text: 'Square Footage or Square Meterage of site',
            question_type: 'number',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Number of Fire Exits',
            question_type: 'number',
            order_index: 2,
            is_required: true,
          },
          {
            question_text: 'Number of Staff employed at the site',
            question_type: 'number',
            order_index: 3,
            is_required: true,
          },
          {
            question_text: 'Maximum number of staff working on site at any one time',
            question_type: 'number',
            order_index: 4,
            is_required: true,
          },
          {
            question_text: 'Number of Young persons (under the age of 18 yrs) employed at the site',
            question_type: 'number',
            order_index: 5,
            is_required: false,
          },
          {
            question_text: 'Any know enforcement action in relation to H&S or Fire Safety in last 12 months',
            question_type: 'yesno',
            order_index: 6,
            is_required: false,
          }
        ]
      },
      {
        title: 'Health and Safety Policy',
        order_index: 2,
        questions: [
          {
            question_text: 'Is the Health and Safety Policy available on site?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Is the Health and Safety Policy Statement on display?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Has the Health and Policy Statement been signed in the last 12 months?',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          }
        ]
      },
      {
        title: 'Risk Assessments - are Company risk assessments available, implemented and reviewed as required for the following areas;',
        order_index: 3,
        questions: [
          {
            question_text: 'Slips, trips and falls?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Working at height?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Manual Handling?',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          },
          {
            question_text: 'Display stands and furniture?',
            question_type: 'yesno',
            order_index: 3,
            is_required: true,
          },
          {
            question_text: 'Customer violence?',
            question_type: 'yesno',
            order_index: 4,
            is_required: true,
          },
          {
            question_text: 'Opening boxes, wrapping and strapex?',
            question_type: 'yesno',
            order_index: 5,
            is_required: true,
          },
          {
            question_text: 'Use of escalators?',
            question_type: 'yesno',
            order_index: 6,
            is_required: true,
          },
          {
            question_text: 'Use of fan heaters?',
            question_type: 'yesno',
            order_index: 7,
            is_required: true,
          },
          {
            question_text: 'Student nights?',
            question_type: 'yesno',
            order_index: 8,
            is_required: true,
          },
          {
            question_text: 'Additional site specific where required? (Fire hazards in the window, falling mannequins)',
            question_type: 'yesno',
            order_index: 9,
            is_required: true,
          },
          {
            question_text: 'Young persons?',
            question_type: 'yesno',
            order_index: 10,
            is_required: true,
          },
          {
            question_text: 'Expectant mothers?',
            question_type: 'yesno',
            order_index: 11,
            is_required: true,
          },
          {
            question_text: 'Can management / employees demonstrate their knowledge and understanding (Choose one risk assessment)?',
            question_type: 'yesno',
            order_index: 12,
            is_required: true,
          }
        ]
      },
      {
        title: 'Training',
        order_index: 4,
        questions: [
          {
            question_text: 'H&S induction training onboarding up to date and at 100%?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'H&S toolbox refresher training completed in the last 12 months and records available for\nManual handling\nHousekeeping\nFire Safety\nStepladders',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          }
        ]
      },
      {
        title: 'Statutory Testing - has testing been completed as required and documentation available for the following areas (Facilities Dept can provide evidence)',
        order_index: 5,
        questions: [
          {
            question_text: 'PAT?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Fixed Electrical Wiring?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Air Conditioning?',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          },
          {
            question_text: 'Lift?',
            question_type: 'yesno',
            order_index: 3,
            is_required: false,
          },
          {
            question_text: 'Lifting equipment?',
            question_type: 'yesno',
            order_index: 4,
            is_required: false,
          },
          {
            question_text: 'Fire Alarm Maintenance?',
            question_type: 'yesno',
            order_index: 5,
            is_required: true,
          },
          {
            question_text: 'Emergency Lighting Maintenance?',
            question_type: 'yesno',
            order_index: 6,
            is_required: true,
          },
          {
            question_text: 'Sprinkler System?',
            question_type: 'yesno',
            order_index: 7,
            is_required: true,
          },
          {
            question_text: 'Escalators - Service and Maintenance?',
            question_type: 'yesno',
            order_index: 8,
            is_required: false,
          },
          {
            question_text: 'Fire Extinguisher Service?',
            question_type: 'yesno',
            order_index: 9,
            is_required: true,
          }
        ]
      },
      {
        title: 'Contractor & Visitor Safety',
        order_index: 6,
        questions: [
          {
            question_text: 'Are contractors managed whilst working on site? (sign in/out, permit to work)',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Is the visitors signing in / out book available and in use?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          }
        ]
      },
      {
        title: 'Manual Handling',
        order_index: 7,
        questions: [
          {
            question_text: 'Is manual handling being carried out safely and are good practices being followed and posters visible?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Are goods stored in a manner whereby safe manual handling can be followed?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Is there evidence of suitable delivery management?',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          }
        ]
      },
      {
        title: 'COSHH',
        order_index: 8,
        questions: [
          {
            question_text: 'Are only Company authorised chemicals being used?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Are chemicals stored correctly?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'COSHH data sheets available on site?',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          }
        ]
      },
      {
        title: 'Premises and Equipment',
        order_index: 9,
        questions: [
          {
            question_text: 'Is equipment in a good condition?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Are the premises in a good condition?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Are all floor surfaces in a good condition? (clean, no defects / damage noted)',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          },
          {
            question_text: 'Are slips, trips and falls being managed?',
            question_type: 'yesno',
            order_index: 3,
            is_required: true,
          },
          {
            question_text: 'A clean as you go policy is in place and evident?',
            question_type: 'yesno',
            order_index: 4,
            is_required: true,
          },
          {
            question_text: 'Is lighting in a good condition and working correctly and deemed to be suitable and sufficient?',
            question_type: 'yesno',
            order_index: 5,
            is_required: true,
          },
          {
            question_text: 'Appropriate cleaning equipment is available and used?',
            question_type: 'yesno',
            order_index: 6,
            is_required: true,
          },
          {
            question_text: 'Are adequate facilities provided to rest and eat meals?',
            question_type: 'yesno',
            order_index: 7,
            is_required: true,
          },
          {
            question_text: 'Are welfare facilities in a clean, hygienic condition with hot and cold running water available?',
            question_type: 'yesno',
            order_index: 8,
            is_required: true,
          },
          {
            question_text: 'If asbestos is present is it being managed?',
            question_type: 'yesno',
            order_index: 9,
            is_required: false,
          },
          {
            question_text: 'Customer areas found to be in good condition (shelving, benches, storage at height)?',
            question_type: 'yesno',
            order_index: 10,
            is_required: true,
          },
          {
            question_text: 'Goods in areas found to be in safe condition with no hazards found?',
            question_type: 'yesno',
            order_index: 11,
            is_required: true,
          },
          {
            question_text: 'Stock rooms (clothing and shoes) found to be in a safe condition with no hazards found?',
            question_type: 'yesno',
            order_index: 12,
            is_required: true,
          },
          {
            question_text: 'Are fixtures and fittings throughout the site in a safe condition?',
            question_type: 'yesno',
            order_index: 13,
            is_required: true,
          },
          {
            question_text: 'Types of racking used in the stock rooms',
            question_type: 'multiple',
            order_index: 14,
            is_required: false,
            options: ['Metal', 'Wood', 'Mixture of metal and wood'],
          }
        ]
      },
      {
        title: 'Working at Height',
        order_index: 10,
        questions: [
          {
            question_text: 'Working at height / use of ladders and other work at height equipment managed?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Are all ladders clearly numbered for identification purposes?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Ladder checks completed and recorded on weekly H&S checks?',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          }
        ]
      },
      {
        title: 'First Aid',
        order_index: 11,
        questions: [
          {
            question_text: 'Adequate number of first aid boxes, appropriately stocked and employees are aware of their location?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Appropriate first aid assistance available if required and management team / employees aware of their responsibilities in the event of an injury / incident in store?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          }
        ]
      },
      {
        title: 'Accident Reporting and Investigation',
        order_index: 12,
        questions: [
          {
            question_text: 'Accident book available on site and employees aware of the procedure to follow in the event of an accident?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Date of last in store accident',
            question_type: 'date',
            order_index: 1,
            is_required: false,
          },
          {
            question_text: 'Accident investigations have been completed in store and documentation available. Corrective action has been taken where applicable?',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          }
        ]
      },
      {
        title: 'Fire Safety',
        order_index: 13,
        questions: [
          {
            question_text: 'FRA available - actions completed and signed?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Combustible materials are stored correctly?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Fire doors closed and not held open?',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          },
          {
            question_text: 'Fire doors in a good condition?',
            question_type: 'yesno',
            order_index: 3,
            is_required: true,
          },
          {
            question_text: 'Are fire door intumescent strips in place and intact, to ensure the door retains its fire resisting properties and holds back the blaze to enable persons to escape?',
            question_type: 'yesno',
            order_index: 4,
            is_required: true,
          },
          {
            question_text: 'Structure found to be in a good condition with no evidence of damage which would compromise fire safety - EG Missing ceiling tiles / gaps from area to area?',
            question_type: 'yesno',
            order_index: 5,
            is_required: true,
          },
          {
            question_text: 'Fire exit routes clear and unobstructed?',
            question_type: 'yesno',
            order_index: 6,
            is_required: true,
          },
          {
            question_text: 'Are all Fire Extinguishers clear and easily accessible',
            question_type: 'yesno',
            order_index: 7,
            is_required: true,
          },
          {
            question_text: 'Are all call points clear and easily accessible',
            question_type: 'yesno',
            order_index: 8,
            is_required: true,
          },
          {
            question_text: 'Weekly Fire Tests carried out and documented?',
            question_type: 'yesno',
            order_index: 9,
            is_required: true,
          },
          {
            question_text: 'Fire drill has been carried out in the past 6 months and records available on site?',
            question_type: 'yesno',
            order_index: 10,
            is_required: true,
          },
          {
            question_text: 'Evidence of Monthly Emergency Lighting test being conducted?',
            question_type: 'yesno',
            order_index: 11,
            is_required: true,
          },
          {
            question_text: 'Is there a 50mm clearance from stock to sprinkler head on clearance?',
            question_type: 'yesno',
            order_index: 12,
            is_required: true,
          },
          {
            question_text: 'Are plugs and Extension leads managed and not overloaded.',
            question_type: 'yesno',
            order_index: 13,
            is_required: true,
          },
          {
            question_text: 'Location of Fire Panel',
            question_type: 'text',
            order_index: 14,
            is_required: false,
          },
          {
            question_text: 'Is panel free of faults',
            question_type: 'yesno',
            order_index: 15,
            is_required: true,
          },
          {
            question_text: 'Location of Emergency Lighting Test Switch (Photograph)',
            question_type: 'text',
            order_index: 16,
            is_required: false,
          }
        ]
      },
      {
        title: 'Store Compliance',
        order_index: 14,
        questions: [
          {
            question_text: 'Evidence of weekly health and safety checks being conducted?',
            question_type: 'yesno',
            order_index: 0,
            is_required: true,
          },
          {
            question_text: 'Evidence of wet floor signs availability and being used?',
            question_type: 'yesno',
            order_index: 1,
            is_required: true,
          },
          {
            question_text: 'Is the site clear of any other significant risks',
            question_type: 'yesno',
            order_index: 2,
            is_required: true,
          },
          {
            question_text: 'Has the water system been flushed and Legionella compliant.',
            question_type: 'yesno',
            order_index: 3,
            is_required: true,
          }
        ]
      },
      {
        title: 'Action Plan Sign Off',
        order_index: 15,
        questions: [
          {
            question_text: 'Due Date to Resolve/Complete the action point',
            question_type: 'date',
            order_index: 0,
            is_required: false,
          },
          {
            question_text: 'Any other comments or findings to note:',
            question_type: 'text',
            order_index: 1,
            is_required: false,
          },
          {
            question_text: 'Sign off and acceptance to complete Action Plan by Due Dates',
            question_type: 'text',
            order_index: 2,
            is_required: false,
          },
          {
            question_text: 'Store Manager Name',
            question_type: 'text',
            order_index: 3,
            is_required: false,
          },
          {
            question_text: 'Signature of Person in Charge of store at time of assessment.',
            question_type: 'signature',
            order_index: 4,
            is_required: true,
          },
          {
            question_text: 'Auditor Name',
            question_type: 'text',
            order_index: 5,
            is_required: false,
          },
          {
            question_text: 'Auditor Signature',
            question_type: 'signature',
            order_index: 6,
            is_required: true,
          }
        ]
      }
    ]
  }

  try {
    const template = await createTemplate(templateData)
    return { success: true, template_id: template.id, message: 'Template created successfully' }
  } catch (error: any) {
    return { success: false, message: `Failed to create template: ${error.message}` }
  }
}
