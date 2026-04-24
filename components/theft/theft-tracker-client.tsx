'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownAZ, ArrowUpAZ, Download, Eye, RotateCcw, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TheftMobileCard, type TheftLogMobileRow } from '@/components/theft/theft-mobile-card'
import { MobileFilterSheet } from '@/components/workspace/mobile-filter-sheet'
import { WorkspaceToolbar, WorkspaceToolbarGroup } from '@/components/workspace/workspace-shell'

function getStatusVariant(status: string) {
  const normalizedStatus = String(status || '').trim().toLowerCase()
  if (normalizedStatus === 'closed' || normalizedStatus === 'resolved') return 'success' as const
  if (normalizedStatus === 'pending' || normalizedStatus === 'review') return 'warning' as const
  return 'critical' as const
}

function formatStatusLabel(status: string) {
  const normalizedStatus = String(status || 'open').trim().toLowerCase()
  if (!normalizedStatus) return 'Open'
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)
}

function toCsvValue(value: string | number | boolean) {
  const text = String(value)
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function exportRows(rows: TheftLogMobileRow[]) {
  const headers = [
    'Reference',
    'Store',
    'Date',
    'Status',
    'Product',
    'Barcode',
    'Quantity',
    'Price',
    'Reported',
    'Adjusted through till',
    'Stock recovered',
    'Incident details',
  ]
  const csvRows = rows.map((row) => [
    row.referenceNo,
    row.storeName,
    row.date,
    formatStatusLabel(row.status),
    row.perfumeDescription,
    row.barcode,
    row.quantity,
    row.price,
    row.hasTheftBeenReported ? 'Yes' : 'No',
    row.adjustedThroughTill ? 'Yes' : 'No',
    row.stockRecovered ? 'Yes' : 'No',
    row.incidentDetails,
  ])
  const csv = [headers, ...csvRows].map((row) => row.map(toCsvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `theft-log-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function matchesFlag(filter: string, value: boolean) {
  if (filter === 'all') return true
  return filter === 'yes' ? value : !value
}

type SortKey = 'date' | 'status' | 'product' | 'quantity' | 'price'
type SortDirection = 'asc' | 'desc'

function parseRowDate(row: TheftLogMobileRow) {
  const parsed = new Date(row.date)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function parseCurrency(value: string) {
  const parsed = Number(String(value || '').replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function parseQuantity(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function compareRows(left: TheftLogMobileRow, right: TheftLogMobileRow, key: SortKey) {
  if (key === 'date') return parseRowDate(left) - parseRowDate(right)
  if (key === 'quantity') return parseQuantity(left.quantity) - parseQuantity(right.quantity)
  if (key === 'price') return parseCurrency(left.price) - parseCurrency(right.price)
  if (key === 'status') return formatStatusLabel(left.status).localeCompare(formatStatusLabel(right.status))
  return left.perfumeDescription.localeCompare(right.perfumeDescription)
}

function SortButton({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
}) {
  const active = activeKey === sortKey
  const Icon = active && direction === 'asc' ? ArrowUpAZ : ArrowDownAZ

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1 text-left uppercase tracking-[0.08em] text-inherit"
    >
      {label}
      <Icon className={active ? 'h-3.5 w-3.5 text-info' : 'h-3.5 w-3.5 text-ink-muted'} />
    </button>
  )
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[1rem] border border-line bg-surface-subtle/72 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

export function TheftTrackerClient({ rows }: { rows: TheftLogMobileRow[] }) {
  const [query, setQuery] = useState('')
  const [store, setStore] = useState('all')
  const [status, setStatus] = useState('all')
  const [adjusted, setAdjusted] = useState('all')
  const [recovered, setRecovered] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedRow, setSelectedRow] = useState<TheftLogMobileRow | null>(null)

  const stores = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.storeName).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const statuses = useMemo(() => {
    return Array.from(new Set(rows.map((row) => String(row.status || 'open').toLowerCase()))).sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (store !== 'all' && row.storeName !== store) return false
      if (status !== 'all' && String(row.status || 'open').toLowerCase() !== status) return false
      if (!matchesFlag(adjusted, row.adjustedThroughTill)) return false
      if (!matchesFlag(recovered, row.stockRecovered)) return false
      const rowTime = parseRowDate(row)
      if (dateFrom) {
        const fromTime = new Date(`${dateFrom}T00:00:00`).getTime()
        if (Number.isFinite(fromTime) && rowTime < fromTime) return false
      }
      if (dateTo) {
        const toTime = new Date(`${dateTo}T23:59:59`).getTime()
        if (Number.isFinite(toTime) && rowTime > toTime) return false
      }
      if (!normalizedQuery) return true
      return [
        row.referenceNo,
        row.storeName,
        row.date,
        row.status,
        row.perfumeDescription,
        row.barcode,
        row.quantity,
        row.price,
        row.incidentDetails,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [adjusted, dateFrom, dateTo, query, recovered, rows, status, store])

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((left, right) => {
      const result = compareRows(left, right, sortKey)
      return sortDirection === 'asc' ? result : -result
    })
  }, [filteredRows, sortDirection, sortKey])

  const hasFilters =
    query || store !== 'all' || status !== 'all' || adjusted !== 'all' || recovered !== 'all' || dateFrom || dateTo
  const activeFilterCount = [
    query,
    store !== 'all' ? store : null,
    status !== 'all' ? status : null,
    adjusted !== 'all' ? adjusted : null,
    recovered !== 'all' ? recovered : null,
    dateFrom,
    dateTo,
  ].filter(Boolean).length

  function resetFilters() {
    setQuery('')
    setStore('all')
    setStatus('all')
    setAdjusted('all')
    setRecovered('all')
    setDateFrom('')
    setDateTo('')
  }

  function handleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'date' ? 'desc' : 'asc')
  }

  return (
    <>
      <WorkspaceToolbar>
        <div className="space-y-3">
          <WorkspaceToolbarGroup className="lg:flex-col lg:items-stretch">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reference, store, product, barcode or details"
                className="bg-surface-raised pl-10"
              />
            </div>

            <div className="xl:hidden">
              <MobileFilterSheet
                activeFilterCount={activeFilterCount}
                title="Filters"
                description="Filter theft records by store, status, recovery, till adjustment, and date."
              >
                <div className="grid gap-3">
                  <select
                    value={store}
                    onChange={(event) => setStore(event.target.value)}
                    className="h-11 min-h-[44px] rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground"
                  >
                    <option value="all">All stores</option>
                    {stores.map((storeName) => (
                      <option key={storeName} value={storeName}>
                        {storeName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="h-11 min-h-[44px] rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground"
                  >
                    <option value="all">All statuses</option>
                    {statuses.map((statusValue) => (
                      <option key={statusValue} value={statusValue}>
                        {formatStatusLabel(statusValue)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={adjusted}
                    onChange={(event) => setAdjusted(event.target.value)}
                    className="h-11 min-h-[44px] rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground"
                  >
                    <option value="all">Till adjusted</option>
                    <option value="yes">Adjusted: Yes</option>
                    <option value="no">Adjusted: No</option>
                  </select>
                  <select
                    value={recovered}
                    onChange={(event) => setRecovered(event.target.value)}
                    className="h-11 min-h-[44px] rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground"
                  >
                    <option value="all">Recovery</option>
                    <option value="yes">Recovered: Yes</option>
                    <option value="no">Recovered: No</option>
                  </select>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="bg-surface-raised"
                    aria-label="Date from"
                  />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="bg-surface-raised"
                    aria-label="Date to"
                  />
                  <Button type="button" variant="outline" onClick={resetFilters} disabled={!hasFilters}>
                    <RotateCcw className="h-4 w-4" />
                    Reset filters
                  </Button>
                </div>
              </MobileFilterSheet>
            </div>

            <div className="hidden min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid xl:grid-cols-6">
              <select
                value={store}
                onChange={(event) => setStore(event.target.value)}
                className="h-11 min-h-[44px] rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground"
              >
                <option value="all">All stores</option>
                {stores.map((storeName) => (
                  <option key={storeName} value={storeName}>
                    {storeName}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-11 min-h-[44px] rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground"
              >
                <option value="all">All statuses</option>
                {statuses.map((statusValue) => (
                  <option key={statusValue} value={statusValue}>
                    {formatStatusLabel(statusValue)}
                  </option>
                ))}
              </select>
              <select
                value={adjusted}
                onChange={(event) => setAdjusted(event.target.value)}
                className="h-11 min-h-[44px] rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground"
              >
                <option value="all">Till adjusted</option>
                <option value="yes">Adjusted: Yes</option>
                <option value="no">Adjusted: No</option>
              </select>
              <select
                value={recovered}
                onChange={(event) => setRecovered(event.target.value)}
                className="h-11 min-h-[44px] rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground"
              >
                <option value="all">Recovery</option>
                <option value="yes">Recovered: Yes</option>
                <option value="no">Recovered: No</option>
              </select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="bg-surface-raised"
                aria-label="Date from"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="bg-surface-raised"
                aria-label="Date to"
              />
            </div>
          </WorkspaceToolbarGroup>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Showing {sortedRows.length} of {rows.length}
              </Badge>
              <Badge variant="outline">
                Sorted by {sortKey} {sortDirection}
              </Badge>
              {hasFilters ? <Badge variant="info">Filtered view</Badge> : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetFilters} disabled={!hasFilters}>
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
              <Button type="button" size="sm" onClick={() => exportRows(sortedRows)} disabled={sortedRows.length === 0}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>
      </WorkspaceToolbar>

      <Card className="overflow-hidden rounded-[1.5rem]">
        <CardHeader className="border-b border-line bg-surface-subtle/72">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Theft incidents</CardTitle>
              <CardDescription>
                Detailed theft lines and context. Status can be closed, but records stay on this estate log.
              </CardDescription>
            </div>
            <Badge variant="outline">{sortedRows.length} rows</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          <div className="space-y-3 p-3 xl:hidden">
            {sortedRows.map((row, index) => (
              <TheftMobileCard key={`${row.id}-${index}`} row={row} />
            ))}
            {sortedRows.length === 0 ? (
              <div className="rounded-[1.2rem] border border-line bg-surface-subtle/72 px-4 py-8 text-center text-sm text-ink-soft">
                No theft logs match the current filters.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <Table className="min-w-[1420px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-surface-subtle">Reference</TableHead>
                  <TableHead>
                    <SortButton label="Date" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </TableHead>
                  <TableHead>
                    <SortButton label="Status" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </TableHead>
                  <TableHead>
                    <SortButton label="Description (Perfumes stolen)" sortKey="product" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>
                    <SortButton label="Quantity" sortKey="quantity" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </TableHead>
                  <TableHead>
                    <SortButton label="Price" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Adjusted Through Till</TableHead>
                  <TableHead>Stock Recovered</TableHead>
                  <TableHead>Incident details</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row, index) => (
                  <TableRow
                    key={`${row.id}-${index}`}
                    className="align-top transition-colors hover:bg-surface-subtle/60"
                  >
                    <TableCell className="sticky left-0 z-10 bg-card font-mono text-xs text-slate-700">
                      <Link href={`/incidents/${row.id}`} className="text-info hover:underline">
                        {row.referenceNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-700">{row.date}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(row.status)}>{formatStatusLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-900">{row.perfumeDescription}</TableCell>
                    <TableCell className="text-slate-700">{row.barcode}</TableCell>
                    <TableCell className="text-slate-700">{row.quantity}</TableCell>
                    <TableCell className="text-slate-700">{row.price}</TableCell>
                    <TableCell>
                      <Badge variant={row.hasTheftBeenReported ? 'success' : 'outline'}>
                        {row.hasTheftBeenReported ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.adjustedThroughTill ? 'success' : 'outline'}>
                        {row.adjustedThroughTill ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.stockRecovered ? 'success' : 'outline'}>
                        {row.stockRecovered ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-slate-700">
                      <span className="line-clamp-2">{row.incidentDetails || '-'}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRow(row)}
                      >
                        <Eye className="h-4 w-4" />
                        Preview
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-8 text-center text-slate-500">
                      No theft logs match the current filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <SheetContent className="overflow-y-auto px-5 pb-6 pt-16 sm:w-[480px]">
          {selectedRow ? (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Theft preview</p>
                <SheetTitle className="mt-1 font-mono text-lg font-semibold text-foreground">
                  {selectedRow.referenceNo}
                </SheetTitle>
                <SheetDescription className="mt-1 text-sm text-ink-soft">
                  {selectedRow.storeName} · {selectedRow.date}
                </SheetDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={getStatusVariant(selectedRow.status)}>{formatStatusLabel(selectedRow.status)}</Badge>
                <Badge variant={selectedRow.hasTheftBeenReported ? 'success' : 'outline'}>
                  Reported: {selectedRow.hasTheftBeenReported ? 'Yes' : 'No'}
                </Badge>
                <Badge variant={selectedRow.adjustedThroughTill ? 'success' : 'outline'}>
                  Adjusted: {selectedRow.adjustedThroughTill ? 'Yes' : 'No'}
                </Badge>
                <Badge variant={selectedRow.stockRecovered ? 'success' : 'outline'}>
                  Recovered: {selectedRow.stockRecovered ? 'Yes' : 'No'}
                </Badge>
              </div>

              <div className="grid gap-3">
                <DetailField label="Product" value={selectedRow.perfumeDescription} />
                <DetailField label="Barcode" value={selectedRow.barcode} />
                <div className="grid grid-cols-2 gap-3">
                  <DetailField label="Quantity" value={selectedRow.quantity} />
                  <DetailField label="Price" value={selectedRow.price} />
                </div>
                <DetailField label="Incident details" value={selectedRow.incidentDetails || 'No details recorded.'} />
              </div>

              <Button asChild className="w-full">
                <Link href={`/incidents/${selectedRow.id}`}>
                  Open incident record
                </Link>
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
