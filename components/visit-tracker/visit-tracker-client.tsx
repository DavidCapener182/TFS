'use client'

import Link from 'next/link'
import { type MouseEvent, useDeferredValue, useEffect, useMemo, useState } from 'react'
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
import type { CaseVisitSummary, VisitHistoryEntry, VisitTrackerRow } from '@/components/visit-tracker/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MobileFilterSheet } from '@/components/workspace/mobile-filter-sheet'
import {
  type WorkspaceDensity,
  WorkspaceDensityToggle,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspacePreviewPanel,
  WorkspaceSectionCard,
  WorkspaceShell,
  WorkspaceSplit,
  WorkspaceStat,
  WorkspaceStatGrid,
  WorkspaceToolbar,
  WorkspaceToolbarGroup,
  WorkspaceViewChips,
} from '@/components/workspace/workspace-shell'
import type { UserRole } from '@/lib/auth'
import { getCaseStageTone, getCaseTypeLabel, getQueueSectionLabel } from '@/lib/cases/workflow'
import type { StoreVisitProductCatalogItem } from '@/lib/store-visit-product-catalog'
import { formatStoreName } from '@/lib/store-display'
import { getStoreRegionGroup } from '@/lib/store-region-groups'
import { cn, formatAppDate, getDisplayStoreCode } from '@/lib/utils'
import { getStoreVisitNeedLevelLabel, getStoreVisitTypeLabel } from '@/lib/visit-needs'

interface VisitTrackerClientProps {
  rows: VisitTrackerRow[]
  productCatalog: StoreVisitProductCatalogItem[]
  userRole: UserRole
  currentUserName: string | null
  visitsAvailable: boolean
  visitsUnavailableMessage: string | null
}

type VisitBoardView = 'by-group' | 'all-stores'
type VisitSavedView = 'all' | 'priority' | 'planned'

function formatDate(value: string | null): string {
  return value ? formatAppDate(value) : 'Not recorded'
}

function isRecentVisit(value: string | null): boolean {
  if (!value) return false
  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) return false
  return Date.now() - parsed <= 30 * 86_400_000
}

function getPrimaryCaseVisit(row: VisitTrackerRow, focusedCaseId?: string | null): CaseVisitSummary | null {
  if (focusedCaseId) {
    const focused = row.caseVisits.find((caseVisit) => caseVisit.caseId === focusedCaseId)
    if (focused) return focused
  }

  return row.caseVisits[0] || null
}

function getPlannedSortTime(row: VisitTrackerRow): number {
  const caseVisit = getPrimaryCaseVisit(row)
  const plannedAt = row.nextPlannedVisitDate || caseVisit?.scheduledFor || null
  if (plannedAt) {
    const plannedTime = new Date(plannedAt).getTime()
    if (Number.isFinite(plannedTime)) return plannedTime
  }

  return caseVisit ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER
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

    const aPlanned = getPlannedSortTime(a)
    const bPlanned = getPlannedSortTime(b)
    if (aPlanned !== bPlanned) return aPlanned - bPlanned

    if (a.visitNeedScore !== b.visitNeedScore) return b.visitNeedScore - a.visitNeedScore
    return formatStoreName(a.storeName).localeCompare(formatStoreName(b.storeName))
  })
}

function getVisitTrackerRowGroup(row: VisitTrackerRow): string {
  return getStoreRegionGroup(row.region, row.storeName, row.city, row.postcode)
}

function getNeedVariant(level: VisitTrackerRow['visitNeedLevel'], reason?: string | null) {
  const label = String(reason || '').trim().toLowerCase()
  if (label.includes('stocktake red') || label.includes(' red')) return 'critical' as const
  if (label.includes('theft') || label.includes('review')) return 'warning' as const
  if (level === 'urgent') return 'critical' as const
  if (level === 'needed') return 'warning' as const
  if (level === 'monitor') return 'info' as const
  return 'success' as const
}

function getVisitStateVariant(state: VisitTrackerRow['visitState']) {
  if (state === 'planned') return 'info' as const
  if (state === 'random') return 'warning' as const
  if (state === 'recent') return 'success' as const
  return 'secondary' as const
}

function getVisitNeedSummary(row: VisitTrackerRow): string {
  if (row.visitNeedReasons.length > 0) return row.visitNeedReasons.join(' • ')
  const caseVisit = getPrimaryCaseVisit(row)
  if (caseVisit) {
    return caseVisit.nextActionLabel || caseVisit.lastUpdateSummary || 'Case-linked follow-up visit is open.'
  }
  if (row.nextPlannedVisitDate) return 'Planned visit scheduled.'
  if (row.lastVisitType) return row.lastVisitType
  return 'No visit activity recorded yet.'
}

function getPlannedVisitText(row: VisitTrackerRow, focusedCaseId?: string | null): string {
  const caseVisit = getPrimaryCaseVisit(row, focusedCaseId)
  if (row.nextPlannedVisitDate) return formatDate(row.nextPlannedVisitDate)
  if (caseVisit) return caseVisit.visitStatus === 'in_progress' ? 'Case visit in progress' : 'Case visit open'
  return 'No active plan'
}

function formatPlannedPurpose(value: string | null): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'General follow-up'

  return normalized
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function formatHistoryVisitType(entry: VisitHistoryEntry) {
  if (entry.visitType === 'route_completion') return 'Planned route visit'
  return getStoreVisitTypeLabel(entry.visitType)
}

function VisitNeedBadge({
  level,
  score,
  reason,
}: {
  level: VisitTrackerRow['visitNeedLevel']
  score: number
  reason?: string | null
}) {
  const label = String(reason || '').trim() || getStoreVisitNeedLevelLabel(level)

  return (
    <Badge variant={getNeedVariant(level, reason)} className="gap-1.5">
      {label}
      <span className="text-[10px] opacity-80">({score})</span>
    </Badge>
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

  return <Badge variant={getVisitStateVariant(state)}>{label}</Badge>
}

function VisitTrackerPreview({
  row,
  canLogVisits,
  canPlanVisits,
  focusedCaseId,
  onStartVisit,
}: {
  row: VisitTrackerRow
  canLogVisits: boolean
  canPlanVisits: boolean
  focusedCaseId: string | null
  onStartVisit: (row: VisitTrackerRow) => void
}) {
  const group = getVisitTrackerRowGroup(row)
  const caseVisit = getPrimaryCaseVisit(row, focusedCaseId)

  return (
    <WorkspacePreviewPanel
      title={formatStoreName(row.storeName)}
      description={`${group}${row.assignedManager ? ` • ${row.assignedManager}` : ''}`}
      actions={<VisitStateBadge state={row.visitState} />}
    >
      <div className="flex flex-wrap gap-2">
        {getDisplayStoreCode(row.storeCode) ? <Badge variant="outline">{getDisplayStoreCode(row.storeCode)}</Badge> : null}
        <VisitNeedBadge level={row.visitNeedLevel} score={row.visitNeedScore} reason={row.visitNeedReasons[0] || null} />
        {caseVisit ? <Badge variant="info">{getCaseTypeLabel(caseVisit.caseType)}</Badge> : null}
      </div>

      {caseVisit ? (
        <div className="rounded-xl border border-info/20 bg-info-soft px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-info">Case follow-up</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {caseVisit.originReference || getCaseTypeLabel(caseVisit.caseType)}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {caseVisit.nextActionLabel || caseVisit.lastUpdateSummary || 'Start or continue the linked case visit.'}
              </p>
            </div>
            <Badge variant={getCaseStageTone(caseVisit.caseStage)}>{getQueueSectionLabel(caseVisit.caseStage)}</Badge>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {caseVisit.scheduledFor ? `Scheduled ${formatDate(caseVisit.scheduledFor)}` : 'No scheduled time set yet'}
            {caseVisit.assignedUserName ? ` • ${caseVisit.assignedUserName}` : ''}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Last visit</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatDate(row.lastVisitDate)}</p>
          <p className="mt-1 text-xs text-ink-soft">{row.lastVisitType || 'No visit logged yet'}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Planned</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {row.nextPlannedVisitDate ? formatDate(row.nextPlannedVisitDate) : 'No active plan'}
          </p>
          <p className="mt-1 text-xs text-ink-soft">{formatPlannedPurpose(row.plannedVisitPurpose)}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Open actions</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{row.openStoreActionCount}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Open incidents</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{row.openIncidentCount}</p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Visit summary</p>
        <p className="mt-2 text-sm text-ink-soft">{getVisitNeedSummary(row)}</p>
        {row.plannedVisitPurposeNote ? <p className="mt-2 text-xs text-ink-muted">{row.plannedVisitPurposeNote}</p> : null}
      </div>

      {row.activeDraftVisit ? (
        <div className="rounded-xl border border-warning/20 bg-warning-soft px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">Draft in progress</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatDate(row.activeDraftVisit.visitedAt)}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {formatHistoryVisitType(row.activeDraftVisit)}
            {row.activeDraftVisit.createdByName ? ` • ${row.activeDraftVisit.createdByName}` : ''}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Recent visits</p>
        {row.recentVisits.slice(0, 3).map((visit) => (
          <div key={visit.id} className="rounded-xl border border-line bg-surface-raised px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{formatHistoryVisitType(visit)}</p>
              <span className="text-xs text-ink-muted">{formatDate(visit.visitedAt)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {visit.createdByName ? `${visit.createdByName} • ` : ''}
              {visit.completedActivityKeys.length} activities logged
            </p>
          </div>
        ))}
        {row.recentVisits.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface-raised px-3 py-3 text-sm text-ink-soft">
            No visit history is recorded for this store yet.
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" onClick={() => onStartVisit(row)} disabled={!canLogVisits}>
          {caseVisit ? 'Start case visit' : 'Start visit'}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/stores/${row.storeId}`}>Open Store CRM</Link>
        </Button>
        {canPlanVisits ? (
          <Button asChild variant="outline">
            <Link href="/route-planning">Plan Route</Link>
          </Button>
        ) : null}
      </div>
    </WorkspacePreviewPanel>
  )
}

function VisitTable({
  rows,
  canPlanVisits,
  canLogVisits,
  density,
  focusedCaseId,
  selectedStoreId,
  onSelectRow,
  onStartVisit,
}: {
  rows: VisitTrackerRow[]
  canPlanVisits: boolean
  canLogVisits: boolean
  density: WorkspaceDensity
  focusedCaseId: string | null
  selectedStoreId: string | null
  onSelectRow: (row: VisitTrackerRow) => void
  onStartVisit: (row: VisitTrackerRow) => void
}) {
  const tablePaddingClass = density === 'compact' ? 'px-4 py-3' : 'px-4 py-4'

  const handleRowButtonClick = (
    event: MouseEvent<HTMLButtonElement>,
    callback: () => void
  ) => {
    event.preventDefault()
    event.stopPropagation()
    callback()
  }

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-line bg-surface-raised">
      <div className="space-y-3 p-3 xl:hidden">
        {rows.length === 0 ? (
          <WorkspaceEmptyState
            icon={Store}
            title="No stores match"
            description="Adjust the filters or saved view to widen the visit queue."
          />
        ) : (
          rows.map((row) => {
            const caseVisit = getPrimaryCaseVisit(row, focusedCaseId)

            return (
              <article
                key={row.storeId}
                className={cn(
                  'space-y-3 rounded-[1.25rem] border border-line bg-surface px-3 py-3',
                  row.storeId === selectedStoreId && 'border-line-strong bg-surface-subtle/72'
                )}
              >
                <button type="button" onClick={() => onSelectRow(row)} className="w-full text-left">
                  <div className="font-semibold text-foreground">{formatStoreName(row.storeName)}</div>
                  <div className="text-xs text-ink-muted">
                    {getDisplayStoreCode(row.storeCode) || 'No store code'}
                    {row.assignedManager ? ` • ${row.assignedManager}` : ''}
                  </div>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <VisitNeedBadge level={row.visitNeedLevel} score={row.visitNeedScore} reason={row.visitNeedReasons[0] || null} />
                  <VisitStateBadge state={row.visitState} />
                </div>

                <p className="text-xs text-ink-soft">{getVisitNeedSummary(row)}</p>

                <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
                  <div className="rounded-xl bg-surface-subtle px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted">Last visit</div>
                    <div className="mt-1 text-foreground">{formatDate(row.lastVisitDate)}</div>
                  </div>
                  <div className="rounded-xl bg-surface-subtle px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted">Planned</div>
                    <div className="mt-1 text-foreground">{getPlannedVisitText(row, focusedCaseId)}</div>
                  </div>
                  <div className="rounded-xl bg-surface-subtle px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted">Open actions</div>
                    <div className="mt-1 text-foreground">{row.openStoreActionCount}</div>
                  </div>
                  <div className="rounded-xl bg-surface-subtle px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted">Open incidents</div>
                    <div className="mt-1 text-foreground">{row.openIncidentCount}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={(event) => handleRowButtonClick(event, () => onStartVisit(row))}
                    disabled={!canLogVisits}
                  >
                    {caseVisit ? 'Start case visit' : 'Start visit'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={(event) => handleRowButtonClick(event, () => onSelectRow(row))}>
                    Preview
                  </Button>
                  {canPlanVisits ? (
                    <Button asChild size="sm" variant="outline" className="col-span-2">
                      <Link href="/route-planning">Plan Route</Link>
                    </Button>
                  ) : null}
                </div>
              </article>
            )
          })
        )}
      </div>

      <div className="hidden max-h-[560px] overflow-auto xl:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-raised">
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead>Visit need</TableHead>
              <TableHead>Last visit</TableHead>
              <TableHead>Planned</TableHead>
              <TableHead>Open risk</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="px-4 py-10">
                  <WorkspaceEmptyState
                    icon={Store}
                    title="No stores match"
                    description="Adjust the filters or saved view to widen the visit queue."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const selected = row.storeId === selectedStoreId
                const caseVisit = getPrimaryCaseVisit(row, focusedCaseId)

                return (
                  <TableRow
                    key={row.storeId}
                    onClick={() => onSelectRow(row)}
                    aria-selected={selected}
                    className={cn(
                      'cursor-pointer align-top transition-colors',
                      selected ? 'bg-surface-subtle/72' : 'hover:bg-surface-subtle/52'
                    )}
                  >
                    <TableCell className={tablePaddingClass}>
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{formatStoreName(row.storeName)}</p>
                        <div className="text-xs text-ink-muted">
                          {getDisplayStoreCode(row.storeCode) || 'No store code'}
                          {row.assignedManager ? ` • ${row.assignedManager}` : ''}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={tablePaddingClass}>
                      <div className="space-y-2">
                        <VisitNeedBadge level={row.visitNeedLevel} score={row.visitNeedScore} reason={row.visitNeedReasons[0] || null} />
                        <p className="text-xs text-ink-soft">{getVisitNeedSummary(row)}</p>
                      </div>
                    </TableCell>
                    <TableCell className={tablePaddingClass}>
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{formatDate(row.lastVisitDate)}</p>
                        <p className="text-xs text-ink-muted">{row.lastVisitType || 'No visit logged yet'}</p>
                      </div>
                    </TableCell>
                    <TableCell className={tablePaddingClass}>
                      <div className="space-y-2">
                        <p className="text-sm text-foreground">
                          {getPlannedVisitText(row, focusedCaseId)}
                        </p>
                        <VisitStateBadge state={row.visitState} />
                      </div>
                    </TableCell>
                    <TableCell className={tablePaddingClass}>
                      <div className="space-y-1 text-sm text-ink-soft">
                        <p>{row.openStoreActionCount} open actions</p>
                        <p>{row.openIncidentCount} open incidents</p>
                      </div>
                    </TableCell>
                    <TableCell className={cn(tablePaddingClass, 'text-right')}>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={(event) => handleRowButtonClick(event, () => onStartVisit(row))}
                          disabled={!canLogVisits}
                        >
                          {caseVisit ? 'Case visit' : 'Start'}
                        </Button>
                        {canPlanVisits ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href="/route-planning">Plan</Link>
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/stores/${row.storeId}`}>Store</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
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
  const requestedStoreId = searchParams?.get('storeId') || ''
  const requestedCaseId = searchParams?.get('caseId') || ''
  const [activeBoardView, setActiveBoardView] = useState<VisitBoardView>('by-group')
  const [savedView, setSavedView] = useState<VisitSavedView>('all')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [groupFilter, setGroupFilter] = useState('all')
  const [density, setDensity] = useState<WorkspaceDensity>('comfortable')
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(requestedStoreId || null)
  const [visitModalRow, setVisitModalRow] = useState<VisitTrackerRow | null>(null)

  const canPlanVisits = userRole === 'admin' || userRole === 'ops'
  const canLogVisits = canPlanVisits && visitsAvailable

  const groupOptions = useMemo(() => {
    const values = new Set<string>()
    rows.forEach((row) => values.add(getVisitTrackerRowGroup(row)))
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase()

    return rows.filter((row) => {
      const rowGroup = getVisitTrackerRowGroup(row)
      const matchesGroup = groupFilter === 'all' || rowGroup === groupFilter
      const matchesSearch =
        term.length === 0 ||
        formatStoreName(row.storeName).toLowerCase().includes(term) ||
        String(row.storeCode || '').toLowerCase().includes(term) ||
        String(row.region || '').toLowerCase().includes(term) ||
        String(row.city || '').toLowerCase().includes(term)
      const matchesSavedView =
        savedView === 'all' ||
        (savedView === 'priority' &&
          (row.visitNeeded || row.openIncidentCount > 0 || row.openStoreActionCount > 0)) ||
        (savedView === 'planned' && (Boolean(row.nextPlannedVisitDate) || row.caseVisits.length > 0))

      return matchesGroup && matchesSearch && matchesSavedView
    })
  }, [deferredSearch, groupFilter, rows, savedView])

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

  const orderedRows = useMemo(() => sortRows(filteredRows), [filteredRows])

  const savedViewOptions = useMemo(
    () => [
      { value: 'all' as const, label: 'All stores', count: rows.length },
      {
        value: 'priority' as const,
        label: 'Priority',
        count: rows.filter(
          (row) => row.visitNeeded || row.openIncidentCount > 0 || row.openStoreActionCount > 0
        ).length,
      },
      {
        value: 'planned' as const,
        label: 'Planned',
        count: rows.filter((row) => Boolean(row.nextPlannedVisitDate) || row.caseVisits.length > 0).length,
      },
    ],
    [rows]
  )

  const stats = useMemo(() => {
    const source = groupFilter === 'all' ? rows : rows.filter((row) => getVisitTrackerRowGroup(row) === groupFilter)
    const completedRows = source.filter((row) => !String(row.lastVisitType || '').toLowerCase().includes('draft in progress'))

    return {
      needed: source.filter((row) => row.visitNeeded).length,
      planned: source.filter((row) => Boolean(row.nextPlannedVisitDate) || row.caseVisits.length > 0).length,
      random: completedRows.filter((row) => row.visitState === 'random').length,
      recent: completedRows.filter((row) => isRecentVisit(row.lastVisitDate)).length,
    }
  }, [groupFilter, rows])

  useEffect(() => {
    if (!requestedStoreId) return
    setSelectedStoreId(requestedStoreId)
  }, [requestedStoreId])

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedStoreId(null)
      return
    }

    if (!selectedStoreId || !filteredRows.some((row) => row.storeId === selectedStoreId)) {
      setSelectedStoreId(sortRows(filteredRows)[0]?.storeId || null)
    }
  }, [filteredRows, selectedStoreId])

  const selectedRow = useMemo(
    () => filteredRows.find((row) => row.storeId === selectedStoreId) || null,
    [filteredRows, selectedStoreId]
  )

  const selectedCaseVisit = useMemo(
    () => (selectedRow ? getPrimaryCaseVisit(selectedRow, requestedCaseId || null) : null),
    [requestedCaseId, selectedRow]
  )
  const activeFilterCount = [
    search.trim(),
    groupFilter !== 'all' ? groupFilter : null,
    savedView !== 'all' ? savedView : null,
  ].filter(Boolean).length

  const updateSelectedStore = (storeId: string | null) => {
    setSelectedStoreId(storeId)
    const nextParams = new URLSearchParams(searchParams?.toString() || '')

    if (storeId) {
      nextParams.set('storeId', storeId)
    } else {
      nextParams.delete('storeId')
    }

    if (storeId !== requestedStoreId) {
      nextParams.delete('caseId')
    }

    nextParams.delete('visitId')
    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `/visit-tracker?${nextQuery}` : '/visit-tracker', { scroll: false })
  }

  return (
    <WorkspaceShell>
      <WorkspaceHeader
        eyebrow="Store Visits"
        icon={ClipboardList}
        title="Visit command centre"
        description="Prioritize stores from live actions and incidents, plan route visits, and keep the selected store open while you capture work."
        actions={
          canPlanVisits ? (
            <Button asChild>
              <Link href="/route-planning">Plan visits</Link>
            </Button>
          ) : null
        }
      />

      <WorkspaceStatGrid>
        <WorkspaceStat label="Visits needed" value={stats.needed} note="Stores currently requiring attention" icon={ShieldAlert} tone="warning" />
        <WorkspaceStat label="Planned visits" value={stats.planned} note="Stores with route or case follow-up already scheduled" icon={CalendarDays} tone="info" />
        <WorkspaceStat label="Random visits" value={stats.random} note="Recent in-area activity" icon={Shuffle} tone="warning" />
        <WorkspaceStat label="Recently logged" value={stats.recent} note="Visits captured in the last 30 days" icon={Store} tone="success" />
      </WorkspaceStatGrid>

      {!visitsAvailable && visitsUnavailableMessage ? (
        <div className="rounded-[1.35rem] border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning md:px-5">
          {visitsUnavailableMessage}
        </div>
      ) : null}

      {selectedCaseVisit ? (
        <div className="rounded-[1.35rem] border border-info/20 bg-info-soft px-4 py-3 text-sm text-foreground md:px-5">
          <span className="font-semibold">{getCaseTypeLabel(selectedCaseVisit.caseType)}</span>
          {selectedCaseVisit.originReference ? ` • ${selectedCaseVisit.originReference}` : ''}
          {selectedCaseVisit.nextActionLabel ? ` • ${selectedCaseVisit.nextActionLabel}` : ''}
          . Random in-area visits are still available from the visit type selector if this stop becomes an ad-hoc call instead.
        </div>
      ) : null}

      <WorkspaceToolbar>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-3">
            <WorkspaceToolbarGroup>
              <div className="relative w-full sm:w-96">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search store name, code, city, or region"
                  className="w-full pl-12"
                />
              </div>

              <div className="w-full xl:hidden">
                <MobileFilterSheet
                  activeFilterCount={activeFilterCount}
                  title="Filters"
                  description="Refine the visit board by group, saved view, and display density."
                >
                  <div className="space-y-4">
                    <Select value={groupFilter} onValueChange={setGroupFilter}>
                      <SelectTrigger className="w-full">
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
                    <WorkspaceViewChips options={savedViewOptions} value={savedView} onValueChange={setSavedView} />
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-subtle px-3 py-3">
                      <span className="text-sm font-semibold text-foreground">Density</span>
                      <WorkspaceDensityToggle value={density} onValueChange={setDensity} />
                    </div>
                  </div>
                </MobileFilterSheet>
              </div>

              <div className="hidden xl:block">
                <Select value={groupFilter} onValueChange={setGroupFilter}>
                  <SelectTrigger className="w-full sm:w-56">
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
            </WorkspaceToolbarGroup>

            <div className="hidden xl:block">
              <WorkspaceViewChips options={savedViewOptions} value={savedView} onValueChange={setSavedView} />
            </div>
          </div>

          <div className="hidden items-center gap-3 self-start xl:flex xl:self-end">
            <WorkspaceDensityToggle value={density} onValueChange={setDensity} />
            <Badge variant="secondary">{filteredRows.length} stores</Badge>
          </div>
        </div>
      </WorkspaceToolbar>

      <WorkspaceSplit
        main={
          <WorkspaceSectionCard>
            <Tabs value={activeBoardView} onValueChange={(value) => setActiveBoardView(value as VisitBoardView)}>
              <div className="border-b border-line bg-surface-subtle/72 px-4 py-4 md:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Visit workspace</h2>
                    <p className="text-sm text-ink-soft">
                      Switch between grouped queues and the full visit board without losing the selected store.
                    </p>
                  </div>
                  <TabsList className="grid h-auto w-full min-w-0 grid-cols-1 gap-2 border-0 bg-transparent p-0 sm:grid-cols-2 sm:gap-1 sm:border sm:border-line sm:bg-surface-subtle sm:p-1 md:w-[min(100%,22rem)]">
                    <TabsTrigger
                      value="by-group"
                      className="flex min-h-[48px] flex-col items-center justify-center gap-1 whitespace-normal px-3 py-2.5 text-center text-xs leading-snug sm:flex-row sm:gap-2 sm:text-left sm:text-sm"
                    >
                      <MapPinned className="h-4 w-4 shrink-0 sm:mr-0" />
                      <span>By group</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="all-stores"
                      className="flex min-h-[48px] flex-col items-center justify-center gap-1 whitespace-normal px-3 py-2.5 text-center text-xs leading-snug sm:flex-row sm:gap-2 sm:text-left sm:text-sm"
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 sm:mr-0" />
                      <span>All stores</span>
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>

              <div className="p-4 md:p-5">
                <TabsContent value="by-group" className="mt-0 space-y-4">
                  {groupedRows.length === 0 ? (
                    <WorkspaceEmptyState
                      icon={Store}
                      title="No stores match"
                      description="Adjust the filters or saved view to widen the visit queue."
                    />
                  ) : (
                    groupedRows.map(([group, groupRows]) => {
                      return (
                        <section key={group} className="space-y-3">
                          <div className="flex items-center justify-between rounded-[1.25rem] border border-line bg-surface-subtle/72 px-4 py-3">
                            <div>
                              <h3 className="font-semibold text-foreground">{group}</h3>
                              <p className="text-xs text-ink-soft">{groupRows.length} stores</p>
                            </div>
                            <Store className="h-5 w-5 text-ink-muted" />
                          </div>
                          <VisitTable
                            rows={groupRows}
                            canPlanVisits={canPlanVisits}
                            canLogVisits={canLogVisits}
                            density={density}
                            focusedCaseId={requestedCaseId || null}
                            selectedStoreId={selectedStoreId}
                            onSelectRow={(row) => updateSelectedStore(row.storeId)}
                            onStartVisit={setVisitModalRow}
                          />
                        </section>
                      )
                    })
                  )}
                </TabsContent>

                <TabsContent value="all-stores" className="mt-0 space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1.25rem] border border-critical/20 bg-critical-soft p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-critical">
                        <ShieldAlert className="h-4 w-4" />
                        Action-led demand
                      </div>
                      <p className="mt-2 text-sm text-ink-soft">
                        Stores rise in priority from open actions, incidents, and flagged review traffic.
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-warning/20 bg-warning-soft p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                        <Shuffle className="h-4 w-4" />
                        Random visits supported
                      </div>
                      <p className="mt-2 text-sm text-ink-soft">
                        Random in-area calls stay visible without forcing every store into a fixed cadence.
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-info/20 bg-info-soft p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-info">
                        <ClipboardList className="h-4 w-4" />
                        On-site activity capture
                      </div>
                      <p className="mt-2 text-sm text-ink-soft">
                        Banking checks, till checks, line checks, investigations, and evidence all sit behind the same visit flow.
                      </p>
                    </div>
                  </div>

                  <VisitTable
                    rows={orderedRows}
                    canPlanVisits={canPlanVisits}
                    canLogVisits={canLogVisits}
                    density={density}
                    focusedCaseId={requestedCaseId || null}
                    selectedStoreId={selectedStoreId}
                    onSelectRow={(row) => updateSelectedStore(row.storeId)}
                    onStartVisit={setVisitModalRow}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </WorkspaceSectionCard>
        }
        preview={
          selectedRow ? (
            <VisitTrackerPreview
              row={selectedRow}
              canLogVisits={canLogVisits}
              canPlanVisits={canPlanVisits}
              focusedCaseId={requestedCaseId || null}
              onStartVisit={setVisitModalRow}
            />
          ) : (
            <WorkspacePreviewPanel title="No store selected" description="Select a store to inspect visit history and start the next visit.">
              <WorkspaceEmptyState
                icon={Store}
                title="Select a store"
                description="The preview rail keeps the active store visible while you move through the visit board."
              />
            </WorkspacePreviewPanel>
          )
        }
      />

      <StoreVisitModal
        open={Boolean(visitModalRow)}
        onOpenChange={(open) => {
          if (!open) setVisitModalRow(null)
        }}
        row={visitModalRow}
        caseVisit={visitModalRow ? getPrimaryCaseVisit(visitModalRow, requestedCaseId || null) : null}
        productCatalog={productCatalog}
        canEdit={userRole === 'admin' || userRole === 'ops'}
        currentUserName={currentUserName}
        visitsAvailable={visitsAvailable}
        visitsUnavailableMessage={visitsUnavailableMessage}
      />
    </WorkspaceShell>
  )
}
