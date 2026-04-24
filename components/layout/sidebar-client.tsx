'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { FileText, Settings, User, Activity, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserRole, UserProfile } from '@/lib/auth'
import { useSidebar } from './sidebar-provider'
import { navItems, type NavItem } from './nav-items'
import { FeedbackModal } from '@/components/FeedbackModal'
import { AutoParseInboundEmails } from '@/components/inbound-emails/auto-parse-inbound-emails'

const activityItem: NavItem = {
  href: '/activity',
  label: 'Recent Activity',
  icon: Activity,
  section: 'system',
  clientHidden: true,
}
const allNavItems = [...navItems, activityItem]
const navSections: Array<{ id: NonNullable<NavItem['section']>; label: string }> = [
  { id: 'operations', label: 'Operations' },
  { id: 'loss-prevention', label: 'Loss Prevention' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'system', label: 'System' },
]

interface SidebarClientProps {
  userRole?: UserRole | null
  userProfile?: UserProfile | null
  pendingInboundEmailCount?: number
}

export function SidebarClient({ userRole, userProfile, pendingInboundEmailCount = 0 }: SidebarClientProps) {
  const pathname = usePathname()
  const currentPath = pathname ?? '/'
  const { isOpen, setIsOpen } = useSidebar()
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const filteredItems = (() => {
    if (userRole === 'admin') {
      // Admin sees everything (respect role-restricted items)
      return allNavItems.filter(item => !item.allowedRoles || item.allowedRoles.includes('admin'))
    } else if (userRole === 'client') {
      // Client role: hide adminOnly, clientHidden, and role-restricted items
      return allNavItems.filter(item => !item.adminOnly && !item.clientHidden && (!item.allowedRoles || item.allowedRoles.includes('client')))
    } else if (userRole === 'ops') {
      return allNavItems.filter(item => !item.adminOnly && (!item.allowedRoles || item.allowedRoles.includes('ops')))
    } else if (userRole === 'readonly') {
      return allNavItems.filter(item => !item.adminOnly && (!item.allowedRoles || item.allowedRoles.includes('readonly')))
    } else if (userRole === 'pending') {
      return allNavItems.filter(item => !item.adminOnly && !item.clientHidden && (!item.allowedRoles || item.allowedRoles.includes('pending')))
    }
    return allNavItems.filter(item => !item.adminOnly && !item.clientHidden)
  })()

  const rootItems = filteredItems.filter((item) => !item.parentHref)
  const childItemsByParent = filteredItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!item.parentHref) return acc
    acc[item.parentHref] = [...(acc[item.parentHref] || []), item]
    return acc
  }, {})
  const groupedRootItems = navSections
    .map((section) => ({
      ...section,
      items: rootItems.filter((item) => item.section === section.id),
    }))
    .filter((section) => section.items.length > 0)

  const isPathActive = (href: string) => currentPath === href || (href !== '/' && currentPath.startsWith(href))

  // Close mobile menu when route changes
  useEffect(() => {
    if (isOpen) {
      setIsOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-5 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:h-20 md:px-6 md:py-0">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-28 md:h-20 md:w-44">
            <Image
              src="/tfs-logo.svg"
              alt="The Fragrance Shop"
              fill
              sizes="176px"
              className="object-contain"
            />
          </div>
          <div className="min-w-0 md:hidden">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#4b3a78]">The Fragrance Shop</p>
            <p className="text-sm font-semibold text-slate-900">Navigation</p>
          </div>
          <span className="sr-only">The Fragrance Shop</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 md:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5 text-slate-600" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 pb-4">
        <ul className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/85 shadow-[0_16px_30px_rgba(15,23,42,0.08)] md:space-y-1.5 md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
          {groupedRootItems.map((section) => (
            <li key={section.id} className="border-t border-slate-100 first:border-t-0 md:border-t-0">
              <div className="px-4 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 md:px-3 md:pt-2 md:text-[10px] md:text-white/60">
                {section.label}
              </div>
              <ul>
                {section.items.map((item) => {
            const Icon = item.icon
            const childItems = childItemsByParent[item.href] || []
            const childActive = childItems.some((child) => isPathActive(child.href))
            const isActive = !item.action && (isPathActive(item.href) || childActive)

            if (item.action === 'feedback') {
              return (
                <li key={item.href} className="border-t border-slate-100 first:border-t-0 md:border-t-0">
                  <button
                    onClick={() => { setIsOpen(false); setFeedbackOpen(true) }}
                    className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-[15px] font-medium text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900 md:min-h-[48px] md:rounded-2xl md:text-sm md:text-white/80 md:hover:bg-white/10 md:hover:text-white"
                  >
                    <Icon className="h-5 w-5 flex-shrink-0 text-slate-400 md:text-white/70" />
                    {item.label}
                  </button>
                </li>
              )
            }

            return (
              <li key={item.href} className="border-t border-slate-100 first:border-t-0 md:border-t-0">
                <Link
                  href={item.href}
                  prefetch={false}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex min-h-[52px] items-center gap-3 px-4 py-3 text-[15px] font-medium transition-all md:min-h-[48px] md:rounded-2xl md:text-sm',
                    isActive
                      ? 'bg-white text-slate-950 font-semibold shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)] md:bg-white md:text-slate-950 md:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 md:text-white/80 md:hover:bg-white/10 md:hover:text-white'
                  )}
                >
                  <Icon className={cn('h-5 w-5 flex-shrink-0', isActive ? 'text-slate-900 md:text-slate-900' : 'text-slate-400 md:text-white/70')} />
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{item.label}</span>
                    {item.href === '/inbound-emails' && pendingInboundEmailCount > 0 ? (
                      <span
                        className={cn(
                          'inline-flex min-w-[1.4rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          isActive
                            ? 'bg-red-100 text-red-700'
                            : 'bg-red-500 text-white md:bg-white md:text-[#1c0259]'
                        )}
                      >
                        {pendingInboundEmailCount > 99 ? '99+' : pendingInboundEmailCount}
                      </span>
                    ) : null}
                  </span>
                </Link>
                {childItems.length > 0 ? (
                  <ul className="pb-2 pl-6 pr-3 md:pb-0 md:pl-9 md:pr-0">
                    {childItems.map((child) => {
                      const isChildActive = isPathActive(child.href)

                      return (
                        <li key={child.href} className="pt-1.5 md:pt-1">
                          <Link
                            href={child.href}
                            prefetch={false}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                              'flex min-h-[40px] items-center gap-2 rounded-2xl px-3 py-2 text-[13px] transition-all md:min-h-[38px] md:text-xs',
                              isChildActive
                                ? 'bg-slate-100 text-slate-950 font-semibold md:bg-white md:text-slate-950 md:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 md:text-white/65 md:hover:bg-white/8 md:hover:text-slate-950'
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                                isChildActive ? 'bg-slate-900 md:bg-slate-900' : 'bg-slate-300 md:bg-white/35'
                              )}
                            />
                            {child.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 pt-2">
        <div className="flex items-center gap-3 rounded-[28px] border border-slate-200 bg-white/85 px-4 py-3 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm md:rounded-[24px] md:border-white/10 md:bg-white/10 md:shadow-none">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#232154] md:bg-white/16">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 md:text-white">
              {userProfile?.full_name || 'User'}
            </p>
          </div>
        </div>
      </div>
    </>
  )

  // Desktop sidebar (always visible)
  return (
    <>
      <AutoParseInboundEmails pendingCount={pendingInboundEmailCount} />
      {/* Desktop Sidebar - hidden when printing */}
      <aside className="no-print hidden md:flex w-64 flex-col h-screen-zoom bg-[linear-gradient(180deg,#1c0259_0%,#232154_60%,#2a265f_100%)] fixed left-0 top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      <>
        {/* Overlay */}
        {isOpen && (
          <div
            className="fixed inset-0 z-[60] bg-[#0b1320]/28 backdrop-blur-sm md:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile Sidebar - hidden when printing */}
        <aside
          className={cn(
            'no-print fixed left-0 top-0 z-[70] flex h-screen-zoom w-[86vw] max-w-[348px] flex-col rounded-r-[32px] border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(236,242,247,0.98)_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.22)] transition-all duration-300 ease-in-out safe-bottom touch-pan-y md:hidden',
            isOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-full opacity-0 pointer-events-none'
          )}
          aria-hidden={!isOpen}
          aria-label="Navigation menu"
        >
          {sidebarContent}
        </aside>
      </>

      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
