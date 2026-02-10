'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { CloseActionButton } from '@/components/shared/close-action-button'
import { format } from 'date-fns'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

interface ViewActionModalProps {
  action: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onActionUpdated?: () => void
}

export function ViewActionModal({ action, open, onOpenChange, onActionUpdated }: ViewActionModalProps) {
  if (!action) return null

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl font-bold text-slate-900 break-words">{action.title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 md:space-y-6 py-2 md:py-4">
          {/* Description */}
          {action.description && (
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Description</h3>
              <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-md">
                {action.description}
              </p>
            </div>
          )}

          {/* Action Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Priority</h3>
              <StatusBadge status={action.priority} type="severity" />
            </div>
            
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Status</h3>
              <StatusBadge status={action.status} type="action" />
            </div>

            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Due Date</h3>
              <p className={`text-xs sm:text-sm ${isOverdue ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>
                {format(new Date(action.due_date), 'dd MMM yyyy')}
                {isOverdue && (
                  <span className="ml-2 text-[10px] sm:text-xs text-rose-600 font-medium">(Overdue)</span>
                )}
              </p>
            </div>

            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Assigned To</h3>
              {assigneeName ? (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0">
                    {assigneeInitials}
                  </div>
                  <span className="text-xs sm:text-sm text-slate-600 truncate">{assigneeName}</span>
                </div>
              ) : (
                <span className="text-xs sm:text-sm text-slate-400 italic">Unassigned</span>
              )}
            </div>
          </div>

          {/* Incident / Store Reference */}
          {action.incident_id && !isStoreAction && (
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Related Incident</h3>
              <Link 
                href={`/incidents/${action.incident_id}`}
                className="inline-flex items-center gap-2 text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 hover:underline flex-wrap"
              >
                <span className="font-mono font-medium bg-indigo-50 px-2 py-1 rounded border border-indigo-200 break-all">
                  {action.incident?.reference_no || action.incident_id.slice(0, 8) + '...'}
                </span>
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              </Link>
            </div>
          )}

          {isStoreAction && action.store?.store_name ? (
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Related Store</h3>
              <p className="text-xs sm:text-sm text-slate-600">
                {action.store.store_code ? `${action.store.store_code} - ` : ''}{action.store.store_name}
              </p>
            </div>
          ) : null}

          {/* Evidence Required */}
          {action.evidence_required && (
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Evidence Required</h3>
              <p className="text-xs sm:text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
                Evidence is required for this action
              </p>
            </div>
          )}

          {/* Completion Notes */}
          {action.status === 'complete' && action.completion_notes && (
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Completion Notes</h3>
              <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-wrap bg-green-50 p-3 rounded-md border border-green-200">
                {action.completion_notes}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center pt-3 md:pt-4 border-t gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px] w-full sm:w-auto">
              Close
            </Button>
            {action.incident_id && !isStoreAction && (
              <Link href={`/incidents/${action.incident_id}`} className="w-full sm:w-auto">
                <Button className="min-h-[44px] w-full sm:w-auto">
                  <span className="hidden sm:inline">View Incident</span>
                  <span className="sm:hidden">View</span>
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            )}
          </div>
          <div className="flex justify-end">
            {!isStoreAction && !['complete', 'cancelled'].includes(action.status) && (
              <CloseActionButton 
                actionId={action.id} 
                actionTitle={action.title}
                currentStatus={action.status}
                onComplete={() => {
                  onActionUpdated?.()
                  onOpenChange(false)
                }}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
