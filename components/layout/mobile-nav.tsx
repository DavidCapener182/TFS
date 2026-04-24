'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { getVisibleNavSections } from '@/components/layout/nav-items'

export function MobileNav({ userName }: { userName: string }) {
  const pathname = usePathname()
  const currentPath = pathname ?? '/'
  const sections = getVisibleNavSections()

  const isPathActive = (href: string) =>
    href === '/'
      ? currentPath === '/' || currentPath === '/dashboard'
      : currentPath === href || currentPath.startsWith(`${href}/`)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent
        className={cn(
          'left-0 top-0 translate-x-0 translate-y-0',
          'h-[100dvh] w-[88vw] max-w-sm',
          'rounded-none border-r border-line bg-surface-raised p-0',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2'
        )}
      >
        <div className="border-b border-line px-5 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">The Fragrance Shop</p>
          <h1 className="mt-2 text-base font-semibold text-foreground">Navigation</h1>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.id} className="space-y-2">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  {section.label}
                </p>
                <ul className="space-y-1.5">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const isActive = isPathActive(item.href)

                    return (
                      <li key={item.href}>
                        <DialogClose asChild>
                          <Link
                            href={item.href}
                            prefetch={false}
                            className={cn(
                              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-surface-subtle text-foreground shadow-soft'
                                : 'text-ink-soft hover:bg-surface-subtle hover:text-foreground'
                            )}
                          >
                            <span className={cn('h-8 w-1 rounded-full', isActive ? 'bg-brand' : 'bg-transparent')} />
                            <Icon className="h-4.5 w-4.5" />
                            {item.label}
                          </Link>
                        </DialogClose>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </nav>

        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-subtle px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-brand-contrast">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
