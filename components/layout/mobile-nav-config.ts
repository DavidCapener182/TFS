import { AlertTriangle, ClipboardList, FileText, Inbox } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { UserRole } from '@/lib/auth'

import { getVisibleNavItems } from './nav-items'

export type MobileTabItem = {
  href: string
  label: string
  icon: LucideIcon
}

const mobileTabItems: MobileTabItem[] = [
  { href: '/queue', label: 'Queue', icon: Inbox },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/visit-tracker', label: 'Stores', icon: ClipboardList },
  { href: '/reports', label: 'Reports', icon: FileText },
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
  const primaryHrefs = new Set(['/','/dashboard', ...getMobileTabItems(userRole).map((item) => item.href)])

  return getVisibleNavItems(userRole)
    .filter((item) => !item.action && !primaryHrefs.has(item.href))
    .map((item) => ({
      href: item.href,
      label: item.label.length > 18 ? item.label.replace('Compliance / ', '') : item.label,
      icon: item.icon as LucideIcon,
    }))
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
