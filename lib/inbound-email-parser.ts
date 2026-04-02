import * as z from 'zod'

import type { InboundEmailRow } from '@/lib/inbound-emails'
import {
  getStoreVisitProductCatalog,
  searchStoreVisitProducts,
  type StoreVisitProductCatalogItem,
} from '@/lib/store-visit-product-catalog'

type ParsedStoreReference = {
  storeCode: string | null
  storeName: string | null
  reason: string | null
}

export type ParsedTheftLineItem = {
  quantity: number | null
  stockId: string | null
  description: string | null
  valueGbp: number | null
  catalogProductId?: string | null
  catalogProductTitle?: string | null
  catalogUnitPriceGbp?: number | null
  catalogLineValueGbp?: number | null
  catalogMatchType?: 'stock_id' | 'description' | null
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
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
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

function parseCurrencyAmount(value: string | null | undefined) {
  const normalized = String(value || '')
    .replace(/[£,\s]/g, '')
    .trim()

  if (!normalized) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function cleanTheftDescription(value: string | null | undefined) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:this\s+cube\s+includes?\s*:?\s*)/i, '')
    .replace(/^(?:product\s+detail\s*:?\s*)/i, '')
    .replace(/[.,;:]+$/g, '')
    .trim() || null
}

function isGenericTheftDescription(value: string | null | undefined) {
  const normalized = String(value || '').trim()
  if (!normalized) return true

  return (
    /^(stock\s*(?:id|code)?|sku)\b/i.test(normalized) ||
    /\b(?:crime|police|incident)\s+reference\b/i.test(normalized)
  )
}

function buildTheftAnalysisSummary(params: {
  storeName: string | null
  productDescription: string | null
  lineItems: ParsedTheftLineItem[]
  catalogTotalValueGbp: number | null
  reportedTotalValueGbp: number | null
}) {
  const { storeName, productDescription, lineItems, catalogTotalValueGbp, reportedTotalValueGbp } = params
  const parts = [`Store theft reported${storeName ? ` by ${storeName}` : ''}.`]

  if (lineItems.length > 0) {
    parts.push(`${lineItems.length} line${lineItems.length === 1 ? '' : 's'} identified.`)
  } else if (productDescription) {
    parts.push(`Product noted: ${productDescription}.`)
  }

  if (catalogTotalValueGbp !== null) {
    parts.push(`Estimated website value ${formatCurrency(catalogTotalValueGbp)}.`)
  } else if (reportedTotalValueGbp !== null) {
    parts.push(`Reported total value ${formatCurrency(reportedTotalValueGbp)}.`)
  }

  return parts.join(' ')
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeStockId(value: string | null | undefined) {
  const digits = String(value || '').match(/\d{4,}/)?.[0]
  return digits || null
}

function hasTheftSignal(value: string | null | undefined) {
  return /\b(theft|stole|stolen|shoplift(?:ed|ing)?|taken without payment|wrong item was taken)\b/i.test(String(value || ''))
}

function isTrustedTheftSender(senderEmail: string, senderName: string, bodyText: string) {
  return (
    /@(tfsstores|tfs)\.com$/i.test(senderEmail) ||
    /(the fragrance shop|stock counts|stock control|loss prevention)/i.test(senderName) ||
    /\b(the fragrance shop|store theft log|stock adjusted|report(?:ed)? it to the police)\b/i.test(bodyText)
  )
}

function getTheftStoreNameFromText(subject: string, bodyText: string, senderName: string) {
  const matches = [
    subject.match(/\btheft(?:\s*,)?\s*review\s*-\s*([a-z0-9 '&-]+)/i)?.[1],
    subject.match(/\btheft in ([a-z0-9 '&-]+)/i)?.[1],
    subject.match(/\b([a-z0-9 '&-]+)\s+theft\b/i)?.[1],
    bodyText.match(/\bstore\s*[:\-]\s*([a-z0-9 '&-]+)/i)?.[1],
    bodyText.match(/\b(?:from|in|at)\s+(?:the\s+)?([a-z0-9 '&-]+?)\s+store\b/i)?.[1],
    bodyText.match(/the fragrance shop\s+([a-z0-9 '&-]+)/i)?.[1],
    senderName.match(/the fragrance shop\s+([a-z0-9 '&-]+)/i)?.[1],
  ]

  for (const match of matches) {
    const cleaned = cleanStoreName(match)
    if (cleaned) return cleaned
  }

  return null
}

function getTheftStoreCodeFromText(subject: string, bodyText: string, senderEmail: string) {
  return (
    normalizeStoreCode(senderEmail) ||
    normalizeStoreCode(subject.match(/\bstore\s*(\d{1,3})\b/i)?.[1]) ||
    normalizeStoreCode(subject.match(/\b(\d{1,3})\b/)?.[1]) ||
    normalizeStoreCode(bodyText.match(/\bstore\s*(\d{1,3})\b/i)?.[1]) ||
    normalizeStoreCode(bodyText.match(/\bTFS\s*(\d{1,3})\b/i)?.[1]) ||
    normalizeStoreCode(bodyText.match(/\b([0-9]{1,3})\s+[A-Za-z][A-Za-z '&-]+\b/)?.[1])
  )
}

function parseTheftLineFromSingleLine(line: string): ParsedTheftLineItem | null {
  const normalizedLine = line.replace(/\s+/g, ' ').trim()
  if (!normalizedLine) return null
  if (/@/.test(normalizedLine)) return null
  if (/\b(?:crime|police|incident)\s+reference\b/i.test(normalizedLine)) return null
  if (/^(hello|hi|good\s+(?:morning|afternoon|evening)|kind regards|regards|thanks|thank you|dear)\b/i.test(normalizedLine)) {
    return null
  }
  if (/^(?:t|m|e)\s*:/i.test(normalizedLine)) return null
  if (!/[a-z]/i.test(normalizedLine)) return null
  if (
    !/\b\d{4,}\b/.test(normalizedLine) &&
    !/£\s*[0-9]/i.test(normalizedLine) &&
    !/^\s*[-•]?\s*\d+\s*x?\s+[a-z]/i.test(normalizedLine)
  ) {
    return null
  }

  const quantityMatch = normalizedLine.match(/^\s*[-•]?\s*(\d+)\s*x?\s+/i)
  const quantity = quantityMatch?.[1] ? Number(quantityMatch[1]) || null : 1
  const stockId =
    normalizeStockId(normalizedLine.match(/\bstock\s*(?:id|code)?\s*#?\s*(\d{4,})\b/i)?.[1]) ||
    normalizeStockId(normalizedLine.match(/(?:-|—|–|=)\s*(\d{4,})(?=\s*(?:-|—|–|=|$))/i)?.[1]) ||
    normalizeStockId(normalizedLine.match(/\b(\d{4,})\b/i)?.[1])
  const valueGbp = parseCurrencyAmount(normalizedLine.match(/£\s*([0-9][\d,]*(?:\.\d{1,2})?)/i)?.[1])

  let description = normalizedLine
    .replace(/^\s*[-•]?\s*\d+\s*x?\s+/i, '')
    .replace(/\bstock\s*(?:id|code)?\s*#?\s*\d{4,}\b/gi, '')
    .replace(/(?:-|—|–|=)\s*\d{4,}(?=\s*(?:-|—|–|=|$))/g, '')
    .replace(/(?:-|—|–|=)\s*£\s*[0-9][\d,]*(?:\.\d{1,2})?/gi, '')
    .replace(/^unit\s*\d+\s*=\s*/i, '')
    .replace(/[=:;-]+\s*$/g, '')

  description = cleanTheftDescription(description) || ''

  if (!description && !stockId) return null

  return {
    quantity,
    stockId,
    description: description || null,
    valueGbp,
  }
}

function getCatalogSearchText(product: StoreVisitProductCatalogItem) {
  return normalizeSearchText([
    product.title,
    product.brand,
    product.productBaseName,
  ].filter(Boolean).join(' '))
}

function matchesProductStockId(product: StoreVisitProductCatalogItem, normalizedStockId: string) {
  return (
    product.variantSkuIds.some((skuId) => normalizeStockId(skuId) === normalizedStockId) ||
    normalizeStockId(product.productId) === normalizedStockId ||
    normalizeStockId(product.variantMasterRecordId) === normalizedStockId
  )
}

function getDescriptionSearchTokens(value: string) {
  return Array.from(
    new Set(
      value
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  )
}

function getDescriptionMatchScore(product: StoreVisitProductCatalogItem, normalizedDescription: string) {
  const searchTokens = getDescriptionSearchTokens(normalizedDescription)
  if (searchTokens.length === 0) return null

  const catalogText = getCatalogSearchText(product)
  const matchedTokenCount = searchTokens.filter((token) => catalogText.includes(token)).length
  const exactMatch = catalogText.includes(normalizedDescription)
  const unmatchedTokens = searchTokens.length - matchedTokenCount

  if (!exactMatch && matchedTokenCount === 0) return null
  if (!exactMatch && unmatchedTokens > 1) return null

  return {
    product,
    score:
      (exactMatch ? 100 : 0) +
      matchedTokenCount * 10 -
      unmatchedTokens * 4 -
      Math.max(0, product.title.length - normalizedDescription.length) * 0.02,
  }
}

function findBestDescriptionMatch(
  products: StoreVisitProductCatalogItem[],
  lineItem: ParsedTheftLineItem
) {
  const normalizedDescription = normalizeSearchText(lineItem.description)
  if (!normalizedDescription) return null

  return products
    .map((product) => getDescriptionMatchScore(product, normalizedDescription))
    .filter((candidate): candidate is NonNullable<ReturnType<typeof getDescriptionMatchScore>> => candidate !== null)
    .sort((left, right) => right.score - left.score)[0]?.product ?? null
}

type TheftLookupContext = {
  productCatalogPromise: Promise<StoreVisitProductCatalogItem[]> | null
  keywordSearches: Map<string, Promise<StoreVisitProductCatalogItem[]>>
}

async function getCachedProductCatalog(context: TheftLookupContext) {
  if (!context.productCatalogPromise) {
    context.productCatalogPromise = getStoreVisitProductCatalog()
  }

  return context.productCatalogPromise
}

async function searchProductsCached(query: string, context: TheftLookupContext) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  if (!normalizedQuery) return []

  const existing = context.keywordSearches.get(normalizedQuery)
  if (existing) {
    return existing
  }

  const pending = searchStoreVisitProducts(query, 8)
  context.keywordSearches.set(normalizedQuery, pending)
  return pending
}

async function findCatalogProductForTheftLine(
  lineItem: ParsedTheftLineItem,
  context: TheftLookupContext
): Promise<{ product: StoreVisitProductCatalogItem | null; matchType: 'stock_id' | 'description' | null }> {
  const normalizedStockId = normalizeStockId(lineItem.stockId)
  const usableDescription = isGenericTheftDescription(lineItem.description) ? null : lineItem.description
  const normalizedDescription = normalizeSearchText(usableDescription)
  let stockSearchResults: StoreVisitProductCatalogItem[] = []

  if (normalizedStockId) {
    stockSearchResults = await searchProductsCached(normalizedStockId, context)
    const exactStockMatch = stockSearchResults.find((product) =>
      matchesProductStockId(product, normalizedStockId)
    )

    if (exactStockMatch) {
      return { product: exactStockMatch, matchType: 'stock_id' }
    }
  }

  if (normalizedDescription) {
    const descriptionSearchResults = await searchProductsCached(usableDescription || normalizedDescription, context)
    const liveDescriptionMatch = findBestDescriptionMatch(descriptionSearchResults, {
      ...lineItem,
      description: usableDescription,
    })
    if (liveDescriptionMatch) {
      return { product: liveDescriptionMatch, matchType: 'description' }
    }
  }

  if (normalizedStockId && !normalizedDescription && stockSearchResults[0]) {
    return { product: stockSearchResults[0], matchType: 'stock_id' }
  }

  const productCatalog = await getCachedProductCatalog(context)

  if (normalizedStockId) {
    const catalogStockMatch = productCatalog.find((product) =>
      matchesProductStockId(product, normalizedStockId)
    )

    if (catalogStockMatch) {
      return { product: catalogStockMatch, matchType: 'stock_id' }
    }
  }

  if (normalizedDescription) {
    const catalogDescriptionMatch = findBestDescriptionMatch(productCatalog, {
      ...lineItem,
      description: usableDescription,
    })
    if (catalogDescriptionMatch) {
      return { product: catalogDescriptionMatch, matchType: 'description' }
    }
  }

  if (normalizedStockId) {
    if (stockSearchResults[0]) {
      return { product: stockSearchResults[0], matchType: 'stock_id' }
    }
  }

  return { product: null, matchType: null }
}

export async function enrichTheftLineItemsWithCatalog(lineItems: ParsedTheftLineItem[]) {
  if (lineItems.length === 0) return lineItems

  const context: TheftLookupContext = {
    productCatalogPromise: null,
    keywordSearches: new Map(),
  }

  return Promise.all(lineItems.map(async (lineItem) => {
    const { product, matchType } = await findCatalogProductForTheftLine(lineItem, context)
    if (!product) return lineItem

    const quantity = lineItem.quantity && lineItem.quantity > 0 ? lineItem.quantity : 1
    const catalogLineValueGbp =
      typeof product.price === 'number' ? Math.round(product.price * quantity * 100) / 100 : null

    return {
      ...lineItem,
      description: isGenericTheftDescription(lineItem.description) ? product.title : lineItem.description,
      catalogProductId: product.productId,
      catalogProductTitle: product.title,
      catalogUnitPriceGbp: product.price,
      catalogLineValueGbp,
      catalogMatchType: matchType,
    }
  }))
}

function normalizeParsedTheftLineItem(value: unknown): ParsedTheftLineItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const item = value as Record<string, unknown>
  const quantityRaw =
    typeof item.quantity === 'number'
      ? item.quantity
      : typeof item.quantity === 'string'
        ? Number(item.quantity)
        : null
  const quantity = Number.isFinite(quantityRaw) ? Math.round(Number(quantityRaw)) : null

  return {
    quantity,
    stockId: normalizeStockId(item.stockId as string | null | undefined),
    description: cleanTheftDescription(item.description as string | null | undefined),
    valueGbp: parseCurrencyAmount(item.valueGbp as string | null | undefined) ?? (
      typeof item.valueGbp === 'number' && Number.isFinite(item.valueGbp) ? item.valueGbp : null
    ),
    catalogProductId: String(item.catalogProductId || '').trim() || null,
    catalogProductTitle: String(item.catalogProductTitle || '').trim() || null,
    catalogUnitPriceGbp:
      parseCurrencyAmount(item.catalogUnitPriceGbp as string | null | undefined) ??
      (typeof item.catalogUnitPriceGbp === 'number' && Number.isFinite(item.catalogUnitPriceGbp)
        ? item.catalogUnitPriceGbp
        : null),
    catalogLineValueGbp:
      parseCurrencyAmount(item.catalogLineValueGbp as string | null | undefined) ??
      (typeof item.catalogLineValueGbp === 'number' && Number.isFinite(item.catalogLineValueGbp)
        ? item.catalogLineValueGbp
        : null),
    catalogMatchType:
      item.catalogMatchType === 'stock_id' || item.catalogMatchType === 'description'
        ? item.catalogMatchType
        : null,
  }
}

function buildTheftFallbackLineItems(
  analysis: InboundEmailAnalysis,
  bodyText: string
): ParsedTheftLineItem[] {
  const extractedLineItems = Array.isArray(analysis.extractedFields.lineItems)
    ? analysis.extractedFields.lineItems
        .map(normalizeParsedTheftLineItem)
        .filter((lineItem): lineItem is ParsedTheftLineItem => Boolean(lineItem))
    : []

  if (extractedLineItems.length > 0) return extractedLineItems

  const stockId = normalizeStockId(analysis.extractedFields.stockId as string | null | undefined)
  const productDescription = cleanTheftDescription(
    analysis.extractedFields.productDescription as string | null | undefined
  )
  if (stockId || productDescription) {
    return [{
      quantity: 1,
      stockId,
      description: productDescription,
      valueGbp:
        parseCurrencyAmount(analysis.extractedFields.valueGbp as string | null | undefined) ??
        parseCurrencyAmount(analysis.extractedFields.totalValueGbp as string | null | undefined) ??
        null,
    }]
  }

  return extractStoreTheftLineItems(bodyText)
}

async function enrichTheftAnalysis(
  analysis: InboundEmailAnalysis,
  email: Pick<InboundEmailRow, 'subject' | 'sender_name' | 'sender_email' | 'body_text' | 'body_preview'>
) {
  const bodyText = normalizeWhitespace(email.body_text || email.body_preview)
  const subject = normalizeWhitespace(email.subject)

  if (analysis.templateKey !== 'store_theft' && !hasTheftSignal([subject, analysis.summary, bodyText].join('\n'))) {
    return analysis
  }

  const lineItems = buildTheftFallbackLineItems(analysis, bodyText)
  const enrichedLineItems = await enrichTheftLineItemsWithCatalog(lineItems)
  const reportedTotalValueGbp =
    parseCurrencyAmount(analysis.extractedFields.reportedTotalValueGbp as string | null | undefined) ??
    parseCurrencyAmount(analysis.extractedFields.totalValueGbp as string | null | undefined) ??
    extractStoreTheftReportedValue(bodyText, lineItems)
  const catalogTotalValueRaw = enrichedLineItems.reduce((total, lineItem) => {
    return typeof lineItem.catalogLineValueGbp === 'number' ? total + lineItem.catalogLineValueGbp : total
  }, 0)
  const catalogTotalValueGbp = catalogTotalValueRaw > 0
    ? Math.round(catalogTotalValueRaw * 100) / 100
    : null
  const productDescription =
    cleanTheftDescription(analysis.extractedFields.productDescription as string | null | undefined) ||
    enrichedLineItems[0]?.description ||
    null
  const storeCode =
    normalizeStoreCode(analysis.primaryStore?.storeCode) ||
    normalizeStoreCode(analysis.extractedFields.storeCode as string | null | undefined) ||
    getTheftStoreCodeFromText(subject, bodyText, normalizeWhitespace(email.sender_email))
  const storeName =
    cleanStoreName(analysis.primaryStore?.storeName) ||
    cleanStoreName(analysis.extractedFields.storeName as string | null | undefined) ||
    getTheftStoreNameFromText(subject, bodyText, normalizeWhitespace(email.sender_name))
  const summary = buildTheftAnalysisSummary({
    storeName,
    productDescription,
    lineItems: enrichedLineItems,
    catalogTotalValueGbp,
    reportedTotalValueGbp,
  })

  return {
    ...analysis,
    templateKey: 'store_theft',
    summary,
    needsAction: true,
    needsIncident: true,
    suggestedNextSteps: analysis.suggestedNextSteps.length > 0
      ? analysis.suggestedNextSteps
      : [
          'Review whether a formal incident record is already logged.',
          'Confirm the theft log and stock adjustment were completed.',
          'Confirm whether the store reported the theft to the police.',
        ],
    extractedFields: {
      ...analysis.extractedFields,
      storeCode,
      storeName,
      stockId: enrichedLineItems[0]?.stockId || normalizeStockId(analysis.extractedFields.stockId as string | null | undefined),
      productDescription,
      lineItems: enrichedLineItems,
      reportedTotalValueGbp,
      catalogTotalValueGbp,
      totalValueGbp: reportedTotalValueGbp ?? catalogTotalValueGbp,
    },
    primaryStore: storeCode || storeName ? {
      storeCode,
      storeName,
      reason: analysis.primaryStore?.reason || 'Detected from theft email subject/body content.',
    } : analysis.primaryStore,
  }
}

function dedupeTheftLineItems(items: ParsedTheftLineItem[]) {
  const seen = new Set<string>()
  const output: ParsedTheftLineItem[] = []

  for (const item of items) {
    const key = [
      item.quantity ?? '',
      item.stockId ?? '',
      String(item.description || '').toLowerCase(),
      item.valueGbp ?? '',
    ].join('|')

    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }

  return output
}

export function extractStoreTheftLineItems(bodyText: string): ParsedTheftLineItem[] {
  const items: ParsedTheftLineItem[] = []
  const lines = bodyText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const match of bodyText.matchAll(
    /(?:^|\n)[^\n]*?\btook\s+(\d+)\s*x?\s+(.+?)\s+stock id\s*(\d+)(?:[^\n£]*£\s*([0-9][\d,]*(?:\.\d{1,2})?))?/gi
  )) {
    items.push({
      quantity: Number(match[1]) || null,
      stockId: match[3] || null,
      description: cleanTheftDescription(match[2]),
      valueGbp: parseCurrencyAmount(match[4]),
    })
  }

  for (const match of bodyText.matchAll(
    /(?:^|\n)\s*unit\s*(\d+)\s*=\s*(\d+)\s*=\s*([^\n=£]+?)(?:\s*=\s*£?\s*([0-9][\d,]*(?:\.\d{1,2})?))?(?=$|\n)/gi
  )) {
    items.push({
      quantity: 1,
      stockId: match[2] || null,
      description: cleanTheftDescription(match[3]),
      valueGbp: parseCurrencyAmount(match[4]),
    })
  }

  for (const match of bodyText.matchAll(
    /(?:^|\n)\s*[-•]?\s*(\d+)\s*x?\s+([^\n£]+?)\s*(?:-|—|–|=)\s*(\d{3,})(?:\s*(?:-|—|–|=)\s*£?\s*([0-9][\d,]*(?:\.\d{1,2})?))?(?=$|\n)/gi
  )) {
    items.push({
      quantity: Number(match[1]) || null,
      stockId: match[3] || null,
      description: cleanTheftDescription(match[2]),
      valueGbp: parseCurrencyAmount(match[4]),
    })
  }

  for (const match of bodyText.matchAll(
    /(?:^|\n)\s*[-•]?\s*(\d+)\s*x?\s+([^\n£]+?)\s*(?:-|—|–|=)\s*£\s*([0-9][\d,]*(?:\.\d{1,2})?)(?=$|\n)/gi
  )) {
    const description = cleanTheftDescription(match[2])
    if (/(?:-|—|–|=)\s*\d{3,}\s*$/i.test(description || '')) {
      continue
    }

    items.push({
      quantity: Number(match[1]) || null,
      stockId: null,
      description,
      valueGbp: parseCurrencyAmount(match[3]),
    })
  }

  for (const line of lines) {
    const parsedLineItem = parseTheftLineFromSingleLine(line)
    if (!parsedLineItem) continue
    items.push(parsedLineItem)
  }

  return dedupeTheftLineItems(items)
}

export function extractStoreTheftReportedValue(
  bodyText: string,
  lineItems: ParsedTheftLineItem[] = []
) {
  const lineItemTotal = lineItems.reduce((total, item) => {
    return typeof item.valueGbp === 'number' ? total + item.valueGbp : total
  }, 0)

  if (lineItemTotal > 0) {
    return Math.round(lineItemTotal * 100) / 100
  }

  const explicitValueMatch = bodyText.match(
    /\b(?:value|loss|amount|total(?:\s+value)?)\b[^£\n]{0,20}£\s*([0-9][\d,]*(?:\.\d{1,2})?)/i
  )

  return parseCurrencyAmount(explicitValueMatch?.[1])
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
  const leadingBodyText = bodyText.slice(0, 1200)
  const senderEmail = normalizeWhitespace(email.sender_email).toLowerCase()
  const senderName = normalizeWhitespace(email.sender_name)

  // Stocktake emails often contain generic theft wording in signatures/disclaimers.
  // Avoid misclassifying those as theft incidents.
  if (/\bstocktake result\b/i.test(subject) || /\byour stocktake result\b/i.test(leadingBodyText)) {
    return null
  }

  const theftSignalPresent =
    hasTheftSignal(subject) ||
    hasTheftSignal(leadingBodyText)

  if (!theftSignalPresent) return null
  if (!isTrustedTheftSender(senderEmail, senderName, leadingBodyText)) return null

  const storeCode = getTheftStoreCodeFromText(subject, bodyText, senderEmail)
  const storeName = getTheftStoreNameFromText(subject, bodyText, senderName)
  const stockId =
    normalizeStockId(bodyText.match(/\bstock id\s*(\d{4,})\b/i)?.[1]) ||
    normalizeStockId(bodyText.match(/\bunit\s*\d+\s*=\s*(\d{4,})\b/i)?.[1]) ||
    null
  const theftLineItems = extractStoreTheftLineItems(bodyText)
  const productDescription =
    theftLineItems[0]?.description ||
    bodyText.match(/took\s+\d+x?\s+(.+?)\s+stock id/i)?.[1]?.trim() ||
    bodyText.match(/\bunit\s*\d+\s*=\s*\d+\s*=\s*([^\n]+)/i)?.[1]?.trim() ||
    null
  const totalValueGbp = extractStoreTheftReportedValue(bodyText, theftLineItems)
  const policeReported = /\bpolice\b/i.test(bodyText)
  const stockAdjusted = /\b(stock adjusted|adjusting the stock|stock adjusted)\b/i.test(bodyText)

  return {
    source: 'rule',
    templateKey: 'store_theft',
    summary: buildTheftAnalysisSummary({
      storeName,
      productDescription,
      lineItems: theftLineItems,
      catalogTotalValueGbp: null,
      reportedTotalValueGbp: totalValueGbp,
    }),
    confidence: 0.94,
    needsAction: true,
    needsVisit: false,
    needsIncident: true,
    extractedFields: {
      storeCode,
      storeName,
      stockId,
      productDescription,
      lineItems: theftLineItems,
      totalValueGbp,
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
      reason: 'Detected from theft-specific subject/body language.',
    },
    mentionedStores: storeCode || storeName ? [{
      storeCode,
      storeName,
      reason: 'Detected from theft-specific subject/body language.',
    }] : [],
    reasoning: 'Matched theft-specific language in the subject/body and resolved the store context from the sender, subject, or body.',
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
  const bodyStoreMatch =
    bodyText.match(/\bfinal stocktake result for\s+(\d{1,3})\s+([a-z0-9 '&-]+?)\s+is\b/i) ||
    bodyText.match(/\bTFS\s+(\d{1,3})\s+([a-z0-9 '&-]+?)\s*</i)
  const amountAndColourMatch = bodyText.match(
    /\b(profit|loss)\s*(-)?\s*£\s*([-+]?\d[\d,]*(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)%\s*(GREEN|AMBER|RED)\b/i
  )
  const standaloneColourMatch = bodyText.match(/\b(GREEN|AMBER|RED)\b/i)
  const hasStocktakeSignal =
    /\bstocktake result\b/i.test(subject) ||
    /\byour stocktake result\b/i.test(bodyText) ||
    /\bfinal stocktake result for\b/i.test(bodyText)
  if (!subjectMatch && !hasStocktakeSignal) return null

  const storeCode = normalizeStoreCode(subjectMatch?.[1] || bodyStoreMatch?.[1] || null)
  const storeName = cleanStoreName(subjectMatch?.[2] || bodyStoreMatch?.[2] || null)
  const colour = String(subjectMatch?.[3] || amountAndColourMatch?.[5] || standaloneColourMatch?.[1] || '').toLowerCase()
  if (!colour) return null

  const amountMatch = amountAndColourMatch || bodyText.match(/\b(profit|loss)\s*(-)?\s*£\s*([-+]?\d[\d,]*(?:\.\d+)?)/i)
  const resultType = String(amountMatch?.[1] || '').toLowerCase() === 'loss' ? 'loss' : 'profit'
  const parsedAmountAbs = Number(String(amountMatch?.[3] || '0').replace(/,/g, ''))
  const amountGbp = resultType === 'loss' ? -Math.abs(parsedAmountAbs) : Math.abs(parsedAmountAbs)
  const profitGbp = amountGbp
  const variancePct = Number(amountAndColourMatch?.[4] || bodyText.match(/([-+]?\d+(?:\.\d+)?)%/i)?.[1] || '0')
  const needsFollowUp = colour === 'red'

  return {
    source: 'rule',
    templateKey: 'stocktake_result',
    summary: `${storeName || 'Store'} stocktake result is ${colour}${Number.isFinite(amountGbp) ? ` with ${resultType} £${Math.abs(amountGbp)}` : ''}.`,
    confidence: 0.97,
    needsAction: needsFollowUp,
    needsVisit: colour === 'red',
    needsIncident: false,
    extractedFields: {
      storeCode,
      storeName,
      colour,
      resultType,
      amountGbp,
      profitGbp,
      variancePct,
    },
    suggestedNextSteps: needsFollowUp
      ? ['Red stocktake result: schedule a store visit and review the loss drivers with the team.']
      : ['Stocktake result is green or amber: no further action required right now.'],
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
    parseStocktakeResult(email) ||
    parseWeeklyStockCountResults(email) ||
    parseStoreTheftEmail(email) ||
    parseTesterOrderTracker(email) ||
    buildUnknownRuleResult()
  )
}

export async function analyzeInboundEmail(email: Pick<InboundEmailRow, 'subject' | 'sender_name' | 'sender_email' | 'body_text' | 'body_preview' | 'body_html' | 'has_attachments' | 'folder_name' | 'mailbox_name'>): Promise<InboundEmailAnalysis> {
  const ruleResult = await enrichTheftAnalysis(parseInboundEmailByRules(email), email)
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

  return enrichTheftAnalysis({
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
  }, email)
}
