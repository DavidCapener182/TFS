import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { normalizeTargetedTheftVisitPayload } from '@/lib/reports/visit-report-types'
import { VisitReportPdfDocument } from '@/lib/pdf/visit-report-document'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getRelatedRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

type Params = {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const mode = request.nextUrl.searchParams.get('mode') || 'download'
    const reportId = params.id

    const { data: report, error } = await supabase
      .from('tfs_visit_reports')
      .select(`
        id,
        title,
        status,
        visit_date,
        payload,
        created_at,
        store:tfs_stores!tfs_visit_reports_store_id_fkey(store_name, store_code),
        created_by:fa_profiles!tfs_visit_reports_created_by_user_id_fkey(full_name)
      `)
      .eq('id', reportId)
      .single()

    if (error || !report) {
      return NextResponse.json({ error: 'Visit report not found' }, { status: 404 })
    }

    const store = getRelatedRow(report.store)
    const createdBy = getRelatedRow(report.created_by)

    const normalizedPayload = normalizeTargetedTheftVisitPayload(report.payload)
    const pdfDocument = (
      <VisitReportPdfDocument
        reportTitle={report.title || 'Visit report'}
        status={report.status === 'final' ? 'final' : 'draft'}
        visitDate={report.visit_date}
        storeName={store?.store_name || 'Unknown store'}
        storeCode={store?.store_code || null}
        createdByName={createdBy?.full_name || null}
        generatedAt={new Date().toISOString()}
        payload={normalizedPayload}
      />
    )

    const buffer = await renderToBuffer(pdfDocument)
    const safeFile = (report.title || 'visit-report')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const contentDisposition =
      mode === 'view'
        ? `inline; filename="${safeFile || 'visit-report'}.pdf"`
        : `attachment; filename="${safeFile || 'visit-report'}.pdf"`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    })
  } catch (error: any) {
    console.error('Failed generating visit report PDF:', error)
    return NextResponse.json({ error: error?.message || 'Failed to generate PDF' }, { status: 500 })
  }
}

