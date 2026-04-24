export interface StoreDirectoryIncident {
  id: string
  reference_no: string | null
  summary: string | null
  status: string | null
  closed_at?: string | null
  occurred_at: string | null
  store_id?: string | null
}

export interface StoreDirectoryAction {
  id: string
  title: string | null
  source_flagged_item?: string | null
  description?: string | null
  priority?: string | null
  status: string | null
  due_date?: string | null
  created_at?: string | null
  completed_at?: string | null
  source_type?: 'store' | 'incident'
}

export interface StoreDirectoryStore {
  id: string
  store_name: string
  store_code: string | null
  address_line_1: string | null
  city: string | null
  postcode: string | null
  region: string | null
  is_active: boolean | null
  incidents: StoreDirectoryIncident[]
  actions: StoreDirectoryAction[]
}
