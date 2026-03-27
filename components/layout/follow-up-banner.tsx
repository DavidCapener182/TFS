'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FollowUpCandidate } from '@/app/actions/follow-up-banner'

export function FollowUpBanner({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [candidate, setCandidate] = useState<FollowUpCandidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/follow-up-banner', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        })
        if (!res.ok) {
          throw new Error(`Failed to fetch follow-up candidate (${res.status})`)
        }
        const json = (await res.json()) as { candidate: FollowUpCandidate | null }
        const next = json?.candidate || null
        if (!cancelled) setCandidate(next)
      } catch (e) {
        console.error('Failed to load follow-up candidate:', e)
        if (!cancelled) setCandidate(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pathname])

  if (loading || !candidate) return null

  const handleYes = () => {
    router.push(`/incidents/${candidate.incidentId}?tab=actions&newAction=1`)
  }

  const handleNo = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/follow-up-banner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incidentId: candidate.incidentId }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(String((json as any)?.error || `Failed to close incident (${res.status})`))
        }
        setCandidate(null)
        router.refresh()
      } catch (e) {
        console.error('Failed to decline follow-up:', e)
      }
    })
  }

  return (
    <div
      className={cn(
        'mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm',
        className
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            Follow-up needed?
          </div>
          <div className="mt-1 text-sm text-amber-900/90">
            <span className="font-semibold">{candidate.incidentTitle}</span>
            <span className="text-amber-900/70"> — {candidate.storeName}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleYes}
            disabled={isPending}
          >
            <Check className="mr-2 h-4 w-4" />
            Yes, add action
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 border-amber-200 bg-white text-amber-900 hover:bg-amber-100"
            onClick={handleNo}
            disabled={isPending}
          >
            <X className="mr-2 h-4 w-4" />
            No, mark complete
          </Button>
        </div>
      </div>
    </div>
  )
}

