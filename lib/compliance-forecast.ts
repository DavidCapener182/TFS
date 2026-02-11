export type FRAStatus = 'up_to_date' | 'due' | 'overdue' | 'required'

export interface ForecastStoreInput {
  id: string
  store_name: string
  store_code: string | null
  region: string | null
  compliance_audit_1_date: string | null
  compliance_audit_1_overall_pct: number | null
  compliance_audit_2_date: string | null
  compliance_audit_2_overall_pct: number | null
  fire_risk_assessment_date: string | null
  compliance_audit_2_planned_date: string | null
}

export interface StoreRiskForecast {
  storeId: string
  storeName: string
  storeCode: string | null
  region: string | null
  riskScore: number
  probability: number
  riskBand: 'low' | 'medium' | 'high'
  openIncidents: number
  overdueActions: number
  fraStatus: FRAStatus
  latestAuditScore: number | null
  plannedDate: string | null
  drivers: string[]
}

export interface ComplianceForecastResult {
  highRiskCount: number
  mediumRiskCount: number
  lowRiskCount: number
  avgRiskScore: number
  stores: StoreRiskForecast[]
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const FRA_DUE_WINDOW_DAYS = 20

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

function getDaysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / ONE_DAY_MS)
}

export function getFRAStatusFromDate(
  fraDate: string | null,
  referenceDateInput?: Date
): FRAStatus {
  if (!fraDate) return 'required'

  const referenceDate = new Date(referenceDateInput || new Date())
  referenceDate.setHours(0, 0, 0, 0)

  const lastFraDate = parseDate(fraDate)
  if (!lastFraDate) return 'required'

  const nextDue = new Date(lastFraDate)
  nextDue.setMonth(nextDue.getMonth() + 12)
  nextDue.setHours(0, 0, 0, 0)

  const daysUntilDue = getDaysBetween(nextDue, referenceDate)
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= FRA_DUE_WINDOW_DAYS) return 'due'
  return 'up_to_date'
}

function getLatestAuditScore(store: ForecastStoreInput): number | null {
  const candidates: Array<{ date: Date; score: number }> = []
  const audit1Date = parseDate(store.compliance_audit_1_date)
  const audit2Date = parseDate(store.compliance_audit_2_date)

  if (audit1Date && typeof store.compliance_audit_1_overall_pct === 'number') {
    candidates.push({ date: audit1Date, score: store.compliance_audit_1_overall_pct })
  }

  if (audit2Date && typeof store.compliance_audit_2_overall_pct === 'number') {
    candidates.push({ date: audit2Date, score: store.compliance_audit_2_overall_pct })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.date.getTime() - a.date.getTime())
  return candidates[0].score
}

function getRiskBand(riskScore: number): 'low' | 'medium' | 'high' {
  if (riskScore >= 70) return 'high'
  if (riskScore >= 45) return 'medium'
  return 'low'
}

export function computeComplianceForecast(
  stores: ForecastStoreInput[],
  options?: {
    openIncidentsByStore?: Record<string, number>
    overdueActionsByStore?: Record<string, number>
    referenceDate?: Date
  }
): ComplianceForecastResult {
  const openIncidentsByStore = options?.openIncidentsByStore || {}
  const overdueActionsByStore = options?.overdueActionsByStore || {}
  const referenceDate = new Date(options?.referenceDate || new Date())
  referenceDate.setHours(0, 0, 0, 0)

  const forecasts = stores.map((store) => {
    const drivers: string[] = []
    const openIncidents = openIncidentsByStore[store.id] || 0
    const overdueActions = overdueActionsByStore[store.id] || 0
    const fraStatus = getFRAStatusFromDate(store.fire_risk_assessment_date, referenceDate)
    const latestAuditScore = getLatestAuditScore(store)
    const plannedDateObj = parseDate(store.compliance_audit_2_planned_date)

    let riskScore = 15

    if (latestAuditScore === null) {
      riskScore += 25
      drivers.push('No recent audit score recorded')
    } else if (latestAuditScore < 80) {
      const shortfall = 80 - latestAuditScore
      riskScore += 28 + Math.min(18, shortfall * 0.7)
      drivers.push(`Latest audit below pass threshold (${latestAuditScore.toFixed(0)}%)`)
    } else if (latestAuditScore < 85) {
      riskScore += 8
      drivers.push(`Latest audit margin is narrow (${latestAuditScore.toFixed(0)}%)`)
    }

    if (fraStatus === 'overdue') {
      riskScore += 30
      drivers.push('FRA is overdue')
    } else if (fraStatus === 'required') {
      riskScore += 24
      drivers.push('No in-date FRA recorded')
    } else if (fraStatus === 'due') {
      riskScore += 12
      drivers.push(`FRA expires within ${FRA_DUE_WINDOW_DAYS} days`)
    }

    if (overdueActions > 0) {
      riskScore += Math.min(28, overdueActions * 7)
      drivers.push(`${overdueActions} overdue action${overdueActions !== 1 ? 's' : ''}`)
    }

    if (openIncidents > 0) {
      riskScore += Math.min(24, openIncidents * 6)
      drivers.push(`${openIncidents} open incident${openIncidents !== 1 ? 's' : ''}`)
    }

    if (plannedDateObj) {
      const daysUntilVisit = getDaysBetween(plannedDateObj, referenceDate)
      if (daysUntilVisit >= 0 && daysUntilVisit <= 14) {
        riskScore -= 10
        drivers.push('Planned compliance visit scheduled within 14 days')
      }
    }

    const audit1Date = parseDate(store.compliance_audit_1_date)
    const audit2Date = parseDate(store.compliance_audit_2_date)
    const mostRecentAuditDate = [audit1Date, audit2Date]
      .filter((date): date is Date => !!date)
      .sort((a, b) => b.getTime() - a.getTime())[0]

    if (mostRecentAuditDate && latestAuditScore !== null && latestAuditScore >= 80) {
      const daysSinceAudit = getDaysBetween(referenceDate, mostRecentAuditDate)
      if (daysSinceAudit >= 0 && daysSinceAudit <= 30) {
        riskScore -= 8
        drivers.push('Strong recent audit completion')
      }
    }

    const boundedRisk = Math.max(0, Math.min(99, Math.round(riskScore)))
    const riskBand = getRiskBand(boundedRisk)

    return {
      storeId: store.id,
      storeName: store.store_name,
      storeCode: store.store_code,
      region: store.region,
      riskScore: boundedRisk,
      probability: boundedRisk,
      riskBand,
      openIncidents,
      overdueActions,
      fraStatus,
      latestAuditScore,
      plannedDate: store.compliance_audit_2_planned_date,
      drivers: drivers.slice(0, 4),
    } satisfies StoreRiskForecast
  })

  const sorted = forecasts.sort((a, b) => b.riskScore - a.riskScore)
  const highRiskCount = sorted.filter((s) => s.riskBand === 'high').length
  const mediumRiskCount = sorted.filter((s) => s.riskBand === 'medium').length
  const lowRiskCount = sorted.filter((s) => s.riskBand === 'low').length
  const avgRiskScore = sorted.length > 0
    ? Math.round(sorted.reduce((sum, store) => sum + store.riskScore, 0) / sorted.length)
    : 0

  return {
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    avgRiskScore,
    stores: sorted,
  }
}
