'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStorePortalReport, logoutStorePortal, searchTheftCatalog } from '@/app/actions/store-portal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type CatalogItem = { productId: string; title: string; price: number | null }

export function StorePortalWorkspace({
  storeName,
  storeCode,
  recentReports,
}: {
  storeName: string
  storeCode: string
  recentReports: Array<{ id: string; reference_no: string; summary: string; occurred_at: string; status: string; isTheft: boolean }>
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'incident' | 'theft'>('incident')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low'|'medium'|'high'|'critical'>('medium')
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16))
  const [search, setSearch] = useState('')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [items, setItems] = useState<Array<{ productId: string; title: string; quantity: number; unitPrice: number | null }>>([])
  const [pending, startTransition] = useTransition()

  const theftTotal = useMemo(() => items.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0), [items])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{storeName}</h1>
            <p className="text-sm text-slate-600">Store code: {storeCode}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => startTransition(async () => {
              await logoutStorePortal()
              router.push('/store-login')
              router.refresh()
            })}
            disabled={pending}
          >
            Logout
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex gap-2">
          <Button variant={tab === 'incident' ? 'default' : 'outline'} onClick={() => setTab('incident')}>Log incident</Button>
          <Button variant={tab === 'theft' ? 'default' : 'outline'} onClick={() => setTab('theft')}>Log theft</Button>
        </div>

        <div className="space-y-3">
          <Input placeholder={tab === 'theft' ? 'Theft summary' : 'Incident summary'} value={summary} onChange={(e) => setSummary(e.target.value)} />
          <Textarea placeholder="Details" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="rounded-md border px-3 py-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value as any)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>

          {tab === 'theft' ? (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex gap-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search website products" />
                <Button type="button" variant="outline" onClick={() => startTransition(async () => setCatalog(await searchTheftCatalog(search) as any))}>Search</Button>
              </div>
              <div className="space-y-1 max-h-40 overflow-auto">
                {catalog.map((item) => (
                  <button
                    key={item.productId}
                    type="button"
                    className="w-full rounded border px-2 py-1 text-left text-sm hover:bg-slate-50"
                    onClick={() => setItems((prev) => [...prev, { productId: item.productId, title: item.title, quantity: 1, unitPrice: item.price }])}
                  >
                    {item.title} {typeof item.price === 'number' ? `- £${item.price.toFixed(2)}` : ''}
                  </button>
                ))}
              </div>
              {items.map((item, idx) => (
                <div key={`${item.productId}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1">{item.title}</span>
                  <Input className="w-20" type="number" min={1} value={item.quantity} onChange={(e) => setItems((prev) => prev.map((row, i) => i === idx ? { ...row, quantity: Math.max(1, Number(e.target.value) || 1) } : row))} />
                </div>
              ))}
              <p className="text-sm font-semibold">Estimated value: £{theftTotal.toFixed(2)}</p>
            </div>
          ) : null}

          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={pending}
            onClick={() => startTransition(async () => {
              await createStorePortalReport({
                kind: tab,
                summary,
                description,
                severity,
                occurredAt: new Date(occurredAt).toISOString(),
                theftItems: tab === 'theft' ? items : [],
              })
              setSummary('')
              setDescription('')
              setItems([])
              setCatalog([])
              router.refresh()
            })}
          >
            Submit {tab}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Recent reports</h2>
        <div className="mt-3 space-y-2">
          {recentReports.map((report) => (
            <div key={report.id} className="rounded border p-2 text-sm">
              <div className="font-medium">{report.reference_no} · {report.summary}</div>
              <div className="text-slate-600">{new Date(report.occurred_at).toLocaleString()} · {report.isTheft ? 'Theft' : 'Incident'} · {report.status}</div>
            </div>
          ))}
          {recentReports.length === 0 ? <p className="text-sm text-slate-500">No reports logged yet.</p> : null}
        </div>
      </div>
    </div>
  )
}
