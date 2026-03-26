import { VisitReportsWorkspace } from '@/components/reports/visit-reports-workspace'
import { requireRole } from '@/lib/auth'
import {
  normalizeTargetedTheftVisitPayload,
  type VisitReportRecord,
  type VisitReportStoreOption,
} from '@/lib/reports/visit-report-types'
import { shouldHideStore } from '@/lib/store-normalization'
import { createClient } from '@/lib/supabase/server'
import {
  getVisitReportsUnavailableMessage,
  isMissingVisitReportsTableError,
} from '@/lib/visit-reports-schema'

export const dynamic = 'force-dynamic'

type StoreRow = {
  id: string
  store_name: string | null
  store_code: string | null
  region: string | null
  city: string | null
  is_active: boolean | null
}

type RelatedStoreRow = {
  store_name: string | null
  store_code: string | null
}

type RelatedProfileRow = {
  full_name: string | null
}

type VisitReportRow = {
  id: string
  store_id: string
  report_type: string
  status: string
  title: string
  summary: string | null
  visit_date: string
  payload: unknown
  created_at: string
  updated_at: string
  store: RelatedStoreRow | RelatedStoreRow[] | null
  created_by: RelatedProfileRow | RelatedProfileRow[] | null
}

function getRelatedRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

async function getVisitReportsPageData(): Promise<{
  stores: VisitReportStoreOption[]
  reports: VisitReportRecord[]
  reportsAvailable: boolean
  unavailableMessage: string | null
}> {
  const supabase = createClient()

  const { data: storeRows, error: storesError } = await supabase
    .from('tfs_stores')
    .select('id, store_name, store_code, region, city, is_active')
    .order('region', { ascending: true })
    .order('store_name', { ascending: true })

  if (storesError) {
    console.error('Error fetching report stores:', storesError)
  }

  const stores = ((storeRows || []) as StoreRow[])
    .filter((store) => store.is_active !== false)
    .filter((store) => !shouldHideStore(store))
    .map<VisitReportStoreOption>((store) => ({
      id: String(store.id),
      storeName: store.store_name || 'Unknown Store',
      storeCode: store.store_code || null,
      region: store.region || null,
      city: store.city || null,
    }))

  const { data: reportRows, error: reportsError } = await supabase
    .from('tfs_visit_reports')
    .select(`
      id,
      store_id,
      report_type,
      status,
      title,
      summary,
      visit_date,
      payload,
      created_at,
      updated_at,
      store:tfs_stores!tfs_visit_reports_store_id_fkey(store_name, store_code),
      created_by:fa_profiles!tfs_visit_reports_created_by_user_id_fkey(full_name)
    `)
    .order('updated_at', { ascending: false })
    .limit(24)

  if (reportsError) {
    if (isMissingVisitReportsTableError(reportsError)) {
      return {
        stores,
        reports: [],
        reportsAvailable: false,
        unavailableMessage: getVisitReportsUnavailableMessage(),
      }
    }

    console.error('Error fetching visit reports:', reportsError)
    return {
      stores,
      reports: [],
      reportsAvailable: true,
      unavailableMessage: null,
    }
  }

  const reports: VisitReportRecord[] = ((reportRows || []) as VisitReportRow[])
    .filter((row) => row.report_type === 'targeted_theft_visit')
    .map((row) => {
      const store = getRelatedRow(row.store)
      const createdBy = getRelatedRow(row.created_by)
      const payload = normalizeTargetedTheftVisitPayload(row.payload)

      return {
        id: row.id,
        storeId: row.store_id,
        storeName: store?.store_name || 'Unknown Store',
        storeCode: store?.store_code || null,
        reportType: 'targeted_theft_visit',
        status: row.status === 'final' ? 'final' : 'draft',
        title: row.title || 'Untitled Visit Report',
        summary: row.summary || null,
        visitDate: row.visit_date,
        riskRating: payload.riskRating,
        payload,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdByName: createdBy?.full_name || null,
      }
    })

  return {
    stores,
    reports,
    reportsAvailable: true,
    unavailableMessage: null,
  }
}

export default async function ReportsPage() {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])
  const { stores, reports, reportsAvailable, unavailableMessage } = await getVisitReportsPageData()

  return (
    <VisitReportsWorkspace
      stores={stores}
      reports={reports}
      currentUserName={profile.full_name}
      canEdit={profile.role === 'admin' || profile.role === 'ops'}
      reportsAvailable={reportsAvailable}
      unavailableMessage={unavailableMessage}
    />
  )
}
