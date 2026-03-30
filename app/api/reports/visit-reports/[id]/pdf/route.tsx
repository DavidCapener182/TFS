import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeVisitReportPayload,
  type ActivityVisitReportPayload,
  type TargetedTheftVisitPayload,
  type VisitReportType,
} from '@/lib/reports/visit-report-types'
import { ActivityVisitReportPdfDocument } from '@/lib/pdf/activity-visit-report-document'
import { VisitReportPdfDocument } from '@/lib/pdf/visit-report-document'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getRelatedRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function mapSeverityToRisk(value: unknown): 'low' | 'medium' | 'high' | 'critical' | '' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'low') return 'low'
  if (normalized === 'medium') return 'medium'
  if (normalized === 'high') return 'high'
  if (normalized === 'critical') return 'critical'
  return ''
}

function formatIncidentNarrativeForPdf(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''

  return text
    // Ensure missing space after colon is fixed (e.g. "Recommendations:Loss")
    .replace(/:\s*(?=[A-Za-z])/g, ': ')
    // Keep common section headings visually separated in PDF.
    .replace(
      /\b(Incident Overview|Findings|Recommendations|Costings|Conclusion|Risk justification)\s*:/gi,
      '\n$1:\n'
    )
    // Collapse excessive blank lines while preserving paragraph breaks.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function getLatestLinkedIncidentSnapshot(supabase: ReturnType<typeof createClient>, reportId: string) {
  const fromMetaResult = await supabase
    .from('tfs_incidents')
    .select('id, summary, description, severity, updated_at')
    .eq('persons_involved->>visit_report_id', reportId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (!fromMetaResult.error && Array.isArray(fromMetaResult.data) && fromMetaResult.data.length > 0) {
    return fromMetaResult.data[0]
  }

  const fromDescriptionResult = await supabase
    .from('tfs_incidents')
    .select('id, summary, description, severity, updated_at')
    .ilike('description', `%Source visit report ID: ${reportId}%`)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (!fromDescriptionResult.error && Array.isArray(fromDescriptionResult.data) && fromDescriptionResult.data.length > 0) {
    return fromDescriptionResult.data[0]
  }

  return null
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
        report_type,
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
    const reportType = report.report_type as VisitReportType

    const normalizedPayload = normalizeVisitReportPayload(reportType, report.payload)

    let pdfDocument: React.ReactElement

    if (reportType === 'targeted_theft_visit') {
      const linkedIncident = await getLatestLinkedIncidentSnapshot(supabase, reportId)
      const payloadForPdf: TargetedTheftVisitPayload = {
        ...(normalizedPayload as TargetedTheftVisitPayload),
      }

      if (linkedIncident) {
        payloadForPdf.incidentOverview = {
          ...payloadForPdf.incidentOverview,
          summary: String(linkedIncident.summary || payloadForPdf.incidentOverview.summary || ''),
        }

        // Use incident description as a single source-of-truth override for
        // detailed recommendations so inline PDF always reflects latest edits.
        if (String(linkedIncident.description || '').trim()) {
          const formattedNarrative = formatIncidentNarrativeForPdf(linkedIncident.description)
          payloadForPdf.recommendations = {
            ...payloadForPdf.recommendations,
            details: formattedNarrative,
          }
        }

        const mappedRisk = mapSeverityToRisk(linkedIncident.severity)
        if (mappedRisk) {
          payloadForPdf.riskRating = mappedRisk
        }
      }

      pdfDocument = (
        <VisitReportPdfDocument
          reportTitle={report.title || 'Visit report'}
          status={report.status === 'final' ? 'final' : 'draft'}
          visitDate={report.visit_date}
          storeName={store?.store_name || 'Unknown store'}
          storeCode={store?.store_code || null}
          createdByName={createdBy?.full_name || null}
          generatedAt={new Date().toISOString()}
          payload={payloadForPdf}
        />
      )
    } else {
      pdfDocument = (
        <ActivityVisitReportPdfDocument
          reportTitle={report.title || 'Visit report'}
          reportType={reportType}
          status={report.status === 'final' ? 'final' : 'draft'}
          visitDate={report.visit_date}
          storeName={store?.store_name || 'Unknown store'}
          storeCode={store?.store_code || null}
          createdByName={createdBy?.full_name || null}
          generatedAt={new Date().toISOString()}
          payload={normalizedPayload as ActivityVisitReportPayload}
        />
      )
    }

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
