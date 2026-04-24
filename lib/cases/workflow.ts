import type {
  FaSeverity,
  TfsCaseStage,
  TfsIntakeSource,
  TfsReviewOutcome,
  TfsVisitOutcome,
} from '@/types/db'

export type QueueCaseRecord = {
  id: string
  storeId: string
  storeName: string
  storeCode: string | null
  caseType: string
  intakeSource: TfsIntakeSource
  originReference: string | null
  originTargetTable: string | null
  originTargetId: string | null
  originIncidentSummary: string | null
  originIncidentDescription: string | null
  originTheftValueGbp: number | null
  originTheftItemsSummary: string | null
  severity: FaSeverity
  ownerUserId: string | null
  ownerName: string | null
  dueAt: string | null
  stage: TfsCaseStage
  nextActionCode: string | null
  nextActionLabel: string | null
  lastUpdateSummary: string | null
  reviewOutcome: TfsReviewOutcome | null
  closureOutcome: string | null
  closedAt: string | null
  openBlockerCount: number
  createdAt: string
  updatedAt: string
}

export type ContinueWorkResolution = {
  caseId: string
  storeId: string
  stage: TfsCaseStage
  href: string
  label: string
  reason: string
  mode: 'review' | 'action' | 'visit' | 'close' | 'view'
}

const STAGE_PRIORITY: Record<TfsCaseStage, number> = {
  new_submission: 0,
  under_review: 1,
  action_agreed: 2,
  visit_required: 3,
  awaiting_follow_up: 4,
  ready_to_close: 5,
  closed: 6,
}

const SEVERITY_PRIORITY: Record<FaSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const queueSectionOrder: TfsCaseStage[] = [
  'new_submission',
  'under_review',
  'action_agreed',
  'visit_required',
  'awaiting_follow_up',
  'ready_to_close',
  'closed',
]

export function getQueueSectionLabel(stage: TfsCaseStage): string {
  if (stage === 'new_submission') return 'New submissions'
  if (stage === 'under_review') return 'Needs review'
  if (stage === 'action_agreed') return 'Action agreed'
  if (stage === 'visit_required') return 'Visit required'
  if (stage === 'awaiting_follow_up') return 'Awaiting follow-up'
  if (stage === 'ready_to_close') return 'Ready to close'
  return 'Closed recently'
}

export function getCaseStageTone(stage: TfsCaseStage): 'critical' | 'warning' | 'info' | 'success' | 'secondary' {
  if (stage === 'new_submission') return 'critical'
  if (stage === 'under_review') return 'warning'
  if (stage === 'action_agreed' || stage === 'visit_required') return 'info'
  if (stage === 'awaiting_follow_up') return 'warning'
  if (stage === 'ready_to_close') return 'success'
  return 'secondary'
}

export function getSeverityTone(severity: FaSeverity): 'critical' | 'warning' | 'info' | 'success' {
  if (severity === 'critical') return 'critical'
  if (severity === 'high') return 'warning'
  if (severity === 'medium') return 'info'
  return 'success'
}

export function getCaseTypeLabel(caseType: string): string {
  const normalized = String(caseType || '').trim().toLowerCase()
  if (normalized === 'portal_theft') return 'Store portal theft'
  if (normalized === 'portal_incident') return 'Store portal incident'
  if (normalized === 'legacy_incident') return 'Active incident'
  if (normalized === 'store_action') return 'Store action'
  if (normalized === 'manual_incident') return 'Manual incident'
  if (normalized === 'visit_follow_up') return 'Visit follow-up'
  if (normalized === 'report_follow_up') return 'Report follow-up'
  if (!normalized) return 'Case'
  return normalized
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

export function getReviewOutcomeLabel(outcome: TfsReviewOutcome | null): string | null {
  if (outcome === 'acknowledged_only') return 'Acknowledged only'
  if (outcome === 'store_action_created') return 'Store action created'
  if (outcome === 'visit_required') return 'Visit required'
  if (outcome === 'incident_escalated') return 'Incident escalated'
  if (outcome === 'closed_no_further_action') return 'Closed with no further action'
  return null
}

export function getVisitOutcomeLabel(outcome: TfsVisitOutcome | null): string | null {
  if (outcome === 'no_further_action') return 'No further action'
  if (outcome === 'follow_up_visit_required') return 'Follow-up visit required'
  if (outcome === 'store_action_created') return 'Store action created'
  if (outcome === 'incident_task_created') return 'Incident task created'
  if (outcome === 'escalated_to_manager') return 'Escalated to manager'
  if (outcome === 'report_required') return 'Report required'
  return null
}

export function buildContinueWorkResolution(record: Pick<
  QueueCaseRecord,
  'id' | 'storeId' | 'stage' | 'nextActionLabel' | 'lastUpdateSummary'
>): ContinueWorkResolution {
  if (record.stage === 'new_submission' || record.stage === 'under_review') {
    return {
      caseId: record.id,
      storeId: record.storeId,
      stage: record.stage,
      href: `/queue?case=${record.id}&review=1`,
      label: record.stage === 'new_submission' ? 'Continue review' : 'Continue review',
      reason: record.lastUpdateSummary || 'Review the intake and record the decision.',
      mode: 'review',
    }
  }

  if (record.stage === 'action_agreed') {
    return {
      caseId: record.id,
      storeId: record.storeId,
      stage: record.stage,
      href: `/stores/${record.storeId}?case=${record.id}`,
      label: 'Continue follow-up',
      reason: record.nextActionLabel || 'Complete the linked follow-up work.',
      mode: 'action',
    }
  }

  if (record.stage === 'visit_required' || record.stage === 'awaiting_follow_up') {
    return {
      caseId: record.id,
      storeId: record.storeId,
      stage: record.stage,
      href:
        record.stage === 'visit_required'
          ? `/visit-tracker?storeId=${record.storeId}&caseId=${record.id}`
          : `/stores/${record.storeId}?case=${record.id}`,
      label: record.stage === 'visit_required' ? 'Continue visit' : 'Continue work',
      reason: record.nextActionLabel || 'Plan, start, or finish the store follow-up.',
      mode: record.stage === 'visit_required' ? 'visit' : 'action',
    }
  }

  if (record.stage === 'ready_to_close') {
    return {
      caseId: record.id,
      storeId: record.storeId,
      stage: record.stage,
      href: `/queue?case=${record.id}&close=1`,
      label: 'Close work item',
      reason: record.nextActionLabel || 'All blockers are clear and the case can be closed.',
      mode: 'close',
    }
  }

  return {
    caseId: record.id,
    storeId: record.storeId,
    stage: record.stage,
    href: `/stores/${record.storeId}?case=${record.id}`,
    label: 'View case',
    reason: record.lastUpdateSummary || 'Review the closed timeline.',
    mode: 'view',
  }
}

export function sortQueueCases(records: QueueCaseRecord[]): QueueCaseRecord[] {
  return [...records].sort((left, right) => {
    const stageDiff = STAGE_PRIORITY[left.stage] - STAGE_PRIORITY[right.stage]
    if (stageDiff !== 0) return stageDiff

    const severityDiff = SEVERITY_PRIORITY[left.severity] - SEVERITY_PRIORITY[right.severity]
    if (severityDiff !== 0) return severityDiff

    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER
    if (leftDue !== rightDue) return leftDue - rightDue

    const leftUpdated = left.updatedAt ? new Date(left.updatedAt).getTime() : 0
    const rightUpdated = right.updatedAt ? new Date(right.updatedAt).getTime() : 0
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated

    return left.storeName.localeCompare(right.storeName)
  })
}

export function groupQueueCases(records: QueueCaseRecord[]) {
  const grouped = new Map<TfsCaseStage, QueueCaseRecord[]>()

  for (const stage of queueSectionOrder) {
    grouped.set(stage, [])
  }

  for (const record of sortQueueCases(records)) {
    const bucket = grouped.get(record.stage)
    if (bucket) {
      bucket.push(record)
    } else {
      grouped.set(record.stage, [record])
    }
  }

  return grouped
}

export function deriveCaseStageFromIncident(input: {
  status: string | null | undefined
  intakeSource: TfsIntakeSource
}): TfsCaseStage {
  const normalizedStatus = String(input.status || '').trim().toLowerCase()

  if (normalizedStatus === 'closed' || normalizedStatus === 'cancelled') return 'closed'
  if (input.intakeSource === 'store_portal') return 'new_submission'
  if (normalizedStatus === 'actions_in_progress') return 'action_agreed'
  if (normalizedStatus === 'under_investigation') return 'under_review'
  return 'under_review'
}

export function deriveCaseStageFromStoreAction(input: {
  status: string | null | undefined
  dueAt: string | null | undefined
}): TfsCaseStage {
  const normalizedStatus = String(input.status || '').trim().toLowerCase()
  if (normalizedStatus === 'complete' || normalizedStatus === 'cancelled') return 'closed'

  const dueTime = input.dueAt ? new Date(input.dueAt).getTime() : Number.NaN
  const isOverdue = Number.isFinite(dueTime) && dueTime < Date.now()
  return isOverdue ? 'awaiting_follow_up' : 'action_agreed'
}

export function deriveDefaultNextAction(input: {
  stage: TfsCaseStage
  intakeSource: TfsIntakeSource
  reviewOutcome?: TfsReviewOutcome | null
}): { code: string; label: string } {
  if (input.stage === 'new_submission') {
    return {
      code: 'review_submission',
      label: input.intakeSource === 'store_portal' ? 'Review portal submission' : 'Review work item',
    }
  }
  if (input.stage === 'under_review') {
    return { code: 'continue_review', label: 'Continue review' }
  }
  if (input.stage === 'action_agreed') {
    return { code: 'complete_follow_up', label: 'Complete follow-up action' }
  }
  if (input.stage === 'visit_required') {
    return { code: 'plan_visit', label: 'Plan or start visit' }
  }
  if (input.stage === 'awaiting_follow_up') {
    return { code: 'continue_follow_up', label: 'Continue follow-up' }
  }
  if (input.stage === 'ready_to_close') {
    return { code: 'close_case', label: 'Close work item' }
  }
  return { code: 'view_case', label: 'View case' }
}
