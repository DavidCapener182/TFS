'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { UserRole } from '@/lib/auth'

import { cn } from '@/lib/utils'
import { getMobileMoreItems, getMobileTabItems, isPrimaryMobilePath, matchesMobilePath } from './mobile-nav-config'

export function MobileTabBar({ userRole }: { userRole?: UserRole | null }) {
  const pathname = usePathname()
  const currentPath = pathname ?? '/'
  const tabItems = getMobileTabItems(userRole)
  const moreItems = getMobileMoreItems(userRole)
  const moreActive = !isPrimaryMobilePath(currentPath, userRole)
  const featuredHref = tabItems[2]?.href ?? null
  const [moreOpen, setMoreOpen] = useState(false)
  const morePanelRef = useRef<HTMLDivElement | null>(null)
  const hideForFullscreenReports = currentPath === '/reports' || currentPath.startsWith('/reports/')

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!moreOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!morePanelRef.current) return
      if (!morePanelRef.current.contains(event.target as Node)) {
        setMoreOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [moreOpen])

  if (hideForFullscreenReports) {
    return null
  }

  return (
    <nav
      className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.95rem,env(safe-area-inset-bottom))] pt-3 md:hidden"
      aria-label="Primary navigation"
    >
      <div className="relative mx-auto max-w-[392px]" ref={morePanelRef}>
        <div
          className={cn(
            'pointer-events-auto absolute inset-x-0 bottom-full mb-2 origin-bottom rounded-[28px] border border-line bg-surface-raised/95 p-3 shadow-floating backdrop-blur-2xl transition-all duration-300',
            moreOpen
              ? 'visible pointer-events-auto translate-y-0 scale-100 opacity-100'
              : 'invisible pointer-events-none translate-y-3 scale-[0.96] opacity-0'
          )}
          style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
          aria-hidden={!moreOpen}
        >
          <div className="grid grid-cols-3 gap-2">
            {moreItems.map((item) => {
              const Icon = item.icon
              const isActive = matchesMobilePath(currentPath, item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex min-h-[74px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-2 text-center text-[10px] font-semibold transition-all',
                    isActive
                      ? 'border-line-strong bg-surface-subtle text-foreground shadow-soft'
                      : 'border-line bg-surface text-ink-soft active:bg-surface-subtle'
                  )}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon strokeWidth={1.9} className={cn('h-[18px] w-[18px]', isActive ? 'text-foreground' : 'text-ink-muted')} />
                  <span className="line-clamp-2 leading-tight">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="pointer-events-auto grid grid-cols-5 gap-1 rounded-[32px] border border-line bg-surface-raised/94 p-1.5 shadow-floating backdrop-blur-2xl supports-[backdrop-filter]:bg-surface-raised/88">
          {tabItems.map((item) => {
            const Icon = item.icon
            const isActive = matchesMobilePath(currentPath, item.href)
            const isFeatured = item.href === featuredHref

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[20px] px-1 py-2.5 text-[10px] font-semibold tracking-[0.01em] transition-[background-color,color,box-shadow]',
                  isFeatured
                    ? 'bg-brand text-brand-contrast shadow-soft'
                    : isActive
                      ? 'bg-surface-subtle text-foreground shadow-[inset_0_0_0_1px_hsl(var(--line))]'
                      : 'text-ink-muted active:bg-surface-subtle'
                )}
              >
                <Icon
                  strokeWidth={1.9}
                  className={cn(
                    'h-[18px] w-[18px]',
                    isFeatured ? 'text-brand-contrast' : isActive ? 'text-foreground' : 'text-ink-muted'
                  )}
                />
                <span>{item.label}</span>
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            className={cn(
              'flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[20px] px-1 py-2.5 text-[10px] font-semibold tracking-[0.01em] transition-[background-color,color,box-shadow]',
              moreActive || moreOpen
                ? 'bg-surface-subtle text-foreground shadow-[inset_0_0_0_1px_hsl(var(--line))]'
                : 'text-ink-muted active:bg-surface-subtle'
            )}
            aria-label={moreOpen ? 'Close more navigation options' : 'Open more navigation options'}
            aria-expanded={moreOpen}
          >
            {moreOpen ? (
              <X strokeWidth={1.9} className={cn('h-[18px] w-[18px]', moreActive || moreOpen ? 'text-foreground' : 'text-ink-muted')} />
            ) : (
              <Menu strokeWidth={1.9} className={cn('h-[18px] w-[18px]', moreActive || moreOpen ? 'text-foreground' : 'text-ink-muted')} />
            )}
            <span>More</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
