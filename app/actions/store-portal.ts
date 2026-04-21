'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { clearStorePortalCode, getStorePortalCode, setStorePortalCode } from '@/lib/store-portal-auth'
import { searchStoreVisitProducts } from '@/lib/store-visit-product-catalog'

export async function loginStorePortal(storeCode: string) {
  const normalized = String(storeCode || '').trim().toUpperCase()
  if (!normalized) throw new Error('Store code is required')

  const supabase = createClient()
  const { data: store, error } = await supabase
    .from('tfs_stores')
    .select('id, store_name, store_code, is_active')
    .ilike('store_code', normalized)
    .maybeSingle()

  if (error || !store || !store.is_active) {
    throw new Error('Invalid store code')
  }

  await setStorePortalCode(normalized)
  return store
}

export async function logoutStorePortal() {
  await clearStorePortalCode()
}

export async function getStorePortalSession() {
  const code = await getStorePortalCode()
  if (!code) return null

  const supabase = createClient()
  const { data: store } = await supabase
    .from('tfs_stores')
    .select('id, store_name, store_code')
    .ilike('store_code', code)
    .maybeSingle()

  return store || null
}

type TheftItem = {
  productId: string
  title: string
  quantity: number
  unitPrice: number | null
}

type CreateStoreReportInput = {
  kind: 'incident' | 'theft'
  summary: string
  description?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  occurredAt: string
  theftItems?: TheftItem[]
}

export async function createStorePortalReport(input: CreateStoreReportInput) {
  const store = await getStorePortalSession()
  if (!store) throw new Error('Store session expired. Please sign in again.')

  const supabase = createClient()
  const { data: refData } = await supabase.rpc('tfs_generate_incident_reference')
  const reference_no = refData || `INC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

  const theftItems = (input.theftItems || []).filter((item) => item.productId && item.title && item.quantity > 0)

  const personsInvolvedPayload = {
    source: 'store_portal',
    reportType: input.kind,
    submittedByStoreCode: store.store_code,
    theftItems,
    theftValueGbp: theftItems.reduce((total, item) => {
      const line = typeof item.unitPrice === 'number' ? item.unitPrice * item.quantity : 0
      return total + line
    }, 0),
  }

  const { data, error } = await supabase
    .from('tfs_incidents')
    .insert({
      reference_no,
      store_id: store.id,
      reported_by_user_id: null as any,
      incident_category: input.kind === 'theft' ? 'security' : 'other',
      severity: input.severity,
      summary: input.summary,
      description: input.description || null,
      occurred_at: input.occurredAt,
      reported_at: new Date().toISOString(),
      persons_involved: personsInvolvedPayload as any,
      status: 'open',
      riddor_reportable: false,
    })
    .select('id, reference_no')
    .single()

  if (error) throw new Error(`Could not submit report: ${error.message}`)

  revalidatePath('/dashboard')
  revalidatePath('/incidents')
  revalidatePath('/stores')
  revalidatePath('/theft-tracker')
  revalidatePath('/store-portal')

  return data
}

export async function searchTheftCatalog(query: string) {
  return searchStoreVisitProducts(query, 8)
}
