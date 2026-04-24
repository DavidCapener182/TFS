'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatStoreName } from '@/lib/store-display'

type IncidentPreviewDrawerProps = {
  incident: any
  referenceLabel: string
  rootCause?: string | null
  recommendations?: string | null
}

function formatIncidentDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  }).format(parsed)
}

function titleFromSnake(value: string | null | undefined) {
  return String(value || 'uncategorised')
    .split('_')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[1rem] border border-line bg-surface-subtle/72 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

export function IncidentPreviewDrawer({
  incident,
  referenceLabel,
  rootCause,
  recommendations,
}: IncidentPreviewDrawerProps) {
  const [open, setOpen] = useState(false)
  const storeName = formatStoreName(incident.tfs_stores?.store_name) || 'Unknown Store'
  const summary = incident.summary || incident.description || 'No summary recorded.'
  const closed = ['closed', 'cancelled'].includes(String(incident.status || '').toLowerCase())

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
        onClick={() => setOpen(true)}
      >
        <Eye className="h-4 w-4" />
        Preview
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto px-5 pb-6 pt-16 sm:w-[500px]">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                {closed ? 'Archived incident' : 'Live incident'}
              </p>
              <SheetTitle className="mt-1 font-mono text-lg font-semibold text-foreground">
                {referenceLabel}
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-ink-soft">
                {storeName} · {formatIncidentDate(incident.occurred_at)}
              </SheetDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge status={incident.severity} type="severity" />
              <StatusBadge status={incident.status} type="incident" />
              {incident.riddor_reportable ? <Badge variant="destructive">Escalated</Badge> : null}
              {closed ? <Badge variant="secondary">Archive</Badge> : <Badge variant="info">Live case</Badge>}
            </div>

            <div className="grid gap-3">
              <DetailField label="Summary" value={summary} />
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Category" value={titleFromSnake(incident.incident_category)} />
                <DetailField label="Person" value={titleFromSnake(incident.person_type || incident.personType)} />
              </div>
              <DetailField label="Root cause" value={rootCause || 'Not recorded.'} />
              <DetailField label="Recommendations" value={recommendations || 'No recommendations recorded.'} />
              <DetailField
                label="Investigator"
                value={incident.investigator?.full_name || 'Unassigned'}
              />
              {closed ? <DetailField label="Closed" value={formatIncidentDate(incident.closed_at)} /> : null}
            </div>

            <Button asChild className="w-full">
              <Link href={`/incidents/${incident.id}`}>Open full incident record</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
