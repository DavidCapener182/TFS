'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Eye } from 'lucide-react'
import { ActionForm } from './action-form'
import { ViewActionModal } from '@/components/shared/view-action-modal'

interface IncidentActionsProps {
  incidentId: string
  actions: any[]
  profiles: Array<{ id: string; full_name: string | null }>
  initialOpen?: boolean
}

function ActionTableRow({ action, incidentId, isOverdue }: { action: any, incidentId: string, isOverdue: boolean }) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <TableRow className={isOverdue ? 'bg-red-50' : ''}>
        <TableCell className="font-medium">{action.title}</TableCell>
        <TableCell>{action.assigned_to?.full_name || 'Unknown'}</TableCell>
        <TableCell>
          <StatusBadge status={action.priority} type="severity" />
        </TableCell>
        <TableCell className={isOverdue ? 'text-red-600 font-medium' : ''}>
          {format(new Date(action.due_date), 'dd MMM yyyy')}
          {isOverdue && ' (Overdue)'}
        </TableCell>
        <TableCell>
          <StatusBadge status={action.status} type="action" />
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
            onClick={() => setModalOpen(true)}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            View Action
          </Button>
        </TableCell>
      </TableRow>
      <ViewActionModal 
        action={action} 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
      />
    </>
  )
}

export function IncidentActions({ incidentId, actions, profiles, initialOpen = false }: IncidentActionsProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (initialOpen) setOpen(true)
  }, [initialOpen])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Actions</CardTitle>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Action
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Action</DialogTitle>
                </DialogHeader>
                <ActionForm incidentId={incidentId} profiles={profiles} onSuccess={() => setOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-muted-foreground">No actions created yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((action) => {
                    const isOverdue = new Date(action.due_date) < new Date() && 
                      !['complete', 'cancelled'].includes(action.status)
                    
                    return (
                      <ActionTableRow 
                        key={action.id} 
                        action={action} 
                        incidentId={incidentId}
                        isOverdue={isOverdue}
                      />
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


