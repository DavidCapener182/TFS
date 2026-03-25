'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, User } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { navItems } from '@/components/layout/nav-items'

export function MobileNav({ userName }: { userName: string }) {
  const pathname = usePathname()
  const currentPath = pathname ?? '/'

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden rounded-full"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent
        className={cn(
          'left-0 top-0 translate-x-0 translate-y-0',
          'h-[100dvh] w-[85vw] max-w-xs',
          'rounded-none border-r bg-white p-0',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2'
        )}
      >
        <div className="flex h-16 items-center px-5 border-b border-gray-200/50">
          <h1 className="text-base font-semibold text-gray-900">KSS Assurance</h1>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href))

              return (
                <li key={item.href}>
                  <DialogClose asChild>
                    <Link
                      href={item.href}
                      prefetch={false}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-gray-50 text-gray-900 rounded-full shadow-sm font-semibold'
                          : 'text-gray-700 hover:text-gray-900 rounded-full'
                      )}
                    >
                      <Icon className={cn('h-5 w-5', isActive ? 'text-gray-900' : 'text-gray-500')} />
                      {item.label}
                    </Link>
                  </DialogClose>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200/50">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-50">
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
              <User className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
