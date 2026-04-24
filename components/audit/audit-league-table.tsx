'use client'

import { useMemo, useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { getInternalAreaDisplayName } from '@/lib/areas'
import { cn, getDisplayStoreCode } from '@/lib/utils'
import { AuditRow, pctBadge, formatDate, getLatestPct } from './audit-table-helpers'
import { StoreActionsModal } from './store-actions-modal'
import { Eye, EyeOff, Search, Store } from 'lucide-react'
import { UserRole } from '@/lib/auth'
import { WorkspaceEmptyState } from '@/components/workspace/workspace-shell'

// Helper: Get the most recent audit date
function getLatestDate(row: AuditRow): string | null {
  if (row.compliance_audit_2_date) return row.compliance_audit_2_date
  if (row.compliance_audit_1_date) return row.compliance_audit_1_date
  return null
}

export function AuditLeagueTable({ 
  rows, 
  userRole,
  areaFilter: externalAreaFilter, 
  onAreaFilterChange 
}: { 
  rows: AuditRow[]
  userRole: UserRole
  areaFilter?: string
  onAreaFilterChange?: (area: string) => void
}) {
  const [search, setSearch] = useState('')
  const [internalArea, setInternalArea] = useState<string>('all')
  const area = externalAreaFilter !== undefined ? externalAreaFilter : internalArea
  const setArea = onAreaFilterChange || setInternalArea
  const [hideCompleted, setHideCompleted] = useState(false)
  const [storeActionsModalOpen, setStoreActionsModalOpen] = useState(false)
  const [storeActionsRow, setStoreActionsRow] = useState<AuditRow | null>(null)
  const [tableMessage, setTableMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!tableMessage) return
    const timer = window.setTimeout(() => setTableMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [tableMessage])

  const areaOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => r.region && set.add(r.region))
    return Array.from(set).sort()
  }, [rows])

  // Helper to check if a store has any completed audit.
  // "Hide Completed" should surface stores with no completed audits yet.
  const hasAnyCompletedAudit = (row: AuditRow): boolean => {
    const audit1Complete = !!(row.compliance_audit_1_date && row.compliance_audit_1_overall_pct !== null)
    const audit2Complete = !!(row.compliance_audit_2_date && row.compliance_audit_2_overall_pct !== null)
    return audit1Complete || audit2Complete
  }

  // Rank all stores by their latest compliance percentage
  const rankedStores = useMemo(() => {
    const filtered = rows.filter((row) => {
      const matchesArea = area === 'all' || row.region === area
      const term = search.trim().toLowerCase()
      const matchesSearch =
        term.length === 0 ||
        row.store_name.toLowerCase().includes(term) ||
        (row.store_code || '').toLowerCase().includes(term)
      const matchesCompletedFilter = !hideCompleted || !hasAnyCompletedAudit(row)
      return matchesArea && matchesSearch && matchesCompletedFilter
    })

    // Sort by latest percentage (descending), then by store name
    return filtered
      .map(row => ({
        ...row,
        latestPct: getLatestPct(row),
        latestDate: getLatestDate(row),
      }))
      .sort((a, b) => {
        // Stores with percentages come first
        if (a.latestPct === null && b.latestPct !== null) return 1
        if (a.latestPct !== null && b.latestPct === null) return -1
        if (a.latestPct === null && b.latestPct === null) {
          // Both have no percentage, sort by name
          return a.store_name.localeCompare(b.store_name)
        }
        // Both have percentages, sort by percentage descending
        if (b.latestPct! - a.latestPct! !== 0) {
          return b.latestPct! - a.latestPct!
        }
        // Same percentage, sort by name
        return a.store_name.localeCompare(b.store_name)
      })
  }, [rows, area, search, hideCompleted])

  const handleOpenStoreActionsModal = (row: AuditRow) => {
    setStoreActionsRow(row)
    setStoreActionsModalOpen(true)
  }

  const handleStoreActionsCreated = (count: number, storeName: string) => {
    setTableMessage({
      type: 'success',
      text: count === 1 ? `1 action created for ${storeName}.` : `${count} actions created for ${storeName}.`,
    })
  }

  const hasActiveFilters = search.trim().length > 0 || area !== 'all' || hideCompleted
  const resetFilters = () => {
    setSearch('')
    setArea('all')
    setHideCompleted(false)
  }

  const renderColGroup = () => (
    <colgroup>
      <col className="w-[84px] md:w-[96px]" />
      <col className="w-[96px] md:w-[108px]" />
      <col className="w-[220px] md:w-[340px]" />
      <col className="hidden md:table-column md:w-[220px]" />
      <col className="hidden md:table-column md:w-[168px]" />
      <col className="w-[152px] md:w-[168px]" />
      <col className="hidden md:table-column md:w-[104px]" />
    </colgroup>
  )

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search store name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-[44px] bg-white pl-12 sm:pl-12"
            />
          </div>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="w-full sm:w-44 bg-white min-h-[44px]">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areaOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {getInternalAreaDisplayName(opt, { fallback: opt })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={hideCompleted ? "default" : "outline"}
            onClick={() => setHideCompleted(!hideCompleted)}
            className={cn(
              'min-h-[44px]',
              hideCompleted ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            )}
          >
            {hideCompleted ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Show Completed</span>
                <span className="sm:hidden">Show</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Hide Completed</span>
                <span className="sm:hidden">Hide</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="min-h-[44px] text-slate-500 hover:text-slate-700"
          >
            Reset
          </Button>
        </div>
      <div className="text-sm text-slate-500">
          Showing {rankedStores.length} of {rows.length} stores
        </div>
      </div>

      {tableMessage ? (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-sm',
            tableMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          )}
        >
          {tableMessage.text}
        </div>
      ) : null}

      <div className="space-y-3 xl:hidden">
        {rankedStores.length === 0 ? (
          <WorkspaceEmptyState
            icon={Store}
            title="No stores found"
            description="No audit records match the current search and filters."
          />
        ) : (
          rankedStores.map((row, index) => {
            const completedCount =
              (row.compliance_audit_1_date && row.compliance_audit_1_overall_pct !== null ? 1 : 0) +
              (row.compliance_audit_2_date && row.compliance_audit_2_overall_pct !== null ? 1 : 0)

            return (
              <button
                key={row.id}
                type="button"
                onClick={() => handleOpenStoreActionsModal(row)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-colors active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                        #{index + 1}
                      </span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                        {getDisplayStoreCode(row.store_code) || '—'}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-900">{row.store_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {getInternalAreaDisplayName(row.region, { fallback: 'Unassigned' })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {pctBadge(row.latestPct)}
                    <p className="mt-1 text-[11px] text-slate-500">{completedCount}/2 audits</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Latest audit</p>
                    <p className="mt-1 font-medium text-slate-700">{formatDate(row.latestDate)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Actions</p>
                    <p className="mt-1 font-medium text-slate-700">Tap to review</p>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Table Container */}
      <div className="hidden rounded-xl border bg-white shadow-sm overflow-hidden xl:flex xl:flex-col">
        {/* Fixed Header - OUTSIDE scroll container on desktop, INSIDE on mobile */}
        <div className="hidden xl:block border-b bg-white overflow-x-auto">
          <Table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
            {renderColGroup()}
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-center bg-white">Rank</TableHead>
                <TableHead className="bg-white">Store Code</TableHead>
                <TableHead className="bg-white">Store Name</TableHead>
                <TableHead className="bg-white hidden md:table-cell">Area</TableHead>
                <TableHead className="bg-white hidden md:table-cell whitespace-nowrap">Latest Audit Date</TableHead>
                <TableHead className="bg-white text-right whitespace-nowrap">Latest Compliance %</TableHead>
                <TableHead className="bg-white hidden md:table-cell text-center whitespace-nowrap">Total Audits</TableHead>
              </TableRow>
            </TableHeader>
          </Table>
        </div>

        {/* Scrollable Body - Headers inside on mobile, body only on desktop */}
        <div className="h-[70vh] overflow-y-auto overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 relative">
          {/* Mobile Header - Inside scroll container, sticky */}
          <div className="md:hidden sticky top-0 z-10 bg-white border-b">
            <Table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
              {renderColGroup()}
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-center bg-white">Rank</TableHead>
                  <TableHead className="bg-white">Store Code</TableHead>
                  <TableHead className="bg-white">Store Name</TableHead>
                  <TableHead className="bg-white hidden md:table-cell">Area</TableHead>
                  <TableHead className="bg-white hidden md:table-cell whitespace-nowrap">Latest Audit Date</TableHead>
                  <TableHead className="bg-white text-right whitespace-nowrap">Latest Compliance %</TableHead>
                  <TableHead className="bg-white hidden md:table-cell text-center whitespace-nowrap">Total Audits</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
          </div>
          <Table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
            {renderColGroup()}
            <TableBody>
              {rankedStores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="md:col-span-7 text-center text-muted-foreground py-10">
                    No stores found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                rankedStores.map((row, index) => {
                  const rank = index + 1
                  const isTopThree = rank <= 3
                  
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "group hover:bg-slate-50 transition-colors",
                        isTopThree && "bg-emerald-50/30"
                      )}
                    >
                      <TableCell className="text-center font-bold border-b bg-white group-hover:bg-slate-50">
                        <div className="flex items-center justify-center gap-2">
                          {rank <= 3 && (
                            <span className="text-lg">
                              {rank === 1 && '🥇'}
                              {rank === 2 && '🥈'}
                              {rank === 3 && '🥉'}
                            </span>
                          )}
                          <span className={cn(
                            "font-mono text-sm",
                            isTopThree ? "text-emerald-700" : "text-muted-foreground"
                          )}>
                            #{rank}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium border-b bg-white group-hover:bg-slate-50">
                        {getDisplayStoreCode(row.store_code) || '—'}
                      </TableCell>
                      <TableCell className="font-semibold text-sm border-b bg-white group-hover:bg-slate-50">
                        <button
                          type="button"
                          onClick={() => handleOpenStoreActionsModal(row)}
                          className="text-left text-sm font-semibold text-slate-900 underline-offset-2 hover:text-blue-700 hover:underline"
                          title="Open store actions"
                        >
                          {row.store_name}
                        </button>
                      </TableCell>
                      <TableCell className="hidden border-b bg-white text-xs leading-snug text-muted-foreground group-hover:bg-slate-50 md:table-cell">
                        {getInternalAreaDisplayName(row.region, { fallback: '—' })}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap border-b bg-white text-sm text-muted-foreground group-hover:bg-slate-50 md:table-cell">
                        {formatDate(row.latestDate)}
                      </TableCell>
                      <TableCell className="border-b bg-white text-right group-hover:bg-slate-50">
                        {pctBadge(row.latestPct)}
                      </TableCell>
                      <TableCell className="hidden border-b bg-white text-center font-mono text-xs text-muted-foreground group-hover:bg-slate-50 md:table-cell">
                        {(() => {
                          let count = 0
                          if (row.compliance_audit_1_date && row.compliance_audit_1_overall_pct !== null) count++
                          if (row.compliance_audit_2_date && row.compliance_audit_2_overall_pct !== null) count++
                          return count
                        })()}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <StoreActionsModal
        open={storeActionsModalOpen}
        onOpenChange={setStoreActionsModalOpen}
        row={storeActionsRow}
        userRole={userRole}
        onActionsCreated={handleStoreActionsCreated}
      />
    </div>
  )
}
