'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'
import { revalidatePath } from 'next/cache'
import { FaEntityType } from '@/types/db'

export async function uploadAttachment(
  entityType: FaEntityType,
  entityId: string,
  file: File
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const fileExt = file.name.split('.').pop()
  const fileName = `${entityId}/${Date.now()}.${fileExt}`
  const filePath = `${entityType}/${fileName}`

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('tfs-attachments')
    .upload(filePath, file)

  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`)
  }

  // Create attachment record
  const { data: attachment, error: dbError } = await supabase
    .from('tfs_attachments')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      uploaded_by_user_id: user.id,
    })
    .select()
    .single()

  if (dbError) {
    // Clean up uploaded file if DB insert fails
    await supabase.storage.from('tfs-attachments').remove([filePath])
    throw new Error(`Failed to create attachment record: ${dbError.message}`)
  }

  await logActivity(entityType, entityId, 'ATTACHMENT_UPLOADED', {
    attachment_id: attachment.id,
    file_name: file.name,
  })

  revalidatePath(`/incidents/${entityId}`)
  return attachment
}

export async function getAttachmentDownloadUrl(attachmentId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: attachment, error } = await supabase
    .from('tfs_attachments')
    .select('file_path')
    .eq('id', attachmentId)
    .single()

  if (error || !attachment) {
    throw new Error('Attachment not found')
  }

  const { data } = await supabase.storage
    .from('tfs-attachments')
    .createSignedUrl(attachment.file_path, 3600) // 1 hour expiry

  if (!data) {
    throw new Error('Failed to generate download URL')
  }

  return data.signedUrl
}


