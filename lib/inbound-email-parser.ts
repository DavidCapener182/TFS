import * as z from 'zod'

import type { InboundEmailRow } from '@/lib/inbound-emails'

type ParsedStoreReference = {
  storeCode: string | null
  storeName: string | null
  reason: string | null
}

export type InboundEmailAnalysis = {
  source: 'rule' | 'ai'
  templateKey: string | null
  summary: string
  confidence: number
  needsAction: boolean
  needsVisit: boolean
  needsIncident: boolean
  extractedFields: Record<string, unknown>
  suggestedNextSteps: string[]
  primaryStore: ParsedStoreReference | null
  mentionedStores: ParsedStoreReference[]
  reasoning: string
}

const aiAnalysisSchema = z.object({
  templateKey: z.string().nullable().optional(),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  needsAction: z.boolean(),
  needsVisit: z.boolean(),
  needsIncident: z.boolean(),
  reasoning: z.string().min(1),
  suggestedNextSteps: z.array(z.string()).default([]),
  extractedFields: z.record(z.unknown()).default({}),
  primaryStore: z.object({
    storeCode: z.string().nullable().optional(),
    storeName: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
  }).nullable().optional(),
  mentionedStores: z.array(z.object({
    storeCode: z.string().nullable().optional(),
    storeName: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
  })).default([]),
})

function normalizeWhitespace(value: string | null | undefined) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getCombinedEmailText(email: Pick<InboundEmailRow, 'subject' | 'body_preview' | 'body_text' | 'body_html' | 'sender_name' | 'sender_email'>) {
  return normalizeWhitespace([
    email.subject,
    email.sender_name,
    email.sender_email,
    email.body_preview,
    email.body_text,
    email.body_html,
  ].filter(Boolean).join('\n'))
}

function cleanStoreName(value: string | null | undefined) {
  return String(value || '')
    .replace(/^the fragrance shop\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim() || null
}

function normalizeStoreCode(value: string | null | undefined) {
  const digits = String(value || '').match(/\d+/)?.[0]
  if (!digits) return null
  return digits.padStart(3, '0')
}

function parseConcernStoreLines(bodyText: string) {
  const matches = Array.from(bodyText.matchAll(/(?:^|\n)\s*[-•]\s*(\d{1,3})\s+([A-Za-z][^\n—-]+)/g))
  return matches.map((match) => ({
    storeCode: normalizeStoreCode(match[1]),
    storeName: cleanStoreName(match[2]),
    reason: null,
  }))
}

function parseQuotedStoreLines(bodyText: string) {
  const matches = Array.from(bodyText.matchAll(/(?:^|\n)\s*[-•]\s*(\d{1,3})\s+([A-Za-z][^\n—-]+?)\s+[—-]\s+([^\n]+)/g))
  return matches.map((match) => ({
    storeCode: normalizeStoreCode(match[1]),
    storeName: cleanStoreName(match[2]),
    reason: normalizeWhitespace(match[3]),
  }))
}

function parseStoreTheftEmail(email: Pick<InboundEmailRow, 'subject' | 'sender_name' | 'sender_email' | 'body_text' | 'body_preview'>): InboundEmailAnalysis | null {
  const subject = normalizeWhitespace(email.subject)
  const bodyText = normalizeWhitespace(email.body_text || email.body_preview)
  const senderEmail = normalizeWhitespace(email.sender_email).toLowerCase()
  const senderName = normalizeWhitespace(email.sender_name)
  const hasTheftSignal =
    /\btheft\b/i.test(subject) ||
    /\btheft\b/i.test(bodyText) ||
    /\bstolen\b/i.test(bodyText)

  if (!hasTheftSignal) return null
  if (!senderEmail.includes('@tfsstores.com') && !/the fragrance shop/i.test(senderName)) return null

  const storeCode = normalizeStoreCode(senderEmail)
  const storeNameFromSubject = subject.match(/\btheft in ([a-z0-9 '&-]+)/i)?.[1] || null
  const storeNameFromBody = bodyText.match(/the fragrance shop\s+([a-z0-9 '&-]+)/i)?.[1] || null
  const storeName = cleanStoreName(storeNameFromSubject || storeNameFromBody || senderName)
  const stockId = bodyText.match(/\bstock id\s*(\d{3,})\b/i)?.[1] || bodyText.match(/\bunit\s*\d+\s*=\s*(\d{3,})\b/i)?.[1] || null
  const productDescription =
    bodyText.match(/took\s+\d+x?\s+(.+?)\s+stock id/i)?.[1]?.trim() ||
    bodyText.match(/\bunit\s*\d+\s*=\s*\d+\s*=\s*([^\n]+)/i)?.[1]?.trim() ||
    null
  const policeReported = /\bpolice\b/i.test(bodyText)
  const stockAdjusted = /\b(stock adjusted|adjusting the stock|stock adjusted)\b/i.test(bodyText)

  return {
    source: 'rule',
    templateKey: 'store_theft',
    summary: `Store theft reported${storeName ? ` by ${storeName}` : ''}${productDescription ? ` involving ${productDescription}` : ''}.`,
    confidence: 0.94,
    needsAction: true,
    needsVisit: false,
    needsIncident: true,
    extractedFields: {
      storeCode,
      storeName,
      stockId,
      productDescription,
      policeReported,
      stockAdjusted,
    },
    suggestedNextSteps: [
      'Review whether a formal incident record is already logged.',
      'Confirm the theft log and stock adjustment were completed.',
      policeReported ? 'Capture the police reference if it is available.' : 'Confirm whether the store reported the theft to the police.',
    ],
    primaryStore: {
      storeCode,
      storeName,
      reason: 'Single-store theft email from the store mailbox.',
    },
    mentionedStores: storeCode || storeName ? [{
      storeCode,
      storeName,
      reason: 'Single-store theft email from the store mailbox.',
    }] : [],
    reasoning: 'Matched the store-theft pattern from a store mailbox and theft-specific language in the subject/body.',
  }
}

function parseWeeklyStockCountResults(email: Pick<InboundEmailRow, 'subject' | 'body_text' | 'body_preview' | 'has_attachments'>): InboundEmailAnalysis | null {
  const subject = normalizeWhitespace(email.subject)
  const bodyText = normalizeWhitespace(email.body_text || email.body_preview)
  if (!/weekly stock count results/i.test(subject)) return null

  const concernStores = parseConcernStoreLines(bodyText)
  const weekCommencing = subject.match(/w\/c\s+(.+)$/i)?.[1]?.trim() || null

  return {
    source: 'rule',
    templateKey: 'weekly_stock_count_results',
    summary: `Weekly stock count results highlight ${concernStores.length || 'multiple'} concern stores for follow-up review.`,
    confidence: 0.95,
    needsAction: concernStores.length > 0,
    needsVisit: concernStores.length > 0,
    needsIncident: false,
    extractedFields: {
      weekCommencing,
      concernStores,
      hasAttachment: email.has_attachments,
    },
    suggestedNextSteps: [
      'Review the highlighted stores against current open actions and incidents.',
      'Decide whether the worst-performing stores need a visit or targeted follow-up.',
      'Check the attached tracker before closing the review.',
    ],
    primaryStore: null,
    mentionedStores: concernStores,
    reasoning: 'Matched the weekly stock count results subject and extracted the concern-store bullet list.',
  }
}

function parseStocktakeResult(email: Pick<InboundEmailRow, 'subject' | 'body_text' | 'body_preview'>): InboundEmailAnalysis | null {
  const subject = normalizeWhitespace(email.subject)
  const bodyText = normalizeWhitespace(email.body_text || email.body_preview)
  const subjectMatch = subject.match(/(\d{1,3})\s+(.+?)\s+stocktake result\s*-\s*(green|amber|red)/i)
  if (!subjectMatch) return null

  const storeCode = normalizeStoreCode(subjectMatch[1])
  const storeName = cleanStoreName(subjectMatch[2])
  const colour = subjectMatch[3].toLowerCase()
  const profitGbp = Number(bodyText.match(/profit\s*£\s*([-+]?\d+(?:\.\d+)?)/i)?.[1] || '0')
  const variancePct = Number(bodyText.match(/([-+]?\d+(?:\.\d+)?)%/i)?.[1] || '0')
  const needsFollowUp = colour !== 'green'

  return {
    source: 'rule',
    templateKey: 'stocktake_result',
    summary: `${storeName || 'Store'} stocktake result is ${colour}${Number.isFinite(profitGbp) ? ` with profit £${profitGbp}` : ''}.`,
    confidence: 0.97,
    needsAction: needsFollowUp,
    needsVisit: colour === 'red',
    needsIncident: false,
    extractedFields: {
      storeCode,
      storeName,
      colour,
      profitGbp,
      variancePct,
    },
    suggestedNextSteps: needsFollowUp
      ? ['Review the stocktake result and decide whether corrective action or a visit is required.']
      : ['Record the positive stocktake result and monitor the next cycle.'],
    primaryStore: {
      storeCode,
      storeName,
      reason: 'Single-store stocktake result email.',
    },
    mentionedStores: [{
      storeCode,
      storeName,
      reason: 'Single-store stocktake result email.',
    }],
    reasoning: 'Matched the stocktake result subject pattern and extracted the colour/result values from the body.',
  }
}

function parseTesterOrderTracker(email: Pick<InboundEmailRow, 'subject' | 'body_text' | 'body_preview' | 'has_attachments'>): InboundEmailAnalysis | null {
  const subject = normalizeWhitespace(email.subject)
  const bodyText = normalizeWhitespace(email.body_text || email.body_preview)
  if (!/store tester order tracker/i.test(subject)) return null

  const highlightedStores = parseQuotedStoreLines(bodyText)

  return {
    source: 'rule',
    templateKey: 'tester_order_tracker',
    summary: `Tester order tracker flags ${highlightedStores.length || 'multiple'} stores for monitoring.`,
    confidence: 0.94,
    needsAction: highlightedStores.length > 0,
    needsVisit: false,
    needsIncident: false,
    extractedFields: {
      highlightedStores,
      hasAttachment: email.has_attachments,
    },
    suggestedNextSteps: [
      'Review the highlighted stores for unusual tester ordering behaviour.',
      'Cross-check the named stores against recent theft or stock-loss patterns.',
    ],
    primaryStore: null,
    mentionedStores: highlightedStores,
    reasoning: 'Matched the tester order tracker subject and extracted the highlighted store list.',
  }
}

function buildUnknownRuleResult(): InboundEmailAnalysis {
  return {
    source: 'rule',
    templateKey: 'unknown',
    summary: 'No known inbound email template matched this message.',
    confidence: 0.2,
    needsAction: false,
    needsVisit: false,
    needsIncident: false,
    extractedFields: {},
    suggestedNextSteps: ['Review the email manually or use the AI fallback to classify it.'],
    primaryStore: null,
    mentionedStores: [],
    reasoning: 'The email did not match any deterministic parser template.',
  }
}

export function parseInboundEmailByRules(email: Pick<InboundEmailRow, 'subject' | 'sender_name' | 'sender_email' | 'body_text' | 'body_preview' | 'has_attachments'>): InboundEmailAnalysis {
  return (
    parseStoreTheftEmail(email) ||
    parseWeeklyStockCountResults(email) ||
    parseStocktakeResult(email) ||
    parseTesterOrderTracker(email) ||
    buildUnknownRuleResult()
  )
}

export async function analyzeInboundEmail(email: Pick<InboundEmailRow, 'subject' | 'sender_name' | 'sender_email' | 'body_text' | 'body_preview' | 'body_html' | 'has_attachments' | 'folder_name' | 'mailbox_name'>): Promise<InboundEmailAnalysis> {
  const ruleResult = parseInboundEmailByRules(email)
  if (ruleResult.templateKey && ruleResult.templateKey !== 'unknown') {
    return ruleResult
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return ruleResult
  }

  const combinedText = getCombinedEmailText(email).slice(0, 12000)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: [
            'You classify retail loss prevention and stock emails for The Fragrance Shop.',
            'Prefer precise, conservative outputs.',
            'Return JSON only.',
            'Known template keys: store_theft, weekly_stock_count_results, stocktake_result, tester_order_tracker, unknown.',
            'Set needsIncident only when the email clearly describes an incident or theft that should be tracked.',
            'Set needsVisit only when the email suggests a store visit is likely useful.',
            'Set needsAction when the email implies follow-up work is needed.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            folderName: email.folder_name || null,
            mailboxName: email.mailbox_name || null,
            subject: email.subject || null,
            senderName: email.sender_name || null,
            senderEmail: email.sender_email || null,
            hasAttachments: email.has_attachments,
            emailText: combinedText,
            outputSchema: {
              templateKey: 'string | null',
              summary: 'string',
              confidence: 'number between 0 and 1',
              needsAction: 'boolean',
              needsVisit: 'boolean',
              needsIncident: 'boolean',
              reasoning: 'string',
              suggestedNextSteps: ['string'],
              extractedFields: {},
              primaryStore: {
                storeCode: 'string | null',
                storeName: 'string | null',
                reason: 'string | null',
              },
              mentionedStores: [
                {
                  storeCode: 'string | null',
                  storeName: 'string | null',
                  reason: 'string | null',
                },
              ],
            },
          }),
        },
      ],
    }),
  })

  if (!response.ok) {
    return ruleResult
  }

  const data = await response.json().catch(() => null)
  const rawContent = data?.choices?.[0]?.message?.content
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return ruleResult
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawContent)
  } catch {
    return ruleResult
  }

  const parsed = aiAnalysisSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return ruleResult
  }

  return {
    source: 'ai',
    templateKey: parsed.data.templateKey || 'unknown',
    summary: parsed.data.summary,
    confidence: parsed.data.confidence,
    needsAction: parsed.data.needsAction,
    needsVisit: parsed.data.needsVisit,
    needsIncident: parsed.data.needsIncident,
    extractedFields: parsed.data.extractedFields,
    suggestedNextSteps: parsed.data.suggestedNextSteps,
    primaryStore: parsed.data.primaryStore
      ? {
          storeCode: normalizeStoreCode(parsed.data.primaryStore.storeCode || null),
          storeName: cleanStoreName(parsed.data.primaryStore.storeName || null),
          reason: parsed.data.primaryStore.reason || null,
        }
      : null,
    mentionedStores: parsed.data.mentionedStores.map((store) => ({
      storeCode: normalizeStoreCode(store.storeCode || null),
      storeName: cleanStoreName(store.storeName || null),
      reason: store.reason || null,
    })),
    reasoning: parsed.data.reasoning,
  }
}
