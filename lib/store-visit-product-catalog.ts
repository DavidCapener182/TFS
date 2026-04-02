import { unstable_cache } from 'next/cache'

const BLOOMREACH_ENDPOINT = 'https://core.dxpapi.com/api/v1/core/'
const BLOOMREACH_PAGE_SIZE = 200
const BLOOMREACH_MAX_PAGES = 12

export interface StoreVisitProductCatalogItem {
  productId: string
  title: string
  brand: string | null
  productBaseName: string | null
  price: number | null
  url: string | null
  imageUrl: string | null
  variantMasterRecordId: string | null
  variantSkuIds: string[]
}

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

function normalizeToString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim() || null
  }

  return String(value || '').trim() || null
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

interface BloomreachResponse {
  response?: {
    docs?: BloomreachDoc[]
    numFound?: number
  }
}

function buildBloomreachUrl(start: number, rows: number): string {
  const params = new URLSearchParams({
    account_id: '7387',
    domain_key: 'thefragranceshop',
    catalog_views: 'thefragranceshop:GBP',
    q: '202001',
    fl: 'pid,title,brand,price,sale_price,url,thumb_image,product_base_name,variant_master_recordid,variants',
    start: String(start),
    rows: String(rows),
    request_type: 'search',
    search_type: 'category',
    view_id: 'GBP',
    ref_url: '',
    url: 'https://www.thefragranceshop.co.uk/fragrance/l',
  })

  return `${BLOOMREACH_ENDPOINT}?${params.toString()}`
}

function normalizeBloomreachDoc(doc: BloomreachDoc): StoreVisitProductCatalogItem | null {
  const productId = String(doc.pid || '').trim()
  const title = String(doc.title || '').trim()

  if (!productId || !title) return null

  const variantSkuIds = extractVariantSkuIds(doc.variants)

  return {
    productId,
    title,
    brand: String(doc.brand || '').trim() || null,
    productBaseName: normalizeToString(doc.product_base_name),
    price: normalizeOptionalPrice(doc.sale_price) ?? normalizeOptionalPrice(doc.price),
    url: String(doc.url || '').trim() || null,
    imageUrl: String(doc.thumb_image || '').trim() || null,
    variantMasterRecordId: normalizeToString(doc.variant_master_recordid),
    variantSkuIds,
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

export async function searchStoreVisitProducts(query: string, limit = 8): Promise<StoreVisitProductCatalogItem[]> {
  const normalizedQuery = String(query || '').trim()
  const normalizedLimit = Math.max(1, Math.min(12, Number(limit) || 8))

  if (normalizedQuery.length < 2) {
    return []
  }

  try {
    const upstreamResponse = await fetch(buildKeywordSearchUrl(normalizedQuery, normalizedLimit), {
      headers: {
        accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!upstreamResponse.ok) {
      throw new Error(`Search failed with status ${upstreamResponse.status}`)
    }

    const payload = (await upstreamResponse.json()) as BloomreachResponse
    return Array.from(
      new Map(
        (payload.response?.docs || [])
          .map(normalizeBloomreachDoc)
          .filter((item): item is StoreVisitProductCatalogItem => item !== null)
          .map((item) => [item.productId, item])
      ).values()
    )
  } catch (error) {
    console.error('Failed to search store visit products:', error)
    return []
  }
}

async function loadStoreVisitProductCatalog(): Promise<StoreVisitProductCatalogItem[]> {
  try {
    const firstResponse = await fetch(buildBloomreachUrl(0, BLOOMREACH_PAGE_SIZE), {
      next: { revalidate: 21_600 },
      headers: {
        accept: 'application/json',
      },
    })

    if (!firstResponse.ok) {
      throw new Error(`Catalog request failed with status ${firstResponse.status}`)
    }

    const firstPayload = (await firstResponse.json()) as BloomreachResponse
    const firstDocs = firstPayload.response?.docs || []
    const totalRows = Number(firstPayload.response?.numFound || 0)
    const pageCount = Math.min(
      BLOOMREACH_MAX_PAGES,
      Math.max(1, Math.ceil(totalRows / BLOOMREACH_PAGE_SIZE))
    )

    const remainingResponses =
      pageCount > 1
        ? await Promise.all(
            Array.from({ length: pageCount - 1 }, (_, index) =>
              fetch(buildBloomreachUrl((index + 1) * BLOOMREACH_PAGE_SIZE, BLOOMREACH_PAGE_SIZE), {
                next: { revalidate: 21_600 },
                headers: {
                  accept: 'application/json',
                },
              })
            )
          )
        : []

    const remainingDocs = await Promise.all(
      remainingResponses.map(async (response) => {
        if (!response.ok) return []
        const payload = (await response.json()) as BloomreachResponse
        return payload.response?.docs || []
      })
    )

    return Array.from(new Map(
      [...firstDocs, ...remainingDocs.flat()]
        .map(normalizeBloomreachDoc)
        .filter((item): item is StoreVisitProductCatalogItem => item !== null)
        .map((item) => [item.productId, item])
    ).values()).sort((a, b) => {
      const brandCompare = (a.brand || '').localeCompare(b.brand || '')
      if (brandCompare !== 0) return brandCompare
      return a.title.localeCompare(b.title)
    })
  } catch (error) {
    console.error('Failed to load store visit product catalog:', error)
    return []
  }
}

export const getStoreVisitProductCatalog = unstable_cache(
  loadStoreVisitProductCatalog,
  ['store-visit-product-catalog'],
  { revalidate: 21_600 }
)
