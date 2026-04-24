'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardList, MapPin, Navigation, XCircle } from 'lucide-react'

import type { WorkspaceDensity } from '@/components/workspace/workspace-shell'
import type { StoreDirectoryStore } from '@/components/stores/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatStoreName } from '@/lib/store-display'
import { getDisplayStoreCode } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface StoreMobileCardProps {
  store: StoreDirectoryStore
  density?: WorkspaceDensity
  selected?: boolean
}

function getOpenIncidentCount(store: StoreDirectoryStore) {
  return store.incidents.filter((incident) => !['closed', 'cancelled'].includes(String(incident.status || '').toLowerCase())).length
}

function getOpenActionCount(store: StoreDirectoryStore) {
  return store.actions.filter((action) => !['complete', 'cancelled'].includes(String(action.status || '').toLowerCase())).length
}

export function StoreMobileCard({
  store,
  density = 'comfortable',
  selected = false,
}: StoreMobileCardProps) {
  const addressParts = [store.address_line_1, store.city, store.postcode].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  const appleMapsUrl = fullAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent(store.store_name)}&address=${encodeURIComponent(fullAddress)}`
    : null
  const openIncidents = getOpenIncidentCount(store)
  const openActions = getOpenActionCount(store)

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-[1.5rem] transition-colors',
        selected ? 'border-line-strong bg-surface-subtle/72' : 'bg-surface-raised',
        density === 'compact' ? 'shadow-soft' : 'shadow-panel'
      )}
    >
      <div className="border-b border-line bg-surface-subtle/72 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Store CRM</p>
            <p className="mt-1 truncate text-[1.02rem] font-semibold tracking-[-0.01em] text-foreground">
              {formatStoreName(store.store_name)}
            </p>
          </div>
          {getDisplayStoreCode(store.store_code) ? (
            <span className="inline-flex rounded-full border border-line bg-surface-raised px-2.5 py-1 font-mono text-[11px] font-semibold text-ink-soft shadow-soft">
              {getDisplayStoreCode(store.store_code)}
            </span>
          ) : null}
        </div>
      </div>

      <div className={cn('space-y-4 p-4', density === 'compact' && 'space-y-3')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink-muted">
              {store.region || 'No region'}
              {store.city ? ` • ${store.city}` : ''}
            </p>
          </div>
          {store.is_active ? (
            <Badge variant="success" className="gap-1 px-2 py-0.5 text-[10px]">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 px-2 py-0.5 text-[10px]">
              <XCircle className="h-3 w-3" />
              Inactive
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={openIncidents > 0 ? 'critical' : 'secondary'} className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {openIncidents} open incidents
          </Badge>
          <Badge variant={openActions > 0 ? 'warning' : 'secondary'} className="gap-1">
            <ClipboardList className="h-3 w-3" />
            {openActions} open actions
          </Badge>
        </div>

        {fullAddress ? (
          <div className="rounded-[1.1rem] border border-line bg-surface-subtle/72 p-3.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Location</p>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted" />
              <span className="flex-1 text-sm text-ink-soft">{fullAddress}</span>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          {appleMapsUrl ? (
            <Button asChild variant="outline" className="flex-1 rounded-[1rem]">
              <a href={appleMapsUrl} target="_blank" rel="noreferrer">
                <Navigation className="h-4 w-4" />
                Open in Maps
              </a>
            </Button>
          ) : null}
          <Button asChild className="flex-1 rounded-[1rem]">
            <Link href={`/stores/${store.id}`} prefetch={false}>
              Open Record
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  )
}
