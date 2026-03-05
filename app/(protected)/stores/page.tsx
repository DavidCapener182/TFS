import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Plus, ArrowUpRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { StoreDirectory } from '@/components/stores/store-directory'
import {
  buildStoreMergeContext,
  getCanonicalStoreId,
  getStoreIdsIncludingAliases,
  shouldHideStore,
  type StoreMergeContext,
} from '@/lib/store-normalization'

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

type StoreRelations = {
  incidents: any[]
  actions: any[]
}

async function getStoreRelationsForStores(stores: any[], mergeContext: StoreMergeContext) {
  if (stores.length === 0) return new Map<string, StoreRelations>()

  const canonicalStoreIds = new Set(stores.map((store) => String(store.id)))
  const relatedStoreIds = Array.from(
    new Set(
      stores.flatMap((store) => getStoreIdsIncludingAliases(String(store.id), mergeContext))
    )
  )

  if (relatedStoreIds.length === 0) return new Map<string, StoreRelations>()

  const supabase = createClient()

  const [incidentsResult, storeActionsResult] = await Promise.all([
    supabase
      .from('fa_incidents')
      .select('id, reference_no, summary, status, closed_at, occurred_at, store_id')
      .in('store_id', relatedStoreIds),
    supabase
      .from('fa_store_actions')
      .select('id, title, source_flagged_item, description, priority, status, due_date, created_at, store_id')
      .in('store_id', relatedStoreIds),
  ])

  if (incidentsResult.error) {
    console.error('Error fetching store incidents:', incidentsResult.error)
  }
  if (storeActionsResult.error) {
    console.error('Error fetching store actions:', storeActionsResult.error)
  }

  const incidentRows = incidentsResult.data || []
  const storeActionRows = storeActionsResult.data || []

  const incidentsByStoreId = new Map<string, any[]>()
  const incidentStoreIdByIncidentId = new Map<string, string>()

  for (const incident of incidentRows) {
    const canonicalStoreId = getCanonicalStoreId(incident.store_id, mergeContext)
    if (!canonicalStoreId || !canonicalStoreIds.has(canonicalStoreId)) continue

    incidentStoreIdByIncidentId.set(String(incident.id), canonicalStoreId)
    const bucket = incidentsByStoreId.get(canonicalStoreId) || []
    bucket.push(incident)
    incidentsByStoreId.set(canonicalStoreId, bucket)
  }

  const incidentIds = Array.from(incidentStoreIdByIncidentId.keys())
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

    if (error) {
      console.error('Error fetching incident-linked store actions:', error)
    } else {
      incidentActions = data || []
    }
  }

  const actionsByStoreId = new Map<string, any[]>()

  for (const action of storeActionRows) {
    const canonicalStoreId = getCanonicalStoreId(action.store_id, mergeContext)
    if (!canonicalStoreId || !canonicalStoreIds.has(canonicalStoreId)) continue

    const bucket = actionsByStoreId.get(canonicalStoreId) || []
    bucket.push({
      ...action,
      incident_id: null,
      incident: null,
      completed_at: null,
      source_type: 'store' as const,
    })
    actionsByStoreId.set(canonicalStoreId, bucket)
  }

  for (const action of incidentActions) {
    const canonicalStoreId = incidentStoreIdByIncidentId.get(String(action.incident_id))
    if (!canonicalStoreId || !canonicalStoreIds.has(canonicalStoreId)) continue

    const bucket = actionsByStoreId.get(canonicalStoreId) || []
    bucket.push({
      ...action,
      source_type: 'incident' as const,
    })
    actionsByStoreId.set(canonicalStoreId, bucket)
  }

  for (const [storeId, incidents] of incidentsByStoreId.entries()) {
    incidents.sort((a, b) => {
      const aTime = a?.occurred_at ? new Date(a.occurred_at).getTime() : 0
      const bTime = b?.occurred_at ? new Date(b.occurred_at).getTime() : 0
      return bTime - aTime
    })
    incidentsByStoreId.set(storeId, incidents)
  }

  for (const [storeId, actions] of actionsByStoreId.entries()) {
    actions.sort((a, b) => {
      const aTime = a?.due_date ? new Date(a.due_date).getTime() : 0
      const bTime = b?.due_date ? new Date(b.due_date).getTime() : 0
      return bTime - aTime
    })
    actionsByStoreId.set(storeId, actions)
  }

  const relationsByStoreId = new Map<string, StoreRelations>()
  for (const store of stores) {
    const storeId = String(store.id)
    relationsByStoreId.set(storeId, {
      incidents: incidentsByStoreId.get(storeId) || [],
      actions: actionsByStoreId.get(storeId) || [],
    })
  }

  return relationsByStoreId
}

export default async function StoresPage() {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])
  const allStores = await getStores()
  const mergeContext = buildStoreMergeContext(allStores)
  const stores = allStores.filter((store) => !shouldHideStore(store))

  const relationsByStoreId = await getStoreRelationsForStores(stores, mergeContext)
  const storesWithData = stores.map((store) => {
    const storeId = String(store.id)
    const relations = relationsByStoreId.get(storeId)
    return {
      ...store,
      incidents: relations?.incidents || [],
      actions: relations?.actions || [],
    }
  })

  // Calculate stats
  const totalStores = storesWithData.length
  const activeStores = storesWithData.filter((s: any) => s.is_active).length
  const inactiveStores = totalStores - activeStores
  const activeRate = totalStores > 0 ? Math.round((activeStores / totalStores) * 100) : 0

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6 min-h-screen bg-slate-50/60">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 sm:p-4 md:rounded-3xl md:p-7 shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-slate-200 md:px-3 md:text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Store Network
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl md:text-3xl">Stores / CRM</h1>
            <p className="mt-1.5 max-w-2xl text-xs leading-snug text-slate-300 sm:text-sm md:text-base">
              Manage store locations, compliance activity, and incident records across your estate.
            </p>
          </div>

          {profile.role === 'admin' && (
            <div className="flex-shrink-0">
              <Link href="/stores/new" prefetch={false}>
                <Button className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-900 shadow-sm transition-all hover:bg-slate-100 active:scale-[0.98] min-h-[40px] sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm sm:min-h-[44px]">
                  <Plus className="h-4 w-4 text-indigo-600" />
                  <span>Add New Store</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
                </Button>
              </Link>
            </div>
          )}
        </div>

        <div className="relative z-10 mt-3 grid grid-cols-2 gap-2 md:mt-5 md:grid-cols-4 md:gap-2.5">
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm md:rounded-xl md:px-3 md:py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Total Stores</p>
            <p className="mt-0.5 text-base font-semibold text-white md:mt-1 md:text-lg">{totalStores}</p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm md:rounded-xl md:px-3 md:py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Active</p>
            <p className="mt-0.5 text-base font-semibold text-white md:mt-1 md:text-lg">{activeStores}</p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm md:rounded-xl md:px-3 md:py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Inactive</p>
            <p className="mt-0.5 text-base font-semibold text-white md:mt-1 md:text-lg">{inactiveStores}</p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm md:rounded-xl md:px-3 md:py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Active Rate</p>
            <p className="mt-0.5 text-base font-semibold text-white md:mt-1 md:text-lg">{activeRate}%</p>
          </div>
        </div>
      </div>

      {/* Store Directory with Search */}
      <StoreDirectory stores={storesWithData} />
    </div>
  )
}
