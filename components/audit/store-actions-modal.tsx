'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { createStoreActions } from '@/app/actions/store-actions'
import { UserRole } from '@/lib/auth'
import { AuditRow, getLatestPct, pctBadge } from './audit-table-helpers'
import { createClient } from '@/lib/supabase/client'
import {
  calculateNextDueDate,
  formatDate as formatFRADate,
  getDaysUntilDue,
  getFRAStatus,
  statusBadge,
} from '@/components/fra/fra-table-helpers'
import {
  getCanonicalStoreActionQuestions,
  getStoreActionListTitle,
  matchCanonicalStoreActionQuestion,
} from '@/lib/store-action-titles'

type StoreActionPriority = 'low' | 'medium' | 'high' | 'urgent'

interface GeneratedActionDraft {
  id: string
  include: boolean
  flaggedItem: string
  title: string
  canonicalTitle: string | null
  nonCanonicalConfirmed: boolean
  description: string
  priority: StoreActionPriority
  dueDate: string
}

interface ExistingStoreAction {
  id: string
  title: string
  source_flagged_item: string | null
  description: string | null
  priority: StoreActionPriority
  status: string
  due_date: string
}

interface StoreActionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: AuditRow | null
  userRole: UserRole
  onActionsCreated?: (count: number, storeName: string) => void
}

function canCreateStoreActions(role: UserRole): boolean {
  return role === 'admin' || role === 'ops'
}

function normalizePriority(value: unknown): StoreActionPriority {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'urgent') return value
  return 'medium'
}

function addMonthsDateOnly(dateValue: string | null, monthsToAdd: number): string | null {
  if (!dateValue) return null

  const normalized = dateValue.trim()
  if (!normalized) return null

  const parsed = new Date(normalized.length === 10 ? `${normalized}T00:00:00` : normalized)
  if (Number.isNaN(parsed.getTime())) return null

  const d = new Date(parsed)
  d.setMonth(d.getMonth() + monthsToAdd)
  return d.toISOString().split('T')[0]
}

function getLatestAuditDate(row: AuditRow | null): string | null {
  if (!row) return null

  const dates = [
    row.compliance_audit_1_date,
    row.compliance_audit_2_date,
    row.compliance_audit_3_date,
  ].filter((value): value is string => Boolean(value))

  if (dates.length === 0) return null

  return [...dates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
}

export function StoreActionsModal({
  open,
  onOpenChange,
  row,
  userRole,
  onActionsCreated,
}: StoreActionsModalProps) {
  const [flaggedItemsText, setFlaggedItemsText] = useState('')
  const [generatedActions, setGeneratedActions] = useState<GeneratedActionDraft[]>([])
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [generationSource, setGenerationSource] = useState<'parsed' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [existingActions, setExistingActions] = useState<ExistingStoreAction[]>([])
  const [loadingExistingActions, setLoadingExistingActions] = useState(false)
  const [existingActionsError, setExistingActionsError] = useState<string | null>(null)

  const latestAuditScore = useMemo(() => (row ? getLatestPct(row) : null), [row])
  const latestAuditDate = useMemo(() => getLatestAuditDate(row), [row])
  const defaultReviewDate = useMemo(() => addMonthsDateOnly(latestAuditDate, 6), [latestAuditDate])
  const fraCompleted = useMemo(() => {
    if (!row) return false
    return Boolean(
      row.fire_risk_assessment_date ||
      row.fire_risk_assessment_pdf_path ||
      row.fire_risk_assessment_pct !== null
    )
  }, [row])
  const needsFRA = useMemo(() => {
    if (!row) return false
    return Boolean(row.compliance_audit_1_date || row.compliance_audit_2_date)
  }, [row])
  const fraStatus = useMemo(() => {
    if (!row) return 'not_required' as const
    return getFRAStatus(row.fire_risk_assessment_date, needsFRA)
  }, [row, needsFRA])
  const fraDaysUntilDue = useMemo(() => {
    if (!row) return null
    return getDaysUntilDue(row.fire_risk_assessment_date)
  }, [row])
  const fraNextDueDate = useMemo(() => {
    if (!row) return null
    return calculateNextDueDate(row.fire_risk_assessment_date)
  }, [row])
  const canCreate = canCreateStoreActions(userRole)
  const hasExistingActions = existingActions.length > 0

  const resetState = () => {
    setFlaggedItemsText('')
    setGeneratedActions([])
    setGenerationError(null)
    setGenerationSource(null)
    setSaveError(null)
    setSaveSuccess(null)
    setIsGenerating(false)
    setIsSaving(false)
    setExistingActions([])
    setLoadingExistingActions(false)
    setExistingActionsError(null)
  }

  useEffect(() => {
    if (!open || !row?.id) return

    let active = true
    const loadExistingActions = async () => {
      setLoadingExistingActions(true)
      setExistingActionsError(null)

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('tfs_store_actions')
          .select('id, title, source_flagged_item, description, priority, status, due_date')
          .eq('store_id', row.id)
          .order('due_date', { ascending: true })
          .order('created_at', { ascending: true })

        if (!active) return

        if (error) {
          throw error
        }

        setExistingActions((data || []) as ExistingStoreAction[])
      } catch (error) {
        console.error('Failed to load existing store actions:', error)
        if (!active) return
        const message = error instanceof Error ? error.message : 'Failed to load existing actions.'
        setExistingActionsError(message)
      } finally {
        if (active) {
          setLoadingExistingActions(false)
        }
      }
    }

    loadExistingActions()

    return () => {
      active = false
    }
  }, [open, row?.id])

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetState()
    }
  }

  const updateActionDraft = (
    id: string,
    updates: Partial<
      Pick<GeneratedActionDraft, 'include' | 'title' | 'description' | 'priority' | 'dueDate' | 'nonCanonicalConfirmed'>
    >
  ) => {
    setGeneratedActions((prev) =>
      prev.map((action) => (action.id === id ? { ...action, ...updates } : action))
    )
  }

  const handleGenerate = async () => {
    if (!row) return
    if (!flaggedItemsText.trim()) {
      setGenerationError('Paste flagged items before generating actions.')
      return
    }

    setIsGenerating(true)
    setGenerationError(null)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      const response = await fetch('/api/ai/store-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: row.store_name,
          storeCode: row.store_code,
          latestAuditScore,
          auditDate: latestAuditDate,
          fraCompleted,
          flaggedItemsText: flaggedItemsText.trim(),
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to generate actions')
      }

      const mapped: GeneratedActionDraft[] = (Array.isArray(result?.actions) ? result.actions : []).map(
        (action: any, index: number) => {
          const flaggedItem = String(action?.flaggedItem || '').trim()
          const rawTitle = String(action?.title || '').trim()
          const canonicalTitle = matchCanonicalStoreActionQuestion(rawTitle, `${rawTitle} ${flaggedItem}`)

          return {
            id: `${Date.now()}-${index}`,
            include: true,
            flaggedItem,
            title: canonicalTitle || rawTitle,
            canonicalTitle,
            nonCanonicalConfirmed: Boolean(canonicalTitle),
            description: String(action?.description || '').trim(),
            priority: normalizePriority(action?.priority),
            dueDate: String(action?.dueDate || ''),
          }
        }
      )

      if (mapped.length === 0) {
        throw new Error('No actions were generated from the pasted flagged items.')
      }

      setGeneratedActions(mapped)
      setGenerationSource(result?.source === 'parsed' ? 'parsed' : null)
    } catch (error) {
      console.error('Failed to generate store actions:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate actions.'
      setGenerationError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCreateActions = async () => {
    if (!row) return
    const selectedDrafts = generatedActions.filter((action) => action.include && action.title.trim().length > 0)

    if (selectedDrafts.length === 0) {
      setSaveError('Select at least one valid action to create.')
      return
    }

    const pendingNonCanonicalConfirmations = selectedDrafts.filter(
      (action) => !action.canonicalTitle && !action.nonCanonicalConfirmed
    )

    if (pendingNonCanonicalConfirmations.length > 0) {
      setSaveError(
        `Confirm ${pendingNonCanonicalConfirmations.length} non-standard question${
          pendingNonCanonicalConfirmations.length === 1 ? '' : 's'
        } before creating actions.`
      )
      return
    }

    const selected = selectedDrafts
      .map((action) => ({
        title: action.title.trim(),
        description: action.description.trim(),
        sourceFlaggedItem: action.flaggedItem.trim(),
        priority: action.priority,
        dueDate: action.dueDate,
        aiGenerated: true,
        nonCanonicalConfirmed: action.nonCanonicalConfirmed,
      }))

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      const result = await createStoreActions(row.id, selected)
      const createdCount = result?.count ?? selected.length
      const skippedCount = Number(result?.skipped || 0)
      const skippedNonActionableCount = Number(result?.skippedNonActionable || 0)
      const skippedDetails = [
        skippedCount > 0 ? `${skippedCount} duplicate action${skippedCount === 1 ? '' : 's'} skipped` : null,
        skippedNonActionableCount > 0
          ? `${skippedNonActionableCount} non-actionable risk assessment item${
              skippedNonActionableCount === 1 ? '' : 's'
            } skipped`
          : null,
      ].filter((value): value is string => Boolean(value))
      const successMessage =
        createdCount === 0
          ? skippedDetails.length > 0
            ? `No new actions created. ${skippedDetails.join('; ')}.`
            : 'No new actions created.'
          : createdCount === 1
            ? skippedDetails.length > 0
              ? `1 action created for this store. ${skippedDetails.join('; ')}.`
              : '1 action created for this store.'
            : skippedDetails.length > 0
              ? `${createdCount} actions created for this store. ${skippedDetails.join('; ')}.`
              : `${createdCount} actions created for this store.`
      setSaveSuccess(successMessage)
      onActionsCreated?.(createdCount, row.store_name)
      handleOpenChange(false)
    } catch (error) {
      console.error('Failed to create store actions:', error)
      const message = error instanceof Error ? error.message : 'Failed to create actions.'
      setSaveError(message)
    } finally {
      setIsSaving(false)
    }
  }

  const canonicalQuestions = useMemo(() => getCanonicalStoreActionQuestions(), [])
  const canonicalQuestionCount = canonicalQuestions.length
  const selectedCount = generatedActions.filter((action) => action.include && action.title.trim()).length
  const pendingNonCanonicalConfirmCount = generatedActions.filter(
    (action) => action.include && action.title.trim() && !action.canonicalTitle && !action.nonCanonicalConfirmed
  ).length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto bg-white text-slate-900 subpixel-antialiased data-[state=open]:!animate-none data-[state=closed]:!animate-none md:data-[state=open]:!animate-none md:data-[state=closed]:!animate-none md:!left-0 md:!right-0 md:!mx-auto md:!top-[6vh] md:!w-[min(92vw,960px)] md:!max-w-[960px] md:!translate-x-0 md:!translate-y-0 md:[transform:none]">
        <DialogHeader>
          <DialogTitle>{row ? `${row.store_name} Actions` : 'Store Actions'}</DialogTitle>
          <DialogDescription>
            Review flagged items, generate actions, then confirm before saving to Supabase.
          </DialogDescription>
        </DialogHeader>

        {row ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Latest Audit Score</p>
                <div className="mt-2">{pctBadge(latestAuditScore)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">FRA Status</p>
                <div className="mt-2">{statusBadge(fraStatus, fraDaysUntilDue)}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                    <span className="block uppercase tracking-wide text-[10px] text-slate-500">Last FRA</span>
                    <span className="text-slate-700">{formatFRADate(row.fire_risk_assessment_date)}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                    <span className="block uppercase tracking-wide text-[10px] text-slate-500">Next Due</span>
                    <span className="text-slate-700">
                      {fraNextDueDate ? formatFRADate(fraNextDueDate.toISOString().split('T')[0]) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {existingActionsError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {existingActionsError}
              </div>
            ) : null}

            {loadingExistingActions ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Loading existing store actions...
              </div>
            ) : hasExistingActions ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Existing Store Tasks</p>
                  <span className="text-xs text-slate-500">{existingActions.length} total</span>
                </div>
                <div className="space-y-2.5">
                  {existingActions.map((action, index) => (
                    <div key={action.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">Task {index + 1}</p>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-slate-300 bg-slate-50 text-slate-700 capitalize"
                          >
                            {action.priority}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-blue-300 bg-blue-50 text-blue-700 capitalize"
                          >
                            {action.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-slate-900 font-medium">{getStoreActionListTitle(action)}</p>
                      {action.description ? (
                        <p className="text-sm text-slate-600">{action.description}</p>
                      ) : null}
                      <p className="text-xs text-slate-500">
                        Review date: {new Date(action.due_date).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="flagged-items" className="text-sm font-medium">
                  Flagged Items
                </label>
                <Textarea
                  id="flagged-items"
                  value={flaggedItemsText}
                  onChange={(event) => setFlaggedItemsText(event.target.value)}
                  placeholder="Paste flagged items from the audit report. You can paste the full flagged section; Photo lines are ignored automatically."
                  rows={8}
                  className="resize-y"
                  disabled={!canCreate || isGenerating || isSaving}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Titles are mapped to approved audit questions. New questions need confirmation before save.
                  </p>
                  <Button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canCreate || isGenerating || isSaving || !flaggedItemsText.trim()}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isGenerating ? 'Generating...' : 'Generate Actions'}
                  </Button>
                </div>
              </div>
            )}

            {!hasExistingActions && generationSource ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {generationSource === 'parsed'
                  ? `Questions mapped directly into actions.${defaultReviewDate ? ` Review date defaulted to ${new Date(defaultReviewDate).toLocaleDateString('en-GB')} (audit date + 6 months).` : ''}`
                  : ''}
              </div>
            ) : null}

            {!hasExistingActions && generationError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {generationError}
              </div>
            ) : null}

            {!hasExistingActions ? (
              <details className="rounded-md border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Approved Questions (Source of Truth)</span>
                  <span className="text-slate-500">{canonicalQuestionCount}</span>
                </summary>
                <div className="border-t border-slate-200 px-3 py-2 max-h-56 overflow-auto">
                  <p className="text-[11px] text-slate-500 mb-2">
                    Actions are matched to this list. If no match is found, confirmation is required before saving.
                  </p>
                  <ol className="space-y-1">
                    {canonicalQuestions.map((question, index) => (
                      <li key={question} className="text-[11px] text-slate-700 leading-5">
                        <span className="text-slate-400 mr-1">{index + 1}.</span>
                        {question}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            ) : null}

            {!hasExistingActions && generatedActions.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Confirm Actions</p>
                  <span className="text-xs text-slate-500">{selectedCount} selected</span>
                </div>
                {pendingNonCanonicalConfirmCount > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {pendingNonCanonicalConfirmCount} selected question
                    {pendingNonCanonicalConfirmCount === 1 ? '' : 's'} not found in the approved list. Tick
                    confirmation on each one before creating actions.
                  </div>
                ) : null}
                <div className="space-y-3">
                  {generatedActions.map((action, index) => (
                    <div key={action.id} className="rounded-lg border border-slate-200 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                          <input
                            type="checkbox"
                            checked={action.include}
                            onChange={(event) => updateActionDraft(action.id, { include: event.target.checked })}
                            disabled={isSaving}
                          />
                          Action {index + 1}
                        </label>
                        <span className="text-xs text-slate-500">{action.title || 'No failed question'}</span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-500">Failed Question (Action Title)</p>
                        <Input
                          value={action.title}
                          readOnly
                          placeholder="Action title"
                          disabled={isSaving}
                          className="bg-slate-50"
                        />
                      </div>

                      {action.canonicalTitle ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                          Matched approved question list.
                        </div>
                      ) : (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
                          <p className="text-[11px] text-amber-900">
                            Question not found in approved list ({canonicalQuestionCount} questions).
                          </p>
                          <label className="flex items-center gap-2 text-[11px] text-amber-900">
                            <input
                              type="checkbox"
                              checked={action.nonCanonicalConfirmed}
                              onChange={(event) =>
                                updateActionDraft(action.id, {
                                  nonCanonicalConfirmed: event.target.checked,
                                })
                              }
                              disabled={isSaving}
                            />
                            Confirm and add this new question anyway.
                          </label>
                        </div>
                      )}

                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-500">What To Do To Complete</p>
                        <Textarea
                          value={action.description}
                          onChange={(event) => updateActionDraft(action.id, { description: event.target.value })}
                          rows={2}
                          placeholder="Completion task"
                          disabled={isSaving}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-slate-500">Priority</p>
                          <Select
                            value={action.priority}
                            onValueChange={(value) =>
                              updateActionDraft(action.id, { priority: normalizePriority(value) })
                            }
                            disabled={isSaving}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-slate-500">Review Date</p>
                          <Input
                            type="date"
                            value={action.dueDate}
                            readOnly
                            disabled={isSaving}
                            className="bg-slate-50"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!hasExistingActions && !canCreate ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                You have read-only access. Ask an admin or ops user to create store actions.
              </div>
            ) : null}

            {!hasExistingActions && saveError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {saveError}
              </div>
            ) : null}

            {!hasExistingActions && saveSuccess ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {saveSuccess}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
          {!loadingExistingActions && !hasExistingActions ? (
            <Button
              type="button"
              onClick={handleCreateActions}
              disabled={!canCreate || isSaving || selectedCount === 0 || pendingNonCanonicalConfirmCount > 0}
            >
              {isSaving ? 'Creating...' : 'Confirm & Create Actions'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
