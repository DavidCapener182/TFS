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

export interface CalendarIncident {
  id: string
  referenceNo: string
  storeId: string
  storeName: string
  storeCode: string | null
  severity: string
  status: string
  reportedAt: string
  summary: string
}

export interface CalendarAction {
  id: string
  title: string
  status: string
  priority: string
  actionedAt: string
  incidentId: string | null
  incidentReferenceNo: string | null
  storeId: string | null
  storeName: string | null
  storeCode: string | null
}

export interface CalendarVisit {
  id: string
  storeId: string
  storeName: string
  storeCode: string | null
  visitedAt: string
  visitType: string
  followUpRequired: boolean
  notes: string | null
}

export interface CalendarDay {
  date: string // ISO date string (YYYY-MM-DD)
  plannedRoutes: PlannedRoute[]
  completedStores: CompletedStore[]
  incidents: CalendarIncident[]
  actions: CalendarAction[]
  visits: CalendarVisit[]
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
  const startTs = monthStart.toISOString()
  const endTs = monthEnd.toISOString()

  // Fetch planned routes for the month
  const [
    plannedRoutesResult,
    completedStoresResult,
    incidentsResult,
    closedIncidentsResult,
    actionsResult,
    visitsResult,
  ] = await Promise.all([
    supabase
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
      .eq('is_active', true),
    // Completed stores (with audit/FRA data) for the month.
    // We fetch all stores and filter in memory since Supabase OR queries are complex.
    supabase
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
      .eq('is_active', true),
    supabase
      .from('tfs_incidents')
      .select(`
        id,
        reference_no,
        store_id,
        severity,
        status,
        reported_at,
        summary,
        tfs_stores:store_id(store_name, store_code)
      `)
      .gte('reported_at', startTs)
      .lte('reported_at', endTs),
    supabase
      .from('tfs_closed_incidents')
      .select(`
        id,
        reference_no,
        store_id,
        severity,
        status,
        reported_at,
        summary,
        tfs_stores:store_id(store_name, store_code)
      `)
      .gte('reported_at', startTs)
      .lte('reported_at', endTs),
    supabase
      .from('tfs_actions')
      .select(`
        id,
        title,
        status,
        priority,
        created_at,
        incident_id,
        incident:tfs_incidents!tfs_actions_incident_id_fkey(
          id,
          reference_no,
          store_id,
          tfs_stores:store_id(store_name, store_code)
        )
      `)
      .not('title', 'ilike', 'Implement visit report actions:%')
      .gte('created_at', startTs)
      .lte('created_at', endTs),
    supabase
      .from('tfs_store_visits')
      .select(`
        id,
        store_id,
        visited_at,
        visit_type,
        follow_up_required,
        notes,
        tfs_stores:store_id(store_name, store_code)
      `)
      .eq('status', 'completed')
      .gte('visited_at', startTs)
      .lte('visited_at', endTs),
  ])

  const plannedRoutesRaw = plannedRoutesResult.data
  const completedStoresRaw = completedStoresResult.data
  const incidentsRaw = incidentsResult.data
  const closedIncidentsRaw = closedIncidentsResult.data
  const actionsRaw = actionsResult.data
  const visitsRaw = visitsResult.data

  if (plannedRoutesResult.error) console.error('Error fetching planned routes:', plannedRoutesResult.error)
  if (completedStoresResult.error) console.error('Error fetching completed stores:', completedStoresResult.error)
  if (incidentsResult.error) console.error('Error fetching incidents:', incidentsResult.error)
  if (closedIncidentsResult.error) console.error('Error fetching closed incidents:', closedIncidentsResult.error)
  if (actionsResult.error) console.error('Error fetching actions:', actionsResult.error)
  if (visitsResult.error) console.error('Error fetching store visits:', visitsResult.error)

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

  const incidentsByDate = new Map<string, CalendarIncident[]>()
  const mergedIncidents = [...(incidentsRaw || []), ...(closedIncidentsRaw || [])]
  mergedIncidents.forEach((row: any) => {
    const date = row?.reported_at ? format(new Date(row.reported_at), 'yyyy-MM-dd') : null
    if (!date) return
    const storeRel = Array.isArray(row.tfs_stores) ? row.tfs_stores[0] : row.tfs_stores
    const incident: CalendarIncident = {
      id: row.id,
      referenceNo: row.reference_no,
      storeId: row.store_id,
      storeName: formatStoreName(storeRel?.store_name) || 'Unknown Store',
      storeCode: storeRel?.store_code || null,
      severity: row.severity || 'low',
      status: row.status || 'open',
      reportedAt: row.reported_at,
      summary: row.summary || '',
    }
    if (!incidentsByDate.has(date)) incidentsByDate.set(date, [])
    incidentsByDate.get(date)!.push(incident)
  })

  const actionsByDate = new Map<string, CalendarAction[]>()
  ;(actionsRaw || []).forEach((row: any) => {
    const date = row?.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd') : null
    if (!date) return
    const incidentRel = Array.isArray(row.incident) ? row.incident[0] : row.incident
    const storeRel = Array.isArray(incidentRel?.tfs_stores) ? incidentRel.tfs_stores[0] : incidentRel?.tfs_stores
    const action: CalendarAction = {
      id: row.id,
      title: row.title || 'Untitled action',
      status: row.status || 'open',
      priority: row.priority || 'medium',
      actionedAt: row.created_at,
      incidentId: row.incident_id || null,
      incidentReferenceNo: incidentRel?.reference_no || null,
      storeId: incidentRel?.store_id || null,
      storeName: storeRel?.store_name ? formatStoreName(storeRel.store_name) : null,
      storeCode: storeRel?.store_code || null,
    }
    if (!actionsByDate.has(date)) actionsByDate.set(date, [])
    actionsByDate.get(date)!.push(action)
  })

  const visitsByDate = new Map<string, CalendarVisit[]>()
  ;(visitsRaw || []).forEach((row: any) => {
    const date = row?.visited_at ? format(new Date(row.visited_at), 'yyyy-MM-dd') : null
    if (!date) return
    const storeRel = Array.isArray(row.tfs_stores) ? row.tfs_stores[0] : row.tfs_stores
    const visit: CalendarVisit = {
      id: row.id,
      storeId: row.store_id,
      storeName: formatStoreName(storeRel?.store_name) || 'Unknown Store',
      storeCode: storeRel?.store_code || null,
      visitedAt: row.visited_at,
      visitType: row.visit_type || 'planned',
      followUpRequired: Boolean(row.follow_up_required),
      notes: row.notes || null,
    }
    if (!visitsByDate.has(date)) visitsByDate.set(date, [])
    visitsByDate.get(date)!.push(visit)
  })

  // Create calendar days for the entire month
  const days: CalendarDay[] = []
  const currentDate = new Date(monthStart)
  
  while (currentDate <= monthEnd) {
    const dateStr = format(currentDate, 'yyyy-MM-dd')
    days.push({
      date: dateStr,
      plannedRoutes: plannedRoutesByDate.get(dateStr) || [],
      completedStores: completedStoresByDate.get(dateStr) || [],
      incidents: incidentsByDate.get(dateStr) || [],
      actions: actionsByDate.get(dateStr) || [],
      visits: visitsByDate.get(dateStr) || [],
    })
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return {
    days,
    month,
    year
  }
}
