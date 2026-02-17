'use client'

import { useMemo, useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn, getDisplayStoreCode } from '@/lib/utils'
import { AuditRow, pctBadge, formatDate, getLatestPct } from './audit-table-helpers'
import { StoreActionsModal } from './store-actions-modal'
import { Eye, EyeOff } from 'lucide-react'
import { UserRole } from '@/lib/auth'

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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Input
            placeholder="Search store name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 md:w-64 bg-white min-h-[44px]"
          />
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="w-full sm:w-40 bg-white min-h-[44px]">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areaOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={hideCompleted ? "default" : "outline"}
            onClick={() => setHideCompleted(!hideCompleted)}
            className="min-h-[44px]"
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
        </div>
      <div className="text-sm text-muted-foreground">
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

      {/* Table Container */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col">
        {/* Fixed Header - OUTSIDE scroll container on desktop, INSIDE on mobile */}
        <div className="hidden md:block border-b bg-white overflow-x-auto">
          <Table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col className="w-16 md:w-20" />
              <col className="w-20 md:w-24" />
              <col />
              <col className="w-24 md:table-column hidden" />
              <col className="hidden md:table-column" />
              <col className="w-32 md:w-32" />
              <col className="w-24 md:table-column hidden" />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-center bg-white">Rank</TableHead>
                <TableHead className="bg-white">Store Code</TableHead>
                <TableHead className="bg-white">Store Name</TableHead>
                <TableHead className="bg-white hidden md:table-cell">Area</TableHead>
                <TableHead className="bg-white hidden md:table-cell">Latest Audit Date</TableHead>
                <TableHead className="bg-white text-right md:text-left">Latest Compliance %</TableHead>
                <TableHead className="bg-white hidden md:table-cell">Total Audits</TableHead>
              </TableRow>
            </TableHeader>
          </Table>
        </div>

        {/* Scrollable Body - Headers inside on mobile, body only on desktop */}
        <div className="h-[70vh] overflow-y-auto overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 relative">
          {/* Mobile Header - Inside scroll container, sticky */}
          <div className="md:hidden sticky top-0 z-10 bg-white border-b">
            <Table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col className="w-16 md:w-20" />
                <col className="w-20 md:w-24" />
                <col />
                <col className="w-24 md:table-column hidden" />
                <col className="hidden md:table-column" />
                <col className="w-32 md:w-32" />
                <col className="w-24 md:table-column hidden" />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-center bg-white">Rank</TableHead>
                  <TableHead className="bg-white">Store Code</TableHead>
                  <TableHead className="bg-white">Store Name</TableHead>
                  <TableHead className="bg-white hidden md:table-cell">Area</TableHead>
                  <TableHead className="bg-white hidden md:table-cell">Latest Audit Date</TableHead>
                  <TableHead className="bg-white text-right md:text-left">Latest Compliance %</TableHead>
                  <TableHead className="bg-white hidden md:table-cell">Total Audits</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
          </div>
          <Table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col className="w-16 md:w-20" />
              <col className="w-20 md:w-24" />
              <col />
              <col className="w-24 md:table-column hidden" />
              <col className="hidden md:table-column" />
              <col className="w-32 md:w-32" />
              <col className="w-24 md:table-column hidden" />
            </colgroup>
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
                      <TableCell className="text-xs text-muted-foreground border-b bg-white group-hover:bg-slate-50 hidden md:table-cell">
                        {row.region || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground border-b bg-white group-hover:bg-slate-50 hidden md:table-cell">
                        {formatDate(row.latestDate)}
                      </TableCell>
                      <TableCell className="border-b bg-white group-hover:bg-slate-50 text-right md:text-left">
                        {pctBadge(row.latestPct)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs text-muted-foreground border-b bg-white group-hover:bg-slate-50 hidden md:table-cell">
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
