import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Plus, ArrowUpRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { StoreDirectory } from '@/components/stores/store-directory'

async function getStores() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fa_stores')
    .select('*')
    .order('store_name', { ascending: true })

  if (error) {
    console.error('Error fetching stores:', error)
    return []
  }

  return data || []
}

async function getStoreIncidents(storeId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fa_incidents')
    .select('id, reference_no, summary, status, closed_at, occurred_at')
    .eq('store_id', storeId)
    .order('occurred_at', { ascending: false })

  if (error) {
    console.error('Error fetching store incidents:', error)
    return []
  }

  return data || []
}

async function getStoreActions(storeId: string) {
  const supabase = createClient()

  // First get all incidents for this store (for incident-linked actions)
  const { data: incidents, error: incidentsError } = await supabase
    .from('fa_incidents')
    .select('id')
    .eq('store_id', storeId)

  if (incidentsError) {
    console.error('Error fetching store incidents for actions:', incidentsError)
  }

  const incidentIds = (incidents || []).map((inc: any) => inc.id)

  // Fetch store actions directly from H&S audits
  const { data: storeActions, error: storeActionsError } = await supabase
    .from('fa_store_actions')
    .select('id, title, source_flagged_item, description, priority, status, due_date, created_at')
    .eq('store_id', storeId)
    .order('due_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (storeActionsError) {
    console.error('Error fetching direct store actions:', storeActionsError)
  }

  let incidentActions: any[] = []
  if (incidentIds.length > 0) {
    const { data, error } = await supabase
      .from('fa_actions')
      .select(`
        id,
        title,
        status,
        due_date,
        completed_at,
        incident_id,
        incident:fa_incidents!fa_actions_incident_id_fkey(reference_no)
      `)
      .in('incident_id', incidentIds)
      .order('due_date', { ascending: false })

    if (error) {
      console.error('Error fetching incident-linked store actions:', error)
    } else {
      incidentActions = data || []
    }
  }

  const mappedIncidentActions = incidentActions.map((action: any) => ({
    ...action,
    source_type: 'incident' as const,
  }))

  const mappedStoreActions = (storeActions || []).map((action: any) => ({
    ...action,
    incident_id: null,
    incident: null,
    completed_at: null,
    source_type: 'store' as const,
  }))

  return [...mappedIncidentActions, ...mappedStoreActions].sort((a, b) => {
    const aTime = a?.due_date ? new Date(a.due_date).getTime() : 0
    const bTime = b?.due_date ? new Date(b.due_date).getTime() : 0
    return bTime - aTime
  })
}

export default async function StoresPage() {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])
  const stores = await getStores()

  // Fetch incidents and actions for all stores in parallel
  const storesWithData = await Promise.all(
    stores.map(async (store) => {
      const [incidents, actions] = await Promise.all([
        getStoreIncidents(store.id),
        getStoreActions(store.id),
      ])
      return { ...store, incidents, actions }
    })
  )

  // Calculate stats
  const totalStores = storesWithData.length
  const activeStores = storesWithData.filter((s: any) => s.is_active).length
  const inactiveStores = totalStores - activeStores
  const activeRate = totalStores > 0 ? Math.round((activeStores / totalStores) * 100) : 0

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6 min-h-screen bg-slate-50/60">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 sm:p-6 md:p-7 shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Store Network
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Stores / CRM</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
              Manage store locations, compliance activity, and incident records across your estate.
            </p>
          </div>

          {profile.role === 'admin' && (
            <div className="flex-shrink-0">
              <Link href="/stores/new">
                <Button className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-slate-900 shadow-sm font-medium transition-all hover:bg-slate-100 active:scale-[0.98] min-h-[44px]">
                  <Plus className="h-4 w-4 text-indigo-600" />
                  <span>Add New Store</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
                </Button>
              </Link>
            </div>
          )}
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Total Stores</p>
            <p className="mt-1 text-lg font-semibold text-white">{totalStores}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Active</p>
            <p className="mt-1 text-lg font-semibold text-white">{activeStores}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Inactive</p>
            <p className="mt-1 text-lg font-semibold text-white">{inactiveStores}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Active Rate</p>
            <p className="mt-1 text-lg font-semibold text-white">{activeRate}%</p>
          </div>
        </div>
      </div>

      {/* Store Directory with Search */}
      <StoreDirectory stores={storesWithData} />
    </div>
  )
}
