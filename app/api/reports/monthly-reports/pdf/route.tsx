import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'

import { summarizeMonthlyVisitDetailsWithAI } from '@/lib/ai/monthly-report-summarize'
import { MonthlyReportPdfDocument } from '@/lib/pdf/monthly-report-document'
import {
  buildMonthlyReportData,
  type MonthlyReportPdfRequestBody,
} from '@/lib/reports/monthly-report'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function toFileSafeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseSupportCalls(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.round(numeric))
}

function toTrimmedString(value: unknown) {
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

    const body = ((await request.json().catch(() => ({}))) || {}) as MonthlyReportPdfRequestBody
    const data = await buildMonthlyReportData(supabase, body.month || null)
    const supportCalls = parseSupportCalls(body.areaManagerSupportCalls)
    let detailOverrides =
      body.detailOverrides && typeof body.detailOverrides === 'object' && !Array.isArray(body.detailOverrides)
        ? Object.fromEntries(
            Object.entries(body.detailOverrides).map(([key, value]) => [key, typeof value === 'string' ? value : ''])
          )
        : null
    const useAiSummaries = body.useAiSummaries === true

    if (useAiSummaries) {
      const aiSummaries = await Promise.all(
        data.rows.map(async (row) => {
          if (row.source === 'incident') return null

          const hasOverride = Boolean(
            detailOverrides && Object.prototype.hasOwnProperty.call(detailOverrides, row.id)
          )
          const currentOverrideRaw = typeof detailOverrides?.[row.id] === 'string' ? detailOverrides[row.id] : ''
          const currentOverride = toTrimmedString(currentOverrideRaw)
          const currentBase = toTrimmedString(row.generatedDetails)

          if (hasOverride && currentOverride !== currentBase) {
            return [row.id, currentOverrideRaw] as const
          }

          const summary = await summarizeMonthlyVisitDetailsWithAI({
            storeName: row.storeName,
            reportLabels: row.reportLabels,
            detailText: row.summarySourceDetails || row.generatedDetails,
          })

          return [row.id, summary] as const
        })
      )

      detailOverrides = {
        ...(detailOverrides || {}),
        ...Object.fromEntries(
          aiSummaries.filter((entry): entry is readonly [string, string] => Boolean(entry))
        ),
      }
    }

    const { data: profile } = await supabase
      .from('fa_profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const generatedAt = new Date().toISOString()
    const pdfDocument = (
      <MonthlyReportPdfDocument
        data={data}
        generatedAt={generatedAt}
        generatedByName={profile?.full_name || null}
        areaManagerSupportCalls={supportCalls}
        detailOverrides={detailOverrides}
      />
    )

    const buffer = await renderToBuffer(pdfDocument)
    const fileName = `monthly-report-${toFileSafeName(data.period.month)}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    })
  } catch (error: any) {
    console.error('Failed generating monthly report PDF:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate monthly report PDF' },
      { status: 500 }
    )
  }
}
