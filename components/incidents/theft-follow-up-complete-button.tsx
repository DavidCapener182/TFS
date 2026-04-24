'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { completeStorePortalTheftFollowUp } from '@/app/actions/incidents'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface TheftFollowUpCompleteButtonProps {
  incidentId: string
  /** Smaller control for LP Summary live cases row */
  compact?: boolean
  className?: string
}

export function TheftFollowUpCompleteButton({
  incidentId,
  compact = false,
  className,
}: TheftFollowUpCompleteButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    if (
      !window.confirm(
        'Mark this store theft as done? The incident will be closed (removed from Open Incidents) but will still appear on the theft log and store history.',
      )
    ) {
      return
    }
    setPending(true)
    try {
      await completeStorePortalTheftFollowUp(incidentId)
      toast({
        title: 'Theft marked complete',
        description: 'The incident is closed and removed from the open register.',
        variant: 'success',
      })
      router.refresh()
    } catch (error) {
      toast({
        title: 'Could not update',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant={compact ? 'secondary' : 'default'}
      size={compact ? 'sm' : 'sm'}
      className={cn(compact ? 'h-8' : 'h-9', className)}
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
      Complete
    </Button>
  )
}
