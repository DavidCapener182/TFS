'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
      <Card className="shadow-sm border-slate-200 bg-white">
        <CardContent className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">
              Stores Requiring FRA
            </p>
            <p className="text-3xl font-bold text-slate-900">{stats.storesRequiringFRA}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center">
            <Flame className="h-6 w-6 text-orange-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="shadow-sm border-slate-200 bg-white">
        <CardContent className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">
              FRAs Completed
            </p>
            <p className="text-3xl font-bold text-slate-900">{stats.frasCompleted}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
            <Store className="h-6 w-6 text-emerald-600" />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-slate-200 bg-white">
        <CardContent className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">
              Due / Overdue
            </p>
            <p className="text-3xl font-bold text-slate-900">{stats.frasDueOrOverdue}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-rose-600" />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
