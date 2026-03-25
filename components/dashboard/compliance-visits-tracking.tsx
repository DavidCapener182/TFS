'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertCircle, CalendarDays, CheckCircle2, CircleDashed, UserRound } from 'lucide-react'
import { formatStoreName } from '@/lib/store-display'
import { getDisplayStoreCode } from '@/lib/utils'

interface Store {
  id: string
  store_name: string
  store_code: string | null
  compliance_audit_1_date: string | null
  compliance_audit_2_date: string | null
  compliance_audit_2_assigned_manager_user_id: string | null
  compliance_audit_2_planned_date: string | null
  assigned_manager?: {
    id: string
    full_name: string | null
  } | null
}

interface ComplianceVisitsTrackingProps {
  stores: Store[]
}

function calculateDaysUntilEndOfYear(): number {
  const now = new Date()
  const endOfYear = new Date(now.getFullYear(), 11, 31) // December 31
  const diffTime = endOfYear.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

function formatPlannedDate(date: string | null): string {
  if (!date) return 'Not planned'
  const parsed = new Date(date)
  if (isNaN(parsed.getTime())) return 'Not planned'
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ComplianceVisitsTracking({ stores }: ComplianceVisitsTrackingProps) {
  const daysRemaining = calculateDaysUntilEndOfYear()
  const plannedCount = stores.filter((store) => !!store.compliance_audit_2_planned_date).length
  const unplannedCount = stores.length - plannedCount
  const assignedCount = stores.filter((store) => !!store.assigned_manager?.full_name).length

  if (stores.length === 0) {
    return (
      <Card className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-sm">
        <CardHeader className="pb-3 border-b border-amber-200/60">
          <CardTitle className="text-amber-900 flex items-center gap-2 text-base">
            <AlertCircle className="h-5 w-5" />
            Compliance Visits Due
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-sm font-medium text-emerald-800">All stores have completed their compliance visits for this year.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-amber-50 to-orange-50 shadow-sm h-full flex flex-col overflow-hidden">
      <CardHeader className="flex-shrink-0 pb-3 border-b border-amber-200/60 bg-white/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-amber-900 flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5" />
              Compliance Visits Due
            </CardTitle>
            <p className="mt-1 text-xs text-amber-800/80">{stores.length} stores still need a second visit this year.</p>
          </div>
          <div className="inline-flex w-fit items-center rounded-full border border-amber-300/70 bg-amber-100/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            {daysRemaining} days left
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 mb-3">
          <div className="rounded-xl border border-amber-200 bg-white/80 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Due Stores</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{stores.length}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">Not Planned</p>
            <p className="mt-1 text-lg font-bold text-rose-800">{unplannedCount}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-2.5 col-span-2 sm:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Assigned</p>
            <p className="mt-1 text-lg font-bold text-blue-900">{assignedCount}</p>
          </div>
        </div>

        <div className="md:hidden space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
          {stores.map((store) => {
            const hasPlan = !!store.compliance_audit_2_planned_date
            return (
              <div key={store.id} className="rounded-xl border border-amber-200/80 bg-white/90 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{formatStoreName(store.store_name)}</p>
                    {getDisplayStoreCode(store.store_code) && <p className="text-xs text-slate-500">#{getDisplayStoreCode(store.store_code)}</p>}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${hasPlan ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-rose-200 bg-rose-50 text-rose-700'}`}>
                    {hasPlan ? 'Planned' : 'Not Planned'}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5 text-slate-400" />
                    {store.assigned_manager?.full_name || 'Unassigned manager'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                    {formatPlannedDate(store.compliance_audit_2_planned_date)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="hidden md:block rounded-xl border border-amber-200/80 bg-white/95 max-w-full">
          <div className="max-h-[330px] overflow-auto overscroll-x-contain touch-pan-x touch-pan-y">
            <Table className="min-w-[700px]">
              <TableHeader className="sticky top-0 bg-white z-10 border-b border-slate-200">
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Store</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Manager</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Planned Date</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Year Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((store) => {
                  const hasPlan = !!store.compliance_audit_2_planned_date
                  return (
                    <TableRow key={store.id} className="hover:bg-slate-50/70">
                      <TableCell className="font-medium text-slate-900">
                        {formatStoreName(store.store_name)}
                        {getDisplayStoreCode(store.store_code) && <span className="text-slate-500 text-xs ml-2">#{getDisplayStoreCode(store.store_code)}</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${hasPlan ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-rose-200 bg-rose-50 text-rose-700'}`}>
                          {hasPlan ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                          {hasPlan ? 'Planned' : 'Not planned'}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-700">{store.assigned_manager?.full_name || 'Unassigned'}</TableCell>
                      <TableCell className="text-slate-700">{formatPlannedDate(store.compliance_audit_2_planned_date)}</TableCell>
                      <TableCell>
                        <span className={`font-semibold ${daysRemaining < 30 ? 'text-rose-700' : daysRemaining < 60 ? 'text-amber-700' : 'text-slate-700'}`}>
                          {daysRemaining} days
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
