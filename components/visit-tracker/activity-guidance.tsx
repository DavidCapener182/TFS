import type {
  StoreVisitActivityFieldDefinition,
  StoreVisitActivityGuideCard,
} from '@/lib/visit-needs'
import { cn } from '@/lib/utils'

export function ActivityFieldGuidance({
  field,
  className,
}: {
  field: Pick<StoreVisitActivityFieldDefinition, 'helperText' | 'scriptLines' | 'captureHint'>
  className?: string
}) {
  if (!field.helperText && !field.scriptLines?.length && !field.captureHint) {
    return null
  }

  return (
    <div className={cn('rounded-2xl border border-[#e5dcf7] bg-[#faf7ff] px-3 py-3 text-xs text-slate-600', className)}>
      {field.helperText ? <p className="font-medium text-slate-700">{field.helperText}</p> : null}
      {field.scriptLines?.length ? (
        <div className="space-y-1.5">
          {field.scriptLines.map((line, index) => (
            <p key={`${line}-${index}`}>
              <span className="font-semibold text-[#4b3a78]">Ask:</span> {line}
            </p>
          ))}
        </div>
      ) : null}
      {field.captureHint ? (
        <p>
          <span className="font-semibold text-[#4b3a78]">Capture:</span> {field.captureHint}
        </p>
      ) : null}
    </div>
  )
}

export function ActivityGuideCard({
  guide,
  className,
}: {
  guide?: StoreVisitActivityGuideCard
  className?: string
}) {
  if (!guide) return null

  return (
    <div
      className={cn(
        'rounded-3xl border border-[#dcd6ef] bg-[linear-gradient(180deg,#faf7ff_0%,#f4f0fe_100%)] p-4 text-sm text-slate-700',
        className
      )}
    >
      <div className="font-semibold text-[#2f2459]">{guide.title}</div>
      <p className="mt-1 text-slate-600">{guide.intro}</p>
      <div className="mt-3 space-y-2 text-xs text-slate-600">
        {guide.prompts.map((prompt, index) => (
          <p key={`${prompt}-${index}`}>
            <span className="font-semibold text-[#4b3a78]">Prompt {index + 1}:</span> {prompt}
          </p>
        ))}
      </div>
    </div>
  )
}
