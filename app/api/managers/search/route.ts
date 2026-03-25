import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { shouldHideStore } from '@/lib/store-normalization'

export const dynamic = 'force-dynamic'

type StoreLite = {
  id: string
  store_name: string
  store_code: string | null
  planned_date?: string | null
  completed_date?: string | null
}

type ManagerResult = {
  id: string
  full_name: string
  planned_stores: StoreLite[]
  completed_stores: StoreLite[]
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
    return NextResponse.json({ results: [] satisfies ManagerResult[] })
  }

  const q = rawQ.slice(0, 80)
  const searchPattern = `%${q}%`

  // Fetch matching profiles (managers)
  const { data: profiles, error: profileError } = await supabase
    .from('fa_profiles')
    .select('id, full_name')
    .ilike('full_name', searchPattern)
    .order('full_name', { ascending: true })
    .limit(5)

  if (profileError) {
    console.error('Manager search error:', profileError)
    return NextResponse.json({ error: 'Failed to search managers' }, { status: 500 })
  }

  const results: ManagerResult[] = []

  for (const profile of profiles || []) {
    const managerId = profile.id

    // Fetch all stores assigned to this manager (audit 2 assignment), with all audit dates
    const { data: allStores } = await supabase
      .from('tfs_stores')
      .select(
        'id, store_name, store_code, compliance_audit_2_planned_date, compliance_audit_1_date, compliance_audit_2_date, compliance_audit_3_date'
      )
      .eq('compliance_audit_2_assigned_manager_user_id', managerId)
      .limit(200)

    const plannedStores: StoreLite[] = []
    const completedStores: StoreLite[] = []

    for (const s of allStores || []) {
      if (shouldHideStore(s)) continue

      const plannedDate = s.compliance_audit_2_planned_date
      const completionDate =
        s.compliance_audit_2_date || s.compliance_audit_3_date || s.compliance_audit_1_date

      if (completionDate) {
        completedStores.push({
          id: s.id,
          store_name: s.store_name,
          store_code: s.store_code,
          completed_date: completionDate,
        })
      } else if (plannedDate) {
        plannedStores.push({
          id: s.id,
          store_name: s.store_name,
          store_code: s.store_code,
          planned_date: plannedDate,
        })
      }
    }

    // Sort ascending by date
    completedStores.sort((a, b) =>
      (a.completed_date || '').localeCompare(b.completed_date || '')
    )
    plannedStores.sort((a, b) =>
      (a.planned_date || '').localeCompare(b.planned_date || '')
    )

    results.push({
      id: managerId,
      full_name: profile.full_name || 'Manager',
      planned_stores: (plannedStores || []).map((s) => ({
        id: s.id,
        store_name: s.store_name,
        store_code: s.store_code,
        planned_date: s.planned_date,
      })),
      completed_stores: (completedStores || []).map((s) => ({
        id: s.id,
        store_name: s.store_name,
        store_code: s.store_code,
        completed_date: s.completed_date,
      })),
    })
  }

  return NextResponse.json({ results })
}
