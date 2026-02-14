import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { buildMonthlyNewsletterData } from '@/lib/reports/monthly-newsletter'
import type {
  MonthlyNewsletterRequestBody,
  NewsletterAIPromptPack,
} from '@/lib/reports/monthly-newsletter-types'
import { MonthlyNewsletterPDF } from '@/lib/pdf/monthly-newsletter-document-v5'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const MONTHLY_NEWSLETTER_PDF_TEMPLATE_VERSION = 'v5'

function toFileSafeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toTimestampToken(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return `${Date.now()}`
  const yyyy = `${date.getUTCFullYear()}`
  const mm = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const dd = `${date.getUTCDate()}`.padStart(2, '0')
  const hh = `${date.getUTCHours()}`.padStart(2, '0')
  const min = `${date.getUTCMinutes()}`.padStart(2, '0')
  const sec = `${date.getUTCSeconds()}`.padStart(2, '0')
  return `${yyyy}${mm}${dd}-${hh}${min}${sec}`
}

function parseAiPromptPack(value: unknown): NewsletterAIPromptPack | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const generateBriefing = typeof raw.generateBriefing === 'string' ? raw.generateBriefing.trim() : ''
  const composeNewsletter = typeof raw.composeNewsletter === 'string' ? raw.composeNewsletter.trim() : ''
  const analyzeRegionalRisk =
    typeof raw.analyzeRegionalRisk === 'string' ? raw.analyzeRegionalRisk.trim() : ''

  if (!generateBriefing && !composeNewsletter && !analyzeRegionalRisk) {
    return null
  }

  return {
    generateBriefing,
    composeNewsletter,
    analyzeRegionalRisk,
  }
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

    const body = ((await request.json().catch(() => ({}))) || {}) as MonthlyNewsletterRequestBody & {
      aiPromptPack?: unknown
    }
    const aiPromptPack = parseAiPromptPack(body.aiPromptPack)

    const areaCodeRaw = body.areaCode || body.managerId || null
    const areaCode =
      typeof areaCodeRaw === 'string' && areaCodeRaw.trim().length > 0
        ? areaCodeRaw.trim().toUpperCase()
        : null
    const selectedAreaCode = areaCode && areaCode !== 'ALL' ? areaCode : null

    const newsletter = await buildMonthlyNewsletterData(supabase, {
      ...body,
      areaCode: selectedAreaCode || undefined,
    })

    const report = selectedAreaCode
      ? newsletter.areaReports.find((item) => item.areaCode === selectedAreaCode)
      : newsletter.areaReports[0]

    if (!report) {
      return NextResponse.json(
        { error: 'No newsletter data found for the selected area' },
        { status: 404 }
      )
    }

    const pdfDocument = (
      <MonthlyNewsletterPDF
        report={report}
        periodLabel={newsletter.period.label}
        generatedAt={newsletter.generatedAt}
        aiPromptPack={aiPromptPack}
      />
    )

    const buffer = await renderToBuffer(pdfDocument)
    const fileName = `monthly-newsletter-${newsletter.period.month}-${toFileSafeName(
      report.areaLabel || 'area'
    ) || 'area'}-${MONTHLY_NEWSLETTER_PDF_TEMPLATE_VERSION}-${toTimestampToken(
      newsletter.generatedAt
    )}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Pdf-Template-Version': MONTHLY_NEWSLETTER_PDF_TEMPLATE_VERSION,
      },
    })
  } catch (error: any) {
    console.error('Error generating monthly newsletter PDF:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate monthly newsletter PDF' },
      { status: 500 }
    )
  }
}
