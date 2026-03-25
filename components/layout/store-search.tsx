'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { format } from 'date-fns'
import { ExternalLink, MapPin, Search, ShieldAlert, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { getInternalAreaDisplayName } from '@/lib/areas'
import { formatStoreName, formatUkPostcode } from '@/lib/store-display'
import { cn, formatPercent, getDisplayStoreCode } from '@/lib/utils'

type StoreSearchResult = {
  id: string
  store_code: string | null
  store_name: string
  address_line_1: string | null
  city: string | null
  postcode: string | null
  region: string | null
  compliance_audit_1_date: string | null
  compliance_audit_1_overall_pct: number | null
  compliance_audit_2_date: string | null
  compliance_audit_2_overall_pct: number | null
  compliance_audit_2_planned_date: string | null
  compliance_audit_3_date: string | null
  compliance_audit_3_overall_pct: number | null
  fire_risk_assessment_date: string | null
  fire_risk_assessment_pct: number | null
  open_incidents_count: number
}

type StoreLite = {
  id: string
  store_name: string
  store_code: string | null
  planned_date?: string | null
  completed_date?: string | null
}

type ManagerResult = {
  id: string
  full_name: string
  planned_stores: StoreLite[]
  completed_stores: StoreLite[]
}

function safeDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function getLatestAudit(store: StoreSearchResult): { date: Date | null; pct: number | null } {
  const candidates = [
    { date: safeDate(store.compliance_audit_3_date), pct: store.compliance_audit_3_overall_pct },
    { date: safeDate(store.compliance_audit_2_date), pct: store.compliance_audit_2_overall_pct },
    { date: safeDate(store.compliance_audit_1_date), pct: store.compliance_audit_1_overall_pct },
  ].filter((c) => c.date) as Array<{ date: Date; pct: number | null }>

  if (candidates.length === 0) return { date: null, pct: null }

  candidates.sort((a, b) => b.date.getTime() - a.date.getTime())
  return candidates[0]
}

function formatPct(pct: number | null): string {
  return formatPercent(pct)
}

function buildAddress(store: StoreSearchResult): string {
  return [store.address_line_1, store.city, formatUkPostcode(store.postcode)].filter(Boolean).join(', ')
}

export function StoreSearch() {
  const pathname = usePathname()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StoreSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<StoreSearchResult | null>(null)

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [managerResults, setManagerResults] = useState<ManagerResult[]>([])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  
  // Callback ref to ensure dropdown ref is set immediately
  const setDropdownRef = (element: HTMLDivElement | null) => {
    dropdownRef.current = element
  }

  // Close dropdown on route change (e.g., user clicks incidents link)
  useEffect(() => {
    setIsDropdownOpen(false)
    setMobileSearchOpen(false)
  }, [pathname])

  // Update dropdown position when anchor position changes or query changes
  useEffect(() => {
    if (!anchorRef.current) {
      setDropdownPosition(null)
      return
    }

    const updatePosition = () => {
      if (!anchorRef.current) return
      const rect = anchorRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      })
    }

    // Update position when query changes or dropdown should be shown
    if (query.trim() || isLoading || results.length > 0) {
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
    } else {
      setDropdownPosition(null)
    }

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [query, isLoading, results])


  // Debounced fetch (stores + managers)
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setManagerResults([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    const t = window.setTimeout(async () => {
      try {
        const [storesRes, managersRes] = await Promise.all([
          fetch(`/api/stores/search?q=${encodeURIComponent(q)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch(`/api/managers/search?q=${encodeURIComponent(q)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }),
        ])

        if (!storesRes.ok) {
          const errorData = await storesRes.json().catch(() => ({}))
          console.error('Search API error:', storesRes.status, errorData)
          throw new Error('Failed to search stores')
        }
        if (!managersRes.ok) {
          const errorData = await managersRes.json().catch(() => ({}))
          console.error('Manager search error:', managersRes.status, errorData)
          throw new Error('Failed to search managers')
        }

        const storesJson = (await storesRes.json()) as { results: StoreSearchResult[] }
        const managersJson = (await managersRes.json()) as { results: ManagerResult[] }

        if (!cancelled) {
          setResults(storesJson.results || [])
          setManagerResults(managersJson.results || [])
          setIsDropdownOpen(true)
        }
      } catch (error) {
        console.error('Search error:', error)
        if (!cancelled) {
          setResults([])
          setManagerResults([])
          setIsDropdownOpen(true) // Still show "No stores found" message
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, 275)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query])

  const topMatch = results[0] || null

  const shouldShowDropdown = useMemo(() => {
    if (!query.trim() || !dropdownPosition) return false
    return isLoading || results.length > 0 || (query.trim().length > 0 && !isLoading)
  }, [isLoading, query, results, dropdownPosition])

  // Fallback: close on pointer down outside dropdown/container
  useEffect(() => {
    // Only listen when dropdown is or should be visible
    if (!isDropdownOpen && !isLoading && (!query.trim() || results.length === 0)) return

    const handlePointerDown = (e: Event) => {
      const target = e.target as Node | null
      if (!target) return

      const dropdown = dropdownRef.current ?? (document.querySelector('[data-dropdown="true"]') as HTMLElement | null)
      const container = containerRef.current

      const insideDropdown = dropdown?.contains(target) ?? false
      const insideContainer = container?.contains(target) ?? false

      if (!insideDropdown && !insideContainer) {
        setIsDropdownOpen(false)
        setMobileSearchOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [isDropdownOpen, isLoading, query, results.length])

  const dropdownPortal =
    typeof window !== 'undefined' &&
    isDropdownOpen &&
    dropdownPosition &&
    shouldShowDropdown
      ? createPortal(
          <div
            ref={setDropdownRef}
            data-dropdown="true"
            className="fixed z-[100] rounded-xl border border-white/10 bg-[#101c28] shadow-2xl overflow-hidden md:rounded-xl"
            style={{
              top: `${dropdownPosition.top}px`,
              left: window.innerWidth < 768 ? '8px' : `${dropdownPosition.left}px`,
              right: window.innerWidth < 768 ? '8px' : 'auto',
              width: window.innerWidth < 768 
                ? `${window.innerWidth - 16}px` 
                : `${Math.max(dropdownPosition.width, managerResults.length > 0 ? 720 : 480)}px`,
              maxHeight: window.innerWidth < 768 
                ? `${window.innerHeight - dropdownPosition.top - 16}px` 
                : managerResults.length > 0 ? '720px' : '600px',
            }}
          >
            <div className="max-h-full overflow-y-auto overscroll-contain">
              {isLoading ? (
                <div className="px-4 py-4 text-sm text-white/70">Searching…</div>
              ) : (
                <>
                  {/* Managers */}
                  {managerResults.length > 0 && (
                    <div className="border-b border-white/10">
                      <div className="px-4 py-3 text-[11px] uppercase tracking-wide text-white/60">People</div>
                      {managerResults.map((m) => (
                        <ManagerDropdownItem key={m.id} manager={m} />
                      ))}
                    </div>
                  )}

                  {/* Stores */}
                  {results.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-white/70">No stores found.</div>
                  ) : (
                    results.map((store) => (
                      <StoreDropdownItem
                        key={store.id}
                        store={store}
                        onSelect={() => {
                          setSelected(store)
                          setSheetOpen(true)
                          setIsDropdownOpen(false)
                          setMobileSearchOpen(false)
                        }}
                      />
                    ))
                  )}
                </>
              )}
            </div>
            {topMatch && results.length > 0 && (
              <div className="border-t border-white/10 px-4 py-2 text-[11px] text-white/50 bg-[#0a141f] hidden md:block">
                Tip: press Enter to open the top match.
              </div>
            )}
          </div>,
          document.body
        )
      : null

  const drawer = (
    <Sheet
      open={sheetOpen}
      onOpenChange={(open) => {
        setSheetOpen(open)
        if (!open) setSelected(null)
      }}
    >
      <SheetContent className="bg-white text-slate-900">
        {selected ? <StoreSummary store={selected} /> : null}
      </SheetContent>
    </Sheet>
  )

  return (
    <>
      <div ref={containerRef} className="relative flex items-center gap-2 flex-1">
        {/* Desktop search */}
        <div className="hidden md:block w-full max-w-[420px]">
          <div ref={anchorRef} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 pointer-events-none z-10" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                // Auto-open dropdown when typing
                if (e.target.value.trim()) {
                  setIsDropdownOpen(true)
                }
              }}
              onFocus={() => {
                if (query.trim() || isLoading || results.length > 0) setIsDropdownOpen(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && topMatch) {
                  e.preventDefault()
                  setSelected(topMatch)
                  setSheetOpen(true)
                  setIsDropdownOpen(false)
                }
                if (e.key === 'Escape') {
                  setIsDropdownOpen(false)
                }
              }}
              placeholder="Search stores…"
              className="h-10 md:h-9 bg-white/10 border-white/10 text-white placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-white/30 pl-12 sm:pl-12"
            />
          </div>
        </div>

        {/* Mobile search button + inline search */}
        <div className="w-full md:hidden">
          {mobileSearchOpen ? (
            <div ref={anchorRef} className="relative w-full">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && topMatch) {
                    e.preventDefault()
                    setSelected(topMatch)
                    setSheetOpen(true)
                    setIsDropdownOpen(false)
                    setMobileSearchOpen(false)
                  }
                  if (e.key === 'Escape') {
                    setMobileSearchOpen(false)
                    setIsDropdownOpen(false)
                  }
                }}
                placeholder="Search…"
                className="h-11 rounded-[18px] border-white/10 bg-white/10 pl-12 pr-10 text-sm text-white placeholder:text-white/45 focus-visible:ring-2 focus-visible:ring-white/25 sm:pl-12 sm:pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center text-white/60 hover:text-white"
                onClick={() => {
                  setMobileSearchOpen(false)
                  setIsDropdownOpen(false)
                }}
                aria-label="Close store search"
              >
                ×
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full justify-start gap-2 rounded-[18px] border border-white/10 bg-white/8 px-3 text-sm font-medium !text-white/70 shadow-[0_10px_24px_rgba(2,12,24,0.14)] hover:bg-white/12 hover:!text-white"
              onClick={() => {
                setMobileSearchOpen(true)
                // open dropdown once user types
              }}
              aria-label="Search stores"
            >
              <Search className="h-4 w-4 text-white/55" />
              <span>Search stores or managers</span>
            </Button>
          )}
        </div>
      </div>

      {dropdownPortal}
      {drawer}
    </>
  )
}

function StoreDropdownItem({ store, onSelect }: { store: StoreSearchResult; onSelect: () => void }) {
  const address = buildAddress(store)
  const latestAudit = getLatestAudit(store)
  const planned = safeDate(store.compliance_audit_2_planned_date)
  const showPlanned = planned && (!latestAudit.date || planned.getTime() > latestAudit.date.getTime())
  const fraDate = safeDate(store.fire_risk_assessment_date)
  const fraPct = store.fire_risk_assessment_pct

  const mapsQuery = encodeURIComponent(address || formatStoreName(store.store_name))
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
  const appleMapsUrl = `https://maps.apple.com/?q=${mapsQuery}`

  return (
    <button
      type="button"
      className="w-full text-left border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
      onClick={onSelect}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-white truncate">{formatStoreName(store.store_name)}</div>
            <div className="text-xs text-white/60 mt-0.5">
              {getDisplayStoreCode(store.store_code) || '—'}{store.region ? ` • ${getInternalAreaDisplayName(store.region, { fallback: store.region })}` : ''}
            </div>
          </div>
          <div
            className={cn(
              "flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
              store.open_incidents_count > 0 ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
            )}
          >
            {store.open_incidents_count > 0 ? (
              <>
                <ShieldAlert className="h-3 w-3" />
                {store.open_incidents_count} open
              </>
            ) : (
              <>
                <ShieldCheck className="h-3 w-3" />
                No open
              </>
            )}
          </div>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2">
          <MapPin className="h-3.5 w-3.5 text-white/50 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/80 line-clamp-2">{address || <span className="text-white/50 italic">No address</span>}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-white/60 hover:text-white/80 underline"
              >
                Google Maps
              </a>
              <span className="text-white/30">•</span>
              <a
                href={appleMapsUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-white/60 hover:text-white/80 underline"
              >
                Apple Maps
              </a>
            </div>
          </div>
        </div>

        {/* Map Preview - Below Address */}
        {address && (
          <div className="mt-2 -mx-4">
            <div className="bg-slate-900/50 relative min-h-[180px] rounded overflow-hidden border border-white/10">
              <iframe
                src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '180px' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 w-full h-full"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {/* Visit summary grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Latest Visit */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">Latest Visit</div>
            {latestAudit.date ? (
              <div className="text-xs text-white/90">
                <div>{format(latestAudit.date, 'dd MMM yyyy')}</div>
                <div className="font-semibold text-white">Completed</div>
              </div>
            ) : (
              <div className="text-xs text-white/50 italic">No visits recorded</div>
            )}
            {showPlanned && (
              <div className="text-[10px] text-indigo-300 mt-1">
                Visit: {format(planned!, 'dd MMM')}
              </div>
            )}
          </div>

          {/* Planned Visit */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">Planned Visit</div>
            {showPlanned ? (
              <div className="text-xs text-white/90">
                <div>{format(planned!, 'dd MMM yyyy')}</div>
                <div className="font-semibold text-white">Scheduled</div>
              </div>
            ) : (
              <div className="text-xs text-white/50 italic">No visit planned</div>
            )}
          </div>
        </div>

        {/* Incidents */}
        {store.open_incidents_count > 0 && (
          <div className="pt-2 border-t border-white/5">
            <div className="text-xs text-white/70">
              <span className="font-semibold">{store.open_incidents_count}</span> open incident{store.open_incidents_count === 1 ? '' : 's'}
            </div>
          </div>
        )}
      </div>
    </button>
  )
}

function ManagerDropdownItem({ manager }: { manager: ManagerResult }) {
  const groupByDate = (stores: StoreLite[], field: 'planned_date' | 'completed_date') => {
    const sorted = [...stores].sort((a, b) => {
      const ad = a[field] || ''
      const bd = b[field] || ''
      return ad.localeCompare(bd)
    })
    const groups: { label: string; items: StoreLite[] }[] = []
    for (const s of sorted) {
      const dateVal = s[field]
      const label = dateVal ? format(new Date(dateVal), 'dd MMM') : 'No date'
      const existing = groups.find((g) => g.label === label)
      if (existing) existing.items.push(s)
      else groups.push({ label, items: [s] })
    }
    return groups
  }

  const plannedGroups = groupByDate(manager.planned_stores, 'planned_date')
  const completedGroups = groupByDate(manager.completed_stores, 'completed_date')

  return (
    <div className="border-t border-white/5 first:border-t-0 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{manager.full_name}</div>
          <div className="text-[11px] text-white/60">Manager</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-white/70 uppercase mb-1">Planned stores</div>
          {manager.planned_stores.length === 0 ? (
            <div className="text-xs text-white/50 italic">No planned stores</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {plannedGroups.map((g, idx) => (
                <div key={g.label} className="space-y-1 pt-1 border-t border-white/10 first:border-t-0 first:pt-0">
                  <div className="text-[11px] text-white/70 font-semibold">{g.label}</div>
                  <ul className="space-y-1">
                    {g.items.map((s) => (
                      <li key={s.id} className="text-xs text-white/80 flex items-center justify-between gap-2">
                        <span className="truncate">
                          {formatStoreName(s.store_name)} {getDisplayStoreCode(s.store_code) && <span className="text-white/50">({getDisplayStoreCode(s.store_code)})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-white/70 uppercase mb-1">Completed stores</div>
          {manager.completed_stores.length === 0 ? (
            <div className="text-xs text-white/50 italic">No completed stores</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {completedGroups.map((g) => (
                <div key={g.label} className="space-y-1 pt-1 border-t border-white/10 first:border-t-0 first:pt-0">
                  <div className="text-[11px] text-white/70 font-semibold">{g.label}</div>
                  <ul className="space-y-1">
                    {g.items.map((s) => (
                      <li key={s.id} className="text-xs text-white/80 flex items-center justify-between gap-2">
                        <span className="truncate">
                          {formatStoreName(s.store_name)} {getDisplayStoreCode(s.store_code) && <span className="text-white/50">({getDisplayStoreCode(s.store_code)})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StoreSummary({ store }: { store: StoreSearchResult }) {
  const address = buildAddress(store)
  const latestAudit = getLatestAudit(store)
  const planned = safeDate(store.compliance_audit_2_planned_date)

  const showPlanned =
    planned &&
    (!latestAudit.date || planned.getTime() > latestAudit.date.getTime())

  const fraDate = safeDate(store.fire_risk_assessment_date)
  const fraPct = store.fire_risk_assessment_pct

  const mapsQuery = encodeURIComponent(address || formatStoreName(store.store_name))
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
  const appleMapsUrl = `https://maps.apple.com/?q=${mapsQuery}`

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-5 py-4">
        <div className="flex items-start justify-between gap-3 pr-10">
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight truncate">
              {formatStoreName(store.store_name)}
            </div>
            <div className="text-sm text-slate-500">
              {getDisplayStoreCode(store.store_code) || '—'}{store.region ? ` • ${getInternalAreaDisplayName(store.region, { fallback: store.region })}` : ''}
            </div>
          </div>
          <div
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
              store.open_incidents_count > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
            )}
          >
            {store.open_incidents_count > 0 ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5" />
                {store.open_incidents_count} open
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5" />
                No open
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <section className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="h-4 w-4 text-slate-500" />
            Address
          </div>
          <div className="mt-2 text-sm text-slate-700">
            {address ? address : <span className="text-slate-400 italic">No address</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Google Maps <ExternalLink className="h-4 w-4 text-slate-500" />
            </a>
            <a
              href={appleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Apple Maps <ExternalLink className="h-4 w-4 text-slate-500" />
            </a>
          </div>

          {/* Map Preview - Below Address */}
          {address && (
            <div className="mt-4 -mx-4">
              <div className="bg-slate-100 relative min-h-[250px] rounded-lg overflow-hidden">
                <iframe
                  src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
                  width="100%"
                  height="100%"
                  style={{ border: 0, minHeight: '250px' }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-900">Latest visit</div>
          <div className="mt-2 text-sm text-slate-700">
            {latestAudit.date ? (
              <div className="flex items-center justify-between gap-3">
                <span>{format(latestAudit.date, 'dd MMM yyyy')}</span>
                <span className="font-semibold text-[#4b3a78]">Completed</span>
              </div>
            ) : (
              <span className="text-slate-400 italic">No visits recorded</span>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-900">Next planned visit</div>
          <div className="mt-2 text-sm text-slate-700">
            {showPlanned ? (
              <div className="flex items-center justify-between gap-3">
                <span>{format(planned!, 'dd MMM yyyy')}</span>
                <span className="font-semibold text-emerald-700">Planned</span>
              </div>
            ) : (
              <span className="text-slate-400 italic">No visit planned</span>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-900">Incidents</div>
          <div className="mt-2 text-sm text-slate-700 flex items-center justify-between gap-3">
            <span>Open incidents</span>
            <span className="font-semibold">{store.open_incidents_count}</span>
          </div>
          <div className="mt-3">
            <Link
              href={`/incidents?store_id=${encodeURIComponent(store.id)}`}
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800"
            >
              View incidents
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
