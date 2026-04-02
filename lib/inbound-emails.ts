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

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const normalized = value.replace(/[£,\s]/g, '').trim()
  if (!normalized) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

type ParsedInboundTheftLineItem = {
  quantity: number | null
  stockId: string | null
  description: string | null
  valueGbp: number | null
  catalogProductTitle: string | null
  catalogLineValueGbp: number | null
}

function normalizeInboundTheftLineItem(value: unknown): ParsedInboundTheftLineItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const item = value as Record<string, unknown>
  const quantity = toFiniteNumber(item.quantity)
  const stockId = toText(item.stockId)
  const description = toText(item.description)
  const valueGbp = toFiniteNumber(item.valueGbp)
  const catalogProductTitle = toText(item.catalogProductTitle)
  const catalogLineValueGbp = toFiniteNumber(item.catalogLineValueGbp)

  if (
    quantity === null &&
    !stockId &&
    !description &&
    valueGbp === null &&
    !catalogProductTitle &&
    catalogLineValueGbp === null
  ) {
    return null
  }

  return {
    quantity: quantity === null ? null : Math.round(quantity),
    stockId: stockId || null,
    description: description || null,
    valueGbp,
    catalogProductTitle: catalogProductTitle || null,
    catalogLineValueGbp,
  }
}

function getInboundEmailExtractedFields(email: Pick<InboundEmailRow, 'analysis_payload'>) {
  const payload = getInboundEmailAnalysisPayloadObject(email.analysis_payload)
  const extractedFields = payload?.extractedFields

  if (!extractedFields || typeof extractedFields !== 'object' || Array.isArray(extractedFields)) {
    return null
  }

  return extractedFields as Record<string, unknown>
}

function isGenericInboundTheftDescription(value: string | null | undefined) {
  const normalized = String(value || '').trim()
  if (!normalized) return true

  return (
    /^(stock\s*(?:id|code)?|sku)\b/i.test(normalized) ||
    /\b(?:crime|police|incident)\s+reference\b/i.test(normalized)
  )
}

function getInboundEmailTheftLineItems(email: Pick<InboundEmailRow, 'analysis_payload'>) {
  const extractedFields = getInboundEmailExtractedFields(email)
  const rawLineItems = Array.isArray(extractedFields?.lineItems) ? extractedFields.lineItems : []

  return rawLineItems
    .map(normalizeInboundTheftLineItem)
    .filter((item): item is ParsedInboundTheftLineItem => item !== null)
}

function getInboundEmailTheftLineDescription(item: ParsedInboundTheftLineItem) {
  const normalizedDescription = toText(item.description)
  if (normalizedDescription && !isGenericInboundTheftDescription(normalizedDescription)) {
    return normalizedDescription
  }

  return toText(item.catalogProductTitle) || 'Unknown'
}

function formatInboundEmailTheftLineItem(item: ParsedInboundTheftLineItem) {
  const quantity = item.quantity && item.quantity > 0 ? `${item.quantity} x ` : ''
  const description = getInboundEmailTheftLineDescription(item)
  const stockId = item.stockId ? ` (Stock ID ${item.stockId})` : ''
  const value = typeof item.catalogLineValueGbp === 'number'
    ? ` - Website value ${formatCurrency(item.catalogLineValueGbp)}`
    : typeof item.valueGbp === 'number'
      ? ` - Reported value ${formatCurrency(item.valueGbp)}`
      : ''

  return `${quantity}${description}${stockId}${value}`
}

function getInboundEmailTheftTotalValue(email: Pick<InboundEmailRow, 'analysis_payload'>, lineItems: ParsedInboundTheftLineItem[]) {
  const extractedFields = getInboundEmailExtractedFields(email)
  const explicitTotal =
    toFiniteNumber(extractedFields?.catalogTotalValueGbp) ??
    toFiniteNumber(extractedFields?.reportedTotalValueGbp) ??
    toFiniteNumber(extractedFields?.totalValueGbp) ??
    toFiniteNumber(extractedFields?.valueGbp)

  if (explicitTotal !== null) return explicitTotal

  const lineItemTotal = lineItems.reduce((total, item) => {
    return total + (item.catalogLineValueGbp ?? item.valueGbp ?? 0)
  }, 0)

  return lineItemTotal > 0 ? Math.round(lineItemTotal * 100) / 100 : null
}

function isInboundEmailTheft(email: Pick<InboundEmailRow, 'analysis_template_key' | 'analysis_payload'>) {
  if (String(email.analysis_template_key || '').trim().toLowerCase() === 'store_theft') {
    return true
  }

  return getInboundEmailTheftLineItems(email).length > 0
}

export function getInboundEmailDisplaySummary(
  email: Pick<InboundEmailRow, 'analysis_template_key' | 'analysis_payload' | 'analysis_summary' | 'body_preview'>
) {
  if (!isInboundEmailTheft(email)) {
    return email.analysis_summary || email.body_preview || 'No summary available.'
  }

  const lineItems = getInboundEmailTheftLineItems(email)
  const totalValue = getInboundEmailTheftTotalValue(email, lineItems)
  const parts = ['Theft reported by email.']

  if (lineItems.length > 0) {
    parts.push(`${lineItems.length} line${lineItems.length === 1 ? '' : 's'} identified.`)
  }

  if (typeof totalValue === 'number') {
    parts.push(`Total reported ${formatCurrency(totalValue)}.`)
  }

  return parts.join(' ')
}

export function getInboundEmailDetailedSummary(
  email: Pick<InboundEmailRow, 'analysis_template_key' | 'analysis_payload' | 'analysis_summary' | 'body_preview'>
) {
  if (!isInboundEmailTheft(email)) {
    return email.analysis_summary || email.body_preview || 'No summary available.'
  }

  const lineItems = getInboundEmailTheftLineItems(email)
  const totalValue = getInboundEmailTheftTotalValue(email, lineItems)
  const lines = ['Theft reported by email.']

  if (lineItems.length > 0) {
    lines.push('Lines stolen:')
    lines.push(...lineItems.map(formatInboundEmailTheftLineItem))
  } else {
    lines.push('Lines stolen: Not stated in email')
  }

  if (typeof totalValue === 'number') {
    lines.push(`Total reported: ${formatCurrency(totalValue)}`)
  }

  return lines.join('\n')
}
