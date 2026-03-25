import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpeningHoursFromSearch } from '@/lib/fra/opening-hours-search'
import { getBuildDateFromSearch } from '@/lib/fra/build-date-search'
import { getStoreDataFromGoogleSearch } from '@/lib/fra/google-store-data-search'

export const dynamic = 'force-dynamic'

/**
 * Search for store build date and opening times using web search (ChatGPT).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { storeName, address, city, storeId } = await request.json()

    if (!storeName || !address) {
      return NextResponse.json({ error: 'storeName and address are required' }, { status: 400 })
    }

    const googleData = await getStoreDataFromGoogleSearch({ storeName, address, city })

    const [openAiOpeningTimes, openAiBuildDate] = await Promise.all([
      googleData.openingTimes ? Promise.resolve(null) : getOpeningHoursFromSearch({ storeName, address, city }),
      googleData.buildDate ? Promise.resolve(null) : getBuildDateFromSearch({ storeName, address, city }),
    ])

    const openingTimes = googleData.openingTimes || openAiOpeningTimes
    const buildDate = googleData.buildDate || openAiBuildDate
    const adjacentOccupancies = googleData.adjacentOccupancies || null
    const squareFootage = googleData.squareFootage || null

    // Persist any discovered store data to reduce repeat lookups.
    if (storeId && (openingTimes || buildDate)) {
      const updatePayload: Record<string, string> = {}
      if (openingTimes) updatePayload.opening_times = openingTimes
      if (buildDate) updatePayload.build_date = buildDate
      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from('tfs_stores')
          .update(updatePayload)
          .eq('id', storeId)
      }
    }

    return NextResponse.json({
      buildDate,
      openingTimes,
      adjacentOccupancies,
      squareFootage,
      message: openingTimes || buildDate || adjacentOccupancies || squareFootage
        ? 'Store data found via web search'
        : 'Store data not found via web search. Please add manually.'
    })
  } catch (error: any) {
    console.error('Error searching store data:', error)
    return NextResponse.json(
      { error: 'Failed to search store data', details: error.message },
      { status: 500 }
    )
  }
}
