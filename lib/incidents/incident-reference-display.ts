import type { SupabaseClient } from '@supabase/supabase-js'

export function normalizeReferenceToken(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
}

/**
 * Maps legacy `INC-…` references to `StoreCode-StoreName-YYYYMMDD-###`
 * (same shape as theft tracker, store portal, and store CRM).
 */
export function buildDisplayIncidentReference(
  referenceNo: string | null | undefined,
  storeCode: string | null | undefined,
  storeName: string | null | undefined,
  occurredAt: string | null | undefined,
  sequence: number
) {
  const currentReference = String(referenceNo || '').trim()
  if (!/^INC-/i.test(currentReference)) return currentReference

  const parsedDate = new Date(String(occurredAt || ''))
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
  const dateToken = safeDate.toISOString().slice(0, 10).replace(/-/g, '')
  const codeToken = normalizeReferenceToken(String(storeCode || '')) || 'STORE'
  const storeToken = normalizeReferenceToken(String(storeName || '')) || 'Store'
  return `${codeToken}-${storeToken}-${dateToken}-${String(sequence).padStart(3, '0')}`
}

type RefRow = { id: string; reference_no: string | null; occurred_at: string | null }

/**
 * Among `INC-…` incidents for the same store on the same UTC calendar day,
 * order by `occurred_at` desc then `id` desc (matches store portal / list behaviour).
 */
export async function resolveLegacyIncidentSequence(
  supabase: SupabaseClient,
  params: {
    incidentId: string
    storeId: string | null | undefined
    occurredAt: string | null | undefined
    referenceNo: string | null | undefined
  }
): Promise<number> {
  const reference = String(params.referenceNo || '').trim()
  if (!/^INC-/i.test(reference)) return 1
  const storeId = params.storeId ? String(params.storeId) : ''
  if (!storeId) return 1
  const occurredAt = params.occurredAt
  if (!occurredAt) return 1

  const parsed = new Date(String(occurredAt))
  if (Number.isNaN(parsed.getTime())) return 1
  const dayStr = parsed.toISOString().slice(0, 10)
  const dayStart = `${dayStr}T00:00:00.000Z`
  const dayEnd = `${dayStr}T23:59:59.999Z`

  const [openRes, closedRes] = await Promise.all([
    supabase
      .from('tfs_incidents')
      .select('id, reference_no, occurred_at')
      .eq('store_id', storeId)
      .gte('occurred_at', dayStart)
      .lte('occurred_at', dayEnd),
    supabase
      .from('tfs_closed_incidents')
      .select('id, reference_no, occurred_at')
      .eq('store_id', storeId)
      .gte('occurred_at', dayStart)
      .lte('occurred_at', dayEnd),
  ])

  const rows: RefRow[] = [
    ...(((openRes.data || []) as unknown) as RefRow[]),
    ...(((closedRes.data || []) as unknown) as RefRow[]),
  ]

  const incOnly = rows.filter((r) => /^INC-/i.test(String(r.reference_no || '')))
  const seen = new Set<string>()
  const deduped = incOnly.filter((r) => {
    const id = String(r.id)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  deduped.sort((a, b) => {
    const ta = new Date(String(a.occurred_at || 0)).getTime()
    const tb = new Date(String(b.occurred_at || 0)).getTime()
    if (tb !== ta) return tb - ta
    return String(b.id).localeCompare(String(a.id))
  })

  const idx = deduped.findIndex((r) => String(r.id) === String(params.incidentId))
  return idx >= 0 ? idx + 1 : 1
}

export async function getIncidentDisplayReference(
  supabase: SupabaseClient,
  params: {
    incidentId: string
    referenceNo: string | null | undefined
    storeCode: string | null | undefined
    storeName: string | null | undefined
    occurredAt: string | null | undefined
    storeId: string | null | undefined
  }
) {
  const sequence = await resolveLegacyIncidentSequence(supabase, {
    incidentId: params.incidentId,
    storeId: params.storeId,
    occurredAt: params.occurredAt,
    referenceNo: params.referenceNo,
  })
  return buildDisplayIncidentReference(
    params.referenceNo,
    params.storeCode,
    params.storeName,
    params.occurredAt,
    sequence
  )
}

function resolvedStoreJoin(incident: {
  tfs_stores?: { store_code?: string | null; store_name?: string | null } | Array<{ store_code?: string | null; store_name?: string | null }> | null
}) {
  const raw = incident?.tfs_stores
  if (Array.isArray(raw)) return raw[0] || null
  return raw || null
}

type IncidentForDisplayMap = {
  id: string
  reference_no?: string | null
  occurred_at?: string | null
  store_id?: string | null
  tfs_stores?: { store_code?: string | null; store_name?: string | null } | Array<{ store_code?: string | null; store_name?: string | null }> | null
}

/**
 * Batch-resolve display references for many incidents (LP summary, register tables, etc.)
 * using the same per–store-day `INC-…` sequencing as the incident detail page.
 */
export async function buildIncidentDisplayReferenceMap(
  supabase: SupabaseClient,
  incidents: IncidentForDisplayMap[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const buckets = new Map<string, { storeId: string; dayStart: string; dayEnd: string }>()

  for (const inc of incidents) {
    const id = String(inc.id)
    const ref = String(inc.reference_no || '').trim()
    if (!/^INC-/i.test(ref)) {
      out.set(id, ref || '—')
      continue
    }
    const storeId = inc.store_id ? String(inc.store_id) : ''
    const occurredAt = inc.occurred_at
    if (!storeId || !occurredAt) {
      out.set(id, ref)
      continue
    }
    const parsed = new Date(String(occurredAt))
    if (Number.isNaN(parsed.getTime())) {
      out.set(id, ref)
      continue
    }
    const dayStr = parsed.toISOString().slice(0, 10)
    const dayStart = `${dayStr}T00:00:00.000Z`
    const dayEnd = `${dayStr}T23:59:59.999Z`
    const key = `${storeId}|${dayStart}`
    if (!buckets.has(key)) {
      buckets.set(key, { storeId, dayStart, dayEnd })
    }
  }

  const idToSeq = new Map<string, number>()
  await Promise.all(
    [...buckets.values()].map(async (bucket) => {
      const [openRes, closedRes] = await Promise.all([
        supabase
          .from('tfs_incidents')
          .select('id, reference_no, occurred_at')
          .eq('store_id', bucket.storeId)
          .gte('occurred_at', bucket.dayStart)
          .lte('occurred_at', bucket.dayEnd),
        supabase
          .from('tfs_closed_incidents')
          .select('id, reference_no, occurred_at')
          .eq('store_id', bucket.storeId)
          .gte('occurred_at', bucket.dayStart)
          .lte('occurred_at', bucket.dayEnd),
      ])

      const rows: RefRow[] = [
        ...(((openRes.data || []) as unknown) as RefRow[]),
        ...(((closedRes.data || []) as unknown) as RefRow[]),
      ]
      const incOnly = rows.filter((r) => /^INC-/i.test(String(r.reference_no || '')))
      const seen = new Set<string>()
      const deduped = incOnly.filter((r) => {
        const rid = String(r.id)
        if (seen.has(rid)) return false
        seen.add(rid)
        return true
      })
      deduped.sort((a, b) => {
        const ta = new Date(String(a.occurred_at || 0)).getTime()
        const tb = new Date(String(b.occurred_at || 0)).getTime()
        if (tb !== ta) return tb - ta
        return String(b.id).localeCompare(String(a.id))
      })
      deduped.forEach((r, i) => idToSeq.set(String(r.id), i + 1))
    })
  )

  for (const inc of incidents) {
    const id = String(inc.id)
    if (out.has(id)) continue
    const rel = resolvedStoreJoin(inc)
    const seq = idToSeq.get(id) || 1
    out.set(
      id,
      buildDisplayIncidentReference(inc.reference_no, rel?.store_code, rel?.store_name, inc.occurred_at, seq)
    )
  }

  return out
}
