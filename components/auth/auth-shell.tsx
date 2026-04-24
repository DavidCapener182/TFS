import Image from 'next/image'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AuthShellProps = {
  children: ReactNode
  logoSize?: 'standard' | 'compact'
  contentClassName?: string
  desktopLogoPosition?: 'centered' | 'corner'
  variant?: 'centered' | 'split'
  splitTitle?: string
  splitTagline?: string
}

export function AuthShell({
  children,
  logoSize = 'standard',
  contentClassName,
  desktopLogoPosition = 'centered',
  variant = 'centered',
  splitTitle = 'The Fragrance Shop',
  splitTagline = 'Operations, store visits, incidents, routes, and reporting in one secure workspace.',
}: AuthShellProps) {
  if (variant === 'split') {
    return (
      <main className="min-h-[100svh] bg-white text-slate-950">
        <div className="grid min-h-[100svh] lg:grid-cols-[minmax(0,1.03fr)_minmax(420px,0.97fr)]">
          <section className="relative isolate flex min-h-[320px] overflow-hidden bg-[hsl(var(--brand))] px-6 py-8 text-white sm:min-h-[380px] sm:px-10 lg:min-h-[100svh] lg:px-14 lg:py-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_24%,hsl(var(--shell-contrast)/0.2),transparent_30%),linear-gradient(145deg,hsl(var(--brand))_0%,hsl(var(--shell-elevated))_62%,hsl(var(--shell))_100%)]" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-36 bg-[url('/tfs-auth-fragrance-pattern.png')] bg-[length:110%_auto] bg-[position:center_top] bg-no-repeat opacity-50 sm:h-40 sm:bg-[length:105%_auto] lg:h-80 lg:bg-[length:115%_auto] lg:opacity-55"
            />
            <div className="relative z-10 flex w-full flex-col">
              <div className="mt-auto max-w-xl pb-2 pt-24 sm:pt-32 lg:pb-10">
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
                  TFS Operations Platform
                </p>
                <h1 className="text-4xl font-semibold leading-[1.02] tracking-normal text-white sm:text-5xl lg:text-6xl">
                  {splitTitle}
                </h1>
                <p className="mt-5 max-w-md text-base leading-7 text-white/76 sm:text-lg">
                  {splitTagline}
                </p>
              </div>
            </div>
          </section>

          <section className="flex min-h-[calc(100svh-320px)] items-center justify-center bg-white px-5 py-10 sm:px-8 lg:min-h-[100svh] lg:px-12">
            <div className={cn('w-full max-w-[380px]', contentClassName)}>{children}</div>
          </section>
        </div>
      </main>
    )
  }

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
