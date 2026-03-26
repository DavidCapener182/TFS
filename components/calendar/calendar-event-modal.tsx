'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ClipboardList, ShieldAlert, User, MapPin, Store, CheckCircle2, FileText, Users } from 'lucide-react'
import { getInternalAreaDisplayName } from '@/lib/areas'
import { formatStoreName } from '@/lib/store-display'
import { cn, formatPercent } from '@/lib/utils'
import type { PlannedRoute, CompletedStore, CalendarIncident, CalendarAction, CalendarVisit } from '@/app/actions/calendar'

interface CalendarEventModalProps {
  event: {
    type: 'planned' | 'completed' | 'incident' | 'action' | 'visit' | 'store'
    data:
      | PlannedRoute
      | CompletedStore
      | CalendarIncident
      | CalendarAction
      | CalendarVisit
      | {
          storeId: string
          storeName: string
          storeCode: string | null
          incidents: CalendarIncident[]
          actions: CalendarAction[]
          visits: CalendarVisit[]
        }
    date: string
  }
  onClose: () => void
}

export function CalendarEventModal({ event, onClose }: CalendarEventModalProps) {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})

  const toggleExpanded = (key: string) => {
    setExpandedNotes((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const summarize = (value: string, maxLength = 200) => {
    const trimmed = String(value || '').trim()
    if (!trimmed) return ''
    const firstLine = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    const base = (firstLine || trimmed).replace(/\s+/g, ' ').trim()
    if (base.length <= maxLength) return base
    return `${base.slice(0, maxLength - 1).trimEnd()}…`
  }

  const splitNotes = (value: string): string[] => {
    const raw = String(value || '').trim()
    if (!raw) return []

    // Prefer bullet-style notes (these are common in generated visit summaries).
    if (raw.includes('•')) {
      return raw
        .split('•')
        .map((part) => part.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    }

    // Otherwise split into non-empty lines.
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  if (event.type === 'store') {
    const payload = event.data as {
      storeId: string
      storeName: string
      storeCode: string | null
      incidents: CalendarIncident[]
      actions: CalendarAction[]
      visits: CalendarVisit[]
    }
    const date = parseISO(event.date)

    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-slate-700" />
              {payload.storeName}
            </DialogTitle>
            <DialogDescription>
              {format(date, 'EEEE, MMMM d, yyyy')}
              {payload.storeCode ? ` • ${payload.storeCode}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/stores/${payload.storeId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open store
              </Link>
              <Link
                href="/actions"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open actions list
              </Link>
            </div>

            {payload.incidents.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-bold text-slate-900">Incidents</div>
                <div className="space-y-2">
                  {payload.incidents.map((incident) => (
                    <div key={incident.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-slate-900">{incident.summary || incident.referenceNo}</div>
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="text-xs font-bold text-blue-600 hover:underline"
                        >
                          Open
                        </Link>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                          {String(incident.severity || 'low')}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                          {String(incident.status || 'open').replace(/_/g, ' ')}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 font-mono">
                          {incident.referenceNo}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {payload.actions.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-bold text-slate-900">Actions</div>
                <div className="space-y-2">
                  {payload.actions.map((action) => (
                    <div key={action.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-slate-900">{summarize(action.title, 140) || 'Action'}</div>
                        {action.incidentId ? (
                          <Link
                            href={`/incidents/${action.incidentId}?tab=actions`}
                            className="text-xs font-bold text-blue-600 hover:underline"
                          >
                            Open incident actions
                          </Link>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                          {String(action.priority || 'medium')}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                          {String(action.status || 'open').replace(/_/g, ' ')}
                        </Badge>
                        {action.incidentReferenceNo ? (
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 font-mono">
                            {action.incidentReferenceNo}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {payload.visits.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-bold text-slate-900">Visits</div>
                <div className="space-y-2">
                  {payload.visits.map((visit) => (
                    <div key={visit.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-slate-900">
                          {String(visit.visitType || 'visit').replace(/_/g, ' ')}
                        </div>
                        <Link
                          href={`/stores/${visit.storeId}`}
                          className="text-xs font-bold text-blue-600 hover:underline"
                        >
                          Open store
                        </Link>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">
                          {String(visit.visitType || 'visit').replace(/_/g, ' ')}
                        </Badge>
                        {visit.followUpRequired ? (
                          <Badge variant="outline" className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                            Follow-up required
                          </Badge>
                        ) : null}
                      </div>
                      {visit.notes ? (() => {
                        const parts = splitNotes(visit.notes)
                        const isExpanded = Boolean(expandedNotes[visit.id])
                        const visible = isExpanded ? parts : parts.slice(0, 4)
                        const canToggle = parts.length > 4

                        return (
                          <div className="mt-2 space-y-2">
                            <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              {visible.length > 1 ? (
                                <ul className="list-disc space-y-1 pl-5">
                                  {visible.map((item, index) => (
                                    <li key={`${visit.id}-note-${index}`}>{item}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p>{visible[0] || ''}</p>
                              )}
                            </div>

                            {canToggle ? (
                              <button
                                type="button"
                                className="text-xs font-bold text-blue-600 hover:underline"
                                onClick={() => toggleExpanded(visit.id)}
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </button>
                            ) : null}
                          </div>
                        )
                      })() : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (event.type === 'incident') {
    const incident = event.data as CalendarIncident
    const date = parseISO(event.date)
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Incident
            </DialogTitle>
            <DialogDescription>{format(date, 'EEEE, MMMM d, yyyy')}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 text-sm font-bold text-slate-900">{incident.referenceNo}</div>
              <div className="text-sm text-slate-700">{incident.storeName}</div>
              {incident.storeCode ? <div className="text-xs text-slate-500">Code: {incident.storeCode}</div> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                {String(incident.severity || 'low')}
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                {String(incident.status || 'open').replace(/_/g, ' ')}
              </Badge>
            </div>

            {incident.summary ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                {incident.summary}
              </div>
            ) : null}

            <div className="pt-2">
              <Link
                href={`/incidents/${incident.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open incident
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (event.type === 'action') {
    const action = event.data as CalendarAction
    const date = parseISO(event.date)
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-700" />
              Action due
            </DialogTitle>
            <DialogDescription>{format(date, 'EEEE, MMMM d, yyyy')}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm font-bold text-slate-900">{action.title}</div>
              <div className="mt-1 text-sm text-slate-700">
                {action.storeName || 'Unknown store'}
                {action.incidentReferenceNo ? ` • ${action.incidentReferenceNo}` : ''}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                {String(action.priority || 'medium')}
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                {String(action.status || 'open').replace(/_/g, ' ')}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {action.incidentId ? (
                <Link
                  href={`/incidents/${action.incidentId}?tab=actions`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open incident actions
                </Link>
              ) : null}
              <Link
                href="/actions"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open actions list
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (event.type === 'visit') {
    const visit = event.data as CalendarVisit
    const date = parseISO(event.date)
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-700" />
              Store visit
            </DialogTitle>
            <DialogDescription>{format(date, 'EEEE, MMMM d, yyyy')}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-bold text-slate-900">{visit.storeName}</div>
              {visit.storeCode ? <div className="text-xs text-slate-500">Code: {visit.storeCode}</div> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">
                {String(visit.visitType || 'visit').replace(/_/g, ' ')}
              </Badge>
              {visit.followUpRequired ? (
                <Badge variant="outline" className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                  Follow-up required
                </Badge>
              ) : null}
            </div>

            {visit.notes ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                {visit.notes}
              </div>
            ) : null}

            <div className="pt-2">
              <Link
                href={`/stores/${visit.storeId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open store
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

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
