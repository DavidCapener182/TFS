'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Clock, ShieldCheck } from 'lucide-react'

import { logStoreVisit } from '@/app/actions/store-visits'
import type { VisitTrackerRow } from '@/components/visit-tracker/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import {
  STORE_VISIT_ACTIVITY_OPTIONS,
  STORE_VISIT_TYPE_OPTIONS,
  getStoreVisitActivityLabel,
  getStoreVisitNeedLevelLabel,
  getStoreVisitTypeLabel,
  type StoreVisitActivityKey,
  type StoreVisitType,
} from '@/lib/visit-needs'
import { formatStoreName } from '@/lib/store-display'
import { cn } from '@/lib/utils'

interface StoreVisitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: VisitTrackerRow | null
  canEdit: boolean
  currentUserName: string | null
  visitsAvailable: boolean
  visitsUnavailableMessage: string | null
}

function getLocalDateTimeInputValue() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

function getDefaultVisitType(row: VisitTrackerRow): StoreVisitType {
  if (row.nextPlannedVisitDate) return 'planned'
  if (row.visitNeeded) return 'action_led'
  return 'random_area'
}

function getNeedLevelClasses(level: VisitTrackerRow['visitNeedLevel']): string {
  if (level === 'urgent') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (level === 'needed') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (level === 'monitor') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Failed to log visit. Please try again.'
}

export function StoreVisitModal({
  open,
  onOpenChange,
  row,
  canEdit,
  currentUserName,
  visitsAvailable,
  visitsUnavailableMessage,
}: StoreVisitModalProps) {
  const router = useRouter()
  const [visitType, setVisitType] = useState<StoreVisitType>('action_led')
  const [visitedAt, setVisitedAt] = useState(getLocalDateTimeInputValue())
  const [selectedActivityKeys, setSelectedActivityKeys] = useState<StoreVisitActivityKey[]>([])
  const [notes, setNotes] = useState('')
  const [followUpRequired, setFollowUpRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  useEffect(() => {
    if (!row || !open) return
    setVisitType(getDefaultVisitType(row))
    setVisitedAt(getLocalDateTimeInputValue())
    setSelectedActivityKeys([])
    setNotes('')
    setFollowUpRequired(false)
    setError(null)
  }, [open, row])

  if (!row) return null

  const canSave = canEdit && visitsAvailable

  const toggleActivity = (key: StoreVisitActivityKey) => {
    setSelectedActivityKeys((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    )
  }

  const handleSubmit = () => {
    if (!canSave) return

    if (selectedActivityKeys.length === 0 && notes.trim().length === 0) {
      setError('Select at least one on-site activity or add a note.')
      return
    }

    setError(null)
    startSave(async () => {
      try {
        await logStoreVisit({
          storeId: row.storeId,
          visitType,
          visitedAt,
          completedActivityKeys: selectedActivityKeys,
          notes,
          followUpRequired,
          needScoreSnapshot: row.visitNeedScore,
          needLevelSnapshot: row.visitNeedLevel,
          needReasonsSnapshot: row.visitNeedReasons,
        })

        toast({
          title: 'Visit logged',
          description: `${formatStoreName(row.storeName)} has been updated in the visit tracker.`,
          variant: 'success',
        })
        onOpenChange(false)
        router.refresh()
      } catch (saveError) {
        setError(toErrorMessage(saveError))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 md:max-w-5xl">
        <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <DialogTitle className="text-xl font-bold text-slate-900">
            {formatStoreName(row.storeName)}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-slate-600">
            Log what the LP officer completed on site and keep the visit tracker aligned with current actions.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Visit Need</div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                      getNeedLevelClasses(row.visitNeedLevel)
                    )}
                  >
                    {getStoreVisitNeedLevelLabel(row.visitNeedLevel)}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">Score {row.visitNeedScore}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {row.visitNeedReasons.length > 0
                    ? row.visitNeedReasons.join(' • ')
                    : 'No active LP or security drivers are currently pushing a visit.'}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Tracker State</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {row.nextPlannedVisitDate
                    ? `Planned for ${format(new Date(row.nextPlannedVisitDate), 'dd MMM yyyy')}`
                    : row.lastVisitDate
                      ? `Last visit ${format(new Date(row.lastVisitDate), 'dd MMM yyyy')}`
                      : 'No current plan or visit logged'}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {row.openStoreActionCount} open actions • {row.openIncidentCount} open incidents
                </div>
              </div>
            </div>

            {!canSave && visitsUnavailableMessage ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {visitsUnavailableMessage}
              </div>
            ) : null}

            {!canEdit ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                You have read-only access. An admin or ops user needs to log visits.
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="visit-type">Visit type</Label>
                <Select value={visitType} onValueChange={(value) => setVisitType(value as StoreVisitType)}>
                  <SelectTrigger id="visit-type" className="min-h-[44px]">
                    <SelectValue placeholder="Select visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {STORE_VISIT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {STORE_VISIT_TYPE_OPTIONS.find((option) => option.value === visitType)?.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visited-at">Visited at</Label>
                <Input
                  id="visited-at"
                  type="datetime-local"
                  value={visitedAt}
                  onChange={(event) => setVisitedAt(event.target.value)}
                  className="min-h-[44px]"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>What was completed on site?</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {STORE_VISIT_ACTIVITY_OPTIONS.map((option) => {
                  const selected = selectedActivityKeys.includes(option.key)
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => toggleActivity(option.key)}
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-left transition-colors',
                        selected
                          ? 'border-[#232154] bg-[#f5f1fb]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold',
                            selected
                              ? 'border-[#232154] bg-[#232154] text-white'
                              : 'border-slate-300 bg-white text-transparent'
                          )}
                        >
                          ✓
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{option.label}</div>
                          <div className="mt-1 text-xs text-slate-500">{option.description}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="visit-notes">Visit notes</Label>
              <Textarea
                id="visit-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add context from the visit, outcomes, next steps, or anything the officer found on site."
                className="min-h-[120px]"
              />
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={followUpRequired}
                onChange={(event) => setFollowUpRequired(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <div>
                <div className="font-semibold text-slate-900">Follow-up visit required</div>
                <div className="text-xs text-slate-500">
                  Use this when the officer has attended but the store still needs another return visit.
                </div>
              </div>
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                Logging as {currentUserName || 'current user'}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSave || isSaving}
                  className="min-h-[44px] bg-[#232154] text-white hover:bg-[#1c0259]"
                >
                  {isSaving ? 'Saving...' : 'Log Visit'}
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-6 py-6 md:border-l md:border-t-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Clock className="h-4 w-4 text-slate-500" />
              Recent Visit History
            </div>
            <div className="mt-4 space-y-3">
              {row.recentVisits.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                  No visit logs recorded for this store yet.
                </div>
              ) : (
                row.recentVisits.map((visit) => (
                  <div key={visit.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                        {visit.visitType === 'route_completion'
                          ? 'Planned route visit'
                          : getStoreVisitTypeLabel(visit.visitType)}
                      </span>
                      {visit.needLevelSnapshot ? (
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                            getNeedLevelClasses(visit.needLevelSnapshot)
                          )}
                        >
                          {getStoreVisitNeedLevelLabel(visit.needLevelSnapshot)}
                          {typeof visit.needScoreSnapshot === 'number' ? ` (${visit.needScoreSnapshot})` : ''}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 text-sm font-semibold text-slate-900">
                      {format(new Date(visit.visitedAt), 'dd MMM yyyy HH:mm')}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {visit.createdByName || 'Unknown officer'}
                    </div>

                    {visit.completedActivityKeys.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {visit.completedActivityKeys.map((key) => (
                          <span
                            key={key}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {getStoreVisitActivityLabel(key)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {visit.notes ? (
                      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        {visit.notes}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
