import type {
  StoreVisitActivityKey,
  StoreVisitNeedLevel,
  StoreVisitType,
} from '@/lib/visit-needs'

export type VisitState = 'planned' | 'recent' | 'random' | 'none'

export interface VisitHistoryEntry {
  id: string
  source: 'visit_log' | 'route_completion'
  visitedAt: string
  visitType: StoreVisitType | 'route_completion'
  completedActivityKeys: StoreVisitActivityKey[]
  notes: string | null
  createdByName: string | null
  needScoreSnapshot: number | null
  needLevelSnapshot: StoreVisitNeedLevel | null
}

export interface VisitTrackerRow {
  storeId: string
  storeCode: string | null
  storeName: string
  region: string | null
  assignedManager: string | null
  lastVisitDate: string | null
  lastVisitType: string | null
  nextPlannedVisitDate: string | null
  visitNeedScore: number
  visitNeedLevel: StoreVisitNeedLevel
  visitNeeded: boolean
  visitNeedReasons: string[]
  visitState: VisitState
  openStoreActionCount: number
  openIncidentCount: number
  isActive: boolean
  recentVisits: VisitHistoryEntry[]
}
