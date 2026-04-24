import {
  AlertTriangle,
  BarChart3,
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
  section?: 'operations' | 'loss-prevention' | 'reporting' | 'system'
  adminOnly?: boolean
  clientHidden?: boolean
  allowedRoles?: Array<'admin' | 'ops' | 'readonly' | 'client' | 'pending'>
  action?: 'feedback'
  parentHref?: string
}

export const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'operations' },
  { href: '/visit-tracker', label: 'Stores', icon: ClipboardList, section: 'operations' },
  { href: '/stores', label: 'CRM', icon: Store, parentHref: '/visit-tracker', section: 'operations' },
  {
    href: '/route-planning',
    label: 'Route Planning',
    icon: Route,
    section: 'operations',
    clientHidden: true,
    allowedRoles: ['admin', 'ops'],
  },
  { href: '/calendar', label: 'Calendar', icon: Calendar, section: 'operations' },

  { href: '/theft-tracker', label: 'Theft log', icon: AlertTriangle, section: 'loss-prevention' },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle, section: 'loss-prevention' },
  { href: '/actions', label: 'Actions', icon: CheckSquare, section: 'loss-prevention' },
  {
    href: '/inbound-emails',
    label: 'Inbound Emails',
    icon: Mail,
    section: 'loss-prevention',
    allowedRoles: ['admin', 'ops'],
  },

  { href: '/reports', label: 'Reports', icon: FileText, section: 'reporting' },
  {
    href: '/monthly-reports',
    label: 'Monthly Reports',
    icon: BarChart3,
    section: 'reporting',
    allowedRoles: ['admin', 'ops', 'readonly'],
  },
  { href: '/help', label: 'GDPR', icon: ShieldCheck, section: 'reporting' },

  { href: '/admin', label: 'Admin', icon: Settings, section: 'system', adminOnly: true },
  { href: '#feedback', label: 'Report a Bug', icon: Bug, section: 'system', action: 'feedback' },
]
