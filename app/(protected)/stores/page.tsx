import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ArrowUpRight, CheckCircle2, Plus, ShieldCheck, XCircle } from 'lucide-react'
import Link from 'next/link'
import { StoreDirectory } from '@/components/stores/store-directory'
import type { StoreDirectoryStore } from '@/components/stores/types'
import { WorkspaceHeader, WorkspaceShell, WorkspaceStat, WorkspaceStatGrid } from '@/components/workspace/workspace-shell'
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
    .from('tfs_stores')
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

function getOpenRelationCount(items: Array<{ status?: string | null }>, closedStatuses: string[]) {
  return items.filter((item) => !closedStatuses.includes(String(item.status || '').toLowerCase())).length
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
      .from('tfs_incidents')
      .select('id, reference_no, summary, status, closed_at, occurred_at, store_id')
      .in('store_id', relatedStoreIds),
    supabase
      .from('tfs_store_actions')
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
      .from('tfs_actions')
      .select(`
        id,
        title,
        status,
        due_date,
        completed_at,
        incident_id,
        incident:tfs_incidents!tfs_actions_incident_id_fkey(reference_no)
      `)
      .in('incident_id', incidentIds)
      .not('title', 'ilike', 'Implement visit report actions:%')

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
  const storesWithData: StoreDirectoryStore[] = stores.map((store) => {
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
  const attentionStores = storesWithData.filter(
    (store) =>
      getOpenRelationCount(store.incidents, ['closed', 'cancelled']) > 0 ||
      getOpenRelationCount(store.actions, ['complete', 'cancelled']) > 0
  ).length

  return (
    <WorkspaceShell className="p-4 md:p-6">
      <WorkspaceHeader
        eyebrow="Store CRM"
        icon={ShieldCheck}
        title="Store network"
        description="Manage live store records, operational exceptions, and location context from one workspace."
        actions={
          profile.role === 'admin' ? (
            <Button asChild>
              <Link href="/stores/new" prefetch={false}>
                <Plus className="h-4 w-4" />
                Add store
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : null
        }
      />

      <WorkspaceStatGrid>
        <WorkspaceStat label="Total stores" value={totalStores} note="Records in the live CRM workspace" icon={ShieldCheck} tone="info" />
        <WorkspaceStat label="Active" value={activeStores} note={`${activeRate}% of the estate`} icon={CheckCircle2} tone="success" />
        <WorkspaceStat label="Inactive" value={inactiveStores} note="Stores not currently trading" icon={XCircle} tone="neutral" />
        <WorkspaceStat label="Needs attention" value={attentionStores} note="Open incidents or actions attached" icon={AlertTriangle} tone="warning" />
      </WorkspaceStatGrid>

      <StoreDirectory stores={storesWithData} />
    </WorkspaceShell>
  )
}
