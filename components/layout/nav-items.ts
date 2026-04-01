import {
  AlertTriangle,
  CheckSquare,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Mail,
  Settings,
  Store,
  Route,
  Calendar,
  Bug,
  ShieldCheck,
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
  parentHref?: string
}

export const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/actions', label: 'Actions', icon: CheckSquare },
  { href: '/inbound-emails', label: 'Inbound Emails', icon: Mail, allowedRoles: ['admin', 'ops'] },
  { href: '/visit-tracker', label: 'Stores', icon: ClipboardList },
  { href: '/stores', label: 'CRM', icon: Store, parentHref: '/visit-tracker' },
  { href: '/route-planning', label: 'Route Planning', icon: Route, clientHidden: true, allowedRoles: ['admin', 'ops'] },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/help', label: 'GDPR', icon: ShieldCheck },
  { href: '#feedback', label: 'Report a Bug', icon: Bug, action: 'feedback' },
  { href: '/admin', label: 'Admin', icon: Settings, adminOnly: true },
]
