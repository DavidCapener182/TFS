import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

function isMissingReleaseTableError(error: unknown) {
  const payload = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const code = String(payload.code || '')
  const message = String(payload.message || '')
  return code === '42P01' || code === 'PGRST205' || /tfs_(release_notes|user_release_views)/i.test(message)
}

export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ release: null, shouldShow: false }, { status: 401 })
  }

  const { data: release, error: releaseError } = await supabase
    .from('tfs_release_notes')
    .select('id, version, title, description, content, created_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (releaseError) {
    if (!isMissingReleaseTableError(releaseError)) {
      console.error('release-notes: failed to fetch latest release', releaseError)
    }
    return NextResponse.json({ release: null, shouldShow: false })
  }

  if (!release) {
    return NextResponse.json({ release: null, shouldShow: false })
  }

  const { data: viewed, error: viewedError } = await supabase
    .from('tfs_user_release_views')
    .select('id')
    .eq('user_id', user.id)
    .eq('release_id', release.id)
    .maybeSingle()

  if (viewedError && !isMissingReleaseTableError(viewedError)) {
    console.error('release-notes: failed to fetch user release view', viewedError)
  }

  return NextResponse.json({
    release,
    shouldShow: !viewed && !viewedError,
  })
}

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const releaseId = String(payload?.releaseId || '').trim()
  if (!releaseId) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { error } = await supabase
    .from('tfs_user_release_views')
    .insert({ user_id: user.id, release_id: releaseId })

  if (error && !isMissingReleaseTableError(error)) {
    console.error('release-notes: failed to dismiss release', error)
  }

  return NextResponse.json({ ok: true })
}
