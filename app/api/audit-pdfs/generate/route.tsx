import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { getAuditInstance, getTemplate } from '@/app/actions/audits'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { InspectionReportPDF } from '@/lib/pdf/inspection-report-document'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const instanceId = searchParams.get('instanceId')
    const mode = searchParams.get('mode') || 'download' // 'view' or 'download'

    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    // Get audit instance with related data
    const instance = await getAuditInstance(instanceId)
    const template = await getTemplate(instance.template_id)

    // Get auditor profile
    let auditorName = 'Admin User'
    if (instance.conducted_by_user_id) {
      const { data: auditorProfile } = await supabase
        .from('fa_profiles')
        .select('full_name')
        .eq('id', instance.conducted_by_user_id)
        .single()
      if (auditorProfile?.full_name) {
        auditorName = auditorProfile.full_name
      }
    }

    // Calculate overall score
    const overallScore = instance.overall_score || 0

    // Create PDF
    const pdfDoc = (
      <InspectionReportPDF
        template={template}
        instance={instance}
        store={instance.tfs_stores}
        responses={instance.responses || []}
        media={instance.media || []}
        overallScore={Math.round(overallScore)}
        auditorName={auditorName}
      />
    )

    const pdfBuffer = await renderToBuffer(pdfDoc)
    const pdfArrayBuffer = new Uint8Array(pdfBuffer).buffer

    // Return PDF as response
    // Use 'inline' for viewing in browser, 'attachment' for downloading
    const contentDisposition = mode === 'view' 
      ? `inline; filename="inspection-report-${instanceId.slice(-8)}.pdf"`
      : `attachment; filename="inspection-report-${instanceId.slice(-8)}.pdf"`

    return new NextResponse(pdfArrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition,
      },
    })
  } catch (error: any) {
    console.error('Error generating PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error.message },
      { status: 500 }
    )
  }
}
