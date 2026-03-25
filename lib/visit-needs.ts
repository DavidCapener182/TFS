export const STORE_VISIT_TYPE_OPTIONS = [
  {
    value: 'action_led',
    label: 'Action-led visit',
    description: 'Triggered by current loss prevention actions or incidents.',
  },
  {
    value: 'planned',
    label: 'Planned route visit',
    description: 'Completed as part of a scheduled route or arranged visit.',
  },
  {
    value: 'random_area',
    label: 'Random in-area visit',
    description: 'Officer called in while already working nearby.',
  },
  {
    value: 'follow_up',
    label: 'Follow-up visit',
    description: 'Return visit to check previous concerns or actions.',
  },
] as const

export const STORE_VISIT_ACTIVITY_OPTIONS = [
  {
    key: 'checked_banking',
    label: 'Checked banking',
    description: 'Verified banking paperwork, cash handling, or deposit controls.',
  },
  {
    key: 'completed_till_checks',
    label: 'Till checks',
    description: 'Checked tills, tills balances, or cash handling controls.',
  },
  {
    key: 'completed_line_checks',
    label: 'Line checks',
    description: 'Reviewed line checks, spot checks, or customer-facing controls.',
  },
  {
    key: 'supported_investigation',
    label: 'Investigation work',
    description: 'Supported or progressed a theft, fraud, or conduct investigation.',
  },
  {
    key: 'reviewed_cctv_or_alarm',
    label: 'CCTV / alarm review',
    description: 'Checked CCTV coverage, alarm usage, or security equipment.',
  },
  {
    key: 'reviewed_loss_controls',
    label: 'Loss controls review',
    description: 'Reviewed shrink controls, hotspots, and in-store LP standards.',
  },
] as const

export type StoreVisitType = (typeof STORE_VISIT_TYPE_OPTIONS)[number]['value']
export type StoreVisitActivityKey = (typeof STORE_VISIT_ACTIVITY_OPTIONS)[number]['key']
export type StoreVisitNeedLevel = 'none' | 'monitor' | 'needed' | 'urgent'

export interface VisitNeedActionInput {
  title?: string | null
  description?: string | null
  sourceFlaggedItem?: string | null
  priority?: string | null
  status?: string | null
  dueDate?: string | null
  createdAt?: string | null
}

export interface VisitNeedIncidentInput {
  summary?: string | null
  description?: string | null
  category?: string | null
  severity?: string | null
  status?: string | null
  occurredAt?: string | null
}

export interface StoreVisitNeedDriver {
  label: string
  points: number
  source: 'action' | 'incident' | 'mitigation'
}

export interface StoreVisitNeedAssessment {
  score: number
  level: StoreVisitNeedLevel
  needsVisit: boolean
  reasons: string[]
  drivers: StoreVisitNeedDriver[]
  relevantActionCount: number
  relevantIncidentCount: number
}

interface ComputeStoreVisitNeedInput {
  actions: VisitNeedActionInput[]
  incidents: VisitNeedIncidentInput[]
  lastVisitAt?: string | null
  nextPlannedVisitDate?: string | null
  now?: string | Date
}

type RiskRule = {
  label: string
  points: number
  pattern: RegExp
}

const ACTION_RISK_RULES: RiskRule[] = [
  {
    label: 'Internal theft or fraud risk is open',
    points: 34,
    pattern: /\b(internal theft|employee theft|dishonesty|fraud|refund abuse|void abuse)\b/i,
  },
  {
    label: 'High theft or shrink concern is open',
    points: 28,
    pattern: /\b(high theft|theft|shoplift|shoplifting|shrink|stock loss|stock discrepancy)\b/i,
  },
  {
    label: 'Banking discrepancy or cash control issue is open',
    points: 26,
    pattern: /\b(banking|bank discrepancy|cash discrepancy|cash loss|cash handling|deposit|safe count)\b/i,
  },
  {
    label: 'Till control issue is open',
    points: 20,
    pattern: /\b(till discrepancy|till check|cash drawer|till|tender control)\b/i,
  },
  {
    label: 'Security system or CCTV issue is open',
    points: 18,
    pattern: /\b(cctv|alarm|security gate|eas|tagging|door guard|security system)\b/i,
  },
  {
    label: 'Line check or store-floor control issue is open',
    points: 14,
    pattern: /\b(line check|line checks|receipt check|queue control|floorwalk|floor walk)\b/i,
  },
  {
    label: 'Investigation support is still required',
    points: 16,
    pattern: /\b(investigation|investigations|interview|statement|case file)\b/i,
  },
]

const INCIDENT_RISK_RULES: RiskRule[] = [
  {
    label: 'Security incident needs follow-up',
    points: 22,
    pattern: /\b(security|theft|shoplift|shoplifting|burglary|robbery|fraud|assault|violence)\b/i,
  },
  {
    label: 'Cash handling incident needs follow-up',
    points: 20,
    pattern: /\b(banking|cash|deposit|safe|till discrepancy|cash loss)\b/i,
  },
  {
    label: 'Investigation-led incident needs support',
    points: 16,
    pattern: /\b(investigation|interview|witness|statement|disciplinary)\b/i,
  },
]

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysSince(value: string | Date | null | undefined, now: Date): number | null {
  const parsed = parseDate(value)
  if (!parsed) return null
  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
}

function daysUntil(value: string | Date | null | undefined, now: Date): number | null {
  const parsed = parseDate(value)
  if (!parsed) return null
  return Math.ceil((parsed.getTime() - now.getTime()) / 86_400_000)
}

function clampScore(value: number): number {
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

function normalizeText(...values: Array<string | null | undefined>): string {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
}

function isActionOpen(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized !== 'complete' && normalized !== 'cancelled'
}

function isIncidentOpen(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return !['closed', 'cancelled'].includes(normalized)
}

function getActionPriorityBonus(priority: string | null | undefined): number {
  const normalized = String(priority || '').trim().toLowerCase()
  if (normalized === 'urgent') return 10
  if (normalized === 'high') return 6
  if (normalized === 'medium') return 2
  return 0
}

function getIncidentSeverityBonus(severity: string | null | undefined): number {
  const normalized = String(severity || '').trim().toLowerCase()
  if (normalized === 'critical') return 16
  if (normalized === 'high') return 10
  if (normalized === 'medium') return 4
  return 0
}

function findHighestRule(text: string, rules: RiskRule[]): RiskRule | null {
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      return rule
    }
  }
  return null
}

export function getStoreVisitTypeLabel(value: StoreVisitType): string {
  return STORE_VISIT_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'Visit'
}

export function getStoreVisitActivityLabel(value: StoreVisitActivityKey): string {
  return STORE_VISIT_ACTIVITY_OPTIONS.find((option) => option.key === value)?.label || value
}

export function getStoreVisitNeedLevelLabel(level: StoreVisitNeedLevel): string {
  if (level === 'urgent') return 'Urgent'
  if (level === 'needed') return 'Visit Needed'
  if (level === 'monitor') return 'Monitor'
  return 'No Current Need'
}

export function computeStoreVisitNeed({
  actions,
  incidents,
  lastVisitAt,
  nextPlannedVisitDate,
  now = new Date(),
}: ComputeStoreVisitNeedInput): StoreVisitNeedAssessment {
  const referenceDate = parseDate(now) || new Date()
  const positiveDrivers: StoreVisitNeedDriver[] = []
  const mitigationDrivers: StoreVisitNeedDriver[] = []

  const openActions = actions.filter((action) => isActionOpen(action.status))
  const openIncidents = incidents.filter((incident) => isIncidentOpen(incident.status))

  let relevantActionCount = 0
  let relevantIncidentCount = 0

  for (const action of openActions) {
    const combined = normalizeText(action.title, action.sourceFlaggedItem, action.description)
    const highestRule = findHighestRule(combined, ACTION_RISK_RULES)
    const priorityBonus = getActionPriorityBonus(action.priority)
    const overdueDays = daysSince(action.dueDate, referenceDate)
    const isOverdue = overdueDays !== null && overdueDays > 0

    if (highestRule) {
      positiveDrivers.push({
        label: highestRule.label,
        points: highestRule.points,
        source: 'action',
      })
      relevantActionCount += 1
    }

    if (priorityBonus > 0) {
      positiveDrivers.push({
        label: normalizedPriorityLabel(action.priority),
        points: priorityBonus,
        source: 'action',
      })
    }

    if (isOverdue) {
      positiveDrivers.push({
        label: 'Overdue open LP action is still unresolved',
        points: 6,
        source: 'action',
      })
    }
  }

  for (const incident of openIncidents) {
    const combined = normalizeText(incident.category, incident.summary, incident.description)
    const highestRule = findHighestRule(combined, INCIDENT_RISK_RULES)
    const severityBonus = getIncidentSeverityBonus(incident.severity)

    if (highestRule) {
      positiveDrivers.push({
        label: highestRule.label,
        points: highestRule.points,
        source: 'incident',
      })
      relevantIncidentCount += 1
    }

    if (String(incident.category || '').trim().toLowerCase() === 'security') {
      positiveDrivers.push({
        label: 'Open security incident is active at the store',
        points: 8,
        source: 'incident',
      })
      relevantIncidentCount += 1
    }

    if (severityBonus > 0) {
      positiveDrivers.push({
        label: normalizedSeverityLabel(incident.severity),
        points: severityBonus,
        source: 'incident',
      })
    }
  }

  if (relevantActionCount > 1) {
    positiveDrivers.push({
      label: 'Multiple LP actions are open at the store',
      points: Math.min(18, (relevantActionCount - 1) * 4),
      source: 'action',
    })
  }

  if (relevantIncidentCount > 1) {
    positiveDrivers.push({
      label: 'Multiple incidents are driving follow-up',
      points: Math.min(18, (relevantIncidentCount - 1) * 6),
      source: 'incident',
    })
  }

  const daysFromLastVisit = daysSince(lastVisitAt, referenceDate)
  if (daysFromLastVisit !== null) {
    if (daysFromLastVisit <= 7) {
      mitigationDrivers.push({
        label: 'Store was visited in the last 7 days',
        points: -20,
        source: 'mitigation',
      })
    } else if (daysFromLastVisit <= 14) {
      mitigationDrivers.push({
        label: 'Store was visited in the last 14 days',
        points: -14,
        source: 'mitigation',
      })
    } else if (daysFromLastVisit <= 30) {
      mitigationDrivers.push({
        label: 'Store was visited in the last 30 days',
        points: -8,
        source: 'mitigation',
      })
    }
  }

  const daysToPlannedVisit = daysUntil(nextPlannedVisitDate, referenceDate)
  if (daysToPlannedVisit !== null && daysToPlannedVisit >= 0) {
    if (daysToPlannedVisit <= 7) {
      mitigationDrivers.push({
        label: 'A visit is already planned within 7 days',
        points: -14,
        source: 'mitigation',
      })
    } else if (daysToPlannedVisit <= 14) {
      mitigationDrivers.push({
        label: 'A visit is already planned within 14 days',
        points: -8,
        source: 'mitigation',
      })
    }
  }

  const drivers = [...positiveDrivers, ...mitigationDrivers]
  const score = clampScore(drivers.reduce((total, driver) => total + driver.points, 0))

  let level: StoreVisitNeedLevel = 'none'
  if (score >= 70) level = 'urgent'
  else if (score >= 40) level = 'needed'
  else if (score >= 15) level = 'monitor'

  const reasons = Array.from(
    new Set(
      positiveDrivers
        .sort((a, b) => b.points - a.points)
        .map((driver) => driver.label)
    )
  ).slice(0, 3)

  return {
    score,
    level,
    needsVisit: level === 'urgent' || level === 'needed',
    reasons,
    drivers,
    relevantActionCount,
    relevantIncidentCount,
  }
}

function normalizedPriorityLabel(priority: string | null | undefined): string {
  const normalized = String(priority || '').trim().toLowerCase()
  if (normalized === 'urgent') return 'Urgent action is open'
  if (normalized === 'high') return 'High-priority action is open'
  if (normalized === 'medium') return 'Medium-priority action is open'
  return 'Open action is active'
}

function normalizedSeverityLabel(severity: string | null | undefined): string {
  const normalized = String(severity || '').trim().toLowerCase()
  if (normalized === 'critical') return 'Critical incident severity is active'
  if (normalized === 'high') return 'High-severity incident is active'
  if (normalized === 'medium') return 'Medium-severity incident is active'
  return 'Incident is active'
}
