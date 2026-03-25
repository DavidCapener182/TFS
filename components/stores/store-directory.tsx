'use client'

import { Fragment, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { StoreMobileCard } from '@/components/stores/store-mobile-card'
import { Search, Store, MapPin, CheckCircle2, XCircle, Layers3 } from 'lucide-react'
import { formatStoreName } from '@/lib/store-display'
import { getStoreRegionGroup } from '@/lib/store-region-groups'
import { getDisplayStoreCode } from '@/lib/utils'
import Link from 'next/link'

interface StoreDirectoryProps {
  stores: any[]
}

export function StoreDirectory({ stores }: StoreDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredStores = useMemo(() => {
    if (!stores || stores.length === 0) return []
    if (!searchQuery.trim()) return stores

    const query = searchQuery.toLowerCase().trim()
    return stores.filter((store) => {
      const storeName = formatStoreName(store.store_name).toLowerCase()
      const storeCode = String(store.store_code || '').toLowerCase()
      const city = String(store.city || '').toLowerCase()
      const region = String(store.region || '').toLowerCase()
      const regionGroup = getStoreRegionGroup(store.region, store.store_name, store.city, store.postcode).toLowerCase()
      const address = String(store.address_line_1 || '').toLowerCase()
      const postcode = String(store.postcode || '').toLowerCase()

      return (
        storeName.includes(query) ||
        storeCode.includes(query) ||
        city.includes(query) ||
        region.includes(query) ||
        regionGroup.includes(query) ||
        address.includes(query) ||
        postcode.includes(query)
      )
    })
  }, [stores, searchQuery])

  const groupedStores = useMemo(() => {
    const groups = new Map<string, any[]>()

    filteredStores.forEach((store) => {
      const group = getStoreRegionGroup(store.region, store.store_name, store.city, store.postcode)
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push(store)
    })

    return Array.from(groups.entries())
      .map(([group, groupStores]) => ({
        group,
        stores: [...groupStores].sort((a, b) =>
          formatStoreName(a.store_name).localeCompare(formatStoreName(b.store_name), undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        ),
      }))
      .sort((a, b) => {
        if (a.group === 'Other') return 1
        if (b.group === 'Other') return -1
        return a.group.localeCompare(b.group, undefined, { numeric: true, sensitivity: 'base' })
      })
  }, [filteredStores])

  const groupCount = groupedStores.length

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-200 bg-slate-50/60 px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold text-slate-800 md:text-base">Store Directory</CardTitle>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                {filteredStores.length} shown
              </span>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              <Layers3 className="h-3 w-3" />
              {groupCount} {groupCount === 1 ? 'group' : 'groups'}
            </div>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
                placeholder="Search by name, code, city, group, postcode"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-2xl border-slate-200 bg-white pl-10 pr-4 text-base focus-visible:ring-2 focus-visible:ring-indigo-500 sm:h-10 sm:rounded-xl sm:text-sm"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Mobile Card View */}
        <div className="space-y-4 p-4 md:hidden">
          {groupedStores.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 py-12 text-slate-500">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <Store className="h-5 w-5 text-slate-400" />
              </div>
              <p className="font-medium text-slate-900">No stores found</p>
              <p className="mt-1 text-center text-sm text-slate-500">
                {searchQuery ? 'Try adjusting your search terms.' : 'Add a new store to get started.'}
              </p>
            </div>
          ) : (
            groupedStores.map((group) => (
              <section key={group.group} className="space-y-2.5">
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {group.group}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.stores.length} stores
                  </p>
                </div>
                <div className="space-y-3">
                  {group.stores.map((store) => (
                    <StoreMobileCard key={store.id} store={store} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block">
          <div className="max-h-[68vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="font-semibold text-slate-500">Store</TableHead>
                  <TableHead className="w-[130px] font-semibold text-slate-500">Code</TableHead>
                  <TableHead className="font-semibold text-slate-500">Location</TableHead>
                  <TableHead className="w-[120px] font-semibold text-slate-500">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedStores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-44 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                          <Store className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">No stores found</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {searchQuery ? 'Try adjusting your search terms.' : 'Add a new store to get started.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedStores.map((group) => (
                    <Fragment key={group.group}>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableCell colSpan={4} className="py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              <Layers3 className="h-3 w-3" />
                              {group.group}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {group.stores.length} stores
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>

                      {group.stores.map((store) => (
                        <TableRow key={store.id} className="align-top border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                          <TableCell>
                            <div className="space-y-1">
                              <Link
                                href={`/stores/${store.id}`}
                                prefetch={false}
                                className="font-semibold text-indigo-600 transition-colors hover:text-indigo-800 hover:underline"
                              >
                                {formatStoreName(store.store_name)}
                              </Link>
                              <p className="text-[11px] text-slate-500">
                                {(store.incidents?.length || 0)} incidents • {(store.actions?.length || 0)} actions
                              </p>
                            </div>
                          </TableCell>

                          <TableCell>
                            {getDisplayStoreCode(store.store_code) ? (
                              <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-600">
                                {getDisplayStoreCode(store.store_code)}
                              </span>
                            ) : (
                              <span className="text-sm text-slate-400">—</span>
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-start gap-2">
                              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                              <span className="text-sm text-slate-600">
                                {store.address_line_1 || store.city || store.postcode ? (
                                  <span>
                                    {store.address_line_1 && <span>{store.address_line_1}</span>}
                                    {store.address_line_1 && store.city && <span>, </span>}
                                    {store.city && <span>{store.city}</span>}
                                    {store.postcode && (store.address_line_1 || store.city) && <span> </span>}
                                    {store.postcode && <span className="text-slate-500">{store.postcode}</span>}
                                  </span>
                                ) : (
                                  <span className="italic text-slate-400">No address</span>
                                )}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
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
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
