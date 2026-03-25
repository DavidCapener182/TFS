import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { RoutePlanningClient } from '@/components/route-planning/route-planning-client'
import { applyStoreCoordinateOverride, shouldAlwaysIncludeStore, shouldHideStore } from '@/lib/store-normalization'

type RoutePlanningProfile = {
  id: string
  full_name: string | null
  home_address: string | null
  home_latitude: number | string | null
  home_longitude: number | string | null
  role: string | null
}

function isManagerProfile(profile: RoutePlanningProfile): boolean {
  return profile.role === 'admin' || profile.role === 'ops'
}

function normalizeCoordinate(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

async function getRoutePlanningData() {
  const supabase = createClient()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  const [storesResult, profilesResult] = await Promise.all([
    supabase
      .from('tfs_stores')
      .select('*')
      .order('store_name', { ascending: true }),
    supabase
      .from('fa_profiles')
      .select('*')
      .order('full_name', { ascending: true }),
  ])

  if (storesResult.error) {
    console.error('Error fetching stores:', storesResult.error)
  }

  if (profilesResult.error) {
    console.error('Error fetching profiles:', profilesResult.error)
  }

  const allProfiles = ((profilesResult.data || []) as RoutePlanningProfile[]).filter(
    (profile) => Boolean(profile?.id)
  )
  const managerProfiles = allProfiles.filter(isManagerProfile)
  const visibleProfiles = (managerProfiles.length > 0 ? managerProfiles : allProfiles)
    .filter((profile) => Boolean(profile.full_name))
    .map((profile) => ({
      id: profile.id,
      full_name: profile.full_name,
      home_address: profile.home_address || null,
      home_latitude: normalizeCoordinate(profile.home_latitude),
      home_longitude: normalizeCoordinate(profile.home_longitude),
      role: profile.role,
    }))
  const profilesById = new Map(visibleProfiles.map((profile) => [profile.id, profile]))

  // Filter out closed/excluded stores and stores that have completed Audit 1 with score >= 80% within the last 6 months.
  // These stores don't need a second audit for 6 months.
  const storesWithCoordinates = ((storesResult.data || []) as any[]).map((store: any) =>
    applyStoreCoordinateOverride({
      ...store,
      assigned_manager: store.compliance_audit_2_assigned_manager_user_id
        ? profilesById.get(store.compliance_audit_2_assigned_manager_user_id) || null
        : null,
    })
  )

  const filteredStores = storesWithCoordinates.filter((store: any) => {
    if (!store?.is_active && !shouldAlwaysIncludeStore(store)) {
      return false
    }

    if (shouldHideStore(store)) {
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
    profiles: visibleProfiles,
  }
}

export default async function RoutePlanningPage() {
  // Restrict access to admin and ops roles only
  await requireRole(['admin', 'ops'])
  const data = await getRoutePlanningData()

  return <RoutePlanningClient initialData={data} />
}
