'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

import { runInboundEmailAnalysis, runPendingInboundEmailAnalysis } from '@/app/actions/inbound-emails'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

interface InboundEmailAnalysisActionsProps {
  emailId?: string | null
  pendingUnanalysedCount?: number
}

export function InboundEmailAnalysisActions({
  emailId,
  pendingUnanalysedCount = 0,
}: InboundEmailAnalysisActionsProps) {
  const router = useRouter()
  const [isRunningSingle, startSingle] = useTransition()
  const [isRunningBatch, startBatch] = useTransition()

  return (
    <div className="flex flex-wrap gap-2">
      {emailId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRunningSingle || isRunningBatch}
          onClick={() => {
            startSingle(async () => {
              try {
                const result = await runInboundEmailAnalysis(emailId)
                toast({
                  title: 'Email parsed',
                  description: result.summary,
                  variant: 'success',
                })
                router.refresh()
              } catch (error) {
                toast({
                  title: 'Parser failed',
                  description: error instanceof Error ? error.message : 'Failed to analyse inbound email.',
                  variant: 'destructive',
                })
              }
            })
          }}
        >
          {isRunningSingle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Run parser
        </Button>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={isRunningSingle || isRunningBatch || pendingUnanalysedCount === 0}
        onClick={() => {
          startBatch(async () => {
            try {
              const result = await runPendingInboundEmailAnalysis()
              toast({
                title: 'Batch parser complete',
                description:
                  result.processed > 0
                    ? `Analysed ${result.processed} new email${result.processed === 1 ? '' : 's'}.`
                    : 'There were no new emails left to analyse.',
                variant: 'success',
              })
              router.refresh()
            } catch (error) {
              toast({
                title: 'Batch parser failed',
                description: error instanceof Error ? error.message : 'Failed to analyse new inbound emails.',
                variant: 'destructive',
              })
            }
          })
        }}
      >
        {isRunningBatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Parse pending
      </Button>
    </div>
  )
}
