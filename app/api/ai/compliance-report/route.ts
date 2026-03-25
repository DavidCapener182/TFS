import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type IncidentRecord = {
  id: string
  store_id: string | null
  status: string | null
  severity: string | null
  occurred_at: string | null
  created_at: string | null
  closed_at: string | null
  incident_category: string | null
  riddor_reportable: boolean | null
  persons_involved: unknown
}

type ActionRecord = {
  id: string
  status: string | null
  due_date: string | null
  priority: string | null
  source: 'incident' | 'store'
  store_id: string | null
}

const COMPLETED_ACTION_STATUSES = new Set(['complete', 'cancelled', 'closed'])

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeKey(value: unknown, fallback = 'unknown'): string {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized.length > 0 ? normalized : fallback
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function toMonthLabel(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!year || !month) return monthKey
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(new Date(year, month - 1, 1))
}

function sortObjectByValueDesc(input: Record<string, number>, limit?: number): Record<string, number> {
  const entries = Object.entries(input).sort(([, a], [, b]) => b - a)
  const limited = typeof limit === 'number' ? entries.slice(0, limit) : entries
  return Object.fromEntries(limited)
}

function toPersonType(value: unknown): string {
  if (!value || typeof value !== 'object') return 'unknown'
  const record = value as Record<string, unknown>
  const raw = record.person_type ?? record.personType
  return normalizeKey(raw, 'unknown')
}

function isChildIncident(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return Boolean(record.child_involved ?? record.childInvolved)
}

function isActionActiveStatus(value: unknown): boolean {
  return !COMPLETED_ACTION_STATUSES.has(normalizeKey(value))
}

function isDateBefore(date: Date | null, compareTo: Date): boolean {
  return Boolean(date && date.getTime() < compareTo.getTime())
}

function isDateBetweenInclusive(date: Date | null, start: Date, end: Date): boolean {
  if (!date) return false
  const ts = date.getTime()
  return ts >= start.getTime() && ts <= end.getTime()
}

function incrementCounter(counter: Record<string, number>, key: string, amount = 1) {
  counter[key] = (counter[key] || 0) + amount
}

export async function POST(request: NextRequest) {
  try {
    const { dashboardData } = await request.json()
    const supabase = createClient()
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current date context
    const today = new Date()
    const currentDate = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
    const currentYear = today.getFullYear()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const yearStart = new Date(today.getFullYear(), 0, 1)
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const next14Days = new Date(today)
    next14Days.setDate(next14Days.getDate() + 14)

    const todayDateOnly = new Date(today)
    todayDateOnly.setHours(0, 0, 0, 0)

    const auditStats = dashboardData?.auditStats || {}
    const storeActionStats = dashboardData?.storeActionStats || {}
    const combinedActionStats = dashboardData?.combinedActionStats || {}
    const complianceTracking = dashboardData?.complianceTracking || {}
    const fraStats = dashboardData?.fraStats || {}
    const complianceForecast = dashboardData?.complianceForecast || {}

    const [
      { data: incidentsRaw, error: incidentsError },
      { data: closedIncidentsRaw, error: closedIncidentsError },
      { data: investigationsRaw, error: investigationsError },
      { data: claimsRaw, error: claimsError },
      { data: incidentActionsRaw, error: incidentActionsError },
      { data: storeActionsRaw, error: storeActionsError },
    ] = await Promise.all([
      supabase
        .from('tfs_incidents')
        .select('id, store_id, status, severity, occurred_at, created_at, closed_at, incident_category, riddor_reportable, persons_involved'),
      supabase
        .from('tfs_closed_incidents')
        .select('id, store_id, status, severity, occurred_at, created_at, closed_at, incident_category, riddor_reportable, persons_involved'),
      supabase
        .from('tfs_investigations')
        .select('incident_id, root_cause, updated_at')
        .order('updated_at', { ascending: false })
        .limit(2000),
      supabase
        .from('tfs_claims')
        .select('id, status, received_date, store_id, incident_id'),
      supabase
        .from('tfs_actions')
        .select('id, status, due_date, priority, incident:tfs_incidents!tfs_actions_incident_id_fkey(store_id)'),
      supabase
        .from('tfs_store_actions')
        .select('id, status, due_date, priority, store_id')
        .not('status', 'eq', 'cancelled'),
    ])

    if (incidentsError) console.error('AI report incidents query failed:', incidentsError)
    if (closedIncidentsError) console.error('AI report closed incidents query failed:', closedIncidentsError)
    if (investigationsError) console.error('AI report investigations query failed:', investigationsError)
    if (claimsError) console.error('AI report claims query failed:', claimsError)
    if (incidentActionsError) console.error('AI report incident actions query failed:', incidentActionsError)
    if (storeActionsError) console.error('AI report store actions query failed:', storeActionsError)

    const allIncidentsRaw = ((incidentsRaw || []) as IncidentRecord[])
    const openIncidentsRecords = allIncidentsRaw.filter((incident) => normalizeKey(incident.status) !== 'closed')
    const legacyClosedRecords = allIncidentsRaw.filter((incident) => normalizeKey(incident.status) === 'closed')

    const dedupedClosedMap = new Map<string, IncidentRecord>()
    for (const incident of (closedIncidentsRaw || []) as IncidentRecord[]) {
      dedupedClosedMap.set(incident.id, incident)
    }
    for (const incident of legacyClosedRecords) {
      if (!dedupedClosedMap.has(incident.id)) {
        dedupedClosedMap.set(incident.id, incident)
      }
    }

    const closedIncidentsRecords = Array.from(dedupedClosedMap.values())
    const allIncidentRecords = [...openIncidentsRecords, ...closedIncidentsRecords]

    const claims = (claimsRaw || []) as Array<{ status: string | null; received_date: string | null; store_id: string | null }>
    const incidentActions: ActionRecord[] = ((incidentActionsRaw || []) as any[]).map((action) => {
      const incidentRel = Array.isArray(action?.incident) ? action.incident[0] : action?.incident
      return {
        id: action.id,
        status: action.status,
        due_date: action.due_date,
        priority: action.priority,
        source: 'incident',
        store_id: incidentRel?.store_id || null,
      }
    })

    const storeActions: ActionRecord[] = ((storeActionsRaw || []) as any[]).map((action) => ({
      id: action.id,
      status: action.status,
      due_date: action.due_date,
      priority: action.priority,
      source: 'store',
      store_id: action.store_id || null,
    }))

    const allActions = [...incidentActions, ...storeActions]

    const storeIdsFromIncidents = allIncidentRecords.map((incident) => incident.store_id).filter(Boolean) as string[]
    const storeIdsFromActions = allActions.map((action) => action.store_id).filter(Boolean) as string[]
    const uniqueStoreIds = [...new Set([...storeIdsFromIncidents, ...storeIdsFromActions])]

    let storeMap = new Map<string, { name: string; code: string | null }>()
    if (uniqueStoreIds.length > 0) {
      const { data: storesRaw, error: storesError } = await supabase
        .from('tfs_stores')
        .select('id, store_name, store_code')
        .in('id', uniqueStoreIds)

      if (storesError) {
        console.error('AI report stores query failed:', storesError)
      } else {
        storeMap = new Map<string, { name: string; code: string | null }>(
          (storesRaw || []).map((store: any) => [store.id, { name: store.store_name || 'Unknown', code: store.store_code || null }])
        )
      }
    }

    const topIncidentStores = (Array.isArray(dashboardData?.topStores) ? dashboardData.topStores : [])
      .slice(0, 5)
      .map((s: any) => ({
        store: s?.name || 'Unknown',
        storeCode: s?.code || null,
        incidents: Number(s?.count || 0),
      }))

    const topStoreActionStores = (Array.isArray(storeActionStats?.topStores) ? storeActionStats.topStores : [])
      .slice(0, 5)
      .map((s: any) => ({
        store: s?.name || 'Unknown',
        storeCode: s?.code || null,
        activeActions: Number(s?.count || 0),
        overdueActions: Number(s?.overdue || 0),
      }))

    const topForecastStores = (Array.isArray(complianceForecast?.stores) ? complianceForecast.stores : [])
      .slice(0, 5)
      .map((store: any) => ({
        store: store?.storeName || 'Unknown',
        code: store?.storeCode || null,
        region: store?.region || null,
        riskBand: store?.riskBand || null,
        riskScore: typeof store?.riskScore === 'number' ? store.riskScore : null,
        fraStatus: store?.fraStatus || null,
        latestAuditScore: typeof store?.latestAuditScore === 'number' ? store.latestAuditScore : null,
        overdueActions: Number(store?.overdueActions || 0),
        openIncidents: Number(store?.openIncidents || 0),
        drivers: Array.isArray(store?.drivers) ? store.drivers : [],
      }))

    const plannedRouteCount = Array.isArray(dashboardData?.plannedRoutes) ? dashboardData.plannedRoutes.length : 0
    const plannedStoreCount = Array.isArray(dashboardData?.plannedRoutes)
      ? dashboardData.plannedRoutes.reduce((sum: number, route: any) => {
          const stores = Array.isArray(route?.stores) ? route.stores.length : Number(route?.storeCount || 0)
          return sum + stores
        }, 0)
      : 0

    const incidentStatusCounts = allIncidentRecords.reduce((acc: Record<string, number>, incident) => {
      incrementCounter(acc, normalizeKey(incident.status))
      return acc
    }, {})

    const incidentSeverityCounts = allIncidentRecords.reduce((acc: Record<string, number>, incident) => {
      incrementCounter(acc, normalizeKey(incident.severity))
      return acc
    }, {})

    const incidentCategoryCounts = allIncidentRecords.reduce((acc: Record<string, number>, incident) => {
      incrementCounter(acc, normalizeKey(incident.incident_category))
      return acc
    }, {})

    const personsAffectedCounts = allIncidentRecords.reduce((acc: Record<string, number>, incident) => {
      incrementCounter(acc, toPersonType(incident.persons_involved))
      return acc
    }, {})

    const openIncidentsByStore = openIncidentsRecords.reduce((acc: Record<string, number>, incident) => {
      const storeId = incident.store_id
      if (!storeId) return acc
      incrementCounter(acc, storeId)
      return acc
    }, {})

    const topOpenIncidentStores = Object.entries(openIncidentsByStore)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([storeId, count]) => {
        const store = storeMap.get(storeId)
        return {
          store: store?.name || 'Unknown',
          storeCode: store?.code || null,
          openIncidents: count,
        }
      })

    const incidentMonthlyMap = new Map<string, { monthKey: string; month: string; incidents: number; open: number; closed: number; riddor: number; nearMiss: number }>()
    for (const incident of allIncidentRecords) {
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      if (!occurred) continue
      const monthKey = toMonthKey(occurred)
      if (!incidentMonthlyMap.has(monthKey)) {
        incidentMonthlyMap.set(monthKey, {
          monthKey,
          month: toMonthLabel(monthKey),
          incidents: 0,
          open: 0,
          closed: 0,
          riddor: 0,
          nearMiss: 0,
        })
      }
      const bucket = incidentMonthlyMap.get(monthKey)!
      bucket.incidents += 1
      if (normalizeKey(incident.status) === 'closed') bucket.closed += 1
      else bucket.open += 1
      if (incident.riddor_reportable) bucket.riddor += 1
      if (normalizeKey(incident.incident_category) === 'near_miss') bucket.nearMiss += 1
    }
    const incidentMonthlyTrend = Array.from(incidentMonthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
      .slice(-12)

    const highCritical30d = allIncidentRecords.filter((incident) => {
      const severity = normalizeKey(incident.severity)
      if (severity !== 'high' && severity !== 'critical') return false
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, thirtyDaysAgo, today)
    }).length

    const incidentCreatedThisMonth = allIncidentRecords.filter((incident) => {
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, monthStart, today)
    }).length

    const incidentCreatedYtd = allIncidentRecords.filter((incident) => {
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, yearStart, today)
    }).length

    const riddorTotal = allIncidentRecords.filter((incident) => Boolean(incident.riddor_reportable)).length
    const riddorMonth = allIncidentRecords.filter((incident) => {
      if (!incident.riddor_reportable) return false
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, monthStart, today)
    }).length
    const riddorYtd = allIncidentRecords.filter((incident) => {
      if (!incident.riddor_reportable) return false
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, yearStart, today)
    }).length

    const nearMissMonth = allIncidentRecords.filter((incident) => {
      if (normalizeKey(incident.incident_category) !== 'near_miss') return false
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, monthStart, today)
    }).length
    const nearMissYtd = allIncidentRecords.filter((incident) => {
      if (normalizeKey(incident.incident_category) !== 'near_miss') return false
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, yearStart, today)
    }).length

    const childIncidentsMonth = allIncidentRecords.filter((incident) => {
      if (!isChildIncident(incident.persons_involved)) return false
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, monthStart, today)
    }).length
    const childIncidentsYtd = allIncidentRecords.filter((incident) => {
      if (!isChildIncident(incident.persons_involved)) return false
      const occurred = parseDate(incident.occurred_at || incident.created_at)
      return isDateBetweenInclusive(occurred, yearStart, today)
    }).length

    const claimsStatusCounts = claims.reduce((acc: Record<string, number>, claim) => {
      incrementCounter(acc, normalizeKey(claim.status))
      return acc
    }, {})

    const claimsOpen = claims.filter((claim) => normalizeKey(claim.status) === 'open').length
    const claimsMonthlyMap = new Map<string, { monthKey: string; month: string; claims: number }>()
    for (const claim of claims) {
      const received = parseDate(claim.received_date)
      if (!received) continue
      const monthKey = toMonthKey(received)
      if (!claimsMonthlyMap.has(monthKey)) {
        claimsMonthlyMap.set(monthKey, { monthKey, month: toMonthLabel(monthKey), claims: 0 })
      }
      claimsMonthlyMap.get(monthKey)!.claims += 1
    }
    const claimsMonthlyTrend = Array.from(claimsMonthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
      .slice(-12)

    const latestRootCauseByIncident = new Map<string, string>()
    for (const investigation of (investigationsRaw || []) as Array<{ incident_id: string; root_cause: string | null }>) {
      if (!investigation?.incident_id || latestRootCauseByIncident.has(investigation.incident_id)) continue
      const rootCause = String(investigation.root_cause || '').trim()
      if (rootCause.length > 0) {
        latestRootCauseByIncident.set(investigation.incident_id, rootCause)
      }
    }

    const rootCauseCounts = allIncidentRecords.reduce((acc: Record<string, number>, incident) => {
      const rootCause = latestRootCauseByIncident.get(incident.id)
      if (rootCause) incrementCounter(acc, rootCause)
      return acc
    }, {})

    const actionsByStatus = allActions.reduce((acc: Record<string, number>, action) => {
      incrementCounter(acc, normalizeKey(action.status))
      return acc
    }, {})

    const actionsByPriority = allActions.reduce((acc: Record<string, number>, action) => {
      incrementCounter(acc, normalizeKey(action.priority))
      return acc
    }, {})

    const activeActions = allActions.filter((action) => isActionActiveStatus(action.status))
    const activeIncidentActions = incidentActions.filter((action) => isActionActiveStatus(action.status))
    const activeStoreActions = storeActions.filter((action) => isActionActiveStatus(action.status))

    const overdueActionsAll = activeActions.filter((action) => isDateBefore(parseDate(action.due_date), todayDateOnly))
    const dueNext14Days = activeActions.filter((action) =>
      isDateBetweenInclusive(parseDate(action.due_date), todayDateOnly, next14Days)
    ).length

    const actionByStoreCounts = activeActions.reduce((acc: Record<string, { active: number; overdue: number }>, action) => {
      const storeId = action.store_id
      if (!storeId) return acc
      if (!acc[storeId]) {
        acc[storeId] = { active: 0, overdue: 0 }
      }
      acc[storeId].active += 1
      if (isDateBefore(parseDate(action.due_date), todayDateOnly)) {
        acc[storeId].overdue += 1
      }
      return acc
    }, {})

    const topActionStores = Object.entries(actionByStoreCounts)
      .sort(([, a], [, b]) => {
        if (b.overdue !== a.overdue) return b.overdue - a.overdue
        return b.active - a.active
      })
      .slice(0, 5)
      .map(([storeId, counts]) => {
        const store = storeMap.get(storeId)
        return {
          store: store?.name || 'Unknown',
          storeCode: store?.code || null,
          activeActions: counts.active,
          overdueActions: counts.overdue,
        }
      })

    const actionsMonthlyMap = new Map<string, { monthKey: string; month: string; total: number; overdue: number; completed: number }>()
    for (const action of allActions) {
      const dueDate = parseDate(action.due_date)
      if (!dueDate) continue
      const monthKey = toMonthKey(dueDate)
      if (!actionsMonthlyMap.has(monthKey)) {
        actionsMonthlyMap.set(monthKey, { monthKey, month: toMonthLabel(monthKey), total: 0, overdue: 0, completed: 0 })
      }
      const bucket = actionsMonthlyMap.get(monthKey)!
      bucket.total += 1
      if (isActionActiveStatus(action.status) && isDateBefore(dueDate, todayDateOnly)) {
        bucket.overdue += 1
      }
      if (!isActionActiveStatus(action.status)) {
        bucket.completed += 1
      }
    }
    const actionsMonthlyTrend = Array.from(actionsMonthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
      .slice(-12)

    const intelligenceSnapshot = {
      asOf: currentDate,
      timeline: {
        dayOfYear,
        year: currentYear,
        auditCycle: 'Round 1 Jan-Jun, Round 2 Jul-Dec',
      },
      incidentsPage: {
        totalIncidents: allIncidentRecords.length,
        openIncidents: openIncidentsRecords.length,
        closedIncidents: closedIncidentsRecords.length,
        underInvestigation: incidentStatusCounts.under_investigation || 0,
        actionsInProgress: incidentStatusCounts.actions_in_progress || 0,
        highCritical30d,
        createdThisMonth: incidentCreatedThisMonth,
        createdYtd: incidentCreatedYtd,
        riddor: {
          total: riddorTotal,
          month: riddorMonth,
          ytd: riddorYtd,
        },
        nearMiss: {
          month: nearMissMonth,
          ytd: nearMissYtd,
        },
        childIncidents: {
          month: childIncidentsMonth,
          ytd: childIncidentsYtd,
        },
        byStatus: sortObjectByValueDesc(incidentStatusCounts),
        bySeverity: sortObjectByValueDesc(incidentSeverityCounts),
        byCategory: sortObjectByValueDesc(incidentCategoryCounts, 8),
        personsAffected: sortObjectByValueDesc(personsAffectedCounts),
        topRootCauses: sortObjectByValueDesc(rootCauseCounts, 6),
        topOpenIncidentStores,
        monthlyTrend: incidentMonthlyTrend,
        claims: {
          total: claims.length,
          open: claimsOpen,
          byStatus: sortObjectByValueDesc(claimsStatusCounts),
          monthlyTrend: claimsMonthlyTrend,
        },
      },
      actionsPage: {
        totalActions: allActions.length,
        activeActions: activeActions.length,
        overdueActions: overdueActionsAll.length,
        dueNext14Days,
        incidentActions: {
          total: incidentActions.length,
          active: activeIncidentActions.length,
          overdue: activeIncidentActions.filter((action) => isDateBefore(parseDate(action.due_date), todayDateOnly)).length,
        },
        storeActions: {
          total: storeActions.length,
          active: activeStoreActions.length,
          overdue: activeStoreActions.filter((action) => isDateBefore(parseDate(action.due_date), todayDateOnly)).length,
        },
        byStatus: sortObjectByValueDesc(actionsByStatus),
        byPriority: sortObjectByValueDesc(actionsByPriority),
        topStores: topActionStores,
        monthlyTrend: actionsMonthlyTrend,
      },
      incidentRisk: {
        openIncidents: Number(dashboardData?.openIncidents || 0),
        underInvestigation: Number(dashboardData?.underInvestigation || 0),
        highCritical30d: Number(dashboardData?.highCritical || 0),
        overdueIncidentActions: Number(dashboardData?.overdueActions || 0),
      },
      storeActions: {
        active: Number(storeActionStats?.active || 0),
        overdue: Number(storeActionStats?.overdue || 0),
        highUrgent: Number(storeActionStats?.highUrgent || 0),
        statusCounts: storeActionStats?.statusCounts || {},
        priorityCounts: storeActionStats?.priorityCounts || {},
      },
      combinedActions: {
        incidentOverdue: Number(combinedActionStats?.incidentOverdue || 0),
        storeOverdue: Number(combinedActionStats?.storeOverdue || 0),
        totalOverdue: Number(combinedActionStats?.totalOverdue || 0),
      },
      auditCompletion: {
        totalStores: Number(auditStats?.totalStores || 0),
        firstAuditsComplete: Number(auditStats?.firstAuditsComplete || 0),
        secondAuditsComplete: Number(auditStats?.secondAuditsComplete || 0),
        firstAuditPercentage: Number(auditStats?.firstAuditPercentage || 0),
        secondAuditPercentage: Number(auditStats?.secondAuditPercentage || 0),
        fullyCompliantPercentage: Number(auditStats?.totalAuditPercentage || 0),
      },
      complianceTracking: {
        noAuditStartedCount: Number(complianceTracking?.noAuditStartedCount || 0),
        awaitingSecondAuditCount: Number(complianceTracking?.awaitingSecondAuditCount || 0),
        secondAuditPlannedCount: Number(complianceTracking?.secondAuditPlannedCount || 0),
        secondAuditUnplannedCount: Number(complianceTracking?.secondAuditUnplannedCount || 0),
        storesNeedingSecondVisitCount: Number(complianceTracking?.storesNeedingSecondVisitCount || 0),
        plannedRoutesCount: Number(complianceTracking?.plannedRoutesCount || 0),
        plannedVisitsNext14Days: Number(complianceTracking?.plannedVisitsNext14Days || 0),
      },
      fraTracking: {
        storesRequiringFRA: Number(dashboardData?.storesRequiringFRA || 0),
        required: Number(fraStats?.required || 0),
        due: Number(fraStats?.due || 0),
        overdue: Number(fraStats?.overdue || 0),
        upToDate: Number(fraStats?.upToDate || 0),
        inDateCoveragePercentage: Number(fraStats?.inDateCoveragePercentage || 0),
      },
      predictiveRisk: {
        highRiskCount: Number(complianceForecast?.highRiskCount || 0),
        mediumRiskCount: Number(complianceForecast?.mediumRiskCount || 0),
        lowRiskCount: Number(complianceForecast?.lowRiskCount || 0),
        avgRiskScore: Number(complianceForecast?.avgRiskScore || 0),
      },
      planningPipeline: {
        plannedRouteCount,
        plannedStoreCount,
      },
      topIncidentStores,
      topStoreActionStores,
      topForecastStores,
    }

    const prompt = `
      Act as a senior compliance intelligence lead creating a concise internal briefing for The Fragrance Shop leadership.

      IMPORTANT CONTEXT:
      - Current date: ${currentDate}
      - Day of year: ${dayOfYear} (${currentYear})
      - Audit cadence: Round 1 runs Jan-Jun, Round 2 runs Jul-Dec.
      - Audits are unannounced and executed by KSS NW consultants.
      - Use all systems in your analysis: incidents, claims, incident actions, store actions, FRA status, audit progress, visit planning, and predictive risk.
      - The JSON includes dedicated "incidentsPage" and "actionsPage" snapshots built from the same data model as those pages.

      ANALYTICS SNAPSHOT (JSON):
      ${JSON.stringify(intelligenceSnapshot, null, 2)}

      INSTRUCTIONS:
      - Do not create false urgency solely because round completion is low early in the cycle.
      - Explicitly reference metrics from BOTH incidentsPage and actionsPage (at least 2 metrics from each).
      - Explicitly call out claims, RIDDOR exposure, store actions (including overdue/high-urgent), FRA exposure, and compliance tracking gaps.
      - Include at least one recommendation tied to each of:
        1) incident controls / investigation quality,
        2) actions workflow and overdue reduction,
        3) claims + RIDDOR governance,
        4) FRA completion cadence and next-visit planning.
      - If a metric is healthy, say so briefly.

      Return HTML only (no markdown fences) using this exact structure:
      1. <h3>Executive Summary</h3>
         - One short paragraph summarizing overall risk and operational posture.
      2. <h3>Cross-System Concerns</h3>
         - Bullet list of the key concerns across incidents, store actions, FRA, and compliance progression.
      3. <h3>Priority Store Focus</h3>
         - Bullet list naming specific stores from the snapshot and why they need attention.
      4. <h3>Recommended Actions</h3>
         - 4 concrete, practical actions for KSS NW consultants and central ops to execute in the next 30 days.

      Keep the tone professional, direct, and evidence-led.
    `

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a senior compliance intelligence analyst. Respond with raw HTML only using <h3>, <p>, <ul>, and <li>.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.4,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', errorData)
      return NextResponse.json(
        { error: 'Failed to generate report', details: errorData },
        { status: response.status }
      )
    }

    const data = await response.json()
    let text = data.choices?.[0]?.message?.content || 'Unable to generate report.'
    
    // Clean up markdown code blocks if OpenAI adds them despite instructions
    text = text.replace(/```html/g, '').replace(/```/g, '').trim()

    return NextResponse.json({
      content: text,
      snapshot: intelligenceSnapshot,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error generating compliance report:', error)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}
