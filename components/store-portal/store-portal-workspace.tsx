'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ClipboardList, Menu, PackageSearch, LogOut, X, Search, ShieldAlert, Store } from 'lucide-react'

import { createStorePortalReport, logoutStorePortal } from '@/app/actions/store-portal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type CatalogItem = { productId: string; title: string; price: number | null; brand?: string | null }
type PortalTab = 'incident' | 'theft' | 'theft-log'

const portalNavItems: Array<{
  id: PortalTab
  label: string
  icon: typeof AlertTriangle
  description: string
}> = [
  {
    id: 'incident',
    label: 'Log incident',
    icon: AlertTriangle,
    description: 'General incidents, safety concerns, and operational issues.',
  },
  {
    id: 'theft',
    label: 'Log theft',
    icon: ShieldAlert,
    description: 'Capture stolen items, estimated value, and incident details.',
  },
  {
    id: 'theft-log',
    label: 'Theft log',
    icon: ClipboardList,
    description: 'Review theft reports submitted by this store only.',
  },
]

function formatCurrency(value: number | null) {
  return typeof value === 'number' ? `£${value.toFixed(2)}` : 'Price unavailable'
}

function EmptySearchState({
  search,
  hasSearched,
  searching,
}: {
  search: string
  hasSearched: boolean
  searching: boolean
}) {
  if (searching) {
    return <p className="text-sm text-slate-500">Searching website products…</p>
  }
  if (!hasSearched) {
    return <p className="text-sm text-slate-500">Search by brand, product name, or SKU keyword.</p>
  }
  if (search.trim().length < 2) {
    return <p className="text-sm text-amber-700">Enter at least 2 characters to search.</p>
  }
  return <p className="text-sm text-slate-500">No products found for that search.</p>
}

export function StorePortalWorkspace({
  storeName,
  storeCode,
  recentReports,
}: {
  storeName: string
  storeCode: string
  recentReports: Array<{
    id: string
    reference_no: string
    summary: string
    description: string
    occurred_at: string
    status: string
    isTheft: boolean
    theftValueGbp: number | null
    theftItems: Array<{ title: string; quantity: number; barcode?: string | null; unitPrice?: number | null }>
    hasTheftBeenReported?: boolean | null
    adjustedThroughTill?: boolean | null
    stockRecovered?: boolean | null
  }>
}) {
  const router = useRouter()
  const [tab, setTab] = useState<PortalTab>('incident')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16))
  const [search, setSearch] = useState('')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [items, setItems] = useState<
    Array<{ productId: string; title: string; quantity: number; unitPrice: number | null; barcode: string }>
  >([])
  const [hasTheftBeenReported, setHasTheftBeenReported] = useState(true)
  const [adjustedThroughTill, setAdjustedThroughTill] = useState(false)
  const [stockRecovered, setStockRecovered] = useState(false)
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [lastAddedProductTitle, setLastAddedProductTitle] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const activeNav = portalNavItems.find((item) => item.id === tab) || portalNavItems[0]
  const theftTotal = useMemo(
    () => items.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0),
    [items]
  )
  const theftReports = useMemo(() => recentReports.filter((report) => report.isTheft), [recentReports])
  const theftLogTotalValue = useMemo(
    () => theftReports.reduce((acc, report) => acc + (report.theftValueGbp || 0), 0),
    [theftReports]
  )
  const theftLogRows = useMemo(() => {
    return theftReports.flatMap((report) => {
      const normalizedItems = (report.theftItems || [])
        .map((item) => ({
          title: String(item.title || '').trim(),
          barcode: String(item.barcode || '').trim() || '-',
          quantity: Math.max(1, Number(item.quantity) || 1),
          unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : null,
        }))
        .filter((item) => item.title || item.barcode !== '-')

      const baseRow = {
        id: report.id,
        referenceNo: report.reference_no,
        date: report.occurred_at ? new Date(report.occurred_at).toLocaleString() : '-',
        status: report.status || 'open',
        incidentDetails: report.description || '',
        hasTheftBeenReported: report.hasTheftBeenReported !== false,
        adjustedThroughTill: report.adjustedThroughTill === true,
        stockRecovered: report.stockRecovered === true,
      }

      if (normalizedItems.length === 0) {
        return [
          {
            ...baseRow,
            perfumeDescription: report.summary || 'Theft report',
            barcode: '-',
            quantity: '-',
            price: report.theftValueGbp !== null ? `£${Number(report.theftValueGbp).toFixed(2)}` : '-',
          },
        ]
      }

      return normalizedItems.map((item) => ({
        ...baseRow,
        perfumeDescription: item.title,
        barcode: item.barcode || '-',
        quantity: String(item.quantity),
        price: typeof item.unitPrice === 'number' ? `£${item.unitPrice.toFixed(2)}` : '-',
      }))
    })
  }, [theftReports])
  const openReportCount = recentReports.filter((report) => report.status !== 'closed').length
  const theftReportCount = recentReports.filter((report) => report.isTheft).length
  const normalizedSearch = search.trim().toLowerCase()
  const showSearchDropdown = tab === 'theft' && normalizedSearch.length >= 2
  const selectedProductIds = new Set(items.map((item) => item.productId))
  const formTab = tab === 'incident' || tab === 'theft' ? tab : 'theft'

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) {
      setCatalog([])
      setSearching(false)
      setHasSearched(false)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    setSearching(true)
    setHasSearched(false)
    setSearchError(null)

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/store-visits/products/search?q=${encodeURIComponent(query)}&limit=8`,
          { method: 'GET', signal: controller.signal }
        )
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || 'Search failed')
        }

        setCatalog(Array.isArray(payload?.items) ? payload.items : [])
        setHasSearched(true)
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Product search failed:', error)
          setCatalog([])
          setHasSearched(true)
          setSearchError(error instanceof Error ? error.message : 'Could not search website products')
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [search, tab])

  function resetForm(nextTab: PortalTab) {
    setTab(nextTab)
    setSummary('')
    setDescription('')
    setSeverity('medium')
    setOccurredAt(new Date().toISOString().slice(0, 16))
    setSearch('')
    setCatalog([])
    setItems([])
    setHasSearched(false)
    setSearchError(null)
    setLastAddedProductTitle(null)
    setHasTheftBeenReported(true)
    setAdjustedThroughTill(false)
    setStockRecovered(false)
    setSubmitError(null)
    setSuccessMessage(null)
    setMobileNavOpen(false)
  }

  function addCatalogItem(item: CatalogItem) {
    setLastAddedProductTitle(item.title)
    setSearch('')
    setCatalog([])
    setHasSearched(false)
    setSearchError(null)

    setItems((current) => {
      const existing = current.find((entry) => entry.productId === item.productId)
      if (existing) {
        return current.map((entry) =>
          entry.productId === item.productId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        )
      }

      return [
        ...current,
        {
          productId: item.productId,
          title: item.title,
          quantity: 1,
          unitPrice: item.price,
          barcode: item.productId,
        },
      ]
    })
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-5 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:h-20 md:px-6 md:py-0">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-28 md:h-20 md:w-44">
            <Image
              src="/tfs-logo.svg"
              alt="The Fragrance Shop"
              fill
              sizes="176px"
              className="object-contain"
            />
          </div>
          <div className="min-w-0 md:hidden">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#4b3a78]">The Fragrance Shop</p>
            <p className="text-sm font-semibold text-slate-900">Store portal</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 md:hidden"
          aria-label="Close store navigation"
        >
          <X className="h-5 w-5 text-slate-600" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/85 shadow-[0_16px_30px_rgba(15,23,42,0.08)] md:space-y-1.5 md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
          {portalNavItems.map((item) => {
            const Icon = item.icon
            const isActive = item.id === tab

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => resetForm(item.id)}
                className={cn(
                  'flex w-full items-start gap-3 border-t border-slate-100 px-4 py-4 text-left first:border-t-0 md:rounded-2xl md:border-t-0',
                  isActive
                    ? 'bg-white text-slate-950 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)] md:bg-white'
                    : 'text-slate-700 hover:bg-slate-50 md:text-white/80 md:hover:bg-white/10 md:hover:text-white'
                )}
              >
                <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', isActive ? 'text-slate-900' : 'text-slate-400 md:text-white/70')} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className={cn('mt-1 block text-xs leading-5', isActive ? 'text-slate-500' : 'text-slate-500 md:text-white/55')}>
                    {item.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="p-4 pt-2">
        <div className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm md:rounded-[24px] md:border-white/10 md:bg-white/10 md:shadow-none">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#232154] md:bg-white/16">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 md:text-white">{storeName}</p>
              <p className="truncate text-xs text-slate-500 md:text-white/70">Store code: {storeCode}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-[#1c0259] md:h-screen-zoom md:min-h-0">
      <aside className="no-print hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col md:bg-[linear-gradient(180deg,#1c0259_0%,#232154_60%,#2a265f_100%)]">
        {sidebarContent}
      </aside>

      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-[#0b1320]/28 backdrop-blur-sm md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'no-print fixed left-0 top-0 z-[70] flex h-screen w-[86vw] max-w-[348px] flex-col rounded-r-[32px] border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(236,242,247,0.98)_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.22)] transition-all duration-300 md:hidden',
          mobileNavOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
        )}
      >
        {sidebarContent}
      </aside>

      <div className="flex min-h-screen flex-col bg-[#232154] md:ml-64 md:min-h-screen md:overflow-hidden">
        <header className="no-print sticky top-0 z-30 border-b border-white/10 bg-[linear-gradient(180deg,rgba(28,2,89,0.98)_0%,rgba(35,33,84,0.95)_100%)] px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:fixed md:left-64 md:right-0 md:top-0 md:z-50 md:flex md:h-16 md:items-center md:justify-between md:border-b-0 md:bg-[#232154] md:px-6 md:pt-0 lg:px-8">
          <div className="flex w-full items-center justify-between gap-3 pb-4 pt-3 md:pb-0 md:pt-0">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[18px] border border-white/10 bg-white/8 p-2 text-white shadow-[0_8px_20px_rgba(2,12,24,0.18)] transition-colors hover:bg-white/12 md:hidden"
                aria-label="Open store navigation"
              >
                <Menu className="h-6 w-6 text-white" />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                  Store portal
                </p>
                <h1 className="truncate text-[1.08rem] font-semibold tracking-[-0.01em] text-white md:text-xl">
                  {activeNav.label}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-medium text-white/80 md:block">
                {storeName} · {storeCode}
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  startTransition(async () => {
                    await logoutStorePortal()
                    router.push('/store-login')
                    router.refresh()
                  })
                }
                disabled={pending}
                className="h-10 rounded-full border border-white/10 bg-white/8 px-4 text-white shadow-[0_8px_18px_rgba(2,12,24,0.14)] hover:bg-white/12 hover:text-white"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-[#f7f4fb] px-3.5 pb-8 pt-4 sm:px-4 md:min-h-0 md:overflow-y-auto md:p-6 md:pt-24 lg:p-8 lg:pt-24">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
            <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
              <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 py-5 md:px-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#232154] text-white shadow-[0_12px_24px_rgba(35,33,84,0.24)]">
                    {tab === 'incident' ? (
                      <AlertTriangle className="h-6 w-6" />
                    ) : tab === 'theft' ? (
                      <PackageSearch className="h-6 w-6" />
                    ) : (
                      <ClipboardList className="h-6 w-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-slate-900 md:text-2xl">{activeNav.label}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">
                      {tab === 'incident'
                        ? 'Report incidents directly from the store portal so the team can review them immediately.'
                        : tab === 'theft'
                          ? 'Search the website catalog, add stolen products, and submit a structured theft report.'
                          : 'Review theft reports submitted by this store only.'}
                    </p>
                  </div>
                </div>
              </div>

              {tab === 'theft-log' ? (
                <div className="space-y-5 px-5 py-5 md:px-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Store thefts</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{theftReports.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Open thefts</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {theftReports.filter((report) => report.status !== 'closed').length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Estimated value</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">£{theftLogTotalValue.toFixed(2)}</p>
                    </div>
                  </div>

                  {theftReports.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 px-5 py-10 text-sm text-slate-500">
                      No theft reports have been submitted for this store yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[1260px] w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Reference</th>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Description (Perfumes stolen)</th>
                            <th className="px-3 py-2">Barcode</th>
                            <th className="px-3 py-2">Quantity</th>
                            <th className="px-3 py-2">Price</th>
                            <th className="px-3 py-2">Reported</th>
                            <th className="px-3 py-2">Adjusted Through Till</th>
                            <th className="px-3 py-2">Stock Recovered</th>
                            <th className="px-3 py-2">Incident details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {theftLogRows.map((row, index) => (
                            <tr key={`${row.id}-${index}`} className="align-top">
                              <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.referenceNo}</td>
                              <td className="px-3 py-2 text-slate-700">{row.date}</td>
                              <td className="px-3 py-2 text-slate-900">{row.perfumeDescription}</td>
                              <td className="px-3 py-2 text-slate-700">{row.barcode}</td>
                              <td className="px-3 py-2 text-slate-700">{row.quantity}</td>
                              <td className="px-3 py-2 text-slate-700">{row.price}</td>
                              <td className="px-3 py-2 text-slate-700">{row.hasTheftBeenReported ? 'Y' : 'N'}</td>
                              <td className="px-3 py-2 text-slate-700">{row.adjustedThroughTill ? 'Y' : 'N'}</td>
                              <td className="px-3 py-2 text-slate-700">{row.stockRecovered ? 'Y' : 'N'}</td>
                              <td className="px-3 py-2 text-slate-700">{row.incidentDetails || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5 px-5 py-5 md:px-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {formTab === 'incident' ? (
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">Incident summary</label>
                        <Input
                          placeholder="Briefly describe the incident"
                          value={summary}
                          onChange={(e) => setSummary(e.target.value)}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Details</label>
                      <Textarea
                        placeholder="Add the key details, timings, and anything the team should know."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Severity</label>
                      <select
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as any)}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Occurred at</label>
                      <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
                    </div>
                  </div>

                  {formTab === 'theft' ? (
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-semibold text-slate-900">Stolen products</h3>
                      <p className="text-sm text-slate-600">
                        Search the website catalog and add the affected items to the report.
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value)
                            setLastAddedProductTitle(null)
                          }}
                          placeholder="Search website products, for example Dior"
                          className="bg-white pl-12 sm:pl-12"
                          autoComplete="off"
                        />

                        {showSearchDropdown ? (
                          <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_32px_rgba(15,23,42,0.12)]">
                            {searching ? (
                              <div className="px-4 py-3 text-sm text-slate-500">Searching website products…</div>
                            ) : searchError ? (
                              <div className="px-4 py-3 text-sm text-red-600">{searchError}</div>
                            ) : catalog.length > 0 ? (
                              <div className="max-h-72 overflow-y-auto p-2">
                                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Matching products
                                </div>
                                <div className="space-y-1">
                                  {catalog.map((item) => {
                                    const alreadySelected = selectedProductIds.has(item.productId)
                                    return (
                                      <button
                                        key={item.productId}
                                        type="button"
                                        className="flex w-full items-start justify-between gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition hover:border-slate-200 hover:bg-slate-50"
                                        onClick={() => addCatalogItem(item)}
                                      >
                                        <span className="min-w-0">
                                          <span className="block text-sm font-medium text-slate-900">
                                            {item.title}
                                          </span>
                                          <span className="mt-1 block text-xs text-slate-500">
                                            {[item.brand, `Product ID: ${item.productId}`]
                                              .filter(Boolean)
                                              .join(' · ')}
                                          </span>
                                        </span>
                                        <span className="flex shrink-0 flex-col items-end gap-1">
                                          <span className="text-sm font-semibold text-slate-700">
                                            {formatCurrency(item.price)}
                                          </span>
                                          {alreadySelected ? (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                              Added
                                            </span>
                                          ) : null}
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            ) : hasSearched ? (
                              <div className="px-4 py-3 text-sm text-slate-500">No products found for that search.</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {lastAddedProductTitle ? (
                        <p className="text-sm font-medium text-emerald-700">
                          Added {lastAddedProductTitle} to the selected items list.
                        </p>
                      ) : search.trim().length < 2 ? (
                        <EmptySearchState search={search} hasSearched={hasSearched} searching={searching} />
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-900">Selected items</h4>
                        <p className="text-sm font-semibold text-slate-700">Estimated value: £{theftTotal.toFixed(2)}</p>
                      </div>

                      {items.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-sm text-slate-500">
                          No items added yet.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {items.map((item) => (
                            <div
                              key={item.productId}
                              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                                <p className="text-xs text-slate-500">{formatCurrency(item.unitPrice)} each</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  className="w-40 bg-white"
                                  placeholder="Barcode"
                                  value={item.barcode}
                                  onChange={(e) =>
                                    setItems((current) =>
                                      current.map((entry) =>
                                        entry.productId === item.productId
                                          ? { ...entry, barcode: e.target.value }
                                          : entry
                                      )
                                    )
                                  }
                                />
                                <Input
                                  className="w-24 bg-white"
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    setItems((current) =>
                                      current.map((entry) =>
                                        entry.productId === item.productId
                                          ? {
                                              ...entry,
                                              quantity: Math.max(1, Number(e.target.value) || 1),
                                            }
                                          : entry
                                      )
                                    )
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setItems((current) =>
                                      current.filter((entry) => entry.productId !== item.productId)
                                    )
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    </div>
                  ) : null}

                  {formTab === 'theft' ? (
                    <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-3">
                      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <span>Theft reported</span>
                        <input
                          type="checkbox"
                          checked={hasTheftBeenReported}
                          onChange={(e) => setHasTheftBeenReported(e.target.checked)}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <span>Adjusted through till</span>
                        <input
                          type="checkbox"
                          checked={adjustedThroughTill}
                          onChange={(e) => setAdjustedThroughTill(e.target.checked)}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <span>Stock recovered</span>
                        <input
                          type="checkbox"
                          checked={stockRecovered}
                          onChange={(e) => setStockRecovered(e.target.checked)}
                        />
                      </label>
                    </div>
                  ) : null}

                  {submitError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {submitError}
                    </div>
                  ) : null}
                  {successMessage ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {successMessage}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      className="bg-[#232154] text-white hover:bg-[#1c0259]"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setSubmitError(null)
                          setSuccessMessage(null)

                          if (formTab === 'incident' && !summary.trim()) {
                            setSubmitError('Enter an incident summary before submitting.')
                            return
                          }

                          if (formTab === 'theft' && items.length === 0) {
                            setSubmitError('Add at least one stolen product before submitting.')
                            return
                          }

                          try {
                            const result = await createStorePortalReport({
                              kind: formTab,
                              summary: formTab === 'incident' ? summary.trim() : '',
                              description: description.trim(),
                              severity,
                              occurredAt: new Date(occurredAt).toISOString(),
                              theftItems: formTab === 'theft' ? items : [],
                              hasTheftBeenReported: formTab === 'theft' ? hasTheftBeenReported : undefined,
                              adjustedThroughTill: formTab === 'theft' ? adjustedThroughTill : undefined,
                              stockRecovered: formTab === 'theft' ? stockRecovered : undefined,
                            })

                            setSuccessMessage(`Saved report ${result.reference_no}.`)
                            setSummary('')
                            setDescription('')
                            setItems([])
                            setCatalog([])
                            setSearch('')
                            setHasSearched(false)
                            router.refresh()
                          } catch (error) {
                            console.error('Store portal submission failed:', error)
                            setSubmitError(error instanceof Error ? error.message : 'Could not submit report')
                          }
                        })
                      }
                    >
                      {pending ? 'Submitting…' : `Submit ${formTab === 'theft' ? 'theft' : 'incident'}`}
                    </Button>
                    <p className="text-sm text-slate-500">
                      {formTab === 'theft'
                        ? 'The team will receive the theft details and estimated value.'
                        : 'The team will receive the incident details for follow-up.'}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-lg font-semibold text-slate-900">Store overview</h3>
                </div>
                <div className="grid gap-3 px-5 py-5">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Store</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{storeName}</p>
                    <p className="text-sm text-slate-500">Code {storeCode}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Recent reports</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{recentReports.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Open</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{openReportCount}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Theft reports</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{theftReportCount}</p>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-lg font-semibold text-slate-900">Recent reports</h3>
                </div>
                <div className="space-y-3 px-5 py-5">
                  {recentReports.map((report) => (
                    <div key={report.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">
                        {report.reference_no} · {report.summary}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(report.occurred_at).toLocaleString()} · {report.isTheft ? 'Theft' : 'Incident'} ·{' '}
                        {report.status}
                      </div>
                    </div>
                  ))}
                  {recentReports.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                      No reports logged yet.
                    </p>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
