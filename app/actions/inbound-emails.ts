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
  const isStocktakeResult = analysis.templateKey === 'stocktake_result'

  const { error } = await supabase
    .from('tfs_inbound_emails')
    .update({
      matched_store_id: resolvedStoreId,
      processing_status: isStocktakeResult ? 'reviewed' : email.processing_status,
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
  let flaggedFollowUpCount = 0

  for (const email of emails) {
    try {
      const result = await persistInboundEmailAnalysis(supabase, email)
      if (result.matchedStoreId) revalidateStoreIds.add(result.matchedStoreId)
      if (result.needsAction || result.needsVisit || result.needsIncident) {
        flaggedFollowUpCount += 1
      }
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
    flaggedFollowUpCount,
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

function extractHeaderValue(raw: string, headerName: string): string | null {
  const regex = new RegExp(`^${headerName}:\\s*(.+)$`, 'im')
  const match = raw.match(regex)
  const value = match?.[1]?.trim()
  return value ? value : null
}

function parseFromHeader(fromHeader: string | null): { senderName: string | null; senderEmail: string | null } {
  if (!fromHeader) return { senderName: null, senderEmail: null }
  const emailMatch = fromHeader.match(/<([^>]+)>/)
  if (emailMatch?.[1]) {
    const senderEmail = emailMatch[1].trim().toLowerCase()
    const senderName = fromHeader.replace(emailMatch[0], '').replace(/"/g, '').trim() || null
    return { senderName, senderEmail }
  }

  const plainEmail = fromHeader.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || null
  if (!plainEmail) return { senderName: fromHeader.trim() || null, senderEmail: null }

  const senderName = fromHeader.replace(plainEmail, '').replace(/[()"]/g, '').trim() || null
  return { senderName, senderEmail: plainEmail }
}

function parseReceivedAt(headerValue: string | null): string | null {
  if (!headerValue) return null
  const parsed = new Date(headerValue)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function extractBodyFromRawPaste(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n')
  const splitAtDoubleNewline = normalized.split('\n\n')
  if (splitAtDoubleNewline.length <= 1) return normalized.trim()
  return splitAtDoubleNewline.slice(1).join('\n\n').trim()
}

function buildBodyPreview(bodyText: string): string {
  const collapsed = bodyText.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  if (collapsed.length <= 280) return collapsed
  return `${collapsed.slice(0, 277)}...`
}

function inferStoreCodeHint(input: { subject: string | null; bodyText: string; rawPayload: Record<string, unknown> }): string | null {
  const payloadCode = String(input.rawPayload.store_code_hint || '').trim()
  if (/^\d{3}$/.test(payloadCode)) return payloadCode

  const subjectCode = (input.subject || '').match(/\b(\d{3})\b/)?.[1] || null
  if (subjectCode) return subjectCode

  const bodyCode = input.bodyText.match(/\b(\d{3})\b/)?.[1] || null
  if (bodyCode) return bodyCode

  return null
}

function buildManualOutlookMessageId(subject: string | null): string {
  const safeSubject = String(subject || 'email')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'email'
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  return `manual-${new Date().toISOString().slice(0, 10)}-${safeSubject}-${randomSuffix}`
}

export async function createInboundEmailFromPaste(input: {
  mailboxName?: string
  folderName?: string
  pastedEmail: string
  subject?: string
  senderName?: string
  senderEmail?: string
  receivedAt?: string
  hasAttachments?: boolean
  rawPayloadJson?: string
}) {
  const { supabase } = await getWritableContext()

  const pastedEmail = String(input.pastedEmail || '').trim()
  if (!pastedEmail) {
    throw new Error('Paste the email content first.')
  }

  const headerSubject = extractHeaderValue(pastedEmail, 'Subject')
  const headerFrom = extractHeaderValue(pastedEmail, 'From')
  const headerDate = extractHeaderValue(pastedEmail, 'Date') || extractHeaderValue(pastedEmail, 'Sent')
  const parsedFrom = parseFromHeader(headerFrom)

  const subject = String(input.subject || headerSubject || '').trim() || '(No subject)'
  const senderName = String(input.senderName || parsedFrom.senderName || '').trim() || null
  const senderEmail = String(input.senderEmail || parsedFrom.senderEmail || '').trim().toLowerCase() || null
  const parsedInputDate = parseReceivedAt(String(input.receivedAt || '').trim())
  const receivedAt = parsedInputDate || parseReceivedAt(headerDate) || new Date().toISOString()
  const bodyText = extractBodyFromRawPaste(pastedEmail)
  const bodyPreview = buildBodyPreview(bodyText)

  let rawPayload: Record<string, unknown> = {
    import_source: 'manual_paste',
    pasted_at: new Date().toISOString(),
  }
  const rawPayloadInput = String(input.rawPayloadJson || '').trim()
  if (rawPayloadInput) {
    try {
      const parsed = JSON.parse(rawPayloadInput)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        rawPayload = { ...rawPayload, ...(parsed as Record<string, unknown>) }
      } else {
        throw new Error('Raw payload JSON must be an object.')
      }
    } catch (error) {
      throw new Error(`Raw payload JSON is invalid: ${error instanceof Error ? error.message : 'Unknown parse error'}`)
    }
  }

  const storeCodeHint = inferStoreCodeHint({ subject, bodyText, rawPayload })
  let matchedStoreId: string | null = null
  if (storeCodeHint) {
    const { data: matchedStore } = await supabase
      .from('tfs_stores')
      .select('id')
      .eq('store_code', storeCodeHint)
      .limit(1)
    matchedStoreId = matchedStore?.[0]?.id ? String(matchedStore[0].id) : null
    rawPayload = {
      ...rawPayload,
      store_code_hint: storeCodeHint,
    }
  }

  const outlookMessageId = buildManualOutlookMessageId(subject)
  const mailboxName = String(input.mailboxName || 'TFS Shared Mailbox').trim() || 'TFS Shared Mailbox'
  const folderName = String(input.folderName || 'Stock Control Inbox').trim() || 'Stock Control Inbox'

  const { data, error } = await supabase
    .from('tfs_inbound_emails')
    .insert({
      source: 'outlook',
      outlook_message_id: outlookMessageId,
      mailbox_name: mailboxName,
      folder_name: folderName,
      subject,
      sender_name: senderName,
      sender_email: senderEmail,
      received_at: receivedAt,
      has_attachments: Boolean(input.hasAttachments),
      body_preview: bodyPreview || null,
      body_text: bodyText || null,
      body_html: null,
      raw_payload: rawPayload,
      matched_store_id: matchedStoreId,
      processing_status: 'pending',
      last_error: null,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const insertedEmail = data as InboundEmailRow
  const analysisResult = await persistInboundEmailAnalysis(supabase, insertedEmail)

  revalidatePath('/inbound-emails')
  revalidatePath('/visit-tracker')
  revalidatePath('/dashboard')
  if (analysisResult.matchedStoreId) {
    revalidatePath(`/stores/${analysisResult.matchedStoreId}`)
  }

  return {
    id: String(insertedEmail.id),
    subject: String(insertedEmail.subject || subject),
    templateKey: analysisResult.templateKey,
    needsReview: analysisResult.needsAction || analysisResult.needsVisit || analysisResult.needsIncident,
  }
}
