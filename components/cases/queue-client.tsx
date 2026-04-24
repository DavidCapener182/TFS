'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity, ArrowUpRight, Inbox, Search } from 'lucide-react'

import { importLegacyCasesAction } from '@/app/actions/cases'
import { CaseReviewDrawer } from '@/components/cases/case-review-drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  WorkspaceHeader,
  WorkspaceShell,
  WorkspaceStat,
  WorkspaceStatGrid,
  WorkspaceToolbar,
  WorkspaceToolbarGroup,
} from '@/components/workspace/workspace-shell'
import { toast } from '@/hooks/use-toast'
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
import { formatAppDate, getDisplayStoreCode } from '@/lib/utils'

type QueueClientProps = {
  initialCases: QueueCaseRecord[]
  canManage: boolean
}

function QueueRow({
  caseRecord,
  onReview,
  onClose,
}: {
  caseRecord: QueueCaseRecord
  onReview: (caseId: string) => void
  onClose: (caseId: string) => void
}) {
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
    <div className="rounded-2xl border border-line bg-surface-raised p-4 shadow-soft">
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
              {caseRecord.lastUpdateSummary || 'No update summary is recorded for this case yet.'}
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

        <div className="flex shrink-0 items-center gap-2">
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

export function QueueClient({ initialCases, canManage }: QueueClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<'review' | 'close'>('review')
  const [isImporting, startImport] = useTransition()

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

  const openCaseIds = filteredCases.filter((record) => record.stage !== 'closed')
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

  const runImport = () => {
    startImport(async () => {
      try {
        const result = await importLegacyCasesAction()
        toast({
          title: 'Queue import complete',
          description: `${result.created} legacy items were linked into the case queue.`,
          variant: 'success',
        })
        router.refresh()
      } catch (error) {
        toast({
          title: 'Queue import failed',
          description: error instanceof Error ? error.message : 'The legacy import could not be completed.',
          variant: 'destructive',
        })
      }
    })
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
            {canManage ? (
              <Button type="button" onClick={runImport} disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Import legacy work'}
              </Button>
            ) : null}
          </>
        }
      />

      <WorkspaceStatGrid>
        <WorkspaceStat label="Open cases" value={openCaseIds.length} note="Active work across all queue stages" icon={Activity} tone="info" />
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
                  />
                ))}
              </CardContent>
            </Card>
          )
        })}

        {filteredCases.length === 0 ? (
          <Card className="rounded-[1.5rem] border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="rounded-full border border-line bg-surface-subtle p-4 text-ink-soft">
                <Inbox className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">No queue items are visible</h3>
                <p className="mt-1 text-sm text-ink-soft">
                  Adjust the search or import legacy incidents and unresolved store actions into the queue.
                </p>
              </div>
              {canManage ? (
                <Button type="button" onClick={runImport} disabled={isImporting}>
                  {isImporting ? 'Importing...' : 'Import legacy work'}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <CaseReviewDrawer
        caseRecord={selectedCase}
        open={Boolean(selectedCase)}
        mode={drawerMode}
        onOpenChange={closeDrawer}
      />
    </WorkspaceShell>
  )
}
