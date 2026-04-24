import type {
  StoreVisitActivityDetails,
  StoreVisitActivityKey,
  StoreVisitActivityPayloads,
  StoreVisitNeedLevel,
  StoreVisitType,
} from '@/lib/visit-needs'
import type { VisitReportStatus, VisitReportType } from '@/lib/reports/visit-report-types'
import type { FaSeverity, TfsCaseStage } from '@/types/db'

export type VisitState = 'planned' | 'recent' | 'random' | 'none'
export type VisitSessionStatus = 'draft' | 'completed'

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

export interface LinkedVisitReportSummary {
  id: string
  reportType: VisitReportType
  status: VisitReportStatus
  title: string
  summary: string | null
  visitDate: string
  updatedAt: string
}

export interface VisitHistoryEntry {
  id: string
  source: 'visit_log' | 'route_completion'
  visitedAt: string
  status: VisitSessionStatus | null
  visitType: StoreVisitType | 'route_completion'
  completedActivityKeys: StoreVisitActivityKey[]
  completedActivityDetails: StoreVisitActivityDetails
  completedActivityPayloads: StoreVisitActivityPayloads
  evidenceFiles: StoreVisitEvidenceFile[]
  linkedReports: LinkedVisitReportSummary[]
  notes: string | null
  followUpRequired: boolean
  createdByName: string | null
  needScoreSnapshot: number | null
  needLevelSnapshot: StoreVisitNeedLevel | null
}

export interface CaseVisitSummary {
  caseId: string
  visitId: string
  visitType: StoreVisitType
  visitStatus: 'planned' | 'in_progress'
  scheduledFor: string | null
  assignedUserId: string | null
  assignedUserName: string | null
  caseType: string
  caseStage: TfsCaseStage
  severity: FaSeverity
  originReference: string | null
  nextActionLabel: string | null
  lastUpdateSummary: string | null
  createdAt: string
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
  plannedVisitPurpose: string | null
  plannedVisitPurposeNote: string | null
  visitNeedScore: number
  visitNeedLevel: StoreVisitNeedLevel
  visitNeeded: boolean
  visitNeedReasons: string[]
  visitState: VisitState
  openStoreActionCount: number
  openIncidentCount: number
  pendingInboundEmailCount: number
  isActive: boolean
  recentVisits: VisitHistoryEntry[]
  activeDraftVisit: VisitHistoryEntry | null
  caseVisits: CaseVisitSummary[]
}
