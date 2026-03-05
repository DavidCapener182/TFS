'use client'

import { useMemo } from 'react'
import { Flame, Store, AlertCircle } from 'lucide-react'
import { FRARow, storeNeedsFRA, getFRAStatus } from './fra-table-helpers'

interface FRAStatsCardsProps {
  stores: FRARow[]
  selectedArea: string
}

export function FRAStatsCards({ stores, selectedArea }: FRAStatsCardsProps) {
  // Filter stores by selected area
  const filteredStores = useMemo(() => {
    if (selectedArea === 'all') return stores
    return stores.filter(store => store.region === selectedArea)
  }, [stores, selectedArea])

  // Calculate stats for filtered stores
  const stats = useMemo(() => {
    if (!filteredStores || !filteredStores.length) {
      return { 
        storesRequiringFRA: 0, 
        frasCompleted: 0, 
        frasDueOrOverdue: 0 
      }
    }
    
    const activeStores = filteredStores.filter(s => s.is_active)
    
    // Count stores requiring FRA (need FRA and status is NOT "up_to_date")
    const storesRequiringFRA = activeStores.filter(store => {
      const needsFRA = storeNeedsFRA(store)
      if (!needsFRA) return false
      const status = getFRAStatus(store.fire_risk_assessment_date, needsFRA)
      return status !== 'up_to_date' // Exclude "up_to_date" stores
    }).length
    
    // Count only in-date completed FRAs (not due/overdue)
    const frasCompleted = activeStores.filter(store => {
      const needsFRA = storeNeedsFRA(store)
      if (!needsFRA) return false
      const status = getFRAStatus(store.fire_risk_assessment_date, needsFRA)
      return status === 'up_to_date'
    }).length
    
    // Count FRAs that are due or overdue
    const frasDueOrOverdue = activeStores.filter(store => {
      if (!storeNeedsFRA(store)) return false
      const status = getFRAStatus(store.fire_risk_assessment_date, true)
      return status === 'due' || status === 'overdue'
    }).length

    return { storesRequiringFRA, frasCompleted, frasDueOrOverdue }
  }, [filteredStores])

  return (
    <>
      <div className="col-span-2 rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 backdrop-blur-sm md:col-span-1 md:rounded-2xl md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:text-xs md:tracking-wider">
              Stores Requiring FRA
            </p>
            <p className="mt-0.5 text-2xl font-black text-white md:mt-1 md:text-4xl">{stats.storesRequiringFRA}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 md:h-12 md:w-12">
            <Flame className="h-4 w-4 md:h-6 md:w-6" />
          </div>
        </div>
      </div>
      
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 backdrop-blur-sm md:rounded-2xl md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:text-xs md:tracking-wider">
              FRAs Completed
            </p>
            <p className="mt-0.5 text-2xl font-black text-white md:mt-1 md:text-4xl">{stats.frasCompleted}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 md:h-12 md:w-12">
            <Store className="h-4 w-4 md:h-6 md:w-6" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 backdrop-blur-sm md:rounded-2xl md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:text-xs md:tracking-wider">
              Due / Overdue
            </p>
            <p className="mt-0.5 text-2xl font-black text-white md:mt-1 md:text-4xl">{stats.frasDueOrOverdue}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 md:h-12 md:w-12">
            <AlertCircle className="h-4 w-4 md:h-6 md:w-6" />
          </div>
        </div>
      </div>
    </>
  )
}
