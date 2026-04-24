'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity, ArrowUpRight, Inbox, Search } from 'lucide-react'

import { CaseReviewDrawer } from '@/components/cases/case-review-drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  WorkspaceHeader,
  WorkspaceShell,
  WorkspaceStat,
  WorkspaceStatGrid,
  WorkspaceToolbar,
  WorkspaceToolbarGroup,
  WorkspaceEmptyState,
  WorkspacePreviewPanel,
  WorkspaceSplit,
} from '@/components/workspace/workspace-shell'
import {
  buildContinueWorkResolution,
  getCaseStageTone,
  getCaseTypeLabel,
  getQueueSectionLabel,
  getSeverityTone,
  groupQueueCases,
  queueSectionOrder,
  type QueueCaseRecord,
} from '@/lib/cases/workflow'
import { cn, formatAppDate, getDisplayStoreCode } from '@/lib/utils'

type QueueClientProps = {
  initialCases: QueueCaseRecord[]
}

function QueueRow({
  caseRecord,
  onReview,
  onClose,
  onViewIncidentDetails,
  onPreview,
  selected,
}: {
  caseRecord: QueueCaseRecord
  onReview: (caseId: string) => void
  onClose: (caseId: string) => void
  onViewIncidentDetails: (caseId: string) => void
  onPreview: (caseId: string) => void
  selected?: boolean
}) {
  const originHref =
    caseRecord.originTargetId &&
    (caseRecord.originTargetTable === 'tfs_incidents' ||
      caseRecord.originTargetTable === 'tfs_closed_incidents' ||
      caseRecord.originTargetTable === 'fa_incident')
      ? `/incidents/${caseRecord.originTargetId}`
      : null
  const resolution = buildContinueWorkResolution(caseRecord)
  const openMode = caseRecord.stage === 'ready_to_close' ? 'close' : 'review'
  const isDrawerFlow = resolution.mode === 'review' || resolution.mode === 'close'
  const primaryAction =
    isDrawerFlow ? (
      <Button
        type="button"
        size="sm"
        onClick={() => (openMode === 'close' ? onClose(caseRecord.id) : onReview(caseRecord.id))}
      >
        {resolution.label}
      </Button>
    ) : (
      <Button asChild size="sm">
        <Link href={resolution.href} prefetch={false}>
          {resolution.label}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </Button>
    )

  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface-raised p-4 shadow-soft transition-colors',
        selected ? 'bg-surface-subtle ring-1 ring-line-strong' : 'hover:bg-surface-subtle/60'
      )}
      onClick={() => onPreview(caseRecord.id)}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getSeverityTone(caseRecord.severity)}>{caseRecord.severity}</Badge>
            <Badge variant={getCaseStageTone(caseRecord.stage)}>{getQueueSectionLabel(caseRecord.stage)}</Badge>
            <Badge variant="outline">{getCaseTypeLabel(caseRecord.caseType)}</Badge>
            {caseRecord.originReference ? (
              <span className="rounded-full border border-line bg-surface-subtle px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                {caseRecord.originReference}
              </span>
            ) : null}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                {caseRecord.storeName}
              </h3>
              {getDisplayStoreCode(caseRecord.storeCode) ? (
                <span className="text-sm text-ink-muted">{getDisplayStoreCode(caseRecord.storeCode)}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {caseRecord.originIncidentDescription ||
                caseRecord.originIncidentSummary ||
                caseRecord.lastUpdateSummary ||
                'No update summary is recorded for this case yet.'}
            </p>
          </div>

          <div className="grid gap-3 text-sm text-ink-soft sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Owner</p>
              <p className="mt-1 font-medium text-foreground">{caseRecord.ownerName || 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Due date</p>
              <p className="mt-1 font-medium text-foreground">
                {caseRecord.dueAt ? formatAppDate(caseRecord.dueAt) : 'No due date'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Next action</p>
              <p className="mt-1 font-medium text-foreground">{caseRecord.nextActionLabel || 'Review case'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Open blockers</p>
              <p className="mt-1 font-medium text-foreground">{caseRecord.openBlockerCount}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
          {originHref ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onViewIncidentDetails(caseRecord.id)}>
              View incident details
            </Button>
          ) : null}
          {primaryAction}
          {isDrawerFlow ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => (openMode === 'close' ? onClose(caseRecord.id) : onReview(caseRecord.id))}
            >
              Open
            </Button>
          ) : (
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={resolution.href} prefetch={false}>
                Open
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function QueuePreviewPanel({
  caseRecord,
  onReview,
  onClose,
  onViewIncidentDetails,
}: {
  caseRecord: QueueCaseRecord | null
  onReview: (caseId: string) => void
  onClose: (caseId: string) => void
  onViewIncidentDetails: (caseId: string) => void
}) {
  if (!caseRecord) {
    return (
      <WorkspacePreviewPanel title="No case selected" description="Select a queue item to preview the current work item.">
        <WorkspaceEmptyState
          icon={Inbox}
          title="Select a queue item"
          description="The preview rail keeps the next action, owner, blockers, and linked origin visible while you triage."
        />
      </WorkspacePreviewPanel>
    )
  }

  const resolution = buildContinueWorkResolution(caseRecord)
  const openMode = caseRecord.stage === 'ready_to_close' ? 'close' : 'review'
  const isDrawerFlow = resolution.mode === 'review' || resolution.mode === 'close'

  return (
    <WorkspacePreviewPanel
      title={caseRecord.storeName}
      description={caseRecord.originReference || getCaseTypeLabel(caseRecord.caseType)}
      actions={<Badge variant={getCaseStageTone(caseRecord.stage)}>{getQueueSectionLabel(caseRecord.stage)}</Badge>}
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant={getSeverityTone(caseRecord.severity)}>{caseRecord.severity}</Badge>
        <Badge variant="outline">{getCaseTypeLabel(caseRecord.caseType)}</Badge>
        {getDisplayStoreCode(caseRecord.storeCode) ? <Badge variant="secondary">{getDisplayStoreCode(caseRecord.storeCode)}</Badge> : null}
      </div>

      <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Summary</p>
        <p className="mt-1 text-sm text-foreground">
          {caseRecord.originIncidentDescription ||
            caseRecord.originIncidentSummary ||
            caseRecord.lastUpdateSummary ||
            'No update summary is recorded for this case yet.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Owner</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{caseRecord.ownerName || 'Unassigned'}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Due</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{caseRecord.dueAt ? formatAppDate(caseRecord.dueAt) : 'No due date'}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Next action</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{caseRecord.nextActionLabel || 'Review case'}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-subtle/72 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Blockers</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{caseRecord.openBlockerCount}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {caseRecord.originTargetId ? (
          <Button type="button" variant="outline" onClick={() => onViewIncidentDetails(caseRecord.id)}>
            View incident details
          </Button>
        ) : null}
        {isDrawerFlow ? (
          <Button type="button" onClick={() => (openMode === 'close' ? onClose(caseRecord.id) : onReview(caseRecord.id))}>
            {resolution.label}
          </Button>
        ) : (
          <Button asChild>
            <Link href={resolution.href} prefetch={false}>
              {resolution.label}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </WorkspacePreviewPanel>
  )
}

export function QueueClient({ initialCases }: QueueClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<'review' | 'close'>('review')
  const [previewCaseId, setPreviewCaseId] = useState<string | null>(null)

  useEffect(() => {
    const caseId = searchParams?.get('case') || null
    const close = searchParams?.get('close') === '1'
    setSelectedCaseId(caseId)
    setDrawerMode(close ? 'close' : 'review')
  }, [searchParams])

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return initialCases

    return initialCases.filter((record) => {
      const haystack = [
        record.storeName,
        record.storeCode,
        record.caseType,
        record.originReference,
        record.lastUpdateSummary,
        record.nextActionLabel,
        record.ownerName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [initialCases, search])

  const groupedCases = useMemo(() => groupQueueCases(filteredCases), [filteredCases])
  const selectedCase = useMemo(
    () => filteredCases.find((record) => record.id === selectedCaseId) || initialCases.find((record) => record.id === selectedCaseId) || null,
    [filteredCases, initialCases, selectedCaseId]
  )
  const previewCase = useMemo(
    () =>
      filteredCases.find((record) => record.id === previewCaseId) ||
      initialCases.find((record) => record.id === previewCaseId) ||
      null,
    [filteredCases, initialCases, previewCaseId]
  )
  const railCase = previewCase || selectedCase || filteredCases[0] || null

  const openCaseIds = filteredCases.filter((record) => record.stage !== 'closed')
  const closedCaseCount = filteredCases.filter((record) => record.stage === 'closed').length
  const needsReviewCount = filteredCases.filter(
    (record) => record.stage === 'new_submission' || record.stage === 'under_review'
  ).length
  const visitCount = filteredCases.filter((record) => record.stage === 'visit_required').length
  const closeCount = filteredCases.filter((record) => record.stage === 'ready_to_close').length

  const openDrawer = (caseId: string, mode: 'review' | 'close') => {
    setSelectedCaseId(caseId)
    setDrawerMode(mode)
    router.replace(mode === 'close' ? `/queue?case=${caseId}&close=1` : `/queue?case=${caseId}&review=1`)
  }

  const closeDrawer = (open: boolean) => {
    if (open) return
    setSelectedCaseId(null)
    router.replace('/queue')
  }
  const openPreview = (caseId: string) => {
    setPreviewCaseId(caseId)
  }
  const closePreview = (open: boolean) => {
    if (open) return
    setPreviewCaseId(null)
  }

  return (
    <WorkspaceShell className="p-4 md:p-6">
      <WorkspaceHeader
        eyebrow="Operational Queue"
        icon={Inbox}
        title="Case queue"
        description="Start with the incoming work, move it through review, action, visit, and closure, and keep the dashboard as a summary surface."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard" prefetch={false}>
                Dashboard
              </Link>
            </Button>
          </>
        }
      />

      <WorkspaceStatGrid>
        <WorkspaceStat
          label="Open cases"
          value={openCaseIds.length}
          note={`${closedCaseCount} closed`}
          icon={Activity}
          tone="info"
        />
        <WorkspaceStat label="Needs review" value={needsReviewCount} note="New submissions and items still under review" icon={Inbox} tone="critical" />
        <WorkspaceStat label="Visit required" value={visitCount} note="Cases waiting for on-site execution" icon={Activity} tone="warning" />
        <WorkspaceStat label="Ready to close" value={closeCount} note="Blockers are clear and closure is available" icon={Activity} tone="success" />
      </WorkspaceStatGrid>

      <WorkspaceToolbar>
        <WorkspaceToolbarGroup className="justify-between gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search store, reference, type, owner, or next action"
              className="pl-9"
            />
          </div>
          <p className="text-sm text-ink-soft">{filteredCases.length} cases shown</p>
        </WorkspaceToolbarGroup>
      </WorkspaceToolbar>

      <WorkspaceSplit
        main={
          <div className="space-y-6">
            {queueSectionOrder.map((stage) => {
              const rows = groupedCases.get(stage) || []
              if (rows.length === 0) return null

              return (
                <Card key={stage} className="rounded-[1.5rem]">
                  <CardHeader className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>{getQueueSectionLabel(stage)}</CardTitle>
                      <CardDescription>
                        {stage === 'new_submission'
                          ? 'Portal submissions and fresh intake waiting for first review.'
                          : stage === 'under_review'
                            ? 'Cases still being assessed before the next action is agreed.'
                            : stage === 'action_agreed'
                              ? 'Linked follow-up is open and blocking closure.'
                              : stage === 'visit_required'
                                ? 'On-site follow-up is required before the case can move on.'
                                : stage === 'awaiting_follow_up'
                                  ? 'The case is waiting on linked work or a next step after review.'
                                  : stage === 'ready_to_close'
                                    ? 'All blockers are clear and closure is available.'
                                    : 'Recently closed work items for quick review.'}
                      </CardDescription>
                    </div>
                    <Badge variant={getCaseStageTone(stage)}>{rows.length}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-6">
                    {rows.map((caseRecord) => (
                      <QueueRow
                        key={caseRecord.id}
                        caseRecord={caseRecord}
                        onReview={(caseId) => openDrawer(caseId, 'review')}
                        onClose={(caseId) => openDrawer(caseId, 'close')}
                        onViewIncidentDetails={openPreview}
                        onPreview={openPreview}
                        selected={caseRecord.id === railCase?.id}
                      />
                    ))}
                  </CardContent>
                </Card>
              )
            })}

            {filteredCases.length === 0 ? (
              <WorkspaceEmptyState
                icon={Inbox}
                title="No queue items are visible"
                description="Adjust the search, or create new work from store portal submissions and visit follow-ups."
              />
            ) : null}
          </div>
        }
        preview={
          <QueuePreviewPanel
            caseRecord={railCase}
            onReview={(caseId) => openDrawer(caseId, 'review')}
            onClose={(caseId) => openDrawer(caseId, 'close')}
            onViewIncidentDetails={openPreview}
          />
        }
      />

      <CaseReviewDrawer
        caseRecord={selectedCase}
        open={Boolean(selectedCase)}
        mode={drawerMode}
        onOpenChange={closeDrawer}
      />
      <Dialog open={Boolean(previewCase)} onOpenChange={closePreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Incident details preview</DialogTitle>
            <DialogDescription>
              {previewCase?.storeName || 'Store'} • {previewCase?.originReference || 'No reference'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-subtle/72 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Summary</p>
              <p className="mt-1 text-sm text-foreground">
                {previewCase?.originIncidentSummary || previewCase?.lastUpdateSummary || 'No summary recorded.'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-subtle/72 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {previewCase?.originIncidentDescription || 'No incident description recorded.'}
              </p>
            </div>
            {previewCase?.caseType === 'portal_theft' ? (
              <div className="rounded-xl border border-line bg-surface-subtle/72 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Theft details</p>
                <p className="mt-1 text-sm text-foreground">
                  {previewCase.originTheftItemsSummary || 'No stolen item lines recorded.'}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  Theft value:{' '}
                  {typeof previewCase.originTheftValueGbp === 'number'
                    ? `£${previewCase.originTheftValueGbp.toFixed(2)}`
                    : 'Not recorded'}
                </p>
              </div>
            ) : null}
            {previewCase?.originTargetId ? (
              <div className="flex justify-end">
                <Button asChild>
                  <Link href={`/incidents/${previewCase.originTargetId}`} prefetch={false}>
                    Open incident page
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceShell>
  )
}
