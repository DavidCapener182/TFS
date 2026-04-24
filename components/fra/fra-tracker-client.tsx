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
      <div className="relative overflow-hidden rounded-xl tfs-page-hero p-3 text-white sm:p-4 md:rounded-3xl md:p-8">
        <div className="tfs-page-hero-orb-top" />
        <div className="tfs-page-hero-orb-bottom" />

        <div className="tfs-page-hero-body space-y-3 md:space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#c9c2eb] md:text-xs">
                <Flame size={14} />
                Fire Compliance Monitoring
              </div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl md:text-3xl">Fire Risk Assessment</h1>
              <p className="mt-1 max-w-2xl text-xs leading-snug text-white/75 sm:text-sm">
                Track Fire Risk Assessments for stores that have completed audits. FRAs must be renewed every 12 months.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100 sm:min-h-[44px] sm:w-auto md:rounded-lg md:px-4 md:py-2"
            >
              <Download size={16} />
              Export Data
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
            <FRAStatsCards stores={stores} selectedArea={areaFilter} />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'required' | 'completed')} className="w-full">
          <div className="border-b border-slate-100 p-4 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-slate-800 md:text-xl">Fire Risk Assessment Tracker</h2>
                <p className="text-sm text-slate-500">Move between outstanding FRA work and completed assessments without leaving mobile view.</p>
              </div>
              <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 lg:w-auto lg:min-w-[320px] lg:rounded-xl">
                <TabsTrigger
                  value="required"
                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-500 transition-all data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm"
                >
                  <Flame className="h-4 w-4" />
                  Required
                </TabsTrigger>
                <TabsTrigger
                  value="completed"
                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-500 transition-all data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm"
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
