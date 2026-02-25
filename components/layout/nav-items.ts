import {
  AlertTriangle,
  CheckSquare,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  Store,
  Route,
  Flame,
  Calendar,
} from 'lucide-react'
import type React from 'react'

export type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  clientHidden?: boolean
  allowedRoles?: Array<'admin' | 'ops' | 'readonly' | 'client' | 'pending'>
}

export const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/actions', label: 'Actions', icon: CheckSquare },
  { href: '/stores', label: 'Stores / CRM', icon: Store },
  { href: '/audit-tracker', label: 'Audit Tracker', icon: ClipboardList },
  { href: '/fire-risk-assessment', label: 'Fire Risk Assessment', icon: Flame },
  { href: '/route-planning', label: 'Route Planning', icon: Route, clientHidden: true, allowedRoles: ['admin', 'ops'] },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/admin', label: 'Admin', icon: Settings, adminOnly: true },
]
