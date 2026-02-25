import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { RoutePlanningClient } from '@/components/route-planning/route-planning-client'

// Closed stores that should not appear in Route Planning.
const ROUTE_PLANNING_EXCLUDED_STORE_CODES = new Set(['EXT-HUDDERSFIELD', 'EXT-GLASGOW'])

async function getRoutePlanningData() {
  const supabase = createClient()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  // Get all active stores with their locations and audit status
  // Try to fetch route_sequence, but handle gracefully if column doesn't exist
  let stores: any[] = []
  let storesError: any = null
  
  try {
    const result = await supabase
      .from('fa_stores')
      .select(`
        id,
        store_code,
        store_name,
        address_line_1,
        city,
        postcode,
        region,
        latitude,
        longitude,
        compliance_audit_1_date,
        compliance_audit_1_overall_pct,
        compliance_audit_2_date,
        compliance_audit_2_planned_date,
        compliance_audit_2_assigned_manager_user_id,
        route_sequence,
        assigned_manager:fa_profiles!fa_stores_compliance_audit_2_assigned_manager_user_id_fkey(
          id,
          full_name,
          home_address,
          home_latitude,
          home_longitude
        )
      `)
      .eq('is_active', true)
      .order('store_name', { ascending: true })
    
    stores = result.data || []
    storesError = result.error
  } catch (err: any) {
    // If route_sequence column doesn't exist, fetch without it
    if (err.message?.includes('route_sequence') || err.message?.includes('column')) {
      const result = await supabase
        .from('fa_stores')
        .select(`
          id,
          store_code,
          store_name,
          address_line_1,
          city,
          postcode,
          region,
          latitude,
          longitude,
          compliance_audit_1_date,
          compliance_audit_1_overall_pct,
          compliance_audit_2_date,
          compliance_audit_2_planned_date,
          compliance_audit_2_assigned_manager_user_id,
          assigned_manager:fa_profiles!fa_stores_compliance_audit_2_assigned_manager_user_id_fkey(
            id,
            full_name,
            home_address,
            home_latitude,
            home_longitude
          )
        `)
        .eq('is_active', true)
        .order('store_name', { ascending: true })
      
      stores = result.data || []
      storesError = result.error
    } else {
      storesError = err
    }
  }

  if (storesError) {
    console.error('Error fetching stores:', storesError)
    return { stores: [], profiles: [] }
  }

  // Get all profiles for manager selection (only ops and admin - managers)
  const { data: profiles, error: profilesError } = await supabase
    .from('fa_profiles')
    .select('id, full_name, home_address, home_latitude, home_longitude, role')
    .in('role', ['ops', 'admin']) // Only include managers (ops and admin)
    .order('full_name', { ascending: true })

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError)
  }

  // Filter out closed/excluded stores and stores that have completed Audit 1 with score >= 80% within the last 6 months.
  // These stores don't need a second audit for 6 months.
  const filteredStores = (stores || []).filter((store: any) => {
    const storeCode = String(store.store_code || '').trim().toUpperCase()
    if (ROUTE_PLANNING_EXCLUDED_STORE_CODES.has(storeCode)) {
      return false
    }

    // If store has completed Audit 1 with score >= 80%
    if (store.compliance_audit_1_date && store.compliance_audit_1_overall_pct !== null && store.compliance_audit_1_overall_pct >= 80) {
      const audit1Date = new Date(store.compliance_audit_1_date)
      audit1Date.setHours(0, 0, 0, 0)
      
      // Hide if Audit 1 was completed within the last 6 months (stores with >=80% don't need second audit for 6 months)
      if (audit1Date >= sixMonthsAgo) {
        return false // Exclude this store from route planning
      }
    }
    return true // Include this store
  })

  // Process stores to handle assigned_manager array
  const processedStores = filteredStores.map((store: any) => ({
    ...store,
    route_sequence: store.route_sequence ?? null, // Default to null if column doesn't exist
    assigned_manager: Array.isArray(store.assigned_manager)
      ? (store.assigned_manager[0] || null)
      : store.assigned_manager || null,
  }))

  return {
    stores: processedStores,
    profiles: profiles || [],
  }
}

export default async function RoutePlanningPage() {
  // Restrict access to admin and ops roles only
  await requireRole(['admin', 'ops'])
  const data = await getRoutePlanningData()

  return <RoutePlanningClient initialData={data} />
}
