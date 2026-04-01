'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Slash } from 'lucide-react'

import {
  flagInboundEmailError,
  ignoreInboundEmail,
  markInboundEmailReviewed,
} from '@/app/actions/inbound-emails'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

interface InboundEmailReviewActionsProps {
  emailId: string
  onCompleted?: () => void
  includeNoFurtherAction?: boolean
}

export function InboundEmailReviewActions({
  emailId,
  onCompleted,
  includeNoFurtherAction = false,
}: InboundEmailReviewActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function runAction(action: () => Promise<unknown>, successTitle: string, successDescription: string) {
    startTransition(async () => {
      try {
        await action()
        toast({
          title: successTitle,
          description: successDescription,
          variant: 'success',
        })
        router.refresh()
        onCompleted?.()
      } catch (error) {
        toast({
          title: 'Update failed',
          description: error instanceof Error ? error.message : 'Failed to update inbound email status.',
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => runAction(
          () => markInboundEmailReviewed(emailId),
          'Marked reviewed',
          'The inbound email has been marked as reviewed.'
        )}
      >
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        Mark Reviewed
      </Button>

      {includeNoFurtherAction ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => runAction(
            () => markInboundEmailReviewed(emailId),
            'No further action recorded',
            'The inbound email was closed with no further action required.'
          )}
        >
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          No Further Action
        </Button>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => runAction(
          () => ignoreInboundEmail(emailId),
          'Marked ignored',
          'The inbound email has been ignored.'
        )}
      >
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Slash className="mr-2 h-4 w-4" />}
        Ignore
      </Button>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          const reason = window.prompt('Reason for flagging this email as an error?', 'Needs manual review')
          if (reason === null) return
          runAction(
            () => flagInboundEmailError(emailId, reason),
            'Flagged as error',
            'The inbound email has been flagged for manual review.'
          )
        }}
      >
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
        Flag Error
      </Button>
    </div>
  )
}
