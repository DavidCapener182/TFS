import {
  AlertTriangle,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Store,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { UserRole } from '@/lib/auth'

import { getVisibleNavItems } from './nav-items'

export type MobileTabItem = {
  href: string
  label: string
  icon: LucideIcon
}

const mobileTabItems: MobileTabItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/queue', label: 'Queue', icon: Inbox },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/visit-tracker', label: 'Visits', icon: ClipboardList },
]

export function matchesMobilePath(pathname: string, href: string): boolean {
  if (href === '/' || href === '/dashboard') {
    return pathname === '/' || pathname === '/dashboard'
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function getMobileTabItems(_userRole?: UserRole | null): MobileTabItem[] {
  return mobileTabItems
}

export function getMobileMoreItems(userRole?: UserRole | null): MobileTabItem[] {
  const primaryHrefs = new Set(['/', '/dashboard', ...getMobileTabItems(userRole).map((item) => item.href)])
  const canSeeAudit = userRole === 'admin' || userRole === 'ops' || userRole === 'readonly'
  const visibleByHref = new Map(getVisibleNavItems(userRole).map((item) => [item.href, item]))
  const moreItems: MobileTabItem[] = []

  const appendVisible = (href: string, label: string, icon: LucideIcon) => {
    if (primaryHrefs.has(href) || !visibleByHref.has(href)) return
    moreItems.push({ href, label, icon })
  }

  appendVisible('/theft-tracker', 'Theft log', AlertTriangle)
  appendVisible('/stores', 'Stores', Store)
  appendVisible('/reports', 'Reports', FileText)

  if (canSeeAudit) {
    moreItems.push({
      href: '/audit-tracker',
      label: 'Audit',
      icon: ShieldCheck,
    })
  }

  if (userRole === 'admin' && visibleByHref.has('/admin')) {
    moreItems.push({
      href: '/admin',
      label: 'Admin',
      icon: Settings,
    })
  }

  return moreItems
}

export function isPrimaryMobilePath(pathname: string, userRole?: UserRole | null): boolean {
  return getMobileTabItems(userRole).some((tab) => matchesMobilePath(pathname, tab.href))
}

export function getMobilePageTitle(pathname: string, userRole?: UserRole | null): string {
  if (!pathname || pathname === '/') return 'Dashboard'

  const visibleItems = getVisibleNavItems(userRole)
  const match = visibleItems.find((item) => matchesMobilePath(pathname, item.href))
  if (match) return match.label

  const segment = pathname
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .pop()

  if (!segment) return 'Dashboard'

  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
