import type { NextApiRequest, NextApiResponse } from 'next'

import { searchStoreVisitProducts } from '@/lib/store-visit-product-catalog'

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ items: [], error: 'Method not allowed' })
  }

  try {
    const query = String(request.query.q || '').trim()
    const limit = Math.max(1, Math.min(12, Number(request.query.limit || 8)))
    const items = await searchStoreVisitProducts(query, limit)

    return response.status(200).json({ items })
  } catch (error) {
    console.error('Error searching store visit products:', error)
    return response.status(500).json({
      items: [],
      error: error instanceof Error ? error.message : 'Failed to search products',
    })
  }
}
