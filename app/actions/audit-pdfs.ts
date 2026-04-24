'use server'

import { createClient } from '@/lib/supabase/server'

const WRITABLE_ROLES = new Set(['admin', 'ops'])

async function requireWritableProfile(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: profile, error } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !profile || !WRITABLE_ROLES.has(profile.role)) {
    throw new Error('Forbidden')
  }
}

/**
 * Upload a PDF file for a compliance audit
 * @param storeId - The store ID
 * @param auditNumber - 1 or 2 for audit 1 or audit 2
 * @param file - The PDF file to upload
 * @returns The file path in storage
 */
export async function uploadAuditPDF(
  storeId: string,
  auditNumber: 1 | 2,
  file: File
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  await requireWritableProfile(supabase, user.id)

  // Validate file type
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are allowed')
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    throw new Error('File size must be less than 10MB')
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
      upsert: false // Don't overwrite existing files
    })

  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`)
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
    throw new Error(`Failed to update store record: ${updateError.message}`)
  }

  return filePath
}

/**
 * Get a signed URL for downloading an audit PDF
 * @param filePath - The file path in storage
 * @returns The signed URL (valid for 1 hour)
 */
export async function getAuditPDFDownloadUrl(filePath: string | null) {
  if (!filePath) {
    return null
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data, error } = await supabase.storage
    .from('fa-attachments')
    .createSignedUrl(filePath, 3600) // 1 hour expiry

  if (error || !data) {
    throw new Error('Failed to generate download URL')
  }

  return data.signedUrl
}

/**
 * Delete an audit PDF file
 * @param storeId - The store ID
 * @param auditNumber - 1 or 2 for audit 1 or audit 2
 * @returns Success status
 */
export async function deleteAuditPDF(
  storeId: string,
  auditNumber: 1 | 2
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Get current PDF path
  const pdfColumn = auditNumber === 1 
    ? 'compliance_audit_1_pdf_path' 
    : 'compliance_audit_2_pdf_path'

  const { data: store, error: fetchError } = await supabase
    .from('tfs_stores')
    .select(pdfColumn)
    .eq('id', storeId)
    .single()

  if (fetchError || !store) {
    throw new Error('Store not found')
  }

  const pdfPath = store[pdfColumn as keyof typeof store] as string | null

  if (!pdfPath) {
    throw new Error('No PDF found to delete')
  }

  // Delete from storage
  const { error: deleteError } = await supabase.storage
    .from('fa-attachments')
    .remove([pdfPath])

  if (deleteError) {
    throw new Error(`Failed to delete PDF from storage: ${deleteError.message}`)
  }

  // Update store record to remove PDF path
  const { error: updateError } = await supabase
    .from('tfs_stores')
    .update({ [pdfColumn]: null })
    .eq('id', storeId)

  if (updateError) {
    throw new Error(`Failed to update store record: ${updateError.message}`)
  }

  return { success: true }
}

