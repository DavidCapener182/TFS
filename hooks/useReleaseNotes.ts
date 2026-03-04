'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ReleaseNote {
  id: string
  version: string
  title: string | null
  description: string | null
  content: string | null
  created_at: string
  is_active: boolean
}

export function useReleaseNotes() {
  const [latestRelease, setLatestRelease] = useState<ReleaseNote | null>(null)
  const [shouldShow, setShouldShow] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkForNewRelease()
  }, [])

  async function checkForNewRelease() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: release } = await supabase
        .from('release_notes')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!release) {
        setLoading(false)
        return
      }

      const { data: viewed } = await supabase
        .from('user_release_views')
        .select('id')
        .eq('user_id', user.id)
        .eq('release_id', release.id)
        .maybeSingle()

      setLatestRelease(release)
      setShouldShow(!viewed)
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  const dismissRelease = useCallback(async () => {
    if (!latestRelease) return
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('user_release_views')
        .insert({ user_id: user.id, release_id: latestRelease.id })

      setShouldShow(false)
    } catch {
      setShouldShow(false)
    }
  }, [latestRelease])

  return { latestRelease, shouldShow, loading, dismissRelease }
}
