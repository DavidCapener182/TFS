import type {
  StoreVisitActivityDetails,
  StoreVisitActivityKey,
  StoreVisitActivityPayloads,
  StoreVisitNeedLevel,
  StoreVisitType,
} from '@/lib/visit-needs'

export type VisitState = 'planned' | 'recent' | 'random' | 'none'

export interface StoreVisitEvidenceFile {
  id: string
  activityKey: StoreVisitActivityKey
  fileName: string
  fileType: string | null
  fileSize: number | null
  filePath: string
  createdAt: string
  downloadUrl: string | null
}

export interface VisitHistoryEntry {
  id: string
  source: 'visit_log' | 'route_completion'
  visitedAt: string
  visitType: StoreVisitType | 'route_completion'
  completedActivityKeys: StoreVisitActivityKey[]
  completedActivityDetails: StoreVisitActivityDetails
  completedActivityPayloads: StoreVisitActivityPayloads
  evidenceFiles: StoreVisitEvidenceFile[]
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
  city: string | null
  postcode: string | null
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
