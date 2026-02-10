import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { ActionsTableRow } from '@/components/shared/actions-table-row'
import { ActionMobileCard } from '@/components/shared/action-mobile-card'
import { Search, CheckSquare2, FileText, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const AREA_LABELS: Record<string, string> = {
  A1: 'Scotland & North East',
  A2: 'Yorkshire & Midlands',
  A3: 'Manchester',
  A4: 'Lancashire & Merseyside',
  A5: 'Birmingham',
  A6: 'Wales',
  A7: 'South',
  A8: 'London',
}

type ActionFilters = {
  assigned_to?: string
  status?: string
  overdue?: boolean
  priority?: string
  q?: string
  date_from?: string
  date_to?: string
}

type UnifiedAction = {
  id: string
  title: string
  description: string | null
  priority: string
  due_date: string
  status: string
  incident_id: string | null
  incident: { reference_no: string } | null
  assigned_to: { id: string; full_name: string | null } | null
  source_type: 'incident' | 'store'
  store?: {
    id: string
    store_name: string
    store_code: string | null
    region: string | null
    compliance_audit_2_assigned_manager_user_id: string | null
  } | null
}

async function getActions(filters?: ActionFilters) {
  const supabase = createClient()
  let incidentQuery = supabase
    .from('fa_actions')
    .select(`
      *,
      assigned_to:fa_profiles!fa_actions_assigned_to_user_id_fkey(*),
      incident:fa_incidents!fa_actions_incident_id_fkey(reference_no)
    `)
    .order('due_date', { ascending: true })

  let storeQuery = supabase
    .from('fa_store_actions')
    .select(`
      *,
      store:fa_stores!fa_store_actions_store_id_fkey(id, store_name, store_code, region, compliance_audit_2_assigned_manager_user_id)
    `)
    .order('due_date', { ascending: true })

  if (filters?.status) {
    incidentQuery = incidentQuery.eq('status', filters.status)
    storeQuery = storeQuery.eq('status', filters.status)
  }
  if (filters?.overdue) {
    const today = new Date().toISOString().split('T')[0]
    incidentQuery = incidentQuery
      .lt('due_date', today)
      .not('status', 'in', '(complete,cancelled)')
    storeQuery = storeQuery
      .lt('due_date', today)
      .not('status', 'in', '(complete,cancelled)')
  }
  if (filters?.date_from) {
    incidentQuery = incidentQuery.gte('due_date', filters.date_from)
    storeQuery = storeQuery.gte('due_date', filters.date_from)
  }
  if (filters?.date_to) {
    incidentQuery = incidentQuery.lte('due_date', filters.date_to)
    storeQuery = storeQuery.lte('due_date', filters.date_to)
  }

  const [
    { data: incidentData, error: incidentError },
    { data: storeData, error: storeError },
  ] = await Promise.all([incidentQuery, storeQuery])

  if (incidentError) {
    console.error('Error fetching incident actions:', incidentError)
  }
  if (storeError) {
    console.error('Error fetching store actions:', storeError)
  }
  if (incidentError && storeError) {
    return []
  }

  const incidentActions: UnifiedAction[] = (incidentData || []).map((action: any) => ({
    ...action,
    source_type: 'incident',
    store: null,
  }))

  const storeActions: UnifiedAction[] = (storeData || []).map((action: any) => ({
    ...action,
    source_type: 'store',
    incident_id: null,
    incident: action.store
      ? {
          reference_no: action.store.store_code
            ? `${action.store.store_code} - ${action.store.store_name}`
            : action.store.store_name,
        }
      : { reference_no: 'Store Action' },
    assigned_to: (() => {
      const areaCode = typeof action?.store?.region === 'string' ? action.store.region.trim().toUpperCase() : ''
      if (!areaCode) return null
      const areaName = AREA_LABELS[areaCode]
      const label = areaName || `Area ${areaCode}`
      return { id: `area:${areaCode}`, full_name: label }
    })(),
  }))

  let actions: UnifiedAction[] = [...incidentActions, ...storeActions].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  )

  if (filters?.assigned_to) {
    actions = actions.filter((action) => action.assigned_to?.id === filters.assigned_to)
  }

  if (filters?.priority) {
    actions = actions.filter((action) => action.priority === filters.priority)
  }

  if (filters?.q) {
    const q = filters.q.trim().toLowerCase()
    if (q.length > 0) {
      actions = actions.filter((action) => {
        const title = String(action.title || '').toLowerCase()
        const incidentRef = String(action.incident?.reference_no || '').toLowerCase()
        const assignee = String(action.assigned_to?.full_name || '').toLowerCase()
        const description = String(action.description || '').toLowerCase()
        const storeName = String(action.store?.store_name || '').toLowerCase()

        return (
          title.includes(q) ||
          incidentRef.includes(q) ||
          assignee.includes(q) ||
          description.includes(q) ||
          storeName.includes(q)
        )
      })
    }
  }

  return actions
}

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: {
    assigned_to?: string
    status?: string
    overdue?: string
    priority?: string
    q?: string
    date_from?: string
    date_to?: string
  }
}) {
  await requireAuth()
  const filters: ActionFilters = {
    assigned_to: searchParams.assigned_to || undefined,
    status: searchParams.status && searchParams.status !== 'all' ? searchParams.status : undefined,
    overdue: searchParams.overdue === 'true',
    priority: searchParams.priority && searchParams.priority !== 'all' ? searchParams.priority : undefined,
    q: searchParams.q?.trim() || undefined,
    date_from: searchParams.date_from || undefined,
    date_to: searchParams.date_to || undefined,
  }
  const actions = await getActions(filters)

  // Calculate stats
  const totalActions = actions.length
  const overdueCount = actions.filter(action => {
    const isOverdue = new Date(action.due_date) < new Date() && 
      !['complete', 'cancelled'].includes(action.status)
    return isOverdue
  }).length
  const activeActions = actions.filter(action => 
    !['complete', 'cancelled'].includes(action.status)
  ).length
  const hasActiveFilters = Boolean(filters.q || filters.status || filters.priority || filters.overdue || filters.date_from || filters.date_to)

  const groupedActions = Array.from(
    actions.reduce((groups, action) => {
      const isStoreAction = action.source_type === 'store'
      const groupKey = isStoreAction
        ? `store:${action.store?.id || action.id}`
        : `incident:${action.incident_id || action.id}`
      const groupLabel = isStoreAction
        ? action.store?.store_code
          ? `${action.store.store_code} - ${action.store.store_name}`
          : action.store?.store_name || action.incident?.reference_no || 'Store Action'
        : action.incident?.reference_no || 'Incident Action'

      if (!groups.has(groupKey)) {
        groups.set(groupKey, { key: groupKey, label: groupLabel, actions: [] as UnifiedAction[] })
      }

      groups.get(groupKey)!.actions.push(action)
      return groups
    }, new Map<string, { key: string; label: string; actions: UnifiedAction[] }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8 bg-slate-50/50 min-h-screen">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-slate-900">
            <div className="p-2 bg-blue-600 rounded-lg shadow-sm flex-shrink-0">
              <CheckSquare2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Actions</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-500 max-w-2xl ml-9 sm:ml-11">
            Track action items, monitor due dates, and manage completion status across all incidents.
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <Card className="bg-white shadow-sm border-slate-200">
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Actions</p>
              <p className="text-xl md:text-2xl font-bold text-slate-900">{totalActions}</p>
            </div>
            <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ml-2">
              <FileText className="h-4 w-4 md:h-5 md:w-5 text-slate-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider">Active</p>
              <p className="text-xl md:text-2xl font-bold text-blue-600">{activeActions}</p>
            </div>
            <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 ml-2">
              <Clock className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider">Overdue</p>
              <p className="text-xl md:text-2xl font-bold text-rose-600">{overdueCount}</p>
            </div>
            <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0 ml-2">
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-rose-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="shadow-sm border-slate-200 bg-white overflow-hidden">
        <CardHeader className="border-b bg-slate-50/40 px-6 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base font-semibold text-slate-800">
                Action Items {overdueCount > 0 && <span className="text-rose-600">({overdueCount} overdue)</span>}
              </CardTitle>
              {hasActiveFilters ? (
                <span className="text-xs text-slate-500">Filtered results</span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              Grouped by store/reference. Click a group to open tasks for that store.
            </p>

            <form method="get" className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <div className="relative md:col-span-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  name="q"
                  defaultValue={searchParams.q || ''}
                  placeholder="Search title, incident/store ref, assignee..."
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
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <select
                name="priority"
                defaultValue={searchParams.priority || 'all'}
                className="h-10 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="all">All priorities</option>
                <option value="urgent">Urgent</option>
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

              <div className="md:col-span-6 flex flex-wrap gap-2">
                <Button type="submit" size="sm" className="h-9 min-h-[44px] md:min-h-0">
                  Apply Filters
                </Button>
                <Button
                  type="submit"
                  name="overdue"
                  value="true"
                  variant={filters.overdue ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 min-h-[44px] md:min-h-0"
                >
                  Overdue Only
                </Button>
                <Button asChild variant="outline" size="sm" className="h-9 min-h-[44px] md:min-h-0">
                  <Link href="/actions">Reset</Link>
                </Button>
              </div>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="md:hidden p-4 space-y-4">
            {actions.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-500 py-12">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <FileText className="h-5 w-5 text-slate-400" />
                </div>
                <p className="font-medium text-slate-900">No actions found</p>
                <p className="text-sm mt-1 text-center">Actions will appear here when created for incidents or stores.</p>
              </div>
            ) : (
              groupedActions.map((group) => (
                <details
                  key={group.key}
                  className="rounded-xl border border-slate-200 bg-white"
                >
                  <summary className="cursor-pointer list-none px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-700">{group.label}</span>
                      <span className="text-[11px] text-slate-500">{group.actions.length} tasks</span>
                    </div>
                  </summary>
                  <div className="border-t p-3 space-y-3">
                    {group.actions.map((action: any) => (
                      <ActionMobileCard key={action.id} action={action} />
                    ))}
                  </div>
                </details>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block p-4 space-y-3">
            {actions.length === 0 ? (
              <div className="h-40 flex items-center justify-center">
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <FileText className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-900">No actions found</p>
                  <p className="text-sm mt-1">Actions will appear here when created for incidents or stores.</p>
                </div>
              </div>
            ) : (
              groupedActions.map((group) => (
                <details
                  key={group.key}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                >
                  <summary className="cursor-pointer list-none bg-slate-50 px-4 py-3 border-b">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-slate-700">{group.label}</span>
                      <span className="text-xs text-slate-500">{group.actions.length} tasks</span>
                    </div>
                  </summary>
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-semibold text-slate-500">Title</TableHead>
                        <TableHead className="font-semibold text-slate-500 w-[130px]">Reference</TableHead>
                        <TableHead className="font-semibold text-slate-500">Assigned To</TableHead>
                        <TableHead className="w-[100px] font-semibold text-slate-500">Priority</TableHead>
                        <TableHead className="font-semibold text-slate-500 w-[130px]">Due Date</TableHead>
                        <TableHead className="w-[120px] font-semibold text-slate-500">Status</TableHead>
                        <TableHead className="w-[160px] text-right font-semibold text-slate-500">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.actions.map((action: any) => (
                        <ActionsTableRow key={action.id} action={action} />
                      ))}
                    </TableBody>
                  </Table>
                </details>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
