import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function getTheftMeta(incident: any) {
  const meta = incident?.persons_involved
  if (!meta || typeof meta !== 'object') return null
  const payload = meta as Record<string, any>
  if (payload.reportType !== 'theft') return null
  return payload
}

export default async function TheftTrackerPage() {
  await requireAuth()
  const supabase = createClient()

  const { data } = await supabase
    .from('tfs_incidents')
    .select('id, reference_no, summary, occurred_at, status, persons_involved, tfs_stores:store_id(store_name, store_code)')
    .order('occurred_at', { ascending: false })
    .limit(200)

  const thefts = (data || [])
    .map((incident) => ({ incident, meta: getTheftMeta(incident) }))
    .filter((entry) => Boolean(entry.meta))

  const totalValue = thefts.reduce((acc, entry) => acc + (Number(entry.meta?.theftValueGbp) || 0), 0)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Overall Theft Tracker</h1>
      <p className="text-sm text-slate-600">All theft reports submitted by stores and team users.</p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-3"><p className="text-xs text-slate-500">Total theft reports</p><p className="text-2xl font-semibold">{thefts.length}</p></div>
        <div className="rounded-lg border bg-white p-3"><p className="text-xs text-slate-500">Estimated value</p><p className="text-2xl font-semibold">£{totalValue.toFixed(2)}</p></div>
        <div className="rounded-lg border bg-white p-3"><p className="text-xs text-slate-500">Open theft reports</p><p className="text-2xl font-semibold">{thefts.filter((entry) => entry.incident.status !== 'closed').length}</p></div>
      </div>

      <div className="space-y-2">
        {thefts.map(({ incident, meta }) => (
          <div key={incident.id} className="rounded-lg border bg-white p-3 text-sm">
            <div className="font-semibold">{incident.reference_no} · {incident.summary}</div>
            <div className="text-slate-600">
              {(incident as any).tfs_stores?.store_name || 'Store'} ({(incident as any).tfs_stores?.store_code || 'n/a'}) · {new Date(incident.occurred_at).toLocaleString()} · {incident.status}
            </div>
            <div className="text-slate-700">Estimated value: £{Number(meta?.theftValueGbp || 0).toFixed(2)}</div>
          </div>
        ))}
        {thefts.length === 0 ? <p className="text-sm text-slate-500">No theft logs yet.</p> : null}
      </div>
    </div>
  )
}
