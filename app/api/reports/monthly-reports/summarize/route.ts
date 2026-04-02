import { NextRequest, NextResponse } from 'next/server'

import { summarizeMonthlyVisitDetails } from '@/lib/ai/monthly-report-summarize'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type MonthlyReportSummarizeRequestBody = {
  storeName?: unknown
  reportLabels?: unknown
  detailText?: unknown
  forceRefresh?: unknown
}

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = ((await request.json().catch(() => ({}))) || {}) as MonthlyReportSummarizeRequestBody
    const storeName = toText(body.storeName)
    const detailText = toText(body.detailText)
    const reportLabels = Array.isArray(body.reportLabels)
      ? body.reportLabels.map((value) => toText(value)).filter(Boolean)
      : []
    const forceRefresh = body.forceRefresh === true

    if (!detailText) {
      return NextResponse.json({ error: 'No detail text was provided.' }, { status: 400 })
    }

    const result = await summarizeMonthlyVisitDetails({
      storeName: storeName || 'Unknown Store',
      reportLabels,
      detailText,
    }, { forceRefresh })

    return NextResponse.json({
      summary: result.summary,
      provider: result.provider,
      usedAi: result.usedAi,
      errorMessage: result.errorMessage,
    })
  } catch (error: any) {
    console.error('Failed generating monthly report summary:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to summarise monthly report details' },
      { status: 500 }
    )
  }
}
