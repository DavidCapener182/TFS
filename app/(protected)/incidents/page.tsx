import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/shared/status-badge'
import { DeleteIncidentButton } from '@/components/shared/delete-incident-button'
import { NewIncidentButton } from '@/components/incidents/new-incident-button'
import { IncidentMobileCard } from '@/components/incidents/incident-mobile-card'
import { ClosedIncidentMobileCard } from '@/components/incidents/closed-incident-mobile-card'
import { IncidentsAnalyticsCharts } from '@/components/incidents/incidents-analytics-charts'
import Link from 'next/link'
import { Search, AlertTriangle, FileText, Eye, CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'

type IncidentFilters = {
  store_id?: string
  status?: string
  severity?: string
  q?: string
  date_from?: string
  date_to?: string
}

type InvestigationSummary = {
  incident_id: string
  status: string | null
  root_cause: string | null
  recommendations: string | null
}

function getIncidentMetaObject(incident: any) {
  if (incident?.persons_involved && typeof incident.persons_involved === 'object') {
    return incident.persons_involved
  }
  return {}
}

function getIncidentPersonType(incident: any) {
  const meta = getIncidentMetaObject(incident) as Record<string, any>
  const personType = meta.person_type ?? meta.personType
  if (typeof personType !== 'string' || personType.trim().length === 0) {
    return 'Unknown'
  }
  return personType
}

function getIncidentChildInvolved(incident: any) {
  const meta = getIncidentMetaObject(incident) as Record<string, any>
  const childInvolved = meta.child_involved ?? meta.childInvolved
  return Boolean(childInvolved)
}

function getIncidentLostTimeDays(incident: any) {
  const injury = incident?.injury_details && typeof incident.injury_details === 'object'
    ? incident.injury_details
    : {}
  const meta = getIncidentMetaObject(incident) as Record<string, any>
  const raw = (injury as Record<string, any>).lost_time_days
    ?? (injury as Record<string, any>).lostTimeDays
    ?? meta.lost_time_days
    ?? meta.lostTimeDays

  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function getIncidentAccidentType(incident: any) {
  const injury = incident?.injury_details && typeof incident.injury_details === 'object'
    ? incident.injury_details
    : {}
  const meta = getIncidentMetaObject(incident) as Record<string, any>
  const accidentType = (injury as Record<string, any>).accident_type
    ?? (injury as Record<string, any>).accidentType
    ?? meta.accident_type
    ?? meta.accidentType

  return typeof accidentType === 'string' && accidentType.trim().length > 0 ? accidentType : null
}

function getInvestigationRootCause(incidentId: string, investigationMap: Map<string, InvestigationSummary>) {
  const rootCause = investigationMap.get(incidentId)?.root_cause
  if (!rootCause || rootCause.trim().length === 0) return null
  return rootCause
}

function getInvestigationRecommendations(incidentId: string, investigationMap: Map<string, InvestigationSummary>) {
  const recommendations = investigationMap.get(incidentId)?.recommendations
  if (!recommendations || recommendations.trim().length === 0) return null
  return recommendations
}

function countClaimEvidenceItems(claim: any) {
  const checks = [
    Boolean(claim.evidence_cctv),
    Boolean(claim.evidence_photos),
    Boolean(claim.evidence_statements),
    Boolean(claim.evidence_ra_sop),
  ]
  const completed = checks.filter(Boolean).length
  return {
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
  }
}

function safeFormat(value: string | null | undefined, pattern: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, pattern)
}

async function getIncidents(filters?: IncidentFilters) {
  const supabase = createClient()
  let query = supabase
    .from('fa_incidents')
    .select(`
      *,
      fa_stores(store_name, store_code),
      reporter:fa_profiles!fa_incidents_reported_by_user_id_fkey(full_name),
      investigator:fa_profiles!fa_incidents_assigned_investigator_user_id_fkey(full_name)
    `)
    .neq('status', 'closed') // Exclude closed incidents (they're in fa_closed_incidents)
    .order('occurred_at', { ascending: false })
    .limit(100)

  if (filters?.store_id) {
    query = query.eq('store_id', filters.store_id)
  }
  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.date_from) {
    const fromDate = new Date(filters.date_from)
    fromDate.setHours(0, 0, 0, 0)
    query = query.gte('occurred_at', fromDate.toISOString())
  }
  if (filters?.date_to) {
    const toDate = new Date(filters.date_to)
    toDate.setHours(23, 59, 59, 999)
    query = query.lte('occurred_at', toDate.toISOString())
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching incidents:', error)
    return []
  }

  let incidents = data || []

  if (filters?.severity) {
    incidents = incidents.filter((incident: any) => incident.severity === filters.severity)
  }

  return incidents
}

async function getClosedIncidents(filters?: IncidentFilters) {
  const supabase = createClient()
  const applyDateFilters = (query: any) => {
    let filtered = query
    if (filters?.store_id) {
      filtered = filtered.eq('store_id', filters.store_id)
    }
    if (filters?.date_from) {
      const fromDate = new Date(filters.date_from)
      fromDate.setHours(0, 0, 0, 0)
      filtered = filtered.gte('occurred_at', fromDate.toISOString())
    }
    if (filters?.date_to) {
      const toDate = new Date(filters.date_to)
      toDate.setHours(23, 59, 59, 999)
      filtered = filtered.lte('occurred_at', toDate.toISOString())
    }
    return filtered
  }

  const [archivedResult, legacyResult] = await Promise.all([
    applyDateFilters(
      supabase
        .from('fa_closed_incidents')
        .select('*')
        .order('closed_at', { ascending: false })
        .limit(200)
    ),
    applyDateFilters(
      supabase
        .from('fa_incidents')
        .select('*')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(200)
    ),
  ])

  if (archivedResult.error) {
    console.error('Error fetching archived closed incidents:', archivedResult.error)
  }
  if (legacyResult.error) {
    console.error('Error fetching legacy closed incidents:', legacyResult.error)
  }

  const mergedById = new Map<string, any>()
  for (const incident of archivedResult.data || []) {
    mergedById.set(incident.id, incident)
  }
  for (const incident of legacyResult.data || []) {
    if (!mergedById.has(incident.id)) {
      mergedById.set(incident.id, incident)
    }
  }

  let incidents = Array.from(mergedById.values())
  if (incidents.length === 0) {
    return []
  }

  if (filters?.severity) {
    incidents = incidents.filter((incident: any) => incident.severity === filters.severity)
  }

  const storeIds = [...new Set(incidents.map((incident: any) => incident.store_id).filter(Boolean))]
  const userIds = [
    ...new Set([
      ...incidents.map((incident: any) => incident.reported_by_user_id).filter(Boolean),
      ...incidents.map((incident: any) => incident.assigned_investigator_user_id).filter(Boolean),
    ]),
  ]

  const [storesResult, profilesResult] = await Promise.all([
    storeIds.length
      ? supabase
          .from('fa_stores')
          .select('id, store_name, store_code')
          .in('id', storeIds)
      : Promise.resolve({ data: [], error: null } as any),
    userIds.length
      ? supabase
          .from('fa_profiles')
          .select('id, full_name')
          .in('id', userIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  const storeMap = new Map<string, any>((storesResult.data || []).map((store: any) => [store.id, store]))
  const profileMap = new Map<string, any>((profilesResult.data || []).map((profile: any) => [profile.id, profile]))

  const enriched = incidents
    .map((incident: any) => ({
      ...incident,
      fa_stores: storeMap.get(incident.store_id) || null,
      reporter: profileMap.get(incident.reported_by_user_id)
        ? { full_name: profileMap.get(incident.reported_by_user_id).full_name }
        : null,
      investigator: incident.assigned_investigator_user_id && profileMap.get(incident.assigned_investigator_user_id)
        ? { full_name: profileMap.get(incident.assigned_investigator_user_id).full_name }
        : null,
    }))
    .sort((a: any, b: any) => {
      const aDate = new Date(a.closed_at || a.occurred_at || 0).getTime()
      const bDate = new Date(b.closed_at || b.occurred_at || 0).getTime()
      return bDate - aDate
    })
    .slice(0, 100)

  return enriched
}

async function getInvestigationSummaries(incidentIds: string[]) {
  const uniqueIncidentIds = [...new Set(incidentIds.filter(Boolean))]
  if (uniqueIncidentIds.length === 0) {
    return new Map<string, InvestigationSummary>()
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('fa_investigations')
    .select('incident_id, status, root_cause, recommendations, updated_at, created_at')
    .in('incident_id', uniqueIncidentIds)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching investigation summaries:', error)
    return new Map<string, InvestigationSummary>()
  }

  const investigationMap = new Map<string, InvestigationSummary>()
  for (const investigation of data || []) {
    if (!investigationMap.has(investigation.incident_id)) {
      investigationMap.set(investigation.incident_id, {
        incident_id: investigation.incident_id,
        status: investigation.status,
        root_cause: investigation.root_cause,
        recommendations: investigation.recommendations,
      })
    }
  }

  return investigationMap
}

async function getClaims(filters?: IncidentFilters) {
  const supabase = createClient()
  let query = supabase
    .from('fa_claims')
    .select('*')
    .order('received_date', { ascending: false })
    .limit(200)

  if (filters?.store_id) {
    query = query.eq('store_id', filters.store_id)
  }
  if (filters?.date_from) {
    query = query.gte('received_date', filters.date_from)
  }
  if (filters?.date_to) {
    query = query.lte('received_date', filters.date_to)
  }

  const { data: claims, error } = await query
  if (error) {
    console.error('Error fetching claims:', error)
    return []
  }

  if (!claims || claims.length === 0) {
    return []
  }

  const storeIds = [...new Set(claims.map((claim: any) => claim.store_id).filter(Boolean))]
  const incidentIds = [...new Set(claims.map((claim: any) => claim.incident_id).filter(Boolean))]

  const [storesResult, openIncidentResult, closedIncidentResult] = await Promise.all([
    storeIds.length
      ? supabase
          .from('fa_stores')
          .select('id, store_name, store_code')
          .in('id', storeIds)
      : Promise.resolve({ data: [], error: null } as any),
    incidentIds.length
      ? supabase
          .from('fa_incidents')
          .select('id, reference_no')
          .in('id', incidentIds)
      : Promise.resolve({ data: [], error: null } as any),
    incidentIds.length
      ? supabase
          .from('fa_closed_incidents')
          .select('id, reference_no')
          .in('id', incidentIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  const storeMap = new Map((storesResult.data || []).map((store: any) => [store.id, store]))
  const incidentRefMap = new Map<string, string>()
  for (const incident of openIncidentResult.data || []) {
    incidentRefMap.set(incident.id, incident.reference_no)
  }
  for (const incident of closedIncidentResult.data || []) {
    if (!incidentRefMap.has(incident.id)) {
      incidentRefMap.set(incident.id, incident.reference_no)
    }
  }

  let enriched = claims.map((claim: any) => ({
    ...claim,
    fa_stores: storeMap.get(claim.store_id) || null,
    incident_reference: claim.incident_id ? (incidentRefMap.get(claim.incident_id) || null) : null,
  }))

  if (filters?.q) {
    const q = filters.q.trim().toLowerCase()
    if (q.length > 0) {
      enriched = enriched.filter((claim: any) => {
        const values = [
          claim.reference_no,
          claim.claimant_type,
          claim.allegation,
          claim.status,
          claim.next_action,
          claim.owner,
          claim.incident_reference,
          claim.fa_stores?.store_name,
          claim.fa_stores?.store_code,
        ]
        return values.some((value) => String(value || '').toLowerCase().includes(q))
      })
    }
  }

  return enriched
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: {
    store_id?: string
    status?: string
    severity?: string
    q?: string
    date_from?: string
    date_to?: string
  }
}) {
  await requireAuth()
  const filters: IncidentFilters = {
    store_id: searchParams.store_id || undefined,
    status: searchParams.status && searchParams.status !== 'all' ? searchParams.status : undefined,
    severity: searchParams.severity && searchParams.severity !== 'all' ? searchParams.severity : undefined,
    q: searchParams.q?.trim() || undefined,
    date_from: searchParams.date_from || undefined,
    date_to: searchParams.date_to || undefined,
  }
  const [openIncidentsRaw, closedIncidentsRaw, claims] = await Promise.all([
    getIncidents(filters),
    getClosedIncidents(filters),
    getClaims(filters),
  ])
  const investigationMap = await getInvestigationSummaries([
    ...openIncidentsRaw.map((incident: any) => incident.id),
    ...closedIncidentsRaw.map((incident: any) => incident.id),
  ])

  const searchQuery = filters.q?.toLowerCase() || ''
  const applyIncidentSearch = (incidentList: any[]) => {
    if (!searchQuery) return incidentList
    return incidentList.filter((incident: any) => {
      const values = [
        incident.reference_no,
        incident.source_reference,
        incident.summary,
        incident.description,
        incident.incident_category,
        incident.fa_stores?.store_name,
        incident.fa_stores?.store_code,
        incident.investigator?.full_name,
        getIncidentPersonType(incident),
        getInvestigationRootCause(incident.id, investigationMap),
        getInvestigationRecommendations(incident.id, investigationMap),
        getIncidentAccidentType(incident),
      ]
      return values.some((value) => String(value || '').toLowerCase().includes(searchQuery))
    })
  }

  const incidents = applyIncidentSearch(openIncidentsRaw)
  const closedIncidents = applyIncidentSearch(closedIncidentsRaw)
  const allIncidents = [...incidents, ...closedIncidents]
  const riddorIncidents = [...incidents, ...closedIncidents]
    .filter((incident: any) => incident.riddor_reportable)
    .sort((a: any, b: any) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())

  // Calculate stats
  const totalIncidents = allIncidents.length
  const openIncidents = allIncidents.filter((i: any) => i.status === 'open' || i.status === 'under_investigation').length
  const criticalIncidents = allIncidents.filter((i: any) => i.severity === 'critical' || i.severity === 'high').length
  const hasActiveFilters = Boolean(filters.q || filters.status || filters.severity || filters.date_from || filters.date_to)

  const getValidDate = (value: string | null | undefined) => {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const toMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const toMonthLabel = (key: string) => {
    const [year, month] = key.split('-').map(Number)
    if (!year || !month) return key
    return format(new Date(year, month - 1, 1), 'MMM yy')
  }
  const toDisplayText = (value: string) => value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')

  const now = new Date()
  const currentMonthKey = toMonthKey(now)
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousMonthKey = toMonthKey(previousMonthDate)
  const currentYear = now.getFullYear()
  const previousYear = currentYear - 1

  const incidentRows = allIncidents
    .map((incident: any) => ({ incident, date: getValidDate(incident.occurred_at) }))
    .filter((entry: any) => entry.date) as Array<{ incident: any; date: Date }>

  const isYearToDate = (date: Date, year: number) => {
    if (date.getFullYear() !== year) return false
    if (date.getMonth() < now.getMonth()) return true
    if (date.getMonth() > now.getMonth()) return false
    return date.getDate() <= now.getDate()
  }

  const accidentsMonth = incidentRows.filter((entry) => toMonthKey(entry.date) === currentMonthKey).length
  const accidentsPreviousMonth = incidentRows.filter((entry) => toMonthKey(entry.date) === previousMonthKey).length
  const accidentsYtd = incidentRows.filter((entry) => isYearToDate(entry.date, currentYear)).length
  const accidentsPreviousYtd = incidentRows.filter((entry) => isYearToDate(entry.date, previousYear)).length
  const riddorMonth = incidentRows.filter((entry) => toMonthKey(entry.date) === currentMonthKey && entry.incident.riddor_reportable).length
  const riddorYtd = incidentRows.filter((entry) => isYearToDate(entry.date, currentYear) && entry.incident.riddor_reportable).length
  const nearMissMonth = incidentRows.filter((entry) => toMonthKey(entry.date) === currentMonthKey && entry.incident.incident_category === 'near_miss').length
  const childIncidentsMonth = incidentRows.filter((entry) => toMonthKey(entry.date) === currentMonthKey && getIncidentChildInvolved(entry.incident)).length

  const getPercentChange = (currentValue: number, previousValue: number) => {
    if (previousValue === 0) return currentValue === 0 ? 0 : 100
    return Math.round(((currentValue - previousValue) / previousValue) * 100)
  }

  const accidentsMonthDelta = getPercentChange(accidentsMonth, accidentsPreviousMonth)
  const accidentsYtdDelta = getPercentChange(accidentsYtd, accidentsPreviousYtd)

  const personOrder = ['Employee', 'Public', 'Contractor', 'Near Miss', 'Unknown']
  const normalizePersonType = (value: string) => {
    const lowerValue = value.toLowerCase()
    if (lowerValue.includes('employee')) return 'Employee'
    if (lowerValue.includes('public')) return 'Public'
    if (lowerValue.includes('contractor')) return 'Contractor'
    if (lowerValue.includes('near')) return 'Near Miss'
    return 'Unknown'
  }

  const personCounter = new Map<string, number>(personOrder.map((name) => [name, 0]))
  for (const incident of allIncidents) {
    const personType = normalizePersonType(getIncidentPersonType(incident))
    personCounter.set(personType, (personCounter.get(personType) || 0) + 1)
  }

  const personData = personOrder
    .map((name) => ({ name, value: personCounter.get(name) || 0 }))
    .filter((item) => !(item.name === 'Unknown' && item.value === 0))

  const monthlyTrendMap = new Map<string, { month: string; incidents: number; riddor: number; nearMiss: number; open: number; closed: number }>()
  for (const { incident, date } of incidentRows) {
    const monthKey = toMonthKey(date)
    if (!monthlyTrendMap.has(monthKey)) {
      monthlyTrendMap.set(monthKey, {
        month: toMonthLabel(monthKey),
        incidents: 0,
        riddor: 0,
        nearMiss: 0,
        open: 0,
        closed: 0,
      })
    }
    const monthBucket = monthlyTrendMap.get(monthKey)!
    monthBucket.incidents += 1
    if (incident.riddor_reportable) monthBucket.riddor += 1
    if (incident.incident_category === 'near_miss') monthBucket.nearMiss += 1
    if (incident.status === 'closed') monthBucket.closed += 1
    else monthBucket.open += 1
  }

  const monthlyTrendData = Array.from(monthlyTrendMap.entries())
    .sort(([monthKeyA], [monthKeyB]) => monthKeyA.localeCompare(monthKeyB))
    .map(([, value]) => value)
    .slice(-12)

  const rootCauseCounter = new Map<string, number>()
  for (const incident of allIncidents) {
    const rootCause = getInvestigationRootCause(incident.id, investigationMap)
    if (!rootCause) continue
    rootCauseCounter.set(rootCause, (rootCauseCounter.get(rootCause) || 0) + 1)
  }
  const rootCauseData = Array.from(rootCauseCounter.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const accidentTypeCounter = new Map<string, number>()
  for (const incident of allIncidents) {
    const accidentType = getIncidentAccidentType(incident) || toDisplayText(String(incident.incident_category || 'other'))
    accidentTypeCounter.set(accidentType, (accidentTypeCounter.get(accidentType) || 0) + 1)
  }
  const accidentTypeData = Array.from(accidentTypeCounter.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const claimsRows = claims
    .map((claim: any) => ({ claim, date: getValidDate(claim.received_date) }))
    .filter((entry: any) => entry.date) as Array<{ claim: any; date: Date }>

  const claimsMonthlyMap = new Map<string, { month: string; claims: number }>()
  for (const { date } of claimsRows) {
    const monthKey = toMonthKey(date)
    if (!claimsMonthlyMap.has(monthKey)) {
      claimsMonthlyMap.set(monthKey, { month: toMonthLabel(monthKey), claims: 0 })
    }
    claimsMonthlyMap.get(monthKey)!.claims += 1
  }
  const claimsMonthlyData = Array.from(claimsMonthlyMap.entries())
    .sort(([monthKeyA], [monthKeyB]) => monthKeyA.localeCompare(monthKeyB))
    .map(([, value]) => value)
    .slice(-12)

  const monthKeysWithIncidents = new Set(incidentRows.map((entry) => toMonthKey(entry.date)))
  const monthlyAverage = monthKeysWithIncidents.size > 0 ? Number((totalIncidents / monthKeysWithIncidents.size).toFixed(1)) : 0
  const openClaimsCount = claims.filter((claim: any) => String(claim.status || '').toLowerCase() === 'open').length

  const topRootCauseSummary = rootCauseData.length > 0
    ? rootCauseData.slice(0, 3).map((item) => `${item.name} (${item.value})`).join(', ')
    : 'No root causes captured yet.'

  const formatDelta = (value: number) => (value > 0 ? `+${value}%` : `${value}%`)

  return (
    <div className="flex flex-col gap-4 md:gap-6 lg:gap-8 bg-slate-50/50 min-h-screen">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-slate-900">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-sm flex-shrink-0">
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Incidents</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-500 max-w-2xl ml-9 sm:ml-11">
            Track safety incidents, manage investigations, and monitor resolution progress.
          </p>
        </div>
        <div className="flex-shrink-0">
          <NewIncidentButton />
        </div>
      </div>

      <Card className="shadow-sm border-slate-200 bg-white">
        <CardContent className="p-4 md:p-5">
          <form method="get" className="grid grid-cols-1 md:grid-cols-7 gap-2">
            <div className="relative md:col-span-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                name="q"
                defaultValue={searchParams.q || ''}
                placeholder="Search reference, root cause, store..."
                className="pl-9 bg-white"
              />
            </div>

            <select
              name="status"
              defaultValue={searchParams.status || 'all'}
              className="h-10 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="under_investigation">Under Investigation</option>
              <option value="actions_in_progress">Actions In Progress</option>
            </select>

            <select
              name="severity"
              defaultValue={searchParams.severity || 'all'}
              className="h-10 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <Input
              type="date"
              name="date_from"
              defaultValue={searchParams.date_from || ''}
              className="bg-white"
            />
            <Input
              type="date"
              name="date_to"
              defaultValue={searchParams.date_to || ''}
              className="bg-white"
            />

            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button type="submit" size="sm" className="h-9 min-h-[44px] md:min-h-0">
                Apply
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 min-h-[44px] md:min-h-0">
                <Link href="/incidents">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4">
        <Card className="border-slate-200 border-l-4 border-l-emerald-500">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500">Accidents (Month)</p>
            <p className="text-2xl font-bold text-slate-900 mt-2">{accidentsMonth}</p>
            <p className="text-xs text-slate-500 mt-1">{formatDelta(accidentsMonthDelta)} vs previous month</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 border-l-4 border-l-amber-500">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500">Accidents (YTD)</p>
            <p className="text-2xl font-bold text-slate-900 mt-2">{accidentsYtd}</p>
            <p className="text-xs text-slate-500 mt-1">{formatDelta(accidentsYtdDelta)} vs prior YTD</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 border-l-4 border-l-red-500">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500">RIDDOR (Month)</p>
            <p className="text-2xl font-bold text-slate-900 mt-2">{riddorMonth}</p>
            <p className="text-xs text-slate-500 mt-1">Reportable this month</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 border-l-4 border-l-teal-600">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500">RIDDOR (YTD)</p>
            <p className="text-2xl font-bold text-slate-900 mt-2">{riddorYtd}</p>
            <p className="text-xs text-slate-500 mt-1">Total reportable</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 border-l-4 border-l-emerald-600">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500">Near Miss (Month)</p>
            <p className="text-2xl font-bold text-slate-900 mt-2">{nearMissMonth}</p>
            <p className="text-xs text-slate-500 mt-1">Current month</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 border-l-4 border-l-indigo-500">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500">Child Incidents</p>
            <p className="text-2xl font-bold text-slate-900 mt-2">{childIncidentsMonth}</p>
            <p className="text-xs text-slate-500 mt-1">This month</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="border-slate-200 xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg font-semibold text-slate-900">Board Summary</CardTitle>
              <Badge variant="outline">{riddorIncidents.length} RIDDOR</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly Volume</p>
                <p className="text-sm text-slate-700 mt-1">
                  <span className="font-semibold text-slate-900">{totalIncidents}</span> total incidents recorded. Average per month: <span className="font-semibold text-slate-900">{monthlyAverage}</span>.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Root Causes</p>
                <p className="text-sm text-slate-700 mt-1">{topRootCauseSummary}</p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <div className="text-xs text-slate-500">Open Insurance Exposures</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{openClaimsCount}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <div className="text-xs text-slate-500">Active Cases</div>
                <div className="text-xl font-bold text-blue-700 mt-1">{openIncidents}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <div className="text-xs text-slate-500">High/Critical Risk</div>
                <div className="text-xl font-bold text-rose-700 mt-1">{criticalIncidents}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-slate-900">All-Time Persons Affected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {personData.map((item) => {
              const total = personData.reduce((sum, next) => sum + next.value, 0) || 1
              const widthPercent = Math.round((item.value / total) * 100)
              return (
                <div key={`person-${item.name}`} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{item.name}</span>
                    <span className="font-semibold text-slate-900">{item.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-indigo-500"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
              <span className="text-slate-500">Total Accidents</span>
              <span className="font-bold text-slate-900">{totalIncidents}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends & Analysis</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="claims">Claims & RIDDOR</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <IncidentsAnalyticsCharts
            mode="overview"
            monthlyData={monthlyTrendData}
            personData={personData}
            rootCauseData={rootCauseData}
            accidentTypeData={accidentTypeData}
            claimsMonthlyData={claimsMonthlyData}
          />
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <IncidentsAnalyticsCharts
            mode="detailed"
            monthlyData={monthlyTrendData}
            personData={personData}
            rootCauseData={rootCauseData}
            accidentTypeData={accidentTypeData}
            claimsMonthlyData={claimsMonthlyData}
          />
        </TabsContent>

        <TabsContent value="incidents" className="space-y-6">
      {/* Open Incidents Table */}
      <Card className="shadow-sm border-slate-200 bg-white overflow-hidden">
        <CardHeader className="border-b bg-slate-50/40 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold text-slate-800">Open Incidents</CardTitle>
            {hasActiveFilters ? (
              <span className="text-xs text-slate-500">
                Filtered results
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="md:hidden p-4 space-y-5">
            {incidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-500 py-12">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <FileText className="h-5 w-5 text-slate-400" />
                </div>
                <p className="font-medium text-slate-900">No open incidents found</p>
                <p className="text-sm mt-1 text-center">Adjust filters or log a new incident to get started.</p>
              </div>
            ) : (
              incidents.map((incident: any) => (
                <IncidentMobileCard key={incident.id} incident={incident} />
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[120px] font-semibold text-slate-500">Reference</TableHead>
                  <TableHead className="font-semibold text-slate-500">Store</TableHead>
                  <TableHead className="font-semibold text-slate-500">Person</TableHead>
                  <TableHead className="font-semibold text-slate-500">Category</TableHead>
                  <TableHead className="font-semibold text-slate-500">Root Cause</TableHead>
                  <TableHead className="w-[100px] font-semibold text-slate-500">Severity</TableHead>
                  <TableHead className="w-[120px] font-semibold text-slate-500">Status</TableHead>
                  <TableHead className="font-semibold text-slate-500">Flags</TableHead>
                  <TableHead className="font-semibold text-slate-500">Occurred</TableHead>
                  <TableHead className="font-semibold text-slate-500">Investigator</TableHead>
                  <TableHead className="w-[100px] text-right font-semibold text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                          <FileText className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">No open incidents found</p>
                        <p className="text-sm mt-1">Adjust filters or log a new incident to get started.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  incidents.map((incident: any) => (
                    <TableRow key={incident.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="hover:text-indigo-600 transition-colors">
                          <span className="font-mono text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">
                            {incident.reference_no}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900">{incident.fa_stores?.store_name || 'Unknown'}</span>
                            {incident.fa_stores?.store_code && (
                              <span className="text-xs text-slate-500">{incident.fa_stores.store_code}</span>
                            )}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="inline-block">
                          <Badge variant="outline" className="text-xs">
                            {getIncidentPersonType(incident)}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          <div className="flex flex-col gap-1">
                            <span>
                              {incident.incident_category.split('_').map((w: string) =>
                                w.charAt(0).toUpperCase() + w.slice(1)
                              ).join(' ')}
                            </span>
                            {getIncidentAccidentType(incident) && (
                              <span className="text-xs text-slate-500 truncate max-w-[180px]">
                                {getIncidentAccidentType(incident)}
                              </span>
                            )}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm max-w-[220px]">
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          <span className="truncate block">{getInvestigationRootCause(incident.id, investigationMap) || '—'}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="inline-block">
                          <StatusBadge status={incident.severity} type="severity" />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="inline-block">
                          <StatusBadge status={incident.status} type="incident" />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="block">
                          <div className="flex flex-wrap gap-1.5">
                            {incident.riddor_reportable && (
                              <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                                RIDDOR
                              </Badge>
                            )}
                            {getIncidentChildInvolved(incident) && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-amber-300 text-amber-700">
                                Child
                              </Badge>
                            )}
                            {!incident.riddor_reportable && !getIncidentChildInvolved(incident) && (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          {safeFormat(incident.occurred_at, 'dd MMM yyyy HH:mm')}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          {incident.investigator?.full_name ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                                {incident.investigator.full_name[0]}
                              </div>
                              <span className="text-sm text-slate-600">{incident.investigator.full_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Unassigned</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/incidents/${incident.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Button>
                          </Link>
                          <DeleteIncidentButton incidentId={incident.id} referenceNo={incident.reference_no} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Closed Incidents Table */}
      <Card className="shadow-sm border-slate-200 bg-white overflow-hidden">
        <CardHeader className="border-b bg-slate-50/40 px-6 py-4">
          <CardTitle className="text-base font-semibold text-slate-800">Closed Incidents Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="md:hidden p-4 space-y-5">
            {closedIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-500 py-12">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <FileText className="h-5 w-5 text-slate-400" />
                </div>
                <p className="font-medium text-slate-900">No closed incidents found</p>
                <p className="text-sm mt-1 text-center">Closed incidents will appear here.</p>
              </div>
            ) : (
              closedIncidents.map((incident: any) => (
                <ClosedIncidentMobileCard key={incident.id} incident={incident} />
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[120px] font-semibold text-slate-500">Reference</TableHead>
                  <TableHead className="font-semibold text-slate-500">Store</TableHead>
                  <TableHead className="font-semibold text-slate-500">Person</TableHead>
                  <TableHead className="font-semibold text-slate-500">Category</TableHead>
                  <TableHead className="font-semibold text-slate-500">Root Cause</TableHead>
                  <TableHead className="w-[100px] font-semibold text-slate-500">Severity</TableHead>
                  <TableHead className="font-semibold text-slate-500">Flags</TableHead>
                  <TableHead className="font-semibold text-slate-500">Occurred</TableHead>
                  <TableHead className="font-semibold text-slate-500">Closed</TableHead>
                  <TableHead className="font-semibold text-slate-500">Investigator</TableHead>
                  <TableHead className="w-[100px] text-right font-semibold text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedIncidents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                          <FileText className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">No closed incidents found</p>
                        <p className="text-sm mt-1">Closed incidents will appear here.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  closedIncidents.map((incident: any) => (
                    <TableRow key={incident.id} className="hover:bg-slate-50/50 transition-colors bg-slate-50/30 cursor-pointer">
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="hover:text-indigo-600 transition-colors">
                          <span className="font-mono text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">
                            {incident.reference_no}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900">{incident.fa_stores?.store_name || 'Unknown'}</span>
                            {incident.fa_stores?.store_code && (
                              <span className="text-xs text-slate-500">{incident.fa_stores.store_code}</span>
                            )}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="inline-block">
                          <Badge variant="outline" className="text-xs">
                            {getIncidentPersonType(incident)}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          <div className="flex flex-col gap-1">
                            <span>
                              {incident.incident_category.split('_').map((w: string) =>
                                w.charAt(0).toUpperCase() + w.slice(1)
                              ).join(' ')}
                            </span>
                            {getIncidentAccidentType(incident) && (
                              <span className="text-xs text-slate-500 truncate max-w-[180px]">
                                {getIncidentAccidentType(incident)}
                              </span>
                            )}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm max-w-[220px]">
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          <span className="truncate block">{getInvestigationRootCause(incident.id, investigationMap) || '—'}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="inline-block">
                          <StatusBadge status={incident.severity} type="severity" />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="block">
                          <div className="flex flex-wrap gap-1.5">
                            {incident.riddor_reportable && (
                              <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                                RIDDOR
                              </Badge>
                            )}
                            {getIncidentChildInvolved(incident) && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-amber-300 text-amber-700">
                                Child
                              </Badge>
                            )}
                            {!incident.riddor_reportable && !getIncidentChildInvolved(incident) && (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          {safeFormat(incident.occurred_at, 'dd MMM yyyy HH:mm')}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          {safeFormat(incident.closed_at, 'dd MMM yyyy HH:mm')}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/incidents/${incident.id}`} className="block hover:text-indigo-600 transition-colors">
                          {incident.investigator?.full_name ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                                {incident.investigator.full_name[0]}
                              </div>
                              <span className="text-sm text-slate-600">{incident.investigator.full_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Unassigned</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/incidents/${incident.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Button>
                          </Link>
                          <DeleteIncidentButton incidentId={incident.id} referenceNo={incident.reference_no} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      </TabsContent>

      <TabsContent value="claims" className="space-y-6">

      {/* RIDDOR Register */}
      <Card className="shadow-sm border-red-200 bg-white overflow-hidden">
        <CardHeader className="border-b bg-red-50/50 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold text-red-800">RIDDOR Incidents</CardTitle>
            <Badge variant="destructive" className="font-semibold">
              {riddorIncidents.length} Total
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-red-50/40">
                <TableRow>
                  <TableHead className="font-semibold text-slate-500">Date</TableHead>
                  <TableHead className="font-semibold text-slate-500">Store</TableHead>
                  <TableHead className="font-semibold text-slate-500">Person Type</TableHead>
                  <TableHead className="font-semibold text-slate-500">Summary</TableHead>
                  <TableHead className="font-semibold text-slate-500">Days Lost</TableHead>
                  <TableHead className="font-semibold text-slate-500">Investigation</TableHead>
                  <TableHead className="font-semibold text-slate-500">Actions Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riddorIncidents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                      No RIDDOR incidents for this filter set.
                    </TableCell>
                  </TableRow>
                ) : (
                  riddorIncidents.map((incident: any) => (
                    <TableRow key={`riddor-${incident.id}`} className="bg-red-50/20">
                      <TableCell className="text-sm text-slate-700">
                        {safeFormat(incident.occurred_at, 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {incident.fa_stores?.store_name || 'Unknown Store'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getIncidentPersonType(incident)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <span className="text-sm text-slate-700 truncate block">
                          {incident.summary || incident.description || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getIncidentLostTimeDays(incident) ? 'destructive' : 'secondary'}>
                          {getIncidentLostTimeDays(incident) ?? 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {investigationMap.get(incident.id)?.status ? (
                          <StatusBadge status={investigationMap.get(incident.id)?.status as any} type="investigation" />
                        ) : (
                          <span className="text-xs text-slate-400">Not started</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <span className="text-sm text-slate-700 truncate block">
                          {getInvestigationRecommendations(incident.id, investigationMap) || '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden p-4 space-y-3">
            {riddorIncidents.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                No RIDDOR incidents for this filter set.
              </p>
            ) : (
              riddorIncidents.map((incident: any) => (
                <Card key={`riddor-mobile-${incident.id}`} className="border-red-100">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/incidents/${incident.id}`} className="font-mono text-xs text-indigo-700">
                        {incident.reference_no}
                      </Link>
                      <span className="text-xs text-slate-500">{safeFormat(incident.occurred_at, 'dd MMM yyyy')}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{incident.fa_stores?.store_name || 'Unknown Store'}</p>
                    <p className="text-xs text-slate-700">{incident.summary || incident.description || '—'}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{getIncidentPersonType(incident)}</Badge>
                      <Badge variant={getIncidentLostTimeDays(incident) ? 'destructive' : 'secondary'} className="text-[10px]">
                        Lost: {getIncidentLostTimeDays(incident) ?? 'N/A'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Claims Register */}
      <Card className="shadow-sm border-slate-200 bg-white overflow-hidden">
        <CardHeader className="border-b bg-slate-50/40 px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold text-slate-800">Insurance Claims Register</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-blue-50 text-blue-700">
                {claims.filter((claim: any) => String(claim.status || '').toLowerCase() === 'open').length} Open
              </Badge>
              <Badge variant="secondary">
                {claims.filter((claim: any) => String(claim.status || '').toLowerCase() === 'closed').length} Closed
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-semibold text-slate-500">Received</TableHead>
                  <TableHead className="font-semibold text-slate-500">Reference</TableHead>
                  <TableHead className="font-semibold text-slate-500">Store</TableHead>
                  <TableHead className="font-semibold text-slate-500">Claimant</TableHead>
                  <TableHead className="font-semibold text-slate-500">Allegation</TableHead>
                  <TableHead className="font-semibold text-slate-500">Status</TableHead>
                  <TableHead className="font-semibold text-slate-500">Evidence</TableHead>
                  <TableHead className="font-semibold text-slate-500">Next Action</TableHead>
                  <TableHead className="font-semibold text-slate-500">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-slate-500">
                      No claims found for this filter set.
                    </TableCell>
                  </TableRow>
                ) : (
                  claims.map((claim: any) => {
                    const evidence = countClaimEvidenceItems(claim)
                    return (
                      <TableRow key={claim.id}>
                        <TableCell className="text-sm text-slate-700">
                          {safeFormat(claim.received_date, 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-slate-700">{claim.reference_no || '—'}</span>
                            {claim.incident_reference ? (
                              <span className="text-[11px] text-slate-500">Incident: {claim.incident_reference}</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">
                          {claim.fa_stores?.store_name || 'Unknown Store'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{claim.claimant_type || 'Unknown'}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <span className="truncate block text-sm text-slate-700">{claim.allegation || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={String(claim.status || '').toLowerCase() === 'open' ? 'default' : 'secondary'}
                            className={String(claim.status || '').toLowerCase() === 'open' ? 'bg-blue-50 text-blue-700' : undefined}
                          >
                            {claim.status || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5 min-w-[140px]">
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${evidence.percent}%` }} />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-500">{evidence.percent}%</span>
                              <span className="text-[11px] text-slate-500">
                                {evidence.completed}/{evidence.total}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {claim.evidence_cctv ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <XCircle className="h-3 w-3 text-slate-300" />}
                              {claim.evidence_photos ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <XCircle className="h-3 w-3 text-slate-300" />}
                              {claim.evidence_statements ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <XCircle className="h-3 w-3 text-slate-300" />}
                              {claim.evidence_ra_sop ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <XCircle className="h-3 w-3 text-slate-300" />}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <span className="truncate block text-sm text-slate-700">{claim.next_action || '—'}</span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {safeFormat(claim.due_date, 'dd MMM yyyy')}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden p-4 space-y-3">
            {claims.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No claims found for this filter set.</p>
            ) : (
              claims.map((claim: any) => {
                const evidence = countClaimEvidenceItems(claim)
                return (
                  <Card key={`claim-mobile-${claim.id}`} className="border-slate-200">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs text-slate-700">{claim.reference_no || '—'}</p>
                          {claim.incident_reference ? (
                            <p className="text-[11px] text-slate-500">Incident: {claim.incident_reference}</p>
                          ) : null}
                        </div>
                        <Badge variant={String(claim.status || '').toLowerCase() === 'open' ? 'default' : 'secondary'}>
                          {claim.status || 'Unknown'}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{claim.fa_stores?.store_name || 'Unknown Store'}</p>
                      <p className="text-xs text-slate-700">{claim.allegation || '—'}</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">{claim.claimant_type || 'Unknown'}</Badge>
                        <span className="text-[11px] text-slate-500">Evidence {evidence.percent}%</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Due {safeFormat(claim.due_date, 'dd MMM yyyy')}
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
      </TabsContent>
      </Tabs>
    </div>
  )
}
