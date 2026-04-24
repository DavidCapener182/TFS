import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type WorkspaceDensity = 'comfortable' | 'compact'
export type WorkspaceTone = 'critical' | 'warning' | 'info' | 'success' | 'neutral'

function getToneClasses(tone: WorkspaceTone) {
  if (tone === 'critical') return 'tone-critical'
  if (tone === 'warning') return 'tone-warning'
  if (tone === 'info') return 'tone-info'
  if (tone === 'success') return 'tone-success'
  return 'tone-neutral'
}

/** Desktop filter toolbar: 2-col tablet, 12-col desktop (incidents, actions, etc.). */
export const workspaceDesktopFilterFormClass =
  'hidden md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-12 lg:items-end lg:gap-3'

export const workspaceDesktopFilterSearchClass =
  'relative min-w-0 md:col-span-2 lg:col-span-12'

export const workspaceDesktopSelectClass =
  'h-10 min-h-[44px] w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm'

export const workspaceDesktopDateInputClass =
  'min-h-[44px] min-w-0 bg-white md:col-span-1 lg:col-span-3 lg:min-h-10'

export const workspaceDesktopFilterActionsClass =
  'flex w-full min-w-0 flex-wrap items-center gap-2 md:col-span-2 lg:col-span-12 lg:justify-end'

export function WorkspaceShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('space-y-5 md:space-y-6', className)}>{children}</div>
}

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  eyebrow: string
  title: string
  description: string
  icon?: LucideIcon
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('app-panel rounded-[1.6rem] px-4 py-4 md:px-6 md:py-5', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-subtle px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {eyebrow}
          </div>
          <h1 className="mt-3 text-[1.8rem] font-semibold tracking-[-0.04em] text-foreground md:text-[2.1rem]">
            {title}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft md:text-base">{description}</p>
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto lg:shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function WorkspaceStatGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
        className
      )}
    >
      {children}
    </div>
  )
}

export function WorkspaceStat({
  label,
  value,
  note,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  note?: React.ReactNode
  icon?: LucideIcon
  tone?: WorkspaceTone
}) {
  return (
    <div className="app-panel rounded-[1.35rem] px-4 py-4">
      <div className={cn('inline-flex rounded-full border px-2 py-1', getToneClasses(tone))}>
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{value}</p>
      {note ? <p className="mt-1 text-sm text-ink-soft">{note}</p> : null}
    </div>
  )
}

export function WorkspaceToolbar({
  children,
  className,
  sticky = true,
}: {
  children: React.ReactNode
  className?: string
  sticky?: boolean
}) {
  return (
    <div
      className={cn(
        'app-panel-muted rounded-[1.35rem] px-3 py-3 md:px-4 md:py-4',
        sticky && 'sticky top-[calc(var(--mobile-header-height)+0.75rem)] z-20 md:top-24',
        className
      )}
    >
      {children}
    </div>
  )
}

export function WorkspaceToolbarGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 lg:flex-row lg:items-center', className)}>{children}</div>
  )
}

export function WorkspaceViewChips<T extends string>({
  options,
  value,
  onValueChange,
  className,
}: {
  options: Array<{ value: T; label: string; count?: number }>
  value: T
  onValueChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const active = option.value === value

        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'rounded-full px-3.5',
              !active && 'bg-surface-raised text-ink-soft',
              active && 'shadow-soft'
            )}
          >
            <span>{option.label}</span>
            {typeof option.count === 'number' ? (
              <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-brand-contrast/16 text-brand-contrast' : 'bg-surface-subtle text-ink-muted')}>
                {option.count}
              </span>
            ) : null}
          </Button>
        )
      })}
    </div>
  )
}

export function WorkspaceDensityToggle({
  value,
  onValueChange,
  className,
}: {
  value: WorkspaceDensity
  onValueChange: (value: WorkspaceDensity) => void
  className?: string
}) {
  return (
    <div className={cn('inline-flex items-center rounded-full border border-line bg-surface-raised p-1', className)}>
      {(['comfortable', 'compact'] as WorkspaceDensity[]).map((option) => {
        const active = option === value
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onValueChange(option)}
            className={cn(
              'h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.12em]',
              active ? 'bg-surface-subtle text-foreground shadow-soft' : 'text-ink-muted'
            )}
          >
            {option}
          </Button>
        )
      })}
    </div>
  )
}

export function WorkspaceSplit({
  main,
  preview,
  className,
}: {
  main: React.ReactNode
  preview: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]', className)}>
      <div className="min-w-0">{main}</div>
      <div className="hidden lg:block">{preview}</div>
    </div>
  )
}

export function WorkspacePreviewPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('sticky top-24 overflow-hidden rounded-[1.5rem]', className)}>
      <CardHeader className="border-b border-line bg-surface-subtle/72 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-5">{children}</CardContent>
    </Card>
  )
}

export function WorkspaceSectionCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <Card className={cn('overflow-hidden rounded-[1.5rem]', className)}>{children}</Card>
}

export function WorkspaceEmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon?: LucideIcon
  title: string
  description: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[1.35rem] border border-dashed border-line bg-surface-subtle/72 px-4 py-10 text-center',
        className
      )}
    >
      {Icon ? (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-ink-muted shadow-soft">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
    </div>
  )
}
