'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuditTable, AuditRow } from './audit-table'
import { AuditLeagueTable } from './audit-league-table'
import { AuditStatsCards } from './audit-stats-cards'
import { Trophy } from 'lucide-react'
import { UserRole } from '@/lib/auth'

interface AuditTrackerClientProps {
  stores: AuditRow[]
  userRole: UserRole
}

export function AuditTrackerClient({ stores, userRole }: AuditTrackerClientProps) {
  const [areaFilter, setAreaFilter] = useState<string>('all')

  return (
    <div className="flex flex-col gap-6">
      {/* Stats Overview Grid - now reactive to area filter */}
      <div className="grid gap-4 md:grid-cols-3">
        <AuditStatsCards stores={stores} selectedArea={areaFilter} />
      </div>

      {/* Main Content Area */}
      <div className="border border-slate-200 rounded-lg shadow-sm bg-white overflow-hidden">
        <div className="border-b bg-slate-50/50 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Detailed Audit Reports</h2>
        </div>
        <div className="p-4 md:p-6">
          <Tabs defaultValue="by-area" className="w-full">
            <div className="flex items-center justify-center md:justify-start mb-4 md:mb-6">
              <TabsList className="grid w-full max-w-[400px] grid-cols-2 bg-slate-100 p-1 min-h-[44px]">
                <TabsTrigger 
                  value="by-area"
                  className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all"
                >
                  By Area
                </TabsTrigger>
                <TabsTrigger 
                  value="league"
                  className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <Trophy className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">League Table</span>
                  <span className="sm:hidden">League</span>
                </TabsTrigger>
              </TabsList>
            </div>

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
          </Tabs>
        </div>
      </div>
    </div>
  )
}
