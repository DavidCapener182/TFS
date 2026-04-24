'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'
import { revalidatePath } from 'next/cache'
import { FaEntityType } from '@/types/db'

const WRITABLE_ROLES = new Set(['admin', 'ops'])
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
}

function isAllowedAttachment(file: File) {
  if (file.type === 'application/pdf') return true
  if (file.type.startsWith('image/')) return true
  return /\.(pdf|png|jpe?g|gif|webp|heic|heif)$/i.test(file.name)
}

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

  await requireWritableProfile(supabase, user.id)

  if (!isAllowedAttachment(file)) {
    throw new Error('Only PDF or image files are allowed')
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('File size must be less than 10MB')
  }

  const safeName = sanitizeFileName(file.name || 'attachment')
  const fileName = `${entityId}/${Date.now()}-${safeName}`
  const filePath = `${entityType}/${fileName}`

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('tfs-attachments')
    .upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

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

