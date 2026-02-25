'use client'

import { useMemo, useState } from 'react'
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Navigation,
  Target,
  Users,
} from 'lucide-react'
import { CalendarDayEvent } from './calendar-day-event'
import { CalendarEventModal } from './calendar-event-modal'
import type { CalendarData, CompletedStore, PlannedRoute } from '@/app/actions/calendar'

interface CalendarClientProps {
  initialData: CalendarData
}

type CalendarCell = {
  date: Date
  dateStr: string
  isCurrentMonth: boolean
  plannedRoutes: PlannedRoute[]
  completedStores: CompletedStore[]
}

async function fetchCalendarData(month: number, year: number): Promise<CalendarData> {
  const { getCalendarData } = await import('@/app/actions/calendar')
  return getCalendarData(month, year)
}

function getManagerCapacitySummary(days: CalendarData['days']) {
  const managerMap = new Map<
    string,
    {
      managerName: string
      plannedRoutes: number
      storeStops: number
      estimatedHours: number
      activeDays: Set<string>
      overbookedDays: number
      busiestDayHours: number
    }
  >()
  const dailyHoursByManager = new Map<string, number>()

  days.forEach((day) => {
    day.plannedRoutes.forEach((route) => {
      const managerName = route.managerName || 'Unassigned'
      if (!managerMap.has(managerName)) {
        managerMap.set(managerName, {
          managerName,
          plannedRoutes: 0,
          storeStops: 0,
          estimatedHours: 0,
          activeDays: new Set<string>(),
          overbookedDays: 0,
          busiestDayHours: 0,
        })
      }

      const storeStops = route.storeCount || route.stores?.length || 0
      const visitHours = storeStops * 1.75
      const driveHours = Math.max(0.5, storeStops * 0.5)
      const estimatedHours = visitHours + driveHours
      const manager = managerMap.get(managerName)!

      manager.plannedRoutes += 1
      manager.storeStops += storeStops
      manager.estimatedHours += estimatedHours
      manager.activeDays.add(day.date)

      const dayKey = `${managerName}::${day.date}`
      dailyHoursByManager.set(dayKey, (dailyHoursByManager.get(dayKey) || 0) + estimatedHours)
    })
  })

  dailyHoursByManager.forEach((hours, dayKey) => {
    const [managerName] = dayKey.split('::')
    const manager = managerMap.get(managerName)
    if (!manager) return
    if (hours > 8) manager.overbookedDays += 1
    if (hours > manager.busiestDayHours) manager.busiestDayHours = hours
  })

  return Array.from(managerMap.values())
    .map((manager) => {
      const capacityHours = manager.activeDays.size * 8
      const utilizationPct = capacityHours > 0 ? Math.round((manager.estimatedHours / capacityHours) * 100) : 0
      return {
        managerName: manager.managerName,
        plannedRoutes: manager.plannedRoutes,
        storeStops: manager.storeStops,
        estimatedHours: Number(manager.estimatedHours.toFixed(1)),
        activeDays: manager.activeDays.size,
        overbookedDays: manager.overbookedDays,
        busiestDayHours: Number(manager.busiestDayHours.toFixed(1)),
        utilizationPct,
      }
    })
    .sort((a, b) => b.utilizationPct - a.utilizationPct)
}

export function CalendarClient({ initialData }: CalendarClientProps) {
  const [currentMonth, setCurrentMonth] = useState(initialData.month)
  const [currentYear, setCurrentYear] = useState(initialData.year)
  const [calendarData, setCalendarData] = useState(initialData)
  const [selectedEvent, setSelectedEvent] = useState<{
    type: 'planned' | 'completed'
    data: PlannedRoute | CompletedStore
    date: string
  } | null>(null)

  const currentDate = useMemo(() => new Date(currentYear, currentMonth - 1, 1), [currentMonth, currentYear])
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const totalPlannedRoutes = useMemo(
    () => calendarData.days.reduce((total, day) => total + day.plannedRoutes.length, 0),
    [calendarData.days]
  )
  const totalCompletedStores = useMemo(
    () => calendarData.days.reduce((total, day) => total + day.completedStores.length, 0),
    [calendarData.days]
  )
  const activeDays = useMemo(
    () => calendarData.days.filter((day) => day.plannedRoutes.length > 0 || day.completedStores.length > 0).length,
    [calendarData.days]
  )
  const managerCapacity = useMemo(() => getManagerCapacitySummary(calendarData.days), [calendarData.days])
  const topManager = managerCapacity[0] || null

  const calendarCells = useMemo<CalendarCell[]>(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

    const dataMap = new Map<string, { plannedRoutes: PlannedRoute[]; completedStores: CompletedStore[] }>()
    calendarData.days.forEach((day) => {
      dataMap.set(day.date, { plannedRoutes: day.plannedRoutes, completedStores: day.completedStores })
    })

    const cells: CalendarCell[] = []
    let cursor = new Date(calendarStart)

    while (cursor <= calendarEnd) {
      const dateStr = format(cursor, 'yyyy-MM-dd')
      const dayData = dataMap.get(dateStr) || { plannedRoutes: [], completedStores: [] }
      const isCurrentMonth = cursor.getMonth() === currentDate.getMonth() && cursor.getFullYear() === currentDate.getFullYear()

      cells.push({
        date: new Date(cursor),
        dateStr,
        isCurrentMonth,
        plannedRoutes: dayData.plannedRoutes,
        completedStores: dayData.completedStores,
      })

      cursor = addDays(cursor, 1)
    }

    return cells
  }, [calendarData.days, currentDate])

  const daysWithEvents = useMemo(
    () =>
      calendarCells.filter(
        (cell) => cell.isCurrentMonth && (cell.plannedRoutes.length > 0 || cell.completedStores.length > 0)
      ),
    [calendarCells]
  )

  const handleMonthChange = async (direction: 'prev' | 'next') => {
    let nextMonth = currentMonth
    let nextYear = currentYear

    if (direction === 'prev') {
      if (nextMonth === 1) {
        nextMonth = 12
        nextYear -= 1
      } else {
        nextMonth -= 1
      }
    } else {
      if (nextMonth === 12) {
        nextMonth = 1
        nextYear += 1
      } else {
        nextMonth += 1
      }
    }

    setCurrentMonth(nextMonth)
    setCurrentYear(nextYear)

    try {
      const nextData = await fetchCalendarData(nextMonth, nextYear)
      setCalendarData(nextData)
    } catch (error) {
      console.error('Error fetching calendar data:', error)
    }
  }

  const handleGoToToday = async () => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    setCurrentMonth(month)
    setCurrentYear(year)

    try {
      const nextData = await fetchCalendarData(month, year)
      setCalendarData(nextData)
    } catch (error) {
      console.error('Error fetching calendar data:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-[#0f172a] p-6 text-white shadow-xl shadow-slate-200/50 md:p-8">
        <div className="absolute right-0 top-0 h-96 w-96 translate-x-1/3 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
              <CalendarIcon size={14} />
              Calendar Overview
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{format(currentDate, 'MMMM yyyy')}</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Monthly schedule for planned visits and completed compliance activity across your managed regions.
            </p>
          </div>

          <div className="grid w-full grid-cols-3 gap-3 lg:w-auto">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 text-center backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Routes</p>
              <p className="text-2xl font-bold leading-none text-white">{totalPlannedRoutes}</p>
            </div>
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 text-center backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Completed</p>
              <p className="text-2xl font-bold leading-none text-white">{totalCompletedStores}</p>
            </div>
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 text-center backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Days</p>
              <p className="text-2xl font-bold leading-none text-white">{activeDays}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Users size={18} className="text-blue-500" />
            Manager Capacity
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">
            <Target size={14} />
            8H TARGET/DAY
          </span>
        </div>

        {topManager ? (
          <div className="max-w-2xl">
            <div className="mb-2 flex items-end justify-between">
              <span className="font-bold text-slate-900">{topManager.managerName}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold ${
                  topManager.utilizationPct > 100
                    ? 'bg-red-100 text-red-800'
                    : topManager.utilizationPct > 85
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {topManager.utilizationPct}%
              </span>
            </div>
            <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  topManager.utilizationPct > 100
                    ? 'bg-red-500'
                    : topManager.utilizationPct > 85
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, topManager.utilizationPct)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1.5">
                <Navigation size={12} /> {topManager.storeStops} stops • {topManager.estimatedHours}h across {topManager.activeDays}{' '}
                day{topManager.activeDays === 1 ? '' : 's'}
              </span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-300 md:block" />
              <span className="flex items-center gap-1.5">
                <Clock size={12} /> Busiest day: {topManager.busiestDayHours}h
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm italic text-slate-500">No planned route capacity available for this month.</p>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full items-center gap-4 lg:w-auto">
            <h2 className="flex-1 text-xl font-bold text-slate-800 lg:flex-none">{format(currentDate, 'MMMM yyyy')}</h2>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleMonthChange('prev')}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => handleMonthChange('next')}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
            <div className="flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto">
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-blue-600 shadow-sm sm:flex-none"
              >
                <Filter size={14} />
                Planned Route
              </button>
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold text-emerald-600 transition-colors hover:bg-white/50 sm:flex-none"
              >
                <CheckCircle2 size={14} />
                Completed Store
              </button>
            </div>
            <button
              type="button"
              onClick={handleGoToToday}
              className="hidden rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 md:block"
            >
              Today
            </button>
          </div>
        </div>

        <div className="hidden md:block">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
            {dayNames.map((day) => (
              <div
                key={day}
                className="border-r border-slate-100 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-400 last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-100">
            {calendarCells.map((cell) => (
              <div
                key={cell.dateStr}
                className={`min-h-[140px] p-2 transition-colors hover:bg-slate-50 ${
                  cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/50'
                } ${isToday(cell.date) ? 'z-10 rounded-sm ring-2 ring-inset ring-blue-500' : ''}`}
              >
                <div
                  className={`mb-2 text-sm font-bold ${
                    isToday(cell.date)
                      ? 'text-blue-600'
                      : cell.isCurrentMonth
                      ? 'text-slate-700'
                      : 'text-slate-300'
                  }`}
                >
                  {format(cell.date, 'd')}
                </div>
                <div className="space-y-1">
                  {cell.plannedRoutes.map((route, idx) => (
                    <CalendarDayEvent
                      key={`planned-${cell.dateStr}-${route.key}-${idx}`}
                      type="planned"
                      data={route}
                      date={cell.dateStr}
                      onClick={() => setSelectedEvent({ type: 'planned', data: route, date: cell.dateStr })}
                    />
                  ))}
                  {cell.completedStores.map((store, idx) => (
                    <CalendarDayEvent
                      key={`completed-${cell.dateStr}-${store.id}-${idx}`}
                      type="completed"
                      data={store}
                      date={cell.dateStr}
                      onClick={() => setSelectedEvent({ type: 'completed', data: store, date: cell.dateStr })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-50 md:hidden">
          {daysWithEvents.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <CalendarIcon size={32} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">No events scheduled this month.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {daysWithEvents.map((day) => (
                <div key={`mob-${day.dateStr}`} className="bg-white p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 flex-col items-center justify-center rounded-xl ${
                        isToday(day.date) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="mb-0.5 text-[10px] font-bold uppercase leading-none">{format(day.date, 'EEE')}</span>
                      <span className="text-sm font-black leading-none">{format(day.date, 'd')}</span>
                    </div>
                    {isToday(day.date) ? (
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-600">Today</span>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {day.plannedRoutes.map((route, idx) => (
                      <CalendarDayEvent
                        key={`mob-planned-${day.dateStr}-${route.key}-${idx}`}
                        type="planned"
                        data={route}
                        date={day.dateStr}
                        isMobile
                        onClick={() => setSelectedEvent({ type: 'planned', data: route, date: day.dateStr })}
                      />
                    ))}
                    {day.completedStores.map((store, idx) => (
                      <CalendarDayEvent
                        key={`mob-completed-${day.dateStr}-${store.id}-${idx}`}
                        type="completed"
                        data={store}
                        date={day.dateStr}
                        isMobile
                        onClick={() => setSelectedEvent({ type: 'completed', data: store, date: day.dateStr })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedEvent ? <CalendarEventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} /> : null}
    </div>
  )
}
