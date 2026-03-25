'use client'

import { createClient } from '@/lib/supabase/client'

const MAX_FRA_PDF_SIZE_BYTES = 25 * 1024 * 1024

export async function uploadFraPdfFromClient(storeId: string, file: File): Promise<string> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are allowed')
  }

  if (file.size > MAX_FRA_PDF_SIZE_BYTES) {
    throw new Error('File size must be less than 25MB')
  }

  const supabase = createClient()
  const filePath = `store/${storeId}/fra-${Date.now()}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('fa-attachments')
    .upload(filePath, file, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`)
  }

  const { error: updateError } = await supabase
    .from('tfs_stores')
    .update({ fire_risk_assessment_pdf_path: filePath })
    .eq('id', storeId)

  if (updateError) {
    await supabase.storage.from('fa-attachments').remove([filePath])
    throw new Error(`Failed to update store record: ${updateError.message}`)
  }

  return filePath
}
