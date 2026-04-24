import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bug,
  Calendar,
  CheckSquare,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  Route,
  Settings,
  ShieldCheck,
  Store,
} from 'lucide-react'
import type React from 'react'

export type UserRole = 'admin' | 'ops' | 'readonly' | 'client' | 'pending'

export type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  clientHidden?: boolean
  allowedRoles?: UserRole[]
  action?: 'feedback'
}

export type NavSection = {
  id: 'overview' | 'operations' | 'stores' | 'planning' | 'reports' | 'admin'
  label: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { href: '/queue', label: 'Queue', icon: Inbox },
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/activity', label: 'Recent Activity', icon: Activity, clientHidden: true },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
      { href: '/theft-tracker', label: 'Theft Log', icon: AlertTriangle },
      { href: '/actions', label: 'Actions', icon: CheckSquare },
    ],
  },
  {
    id: 'stores',
    label: 'Stores',
    items: [
      { href: '/visit-tracker', label: 'Store Visits', icon: ClipboardList },
      { href: '/stores', label: 'Store CRM', icon: Store },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    items: [
      { href: '/route-planning', label: 'Route Planning', icon: Route, clientHidden: true, allowedRoles: ['admin', 'ops'] },
      { href: '/calendar', label: 'Calendar', icon: Calendar },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { href: '/reports', label: 'Reports', icon: FileText },
      { href: '/monthly-reports', label: 'Monthly Reports', icon: BarChart3, allowedRoles: ['admin', 'ops', 'readonly'] },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { href: '/help', label: 'Compliance / GDPR', icon: ShieldCheck },
      { href: '/admin', label: 'Admin', icon: Settings, adminOnly: true },
    ],
  },
]

export const utilityNavItems: NavItem[] = [
  { href: '#feedback', label: 'Report a Bug', icon: Bug, action: 'feedback' },
]

function canSeeNavItem(item: NavItem, userRole?: UserRole | null): boolean {
  if (userRole === 'admin') {
    return !item.allowedRoles || item.allowedRoles.includes('admin')
  }
  if (userRole === 'client') {
    return !item.adminOnly && !item.clientHidden && (!item.allowedRoles || item.allowedRoles.includes('client'))
  }
  if (userRole === 'ops') {
    return !item.adminOnly && (!item.allowedRoles || item.allowedRoles.includes('ops'))
  }
  if (userRole === 'readonly') {
    return !item.adminOnly && (!item.allowedRoles || item.allowedRoles.includes('readonly'))
  }
  if (userRole === 'pending') {
    return !item.adminOnly && !item.clientHidden && (!item.allowedRoles || item.allowedRoles.includes('pending'))
  }
  return !item.adminOnly && !item.clientHidden
}

export function getVisibleNavSections(userRole?: UserRole | null): NavSection[] {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canSeeNavItem(item, userRole)),
    }))
    .filter((section) => section.items.length > 0)
}

export function getVisibleUtilityNavItems(userRole?: UserRole | null): NavItem[] {
  return utilityNavItems.filter((item) => canSeeNavItem(item, userRole))
}

export function getVisibleNavItems(userRole?: UserRole | null): NavItem[] {
  return getVisibleNavSections(userRole).flatMap((section) => section.items)
}
