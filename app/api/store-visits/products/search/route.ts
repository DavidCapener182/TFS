import { NextRequest, NextResponse } from 'next/server'
import { searchStoreVisitProducts } from '@/lib/store-visit-product-catalog'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || ''
  const results = await searchStoreVisitProducts(query, 8)
  return NextResponse.json({ results })
}
