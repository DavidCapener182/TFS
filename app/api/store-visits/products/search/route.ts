import { NextRequest, NextResponse } from 'next/server'
import { searchStoreVisitProducts } from '@/lib/store-visit-product-catalog'
import { checkRateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, 'store-product-search', {
    limit: 120,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Too many product searches. Please wait a moment and try again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
        },
      }
    )
  }

  const query = request.nextUrl.searchParams.get('q') || ''
  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 8)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 20) : 8
  const results = await searchStoreVisitProducts(query, limit)

  return NextResponse.json({
    items: results,
    results,
    count: results.length,
  })
}
