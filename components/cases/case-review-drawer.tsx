'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, CheckCircle2, ClipboardList, ShieldAlert, XCircle } from 'lucide-react'

import { closeCaseAction, reviewCaseAction } from '@/app/actions/cases'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import {
  getCaseStageTone,
  getCaseTypeLabel,
  getQueueSectionLabel,
  getReviewOutcomeLabel,
  getSeverityTone,
  type QueueCaseRecord,
} from '@/lib/cases/workflow'
import { formatAppDateTime, getDisplayStoreCode } from '@/lib/utils'
import type { TfsReviewOutcome } from '@/types/db'

type CaseReviewDrawerProps = {
  caseRecord: QueueCaseRecord | null
  open: boolean
  mode?: 'review' | 'close'
  onOpenChange: (open: boolean) => void
}

const REVIEW_OPTIONS: Array<{
  value: TfsReviewOutcome
  label: string
  description: string
}> = [
  {
    value: 'acknowledged_only',
    label: 'Acknowledge only',
    description: 'Mark the intake as reviewed and move it toward closure.',
  },
  {
    value: 'store_action_created',
    label: 'Create store action',
    description: 'Create an actionable follow-up for the store and keep it open until complete.',
  },
  {
    value: 'visit_required',
    label: 'Visit required',
    description: 'Move this into the visit workflow and plan follow-up on site.',
  },
  {
    value: 'incident_escalated',
    label: 'Escalate incident',
    description: 'Push the linked incident into investigation and keep the case under review.',
  },
  {
    value: 'closed_no_further_action',
    label: 'Close now',
    description: 'Finish the review and close with no further action.',
  },
]

const CLOSE_OPTIONS = [
  'reviewed_only',
  'actioned',
  'planned',
  'visited',
  'awaiting_outcome',
  'complete',
  'closed',
]

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function toDateTimeInputValue(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function CaseReviewDrawer({
  caseRecord,
  open,
  mode = 'review',
  onOpenChange,
}: CaseReviewDrawerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reviewOutcome, setReviewOutcome] = useState<TfsReviewOutcome>('acknowledged_only')
  const [summary, setSummary] = useState('')
  const [storeActionTitle, setStoreActionTitle] = useState('')
  const [storeActionDescription, setStoreActionDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [closureOutcome, setClosureOutcome] = useState('complete')

  useEffect(() => {
    if (!caseRecord) return

    setSummary(caseRecord.lastUpdateSummary || '')
    setStoreActionTitle(caseRecord.originReference || '')
    setStoreActionDescription(caseRecord.lastUpdateSummary || '')
    setDueAt(toDateInputValue(caseRecord.dueAt))
    setScheduledFor(toDateTimeInputValue(caseRecord.dueAt))
    setClosureOutcome(caseRecord.closureOutcome || 'complete')
    setReviewOutcome(caseRecord.stage === 'new_submission' ? 'acknowledged_only' : 'incident_escalated')
  }, [caseRecord])

  const headerDescription = useMemo(() => {
    if (!caseRecord) return ''
    const parts = [
      caseRecord.storeName,
      getDisplayStoreCode(caseRecord.storeCode) || null,
      getCaseTypeLabel(caseRecord.caseType),
    ].filter(Boolean)
    return parts.join(' • ')
  }, [caseRecord])

  if (!caseRecord) return null

  const isCloseFlow = mode === 'close' || caseRecord.stage === 'ready_to_close'
  const originHref =
    caseRecord.originTargetId &&
    (caseRecord.originTargetTable === 'tfs_incidents' ||
      caseRecord.originTargetTable === 'tfs_closed_incidents' ||
      caseRecord.originTargetTable === 'fa_incident')
      ? `/incidents/${caseRecord.originTargetId}`
      : null

  const submit = () => {
    startTransition(async () => {
      try {
        if (isCloseFlow) {
          await closeCaseAction({
            caseId: caseRecord.id,
            closureOutcome,
            summary: summary.trim() || `Case closed: ${closureOutcome.replace(/_/g, ' ')}`,
          })
          toast({
            title: 'Case closed',
            description: `${caseRecord.storeName} is now marked closed.`,
            variant: 'success',
          })
        } else {
          await reviewCaseAction({
            caseId: caseRecord.id,
            outcome: reviewOutcome,
            summary: summary.trim() || undefined,
            storeActionTitle: storeActionTitle.trim() || undefined,
            storeActionDescription: storeActionDescription.trim() || undefined,
            dueAt: dueAt || undefined,
            scheduledFor: scheduledFor || undefined,
          })
          toast({
            title: 'Review recorded',
            description: `${caseRecord.storeName} has been advanced to the next stage.`,
            variant: 'success',
          })
        }

        onOpenChange(false)
        router.refresh()
      } catch (error) {
        toast({
          title: 'Case update failed',
          description: error instanceof Error ? error.message : 'The case could not be updated.',
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto border-l border-line bg-surface-raised px-5 py-6 sm:w-[460px]"
      >
        <div className="space-y-6 pr-8">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={getSeverityTone(caseRecord.severity)}>
                {caseRecord.severity}
              </Badge>
              <Badge variant={getCaseStageTone(caseRecord.stage)}>
                {getQueueSectionLabel(caseRecord.stage)}
              </Badge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                {headerDescription}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {isCloseFlow ? 'Close work item' : 'Review work item'}
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                {caseRecord.originIncidentDescription ||
                  caseRecord.originIncidentSummary ||
                  caseRecord.lastUpdateSummary ||
                  'Use the workflow decision below to move the case on.'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Origin</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {caseRecord.originReference || 'No reference'}
                </p>
                {originHref ? (
                  <Button asChild type="button" variant="ghost" size="sm" className="mt-1 h-auto px-0 text-primary hover:bg-transparent hover:text-primary/80">
                    <Link href={originHref} prefetch={false}>
                      View incident details
                    </Link>
                  </Button>
                ) : null}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Owner</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {caseRecord.ownerName || 'Unassigned'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Due</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {caseRecord.dueAt ? formatAppDateTime(caseRecord.dueAt) : 'No due date'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Open blockers</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{caseRecord.openBlockerCount}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Incident description
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
              {caseRecord.originIncidentDescription ||
                caseRecord.originIncidentSummary ||
                'No incident description recorded for this linked item.'}
            </p>
          </div>
          {caseRecord.caseType === 'portal_theft' ? (
            <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Theft details
              </p>
              <p className="mt-2 text-sm text-foreground">
                {caseRecord.originTheftItemsSummary || 'No stolen item lines recorded.'}
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                Theft value:{' '}
                {typeof caseRecord.originTheftValueGbp === 'number'
                  ? `£${caseRecord.originTheftValueGbp.toFixed(2)}`
                  : 'Not recorded'}
              </p>
            </div>
          ) : null}

          {isCloseFlow ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="closure-outcome">Closure outcome</Label>
                <select
                  id="closure-outcome"
                  value={closureOutcome}
                  onChange={(event) => setClosureOutcome(event.target.value)}
                  className="flex h-11 w-full rounded-lg border border-line bg-surface-raised px-3 text-sm text-foreground shadow-soft"
                >
                  {CLOSE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="close-summary">Closure summary</Label>
                <Textarea
                  id="close-summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="min-h-[130px]"
                  placeholder="Capture the reason this work is now complete."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-3">
                <Label>Review decision</Label>
                <div className="space-y-2">
                  {REVIEW_OPTIONS.map((option) => {
                    const active = option.value === reviewOutcome
                    const Icon =
                      option.value === 'store_action_created'
                        ? ClipboardList
                        : option.value === 'visit_required'
                          ? CalendarClock
                          : option.value === 'closed_no_further_action'
                            ? XCircle
                            : option.value === 'incident_escalated'
                              ? ShieldAlert
                              : CheckCircle2

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setReviewOutcome(option.value)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                          active
                            ? 'border-brand bg-surface-subtle text-foreground shadow-soft'
                            : 'border-line bg-surface-raised text-ink-soft hover:bg-surface-subtle'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 rounded-full border p-2 ${active ? 'border-brand/25 bg-brand/12 text-brand' : 'border-line text-ink-muted'}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{option.label}</p>
                            <p className="mt-1 text-sm text-ink-soft">{option.description}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {(reviewOutcome === 'store_action_created' || reviewOutcome === 'incident_escalated') ? (
                <div className="space-y-4 rounded-2xl border border-line bg-surface-subtle/72 p-4">
                  {reviewOutcome === 'store_action_created' ? (
                    <div className="space-y-2">
                      <Label htmlFor="store-action-title">Action title</Label>
                      <Input
                        id="store-action-title"
                        value={storeActionTitle}
                        onChange={(event) => setStoreActionTitle(event.target.value)}
                        placeholder="Create follow-up action"
                      />
                    </div>
                  ) : null}

                  {reviewOutcome === 'store_action_created' ? (
                    <div className="space-y-2">
                      <Label htmlFor="store-action-description">Action note</Label>
                      <Textarea
                        id="store-action-description"
                        value={storeActionDescription}
                        onChange={(event) => setStoreActionDescription(event.target.value)}
                        placeholder="What needs to happen next?"
                        className="min-h-[110px]"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="due-date">Due date</Label>
                    <Input
                      id="due-date"
                      type="date"
                      value={dueAt}
                      onChange={(event) => setDueAt(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {reviewOutcome === 'visit_required' ? (
                <div className="space-y-4 rounded-2xl border border-line bg-surface-subtle/72 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduled-for">Planned visit time</Label>
                    <Input
                      id="scheduled-for"
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(event) => setScheduledFor(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="review-summary">Reviewer summary</Label>
                <Textarea
                  id="review-summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="min-h-[130px]"
                  placeholder={
                    getReviewOutcomeLabel(reviewOutcome)
                      ? `Capture why this is being marked "${getReviewOutcomeLabel(reviewOutcome)}".`
                      : 'Capture the review decision.'
                  }
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={submit} disabled={isPending} className="flex-1">
              {isPending ? 'Saving...' : isCloseFlow ? 'Close work item' : 'Save decision'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
