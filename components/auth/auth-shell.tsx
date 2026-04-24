import Image from 'next/image'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AuthShellProps = {
  children: ReactNode
  logoSize?: 'standard' | 'compact'
  contentClassName?: string
  desktopLogoPosition?: 'centered' | 'corner'
}

export function AuthShell({
  children,
  logoSize = 'standard',
  contentClassName,
  desktopLogoPosition = 'centered',
}: AuthShellProps) {
  return (
    <div className="tfs-auth-gradient relative min-h-[100svh] overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,hsl(var(--shell-contrast)/0.1),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(circle_at_bottom,hsl(var(--success)/0.22),transparent_58%)]" />

      <div className="relative z-10 min-h-[100svh] overflow-y-auto">
        <div className="mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-8 lg:px-8">
          {desktopLogoPosition === 'corner' ? (
            <>
              <div className="absolute left-6 top-6 hidden sm:block lg:left-8 lg:top-8">
                <Image
                  src="/tfs-logo.svg"
                  alt="The Fragrance Shop"
                  width={164}
                  height={48}
                  className="h-auto w-auto object-contain"
                  priority
                />
              </div>
              <div
                className={cn(
                  'mx-auto mb-6 flex w-full justify-center sm:hidden',
                  logoSize === 'compact' ? 'max-w-[120px]' : 'max-w-[168px]'
                )}
              >
                <Image
                  src="/tfs-logo.svg"
                  alt="The Fragrance Shop"
                  width={240}
                  height={70}
                  className="h-auto w-full object-contain drop-shadow-[0_10px_28px_hsl(var(--shell)/0.32)]"
                  priority
                />
              </div>
            </>
          ) : (
            <div
              className={cn(
                'mx-auto mb-6 flex w-full justify-center sm:mb-8',
                logoSize === 'compact' ? 'max-w-[124px] sm:max-w-[148px]' : 'max-w-[172px] sm:max-w-[220px]'
              )}
            >
              <Image
                src="/tfs-logo.svg"
                alt="The Fragrance Shop"
                width={240}
                height={70}
                className="h-auto w-full object-contain drop-shadow-[0_10px_28px_hsl(var(--shell)/0.32)]"
                priority
              />
            </div>
          )}

          <div className="flex flex-1 flex-col justify-center">
            <div className={cn('mx-auto w-full max-w-lg', contentClassName)}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
