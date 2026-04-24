'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type FollowUpCandidate = {
  incidentId: string
  incidentTitle: string
  incidentReferenceNo: string
  storeId: string
  storeName: string
  reportedAt: string
}

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

async function requireWritableProfile(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: profile, error } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !profile || (profile.role !== 'admin' && profile.role !== 'ops')) {
    throw new Error('Forbidden')
  }
}

export async function getFollowUpCandidate(): Promise<FollowUpCandidate | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  await requireWritableProfile(supabase, user.id)

  // "Might need follow-up" heuristic:
  // - open / under investigation incidents
  // - sourced from a visit report (we set persons_involved.source = 'visit_report')
  // - no open actions exist yet
  const { data: incidents, error } = await supabase
    .from('tfs_incidents')
    .select(
      `
      id,
      reference_no,
      summary,
      status,
      reported_at,
      store_id,
      persons_involved,
      tfs_stores:store_id(store_name)
    `
    )
    .in('status', ['open', 'under_investigation', 'actions_in_progress'])
    .order('reported_at', { ascending: false })
    .limit(15)

  if (error) {
    console.error('Error fetching follow-up candidate incidents:', error)
    return null
  }

  for (const incident of incidents || []) {
    const source = (incident as any)?.persons_involved?.source
    if (String(source || '').toLowerCase() !== 'visit_report') continue
    if (normalizeStatus((incident as any).status) === 'actions_in_progress') {
      // Still allow; we'll rely on action count.
    }

    const { count, error: countError } = await supabase
      .from('tfs_actions')
      .select('id', { count: 'exact', head: true })
      .eq('incident_id', (incident as any).id)
      .not('title', 'ilike', 'Implement visit report actions:%')

    if (countError) {
      console.error('Error checking follow-up candidate action count:', countError)
      continue
    }

    // Any linked action record (open or completed) means follow-up has already been handled.
    if ((count || 0) > 0) continue

    const storeRel = Array.isArray((incident as any).tfs_stores)
      ? (incident as any).tfs_stores[0]
      : (incident as any).tfs_stores

    return {
      incidentId: (incident as any).id,
      incidentTitle: String((incident as any).summary || 'Incident follow-up').trim(),
      incidentReferenceNo: String((incident as any).reference_no || '').trim(),
      storeId: String((incident as any).store_id || '').trim(),
      storeName: String(storeRel?.store_name || 'Unknown store').trim(),
      reportedAt: String((incident as any).reported_at || '').trim(),
    }
  }

  return null
}

export async function declineFollowUp(incidentId: string) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  await requireWritableProfile(supabase, user.id)

  const { error } = await supabase
    .from('tfs_incidents')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closure_summary: 'Follow-up declined — marked complete.',
    })
    .eq('id', incidentId)

  if (error) {
    throw new Error(`Failed to close incident: ${error.message}`)
  }

  revalidatePath('/dashboard')
  revalidatePath('/incidents')
  revalidatePath(`/incidents/${incidentId}`)
  revalidatePath('/stores')
}
