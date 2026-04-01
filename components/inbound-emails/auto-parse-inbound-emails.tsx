'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { runPendingInboundEmailAnalysis } from '@/app/actions/inbound-emails'
import { toast } from '@/hooks/use-toast'

interface AutoParseInboundEmailsProps {
  pendingCount: number
}

export function AutoParseInboundEmails({ pendingCount }: AutoParseInboundEmailsProps) {
  const router = useRouter()
  const lastTriggeredCount = useRef<number | null>(null)
  const [isRunning, startTransition] = useTransition()

  useEffect(() => {
    if (pendingCount <= 0) {
      lastTriggeredCount.current = null
      return
    }

    if (isRunning || lastTriggeredCount.current === pendingCount) {
      return
    }

    lastTriggeredCount.current = pendingCount

    startTransition(async () => {
      try {
        await runPendingInboundEmailAnalysis()
        router.refresh()
      } catch (error) {
        lastTriggeredCount.current = null
        toast({
          title: 'Automatic parsing failed',
          description: error instanceof Error ? error.message : 'Failed to parse new inbound emails automatically.',
          variant: 'destructive',
        })
      }
    })
  }, [isRunning, pendingCount, router])

  return null
}
