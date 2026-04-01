import { getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SidebarClient } from './sidebar-client'

export async function Sidebar() {
  const profile = await getUserProfile()
  let pendingInboundEmailCount = 0

  if (profile?.role === 'admin' || profile?.role === 'ops') {
    const supabase = createClient()
    const { count, error } = await supabase
      .from('tfs_inbound_emails')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'pending')
      .is('analysis_last_ran_at', null)

    if (error) {
      console.error('Error fetching pending inbound email parser count:', error)
    } else {
      pendingInboundEmailCount = count || 0
    }
  }

  return (
    <SidebarClient
      userRole={profile?.role || null}
      userProfile={profile}
      pendingInboundEmailCount={pendingInboundEmailCount}
    />
  )
}
