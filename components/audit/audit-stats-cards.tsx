'use client'

import { useMemo } from 'react'
import { ClipboardCheck, Store, TrendingUp } from 'lucide-react'
import { formatPercent } from '@/lib/utils'
import { AuditRow, getLatestPct } from './audit-table-helpers'

// Area name mapping
const areaNames: Record<string, string> = {
  'A1': 'Scotland & North East',
  'A2': 'Yorkshire & Midlands',
  'A3': 'Manchester',
  'A4': 'Lancashire & Merseyside',
  'A5': 'Birmingham',
  'A6': 'Wales',
  'A7': 'South',
  'A8': 'London',
}

function getAreaDisplayName(areaCode: string | null): string {
  if (!areaCode) return 'All Stores'
  const name = areaNames[areaCode]
  return name ? `${areaCode} - ${name}` : areaCode
}

interface AuditStatsCardsProps {
  stores: AuditRow[]
  selectedArea: string
}

export function AuditStatsCards({ stores, selectedArea }: AuditStatsCardsProps) {
  // Filter stores by selected area
  const filteredStores = useMemo(() => {
    if (selectedArea === 'all') return stores
    return stores.filter(store => store.region === selectedArea)
  }, [stores, selectedArea])

  // Calculate stats for filtered stores
  const stats = useMemo(() => {
    if (!filteredStores || !filteredStores.length) return { avgScore: 0, activeStores: 0, auditsCompleted: 0 }
    
    const activeStores = filteredStores.filter(s => s.is_active).length
    
    // Calculate average of latest audit scores for active stores
    const scores = filteredStores
      .filter(s => s.is_active)
      .map(s => getLatestPct(s))
      .filter((score): score is number => score !== null)
      
    const avgScore = scores.length 
      ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length 
      : 0

    // Only count COMPLETED audits (both date AND percentage)
    const auditsCompleted = filteredStores.reduce((acc, store) => {
      let count = 0
      if (store.compliance_audit_1_date && store.compliance_audit_1_overall_pct !== null) count++
      if (store.compliance_audit_2_date && store.compliance_audit_2_overall_pct !== null) count++
      return acc + count
    }, 0)

    return { avgScore, activeStores, auditsCompleted }
  }, [filteredStores])

  // Get label based on selected area
  const areaLabel = selectedArea === 'all' 
    ? 'All Stores' 
    : getAreaDisplayName(selectedArea)

  return (
    <>
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm md:rounded-2xl md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {areaLabel} Average
            </p>
            <p className="mt-1 text-3xl font-black text-white md:text-4xl">{formatPercent(stats.avgScore)}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 md:h-12 md:w-12">
            <TrendingUp className="h-5 w-5 md:h-6 md:w-6" />
          </div>
        </div>
      </div>
      
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm md:rounded-2xl md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Active Stores
            </p>
            <p className="mt-1 text-3xl font-black text-white md:text-4xl">{stats.activeStores}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 md:h-12 md:w-12">
            <Store className="h-5 w-5 md:h-6 md:w-6" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm md:rounded-2xl md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Audits Completed
            </p>
            <p className="mt-1 text-3xl font-black text-white md:text-4xl">{stats.auditsCompleted}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 md:h-12 md:w-12">
            <ClipboardCheck className="h-5 w-5 md:h-6 md:w-6" />
          </div>
        </div>
      </div>
    </>
  )
}
