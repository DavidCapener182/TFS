import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const storeId = formData.get('storeId') as string
    const auditNumber = parseInt(formData.get('auditNumber') as string) as 1 | 2
    const file = formData.get('file') as File

    if (!storeId || !auditNumber || !file) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    const fileExt = 'pdf'
    const timestamp = Date.now()
    const fileName = `audit-${auditNumber}-${timestamp}.${fileExt}`
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
    const pdfColumn = auditNumber === 1 
      ? 'compliance_audit_1_pdf_path' 
      : 'compliance_audit_2_pdf_path'

    const { error: updateError } = await supabase
      .from('tfs_stores')
      .update({ [pdfColumn]: filePath })
      .eq('id', storeId)

    if (updateError) {
      // Clean up uploaded file if DB update fails
      await supabase.storage.from('fa-attachments').remove([filePath])
      return NextResponse.json({ error: `Failed to update store record: ${updateError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, filePath })
  } catch (error) {
    console.error('Error uploading audit PDF:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload PDF' },
      { status: 500 }
    )
  }
}
