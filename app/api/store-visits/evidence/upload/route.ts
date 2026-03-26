import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { isStoreVisitActivityKey } from '@/lib/visit-needs'

const WRITABLE_ROLES = new Set(['admin', 'ops'])
const MAX_FILE_SIZE = 10 * 1024 * 1024

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
}

function isAllowedFile(file: File): boolean {
  if (file.type === 'application/pdf') return true
  if (file.type.startsWith('image/')) return true
  return /\.(pdf|png|jpe?g|gif|webp|heic|heif)$/i.test(file.name)
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

    const { data: profile, error: profileError } = await supabase
      .from('fa_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || !WRITABLE_ROLES.has(profile.role)) {
      return NextResponse.json({ error: 'You do not have permission to upload visit evidence.' }, { status: 403 })
    }

    const formData = await request.formData()
    const visitId = String(formData.get('visitId') || '').trim()
    const activityKey = String(formData.get('activityKey') || '').trim()
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)

    if (!visitId || !activityKey || files.length === 0) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    if (!isStoreVisitActivityKey(activityKey)) {
      return NextResponse.json({ error: 'Activity key is invalid.' }, { status: 400 })
    }

    const { data: visit, error: visitError } = await supabase
      .from('tfs_store_visits')
      .select('id')
      .eq('id', visitId)
      .single()

    if (visitError || !visit) {
      return NextResponse.json({ error: 'Visit not found.' }, { status: 404 })
    }

    const uploadedRows: Array<{
      id: string
      activity_key: string
      file_name: string
      file_path: string
      file_type: string | null
      file_size: number | null
      created_at: string
    }> = []

    for (const file of files) {
      if (!isAllowedFile(file)) {
        return NextResponse.json(
          { error: `${file.name} is not a supported file type. Use PDF or image files.` },
          { status: 400 }
        )
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `${file.name} is larger than 10MB.` },
          { status: 400 }
        )
      }

      const timestamp = Date.now()
      const sanitizedName = sanitizeFileName(file.name)
      const filePath = `store-visit/${visitId}/${activityKey}/${timestamp}-${sanitizedName}`

      const { error: uploadError } = await supabase.storage
        .from('tfs-attachments')
        .upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })

      if (uploadError) {
        return NextResponse.json({ error: `Failed to upload ${file.name}: ${uploadError.message}` }, { status: 500 })
      }

      const { data: evidenceRow, error: evidenceError } = await supabase
        .from('tfs_store_visit_evidence')
        .insert({
          visit_id: visitId,
          activity_key: activityKey,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type || null,
          file_size: file.size,
          uploaded_by_user_id: user.id,
        })
        .select('id, activity_key, file_name, file_path, file_type, file_size, created_at')
        .single()

      if (evidenceError || !evidenceRow) {
        await supabase.storage.from('tfs-attachments').remove([filePath])
        return NextResponse.json(
          { error: `Failed to save metadata for ${file.name}: ${evidenceError?.message || 'Unknown error'}` },
          { status: 500 }
        )
      }

      uploadedRows.push(evidenceRow)
    }

    return NextResponse.json({ files: uploadedRows })
  } catch (error) {
    console.error('Error uploading store visit evidence:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload evidence' },
      { status: 500 }
    )
  }
}
