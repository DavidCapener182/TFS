'use client'

import { Card } from '@/components/ui/card'
import { MapPin, CheckCircle2, XCircle, AlertTriangle, ClipboardList, ArrowUpRight, Navigation } from 'lucide-react'
import { formatStoreName } from '@/lib/store-display'
import { getDisplayStoreCode } from '@/lib/utils'
import Link from 'next/link'

interface StoreMobileCardProps {
  store: any
}

export function StoreMobileCard({ store }: StoreMobileCardProps) {
  const addressParts = [store.address_line_1, store.city, store.postcode].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  const appleMapsUrl = fullAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent(store.store_name)}&address=${encodeURIComponent(fullAddress)}`
    : null

  return (
    <Card className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/95 shadow-[0_14px_28px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_16px_32px_rgba(15,23,42,0.1)]">
      <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,#fbfdff_0%,#f4f8ff_62%,#eef5f0_100%)] px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Store Record</p>
            <p className="mt-1 truncate text-[1.02rem] font-semibold tracking-[-0.01em] text-slate-900">{formatStoreName(store.store_name)}</p>
          </div>
          {getDisplayStoreCode(store.store_code) ? (
            <span className="inline-flex rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600 shadow-sm">
              {getDisplayStoreCode(store.store_code)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">Compliance summary</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {store.is_active ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                <XCircle className="h-3 w-3" />
                Inactive
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
            <AlertTriangle className="h-3 w-3" />
            {store.incidents?.length || 0} incidents
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            <ClipboardList className="h-3 w-3" />
            {store.actions?.length || 0} actions
          </span>
        </div>

        {fullAddress && (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-3.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Location</p>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <span className="flex-1 text-sm text-slate-700">{fullAddress}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {appleMapsUrl ? (
            <a
              href={appleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Navigation className="h-4 w-4 text-slate-500" />
              Open in Maps
            </a>
          ) : null}
          <Link
            href={`/stores/${store.id}`}
            prefetch={false}
            className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-[18px] bg-[#143457] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(20,52,87,0.18)] transition-colors hover:bg-[#183c65]"
          >
            Open Record
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Card>
  )
}
