'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { NewIncidentDialog } from './new-incident-dialog'

export function NewIncidentButton() {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <Button
        className="w-full bg-indigo-600 shadow-sm transition-all hover:bg-indigo-700 active:scale-95 lg:w-auto"
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="h-4 w-4 mr-2" />
        Log New Incident
      </Button>
      <NewIncidentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
