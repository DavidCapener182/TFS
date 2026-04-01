'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'
import { formatStoreCrmActionError, isMissingStoreCrmTableError } from '@/lib/store-crm-schema'

const CONTACT_METHODS = new Set(['phone', 'email', 'either'])
const NOTE_TYPES = new Set(['general', 'contact', 'audit', 'fra', 'other'])
const INTERACTION_TYPES = new Set([
  'phone_call',
  'email',
  'meeting',
  'visit',
  'audit_update',
  'fra_update',
  'other',
])

interface AuthenticatedWritableContext {
  supabase: ReturnType<typeof createClient>
  userId: string
}

function revalidateStorePaths(storeId: string) {
  revalidatePath('/stores')
  revalidatePath(`/stores/${storeId}`)
}

function toDateOnly(value?: string | null): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date provided')
  }
  return parsed.toISOString().split('T')[0]
}

function toIsoDateTime(value?: string | null): string {
  if (!value) return new Date().toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date and time provided')
  }
  return parsed.toISOString()
}

async function getWritableContext(): Promise<AuthenticatedWritableContext> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  return { supabase, userId: user.id }
}

export interface CreateStoreContactInput {
  storeId: string
  contactName: string
  jobTitle?: string
  email?: string
  phone?: string
  preferredMethod?: 'phone' | 'email' | 'either'
  isPrimary?: boolean
  notes?: string
}

export async function createStoreContact(input: CreateStoreContactInput) {
  const storeId = String(input.storeId || '').trim()
  const contactName = String(input.contactName || '').trim()
  const email = String(input.email || '').trim() || null
  const phone = String(input.phone || '').trim() || null
  const jobTitle = String(input.jobTitle || '').trim() || null
  const notes = String(input.notes || '').trim() || null
  const preferredMethod = input.preferredMethod || null
  const isPrimary = input.isPrimary === true

  if (!storeId) throw new Error('Store is required')
  if (!contactName) throw new Error('Contact name is required')
  if (preferredMethod && !CONTACT_METHODS.has(preferredMethod)) {
    throw new Error('Invalid preferred contact method')
  }

  const { supabase, userId } = await getWritableContext()

  if (isPrimary) {
    const { error: clearPrimaryError } = await supabase
      .from('tfs_store_contacts')
      .update({ is_primary: false })
      .eq('store_id', storeId)
      .eq('is_primary', true)

    if (clearPrimaryError) {
      throw new Error(formatStoreCrmActionError('Failed to update primary contact state', clearPrimaryError))
    }
  }

  const { data, error } = await supabase
    .from('tfs_store_contacts')
    .insert({
      store_id: storeId,
      contact_name: contactName,
      job_title: jobTitle,
      email,
      phone,
      preferred_method: preferredMethod,
      is_primary: isPrimary,
      notes,
      created_by_user_id: userId,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(formatStoreCrmActionError('Failed to create store contact', error))
  }

  try {
    await logActivity('store', storeId, 'CRM_CONTACT_CREATED', {
      contact_id: data.id,
      contact_name: contactName,
    })
  } catch (logError) {
    console.error('Failed to log contact creation activity:', logError)
  }

  revalidateStorePaths(storeId)
  return data
}

export async function deleteStoreContact(storeId: string, contactId: string) {
  const normalizedStoreId = String(storeId || '').trim()
  const normalizedContactId = String(contactId || '').trim()

  if (!normalizedStoreId || !normalizedContactId) {
    throw new Error('Store and contact are required')
  }

  const { supabase } = await getWritableContext()

  const { error } = await supabase
    .from('tfs_store_contacts')
    .delete()
    .eq('id', normalizedContactId)
    .eq('store_id', normalizedStoreId)

  if (error) {
    throw new Error(formatStoreCrmActionError('Failed to delete store contact', error))
  }

  try {
    await logActivity('store', normalizedStoreId, 'CRM_CONTACT_DELETED', {
      contact_id: normalizedContactId,
    })
  } catch (logError) {
    console.error('Failed to log contact deletion activity:', logError)
  }

  revalidateStorePaths(normalizedStoreId)
  return { success: true }
}

export interface CreateStoreNoteInput {
  storeId: string
  noteType?: 'general' | 'contact' | 'audit' | 'fra' | 'other'
  title?: string
  body: string
}

export async function createStoreNote(input: CreateStoreNoteInput) {
  const storeId = String(input.storeId || '').trim()
  const noteType = String(input.noteType || 'general').trim()
  const title = String(input.title || '').trim() || null
  const body = String(input.body || '').trim()

  if (!storeId) throw new Error('Store is required')
  if (!body) throw new Error('Note body is required')
  if (!NOTE_TYPES.has(noteType)) throw new Error('Invalid note type')

  const { supabase, userId } = await getWritableContext()

  const { data, error } = await supabase
    .from('tfs_store_notes')
    .insert({
      store_id: storeId,
      note_type: noteType,
      title,
      body,
      created_by_user_id: userId,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(formatStoreCrmActionError('Failed to create store note', error))
  }

  try {
    await logActivity('store', storeId, 'CRM_NOTE_CREATED', {
      note_id: data.id,
      note_type: noteType,
    })
  } catch (logError) {
    console.error('Failed to log note creation activity:', logError)
  }

  revalidateStorePaths(storeId)
  return data
}

export async function deleteStoreNote(storeId: string, noteId: string) {
  const normalizedStoreId = String(storeId || '').trim()
  const normalizedNoteId = String(noteId || '').trim()

  if (!normalizedStoreId || !normalizedNoteId) {
    throw new Error('Store and note are required')
  }

  const { supabase } = await getWritableContext()

  const { error } = await supabase
    .from('tfs_store_notes')
    .delete()
    .eq('id', normalizedNoteId)
    .eq('store_id', normalizedStoreId)

  if (error) {
    throw new Error(formatStoreCrmActionError('Failed to delete store note', error))
  }

  try {
    await logActivity('store', normalizedStoreId, 'CRM_NOTE_DELETED', {
      note_id: normalizedNoteId,
    })
  } catch (logError) {
    console.error('Failed to log note deletion activity:', logError)
  }

  revalidateStorePaths(normalizedStoreId)
  return { success: true }
}

export interface CreateStoreContactTrackerInput {
  storeId: string
  contactId?: string | null
  interactionType: 'phone_call' | 'email' | 'meeting' | 'visit' | 'audit_update' | 'fra_update' | 'other'
  subject: string
  details?: string
  outcome?: string
  interactionAt?: string
  followUpDate?: string
}

export async function createStoreContactTrackerEntry(input: CreateStoreContactTrackerInput) {
  const storeId = String(input.storeId || '').trim()
  const contactId = String(input.contactId || '').trim() || null
  const interactionType = String(input.interactionType || '').trim()
  const subject = String(input.subject || '').trim()
  const details = String(input.details || '').trim() || null
  const outcome = String(input.outcome || '').trim() || null
  const interactionAt = toIsoDateTime(input.interactionAt)
  const followUpDate = toDateOnly(input.followUpDate)

  if (!storeId) throw new Error('Store is required')
  if (!subject) throw new Error('Subject is required')
  if (!INTERACTION_TYPES.has(interactionType)) {
    throw new Error('Invalid interaction type')
  }

  const { supabase, userId } = await getWritableContext()

  if (contactId) {
    const { data: contact, error: contactError } = await supabase
      .from('tfs_store_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (contactError) {
      if (isMissingStoreCrmTableError(contactError)) {
        throw new Error(formatStoreCrmActionError('CRM is unavailable', contactError))
      }
      throw new Error(`Selected contact lookup failed: ${contactError.message}`)
    }

    if (!contact) {
      throw new Error('Selected contact was not found for this store')
    }
  }

  const { data, error } = await supabase
    .from('tfs_store_contact_tracker')
    .insert({
      store_id: storeId,
      contact_id: contactId,
      interaction_type: interactionType,
      subject,
      details,
      outcome,
      interaction_at: interactionAt,
      follow_up_date: followUpDate,
      created_by_user_id: userId,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(formatStoreCrmActionError('Failed to create contact tracker entry', error))
  }

  try {
    await logActivity('store', storeId, 'CRM_TRACKER_ENTRY_CREATED', {
      entry_id: data.id,
      interaction_type: interactionType,
      subject,
    })
  } catch (logError) {
    console.error('Failed to log tracker creation activity:', logError)
  }

  revalidateStorePaths(storeId)
  return data
}

export async function deleteStoreContactTrackerEntry(storeId: string, entryId: string) {
  const normalizedStoreId = String(storeId || '').trim()
  const normalizedEntryId = String(entryId || '').trim()

  if (!normalizedStoreId || !normalizedEntryId) {
    throw new Error('Store and tracker entry are required')
  }

  const { supabase } = await getWritableContext()

  const { error } = await supabase
    .from('tfs_store_contact_tracker')
    .delete()
    .eq('id', normalizedEntryId)
    .eq('store_id', normalizedStoreId)

  if (error) {
    throw new Error(formatStoreCrmActionError('Failed to delete contact tracker entry', error))
  }

  try {
    await logActivity('store', normalizedStoreId, 'CRM_TRACKER_ENTRY_DELETED', {
      entry_id: normalizedEntryId,
    })
  } catch (logError) {
    console.error('Failed to log tracker deletion activity:', logError)
  }

  revalidateStorePaths(normalizedStoreId)
  return { success: true }
}
