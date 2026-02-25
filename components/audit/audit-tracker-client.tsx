'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuditTable, AuditRow } from './audit-table'
import { AuditLeagueTable } from './audit-league-table'
import { AuditStatsCards } from './audit-stats-cards'
import { ClipboardCheck, Download, Map, Trophy } from 'lucide-react'
import { UserRole } from '@/lib/auth'

interface AuditTrackerClientProps {
  stores: AuditRow[]
  userRole: UserRole
}

export function AuditTrackerClient({ stores, userRole }: AuditTrackerClientProps) {
  const [activeView, setActiveView] = useState<'by-area' | 'league'>('by-area')
  const [areaFilter, setAreaFilter] = useState<string>('all')

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-[#0f172a] p-6 text-white shadow-xl shadow-slate-200/50 md:p-8">
        <div className="absolute right-0 top-0 h-96 w-96 translate-x-1/3 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                <ClipboardCheck size={14} />
                Compliance Monitoring
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Audit Tracker</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Track compliance scores, view audit history, and monitor network performance across all regions.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100"
            >
              <Download size={16} />
              Export Data
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <AuditStatsCards stores={stores} selectedArea={areaFilter} />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'by-area' | 'league')} className="w-full">
          <div className="border-b border-slate-100 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-xl font-bold text-slate-800">Detailed Audit Reports</h2>
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 lg:w-auto lg:min-w-[320px]">
                <TabsTrigger
                  value="by-area"
                  className="flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-slate-500 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm"
                >
                  <Map className="h-4 w-4" />
                  By Area
                </TabsTrigger>
                <TabsTrigger
                  value="league"
                  className="flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-slate-500 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm"
                >
                  <Trophy className="h-4 w-4" />
                  League Table
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="p-4 md:p-6">
            <TabsContent value="by-area" className="mt-0">
              <AuditTable rows={stores} userRole={userRole} areaFilter={areaFilter} onAreaFilterChange={setAreaFilter} />
            </TabsContent>

            <TabsContent value="league" className="mt-0">
              <AuditLeagueTable
                rows={stores}
                userRole={userRole}
                areaFilter={areaFilter}
                onAreaFilterChange={setAreaFilter}
              />
            </TabsContent>
          </div>
        </Tabs>
        </div>
    </div>
  )
}
