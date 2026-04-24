import { getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isStorePortalTheftFollowUpComplete, isStorePortalTheftIncident } from '@/lib/incidents/store-portal-theft'
import { SidebarClient } from './sidebar-client'

export async function Sidebar() {
  const profile = await getUserProfile()
  let storeTheftFollowUpCount = 0

  if (profile?.role === 'admin' || profile?.role === 'ops') {
    const supabase = createClient()
    const theftRowsResult = await supabase
      .from('tfs_incidents')
      .select('id, persons_involved, status')
      .not('status', 'eq', 'closed')
      .not('status', 'eq', 'cancelled')
      .limit(300)

    if (theftRowsResult.error) {
      console.error('Error fetching store theft follow-up badge count:', theftRowsResult.error)
    } else {
      for (const row of theftRowsResult.data || []) {
        if (!isStorePortalTheftIncident(row)) continue
        if (isStorePortalTheftFollowUpComplete(row)) continue
        storeTheftFollowUpCount += 1
      }
    }
  }

  return (
    <SidebarClient
      userRole={profile?.role || null}
      userProfile={profile}
      storeTheftFollowUpCount={storeTheftFollowUpCount}
    />
  )
}
