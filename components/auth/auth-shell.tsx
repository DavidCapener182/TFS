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
    <div className="relative min-h-[100svh] overflow-x-hidden bg-[linear-gradient(140deg,#1c0259_0%,#232154_52%,#312d73_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(circle_at_bottom,rgba(42,135,66,0.26),transparent_58%)]" />

      <div className="relative z-10 flex min-h-[100svh] flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:min-h-screen sm:items-center sm:justify-center sm:p-4">
        {desktopLogoPosition === 'corner' ? (
          <>
            <div className="absolute left-6 top-6 hidden sm:block">
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
                'mx-auto mb-5 flex w-full justify-center sm:hidden',
                logoSize === 'compact' ? 'max-w-[120px]' : 'max-w-[160px]'
              )}
            >
              <Image
                src="/tfs-logo.svg"
                alt="The Fragrance Shop"
                width={240}
                height={70}
                className="h-auto w-full object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
                priority
              />
            </div>
          </>
        ) : (
          <div
            className={cn(
              'mx-auto mb-5 flex w-full justify-center sm:mb-8',
              logoSize === 'compact' ? 'max-w-[120px] sm:max-w-[148px]' : 'max-w-[160px] sm:max-w-[208px]'
            )}
          >
            <Image
              src="/tfs-logo.svg"
              alt="The Fragrance Shop"
              width={240}
              height={70}
              className="h-auto w-full object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
              priority
            />
          </div>
        )}

        <div className={cn('mx-auto w-full max-w-md', contentClassName)}>{children}</div>
      </div>
    </div>
  )
}
