import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    return NextResponse.json({ candidate: null })
  }

  for (const incident of incidents || []) {
    const source = (incident as any)?.persons_involved?.source
    if (String(source || '').toLowerCase() !== 'visit_report') continue
    if (normalizeStatus((incident as any).status) === 'actions_in_progress') {
      // keep evaluating based on action count below
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

    return NextResponse.json({
      candidate: {
        incidentId: (incident as any).id,
        incidentTitle: String((incident as any).summary || 'Incident follow-up').trim(),
        incidentReferenceNo: String((incident as any).reference_no || '').trim(),
        storeId: String((incident as any).store_id || '').trim(),
        storeName: String(storeRel?.store_name || 'Unknown store').trim(),
        reportedAt: String((incident as any).reported_at || '').trim(),
      },
    })
  }

  return NextResponse.json({ candidate: null })
}

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const incidentId = String((body as any)?.incidentId || '').trim()
  if (!incidentId) {
    return NextResponse.json({ error: 'incidentId is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('tfs_incidents')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closure_summary: 'Follow-up declined — marked complete.',
    })
    .eq('id', incidentId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

