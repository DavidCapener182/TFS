import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getStorePortalSession } from '@/app/actions/store-portal'
import { StorePortalWorkspace } from '@/components/store-portal/store-portal-workspace'

function createStorePortalSupabaseClient() {
  try {
    return createAdminSupabaseClient()
  } catch (error) {
    console.warn('store-portal-page: service role client unavailable, falling back to user client', error)
    return createClient()
  }
}

function normalizeReferenceToken(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
}

function buildReferencePrefix(storeCode: string, storeName: string, occurredAt: string) {
  const parsedDate = new Date(occurredAt)
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
  const dateToken = safeDate.toISOString().slice(0, 10).replace(/-/g, '')
  const codeToken = normalizeReferenceToken(storeCode) || 'STORE'
  const storeToken = normalizeReferenceToken(storeName) || 'Store'
  return `${codeToken}-${storeToken}-${dateToken}`
}

export default async function StorePortalPage() {
  const store = await getStorePortalSession()
  if (!store) {
    redirect('/store-login')
  }

  const supabase = createStorePortalSupabaseClient()
  const { data: incidents } = await supabase
    .from('tfs_incidents')
    .select('id, reference_no, summary, description, occurred_at, status, persons_involved')
    .eq('store_id', store.id)
    .order('occurred_at', { ascending: false })
    .limit(50)

  const legacyReferenceSequenceByPrefix = new Map<string, number>()
  const reportsWithLegacyReferenceFix = (incidents || []).map((incident) => {
    const reference = String(incident.reference_no || '')
    if (!/^INC-/i.test(reference)) {
      return {
        incident,
        displayReference: reference,
      }
    }

    const prefix = buildReferencePrefix(
      String(store.store_code || ''),
      String(store.store_name || ''),
      String(incident.occurred_at || '')
    )
    const sequence = (legacyReferenceSequenceByPrefix.get(prefix) || 0) + 1
    legacyReferenceSequenceByPrefix.set(prefix, sequence)

    return {
      incident,
      displayReference: `${prefix}-${String(sequence).padStart(3, '0')}`,
    }
  })

  const recentReports = reportsWithLegacyReferenceFix.map(({ incident, displayReference }) => {
    const meta =
      incident.persons_involved && typeof incident.persons_involved === 'object'
        ? (incident.persons_involved as Record<string, unknown>)
        : {}
    const rawTheftItems = Array.isArray(meta.theftItems) ? meta.theftItems : []
    const theftItems = rawTheftItems
      .map((item) => {
        const payload = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        return {
          title: String(payload.title || '').trim(),
          quantity: Math.max(1, Number(payload.quantity) || 1),
          barcode: String(payload.barcode || payload.productId || '').trim() || null,
          unitPrice: Number.isFinite(Number(payload.unitPrice)) ? Number(payload.unitPrice) : null,
        }
      })
      .filter((item) => item.title)

    const theftValueNumber = Number(meta.theftValueGbp)
    const theftValueGbp = Number.isFinite(theftValueNumber) ? theftValueNumber : null

    return {
      id: String(incident.id),
      reference_no: displayReference,
      summary: String(incident.summary || ''),
      description: String(incident.description || ''),
      occurred_at: String(incident.occurred_at || ''),
      status: String(incident.status || ''),
      isTheft: meta.reportType === 'theft',
      theftValueGbp,
      theftItems,
      hasTheftBeenReported: meta.hasTheftBeenReported === true,
      adjustedThroughTill: meta.adjustedThroughTill === true,
      stockRecovered: meta.stockRecovered === true,
    }
  })

  return (
    <StorePortalWorkspace
      storeName={store.store_name || 'Store'}
      storeCode={store.store_code || ''}
      recentReports={recentReports}
    />
  )
}
