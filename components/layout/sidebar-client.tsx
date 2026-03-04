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

// Add activity item (not in main nav-items but needed for sidebar)
const activityItem: NavItem = { href: '/activity', label: 'Recent Activity', icon: Activity, clientHidden: true }
const allNavItems = [...navItems, activityItem]

interface SidebarClientProps {
  userRole?: UserRole | null
  userProfile?: UserProfile | null
}

export function SidebarClient({ userRole, userProfile }: SidebarClientProps) {
  const pathname = usePathname()
  const { isOpen, setIsOpen } = useSidebar()

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
      <div className="flex h-20 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="relative h-20 w-48">
            <Image
              src="/fa-logo.png"
              alt="KSS Assurance"
              fill
              sizes="192px"
              className="object-contain"
              style={{ top: 4, left: 24 }}
              priority
            />
          </div>
          <span className="sr-only">KSS Assurance</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Close menu"
        >
          <X className="h-5 w-5 text-white" />
        </button>
      </div>
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-2">
          {filteredItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all min-h-[44px] rounded-lg',
                    isActive
                      ? 'bg-white/20 text-white rounded-lg font-semibold'
                      : 'text-white/80 hover:bg-white/10 hover:text-white rounded-lg'
                  )}
                >
                  <Icon className={cn('h-5 w-5 flex-shrink-0', isActive ? 'text-white' : 'text-white/70')} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="p-4">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
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
      {/* Desktop Sidebar - hidden when printing */}
      <aside className="no-print hidden md:flex w-64 flex-col h-screen-zoom bg-[#0e1925] fixed left-0 top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      <>
        {/* Overlay */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-[60] md:hidden backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile Sidebar - hidden when printing */}
        <aside
          className={cn(
            'no-print fixed top-0 left-0 z-[70] w-64 h-screen-zoom bg-[#0e1925] flex flex-col transition-transform duration-300 ease-in-out md:hidden shadow-2xl safe-top safe-bottom touch-pan-y',
            isOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          aria-hidden={!isOpen}
          aria-label="Navigation menu"
        >
          {sidebarContent}
        </aside>
      </>
    </>
  )
}

