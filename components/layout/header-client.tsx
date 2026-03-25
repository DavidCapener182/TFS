'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AlertTriangle, LogOut, Menu } from 'lucide-react'
import { useSidebar } from './sidebar-provider'
import { getMobilePageTitle } from './mobile-nav-config'
import { cn, formatAppDate, formatAppDateTime, formatAppTime } from '@/lib/utils'
import { StoreSearch } from '@/components/layout/store-search'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/auth'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface HeaderClientProps {
  signOut: () => void
  currentUser: {
    id: string
    name: string
    role: UserRole
  }
}

type OnlineUser = {
  id: string
  name: string
  page: string | null
  lastSeen: string | null
}

type ActivityDetails = {
  old?: Record<string, unknown> | null
  new?: Record<string, unknown> | null
  [key: string]: unknown
}

type LatestActivity = {
  action: string
  entityType: string
  entityId: string | null
  createdAt: string
  details: ActivityDetails | null
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  title: 'Title',
  priority: 'Priority',
  due_date: 'Due date',
  completed_at: 'Completed at',
  route_sequence: 'Route sequence',
  region: 'Region',
  store_name: 'Store name',
  compliance_audit_1_overall_pct: 'Visit 1 score',
  compliance_audit_1_date: 'Visit 1 date',
  compliance_audit_2_overall_pct: 'Visit 2 score',
  compliance_audit_2_date: 'Visit 2 date',
  compliance_audit_2_planned_date: 'Planned visit date',
  compliance_audit_2_assigned_manager_user_id: 'Assigned visit manager',
  compliance_audit_3_overall_pct: 'Visit 3 score',
  compliance_audit_3_date: 'Visit 3 date',
}

const CHANGE_FIELD_PRIORITY = [
  'compliance_audit_1_overall_pct',
  'compliance_audit_2_overall_pct',
  'compliance_audit_3_overall_pct',
  'compliance_audit_2_planned_date',
  'compliance_audit_2_assigned_manager_user_id',
  'route_sequence',
  'status',
  'due_date',
  'completed_at',
  'priority',
]

const IGNORED_CHANGE_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'performed_by_user_id',
  'reference_no',
  'area_average_pct',
  'total_audits_to_date',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toLabel(raw: string): string {
  return raw
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatEntityLabel(entityType: string): string {
  const normalized = String(entityType || '').trim().toLowerCase()
  if (!normalized) return 'Record'
  if (normalized === 'store') return 'Store'
  if (normalized === 'action') return 'Action'
  if (normalized === 'incident') return 'Incident'
  if (normalized === 'investigation') return 'Investigation'
  return toLabel(normalized)
}

function formatActionLabel(action: string): string {
  const normalized = String(action || '').trim().toUpperCase()
  if (!normalized) return 'updated'
  if (normalized === 'ROUTE_VISIT_COMPLETED') return 'route visit completed'
  if (normalized === 'ATTACHMENT_UPLOADED') return 'attachment uploaded'
  if (normalized === 'CREATED') return 'created'
  if (normalized === 'UPDATED') return 'updated'
  if (normalized === 'DELETED') return 'deleted'
  if (normalized === 'CLOSED') return 'closed'
  return normalized.toLowerCase().replace(/_/g, ' ')
}

function formatFieldLabel(field: string): string {
  return FIELD_LABELS[field] || toLabel(field)
}

function formatValue(value: unknown, field?: string): string {
  if (value === null || value === undefined) return 'blank'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    if (field && field.endsWith('_pct')) return `${value}%`
    return String(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return 'blank'
    if (isUuid(trimmed)) return 'assigned user'

    const isDateLike = /^\d{4}-\d{2}-\d{2}/.test(trimmed)
    if (isDateLike) {
      const parsed = new Date(trimmed)
      if (Number.isNaN(parsed.getTime())) return trimmed
      const hasTime = /T\d{2}:\d{2}/.test(trimmed)
      return hasTime
        ? formatAppDateTime(
            parsed,
            { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
            trimmed
          )
        : formatAppDate(parsed, { year: 'numeric', month: 'short', day: 'numeric' }, trimmed)
    }
    return trimmed
  }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (isRecord(value)) return 'updated'
  return String(value)
}

function getChangedFields(
  details: ActivityDetails | null | undefined
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  if (!isRecord(details)) return []
  const oldData = isRecord(details.old) ? details.old : null
  const newData = isRecord(details.new) ? details.new : null
  if (!oldData || !newData) return []

  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = []
  Object.keys(newData).forEach((field) => {
    if (IGNORED_CHANGE_FIELDS.has(field)) return
    const oldValue = oldData[field]
    const newValue = newData[field]
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field, oldValue, newValue })
    }
  })
  return changes
}

function sortChangedFields(
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const priority = new Map<string, number>(CHANGE_FIELD_PRIORITY.map((field, index) => [field, index]))
  return [...changes].sort((a, b) => {
    const aPriority = priority.get(a.field) ?? Number.MAX_SAFE_INTEGER
    const bPriority = priority.get(b.field) ?? Number.MAX_SAFE_INTEGER
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.field.localeCompare(b.field)
  })
}

function summarizeChange(change: { field: string; oldValue: unknown; newValue: unknown }): string {
  const label = formatFieldLabel(change.field)
  if ((change.oldValue === null || change.oldValue === undefined) && change.newValue !== null && change.newValue !== undefined) {
    return `${label} set to ${formatValue(change.newValue, change.field)}`
  }
  if ((change.newValue === null || change.newValue === undefined) && change.oldValue !== null && change.oldValue !== undefined) {
    return `${label} cleared`
  }
  return `${label}: ${formatValue(change.oldValue, change.field)} -> ${formatValue(change.newValue, change.field)}`
}

function formatLatestChange(activity: LatestActivity | null | undefined): string {
  if (!activity) return 'No field-level changes captured yet'

  const action = String(activity.action || '').toUpperCase()
  const details = activity.details

  if (action === 'ROUTE_VISIT_COMPLETED' && isRecord(details)) {
    const plannedDate = typeof details.planned_date === 'string' ? formatValue(details.planned_date, 'planned_date') : null
    const region = typeof details.region === 'string' && details.region.trim() ? details.region.trim() : null
    if (plannedDate && region) return `Completed planned visit on ${plannedDate} (${region})`
    if (plannedDate) return `Completed planned visit on ${plannedDate}`
    if (region) return `Completed planned visit (${region})`
    return 'Completed a planned route visit'
  }

  const sortedChanges = sortChangedFields(getChangedFields(details))
  if (sortedChanges.length > 0) {
    const topChanges = sortedChanges.slice(0, 2).map(summarizeChange)
    const remainder = sortedChanges.length - topChanges.length
    return remainder > 0 ? `${topChanges.join(' • ')} (+${remainder} more)` : topChanges.join(' • ')
  }

  if (action === 'CREATED') return 'Created a new record'
  if (action === 'DELETED') return 'Deleted a record'
  if (action === 'CLOSED') return 'Closed the record'
  return 'Updated record details'
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
}

function getEntityPageFallback(activity: LatestActivity | null | undefined): string | null {
  if (!activity?.entityType) return null
  const entityType = String(activity.entityType).toLowerCase()

  if (['incident', 'incidents', 'investigation', 'claim', 'closed_incident'].includes(entityType)) return '/incidents'
  if (['action', 'actions', 'store_action'].includes(entityType)) return '/actions'
  if (['store', 'stores'].includes(entityType)) return '/stores'
  if (['route', 'route_planning'].includes(entityType)) return '/route-planning'
  if (['fra', 'fire_risk_assessment'].includes(entityType)) return '/visit-tracker'
  if (['profile', 'user', 'users'].includes(entityType)) return '/admin'

  return null
}

function formatPagePath(path: string | null | undefined, activity?: LatestActivity | null): string {
  const resolvedPath = path || getEntityPageFallback(activity)
  if (!resolvedPath) return 'No tracked page yet'

  const normalizedPath = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`
  const cleaned = normalizedPath.split('?')[0].replace(/^\/+/, '')
  if (!cleaned) return 'Dashboard'
  return cleaned
    .split('/')
    .map((segment) =>
      segment
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    )
    .join(' / ')
}

function formatLatestAction(activity: LatestActivity | null | undefined): string {
  if (!activity) return 'No recent logged action'
  const entity = formatEntityLabel(activity.entityType)
  const action = formatActionLabel(activity.action)
  return `${entity} ${action}`.trim()
}

function formatTime(value: string | null | undefined, fallbackValue?: string | null | undefined): string {
  const candidate = value || fallbackValue
  if (!candidate) return 'No timestamp yet'
  return formatAppTime(candidate, {}, 'No timestamp yet')
}

function getMetaTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NEGATIVE_INFINITY
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts
}

function pickBestPresenceMeta(
  metas: Array<{ name?: string; userName?: string; page?: string; lastSeen?: string }>
): { name?: string; userName?: string; page?: string; lastSeen?: string } {
  if (!Array.isArray(metas) || metas.length === 0) return {}

  return metas.reduce((best, current) => {
    const bestTs = getMetaTimestamp(best.lastSeen)
    const currentTs = getMetaTimestamp(current.lastSeen)

    if (currentTs > bestTs) return current
    if (currentTs < bestTs) return best

    const bestHasPage = typeof best.page === 'string' && best.page.trim().length > 0
    const currentHasPage = typeof current.page === 'string' && current.page.trim().length > 0
    if (!bestHasPage && currentHasPage) return current

    const bestHasName = typeof best.name === 'string' && best.name.trim().length > 0
    const currentHasName = typeof current.name === 'string' && current.name.trim().length > 0
    if (!bestHasName && currentHasName) return current

    return best
  }, metas[0] || {})
}

export function HeaderClient({ signOut, currentUser }: HeaderClientProps) {
  const { isOpen, setIsOpen } = useSidebar()
  const pathname = usePathname()
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([
    { id: currentUser.id, name: currentUser.name, page: pathname || '/', lastSeen: null },
  ])
  const [latestActivityByUser, setLatestActivityByUser] = useState<Record<string, LatestActivity>>({})
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const headerRef = useRef<HTMLElement | null>(null)
  const logoutFormRef = useRef<HTMLFormElement | null>(null)
  const presenceChannelRef = useRef<any>(null)

  const presenceKey = useMemo(() => {
    if (currentUser.id && currentUser.id !== 'unknown-user') return currentUser.id
    return `fallback-${currentUser.name.trim().toLowerCase().replace(/\s+/g, '-') || 'user'}`
  }, [currentUser.id, currentUser.name])

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  useEffect(() => {
    const root = document.documentElement
    const updateMobileHeaderHeight = () => {
      const headerHeight =
        window.innerWidth < 768
          ? Math.ceil(headerRef.current?.getBoundingClientRect().height || 0)
          : 0
      root.style.setProperty('--mobile-header-height', `${headerHeight}px`)
    }

    updateMobileHeaderHeight()

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateMobileHeaderHeight())
        : null

    if (headerRef.current && resizeObserver) {
      resizeObserver.observe(headerRef.current)
    }

    window.addEventListener('resize', updateMobileHeaderHeight)

    return () => {
      window.removeEventListener('resize', updateMobileHeaderHeight)
      resizeObserver?.disconnect()
      root.style.setProperty('--mobile-header-height', '0px')
    }
  }, [])

  // Absolute session timeout: warn at 9 hours, auto-logout at 10 hours.
  useEffect(() => {
    const WARNING_MS = 9 * 60 * 60 * 1000
    const TOTAL_MS = 10 * 60 * 60 * 1000

    const warningTimeout = window.setTimeout(() => {
      setSecondsRemaining(60 * 60) // 1 hour countdown
      setShowTimeoutWarning(true)
    }, WARNING_MS)

    const logoutTimeout = window.setTimeout(() => {
      if (logoutFormRef.current) {
        logoutFormRef.current.requestSubmit()
      }
    }, TOTAL_MS)

    return () => {
      window.clearTimeout(warningTimeout)
      window.clearTimeout(logoutTimeout)
    }
  }, [])

  // Countdown timer once the warning is visible.
  useEffect(() => {
    if (!showTimeoutWarning) return

    const interval = window.setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [showTimeoutWarning])

  const formatRemaining = () => {
    const minutes = Math.floor(secondsRemaining / 60)
    const seconds = secondsRemaining % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const handleStaySignedIn = () => {
    setShowTimeoutWarning(false)
    setSecondsRemaining(0)
    // Reload to reset timers and refresh any session tokens.
    window.location.reload()
  }

  useEffect(() => {
    const supabase = createClient()
    const initialPage = window.location.pathname || '/'
    const channel = supabase.channel('fa-online-users', {
      config: {
        presence: { key: presenceKey },
      },
    })
    presenceChannelRef.current = channel

    const syncUsers = () => {
      const state = channel.presenceState<Record<string, Array<{ name?: string; userName?: string; page?: string; lastSeen?: string }>>>()
      const userMap = new Map<string, OnlineUser>()

      Object.entries(state).forEach(([key, metas]) => {
        const normalizedMetas = (Array.isArray(metas) ? metas : []) as Array<{
          name?: string
          userName?: string
          page?: string
          lastSeen?: string
        }>
        const meta = pickBestPresenceMeta(normalizedMetas)
        const explicitName = typeof meta.name === 'string' ? meta.name.trim() : ''
        const fallbackMetaName = typeof meta.userName === 'string' ? meta.userName.trim() : ''
        const userName = explicitName || fallbackMetaName || (key === presenceKey ? currentUser.name : 'User')
        userMap.set(key, {
          id: key,
          name: userName,
          page: typeof meta.page === 'string' ? meta.page : null,
          lastSeen: typeof meta.lastSeen === 'string' ? meta.lastSeen : null,
        })
      })

      if (!userMap.has(presenceKey)) {
        userMap.set(presenceKey, {
          id: presenceKey,
          name: currentUser.name,
          page: initialPage,
          lastSeen: new Date().toISOString(),
        })
      }

      const users = Array.from(userMap.values())
        .sort((a, b) => {
          if (a.id === presenceKey) return -1
          if (b.id === presenceKey) return 1
          return a.name.localeCompare(b.name)
        })

      setOnlineUsers(users)
    }

    channel
      .on('presence', { event: 'sync' }, syncUsers)
      .on('presence', { event: 'join' }, syncUsers)
      .on('presence', { event: 'leave' }, syncUsers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            name: currentUser.name,
            page: initialPage,
            lastSeen: new Date().toISOString(),
          })
        }
      })

    return () => {
      presenceChannelRef.current = null
      void channel.untrack()
      void supabase.removeChannel(channel)
    }
  }, [currentUser.name, presenceKey])

  useEffect(() => {
    const channel = presenceChannelRef.current
    if (!channel) return

    void channel.track({
      name: currentUser.name,
      page: pathname || '/',
      lastSeen: new Date().toISOString(),
    })
  }, [pathname, currentUser.name])

  useEffect(() => {
    if (currentUser.role !== 'admin') return
    if (onlineUsers.length === 0) return

    const supabase = createClient()

    const fetchLatestActivity = async () => {
      const userIds = onlineUsers.map((user) => user.id).filter(isUuid)
      if (userIds.length === 0) {
        setLatestActivityByUser({})
        return
      }

      const { data, error } = await supabase
        .from('tfs_activity_log')
        .select('performed_by_user_id, entity_type, entity_id, action, created_at, details')
        .in('performed_by_user_id', userIds)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error || !data) return

      const latestByUser: Record<string, LatestActivity> = {}
      data.forEach((row: any) => {
        const userId = String(row.performed_by_user_id || '')
        if (!userId || latestByUser[userId]) return
        latestByUser[userId] = {
          action: String(row.action || ''),
          entityType: String(row.entity_type || ''),
          entityId: row.entity_id ? String(row.entity_id) : null,
          createdAt: String(row.created_at || ''),
          details: isRecord(row.details) ? (row.details as ActivityDetails) : null,
        }
      })

      setLatestActivityByUser(latestByUser)
    }

    void fetchLatestActivity()
    const interval = window.setInterval(fetchLatestActivity, 20000)

    return () => {
      window.clearInterval(interval)
    }
  }, [currentUser.role, onlineUsers])

  const visibleUsers = onlineUsers.slice(0, 5)
  const mobileVisibleUsers = visibleUsers.slice(0, 2)
  const overflowCount = Math.max(onlineUsers.length - visibleUsers.length, 0)
  const mobileOverflowCount = Math.max(onlineUsers.length - mobileVisibleUsers.length, 0)
  const isAdmin = currentUser.role === 'admin'
  const mobilePageTitle = getMobilePageTitle(pathname || '/')

  return (
    <header
      ref={headerRef}
      className="no-print fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-[linear-gradient(180deg,rgba(28,2,89,0.98)_0%,rgba(35,33,84,0.95)_100%)] px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:relative md:flex md:h-16 md:items-center md:justify-between md:border-b-0 md:bg-[#232154] md:px-6 md:pt-0 lg:px-8"
    >
      <div className="flex w-full flex-col gap-3.5 pb-4 pt-3 md:flex-row md:items-center md:justify-between md:gap-4 md:pb-0 md:pt-0">
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={handleMenuClick}
            className={cn(
              'relative z-[100] flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[18px] border border-white/10 bg-white/8 p-2 text-white shadow-[0_8px_20px_rgba(2,12,24,0.18)] transition-colors hover:bg-white/12 active:bg-white/20 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40 touch-manipulation cursor-pointer',
              isOpen && 'bg-white/14'
            )}
            aria-label="Toggle navigation menu"
            aria-expanded={isOpen}
            type="button"
          >
            <Menu className="h-6 w-6 text-white pointer-events-none" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-white/55">
              The Fragrance Shop
            </p>
            <h1 className="truncate text-[1.08rem] font-semibold tracking-[-0.01em] text-white">{mobilePageTitle}</h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5" aria-label="Currently online users">
              {mobileVisibleUsers.map((user) => (
                <div key={user.id} title={user.name} className="relative">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(2,12,24,0.14)] backdrop-blur-sm">
                    {getInitials(user.name)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0e1925] bg-emerald-400" />
                </div>
              ))}
              {mobileOverflowCount > 0 ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(2,12,24,0.14)] backdrop-blur-sm">
                  +{mobileOverflowCount}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => logoutFormRef.current?.requestSubmit()}
              className="h-10 w-10 rounded-full border border-white/10 bg-white/8 p-0 text-white shadow-[0_8px_18px_rgba(2,12,24,0.14)] hover:bg-white/12 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Log Out</span>
            </Button>
          </div>
        </div>

        <div className="md:hidden">
          <StoreSearch />
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex md:gap-4">
          <button
            onClick={handleMenuClick}
            className={cn(
              'relative z-[100] hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl bg-white/5 p-2 text-white transition-colors hover:bg-white/10 active:bg-white/20 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50 touch-manipulation cursor-pointer md:hidden',
              isOpen && 'bg-white/10'
            )}
            aria-label="Toggle navigation menu"
            aria-expanded={isOpen}
            type="button"
          >
            <Menu className="h-6 w-6 text-white pointer-events-none" />
          </button>

          <StoreSearch />
        </div>

        <div className="hidden items-center gap-2 md:flex md:gap-4">
          <div className="flex items-center gap-2" aria-label="Currently online users">
          {visibleUsers.map((user) => (
            <div
              key={user.id}
              title={user.name}
              className="group relative"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-bold text-white backdrop-blur-sm md:h-9 md:w-9 md:text-xs">
                {getInitials(user.name)}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0e1925] bg-emerald-400" />

              {isAdmin ? (
                <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-72 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg group-hover:block">
                  <p className="font-semibold text-slate-900">{user.name}</p>
                  <p className="mt-1 text-slate-600">
                    <span className="font-semibold text-slate-800">Page:</span> {formatPagePath(user.page, latestActivityByUser[user.id])}
                  </p>
                  <p className="mt-1 text-slate-600">
                    <span className="font-semibold text-slate-800">Latest action:</span>{' '}
                    {formatLatestAction(latestActivityByUser[user.id])}
                  </p>
                  <p className="mt-1 text-slate-600 break-words">
                    <span className="font-semibold text-slate-800">Updated:</span>{' '}
                    {formatLatestChange(latestActivityByUser[user.id])}
                  </p>
                  <p className="mt-1 text-slate-600">
                    <span className="font-semibold text-slate-800">Seen:</span>{' '}
                    {formatTime(user.lastSeen, latestActivityByUser[user.id]?.createdAt)}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
          {overflowCount > 0 ? (
            <div
              title={`${overflowCount} more online`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-bold text-white backdrop-blur-sm md:h-9 md:w-9 md:text-xs"
            >
              +{overflowCount}
            </div>
          ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => logoutFormRef.current?.requestSubmit()}
            className="min-h-[44px] rounded-2xl px-3 text-white hover:bg-white/10 hover:text-white md:rounded-full md:px-4"
          >
            <LogOut className="mr-2 h-4 w-4 md:h-5 md:w-5" />
            <span className="hidden sm:inline">Log Out</span>
          </Button>
        </div>
      </div>
      <form action={signOut} ref={logoutFormRef} className="hidden" />

      <Dialog open={showTimeoutWarning} onOpenChange={setShowTimeoutWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Session expiring soon
            </DialogTitle>
            <DialogDescription>
              You&apos;ve been signed in for 9 hours. For security, you&apos;ll be logged out automatically in 1 hour
              unless you choose to stay signed in.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 text-sm">
            <p className="mb-1 font-medium">Time remaining before auto log out:</p>
            <p className="text-2xl font-mono font-semibold text-amber-600">{formatRemaining()}</p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => logoutFormRef.current?.requestSubmit()}
            >
              Log out now
            </Button>
            <Button onClick={handleStaySignedIn}>
              I&apos;m still here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
