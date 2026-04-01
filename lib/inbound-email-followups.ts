import { addDays, format } from 'date-fns'

import type { FaActionPriority } from '@/types/db'
import type { InboundEmailRow } from '@/lib/inbound-emails'
import { getInboundEmailAnalysisPayloadObject } from '@/lib/inbound-emails'

export type InboundEmailActionSuggestion = {
  title: string
  description: string
  priority: FaActionPriority
  dueDate: string
  sourceFlaggedItem: string
}

export type InboundEmailVisitSuggestion = {
  plannedDate: string
  plannedPurpose: string
  plannedPurposeNote: string
}

function getSuggestedNextSteps(email: InboundEmailRow): string[] {
  const payload = getInboundEmailAnalysisPayloadObject(email.analysis_payload)
  const steps = payload?.suggestedNextSteps
  if (!Array.isArray(steps)) return []
  return steps.filter((step): step is string => typeof step === 'string' && step.trim().length > 0)
}

function buildContextLine(email: InboundEmailRow) {
  const dateLabel = email.received_at ? format(new Date(email.received_at), 'dd MMM yyyy HH:mm') : 'unknown date'
  const senderLabel = email.sender_name || email.sender_email || 'Unknown sender'
  return `Inbound email received ${dateLabel} from ${senderLabel}.`
}

export function getInboundEmailActionSuggestion(email: InboundEmailRow): InboundEmailActionSuggestion | null {
  if (!email.analysis_needs_action) return null

  const summary = String(email.analysis_summary || email.body_preview || 'Review inbound email follow-up.').trim()
  const nextSteps = getSuggestedNextSteps(email)
  const templateKey = String(email.analysis_template_key || '').trim()

  let title = 'Review inbound email follow-up'
  let priority: FaActionPriority = 'medium'

  switch (templateKey) {
    case 'store_theft':
      title = 'Review reported theft and confirm follow-up'
      priority = email.analysis_needs_incident ? 'high' : 'medium'
      break
    case 'weekly_stock_count_results':
      title = 'Review weekly stock count concern email'
      priority = email.analysis_needs_visit ? 'high' : 'medium'
      break
    case 'tester_order_tracker':
      title = 'Review tester order tracker concern'
      priority = 'medium'
      break
    case 'stocktake_result':
      title = 'Review stocktake result follow-up'
      priority = email.analysis_needs_visit ? 'high' : 'medium'
      break
  }

  const descriptionLines = [
    summary,
    buildContextLine(email),
    nextSteps.length > 0 ? `Suggested next steps: ${nextSteps.join(' | ')}` : null,
  ].filter(Boolean)

  return {
    title,
    description: descriptionLines.join('\n\n'),
    priority,
    dueDate: format(addDays(new Date(), priority === 'high' ? 7 : 14), 'yyyy-MM-dd'),
    sourceFlaggedItem: email.subject || 'Inbound email',
  }
}

export function getInboundEmailVisitSuggestion(email: InboundEmailRow): InboundEmailVisitSuggestion | null {
  if (!email.analysis_needs_visit) return null

  const summary = String(email.analysis_summary || email.body_preview || 'Inbound email suggested a store visit.').trim()
  const nextSteps = getSuggestedNextSteps(email)

  return {
    plannedDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    plannedPurpose: 'general_follow_up',
    plannedPurposeNote: [summary, nextSteps.length > 0 ? `Suggested next steps: ${nextSteps.join(' | ')}` : null]
      .filter(Boolean)
      .join('\n\n'),
  }
}
