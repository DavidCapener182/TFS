'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity, ArrowUpRight, ClipboardList, NotebookPen, UserRound } from 'lucide-react'

import { CaseReviewDrawer } from '@/components/cases/case-review-drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WorkspaceEmptyState, WorkspaceSectionCard } from '@/components/workspace/workspace-shell'
import {
  buildContinueWorkResolution,
  getCaseStageTone,
  getCaseTypeLabel,
  getQueueSectionLabel,
  getSeverityTone,
  type QueueCaseRecord,
} from '@/lib/cases/workflow'
import type { StoreCaseFileData } from '@/lib/cases/service'
import type { VisitTrackerRow } from '@/components/visit-tracker/types'
import { formatAppDate, formatAppDateTime } from '@/lib/utils'

type StoreCaseFileProps = {
  storeId: string
  caseData: StoreCaseFileData
  visitTrackerRow: VisitTrackerRow
  contactCount: number
  noteCount: number
  trackerEntryCount: number
}

function ActiveCaseCard({
  caseRecord,
  onReview,
  onClose,
}: {
  caseRecord: QueueCaseRecord
  onReview: (caseId: string) => void
  onClose: (caseId: string) => void
}) {
  const resolution = buildContinueWorkResolution(caseRecord)

  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-4 shadow-soft">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getSeverityTone(caseRecord.severity)}>{caseRecord.severity}</Badge>
          <Badge variant={getCaseStageTone(caseRecord.stage)}>{getQueueSectionLabel(caseRecord.stage)}</Badge>
          <Badge variant="outline">{getCaseTypeLabel(caseRecord.caseType)}</Badge>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {caseRecord.originReference || caseRecord.storeName}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {caseRecord.lastUpdateSummary || 'No case summary is available yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span>Owner: {caseRecord.ownerName || 'Unassigned'}</span>
          <span>Due: {caseRecord.dueAt ? formatAppDate(caseRecord.dueAt) : 'No due date'}</span>
          <span>Blockers: {caseRecord.openBlockerCount}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {resolution.mode === 'review' ? (
            <Button type="button" size="sm" onClick={() => onReview(caseRecord.id)}>
              Continue review
            </Button>
          ) : resolution.mode === 'close' ? (
            <Button type="button" size="sm" onClick={() => onClose(caseRecord.id)}>
              Close work item
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <a href="#case-active-work">
                Continue work
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function StoreCaseFile({
  storeId,
  caseData,
  visitTrackerRow,
  contactCount,
  noteCount,
  trackerEntryCount,
}: StoreCaseFileProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<'review' | 'close'>('review')

  useEffect(() => {
    const caseId = searchParams?.get('case') || null
    const close = searchParams?.get('close') === '1'
    setSelectedCaseId(caseId)
    setDrawerMode(close ? 'close' : 'review')
  }, [searchParams])

  const selectedCase = useMemo(
    () => caseData.cases.find((record) => record.id === selectedCaseId) || null,
    [caseData.cases, selectedCaseId]
  )

  const activeCases = useMemo(
    () => caseData.cases.filter((record) => record.stage !== 'closed'),
    [caseData.cases]
  )
  const topCase = activeCases[0] || null
  const topResolution = topCase ? buildContinueWorkResolution(topCase) : null

  const openCase = (caseId: string, mode: 'review' | 'close') => {
    setSelectedCaseId(caseId)
    setDrawerMode(mode)
    router.replace(mode === 'close' ? `/stores/${storeId}?case=${caseId}&close=1` : `/stores/${storeId}?case=${caseId}&review=1`)
  }

  const closeDrawer = (open: boolean) => {
    if (open) return
    setSelectedCaseId(null)
    router.replace(`/stores/${storeId}`)
  }

  const highestSeverity =
    activeCases.find((record) => record.severity === 'critical')?.severity ||
    activeCases.find((record) => record.severity === 'high')?.severity ||
    activeCases.find((record) => record.severity === 'medium')?.severity ||
    activeCases.find((record) => record.severity === 'low')?.severity ||
    'low'

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_20rem]">
        <div id="case-active-work">
          <WorkspaceSectionCard>
          <CardHeader className="border-b border-line bg-surface-subtle/72">
            <CardTitle>Active work</CardTitle>
            <CardDescription>
              Current queue items, next best action, and live blockers for this store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Current risk</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={getSeverityTone(highestSeverity)}>{highestSeverity}</Badge>
                  <span className="text-sm text-ink-soft">{activeCases.length} open case items</span>
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Next best action</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {topCase?.nextActionLabel || 'No active case action'}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {topResolution?.reason || 'This store has no active queue work.'}
                </p>
              </div>
            </div>

            {topResolution ? (
              <div className="flex flex-wrap gap-2">
                {topResolution.mode === 'review' ? (
                  <Button type="button" onClick={() => openCase(topResolution.caseId, 'review')}>
                    Continue review
                  </Button>
                ) : topResolution.mode === 'close' ? (
                  <Button type="button" onClick={() => openCase(topResolution.caseId, 'close')}>
                    Close work item
                  </Button>
                ) : (
                  <Button asChild>
                    <a href="#case-active-work">
                      Continue work
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link href="/queue" prefetch={false}>
                    Open queue
                  </Link>
                </Button>
              </div>
            ) : null}

            {activeCases.length > 0 ? (
              <div className="space-y-3">
                {activeCases.map((caseRecord) => (
                  <ActiveCaseCard
                    key={caseRecord.id}
                    caseRecord={caseRecord}
                    onReview={(caseId) => openCase(caseId, 'review')}
                    onClose={(caseId) => openCase(caseId, 'close')}
                  />
                ))}
              </div>
            ) : (
              <WorkspaceEmptyState
                icon={ClipboardList}
                title="No active case work"
                description="This store has no open queue items yet. Imported incidents and follow-ups will appear here."
              />
            )}
          </CardContent>
          </WorkspaceSectionCard>
        </div>

        <WorkspaceSectionCard>
          <CardHeader className="border-b border-line bg-surface-subtle/72">
            <CardTitle>Unified timeline</CardTitle>
            <CardDescription>
              Review, action, visit, and closure events are rendered here in one chronological thread.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {caseData.events.length === 0 ? (
              <WorkspaceEmptyState
                icon={Activity}
                title="No case timeline yet"
                description="Once queue-backed work starts for this store, every decision and linked action will appear here."
              />
            ) : (
              caseData.events.slice(0, 18).map((event) => (
                <div key={event.id} className="relative pl-6">
                  <span className="absolute left-1 top-1.5 h-2.5 w-2.5 rounded-full bg-brand" />
                  <div className="rounded-2xl border border-line bg-surface-raised p-4 shadow-soft">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{event.summary}</p>
                          <Badge variant={getCaseStageTone(event.caseStage)}>{getQueueSectionLabel(event.caseStage)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-ink-soft">
                          {event.detail || getCaseTypeLabel(event.caseType)}
                        </p>
                      </div>
                      <div className="text-right text-xs text-ink-muted">
                        <p>{formatAppDateTime(event.event_at)}</p>
                        <p className="mt-1">{event.actorName || 'System'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-muted">
                      {event.caseReference ? <span>Ref: {event.caseReference}</span> : null}
                      <span>{getCaseTypeLabel(event.caseType)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </WorkspaceSectionCard>

        <WorkspaceSectionCard>
          <CardHeader className="border-b border-line bg-surface-subtle/72">
            <CardTitle>Support context</CardTitle>
            <CardDescription>
              Contacts, notes, and visit planning stay visible while work is being progressed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Visit status</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {visitTrackerRow.nextPlannedVisitDate ? `Planned ${formatAppDate(visitTrackerRow.nextPlannedVisitDate)}` : 'No planned visit'}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {visitTrackerRow.lastVisitDate ? `Last visit ${formatAppDate(visitTrackerRow.lastVisitDate)}` : 'No visit logged yet'}
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Contacts</p>
                <div className="mt-2 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-ink-muted" />
                  <span className="text-sm font-semibold text-foreground">{contactCount}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Notes</p>
                <div className="mt-2 flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-ink-muted" />
                  <span className="text-sm font-semibold text-foreground">{noteCount}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-surface-subtle/72 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Planning context</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{trackerEntryCount} tracker entries</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {visitTrackerRow.visitNeedReasons.length > 0
                    ? visitTrackerRow.visitNeedReasons.join(' • ')
                    : 'No current visit drivers recorded.'}
                </p>
              </div>
            </div>
          </CardContent>
        </WorkspaceSectionCard>
      </div>

      <CaseReviewDrawer
        caseRecord={selectedCase}
        open={Boolean(selectedCase)}
        mode={drawerMode}
        onOpenChange={closeDrawer}
      />
    </>
  )
}
