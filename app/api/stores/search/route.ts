import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildStoreMergeContext, getStoreIdsIncludingAliases, shouldHideStore } from '@/lib/store-normalization'

export const dynamic = 'force-dynamic'

type StoreSearchResult = {
  id: string
  store_code: string | null
  store_name: string
  address_line_1: string | null
  city: string | null
  postcode: string | null
  region: string | null
  compliance_audit_1_date: string | null
  compliance_audit_1_overall_pct: number | null
  compliance_audit_2_date: string | null
  compliance_audit_2_overall_pct: number | null
  compliance_audit_2_planned_date: string | null
  compliance_audit_3_date: string | null
  compliance_audit_3_overall_pct: number | null
  fire_risk_assessment_date: string | null
  fire_risk_assessment_pct: number | null
  open_incidents_count: number
}

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawQ = (searchParams.get('q') || '').trim()

  if (!rawQ) {
    return NextResponse.json({ results: [] satisfies StoreSearchResult[] })
  }

  const q = rawQ.slice(0, 80) // basic guardrail
  const searchPattern = `%${q}%`

  // Use ilike with or() for multiple field search
  const { data: stores, error } = await supabase
    .from('tfs_stores')
    .select(
      [
        'id',
        'store_code',
        'store_name',
        'address_line_1',
        'city',
        'postcode',
        'region',
        'compliance_audit_1_date',
        'compliance_audit_1_overall_pct',
        'compliance_audit_2_date',
        'compliance_audit_2_overall_pct',
        'compliance_audit_2_planned_date',
        'compliance_audit_3_date',
        'compliance_audit_3_overall_pct',
        'fire_risk_assessment_date',
        'fire_risk_assessment_pct',
      ].join(',')
    )
    .or(`store_name.ilike.${searchPattern},store_code.ilike.${searchPattern},city.ilike.${searchPattern},postcode.ilike.${searchPattern}`)
    .order('store_name', { ascending: true })
    .limit(40)

  if (error) {
    console.error('Store search error:', error)
    return NextResponse.json({ error: 'Failed to search stores' }, { status: 500 })
  }

  const { data: allStoresForMerge } = await supabase
    .from('tfs_stores')
    .select('id, store_name, store_code, address_line_1, city, postcode, latitude, longitude')

  const mergeContext = buildStoreMergeContext(allStoresForMerge || [])
  const visibleStores = ((stores || []) as any[]).filter((store) => !shouldHideStore(store)).slice(0, 10)

  const results: StoreSearchResult[] = await Promise.all(
    visibleStores.map(async (s: any) => {
      const storeIdsForCount = getStoreIdsIncludingAliases(s.id, mergeContext)
      const { count } = await supabase
        .from('tfs_incidents')
        .select('id', { count: 'exact', head: true })
        .in('store_id', storeIdsForCount)
        .neq('status', 'closed')

      return {
        ...s,
        // Ensure FRA fields exist (set to null if migration hasn't been run)
        fire_risk_assessment_date: s.fire_risk_assessment_date ?? null,
        fire_risk_assessment_pct: s.fire_risk_assessment_pct ?? null,
        open_incidents_count: count ?? 0,
      } satisfies StoreSearchResult
    })
  )

  return NextResponse.json({ results })
}
