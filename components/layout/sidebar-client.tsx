'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, X } from 'lucide-react'

import { FeedbackModal } from '@/components/FeedbackModal'
import { AutoParseInboundEmails } from '@/components/inbound-emails/auto-parse-inbound-emails'
import type { UserProfile } from '@/lib/auth'
import { cn } from '@/lib/utils'

import { useSidebar } from './sidebar-provider'
import { getVisibleNavSections, getVisibleUtilityNavItems, type NavItem } from './nav-items'

interface SidebarClientProps {
  userRole?: UserProfile['role'] | null
  userProfile?: UserProfile | null
  /** Used only to trigger background parsing for pending inbound emails (no nav badge). */
  pendingInboundEmailCount?: number
  /** Store portal thefts awaiting LP follow-up (Incidents nav badge). */
  storeTheftFollowUpCount?: number
}

function matchesPath(currentPath: string, href: string) {
  if (href === '/') return currentPath === '/' || currentPath === '/dashboard'
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

function SectionLink({
  item,
  isActive,
  onSelect,
  storeTheftFollowUpCount,
}: {
  item: NavItem
  isActive: boolean
  onSelect: (item: NavItem) => void
  storeTheftFollowUpCount: number
}) {
  const Icon = item.icon

  if (item.action === 'feedback') {
    return (
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="group flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 md:text-white/90 md:hover:bg-slate-800/70 md:hover:text-white"
      >
        <span className="h-8 w-1 rounded-full bg-transparent" />
        <Icon className="h-4.5 w-4.5 shrink-0" />
        <span className="flex min-w-0 items-center gap-2 truncate">
          <span className="truncate">{item.label}</span>
          {item.href === '/incidents' && storeTheftFollowUpCount > 0 ? (
            <span className="inline-flex min-w-[1.45rem] shrink-0 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
              {storeTheftFollowUpCount > 99 ? '99+' : storeTheftFollowUpCount}
            </span>
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={() => onSelect(item)}
      className={cn(
        'group flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-white text-slate-950 shadow-soft md:bg-white/10 md:text-white md:shadow-none'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 md:text-white/90 md:hover:bg-slate-800/70 md:hover:text-white'
      )}
    >
      <span
        className={cn(
          'h-8 w-1 shrink-0 rounded-full transition-colors',
          isActive ? 'bg-brand md:bg-brand-accent' : 'bg-transparent'
        )}
      />
      <Icon className={cn('h-4.5 w-4.5 shrink-0', isActive ? 'text-brand md:text-white' : '')} />
      <span className="flex min-w-0 items-center gap-2 truncate">
        <span className="truncate">{item.label}</span>
        {item.href === '/incidents' && storeTheftFollowUpCount > 0 ? (
          <span
            className={cn(
              'inline-flex min-w-[1.45rem] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              isActive ? 'bg-warning-soft text-warning' : 'bg-critical text-white md:bg-white md:text-brand',
            )}
          >
            {storeTheftFollowUpCount > 99 ? '99+' : storeTheftFollowUpCount}
          </span>
        ) : null}
      </span>
    </Link>
  )
}

export function SidebarClient({
  userRole,
  userProfile,
  pendingInboundEmailCount = 0,
  storeTheftFollowUpCount = 0,
}: SidebarClientProps) {
  const pathname = usePathname()
  const currentPath = pathname ?? '/'
  const { isOpen, setIsOpen } = useSidebar()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const sections = getVisibleNavSections(userRole || null)
  const utilityItems = getVisibleUtilityNavItems(userRole || null)

  useEffect(() => {
    if (isOpen) {
      setIsOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

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

  const handleSelect = (item: NavItem) => {
    setIsOpen(false)
    if (item.action === 'feedback') {
      setFeedbackOpen(true)
    }
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pb-6 md:pt-7">
        <div className="min-w-0">
          <div className="relative h-10 w-28 md:h-11 md:w-32">
            <Image
              src="/tfs-logo.svg"
              alt="The Fragrance Shop"
              fill
              sizes="128px"
              className="object-contain object-left"
              priority
            />
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 md:text-white/45">
            Operations platform
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-line bg-surface-raised text-ink-soft shadow-soft transition-colors hover:bg-surface-subtle md:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-5">
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.id} className="space-y-1.5">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 md:text-white/40">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SectionLink
                    key={item.href}
                    item={item}
                    isActive={matchesPath(currentPath, item.href)}
                    onSelect={handleSelect}
                    storeTheftFollowUpCount={storeTheftFollowUpCount}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </nav>

      <div className="border-t border-slate-200/80 px-4 py-4 md:border-white/10">
        <div className="space-y-1 pb-4">
          {utilityItems.map((item) => (
            <SectionLink
              key={item.href}
              item={item}
              isActive={false}
              onSelect={handleSelect}
              storeTheftFollowUpCount={storeTheftFollowUpCount}
            />
          ))}
        </div>

        <div className="app-shell-glass flex items-center gap-3 rounded-2xl px-4 py-3 md:border-white/10 md:bg-white/6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast md:bg-white/14">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950 md:text-white">
              {userProfile?.full_name || 'User'}
            </p>
            <p className="text-xs text-slate-500 md:text-white/55">
              {(userRole || 'pending')?.toString().replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <>
      <AutoParseInboundEmails pendingCount={pendingInboundEmailCount} />

      <aside className="no-print hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-[18rem] md:flex-col tfs-shell-gradient">
        {sidebarContent}
      </aside>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-shell/38 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-[70] flex w-[86vw] max-w-[22rem] flex-col rounded-r-[2rem] border-r border-line bg-[linear-gradient(180deg,hsl(var(--surface-raised))_0%,hsl(var(--surface-subtle))_100%)] shadow-floating transition-all duration-300 ease-out md:hidden',
          isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
        )}
        aria-hidden={!isOpen}
        aria-label="Navigation menu"
      >
        {sidebarContent}
      </aside>

      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
