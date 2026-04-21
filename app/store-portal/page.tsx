import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStorePortalSession } from '@/app/actions/store-portal'
import { StorePortalWorkspace } from '@/components/store-portal/store-portal-workspace'

export default async function StorePortalPage() {
  const store = await getStorePortalSession()
  if (!store) {
    redirect('/store-login')
  }

  const supabase = createClient()
  const { data: incidents } = await supabase
    .from('tfs_incidents')
    .select('id, reference_no, summary, occurred_at, status, persons_involved')
    .eq('store_id', store.id)
    .order('occurred_at', { ascending: false })
    .limit(50)

  const recentReports = (incidents || []).map((incident) => {
    const meta = incident.persons_involved && typeof incident.persons_involved === 'object'
      ? incident.persons_involved as Record<string, unknown>
      : {}

    return {
      id: String(incident.id),
      reference_no: String(incident.reference_no || ''),
      summary: String(incident.summary || ''),
      occurred_at: String(incident.occurred_at || ''),
      status: String(incident.status || ''),
      isTheft: meta.reportType === 'theft',
    }
  })

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <StorePortalWorkspace
        storeName={store.store_name || 'Store'}
        storeCode={store.store_code || ''}
        recentReports={recentReports}
      />
    </div>
  )
}
