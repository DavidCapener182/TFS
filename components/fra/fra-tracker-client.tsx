'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FRATable, FRARow } from './fra-table'
import { FRACompletedTable } from './fra-completed-table'
import { FRAStatsCards } from './fra-stats-cards'
import { UserRole } from '@/lib/auth'
import { CheckCircle2, Download, Flame } from 'lucide-react'

interface FRATrackerClientProps {
  stores: FRARow[]
  userRole: UserRole
}

export function FRATrackerClient({ stores, userRole }: FRATrackerClientProps) {
  const [activeView, setActiveView] = useState<'required' | 'completed'>('required')
  const [areaFilter, setAreaFilter] = useState<string>('all')

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-[#0f172a] p-4 text-white shadow-xl shadow-slate-200/50 sm:p-5 md:rounded-3xl md:p-8">
        <div className="absolute right-0 top-0 h-96 w-96 translate-x-1/3 -translate-y-1/2 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/3 translate-y-1/3 rounded-full bg-rose-500/10 blur-3xl" />

        <div className="relative z-10 space-y-4 md:space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-400">
                <Flame size={14} />
                Fire Compliance Monitoring
              </div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Fire Risk Assessment</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Track Fire Risk Assessments for stores that have completed audits. FRAs must be renewed every 12 months.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100 md:px-4 md:py-2"
            >
              <Download size={16} />
              Export Data
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            <FRAStatsCards stores={stores} selectedArea={areaFilter} />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'required' | 'completed')} className="w-full">
          <div className="border-b border-slate-100 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-xl font-bold text-slate-800">Fire Risk Assessment Tracker</h2>
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 lg:w-auto lg:min-w-[320px]">
                <TabsTrigger
                  value="required"
                  className="flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-slate-500 transition-all data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm"
                >
                  <Flame className="h-4 w-4" />
                  Required
                </TabsTrigger>
                <TabsTrigger
                  value="completed"
                  className="flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-slate-500 transition-all data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Completed
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="p-4 md:p-6">
            <TabsContent value="required" className="mt-0">
              <FRATable rows={stores} userRole={userRole} areaFilter={areaFilter} onAreaFilterChange={setAreaFilter} />
            </TabsContent>

            <TabsContent value="completed" className="mt-0">
              <FRACompletedTable rows={stores} areaFilter={areaFilter} onAreaFilterChange={setAreaFilter} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
