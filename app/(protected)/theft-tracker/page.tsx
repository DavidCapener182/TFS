import { AlertTriangle, CheckCircle2, ClipboardList, FileText, XCircle } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TheftLogMobileRow } from '@/components/theft/theft-mobile-card'
import { TheftTrackerClient } from '@/components/theft/theft-tracker-client'
import { TheftWorkflowStrip } from '@/components/theft/theft-workflow-strip'
import { WorkspaceHeader, WorkspaceShell, WorkspaceStat, WorkspaceStatGrid } from '@/components/workspace/workspace-shell'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function getTheftMeta(incident: any) {
  const meta = incident?.persons_involved
  if (!meta || typeof meta !== 'object') return null
  const payload = meta as Record<string, any>
  if (payload.reportType !== 'theft') return null
  return payload
}

function formatTheftItems(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) return null

  const labels = items
    .map((item) => {
      const payload = item && typeof item === 'object' ? (item as Record<string, any>) : {}
      const title = String(payload.title || '').trim()
      const quantity = Math.max(1, Number(payload.quantity) || 1)
      if (!title) return null
      return quantity > 1 ? `${title} x${quantity}` : title
    })
    .filter(Boolean)

  if (labels.length === 0) return null
  if (labels.length <= 3) return labels.join(', ')
  return `${labels.slice(0, 3).join(', ')} + ${labels.length - 3} more`
}

function normalizeReferenceToken(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
}

function buildDisplayIncidentReference(
  referenceNo: string | null | undefined,
  storeCode: string | null | undefined,
  storeName: string | null | undefined,
  occurredAt: string | null | undefined,
  sequence: number
) {
  const currentReference = String(referenceNo || '').trim()
  if (!/^INC-/i.test(currentReference)) return currentReference

  const parsedDate = new Date(String(occurredAt || ''))
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
  const dateToken = safeDate.toISOString().slice(0, 10).replace(/-/g, '')
  const codeToken = normalizeReferenceToken(String(storeCode || '')) || 'STORE'
  const storeToken = normalizeReferenceToken(String(storeName || '')) || 'Store'
  return `${codeToken}-${storeToken}-${dateToken}-${String(sequence).padStart(3, '0')}`
}

function getStatusVariant(status: string) {
  const normalizedStatus = String(status || '').trim().toLowerCase()
  if (normalizedStatus === 'closed' || normalizedStatus === 'resolved') return 'success' as const
  if (normalizedStatus === 'pending' || normalizedStatus === 'review') return 'warning' as const
  return 'critical' as const
}

function formatStatusLabel(status: string) {
  const normalizedStatus = String(status || 'open').trim().toLowerCase()
  if (!normalizedStatus) return 'Open'
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)
}

export default async function TheftTrackerPage() {
  await requireAuth()
  const supabase = createClient()

  const { data } = await supabase
    .from('tfs_incidents')
    .select('id, reference_no, summary, description, occurred_at, status, persons_involved, tfs_stores:store_id(store_name, store_code)')
    .order('occurred_at', { ascending: false })
    .limit(200)

  const thefts = (data || [])
    .map((incident) => ({ incident, meta: getTheftMeta(incident) }))
    .filter((entry) => Boolean(entry.meta))

  const totalValue = thefts.reduce((acc, entry) => acc + (Number(entry.meta?.theftValueGbp) || 0), 0)
  const recoveredValue = thefts.reduce(
    (acc, entry) => acc + (entry.meta?.stockRecovered === true ? Number(entry.meta?.theftValueGbp) || 0 : 0),
    0
  )
  const unrecoveredValue = Math.max(0, totalValue - recoveredValue)
  const openTheftCount = thefts.filter((entry) => entry.incident.status !== 'closed').length
  const sequenceByPrefix = new Map<string, number>()
  const rows = thefts.flatMap(({ incident, meta }) => {
    const storeRelation = Array.isArray((incident as any).tfs_stores)
      ? (incident as any).tfs_stores[0]
      : (incident as any).tfs_stores
    const storeName = String(storeRelation?.store_name || 'Store')
    const storeCode = String(storeRelation?.store_code || '')
    const parsedDate = new Date(String(incident.occurred_at || ''))
    const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
    const dateToken = safeDate.toISOString().slice(0, 10).replace(/-/g, '')
    const codeToken = normalizeReferenceToken(storeCode) || 'STORE'
    const storeToken = normalizeReferenceToken(storeName) || 'Store'
    const prefix = `${codeToken}-${storeToken}-${dateToken}`
    const sequence = (sequenceByPrefix.get(prefix) || 0) + 1
    sequenceByPrefix.set(prefix, sequence)
    const displayReference = buildDisplayIncidentReference(
      incident.reference_no,
      storeCode,
      storeName,
      incident.occurred_at,
      sequence
    )

    const theftItems = Array.isArray(meta?.theftItems) ? meta.theftItems : []
    const normalizedItems = theftItems
      .map((item) => {
        const payload = item && typeof item === 'object' ? (item as Record<string, any>) : {}
        return {
          title: String(payload.title || '').trim(),
          barcode: String(payload.barcode || payload.productId || '').trim(),
          quantity: Math.max(1, Number(payload.quantity) || 1),
          unitPrice: Number.isFinite(Number(payload.unitPrice)) ? Number(payload.unitPrice) : null,
        }
      })
      .filter((item) => item.title || item.barcode)

    const baseRow = {
      id: incident.id,
      referenceNo: displayReference,
      storeName,
      date: Number.isNaN(parsedDate.getTime()) ? String(incident.occurred_at || '') : parsedDate.toLocaleString(),
      status: String(incident.status || 'open'),
      description: String(incident.summary || '').trim(),
      incidentDetails: String(incident.description || '').trim(),
      hasTheftBeenReported: meta?.hasTheftBeenReported !== false,
      adjustedThroughTill: meta?.adjustedThroughTill === true,
      stockRecovered: meta?.stockRecovered === true,
    }

    if (normalizedItems.length === 0) {
      return [
        {
          ...baseRow,
          barcode: '-',
          quantity: '-',
          price: Number(meta?.theftValueGbp) ? `£${Number(meta?.theftValueGbp).toFixed(2)}` : '-',
          perfumeDescription: formatTheftItems(meta?.theftItems) || baseRow.description || '-',
        },
      ]
    }

    return normalizedItems.map((item) => ({
      ...baseRow,
      barcode: item.barcode || '-',
      quantity: String(item.quantity),
      price: typeof item.unitPrice === 'number' ? `£${item.unitPrice.toFixed(2)}` : '-',
      perfumeDescription: item.title || baseRow.description || '-',
    }))
  }) satisfies TheftLogMobileRow[]

  return (
    <WorkspaceShell className="p-4 md:p-6">
      <WorkspaceHeader
        eyebrow="Operations"
        icon={AlertTriangle}
        title="Theft log"
        description="All theft reports from stores and team users, including closed cases (closed stays on this log; it only leaves open triage lists)."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">Last 200 incidents</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/theft-tracker/rankings">Theft rankings</Link>
            </Button>
          </div>
        }
      />

      <WorkspaceStatGrid className="xl:grid-cols-5">
        <WorkspaceStat
          label="Total Theft Reports"
          value={thefts.length}
          note="Captured across the current log view"
          icon={ClipboardList}
          tone="warning"
        />
        <WorkspaceStat
          label="Estimated Value"
          value={`£${totalValue.toFixed(2)}`}
          note="Combined reported loss value"
          icon={FileText}
          tone="critical"
        />
        <WorkspaceStat
          label="Recovered Value"
          value={`£${recoveredValue.toFixed(2)}`}
          note="Reports marked as stock recovered"
          icon={CheckCircle2}
          tone="success"
        />
        <WorkspaceStat
          label="Unrecovered Value"
          value={`£${unrecoveredValue.toFixed(2)}`}
          note="Reported value still unrecovered"
          icon={XCircle}
          tone="warning"
        />
        <WorkspaceStat
          label="Open Theft Reports"
          value={openTheftCount}
          note="Incidents still under review"
          icon={AlertTriangle}
          tone="info"
        />
      </WorkspaceStatGrid>

      <TheftWorkflowStrip />
      <TheftTrackerClient rows={rows} />
    </WorkspaceShell>
  )
}
