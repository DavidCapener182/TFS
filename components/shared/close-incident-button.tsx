'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { reopenIncident, updateIncident } from '@/app/actions/incidents'
import { useRouter } from 'next/navigation'

interface CloseIncidentButtonProps {
  incidentId: string
  incidentReference: string
  currentStatus: string
}

export function CloseIncidentButton({ incidentId, incidentReference, currentStatus }: CloseIncidentButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<'closing' | 'reopening' | null>(null)
  const router = useRouter()
  const normalizedStatus = String(currentStatus || '').trim().toLowerCase()
  const isClosed = normalizedStatus === 'closed'

  const handleClose = async () => {
    if (isClosed) return
    
    if (!confirm(`Close incident "${incidentReference}"? This will mark the incident as closed.`)) {
      return
    }

    setIsLoading(true)
    setMode('closing')
    try {
      await updateIncident(incidentId, { status: 'closed' })
      router.refresh()
    } catch (error: any) {
      console.error('Failed to close incident:', error)
      const errorMessage = error?.message || 'Unknown error occurred'
      alert(`Failed to close incident: ${errorMessage}`)
      setIsLoading(false)
      setMode(null)
    }
  }

  const handleReopen = async () => {
    if (!isClosed) return

    if (!confirm(`Reopen incident "${incidentReference}"? This will move the case back to open.`)) {
      return
    }

    setIsLoading(true)
    setMode('reopening')
    try {
      await reopenIncident(incidentId)
      router.refresh()
    } catch (error: any) {
      console.error('Failed to reopen incident:', error)
      const errorMessage = error?.message || 'Unknown error occurred'
      alert(`Failed to reopen incident: ${errorMessage}`)
      setIsLoading(false)
      setMode(null)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={
        isClosed
          ? 'h-7 px-2 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
          : 'h-7 px-2 text-slate-600 hover:bg-green-50 hover:text-green-600'
      }
      onClick={isClosed ? handleReopen : handleClose}
      disabled={isLoading}
      title={isClosed ? 'Reopen incident' : 'Close incident'}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          {mode === 'reopening' ? 'Reopening...' : 'Closing...'}
        </>
      ) : (
        <>
          {isClosed ? (
            <>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reopen
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Complete
            </>
          )}
        </>
      )}
    </Button>
  )
}

