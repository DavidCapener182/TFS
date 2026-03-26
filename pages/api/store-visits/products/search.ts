import type { NextApiRequest, NextApiResponse } from 'next'

const BLOOMREACH_ENDPOINT = 'https://core.dxpapi.com/api/v1/core/'

interface BloomreachDoc {
  pid?: string
  title?: string
  brand?: string
  price?: number | string | Array<number | string>
  sale_price?: number | string | Array<number | string>
  url?: string
  thumb_image?: string
  product_base_name?: string | string[]
  variant_master_recordid?: string | string[]
  variants?:
    | {
        values?: Array<{
          skuid?: string
        }>
      }
    | Array<{
        skuid?: string
        sku_price?: number | string
      }>
}

function normalizeToString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim() || null
  }
  return String(value || '').trim() || null
}

function extractVariantSkuIds(variants: BloomreachDoc['variants'] | unknown): string[] {
  const values = Array.isArray(variants)
    ? variants
    : variants && typeof variants === 'object'
      ? (variants as { values?: Array<{ skuid?: string }> }).values
      : []

  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((variant) => String(variant.skuid || '').trim())
        .filter(Boolean)
    )
  )
}

function normalizeOptionalPrice(
  value: number | string | Array<number | string> | undefined
): number | null {
  if (Array.isArray(value)) {
    return normalizeOptionalPrice(value[0])
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

function normalizeDoc(doc: BloomreachDoc) {
  const productId = String(doc.pid || '').trim()
  const title = String(doc.title || '').trim()

  if (!productId || !title) return null

  return {
    productId,
    title,
    brand: String(doc.brand || '').trim() || null,
    productBaseName: normalizeToString(doc.product_base_name),
    price: normalizeOptionalPrice(doc.sale_price) ?? normalizeOptionalPrice(doc.price),
    url: String(doc.url || '').trim() || null,
    imageUrl: String(doc.thumb_image || '').trim() || null,
    variantMasterRecordId: normalizeToString(doc.variant_master_recordid),
    variantSkuIds: extractVariantSkuIds(doc.variants),
  }
}

function buildKeywordSearchUrl(query: string, limit: number): string {
  const params = new URLSearchParams({
    account_id: '7387',
    domain_key: 'thefragranceshop',
    catalog_views: 'thefragranceshop:GBP',
    q: query,
    fl: 'pid,title,brand,price,sale_price,url,thumb_image,product_base_name,variant_master_recordid,variants',
    start: '0',
    rows: String(limit),
    request_type: 'search',
    search_type: 'keyword',
    view_id: 'GBP',
    ref_url: '',
    url: 'https://www.thefragranceshop.co.uk/search',
  })

  return `${BLOOMREACH_ENDPOINT}?${params.toString()}`
}

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ items: [], error: 'Method not allowed' })
  }

  try {
    const query = String(request.query.q || '').trim()
    const limit = Math.max(1, Math.min(12, Number(request.query.limit || 8)))

    if (query.length < 2) {
      return response.status(200).json({ items: [] })
    }

    const upstreamResponse = await fetch(buildKeywordSearchUrl(query, limit), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })

    if (!upstreamResponse.ok) {
      return response
        .status(500)
        .json({ items: [], error: `Search failed with status ${upstreamResponse.status}` })
    }

    const payload = (await upstreamResponse.json()) as { response?: { docs?: BloomreachDoc[] } }
    const items = Array.from(
      new Map(
        (payload.response?.docs || [])
          .map(normalizeDoc)
          .filter((item): item is NonNullable<ReturnType<typeof normalizeDoc>> => item !== null)
          .map((item) => [item.productId, item])
      ).values()
    )

    return response.status(200).json({ items })
  } catch (error) {
    console.error('Error searching store visit products:', error)
    return response.status(500).json({
      items: [],
      error: error instanceof Error ? error.message : 'Failed to search products',
    })
  }
}
