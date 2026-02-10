import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildMonthlyNewsletterData } from '@/lib/reports/monthly-newsletter'
import type { MonthlyNewsletterRequestBody } from '@/lib/reports/monthly-newsletter-types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = ((await request.json().catch(() => ({}))) || {}) as MonthlyNewsletterRequestBody
    const newsletter = await buildMonthlyNewsletterData(supabase, body)

    return NextResponse.json(newsletter)
  } catch (error: any) {
    console.error('Error generating monthly newsletter:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate monthly newsletter' },
      { status: 500 }
    )
  }
}
