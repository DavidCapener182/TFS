import { getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isStorePortalTheftFollowUpComplete, isStorePortalTheftIncident } from '@/lib/incidents/store-portal-theft'
import { SidebarClient } from './sidebar-client'

export async function Sidebar() {
  const profile = await getUserProfile()
  let pendingInboundEmailCount = 0
  let storeTheftFollowUpCount = 0

  if (profile?.role === 'admin' || profile?.role === 'ops') {
    const supabase = createClient()
    const [{ count, error }, theftRowsResult] = await Promise.all([
      supabase
        .from('tfs_inbound_emails')
        .select('id', { count: 'exact', head: true })
        .eq('processing_status', 'pending')
        .is('analysis_last_ran_at', null),
      supabase
        .from('tfs_incidents')
        .select('id, persons_involved, status')
        .not('status', 'eq', 'closed')
        .not('status', 'eq', 'cancelled')
        .limit(300),
    ])

    if (error) {
      console.error('Error fetching pending inbound email parser count:', error)
    } else {
      pendingInboundEmailCount = count || 0
    }

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
      pendingInboundEmailCount={pendingInboundEmailCount}
      storeTheftFollowUpCount={storeTheftFollowUpCount}
    />
  )
}
