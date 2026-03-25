'use client'

import { AlertTriangle, CheckCircle2, Navigation, Users } from 'lucide-react'
import { formatStoreName } from '@/lib/store-display'
import { cn, formatPercent } from '@/lib/utils'
import type { CompletedStore, PlannedRoute } from '@/app/actions/calendar'

interface CalendarDayEventProps {
  type: 'planned' | 'completed'
  data: PlannedRoute | CompletedStore
  date: string
  onClick: () => void
  isMobile?: boolean
}

function getCompletedScoreForDate(store: CompletedStore, date: string): string | null {
  if (store.audit2Date === date && store.audit2Pct !== null) return formatPercent(store.audit2Pct)
  if (store.audit1Date === date && store.audit1Pct !== null) return formatPercent(store.audit1Pct)
  if (store.fraDate === date && store.fraPct !== null) return formatPercent(store.fraPct)

  if (store.audit2Pct !== null) return formatPercent(store.audit2Pct)
  if (store.audit1Pct !== null) return formatPercent(store.audit1Pct)
  if (store.fraPct !== null) return formatPercent(store.fraPct)

  return null
}

export function CalendarDayEvent({ type, data, date, onClick, isMobile = false }: CalendarDayEventProps) {
  if (type === 'planned') {
    const route = data as PlannedRoute
    const routeName = route.managerName || 'Unassigned'
    const routeDetails = `${route.area || 'Unknown'} • ${route.storeCount} store${route.storeCount === 1 ? '' : 's'}`

    if (isMobile) {
      return (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left shadow-sm transition-colors hover:bg-blue-100"
          title={`${routeName} - ${routeDetails}`}
        >
          <span className="mt-0.5">
            <Navigation size={12} className="text-blue-600" />
          </span>
          <span className="flex-1">
            <span className="mb-1 flex items-start justify-between gap-2">
              <span className="text-sm font-bold text-blue-800">{routeName}</span>
            </span>
            <span className="flex items-center gap-1 text-xs text-blue-700/90">
              <Users size={10} />
              {routeDetails}
            </span>
          </span>
        </button>
      )
    }

    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative mb-1.5 w-full cursor-pointer rounded-md border border-blue-200 bg-blue-50 p-1.5 text-left transition-shadow hover:shadow-md"
        title={`${routeName} - ${routeDetails}`}
      >
        <span className="mb-0.5 flex items-start justify-between">
          <span className="truncate pr-1 text-[10px] font-bold text-blue-800">{routeName}</span>
          <Navigation size={12} className="mt-0.5 shrink-0 text-blue-600" />
        </span>
        <span className="block truncate text-[9px] text-blue-700/80">{routeDetails}</span>
      </button>
    )
  }

  const store = data as CompletedStore
  const score = getCompletedScoreForDate(store, date)
  const hasFailedAudit =
    (store.audit1Pct !== null && store.audit1Pct < 80) ||
    (store.audit2Pct !== null && store.audit2Pct < 80) ||
    (store.fraPct !== null && store.fraPct < 80)

  const bgClass = hasFailedAudit ? 'bg-red-50' : 'bg-emerald-50'
  const borderClass = hasFailedAudit ? 'border-red-200' : 'border-emerald-200'
  const textClass = hasFailedAudit ? 'text-red-800' : 'text-emerald-800'
  const icon = hasFailedAudit ? (
    <AlertTriangle size={12} className="text-red-600" />
  ) : (
    <CheckCircle2 size={12} className="text-emerald-600" />
  )
  const displayStoreName = formatStoreName(store.storeName)

  if (isMobile) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 rounded-xl border p-3 text-left shadow-sm transition-colors',
          borderClass,
          bgClass,
          hasFailedAudit ? 'hover:bg-red-100' : 'hover:bg-emerald-100'
        )}
        title={`${displayStoreName}${score ? ` - ${score}` : ''}${hasFailedAudit ? ' - Revisit needed' : ''}`}
      >
        <span className="mt-0.5">{icon}</span>
        <span className="flex-1">
          <span className="mb-1 flex items-start justify-between gap-2">
            <span className={cn('text-sm font-bold', textClass)}>{displayStoreName}</span>
            {score ? (
              <span className={cn('rounded bg-white/60 px-1.5 py-0.5 text-xs font-bold', textClass)}>{score}</span>
            ) : null}
          </span>
          <span className={cn('flex items-center gap-1 text-xs opacity-80', textClass)}>
            <Users size={10} />
            {store.managerName || 'Unassigned'}
          </span>
          {hasFailedAudit ? (
            <span className="mt-1.5 inline-block rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
              Revisit Needed
            </span>
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative mb-1.5 w-full cursor-pointer rounded-md border p-1.5 text-left transition-shadow hover:shadow-md',
        bgClass,
        borderClass
      )}
      title={`${displayStoreName}${score ? ` - ${score}` : ''}${hasFailedAudit ? ' - Revisit needed' : ''}`}
    >
      <span className="mb-0.5 flex items-start justify-between">
        <span className={cn('truncate pr-1 text-[10px] font-bold', textClass)}>{displayStoreName}</span>
        <span className="mt-0.5 shrink-0">{icon}</span>
      </span>
      <span className={cn('block truncate text-[9px] font-medium opacity-80', textClass)}>
        {score ? `Score: ${score}` : 'Completed'}
      </span>
      <span className={cn('mt-0.5 block truncate text-[9px] opacity-70', textClass)}>
        {store.managerName || 'Unassigned'}
      </span>
      {hasFailedAudit ? (
        <span className="mt-1 flex items-center gap-0.5 text-[9px] font-bold uppercase text-red-600">
          <AlertTriangle size={8} />
          Revisit
        </span>
      ) : null}
    </button>
  )
}
