import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    // Get store data
    const { data: store, error: storeError } = await supabase
      .from('tfs_stores')
      .select('*')
      .eq('id', storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // Return store data - map will be rendered client-side using Leaflet/OpenStreetMap
    // No API key needed for OpenStreetMap tiles

    return NextResponse.json({
      store: {
        ...store,
        // These fields can be populated by web search APIs in the future
        build_date: store.build_date || null,
        opening_times: store.opening_times || null,
      }
    })
  } catch (error: any) {
    console.error('Error fetching store info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch store info', details: error.message },
      { status: 500 }
    )
  }
}
