'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { analyzeInboundEmail } from '@/lib/inbound-email-parser'
import type { InboundEmailRow } from '@/lib/inbound-emails'
import { createStoreActions } from '@/app/actions/store-actions'
import type { FaActionPriority } from '@/types/db'

type SupabaseClient = ReturnType<typeof createClient>

async function getWritableContext() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  return { supabase, userId: user.id }
}

async function getInboundEmailById(supabase: SupabaseClient, emailId: string) {
  const { data, error } = await supabase
    .from('tfs_inbound_emails')
    .select('*')
    .eq('id', emailId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Inbound email not found')
  }

  return data as InboundEmailRow
}

async function resolveMatchedStoreId(
  supabase: SupabaseClient,
  analysis: Awaited<ReturnType<typeof analyzeInboundEmail>>,
): Promise<string | null> {
  const directCode = analysis.primaryStore?.storeCode || null
  if (directCode) {
    const { data } = await supabase
      .from('tfs_stores')
      .select('id')
      .eq('store_code', directCode)
      .limit(1)

    if (data?.[0]?.id) return String(data[0].id)
  }

  const directName = analysis.primaryStore?.storeName || null
  if (directName) {
    const { data } = await supabase
      .from('tfs_stores')
      .select('id, store_name')
      .ilike('store_name', `%${directName}%`)
      .limit(2)

    if ((data || []).length === 1 && data?.[0]?.id) {
      return String(data[0].id)
    }
  }

  if (analysis.mentionedStores.length === 1 && analysis.mentionedStores[0]?.storeCode) {
    const { data } = await supabase
      .from('tfs_stores')
      .select('id')
      .eq('store_code', analysis.mentionedStores[0].storeCode)
      .limit(1)

    if (data?.[0]?.id) return String(data[0].id)
  }

  return null
}

function buildAnalysisPayload(analysis: Awaited<ReturnType<typeof analyzeInboundEmail>>) {
  return {
    templateKey: analysis.templateKey,
    reasoning: analysis.reasoning,
    extractedFields: analysis.extractedFields,
    suggestedNextSteps: analysis.suggestedNextSteps,
    primaryStore: analysis.primaryStore,
    mentionedStores: analysis.mentionedStores,
  }
}

async function persistInboundEmailAnalysis(supabase: SupabaseClient, email: InboundEmailRow) {
  const analysis = await analyzeInboundEmail(email)
  const resolvedStoreId = email.matched_store_id || await resolveMatchedStoreId(supabase, analysis)
  const payload = buildAnalysisPayload(analysis)

  const { error } = await supabase
    .from('tfs_inbound_emails')
    .update({
      matched_store_id: resolvedStoreId,
      analysis_source: analysis.source,
      analysis_template_key: analysis.templateKey,
      analysis_summary: analysis.summary,
      analysis_confidence: Number(analysis.confidence.toFixed(2)),
      analysis_needs_action: analysis.needsAction,
      analysis_needs_visit: analysis.needsVisit,
      analysis_needs_incident: analysis.needsIncident,
      analysis_payload: payload,
      analysis_last_ran_at: new Date().toISOString(),
      analysis_error: null,
    })
    .eq('id', email.id)

  if (error) {
    throw new Error(error.message)
  }

  return {
    ...analysis,
    matchedStoreId: resolvedStoreId,
  }
}

function revalidateInboundEmailPaths(storeIds: string[]) {
  revalidatePath('/inbound-emails')
  revalidatePath('/stores')
  for (const storeId of storeIds) {
    revalidatePath(`/stores/${storeId}`)
  }
}

async function updateInboundEmailStatusInternal(params: {
  supabase: SupabaseClient
  emailId: string
  processingStatus: 'reviewed' | 'ignored' | 'error'
  lastError?: string | null
}) {
  const { supabase, emailId, processingStatus, lastError } = params
  const email = await getInboundEmailById(supabase, emailId)

  const updatePayload: Record<string, unknown> = {
    processing_status: processingStatus,
  }

  if (processingStatus === 'error') {
    updatePayload.last_error = String(lastError || '').trim() || 'Flagged for manual review.'
  } else if (lastError !== undefined) {
    updatePayload.last_error = lastError
  } else {
    updatePayload.last_error = null
  }

  const { error } = await supabase
    .from('tfs_inbound_emails')
    .update(updatePayload)
    .eq('id', emailId)

  if (error) {
    throw new Error(error.message)
  }

  revalidateInboundEmailPaths(email.matched_store_id ? [email.matched_store_id] : [])

  return {
    emailId,
    processingStatus,
  }
}

export async function runInboundEmailAnalysis(emailId: string) {
  const normalizedEmailId = String(emailId || '').trim()
  if (!normalizedEmailId) {
    throw new Error('Email id is required')
  }

  const { supabase } = await getWritableContext()
  const email = await getInboundEmailById(supabase, normalizedEmailId)

  try {
    const result = await persistInboundEmailAnalysis(supabase, email)
    revalidateInboundEmailPaths(result.matchedStoreId ? [result.matchedStoreId] : [])

    return {
      templateKey: result.templateKey,
      source: result.source,
      summary: result.summary,
      matchedStoreId: result.matchedStoreId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to analyse inbound email'
    await supabase
      .from('tfs_inbound_emails')
      .update({
        analysis_last_ran_at: new Date().toISOString(),
        analysis_error: message,
      })
      .eq('id', normalizedEmailId)
    revalidateInboundEmailPaths(email.matched_store_id ? [email.matched_store_id] : [])
    throw error
  }
}

export async function runPendingInboundEmailAnalysis(limit = 25) {
  const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 25
  const { supabase } = await getWritableContext()

  const { data, error } = await supabase
    .from('tfs_inbound_emails')
    .select('*')
    .eq('processing_status', 'pending')
    .is('analysis_last_ran_at', null)
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(parsedLimit)

  if (error) {
    throw new Error(error.message)
  }

  const emails = (data || []) as InboundEmailRow[]
  const revalidateStoreIds = new Set<string>()

  for (const email of emails) {
    try {
      const result = await persistInboundEmailAnalysis(supabase, email)
      if (result.matchedStoreId) revalidateStoreIds.add(result.matchedStoreId)
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Failed to analyse inbound email'
      await supabase
        .from('tfs_inbound_emails')
        .update({
          analysis_last_ran_at: new Date().toISOString(),
          analysis_error: message,
        })
        .eq('id', email.id)
      if (email.matched_store_id) revalidateStoreIds.add(email.matched_store_id)
    }
  }

  revalidateInboundEmailPaths(Array.from(revalidateStoreIds))

  return {
    processed: emails.length,
    revalidatedStores: revalidateStoreIds.size,
  }
}

export async function markInboundEmailReviewed(emailId: string) {
  const normalizedEmailId = String(emailId || '').trim()
  if (!normalizedEmailId) throw new Error('Email id is required')
  const { supabase } = await getWritableContext()
  return updateInboundEmailStatusInternal({
    supabase,
    emailId: normalizedEmailId,
    processingStatus: 'reviewed',
    lastError: null,
  })
}

export async function ignoreInboundEmail(emailId: string) {
  const normalizedEmailId = String(emailId || '').trim()
  if (!normalizedEmailId) throw new Error('Email id is required')
  const { supabase } = await getWritableContext()
  return updateInboundEmailStatusInternal({
    supabase,
    emailId: normalizedEmailId,
    processingStatus: 'ignored',
    lastError: null,
  })
}

export async function flagInboundEmailError(emailId: string, message?: string | null) {
  const normalizedEmailId = String(emailId || '').trim()
  if (!normalizedEmailId) throw new Error('Email id is required')
  const { supabase } = await getWritableContext()
  return updateInboundEmailStatusInternal({
    supabase,
    emailId: normalizedEmailId,
    processingStatus: 'error',
    lastError: message ?? 'Flagged for manual review.',
  })
}

export async function acceptInboundEmailActionSuggestion(input: {
  emailId: string
  storeId: string
  title: string
  description?: string
  sourceFlaggedItem?: string
  priority?: FaActionPriority
  dueDate?: string
}) {
  const normalizedEmailId = String(input.emailId || '').trim()
  const normalizedStoreId = String(input.storeId || '').trim()
  const normalizedTitle = String(input.title || '').trim()

  if (!normalizedEmailId) throw new Error('Email id is required')
  if (!normalizedStoreId) throw new Error('Store id is required')
  if (!normalizedTitle) throw new Error('Action title is required')

  await createStoreActions(normalizedStoreId, [
    {
      title: normalizedTitle,
      description: String(input.description || '').trim() || undefined,
      sourceFlaggedItem: String(input.sourceFlaggedItem || '').trim() || undefined,
      priority: input.priority || 'medium',
      dueDate: String(input.dueDate || '').trim() || undefined,
      aiGenerated: true,
      nonCanonicalConfirmed: true,
    },
  ])

  const { supabase } = await getWritableContext()
  await updateInboundEmailStatusInternal({
    supabase,
    emailId: normalizedEmailId,
    processingStatus: 'reviewed',
    lastError: null,
  })

  return { success: true }
}

export async function acceptInboundEmailVisitSuggestion(input: {
  emailId: string
  storeId: string
  assignedManagerUserId?: string | null
  plannedDate: string
  plannedPurpose?: string | null
  plannedPurposeNote?: string | null
}) {
  const normalizedEmailId = String(input.emailId || '').trim()
  const normalizedStoreId = String(input.storeId || '').trim()
  const normalizedPlannedDate = String(input.plannedDate || '').trim()

  if (!normalizedEmailId) throw new Error('Email id is required')
  if (!normalizedStoreId) throw new Error('Store id is required')
  if (!normalizedPlannedDate) throw new Error('Planned visit date is required')

  const { supabase } = await getWritableContext()

  const { error } = await supabase
    .from('tfs_stores')
    .update({
      compliance_audit_2_assigned_manager_user_id: input.assignedManagerUserId || null,
      compliance_audit_2_planned_date: normalizedPlannedDate,
      compliance_audit_2_planned_purpose: String(input.plannedPurpose || '').trim() || 'general_follow_up',
      compliance_audit_2_planned_note: String(input.plannedPurposeNote || '').trim() || null,
    })
    .eq('id', normalizedStoreId)

  if (error) {
    throw new Error(error.message)
  }

  await updateInboundEmailStatusInternal({
    supabase,
    emailId: normalizedEmailId,
    processingStatus: 'reviewed',
    lastError: null,
  })

  revalidatePath('/visit-tracker')
  revalidatePath('/calendar')
  revalidatePath('/dashboard')

  return { success: true }
}
