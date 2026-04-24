'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Layers3,
  MapPin,
  Search,
  Store,
  XCircle,
} from 'lucide-react'

import { StoreMobileCard } from '@/components/stores/store-mobile-card'
import type { StoreDirectoryStore } from '@/components/stores/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  type WorkspaceDensity,
  WorkspaceDensityToggle,
  WorkspaceEmptyState,
  WorkspacePreviewPanel,
  WorkspaceSectionCard,
  WorkspaceSplit,
  WorkspaceToolbar,
  WorkspaceToolbarGroup,
  WorkspaceViewChips,
} from '@/components/workspace/workspace-shell'
import { formatStoreName } from '@/lib/store-display'
import { getStoreRegionGroup } from '@/lib/store-region-groups'
import { cn, formatAppDate, getDisplayStoreCode } from '@/lib/utils'

interface StoreDirectoryProps {
  stores: StoreDirectoryStore[]
}

type StoreDirectoryView = 'all' | 'attention' | 'active' | 'inactive'

function getStoreGroup(store: StoreDirectoryStore) {
  return getStoreRegionGroup(store.region, store.store_name, store.city, store.postcode)
}

function getOpenIncidentCount(store: StoreDirectoryStore) {
  return store.incidents.filter((incident) => !['closed', 'cancelled'].includes(String(incident.status || '').toLowerCase())).length
}

function getOpenActionCount(store: StoreDirectoryStore) {
  return store.actions.filter((action) => !['complete', 'cancelled'].includes(String(action.status || '').toLowerCase())).length
}

function getAttentionSummary(store: StoreDirectoryStore) {
  const openIncidents = getOpenIncidentCount(store)
  const openActions = getOpenActionCount(store)

  if (openIncidents > 0 && openActions > 0) return `${openIncidents} incidents • ${openActions} actions`
  if (openIncidents > 0) return `${openIncidents} open incidents`
  if (openActions > 0) return `${openActions} open actions`
  return 'No open actions or incidents'
}

function getLatestIncidentDate(store: StoreDirectoryStore) {
  const timestamps = store.incidents
    .map((incident) => (incident.occurred_at ? new Date(incident.occurred_at).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)

  if (timestamps.length === 0) return 'No incidents logged'
  return formatAppDate(new Date(timestamps[0]).toISOString())
}

function buildAddress(store: StoreDirectoryStore) {
  return [store.address_line_1, store.city, store.postcode].filter(Boolean).join(', ')
}

function buildMapsUrl(store: StoreDirectoryStore) {
  const address = buildAddress(store)
  if (!address) return null
  return `https://maps.apple.com/?q=${encodeURIComponent(store.store_name)}&address=${encodeURIComponent(address)}`
}

function StoreDirectoryPreview({ store }: { store: StoreDirectoryStore }) {
  const group = getStoreGroup(store)
  const openIncidents = getOpenIncidentCount(store)
  const openActions = getOpenActionCount(store)
  const mapsUrl = buildMapsUrl(store)
  const address = buildAddress(store)

  return (
    <WorkspacePreviewPanel
      title={formatStoreName(store.store_name)}
      description={`${group}${store.region ? ` • ${store.region}` : ''}`}
      actions={
        store.is_active ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Active
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <XCircle className="h-3 w-3" />
            Inactive
          </Badge>
        )
      }
    >
      <div className="flex flex-wrap gap-2">
        {getDisplayStoreCode(store.store_code) ? <Badge variant="outline">{getDisplayStoreCode(store.store_code)}</Badge> : null}
        <Badge variant={openIncidents > 0 ? 'critical' : 'secondary'}>{openIncidents} incidents</Badge>
        <Badge variant={openActions > 0 ? 'warning' : 'secondary'}>{openActions} actions</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Open risk</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{getAttentionSummary(store)}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Latest incident</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{getLatestIncidentDate(store)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Location</p>
        <div className="mt-2 flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <p className="text-sm text-ink-soft">{address || 'No address recorded'}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Priority signals</p>
        {store.incidents.slice(0, 2).map((incident) => (
          <div key={incident.id} className="rounded-xl border border-line bg-surface-raised px-3 py-3">
            <p className="text-sm font-semibold text-foreground">
              {incident.summary || incident.reference_no || 'Incident'}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {incident.reference_no ? `${incident.reference_no} • ` : ''}
              {incident.status || 'Open'}
            </p>
          </div>
        ))}
        {store.incidents.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface-raised px-3 py-3 text-sm text-ink-soft">
            No open incident detail is currently attached to this store.
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link href={`/stores/${store.id}`} prefetch={false}>
            Open Record
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
        {mapsUrl ? (
          <Button asChild variant="outline" className="w-full">
            <a href={mapsUrl} target="_blank" rel="noreferrer">
              Open in Maps
            </a>
          </Button>
        ) : null}
      </div>
    </WorkspacePreviewPanel>
  )
}

export function StoreDirectory({ stores }: StoreDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [view, setView] = useState<StoreDirectoryView>('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [density, setDensity] = useState<WorkspaceDensity>('comfortable')
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)

  const groupOptions = useMemo(() => {
    const groups = new Set<string>()
    stores.forEach((store) => groups.add(getStoreGroup(store)))
    return Array.from(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [stores])

  const viewOptions = useMemo(
    () => [
      { value: 'all' as const, label: 'All stores', count: stores.length },
      {
        value: 'attention' as const,
        label: 'Needs attention',
        count: stores.filter((store) => getOpenIncidentCount(store) > 0 || getOpenActionCount(store) > 0).length,
      },
      { value: 'active' as const, label: 'Active', count: stores.filter((store) => Boolean(store.is_active)).length },
      { value: 'inactive' as const, label: 'Inactive', count: stores.filter((store) => !store.is_active).length },
    ],
    [stores]
  )

  const filteredStores = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()

    return stores.filter((store) => {
      const group = getStoreGroup(store)
      const openIncidents = getOpenIncidentCount(store)
      const openActions = getOpenActionCount(store)
      const matchesView =
        view === 'all' ||
        (view === 'attention' && (openIncidents > 0 || openActions > 0)) ||
        (view === 'active' && Boolean(store.is_active)) ||
        (view === 'inactive' && !store.is_active)
      const matchesGroup = groupFilter === 'all' || group === groupFilter
      const matchesQuery =
        query.length === 0 ||
        formatStoreName(store.store_name).toLowerCase().includes(query) ||
        String(store.store_code || '').toLowerCase().includes(query) ||
        String(store.city || '').toLowerCase().includes(query) ||
        String(store.region || '').toLowerCase().includes(query) ||
        String(store.postcode || '').toLowerCase().includes(query) ||
        String(store.address_line_1 || '').toLowerCase().includes(query) ||
        group.toLowerCase().includes(query)

      return matchesView && matchesGroup && matchesQuery
    })
  }, [deferredSearchQuery, groupFilter, stores, view])

  const sortedStores = useMemo(
    () =>
      [...filteredStores].sort((a, b) => {
        const groupCompare = getStoreGroup(a).localeCompare(getStoreGroup(b), undefined, { numeric: true, sensitivity: 'base' })
        if (groupCompare !== 0) return groupCompare

        const attentionDiff = getOpenIncidentCount(b) + getOpenActionCount(b) - (getOpenIncidentCount(a) + getOpenActionCount(a))
        if (attentionDiff !== 0) return attentionDiff

        return formatStoreName(a.store_name).localeCompare(formatStoreName(b.store_name), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      }),
    [filteredStores]
  )

  useEffect(() => {
    if (sortedStores.length === 0) {
      setSelectedStoreId(null)
      return
    }

    if (!selectedStoreId || !sortedStores.some((store) => store.id === selectedStoreId)) {
      setSelectedStoreId(sortedStores[0].id)
    }
  }, [selectedStoreId, sortedStores])

  const selectedStore = useMemo(
    () => sortedStores.find((store) => store.id === selectedStoreId) || null,
    [selectedStoreId, sortedStores]
  )

  const visibleGroupCount = useMemo(
    () => new Set(sortedStores.map((store) => getStoreGroup(store))).size,
    [sortedStores]
  )

  const tablePaddingClass = density === 'compact' ? 'px-4 py-3' : 'px-4 py-4'

  return (
    <div className="space-y-4 md:space-y-5">
      <WorkspaceToolbar>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <WorkspaceToolbarGroup className="lg:min-w-0 lg:flex-1">
            <div className="relative w-full sm:w-96">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input
                type="text"
                placeholder="Search by store, code, city, group, or postcode"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full pl-12"
              />
            </div>

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
          </WorkspaceToolbarGroup>

          <div className="flex flex-col gap-3 lg:items-end">
            <WorkspaceViewChips options={viewOptions} value={view} onValueChange={setView} />
            <div className="flex items-center gap-3 self-start lg:self-end">
              <WorkspaceDensityToggle value={density} onValueChange={setDensity} />
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
                <Layers3 className="h-3.5 w-3.5" />
                {sortedStores.length} shown
              </div>
            </div>
          </div>
        </div>
      </WorkspaceToolbar>

      <WorkspaceSplit
        main={
          <WorkspaceSectionCard>
            <div className="border-b border-line bg-surface-subtle/72 px-4 py-4 md:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Store CRM workspace</h2>
                  <p className="text-sm text-ink-soft">
                    Browse the live estate, filter attention points, and keep a preview open while you work.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Store className="h-3 w-3" />
                    {visibleGroupCount} groups
                  </Badge>
                  <Badge variant="secondary">{sortedStores.length} stores</Badge>
                </div>
              </div>
            </div>

            <div className="p-4 md:hidden">
              <div className="space-y-3">
                {sortedStores.length === 0 ? (
                  <WorkspaceEmptyState
                    icon={Store}
                    title="No stores found"
                    description={searchQuery ? 'Try widening the filters or search terms.' : 'No stores match the current workspace view.'}
                  />
                ) : (
                  sortedStores.map((store) => (
                    <StoreMobileCard
                      key={store.id}
                      store={store}
                      density={density}
                      selected={store.id === selectedStore?.id}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="max-h-[70vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-surface-raised">
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Open risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedStores.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="px-4 py-12">
                          <WorkspaceEmptyState
                            icon={Store}
                            title="No stores found"
                            description={searchQuery ? 'Try widening the filters or search terms.' : 'No stores match the current workspace view.'}
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedStores.map((store) => {
                        const openIncidents = getOpenIncidentCount(store)
                        const openActions = getOpenActionCount(store)
                        const selected = store.id === selectedStore?.id

                        return (
                          <TableRow
                            key={store.id}
                            onClick={() => setSelectedStoreId(store.id)}
                            aria-selected={selected}
                            className={cn(
                              'cursor-pointer align-top transition-colors',
                              selected ? 'bg-surface-subtle/72' : 'hover:bg-surface-subtle/52'
                            )}
                          >
                            <TableCell className={tablePaddingClass}>
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground">{formatStoreName(store.store_name)}</p>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                                  {getDisplayStoreCode(store.store_code) ? (
                                    <span className="inline-flex rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[11px]">
                                      {getDisplayStoreCode(store.store_code)}
                                    </span>
                                  ) : null}
                                  <span>{getAttentionSummary(store)}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className={tablePaddingClass}>
                              <span className="text-sm text-ink-soft">{getStoreGroup(store)}</span>
                            </TableCell>
                            <TableCell className={tablePaddingClass}>
                              <div className="flex items-start gap-2">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                                <span className="text-sm text-ink-soft">{buildAddress(store) || 'No address recorded'}</span>
                              </div>
                            </TableCell>
                            <TableCell className={tablePaddingClass}>
                              {store.is_active ? (
                                <Badge variant="success" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Inactive
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className={cn(tablePaddingClass, 'text-right')}>
                              <div className="flex flex-wrap justify-end gap-2">
                                <Badge variant={openIncidents > 0 ? 'critical' : 'secondary'}>{openIncidents} incidents</Badge>
                                <Badge variant={openActions > 0 ? 'warning' : 'secondary'}>{openActions} actions</Badge>
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
          </WorkspaceSectionCard>
        }
        preview={
          selectedStore ? (
            <StoreDirectoryPreview store={selectedStore} />
          ) : (
            <WorkspacePreviewPanel title="No store selected" description="Select a store to inspect the live CRM summary.">
              <WorkspaceEmptyState
                icon={Store}
                title="Select a store"
                description="The preview rail shows address, open risk, and quick actions for the selected record."
              />
            </WorkspacePreviewPanel>
          )
        }
      />
    </div>
  )
}
