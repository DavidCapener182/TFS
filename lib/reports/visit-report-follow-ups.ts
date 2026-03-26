import type {
  TargetedTheftVisitPayload,
  VisitReportIncidentPerson,
  VisitReportRiskLevel,
} from '@/lib/reports/visit-report-types'
import type {
  StoreVisitActivityDetails,
  StoreVisitActivityKey,
  StoreVisitActivityPayloads,
  StoreVisitNeedLevel,
  StoreVisitType,
} from '@/lib/visit-needs'
import type { FaActionPriority, FaSeverity } from '@/types/db'

const SOURCE_MARKER_PREFIX = 'Source visit report ID:'

type VisitReportStoreVisitDraft = {
  visitType: StoreVisitType
  visitedAt: string
  completedActivityKeys: StoreVisitActivityKey[]
  completedActivityDetails: StoreVisitActivityDetails
  completedActivityPayloads: StoreVisitActivityPayloads
  notes: string | null
  followUpRequired: boolean
  needScoreSnapshot: number
  needLevelSnapshot: StoreVisitNeedLevel
  needReasonsSnapshot: string[]
}

function trimText(value: string | null | undefined): string {
  return String(value || '').trim()
}

function joinSections(parts: Array<string | null | undefined>): string {
  return parts.map(trimText).filter(Boolean).join('\n\n')
}

function truncateText(value: string, maxLength = 280): string {
  const trimmed = trimText(value)
  if (!trimmed) return ''
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

function formatIncidentPersonRole(value: VisitReportIncidentPerson['role']): string {
  if (value === 'employee') return 'Employee'
  if (value === 'contractor') return 'Contractor'
  if (value === 'other') return 'Unknown'
  return 'Public'
}

function normalizeVisitReportPeople(
  payload: TargetedTheftVisitPayload
): Array<{
  name: string | null
  role: string
  involvement: string | null
  injured: boolean
  injuryDetails: string | null
}> {
  const structuredPeople = payload.incidentPeople.people
    .map((person) => ({
      name: trimText(person.name) || null,
      role: formatIncidentPersonRole(person.role),
      involvement: trimText(person.involvement) || null,
      injured: Boolean(person.injured || trimText(person.injuryDetails)),
      injuryDetails: trimText(person.injuryDetails) || null,
    }))
    .filter((person) => person.name || person.involvement || person.injured)

  if (structuredPeople.length > 0) {
    return structuredPeople
  }

  return [
    {
      name: null,
      role: 'Public',
      involvement: 'Public / offender involvement captured via targeted theft visit report.',
      injured: false,
      injuryDetails: null,
    },
  ]
}

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value)
}

function hasRecommendationFlags(payload: TargetedTheftVisitPayload): boolean {
  return Object.values(payload.recommendations.physical).some(Boolean)
    || Object.values(payload.recommendations.operational).some(Boolean)
    || Object.values(payload.recommendations.intelligence).some(Boolean)
    || Object.values(payload.recommendations.deterrence).some(Boolean)
}

function addActivity(
  activityKeys: StoreVisitActivityKey[],
  activityDetails: StoreVisitActivityDetails,
  key: StoreVisitActivityKey,
  sections: Array<string | null | undefined>
) {
  const detailText = joinSections(sections)
  if (!detailText) return
  activityKeys.push(key)
  activityDetails[key] = detailText
}

function getRiskNeedScore(riskRating: VisitReportRiskLevel | ''): number {
  if (riskRating === 'critical') return 92
  if (riskRating === 'high') return 78
  if (riskRating === 'medium') return 58
  if (riskRating === 'low') return 26
  return 0
}

export function buildVisitReportSourceMarker(reportId: string): string {
  return `${SOURCE_MARKER_PREFIX} ${reportId}`
}

export function toIncidentSeverity(
  riskRating: TargetedTheftVisitPayload['riskRating']
): FaSeverity {
  if (riskRating === 'critical') return 'critical'
  if (riskRating === 'high') return 'high'
  if (riskRating === 'medium') return 'medium'
  return 'low'
}

export function toActionPriority(
  riskRating: TargetedTheftVisitPayload['riskRating']
): FaActionPriority {
  if (riskRating === 'critical') return 'urgent'
  if (riskRating === 'high') return 'high'
  if (riskRating === 'medium') return 'medium'
  return 'low'
}

export function buildVisitReportIncidentMeta(params: {
  reportId: string
  payload: TargetedTheftVisitPayload
}) {
  const { reportId, payload } = params
  const people = normalizeVisitReportPeople(payload)
  const primaryPersonType = people[0]?.role || 'Public'

  return {
    source: 'visit_report',
    visit_report_id: reportId,
    person_type: primaryPersonType,
    visited_by: trimText(payload.signOff.visitedBy) || trimText(payload.preparedBy) || null,
    store_representative: trimText(payload.signOff.storeRepresentative) || trimText(payload.storeManager) || null,
    same_offenders_suspected: payload.incidentOverview.sameOffendersSuspected,
    violence_involved: payload.incidentOverview.violenceInvolved,
    people,
  }
}

export function buildVisitReportInjuryDetails(payload: TargetedTheftVisitPayload) {
  const injuredPeople = normalizeVisitReportPeople(payload).filter((person) => person.injured)
  const injurySummary = trimText(payload.incidentPeople.injurySummary)
  const someoneInjured =
    payload.incidentPeople.someoneInjured ||
    injuredPeople.length > 0 ||
    injurySummary.length > 0

  return {
    source: 'visit_report',
    incident_type: 'Targeted Theft Visit',
    someone_injured: someoneInjured,
    injury_summary: injurySummary || null,
    first_aid_action: someoneInjured ? 'See visit report injury summary.' : 'No injury reported.',
    injured_people: injuredPeople,
  }
}

export function getVisitReportOccurredAt(params: {
  visitDate: string
  payload: TargetedTheftVisitPayload
  fallbackIso?: string | null
}): string {
  const { visitDate, payload, fallbackIso } = params
  const preferredTime = trimText(payload.timeOut) || trimText(payload.timeIn)

  if (visitDate && isValidTime(preferredTime)) {
    const combined = new Date(`${visitDate}T${preferredTime}:00.000Z`)
    if (!Number.isNaN(combined.getTime())) {
      return combined.toISOString()
    }
  }

  if (visitDate) {
    const midday = new Date(`${visitDate}T12:00:00.000Z`)
    if (!Number.isNaN(midday.getTime())) {
      return midday.toISOString()
    }
  }

  if (fallbackIso) {
    const parsedFallback = new Date(fallbackIso)
    if (!Number.isNaN(parsedFallback.getTime())) {
      return parsedFallback.toISOString()
    }
  }

  return new Date().toISOString()
}

export function getVisitReportFollowUpRequired(
  payload: TargetedTheftVisitPayload
): boolean {
  return payload.riskRating === 'critical'
    || payload.riskRating === 'high'
    || hasRecommendationFlags(payload)
    || trimText(payload.recommendations.details).length > 0
}

export function getVisitReportNeedSnapshot(
  payload: TargetedTheftVisitPayload
): {
  score: number
  level: StoreVisitNeedLevel
  reasons: string[]
} {
  const score = getRiskNeedScore(payload.riskRating)
  const followUpRequired = getVisitReportFollowUpRequired(payload)
  const reasons: string[] = []

  if (payload.riskRating) {
    reasons.push(`Risk rating recorded as ${payload.riskRating.toUpperCase()}.`)
  }
  if (trimText(payload.recommendations.details)) {
    reasons.push('Report recommendations still require store follow-up.')
  } else if (hasRecommendationFlags(payload)) {
    reasons.push('Structured LP recommendations were captured for follow-up.')
  }

  if (!followUpRequired) {
    return {
      score,
      level: score > 0 ? 'monitor' : 'none',
      reasons,
    }
  }

  if (payload.riskRating === 'critical' || payload.riskRating === 'high') {
    return { score, level: 'urgent', reasons }
  }

  if (payload.riskRating === 'medium') {
    return { score, level: 'needed', reasons }
  }

  return {
    score: Math.max(score, 35),
    level: 'monitor',
    reasons,
  }
}

export function buildVisitReportStoreVisitDraft(params: {
  reportId: string
  reportTitle: string
  visitDate: string
  summary: string | null
  payload: TargetedTheftVisitPayload
  fallbackVisitedAt?: string | null
}): VisitReportStoreVisitDraft {
  const {
    reportId,
    reportTitle,
    visitDate,
    summary,
    payload,
    fallbackVisitedAt,
  } = params
  const sourceMarker = buildVisitReportSourceMarker(reportId)
  const activityKeys: StoreVisitActivityKey[] = []
  const activityDetails: StoreVisitActivityDetails = {}
  const activityPayloads: StoreVisitActivityPayloads = {}
  const { score, level, reasons } = getVisitReportNeedSnapshot(payload)
  const followUpRequired = getVisitReportFollowUpRequired(payload)

  addActivity(activityKeys, activityDetails, 'supported_investigation', [
    summary ? `Visit summary: ${summary}` : null,
    trimText(payload.incidentOverview.summary)
      ? `Incident overview: ${trimText(payload.incidentOverview.summary)}`
      : null,
    trimText(payload.incidentOverview.primaryProducts)
      ? `Primary products: ${trimText(payload.incidentOverview.primaryProducts)}`
      : null,
    trimText(payload.incidentOverview.entryPoint)
      ? `Entry point / route: ${trimText(payload.incidentOverview.entryPoint)}`
      : null,
    trimText(payload.incidentOverview.incidentCount)
      ? `Recent incidents reviewed: ${trimText(payload.incidentOverview.incidentCount)}`
      : null,
  ])

  addActivity(activityKeys, activityDetails, 'reviewed_loss_controls', [
    trimText(payload.storeLayoutExposure.observations)
      ? `Layout exposure: ${trimText(payload.storeLayoutExposure.observations)}`
      : null,
    trimText(payload.productControlMeasures.atRiskSkus)
      ? `At-risk SKUs: ${trimText(payload.productControlMeasures.atRiskSkus)}`
      : null,
    trimText(payload.productControlMeasures.recommendations)
      ? `Control recommendations: ${trimText(payload.productControlMeasures.recommendations)}`
      : null,
    trimText(payload.immediateActionsTaken.actionsCompleted)
      ? `Immediate actions completed: ${trimText(payload.immediateActionsTaken.actionsCompleted)}`
      : null,
  ])

  addActivity(activityKeys, activityDetails, 'reviewed_cctv_or_alarm', [
    trimText(payload.cctvSurveillance.issuesIdentified)
      ? `CCTV / alarm issues: ${trimText(payload.cctvSurveillance.issuesIdentified)}`
      : null,
    payload.cctvSurveillance.facialIdentificationPossible
      ? 'Footage was assessed as capable of facial identification.'
      : null,
    payload.cctvSurveillance.cameraAnglesAppropriate
      ? 'Camera angle coverage was confirmed during the visit.'
      : null,
  ])

  addActivity(activityKeys, activityDetails, 'reviewed_security_procedures', [
    trimText(payload.staffSafetyResponse.responseDescription)
      ? `Team response reviewed: ${trimText(payload.staffSafetyResponse.responseDescription)}`
      : null,
    trimText(payload.communicationRadioUse.effectiveness)
      ? `Radio / communication effectiveness: ${trimText(payload.communicationRadioUse.effectiveness)}`
      : null,
    trimText(payload.environmentalExternalFactors.externalRisks)
      ? `External risk context: ${trimText(payload.environmentalExternalFactors.externalRisks)}`
      : null,
  ])

  addActivity(activityKeys, activityDetails, 'provided_store_support_or_training', [
    trimText(payload.staffPositioningBehaviour.observedBehaviour)
      ? `Observed team behaviour: ${trimText(payload.staffPositioningBehaviour.observedBehaviour)}`
      : null,
    trimText(payload.recommendations.details)
      ? `Recommendations issued: ${trimText(payload.recommendations.details)}`
      : null,
    trimText(payload.storeManager)
      ? `Store manager present: ${trimText(payload.storeManager)}`
      : null,
    trimText(payload.signOff.storeRepresentative)
      ? `Store representative sign-off: ${trimText(payload.signOff.storeRepresentative)}`
      : null,
  ])

  if (activityKeys.length === 0) {
    addActivity(activityKeys, activityDetails, 'other', [
      summary || reportTitle,
      trimText(payload.riskJustification)
        ? `Risk justification: ${trimText(payload.riskJustification)}`
        : null,
    ])
  }

  const notes = joinSections([
    `Created from final visit report: ${reportTitle}`,
    trimText(payload.immediateActionsTaken.actionsCompleted)
      ? `Actions agreed / completed:\n${truncateText(payload.immediateActionsTaken.actionsCompleted, 600)}`
      : null,
    trimText(payload.recommendations.details)
      ? `Recommended next steps:\n${truncateText(payload.recommendations.details, 600)}`
      : null,
    // Keep the source marker for traceability, but avoid dumping the full summary/PDF-style narrative into visit notes.
    sourceMarker,
  ]) || null

  return {
    visitType: 'action_led',
    visitedAt: getVisitReportOccurredAt({
      visitDate,
      payload,
      fallbackIso: fallbackVisitedAt || null,
    }),
    completedActivityKeys: activityKeys,
    completedActivityDetails: activityDetails,
    completedActivityPayloads: activityPayloads,
    notes,
    followUpRequired,
    needScoreSnapshot: score,
    needLevelSnapshot: level,
    needReasonsSnapshot: reasons,
  }
}
