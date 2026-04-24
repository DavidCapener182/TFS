import type { LucideIcon } from 'lucide-react'
import { CheckCircle2 } from 'lucide-react'

export type WorkflowStep = {
  label: string
  icon: LucideIcon
}

export function WorkflowStrip({
  eyebrow = 'Workflow',
  title,
  steps,
}: {
  eyebrow?: string
  title: string
  steps: WorkflowStep[]
}) {
  return (
    <section className="app-panel-muted rounded-[1.35rem] px-4 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{eyebrow}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5 xl:gap-3">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <li key={step.label} className="relative">
                <div className="flex h-full min-w-0 items-center gap-2 rounded-[1rem] border border-line bg-surface-raised px-3 py-2.5 shadow-soft">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-subtle text-xs font-semibold text-ink-soft">
                    {index + 1}
                  </span>
                  <Icon className="h-4 w-4 shrink-0 text-info" />
                  <span className="min-w-0 text-xs font-semibold leading-tight text-foreground">{step.label}</span>
                  {index === steps.length - 1 ? <CheckCircle2 className="ml-auto h-4 w-4 text-success" /> : null}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
