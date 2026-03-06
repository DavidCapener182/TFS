import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_FRA_PDF_SIZE_BYTES = 25 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const storeId = formData.get('storeId') as string
    const file = formData.get('file') as File

    if (!storeId || !file) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    if (file.size > MAX_FRA_PDF_SIZE_BYTES) {
      return NextResponse.json({ error: 'File size must be less than 25MB' }, { status: 400 })
    }

    const fileExt = 'pdf'
    const timestamp = Date.now()
    const fileName = `fra-${timestamp}.${fileExt}`
    const filePath = `store/${storeId}/${fileName}`

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('fa-attachments')
      .upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      return NextResponse.json({ error: `Failed to upload file: ${uploadError.message}` }, { status: 500 })
    }

    // Update the store record with the PDF path
    const { error: updateError } = await supabase
      .from('fa_stores')
      .update({ fire_risk_assessment_pdf_path: filePath })
      .eq('id', storeId)

    if (updateError) {
      // Clean up uploaded file if DB update fails
      await supabase.storage.from('fa-attachments').remove([filePath])
      return NextResponse.json({ error: `Failed to update store record: ${updateError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, filePath })
  } catch (error) {
    console.error('Error uploading FRA PDF:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload PDF' },
      { status: 500 }
    )
  }
}
