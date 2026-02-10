'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { DeleteActionButton } from '@/components/shared/delete-action-button'
import { CloseActionButton } from '@/components/shared/close-action-button'
import { ViewActionModal } from '@/components/shared/view-action-modal'
import { Card } from '@/components/ui/card'
import { Eye, Calendar, User, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

interface ActionMobileCardProps {
  action: any
}

export function ActionMobileCard({ action }: ActionMobileCardProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const isStoreAction = action.source_type === 'store' || !action.incident_id
  const isOverdue = new Date(action.due_date) < new Date() && 
    !['complete', 'cancelled'].includes(action.status)
  const assigneeName = action.assigned_to?.full_name?.trim() || ''
  const assigneeInitials = assigneeName
    ? assigneeName.includes(' ')
      ? assigneeName
          .split(' ')
          .filter(Boolean)
          .map((part: string) => part[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : assigneeName.toUpperCase().slice(0, 2)
    : ''
  const assigneeShortName = assigneeName.includes(' ') ? assigneeName.split(' ')[0] : assigneeName

  return (
    <>
      <Card className={`p-3 hover:shadow-sm transition-shadow ${isOverdue ? 'bg-rose-50/30 border-rose-200' : 'border-slate-200'}`}>
        <div className="flex flex-col gap-2.5">
          
          {/* Top Row: Title & View Button */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="font-semibold text-slate-900 text-sm leading-tight mb-1">{action.title}</h3>
              {isStoreAction ? (
                <span className="font-mono text-xs font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">
                  {action.incident?.reference_no || 'Store Action'}
                </span>
              ) : (
                <Link href={`/incidents/${action.incident_id}`} className="hover:text-indigo-600 transition-colors inline-block">
                  <span className="font-mono text-xs font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                    {action.incident?.reference_no || 'Unknown'}
                  </span>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-0.5 -mr-1 -mt-1 flex-shrink-0">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                onClick={() => setModalOpen(true)}
              >
                <Eye className="h-4 w-4" />
                <span className="sr-only">View</span>
              </Button>
            </div>
          </div>

          {/* Bento Grid: Status, Priority, Due Date */}
          <div className="grid grid-cols-3 gap-2">
            {/* Status - 1 column */}
            <div className="flex flex-col">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</p>
              <StatusBadge status={action.status} type="action" />
            </div>
            
            {/* Priority - 1 column */}
            <div className="flex flex-col">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Priority</p>
              <StatusBadge status={action.priority} type="severity" />
            </div>
            
            {/* Due Date - 1 column */}
            <div className="flex flex-col">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Due Date</p>
              <div className="flex flex-col gap-0.5">
                <span className={`text-xs font-medium ${isOverdue ? 'text-rose-600' : 'text-slate-700'}`}>
                  {format(new Date(action.due_date), 'dd MMM')}
                </span>
                {isOverdue && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-600 font-medium">
                    <AlertCircle className="h-3 w-3" />
                    <span>Overdue</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row: Assigned To & Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-0.5">
            {/* Assigned To */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {assigneeName ? (
                <>
                  <div className="h-5 w-5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                    {assigneeInitials}
                  </div>
                  <span className="text-[10px] sm:text-xs text-slate-600 truncate hidden sm:inline-block max-w-[100px]">
                    {assigneeShortName}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-slate-400 italic">Unassigned</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {!isStoreAction ? (
                <>
                  <div className="scale-90">
                    <DeleteActionButton actionId={action.id} actionTitle={action.title} />
                  </div>
                  <div className="scale-90">
                    <CloseActionButton actionId={action.id} actionTitle={action.title} currentStatus={action.status} />
                  </div>
                </>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium">Store Action</span>
              )}
            </div>
          </div>

        </div>
      </Card>
      <ViewActionModal 
        action={action} 
        open={modalOpen} 
        onOpenChange={setModalOpen}
        onActionUpdated={() => {
          setModalOpen(false)
        }}
      />
    </>
  )
}
