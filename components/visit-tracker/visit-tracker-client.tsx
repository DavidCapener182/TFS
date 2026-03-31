'use client'

import Link from 'next/link'
import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CalendarDays,
  ClipboardList,
  MapPinned,
  Search,
  ShieldAlert,
  Shuffle,
  Store,
} from 'lucide-react'

import { StoreVisitModal } from '@/components/visit-tracker/store-visit-modal'
import type { VisitTrackerRow } from '@/components/visit-tracker/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { UserRole } from '@/lib/auth'
import type { StoreVisitProductCatalogItem } from '@/lib/store-visit-product-catalog'
import { getStoreVisitNeedLevelLabel } from '@/lib/visit-needs'
import { formatStoreName } from '@/lib/store-display'
import { getStoreRegionGroup } from '@/lib/store-region-groups'
import { cn, formatAppDate, getDisplayStoreCode } from '@/lib/utils'

interface VisitTrackerClientProps {
  rows: VisitTrackerRow[]
  productCatalog: StoreVisitProductCatalogItem[]
  userRole: UserRole
  currentUserName: string | null
  visitsAvailable: boolean
  visitsUnavailableMessage: string | null
}

function formatDate(value: string | null): string {
  return value ? formatAppDate(value) : 'Not recorded'
}

function isRecentVisit(value: string | null): boolean {
  if (!value) return false
  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) return false
  return Date.now() - parsed <= 30 * 86_400_000
}

function needLevelClasses(level: VisitTrackerRow['visitNeedLevel']): string {
  if (level === 'urgent') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (level === 'needed') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (level === 'monitor') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function visitStateClasses(state: VisitTrackerRow['visitState']): string {
  if (state === 'planned') return 'border-indigo-200 bg-indigo-50 text-indigo-700'
  if (state === 'random') return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
  if (state === 'recent') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

function sortRows(rows: VisitTrackerRow[]): VisitTrackerRow[] {
  const needOrder: Record<VisitTrackerRow['visitNeedLevel'], number> = {
    urgent: 0,
    needed: 1,
    monitor: 2,
    none: 3,
  }

  return [...rows].sort((a, b) => {
    const needDiff = needOrder[a.visitNeedLevel] - needOrder[b.visitNeedLevel]
    if (needDiff !== 0) return needDiff

    const aPlanned = a.nextPlannedVisitDate ? new Date(a.nextPlannedVisitDate).getTime() : Number.MAX_SAFE_INTEGER
    const bPlanned = b.nextPlannedVisitDate ? new Date(b.nextPlannedVisitDate).getTime() : Number.MAX_SAFE_INTEGER
    if (aPlanned !== bPlanned) return aPlanned - bPlanned

    if (a.visitNeedScore !== b.visitNeedScore) return b.visitNeedScore - a.visitNeedScore
    return formatStoreName(a.storeName).localeCompare(formatStoreName(b.storeName))
  })
}

function getVisitTrackerRowGroup(row: VisitTrackerRow): string {
  return getStoreRegionGroup(row.region, row.storeName, row.city, row.postcode)
}

function VisitNeedBadge({ level, score }: { level: VisitTrackerRow['visitNeedLevel']; score: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
        needLevelClasses(level)
      )}
    >
      {getStoreVisitNeedLevelLabel(level)}
      <span className="text-[10px] opacity-80">({score})</span>
    </span>
  )
}

function VisitStateBadge({ state }: { state: VisitTrackerRow['visitState'] }) {
  const label =
    state === 'planned'
      ? 'Planned'
      : state === 'random'
        ? 'Random'
        : state === 'recent'
          ? 'Recent'
          : 'No plan'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
        visitStateClasses(state)
      )}
    >
      {label}
    </span>
  )
}

function VisitTable({
  rows,
  canPlanVisits,
  canLogVisits,
  onOpenStore,
}: {
  rows: VisitTrackerRow[]
  canPlanVisits: boolean
  canLogVisits: boolean
  onOpenStore: (row: VisitTrackerRow) => void
}) {
  const router = useRouter()

  const openVisitModal = (
    event: MouseEvent<HTMLButtonElement>,
    row: VisitTrackerRow,
    onOpenStore: (row: VisitTrackerRow) => void
  ) => {
    event.preventDefault()
    event.stopPropagation()
    onOpenStore(row)
  }

  const navigateFromCard = (event: MouseEvent<HTMLButtonElement>, href: string) => {
    event.preventDefault()
    event.stopPropagation()
    router.push(href)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-3 p-3 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No stores match the current filters.
          </div>
        ) : (
          rows.map((row) => (
            <article key={row.storeId} className="space-y-3 rounded-2xl border border-slate-200 p-3">
              <button type="button" onClick={() => onOpenStore(row)} className="w-full text-left">
                <div className="font-semibold text-slate-900">{formatStoreName(row.storeName)}</div>
                <div className="text-xs text-slate-500">
                  {getDisplayStoreCode(row.storeCode) || 'No store code'}
                  {row.assignedManager ? ` • ${row.assignedManager}` : ''}
                </div>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <VisitNeedBadge level={row.visitNeedLevel} score={row.visitNeedScore} />
                <VisitStateBadge state={row.visitState} />
              </div>

              <p className="text-xs text-slate-500">
                {row.visitNeedReasons.length > 0
                  ? row.visitNeedReasons.join(' • ')
                  : 'No current LP or security drivers are pushing a visit.'}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="rounded-xl bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Last visit</div>
                  <div className="mt-1 text-slate-700">{formatDate(row.lastVisitDate)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Planned</div>
                  <div className="mt-1 text-slate-700">
                    {row.nextPlannedVisitDate ? formatDate(row.nextPlannedVisitDate) : 'No active plan'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Open actions</div>
                  <div className="mt-1 text-slate-700">{row.openStoreActionCount}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Open incidents</div>
                  <div className="mt-1 text-slate-700">{row.openIncidentCount}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={(event) => openVisitModal(event, row, onOpenStore)}
                  disabled={!canLogVisits}
                  className="bg-[#232154] text-white hover:bg-[#1c0259]"
                >
                  Start Visit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-200"
                  onClick={(event) => navigateFromCard(event, `/stores/${row.storeId}`)}
                >
                  Store
                </Button>
                {canPlanVisits ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="col-span-2 border-slate-200"
                    onClick={(event) => navigateFromCard(event, '/route-planning')}
                  >
                    Plan Route
                  </Button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="hidden max-h-[560px] overflow-auto md:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-white">
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead>Visit Need</TableHead>
              <TableHead>Last Visit</TableHead>
              <TableHead>Planned</TableHead>
              <TableHead>Open Risk</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                  No stores match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.storeId} className="align-top hover:bg-slate-50/80">
                  <TableCell className="min-w-[220px]">
                    <button
                      type="button"
                      onClick={() => onOpenStore(row)}
                      className="w-full text-left transition-opacity hover:opacity-80"
                    >
                      <div className="font-semibold text-slate-900">{formatStoreName(row.storeName)}</div>
                      <div className="text-xs text-slate-500">
                        {getDisplayStoreCode(row.storeCode) || 'No store code'}
                        {row.assignedManager ? ` • ${row.assignedManager}` : ''}
                      </div>
                    </button>
                  </TableCell>
                  <TableCell className="min-w-[250px]">
                    <div className="space-y-2">
                      <VisitNeedBadge level={row.visitNeedLevel} score={row.visitNeedScore} />
                      <div className="text-xs text-slate-500">
                        {row.visitNeedReasons.length > 0
                          ? row.visitNeedReasons.join(' • ')
                          : 'No current LP or security drivers are pushing a visit.'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[170px]">
                    <div className="space-y-1">
                      <div className="text-sm text-slate-700">{formatDate(row.lastVisitDate)}</div>
                      <div className="text-xs text-slate-500">{row.lastVisitType || 'No visit logged yet'}</div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    <div className="space-y-2">
                      <div className="text-sm text-slate-700">
                        {row.nextPlannedVisitDate ? formatDate(row.nextPlannedVisitDate) : 'No active plan'}
                      </div>
                      <VisitStateBadge state={row.visitState} />
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[150px]">
                    <div className="space-y-1 text-sm text-slate-700">
                      <div>{row.openStoreActionCount} open actions</div>
                      <div>{row.openIncidentCount} open incidents</div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[210px] text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={(event) => openVisitModal(event, row, onOpenStore)}
                        disabled={!canLogVisits}
                        className="bg-[#232154] text-white hover:bg-[#1c0259]"
                      >
                        Log Visit
                      </Button>
                      {canPlanVisits ? (
                        <Button asChild size="sm" variant="outline" className="border-slate-200">
                          <Link href="/route-planning">Plan</Link>
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="outline" className="border-slate-200">
                        <Link href={`/stores/${row.storeId}`}>Store</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function VisitTrackerClient({
  rows,
  productCatalog,
  userRole,
  currentUserName,
  visitsAvailable,
  visitsUnavailableMessage,
}: VisitTrackerClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeView, setActiveView] = useState<'by-group' | 'all-stores'>('by-group')
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [focusFlaggedOnly, setFocusFlaggedOnly] = useState(false)
  const [selectedRow, setSelectedRow] = useState<VisitTrackerRow | null>(null)
  const requestedStoreId = searchParams?.get('storeId') || ''

  const canPlanVisits = userRole === 'admin' || userRole === 'ops'
  const canLogVisits = canPlanVisits && visitsAvailable

  const groupOptions = useMemo(() => {
    const values = new Set<string>()
    rows.forEach((row) => {
      values.add(getVisitTrackerRowGroup(row))
    })
    return Array.from(values).sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()

    return rows.filter((row) => {
      const rowGroup = getVisitTrackerRowGroup(row)
      const matchesGroup = groupFilter === 'all' || rowGroup === groupFilter
      const matchesSearch =
        term.length === 0 ||
        formatStoreName(row.storeName).toLowerCase().includes(term) ||
        (row.storeCode || '').toLowerCase().includes(term)
      const matchesFocus =
        !focusFlaggedOnly ||
        row.visitNeeded ||
        Boolean(row.nextPlannedVisitDate) ||
        row.visitState === 'random'

      return matchesGroup && matchesSearch && matchesFocus
    })
  }, [focusFlaggedOnly, groupFilter, rows, search])

  const groupedRows = useMemo(() => {
    const groups = new Map<string, VisitTrackerRow[]>()
    sortRows(filteredRows).forEach((row) => {
      const key = getVisitTrackerRowGroup(row)
      const existing = groups.get(key) || []
      existing.push(row)
      groups.set(key, existing)
    })
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredRows])

  const stats = useMemo(() => {
    const source =
      groupFilter === 'all'
        ? rows
        : rows.filter((row) => getVisitTrackerRowGroup(row) === groupFilter)
    const completedRows = source.filter(
      (row) => !String(row.lastVisitType || '').toLowerCase().includes('draft in progress')
    )

    return {
      needed: source.filter((row) => row.visitNeeded).length,
      planned: source.filter((row) => !!row.nextPlannedVisitDate).length,
      random: completedRows.filter((row) => row.visitState === 'random').length,
      recent: completedRows.filter((row) => isRecentVisit(row.lastVisitDate)).length,
    }
  }, [groupFilter, rows])

  useEffect(() => {
    if (!requestedStoreId) return

    const matchingRow = rows.find((row) => row.storeId === requestedStoreId) || null
    if (matchingRow) {
      setSelectedRow(matchingRow)
    }
  }, [requestedStoreId, rows])

  useEffect(() => {
    if (!selectedRow) return
    const refreshedRow = rows.find((row) => row.storeId === selectedRow.storeId) || null
    if (!refreshedRow) return
    setSelectedRow(refreshedRow)
  }, [rows, selectedRow])

  const handleModalOpenChange = (open: boolean) => {
    if (open) return

    setSelectedRow(null)

    if (!requestedStoreId) return

    const nextParams = new URLSearchParams(searchParams?.toString() || '')
    nextParams.delete('storeId')
    nextParams.delete('visitId')
    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `/visit-tracker?${nextQuery}` : '/visit-tracker')
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(145deg,#1c0259_0%,#232154_52%,#2f2b72_100%)] p-4 text-white shadow-[0_20px_44px_rgba(28,2,89,0.18)] md:p-8">
        <div className="absolute right-0 top-0 h-80 w-80 translate-x-1/3 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-56 w-56 -translate-x-1/3 translate-y-1/3 rounded-full bg-[#2A8742]/20 blur-3xl" />
        <div className="relative z-10 space-y-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#c9c2eb]">
                <ClipboardList size={14} />
                Loss Prevention Visits
              </div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Visit Tracker</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/75">
                Prioritize stores from live actions and incidents, capture random in-area visits, and log what the LP officer completed on site.
              </p>
            </div>

            {canPlanVisits ? (
              <Button asChild className="bg-[#2A8742] text-white hover:bg-[#236d36]">
                <Link href="/route-planning">Plan Visits</Link>
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Visits Needed</div>
              <div className="mt-1 text-3xl font-bold">{stats.needed}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Planned Routes</div>
              <div className="mt-1 text-3xl font-bold">{stats.planned}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Random Visits</div>
              <div className="mt-1 text-3xl font-bold">{stats.random}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Recently Logged</div>
              <div className="mt-1 text-3xl font-bold">{stats.recent}</div>
            </div>
          </div>
        </div>
      </div>

      {!visitsAvailable && visitsUnavailableMessage ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 md:px-6">
          {visitsUnavailableMessage}
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search store name or code..."
                className="min-h-[44px] pl-12 sm:pl-12"
              />
            </div>

            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="min-h-[44px] w-full sm:w-52">
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {groupOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFocusFlaggedOnly((value) => !value)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                focusFlaggedOnly
                  ? 'border-[#232154] bg-[#232154] text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              {focusFlaggedOnly ? 'Showing Priority Stores' : 'Focus Needed'}
            </button>
            <span className="text-sm text-slate-500">{filteredRows.length} stores</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'by-group' | 'all-stores')}>
          <div className="border-b border-slate-100 p-4 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 md:text-xl">Visit Priority Board</h2>
                <p className="text-sm text-slate-500">
                  Switch between grouped region views and the full loss-prevention visit list.
                </p>
              </div>
              <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-[#f5f1fb] p-1 md:w-[340px]">
                <TabsTrigger value="by-group" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#232154]">
                  <MapPinned className="mr-2 h-4 w-4" />
                  By Group
                </TabsTrigger>
                <TabsTrigger value="all-stores" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#232154]">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  All Stores
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="p-4 md:p-6">
            <TabsContent value="by-group" className="mt-0 space-y-5">
              {groupedRows.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No stores match the current filters.
                </div>
              ) : (
                groupedRows.map(([group, groupRows]) => (
                  <section key={group} className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-[#faf7fd] px-4 py-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">{group}</h3>
                        <p className="text-xs text-slate-500">{groupRows.length} stores</p>
                      </div>
                      <Store className="h-5 w-5 text-[#4b3a78]" />
                    </div>
                    <VisitTable
                      rows={groupRows}
                      canPlanVisits={canPlanVisits}
                      canLogVisits={canLogVisits}
                      onOpenStore={setSelectedRow}
                    />
                  </section>
                ))
              )}
            </TabsContent>

            <TabsContent value="all-stores" className="mt-0 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                    <ShieldAlert className="h-4 w-4" />
                    Action-led demand
                  </div>
                  <p className="mt-2 text-sm text-rose-800">
                    Stores score from current open actions and open incidents, then cool down when they were attended recently or already have a route booked.
                  </p>
                </div>
                <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-fuchsia-700">
                    <Shuffle className="h-4 w-4" />
                    Random visits supported
                  </div>
                  <p className="mt-2 text-sm text-fuchsia-800">
                    Log random in-area calls without forcing them into a fixed annual cadence.
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
                    <ClipboardList className="h-4 w-4" />
                    On-site activity capture
                  </div>
                  <p className="mt-2 text-sm text-sky-800">
                    Each visit can record banking checks, till checks, line checks, investigation work, and more.
                  </p>
                </div>
              </div>

              <VisitTable
                rows={sortRows(filteredRows)}
                canPlanVisits={canPlanVisits}
                canLogVisits={canLogVisits}
                onOpenStore={setSelectedRow}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <StoreVisitModal
        open={Boolean(selectedRow)}
        onOpenChange={handleModalOpenChange}
        row={selectedRow}
        productCatalog={productCatalog}
        canEdit={userRole === 'admin' || userRole === 'ops'}
        currentUserName={currentUserName}
        visitsAvailable={visitsAvailable}
        visitsUnavailableMessage={visitsUnavailableMessage}
      />
    </div>
  )
}
