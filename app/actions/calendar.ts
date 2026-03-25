'use server'

import { createClient } from '@/lib/supabase/server'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { formatStoreName } from '@/lib/store-display'

export interface PlannedRoute {
  key: string
  managerId: string | null
  managerName: string
  area: string | null
  plannedDate: string
  storeCount: number
  stores: Array<{ id: string; name: string; store_code: string | null }>
}

export interface CompletedStore {
  id: string
  storeName: string
  storeCode: string | null
  audit1Date: string | null
  audit1Pct: number | null
  audit2Date: string | null
  audit2Pct: number | null
  fraDate: string | null
  fraPct: number | null
  managerName: string | null
}

export interface CalendarDay {
  date: string // ISO date string (YYYY-MM-DD)
  plannedRoutes: PlannedRoute[]
  completedStores: CompletedStore[]
}

export interface CalendarData {
  days: CalendarDay[]
  month: number
  year: number
}

export async function getCalendarData(month: number, year: number): Promise<CalendarData> {
  const supabase = createClient()
  
  // Create date range for the month
  const monthStart = startOfMonth(new Date(year, month - 1, 1))
  const monthEnd = endOfMonth(new Date(year, month - 1, 1))
  const startDateStr = format(monthStart, 'yyyy-MM-dd')
  const endDateStr = format(monthEnd, 'yyyy-MM-dd')

  // Fetch planned routes for the month
  const { data: plannedRoutesRaw, error: plannedError } = await supabase
    .from('tfs_stores')
    .select(`
      id,
      store_name,
      store_code,
      region,
      compliance_audit_2_planned_date,
      compliance_audit_2_assigned_manager_user_id,
      assigned_manager:fa_profiles!tfs_stores_compliance_audit_2_assigned_manager_user_id_fkey(
        id,
        full_name
      )
    `)
    .not('compliance_audit_2_planned_date', 'is', null)
    .gte('compliance_audit_2_planned_date', startDateStr)
    .lte('compliance_audit_2_planned_date', endDateStr)
    .eq('is_active', true)

  if (plannedError) {
    console.error('Error fetching planned routes:', plannedError)
  }

  // Fetch completed stores (with audit/FRA data) for the month
  // We need to fetch all stores and filter in memory since Supabase OR queries are complex
  const { data: completedStoresRaw, error: completedError } = await supabase
    .from('tfs_stores')
    .select(`
      id,
      store_name,
      store_code,
      compliance_audit_1_date,
      compliance_audit_1_overall_pct,
      compliance_audit_2_date,
      compliance_audit_2_overall_pct,
      fire_risk_assessment_date,
      fire_risk_assessment_pct,
      compliance_audit_2_assigned_manager_user_id,
      assigned_manager:fa_profiles!tfs_stores_compliance_audit_2_assigned_manager_user_id_fkey(
        id,
        full_name
      )
    `)
    .eq('is_active', true)

  if (completedError) {
    console.error('Error fetching completed stores:', completedError)
  }

  // Process planned routes - group by manager, area, and date
  const plannedRoutesByDate = new Map<string, PlannedRoute[]>()
  
  if (plannedRoutesRaw) {
    const routesMap = new Map<string, PlannedRoute>()
    
    plannedRoutesRaw.forEach((store: any) => {
      const managerId = store.compliance_audit_2_assigned_manager_user_id
      const region = store.region
      const plannedDate = store.compliance_audit_2_planned_date
      const manager = Array.isArray(store.assigned_manager)
        ? (store.assigned_manager[0] || null)
        : store.assigned_manager || null
      
      const key = `${managerId || 'unassigned'}-${region || 'unknown'}-${plannedDate}`
      
      if (!routesMap.has(key)) {
        routesMap.set(key, {
          key,
          managerId,
          managerName: manager?.full_name || 'Unassigned',
          area: region || 'Unknown',
          plannedDate: plannedDate || '',
          storeCount: 0,
          stores: []
        })
      }
      
      const route = routesMap.get(key)!
      route.storeCount++
      route.stores.push({
        id: store.id,
        name: formatStoreName(store.store_name),
        store_code: store.store_code
      })
    })

    // Group routes by date
    routesMap.forEach((route) => {
      const date = route.plannedDate
      if (date) {
        if (!plannedRoutesByDate.has(date)) {
          plannedRoutesByDate.set(date, [])
        }
        plannedRoutesByDate.get(date)!.push(route)
      }
    })
  }

  // Process completed stores - group by date
  const completedStoresByDate = new Map<string, CompletedStore[]>()
  
  if (completedStoresRaw) {
    completedStoresRaw.forEach((store: any) => {
      const manager = Array.isArray(store.assigned_manager)
        ? (store.assigned_manager[0] || null)
        : store.assigned_manager || null

      const storeData: CompletedStore = {
        id: store.id,
        storeName: formatStoreName(store.store_name),
        storeCode: store.store_code,
        audit1Date: store.compliance_audit_1_date || null,
        audit1Pct: store.compliance_audit_1_overall_pct || null,
        audit2Date: store.compliance_audit_2_date || null,
        audit2Pct: store.compliance_audit_2_overall_pct || null,
        fraDate: store.fire_risk_assessment_date || null,
        fraPct: store.fire_risk_assessment_pct || null,
        managerName: manager?.full_name || null
      }

      // Filter: only include stores that have at least one completion date in the month
      const hasRelevantDate = 
        (storeData.audit1Date && storeData.audit1Date >= startDateStr && storeData.audit1Date <= endDateStr) ||
        (storeData.audit2Date && storeData.audit2Date >= startDateStr && storeData.audit2Date <= endDateStr) ||
        (storeData.fraDate && storeData.fraDate >= startDateStr && storeData.fraDate <= endDateStr)

      if (!hasRelevantDate) {
        return // Skip stores with no relevant dates in this month
      }

      // Add to calendar for each relevant date (audit 1, audit 2, or FRA date)
      const dates: string[] = []
      if (storeData.audit1Date && storeData.audit1Date >= startDateStr && storeData.audit1Date <= endDateStr) {
        dates.push(storeData.audit1Date)
      }
      if (storeData.audit2Date && storeData.audit2Date >= startDateStr && storeData.audit2Date <= endDateStr) {
        dates.push(storeData.audit2Date)
      }
      if (storeData.fraDate && storeData.fraDate >= startDateStr && storeData.fraDate <= endDateStr) {
        dates.push(storeData.fraDate)
      }

      dates.forEach(date => {
        if (!completedStoresByDate.has(date)) {
          completedStoresByDate.set(date, [])
        }
        const list = completedStoresByDate.get(date)!
        // Deduplicate by store id for that date
        const already = list.find((s) => s.id === storeData.id)
        if (!already) {
          list.push(storeData)
        }
      })
    })
  }

  // Create calendar days for the entire month
  const days: CalendarDay[] = []
  const currentDate = new Date(monthStart)
  
  while (currentDate <= monthEnd) {
    const dateStr = format(currentDate, 'yyyy-MM-dd')
    days.push({
      date: dateStr,
      plannedRoutes: plannedRoutesByDate.get(dateStr) || [],
      completedStores: completedStoresByDate.get(dateStr) || []
    })
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return {
    days,
    month,
    year
  }
}
