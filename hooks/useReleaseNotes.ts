'use client'

import { useState, useEffect, useCallback } from 'react'

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
      const response = await fetch('/api/releases/latest', { method: 'GET' })
      if (!response.ok) {
        setLoading(false)
        return
      }
      const payload = await response.json()
      setLatestRelease(payload.release || null)
      setShouldShow(Boolean(payload.release && payload.shouldShow))
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  const dismissRelease = useCallback(async () => {
    if (!latestRelease) return
    try {
      await fetch('/api/releases/latest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseId: latestRelease.id }),
      })

      setShouldShow(false)
    } catch {
      setShouldShow(false)
    }
  }, [latestRelease])

  return { latestRelease, shouldShow, loading, dismissRelease }
}
