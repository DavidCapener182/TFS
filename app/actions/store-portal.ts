'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { clearStorePortalCode, getStorePortalCode, setStorePortalCode } from '@/lib/store-portal-auth'
import { searchStoreVisitProducts } from '@/lib/store-visit-product-catalog'

function createStorePortalSupabaseClient() {
  try {
    return createAdminSupabaseClient()
  } catch (error) {
    console.warn('store-portal: service role client unavailable, falling back to user client', error)
    return createClient()
  }
}

async function resolveStorePortalReporterProfileId(
  supabase: ReturnType<typeof createStorePortalSupabaseClient>
) {
  // Prefer the currently signed-in user when store portal is opened from an authenticated staff session.
  try {
    const userSupabase = createClient()
    const {
      data: { user },
    } = await userSupabase.auth.getUser()

    if (user?.id) {
      const { data: ownProfile } = await supabase
        .from('fa_profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()
      if (ownProfile?.id) return ownProfile.id
    }
  } catch {
    // Ignore and continue to service-role fallbacks.
  }

  const configuredReporterId = String(process.env.STORE_PORTAL_REPORTED_BY_USER_ID || '').trim()
  if (configuredReporterId) {
    const { data: configuredProfile } = await supabase
      .from('fa_profiles')
      .select('id')
      .eq('id', configuredReporterId)
      .maybeSingle()
    if (configuredProfile?.id) return configuredProfile.id
  }

  const { data: adminOrOpsProfile } = await supabase
    .from('fa_profiles')
    .select('id')
    .in('role', ['admin', 'ops'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (adminOrOpsProfile?.id) return adminOrOpsProfile.id

  const { data: anyProfile } = await supabase
    .from('fa_profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return anyProfile?.id || null
}

export async function loginStorePortal(storeCode: string) {
  const normalized = String(storeCode || '').trim().toUpperCase()
  if (!normalized) throw new Error('Store code is required')

  const supabase = createStorePortalSupabaseClient()
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

  const supabase = createStorePortalSupabaseClient()
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
  barcode?: string | null
}

function buildTheftSummary(theftItems: TheftItem[]) {
  if (theftItems.length === 0) return 'Theft report'

  const labels = theftItems.map((item) =>
    item.quantity > 1 ? `${item.title} x${item.quantity}` : item.title
  )

  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels[0]} and ${labels.length - 1} more items`
}

type CreateStoreReportInput = {
  kind: 'incident' | 'theft'
  summary: string
  description?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  occurredAt: string
  theftItems?: TheftItem[]
  hasTheftBeenReported?: boolean
  adjustedThroughTill?: boolean
  stockRecovered?: boolean
}

function normalizeReferenceToken(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
}

function buildStorePortalReferencePrefix(storeCode: string, storeName: string, occurredAt: string) {
  const parsedDate = new Date(occurredAt)
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
  const dateToken = safeDate.toISOString().slice(0, 10).replace(/-/g, '')
  const codeToken = normalizeReferenceToken(storeCode) || 'STORE'
  const storeToken = normalizeReferenceToken(storeName) || 'Store'
  return `${codeToken}-${storeToken}-${dateToken}`
}

async function generateStorePortalIncidentReference(
  supabase: ReturnType<typeof createStorePortalSupabaseClient>,
  storeCode: string,
  storeName: string,
  occurredAt: string
) {
  const prefix = buildStorePortalReferencePrefix(storeCode, storeName, occurredAt)
  const { data: existingRefs } = await supabase
    .from('tfs_incidents')
    .select('reference_no')
    .ilike('reference_no', `${prefix}-%`)
    .limit(500)

  const maxSequence = (existingRefs || []).reduce((max, row) => {
    const reference = String((row as { reference_no?: unknown })?.reference_no || '').trim()
    const match = reference.match(/-(\d{3,})$/)
    if (!match) return max
    const seq = Number(match[1])
    if (!Number.isFinite(seq)) return max
    return Math.max(max, seq)
  }, 0)

  const nextSequence = String(maxSequence + 1).padStart(3, '0')
  return `${prefix}-${nextSequence}`
}

export async function createStorePortalReport(input: CreateStoreReportInput) {
  const store = await getStorePortalSession()
  if (!store) throw new Error('Store session expired. Please sign in again.')

  const supabase = createStorePortalSupabaseClient()
  const reporterProfileId = await resolveStorePortalReporterProfileId(supabase)
  if (!reporterProfileId) {
    throw new Error('Could not submit report: no reporter profile is configured.')
  }
  const reference_no = await generateStorePortalIncidentReference(
    supabase,
    String(store.store_code || ''),
    String(store.store_name || ''),
    input.occurredAt
  )

  const theftItems = (input.theftItems || []).filter((item) => item.productId && item.title && item.quantity > 0)
  const trimmedSummary = input.summary.trim()

  if (input.kind === 'incident' && !trimmedSummary) {
    throw new Error('Enter an incident summary before submitting.')
  }

  if (input.kind === 'theft' && theftItems.length === 0) {
    throw new Error('Add at least one stolen product before submitting.')
  }

  const resolvedSummary =
    input.kind === 'theft' ? trimmedSummary || buildTheftSummary(theftItems) : trimmedSummary

  const personsInvolvedPayload = {
    source: 'store_portal',
    reportType: input.kind,
    submittedByStoreCode: store.store_code,
    theftItems: theftItems.map((item) => ({
      ...item,
      barcode: String(item.barcode || item.productId || '').trim() || null,
    })),
    theftValueGbp: theftItems.reduce((total, item) => {
      const line = typeof item.unitPrice === 'number' ? item.unitPrice * item.quantity : 0
      return total + line
    }, 0),
    hasTheftBeenReported: input.kind === 'theft' ? input.hasTheftBeenReported !== false : null,
    adjustedThroughTill: input.kind === 'theft' ? input.adjustedThroughTill === true : null,
    stockRecovered: input.kind === 'theft' ? input.stockRecovered === true : null,
  }

  const { data, error } = await supabase
    .from('tfs_incidents')
    .insert({
      reference_no,
      store_id: store.id,
      reported_by_user_id: reporterProfileId,
      incident_category: input.kind === 'theft' ? 'security' : 'other',
      severity: input.severity,
      summary: resolvedSummary,
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
  revalidatePath(`/stores/${store.id}`)
  revalidatePath('/theft-tracker')
  revalidatePath('/store-portal')

  return data
}

export async function searchTheftCatalog(query: string) {
  return searchStoreVisitProducts(query, 8)
}
