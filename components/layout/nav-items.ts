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
  Bug,
  Megaphone,
} from 'lucide-react'
import type React from 'react'

export type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  clientHidden?: boolean
  allowedRoles?: Array<'admin' | 'ops' | 'readonly' | 'client' | 'pending'>
  action?: 'feedback'
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
  { href: '#feedback', label: 'Report a Bug', icon: Bug, action: 'feedback' },
  { href: '/admin', label: 'Admin', icon: Settings, adminOnly: true },
  { href: '/admin/bugs', label: 'Bug Tracking', icon: Megaphone, adminOnly: true },
  { href: '/admin/releases', label: 'Release Notes', icon: FileText, adminOnly: true },
]
