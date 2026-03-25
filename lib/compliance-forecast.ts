import { formatStoreName } from '@/lib/store-display'

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

export interface RevisitRiskStoreInput {
  storeId: string
  storeName: string
  storeCode: string | null
  region: string | null
  startOfYearAuditScore: number | null
  openP1Actions: number
  openP2Actions: number
  openFireSafetyActions: number
  overdueP1Actions?: number
  openIncidents?: number
}

export interface RevisitRiskStoreForecast {
  storeId: string
  storeName: string
  storeCode: string | null
  region: string | null
  startOfYearAuditScore: number | null
  projectedEndOfYearScore: number | null
  openP1Actions: number
  openP2Actions: number
  openFireSafetyActions: number
  overdueP1Actions: number
  openIncidents: number
  riskScore: number
  isBorderlineStartScore: boolean
  predictedRevisit: boolean
  drivers: string[]
}

export interface RevisitRiskRadarPoint {
  axis: string
  risk: number
  target: number
  benchmark: number
}

export interface RevisitRiskForecastResult {
  storeCount: number
  atRiskStoreCount: number
  borderlineStoreCount: number
  predictedRevisitCount: number
  alreadyBelowThresholdCount: number
  openP1Count: number
  openP2Count: number
  overdueP1AtRiskCount: number
  storesWithOpenIncidentsAtRiskCount: number
  closeActionsTarget: number
  immediateActionTarget: number
  stores: RevisitRiskStoreForecast[]
  predictedStores: RevisitRiskStoreForecast[]
  alreadyBelowThresholdStores: RevisitRiskStoreForecast[]
  radar: RevisitRiskRadarPoint[]
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function toPercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0
  return clamp(Math.round((numerator / denominator) * 100), 0, 100)
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
      storeName: formatStoreName(store.store_name),
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

export function computeRevisitRiskForecast(
  stores: RevisitRiskStoreInput[]
): RevisitRiskForecastResult {
  const forecasts: RevisitRiskStoreForecast[] = stores.map((store) => {
    const drivers: string[] = []
    const startScore =
      typeof store.startOfYearAuditScore === 'number' && Number.isFinite(store.startOfYearAuditScore)
        ? clamp(store.startOfYearAuditScore, 0, 100)
        : null

    const openP1Actions = normalizeCount(store.openP1Actions)
    const openP2Actions = normalizeCount(store.openP2Actions)
    const openFireSafetyActions = normalizeCount(store.openFireSafetyActions)
    const overdueP1Actions = normalizeCount(store.overdueP1Actions || 0)
    const openIncidents = normalizeCount(store.openIncidents || 0)

    const isBorderlineStartScore = startScore !== null && startScore >= 80 && startScore < 85

    let riskScore = 10
    if (startScore === null) {
      riskScore += 30
      drivers.push('Start-of-Year audit score is missing')
    } else if (startScore < 80) {
      riskScore += 85
      drivers.push('Start-of-Year audit score is already below 80%')
    } else if (isBorderlineStartScore) {
      riskScore += 55 + (85 - startScore) * 8
      drivers.push('Start-of-Year score is in the 80-84% watch band')
      if (startScore < 82) {
        drivers.push('Very narrow margin to the 80% revisit threshold')
      }
    } else if (startScore < 90) {
      riskScore += 28 + (90 - startScore) * 3
    } else {
      riskScore += 10 + Math.max(0, 92 - startScore) * 1.5
    }

    if (openP1Actions > 0) {
      riskScore += Math.min(30, openP1Actions * 15)
      drivers.push(`${openP1Actions} open priority 1 action${openP1Actions !== 1 ? 's' : ''}`)
    }

    if (overdueP1Actions > 0) {
      riskScore += Math.min(24, overdueP1Actions * 12)
      drivers.push(`${overdueP1Actions} overdue P1 action${overdueP1Actions !== 1 ? 's' : ''}`)
    }

    if (openP2Actions > 0) {
      riskScore += Math.min(20, openP2Actions * 8)
      drivers.push(`${openP2Actions} open priority 2 action${openP2Actions !== 1 ? 's' : ''}`)
    }

    if (openFireSafetyActions > 0) {
      riskScore += Math.min(12, openFireSafetyActions * 3)
      drivers.push(
        `${openFireSafetyActions} unresolved compliance action${openFireSafetyActions !== 1 ? 's' : ''}`
      )
    }

    if (openIncidents > 0) {
      riskScore += Math.min(12, openIncidents * 4)
      drivers.push(`${openIncidents} open incident${openIncidents !== 1 ? 's' : ''} at this store`)
    }

    const projectedDrop = openP1Actions * 1.7 + openP2Actions * 0.9 + openFireSafetyActions * 0.35
    const projectedEndOfYearScore =
      startScore === null ? null : roundToOneDecimal(clamp(startScore - projectedDrop, 0, 100))

    const predictedRevisit =
      startScore !== null &&
      (startScore < 80 || (isBorderlineStartScore && projectedEndOfYearScore !== null && projectedEndOfYearScore < 80))

    if (predictedRevisit && isBorderlineStartScore) {
      drivers.push('Projected to drop below 80% by End-of-Year')
    }

    return {
      storeId: store.storeId,
      storeName: store.storeName,
      storeCode: store.storeCode,
      region: store.region,
      startOfYearAuditScore: startScore,
      projectedEndOfYearScore,
      openP1Actions,
      openP2Actions,
      openFireSafetyActions,
      overdueP1Actions,
      openIncidents,
      riskScore: clamp(Math.round(riskScore), 0, 99),
      isBorderlineStartScore,
      predictedRevisit,
      drivers: Array.from(new Set(drivers)).slice(0, 4),
    } satisfies RevisitRiskStoreForecast
  })

  const sorted = forecasts.sort((a, b) => {
    if (a.predictedRevisit !== b.predictedRevisit) return Number(b.predictedRevisit) - Number(a.predictedRevisit)
    if (a.riskScore !== b.riskScore) return b.riskScore - a.riskScore
    return a.storeName.localeCompare(b.storeName)
  })

  const borderlineStores = sorted.filter((store) => store.isBorderlineStartScore)
  const predictedStores = borderlineStores.filter((store) => store.predictedRevisit)
  const alreadyBelowThresholdStores = sorted.filter((store) =>
    typeof store.startOfYearAuditScore === 'number' ? store.startOfYearAuditScore < 80 : false
  )
  const atRiskStores = sorted.filter(
    (store) =>
      store.isBorderlineStartScore ||
      (typeof store.startOfYearAuditScore === 'number' ? store.startOfYearAuditScore < 80 : false)
  )
  const openP1Count = borderlineStores.reduce((sum, store) => sum + store.openP1Actions, 0)
  const openP2Count = borderlineStores.reduce((sum, store) => sum + store.openP2Actions, 0)
  const overdueP1AtRiskCount = atRiskStores.reduce((sum, store) => sum + store.overdueP1Actions, 0)
  const totalP1AtRiskCount = atRiskStores.reduce((sum, store) => sum + store.openP1Actions, 0)
  const storesWithOpenIncidentsAtRiskCount = atRiskStores.filter((store) => store.openIncidents > 0).length
  const closeActionsTarget = predictedStores.reduce(
    (sum, store) => sum + store.openP1Actions + store.openP2Actions,
    0
  )
  const immediateActionTarget = alreadyBelowThresholdStores.reduce(
    (sum, store) => sum + store.openP1Actions + store.openP2Actions,
    0
  )

  const storeCount = sorted.length
  const atRiskStoreCount = atRiskStores.length
  const borderlineStoreCount = borderlineStores.length
  const predictedRevisitCount = predictedStores.length
  const alreadyBelowThresholdCount = alreadyBelowThresholdStores.length

  const below80Pct = toPercent(alreadyBelowThresholdCount, Math.max(1, storeCount))
  const watchBandPct = toPercent(borderlineStoreCount, Math.max(1, storeCount))
  const predictedFailPct = toPercent(predictedRevisitCount, Math.max(1, borderlineStoreCount))
  const overdueP1Pct = toPercent(overdueP1AtRiskCount, Math.max(1, totalP1AtRiskCount))
  const incidentBurdenPct = toPercent(
    storesWithOpenIncidentsAtRiskCount,
    Math.max(1, atRiskStoreCount)
  )

  const radar: RevisitRiskRadarPoint[] = [
    {
      axis: 'Stores <80% (%)',
      risk: below80Pct,
      target: 5,
      benchmark: 5,
    },
    {
      axis: 'Stores 80-84% (%)',
      risk: watchBandPct,
      target: 15,
      benchmark: 15,
    },
    {
      axis: 'Predicted Fails (%)',
      risk: predictedFailPct,
      target: 20,
      benchmark: 20,
    },
    {
      axis: 'Overdue P1 Actions (%)',
      risk: overdueP1Pct,
      target: 15,
      benchmark: 15,
    },
    {
      axis: 'At-Risk Stores with Open Incidents (%)',
      risk: incidentBurdenPct,
      target: 25,
      benchmark: 25,
    },
  ]

  return {
    storeCount,
    atRiskStoreCount,
    borderlineStoreCount,
    predictedRevisitCount,
    alreadyBelowThresholdCount,
    openP1Count,
    openP2Count,
    overdueP1AtRiskCount,
    storesWithOpenIncidentsAtRiskCount,
    closeActionsTarget,
    immediateActionTarget,
    stores: sorted,
    predictedStores,
    alreadyBelowThresholdStores,
    radar,
  }
}
