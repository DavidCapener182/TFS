'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { LogOut, Menu } from 'lucide-react'
import { useSidebar } from './sidebar-provider'
import { cn } from '@/lib/utils'
import { StoreSearch } from '@/components/layout/store-search'
import { createClient } from '@/lib/supabase/client'

interface HeaderClientProps {
  signOut: () => void
  currentUser: {
    id: string
    name: string
  }
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
}

export function HeaderClient({ signOut, currentUser }: HeaderClientProps) {
  const { isOpen, setIsOpen } = useSidebar()
  const [onlineUsers, setOnlineUsers] = useState<Array<{ id: string; name: string }>>([
    { id: currentUser.id, name: currentUser.name },
  ])
  const presenceKey = useMemo(() => {
    if (currentUser.id && currentUser.id !== 'unknown-user') return currentUser.id
    return `fallback-${currentUser.name.trim().toLowerCase().replace(/\s+/g, '-') || 'user'}`
  }, [currentUser.id, currentUser.name])

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('fa-online-users', {
      config: {
        presence: { key: presenceKey },
      },
    })

    const syncUsers = () => {
      const state = channel.presenceState<Record<string, Array<{ name?: string; userName?: string }>>>()
      const userMap = new Map<string, string>()

      Object.entries(state).forEach(([key, metas]) => {
        const meta = (metas?.[0] ?? {}) as { name?: string; userName?: string }
        const explicitName = typeof meta.name === 'string' ? meta.name.trim() : ''
        const fallbackMetaName = typeof meta.userName === 'string' ? meta.userName.trim() : ''
        const userName = explicitName || fallbackMetaName || (key === presenceKey ? currentUser.name : 'User')
        userMap.set(key, userName)
      })

      if (!userMap.has(presenceKey)) {
        userMap.set(presenceKey, currentUser.name)
      }

      const users = Array.from(userMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => {
          if (a.id === presenceKey) return -1
          if (b.id === presenceKey) return 1
          return a.name.localeCompare(b.name)
        })

      setOnlineUsers(users)
    }

    channel
      .on('presence', { event: 'sync' }, syncUsers)
      .on('presence', { event: 'join' }, syncUsers)
      .on('presence', { event: 'leave' }, syncUsers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            name: currentUser.name,
          })
        }
      })

    return () => {
      void channel.untrack()
      void supabase.removeChannel(channel)
    }
  }, [currentUser.name, presenceKey])

  const visibleUsers = onlineUsers.slice(0, 5)
  const overflowCount = Math.max(onlineUsers.length - visibleUsers.length, 0)

  return (
    <header className="no-print relative z-30 flex h-[calc(4rem+env(safe-area-inset-top))] min-h-16 items-center justify-between bg-[#0e1925] px-4 pt-[env(safe-area-inset-top)] md:h-16 md:px-6 md:pt-0 lg:px-8">
      <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
        {/* Mobile Menu Button */}
        <button
          onClick={handleMenuClick}
          className={cn(
            "md:hidden p-2 rounded-lg hover:bg-white/10 active:bg-white/20 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation z-[100] relative cursor-pointer",
            isOpen && "bg-white/10"
          )}
          aria-label="Toggle navigation menu"
          aria-expanded={isOpen}
          type="button"
        >
          <Menu className="h-6 w-6 text-white pointer-events-none" />
        </button>

        <StoreSearch />
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="flex items-center gap-2" aria-label="Currently online users">
          {visibleUsers.map((user) => (
            <div
              key={user.id}
              title={user.name}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/15 text-[11px] font-bold text-white backdrop-blur-sm md:h-9 md:w-9 md:text-xs"
            >
              {getInitials(user.name)}
            </div>
          ))}
          {overflowCount > 0 ? (
            <div
              title={`${overflowCount} more online`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/15 text-[11px] font-bold text-white backdrop-blur-sm md:h-9 md:w-9 md:text-xs"
            >
              +{overflowCount}
            </div>
          ) : null}
        </div>
        <form action={signOut}>
          <Button 
            type="submit" 
            variant="ghost" 
            className="rounded-full min-h-[44px] px-3 md:px-4 text-white hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4 md:h-5 md:w-5 mr-2" />
            <span className="hidden sm:inline">Log Out</span>
          </Button>
        </form>
      </div>
    </header>
  )
}
