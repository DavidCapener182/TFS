'use client'

import { format, parseISO } from 'date-fns'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { User, MapPin, Store, CheckCircle2, FileText } from 'lucide-react'
import { getInternalAreaDisplayName } from '@/lib/areas'
import { formatStoreName } from '@/lib/store-display'
import { cn, formatPercent } from '@/lib/utils'
import type { PlannedRoute, CompletedStore } from '@/app/actions/calendar'

interface CalendarEventModalProps {
  event: {
    type: 'planned' | 'completed'
    data: PlannedRoute | CompletedStore
    date: string
  }
  onClose: () => void
}

export function CalendarEventModal({ event, onClose }: CalendarEventModalProps) {
  if (event.type === 'planned') {
    const route = event.data as PlannedRoute
    const date = parseISO(event.date)

    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-600" />
              Planned Route
            </DialogTitle>
            <DialogDescription>
              {format(date, 'EEEE, MMMM d, yyyy')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Manager Info */}
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <User className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-sm font-semibold text-blue-900">Manager</div>
                <div className="text-sm text-blue-700">{route.managerName}</div>
              </div>
            </div>

            {/* Area Info */}
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <MapPin className="h-4 w-4 text-slate-600" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Area</div>
                <div className="text-sm text-slate-700">{getInternalAreaDisplayName(route.area, { fallback: 'Unknown Area' })}</div>
              </div>
            </div>

            {/* Store Count */}
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <Store className="h-4 w-4 text-slate-600" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Stores</div>
                <div className="text-sm text-slate-700">{route.storeCount} store{route.storeCount !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* Store List */}
            {route.stores.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">Store List</div>
                <div className="space-y-1">
                  {route.stores.map((store) => (
                    <div
                      key={store.id}
                      className="p-2 bg-white border border-slate-200 rounded text-sm"
                    >
                      <div className="font-medium text-slate-900">{formatStoreName(store.name)}</div>
                      {store.store_code && (
                        <div className="text-xs text-slate-500">Code: {store.store_code}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Completed store
  const store = event.data as CompletedStore
  const date = parseISO(event.date)
  const hasAudit1 = store.audit1Date && store.audit1Pct !== null
  const hasAudit2 = store.audit2Date && store.audit2Pct !== null
  const hasFRA = store.fraDate && store.fraPct !== null

  // Check if any audit/FRA failed (less than 80%)
  const audit1Failed = hasAudit1 && store.audit1Pct !== null && store.audit1Pct < 80
  const audit2Failed = hasAudit2 && store.audit2Pct !== null && store.audit2Pct < 80
  const fraFailed = hasFRA && store.fraPct !== null && store.fraPct < 80
  const hasFailedAudit = audit1Failed || audit2Failed || fraFailed

  // Determine what was completed on this date
  const isAudit1Date = store.audit1Date === event.date
  const isAudit2Date = store.audit2Date === event.date
  const isFRADate = store.fraDate === event.date

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className={cn(
              "h-5 w-5",
              hasFailedAudit ? "text-red-600" : "text-green-600"
            )} />
            Completed Store
            {hasFailedAudit && (
              <span className="text-red-600 text-base font-normal ml-2">⚠ Revisit Required</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {format(date, 'EEEE, MMMM d, yyyy')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Store Info */}
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <Store className="h-4 w-4 text-slate-600" />
            <div>
              <div className="text-sm font-semibold text-slate-900">Store</div>
              <div className="text-sm text-slate-700">{formatStoreName(store.storeName)}</div>
              {store.storeCode && (
                <div className="text-xs text-slate-500">Code: {store.storeCode}</div>
              )}
            </div>
          </div>

          {/* Manager Info */}
          {store.managerName && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <User className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-sm font-semibold text-green-900">Completed By</div>
                <div className="text-sm text-green-700">{store.managerName}</div>
              </div>
            </div>
          )}

          {/* Audit 1 */}
          {hasAudit1 && (
            <div className={cn(
              "p-3 rounded-lg border",
              store.audit1Pct !== null && store.audit1Pct < 80
                ? "bg-red-50 border-red-200"
                : "bg-blue-50 border-blue-200"
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className={cn(
                    "h-4 w-4",
                    store.audit1Pct !== null && store.audit1Pct < 80
                      ? "text-red-600"
                      : "text-blue-600"
                  )} />
                  <div className={cn(
                    "text-sm font-semibold",
                    store.audit1Pct !== null && store.audit1Pct < 80
                      ? "text-red-900"
                      : "text-blue-900"
                  )}>
                    Audit 1
                    {store.audit1Pct !== null && store.audit1Pct < 80 && (
                      <span className="ml-2 text-red-600">⚠ Failed</span>
                    )}
                  </div>
                </div>
                {isAudit1Date && (
                  <Badge variant="default" className={cn(
                    store.audit1Pct !== null && store.audit1Pct < 80
                      ? "bg-red-600 text-white"
                      : "bg-blue-600 text-white"
                  )}>
                    Completed on this date
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <div className={cn(
                  "text-sm",
                  store.audit1Pct !== null && store.audit1Pct < 80
                    ? "text-red-700"
                    : "text-blue-700"
                )}>
                  <span className="font-medium">Score:</span> {formatPercent(store.audit1Pct)}
                  {store.audit1Pct !== null && store.audit1Pct < 80 && (
                    <span className="ml-2 font-semibold">(Revisit Required)</span>
                  )}
                </div>
                {store.audit1Date && (
                  <div className={cn(
                    "text-xs",
                    store.audit1Pct !== null && store.audit1Pct < 80
                      ? "text-red-600"
                      : "text-blue-600"
                  )}>
                    Date: {format(parseISO(store.audit1Date), 'MMM d, yyyy')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Audit 2 */}
          {hasAudit2 && (
            <div className={cn(
              "p-3 rounded-lg border",
              store.audit2Pct !== null && store.audit2Pct < 80
                ? "bg-red-50 border-red-200"
                : "bg-blue-50 border-blue-200"
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className={cn(
                    "h-4 w-4",
                    store.audit2Pct !== null && store.audit2Pct < 80
                      ? "text-red-600"
                      : "text-blue-600"
                  )} />
                  <div className={cn(
                    "text-sm font-semibold",
                    store.audit2Pct !== null && store.audit2Pct < 80
                      ? "text-red-900"
                      : "text-blue-900"
                  )}>
                    Audit 2
                    {store.audit2Pct !== null && store.audit2Pct < 80 && (
                      <span className="ml-2 text-red-600">⚠ Failed</span>
                    )}
                  </div>
                </div>
                {isAudit2Date && (
                  <Badge variant="default" className={cn(
                    store.audit2Pct !== null && store.audit2Pct < 80
                      ? "bg-red-600 text-white"
                      : "bg-blue-600 text-white"
                  )}>
                    Completed on this date
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <div className={cn(
                  "text-sm",
                  store.audit2Pct !== null && store.audit2Pct < 80
                    ? "text-red-700"
                    : "text-blue-700"
                )}>
                  <span className="font-medium">Score:</span> {formatPercent(store.audit2Pct)}
                  {store.audit2Pct !== null && store.audit2Pct < 80 && (
                    <span className="ml-2 font-semibold">(Revisit Required)</span>
                  )}
                </div>
                {store.audit2Date && (
                  <div className={cn(
                    "text-xs",
                    store.audit2Pct !== null && store.audit2Pct < 80
                      ? "text-red-600"
                      : "text-blue-600"
                  )}>
                    Date: {format(parseISO(store.audit2Date), 'MMM d, yyyy')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Summary */}
          {!hasAudit1 && !hasAudit2 && !hasFRA && (
            <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
              No audit or FRA data available for this store.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
