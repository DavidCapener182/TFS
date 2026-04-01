import { format } from 'date-fns'

export type InboundEmailProcessingStatus = 'pending' | 'reviewed' | 'ignored' | 'error'
export type InboundEmailAnalysisSource = 'rule' | 'ai'

export type InboundEmailRow = {
  id: string
  outlook_message_id: string
  mailbox_name: string | null
  folder_name: string | null
  subject: string | null
  sender_name: string | null
  sender_email: string | null
  received_at: string | null
  has_attachments: boolean
  body_preview: string | null
  body_text: string | null
  body_html: string | null
  raw_payload: unknown
  matched_store_id: string | null
  processing_status: InboundEmailProcessingStatus
  last_error: string | null
  created_at: string
  analysis_source?: InboundEmailAnalysisSource | null
  analysis_template_key?: string | null
  analysis_summary?: string | null
  analysis_confidence?: number | null
  analysis_needs_action?: boolean
  analysis_needs_visit?: boolean
  analysis_needs_incident?: boolean
  analysis_payload?: unknown
  analysis_last_ran_at?: string | null
  analysis_error?: string | null
}

export type InboundEmailStoreRow = {
  id: string
  store_code: string | null
  store_name: string
}

export type InboundEmailWorkflowState = 'pending' | 'parsed' | 'reviewed' | 'ignored' | 'error'

export function formatInboundEmailDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, 'dd MMM yyyy, HH:mm')
}

export function getInboundEmailStatusClass(status: InboundEmailProcessingStatus) {
  switch (status) {
    case 'reviewed':
      return 'bg-emerald-50 text-emerald-700'
    case 'ignored':
      return 'bg-slate-100 text-slate-700'
    case 'error':
      return 'bg-red-50 text-red-700'
    default:
      return 'bg-amber-50 text-amber-700'
  }
}

export function getInboundEmailWorkflowState(
  email: Pick<InboundEmailRow, 'processing_status' | 'analysis_last_ran_at'>
): InboundEmailWorkflowState {
  if (email.processing_status === 'ignored') return 'ignored'
  if (email.processing_status === 'error') return 'error'
  if (email.processing_status === 'reviewed') return 'reviewed'
  if (email.analysis_last_ran_at) return 'parsed'
  return 'pending'
}

export function getInboundEmailWorkflowLabel(
  email: Pick<InboundEmailRow, 'processing_status' | 'analysis_last_ran_at'>
): string {
  const state = getInboundEmailWorkflowState(email)
  switch (state) {
    case 'parsed':
      return 'parsed'
    case 'reviewed':
      return 'reviewed'
    case 'ignored':
      return 'ignored'
    case 'error':
      return 'error'
    default:
      return 'pending'
  }
}

export function getInboundEmailWorkflowClass(
  email: Pick<InboundEmailRow, 'processing_status' | 'analysis_last_ran_at'>
): string {
  const state = getInboundEmailWorkflowState(email)
  switch (state) {
    case 'parsed':
      return 'bg-sky-50 text-sky-700'
    case 'reviewed':
      return 'bg-emerald-50 text-emerald-700'
    case 'ignored':
      return 'bg-slate-100 text-slate-700'
    case 'error':
      return 'bg-red-50 text-red-700'
    default:
      return 'bg-amber-50 text-amber-700'
  }
}

export function getInboundEmailRawPayloadObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function getInboundEmailAnalysisPayloadObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function getInboundEmailAttachmentCount(email: Pick<InboundEmailRow, 'has_attachments' | 'raw_payload'>) {
  const payload = getInboundEmailRawPayloadObject(email.raw_payload)
  const attachments = payload?.attachments
  if (Array.isArray(attachments)) return attachments.length
  return email.has_attachments ? 1 : 0
}

export function getInboundEmailPayloadString(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

export function isInboundEmailSeed(email: Pick<InboundEmailRow, 'raw_payload'>) {
  const payload = getInboundEmailRawPayloadObject(email.raw_payload)
  return payload?.test_seed === true
}

export function getInboundEmailTemplateLabel(templateKey: string | null | undefined) {
  switch (String(templateKey || '').trim()) {
    case 'store_theft':
      return 'Store theft'
    case 'stocktake_result':
      return 'Stocktake result'
    case 'weekly_stock_count_results':
      return 'Weekly stock count'
    case 'tester_order_tracker':
      return 'Tester order tracker'
    case 'unknown':
      return 'Unknown format'
    default:
      return null
  }
}
