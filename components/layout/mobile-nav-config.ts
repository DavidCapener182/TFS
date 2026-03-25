import { AlertTriangle, Calendar, ClipboardList, LayoutDashboard, Route, Store } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '@/lib/auth'
import { navItems } from './nav-items'

export type MobileTabItem = {
  href: string
  label: string
  icon: LucideIcon
}

const defaultMobileTabItems: MobileTabItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/stores', label: 'Stores', icon: Store },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
]

const opsMobileTabItems: MobileTabItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/visit-tracker', label: 'Visits', icon: ClipboardList },
  { href: '/route-planning', label: 'Routes', icon: Route },
]

const mobilePageTitles: Array<{ href: string; title: string }> = [
  { href: '/dashboard', title: 'Dashboard' },
  { href: '/incidents', title: 'Incidents' },
  { href: '/actions', title: 'Actions' },
  { href: '/stores', title: 'Stores' },
  { href: '/visit-tracker', title: 'Visit Tracker' },
  { href: '/route-planning', title: 'Route Planning' },
  { href: '/calendar', title: 'Calendar' },
  { href: '/reports', title: 'Reports' },
  { href: '/help', title: 'GDPR' },
  { href: '/admin', title: 'Admin' },
  { href: '/activity', title: 'Recent Activity' },
]

export function matchesMobilePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function getMobileTabItems(userRole?: UserRole | null): MobileTabItem[] {
  return userRole === 'admin' || userRole === 'ops' ? opsMobileTabItems : defaultMobileTabItems
}

export function getMobileMoreItems(userRole?: UserRole | null): MobileTabItem[] {
  const primaryHrefs = new Set(getMobileTabItems(userRole).map((item) => item.href))

  return navItems
    .filter((item) => {
      if (item.action) return false
      if (primaryHrefs.has(item.href)) return false
      if (userRole === 'admin') return !item.allowedRoles || item.allowedRoles.includes('admin')
      if (userRole === 'client') return !item.adminOnly && !item.clientHidden && (!item.allowedRoles || item.allowedRoles.includes('client'))
      if (userRole === 'ops') return !item.adminOnly && (!item.allowedRoles || item.allowedRoles.includes('ops'))
      if (userRole === 'readonly') return !item.adminOnly && (!item.allowedRoles || item.allowedRoles.includes('readonly'))
      if (userRole === 'pending') return !item.adminOnly && !item.clientHidden && (!item.allowedRoles || item.allowedRoles.includes('pending'))
      return !item.adminOnly && !item.clientHidden
    })
    .map((item) => ({
      href: item.href,
      label: item.label.length > 16 ? item.label.replace(' Assessment', '') : item.label,
      icon: item.icon as LucideIcon,
    }))
}

export function isPrimaryMobilePath(pathname: string, userRole?: UserRole | null): boolean {
  return getMobileTabItems(userRole).some((tab) => matchesMobilePath(pathname, tab.href))
}

export function getMobilePageTitle(pathname: string): string {
  if (!pathname || pathname === '/') return 'Dashboard'

  const match = mobilePageTitles.find((item) => matchesMobilePath(pathname, item.href))
  if (match) return match.title

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
