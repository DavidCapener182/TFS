import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeComplianceForecast, getFRAStatusFromDate } from '@/lib/compliance-forecast'
import { endOfWeek, format, isValid, parseISO, startOfWeek } from 'date-fns'

export const dynamic = 'force-dynamic'

function parseWeekStart(raw: string | null): Date {
  if (!raw) return startOfWeek(new Date(), { weekStartsOn: 1 })
  const parsed = parseISO(raw)
  if (!isValid(parsed)) return startOfWeek(new Date(), { weekStartsOn: 1 })
  return startOfWeek(parsed, { weekStartsOn: 1 })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const weekStart = parseWeekStart(request.nextUrl.searchParams.get('start'))
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    const startDate = format(weekStart, 'yyyy-MM-dd')
    const endDate = format(weekEnd, 'yyyy-MM-dd')
    const today = format(new Date(), 'yyyy-MM-dd')
    const weekStartIso = `${startDate}T00:00:00.000Z`
    const weekEndIso = `${endDate}T23:59:59.999Z`

    const [
      { count: openIncidentsCount },
      { data: incidentsWeekRaw },
      { count: overdueActionsCount },
      { count: completedActionsThisWeek },
      { data: plannedStoresWeekRaw },
      { data: allStoresRaw },
      { data: openIncidentsByStoreRaw },
      { data: overdueActionsByStoreRaw },
      { count: activityEventsThisWeek },
    ] = await Promise.all([
      supabase
        .from('tfs_incidents')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'under_investigation', 'actions_in_progress']),
      supabase
        .from('tfs_incidents')
        .select('store_id, tfs_stores:tfs_stores(store_name, store_code)')
        .gte('occurred_at', weekStartIso)
        .lte('occurred_at', weekEndIso),
      supabase
        .from('tfs_actions')
        .select('*', { count: 'exact', head: true })
        .lt('due_date', today)
        .not('status', 'in', '(complete,cancelled)'),
      supabase
        .from('tfs_actions')
        .select('*', { count: 'exact', head: true })
        .not('completed_at', 'is', null)
        .gte('completed_at', weekStartIso)
        .lte('completed_at', weekEndIso),
      supabase
        .from('tfs_stores')
        .select('id, store_name, store_code, region, reporting_area, compliance_audit_2_planned_date, compliance_audit_2_assigned_manager_user_id')
        .not('compliance_audit_2_planned_date', 'is', null)
        .gte('compliance_audit_2_planned_date', startDate)
        .lte('compliance_audit_2_planned_date', endDate)
        .eq('is_active', true),
      supabase
        .from('tfs_stores')
        .select(`
          id,
          store_name,
          store_code,
          region,
          compliance_audit_1_date,
          compliance_audit_1_overall_pct,
          compliance_audit_2_date,
          compliance_audit_2_overall_pct,
          fire_risk_assessment_date,
          compliance_audit_2_planned_date
        `)
        .eq('is_active', true),
      supabase
        .from('tfs_incidents')
        .select('store_id')
        .in('status', ['open', 'under_investigation', 'actions_in_progress']),
      supabase
        .from('tfs_actions')
        .select(`
          status,
          due_date,
          incident:tfs_incidents!tfs_actions_incident_id_fkey(
            store_id
          )
        `)
        .lt('due_date', today)
        .not('status', 'in', '(complete,cancelled)'),
      supabase
        .from('tfs_activity_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekStartIso)
        .lte('created_at', weekEndIso),
    ])

    const openIncidentsByStore = (openIncidentsByStoreRaw || []).reduce((acc: Record<string, number>, row: any) => {
      if (!row?.store_id) return acc
      acc[row.store_id] = (acc[row.store_id] || 0) + 1
      return acc
    }, {})

    const overdueActionsByStore = (overdueActionsByStoreRaw || []).reduce((acc: Record<string, number>, row: any) => {
      const incidentRel = Array.isArray(row.incident) ? row.incident[0] : row.incident
      const storeId = incidentRel?.store_id
      if (!storeId) return acc
      acc[storeId] = (acc[storeId] || 0) + 1
      return acc
    }, {})

    const forecast = computeComplianceForecast((allStoresRaw || []) as any, {
      openIncidentsByStore,
      overdueActionsByStore,
      referenceDate: new Date(),
    })

    const highSeverityThisWeek = (incidentsWeekRaw || []).filter(
      (incident: any) => incident.severity === 'high' || incident.severity === 'critical'
    ).length

    const plannedRouteGroups = new Set(
      (plannedStoresWeekRaw || []).map((store: any) => {
        const manager = store.compliance_audit_2_assigned_manager_user_id || 'unassigned'
        const date = store.compliance_audit_2_planned_date || 'unknown-date'
        const area = store.reporting_area || store.region || 'unknown-area'
        return `${manager}-${date}-${area}`
      })
    )

    const auditPassesThisWeek = (allStoresRaw || []).reduce((count: number, store: any) => {
      const audit1Pass =
        store.compliance_audit_1_date &&
        store.compliance_audit_1_date >= startDate &&
        store.compliance_audit_1_date <= endDate &&
        typeof store.compliance_audit_1_overall_pct === 'number' &&
        store.compliance_audit_1_overall_pct >= 80

      const audit2Pass =
        store.compliance_audit_2_date &&
        store.compliance_audit_2_date >= startDate &&
        store.compliance_audit_2_date <= endDate &&
        typeof store.compliance_audit_2_overall_pct === 'number' &&
        store.compliance_audit_2_overall_pct >= 80

      return count + (audit1Pass || audit2Pass ? 1 : 0)
    }, 0)

    const fraSummary = (allStoresRaw || []).reduce(
      (acc: { dueSoon: number; overdue: number }, store: any) => {
        const fraStatus = getFRAStatusFromDate(store.fire_risk_assessment_date)
        if (fraStatus === 'due') acc.dueSoon += 1
        if (fraStatus === 'overdue' || fraStatus === 'required') acc.overdue += 1
        return acc
      },
      { dueSoon: 0, overdue: 0 }
    )

    const topRiskStores = forecast.stores.slice(0, 5)

    const digestLines = [
      `# Weekly Executive Digest (${format(weekStart, 'd MMM yyyy')} - ${format(weekEnd, 'd MMM yyyy')})`,
      '',
      '## Executive Summary',
      `- ${openIncidentsCount || 0} open incidents are currently active across the estate.`,
      `- ${overdueActionsCount || 0} actions are overdue; ${completedActionsThisWeek || 0} actions were completed this week.`,
      `- ${plannedRouteGroups.size} planned routes cover ${(plannedStoresWeekRaw || []).length} stores this week.`,
      '',
      '## Risk Snapshot',
      `- High/Critical incidents logged this week: ${highSeverityThisWeek}.`,
      `- FRA overdue/required stores: ${fraSummary.overdue}.`,
      `- FRA due within 30 days: ${fraSummary.dueSoon}.`,
      `- Compliance forecast high-risk stores (30 days): ${forecast.highRiskCount}.`,
      '',
      '## Operational Performance',
      `- Audit passes this week (>=80%): ${auditPassesThisWeek}.`,
      `- Activity events recorded this week: ${activityEventsThisWeek || 0}.`,
      '',
      '## Top Forecast Priorities',
      ...(topRiskStores.length === 0
        ? ['- No forecast priorities available.']
        : topRiskStores.map((store, index) => {
            const driverText = store.drivers.length > 0 ? ` | drivers: ${store.drivers.join('; ')}` : ''
            return `${index + 1}. ${store.storeName}${store.storeCode ? ` (${store.storeCode})` : ''} - ${store.probability}% risk${driverText}`
          })),
      '',
      '## Recommended Focus This Week',
      '- Prioritize high-risk stores with overdue FRA and sub-80 audit outcomes.',
      '- Close oldest overdue actions first to reduce near-term forecast risk.',
      '- Use route planning constraints to keep drive time within target and improve manager capacity.',
    ]

    const digestMarkdown = digestLines.join('\n')

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      period: {
        start: startDate,
        end: endDate,
        label: `${format(weekStart, 'd MMM yyyy')} - ${format(weekEnd, 'd MMM yyyy')}`,
      },
      metrics: {
        openIncidents: openIncidentsCount || 0,
        overdueActions: overdueActionsCount || 0,
        completedActionsThisWeek: completedActionsThisWeek || 0,
        routesPlannedThisWeek: plannedRouteGroups.size,
        plannedStoresThisWeek: (plannedStoresWeekRaw || []).length,
        highSeverityThisWeek,
        activityEventsThisWeek: activityEventsThisWeek || 0,
        fraDueSoon: fraSummary.dueSoon,
        fraOverdueOrRequired: fraSummary.overdue,
        forecastHighRiskCount: forecast.highRiskCount,
        auditPassesThisWeek,
      },
      forecast: {
        averageRiskScore: forecast.avgRiskScore,
        highRiskCount: forecast.highRiskCount,
        mediumRiskCount: forecast.mediumRiskCount,
        lowRiskCount: forecast.lowRiskCount,
        topStores: topRiskStores,
      },
      digestMarkdown,
    })
  } catch (error) {
    console.error('Error generating weekly digest:', error)
    return NextResponse.json({ error: 'Failed to generate weekly digest' }, { status: 500 })
  }
}
