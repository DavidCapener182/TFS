'use client'

import { Card } from '@/components/ui/card'
import { MapPin, CheckCircle2, XCircle, AlertTriangle, ClipboardList } from 'lucide-react'
import { getDisplayStoreCode } from '@/lib/utils'
import Link from 'next/link'

interface StoreMobileCardProps {
  store: any
}

export function StoreMobileCard({ store }: StoreMobileCardProps) {
  // Build address string for Google Maps
  const addressParts = [store.address_line_1, store.city, store.postcode].filter(Boolean)
  const fullAddress = addressParts.join(', ')

  // Google Maps embed URL (no API key required)
  const googleMapsEmbedUrl = fullAddress
    ? `https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`
    : null

  return (
    <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Google Maps Embed */}
      {googleMapsEmbedUrl && (
        <div className="relative h-40 w-full bg-slate-100">
          <iframe
            src={googleMapsEmbedUrl}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full w-full"
            title={`${store.store_name} map`}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      )}

      {/* Store Information */}
      <div className="space-y-3 p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/stores/${store.id}`}>
              <h3 className="cursor-pointer text-lg font-semibold leading-tight text-indigo-600 transition-colors hover:text-indigo-800 hover:underline">
                {store.store_name}
              </h3>
            </Link>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {getDisplayStoreCode(store.store_code) && (
              <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600">
                {getDisplayStoreCode(store.store_code)}
              </span>
            )}
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

        {/* Meta */}
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
            <AlertTriangle className="h-3 w-3" />
            {store.incidents?.length || 0} incidents
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            <ClipboardList className="h-3 w-3" />
            {store.actions?.length || 0} actions
          </span>
        </div>

        {/* Location */}
        {fullAddress && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Location</p>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <span className="flex-1 text-sm text-slate-700">{fullAddress}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
