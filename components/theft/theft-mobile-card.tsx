import Link from 'next/link'
import { ArrowUpRight, Barcode, CalendarDays, MapPin, Package, PoundSterling } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatStoreName } from '@/lib/store-display'

export type TheftLogMobileRow = {
  id: string
  referenceNo: string
  storeName: string
  date: string
  status: string
  perfumeDescription: string
  barcode: string
  quantity: string
  price: string
  incidentDetails: string
  hasTheftBeenReported: boolean
  adjustedThroughTill: boolean
  stockRecovered: boolean
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

function YesNoBadge({ label, value }: { label: string; value: boolean }) {
  return (
    <Badge variant={value ? 'success' : 'outline'} className="px-2 py-0.5 text-[10px]">
      {label}: {value ? 'Yes' : 'No'}
    </Badge>
  )
}

export function TheftMobileCard({
  row,
  showStoreName = true,
  viewHref,
}: {
  row: TheftLogMobileRow
  showStoreName?: boolean
  viewHref?: string | null
}) {
  const resolvedViewHref = viewHref === undefined ? `/incidents/${row.id}` : viewHref
  return (
    <Card className="overflow-hidden rounded-[1.35rem] bg-surface-raised shadow-soft">
      <div className="border-b border-line bg-surface-subtle/72 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {resolvedViewHref ? (
              <Link href={resolvedViewHref} className="font-mono text-sm font-semibold text-info">
                {row.referenceNo}
              </Link>
            ) : (
              <span className="font-mono text-sm font-semibold text-info">{row.referenceNo}</span>
            )}
            {showStoreName ? (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted" />
                <span className="truncate">{formatStoreName(row.storeName)}</span>
              </div>
            ) : null}
          </div>
          <Badge variant={getStatusVariant(row.status)} className="shrink-0">
            {formatStatusLabel(row.status)}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Product</p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-foreground">{row.perfumeDescription}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
            <div className="flex items-center gap-1.5 rounded-[0.9rem] border border-line bg-surface-subtle/72 px-3 py-2">
              <Barcode className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted" />
              <span className="truncate">{row.barcode}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-[0.9rem] border border-line bg-surface-subtle/72 px-3 py-2">
              <PoundSterling className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted" />
              <span className="truncate">{row.price}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-ink-muted" />
              {row.date}
            </span>
            <span className="font-semibold text-foreground">Qty {row.quantity}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <YesNoBadge label="Reported" value={row.hasTheftBeenReported} />
          <YesNoBadge label="Adjusted" value={row.adjustedThroughTill} />
          <YesNoBadge label="Recovered" value={row.stockRecovered} />
        </div>

        {row.incidentDetails ? (
          <p className="line-clamp-2 rounded-[1rem] border border-line bg-surface-subtle/72 px-3 py-2 text-xs text-ink-soft">
            {row.incidentDetails}
          </p>
        ) : null}

        {resolvedViewHref ? (
          <Button asChild variant="outline" className="h-11 w-full rounded-[1rem]">
            <Link href={resolvedViewHref}>
              View details
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
