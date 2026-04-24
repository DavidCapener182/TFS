import Link from 'next/link'
import { ArrowLeft, BarChart3 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WorkspaceHeader, WorkspaceShell } from '@/components/workspace/workspace-shell'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatStoreName } from '@/lib/store-display'

type TheftRankingRow = {
  storeId: string
  storeName: string
  storeCode: string | null
  theftCount: number
  theftValue: number
}

function getTheftMeta(incident: any) {
  const meta = incident?.persons_involved
  if (!meta || typeof meta !== 'object') return null
  const payload = meta as Record<string, any>
  if (payload.reportType !== 'theft') return null
  return payload
}

export default async function TheftRankingsPage() {
  await requireAuth()
  const supabase = createClient()

  const { data } = await supabase
    .from('tfs_incidents')
    .select('id, store_id, persons_involved, tfs_stores:store_id(store_name, store_code)')
    .order('occurred_at', { ascending: false })
    .limit(2000)

  const rankingMap = new Map<string, TheftRankingRow>()

  ;(data || []).forEach((incident: any) => {
    const meta = getTheftMeta(incident)
    if (!meta) return
    const store = Array.isArray(incident.tfs_stores) ? incident.tfs_stores[0] : incident.tfs_stores
    const storeId = String(incident.store_id || '')
    if (!storeId) return

    const existing = rankingMap.get(storeId) || {
      storeId,
      storeName: formatStoreName(String(store?.store_name || 'Unknown store')),
      storeCode: store?.store_code || null,
      theftCount: 0,
      theftValue: 0,
    }

    existing.theftCount += 1
    existing.theftValue += Number(meta.theftValueGbp) || 0
    rankingMap.set(storeId, existing)
  })

  const rows = Array.from(rankingMap.values())
  const byCount = [...rows].sort((a, b) => b.theftCount - a.theftCount || b.theftValue - a.theftValue)
  const byValue = [...rows].sort((a, b) => b.theftValue - a.theftValue || b.theftCount - a.theftCount)

  return (
    <WorkspaceShell className="p-4 md:p-6">
      <WorkspaceHeader
        eyebrow="Operations"
        icon={BarChart3}
        title="Theft rankings"
        description="Compare stores by theft report volume and reported theft value."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/theft-tracker">
              <ArrowLeft className="h-4 w-4" />
              Back to theft log
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="count" className="space-y-4">
        <TabsList>
          <TabsTrigger value="count">Most theft reports</TabsTrigger>
          <TabsTrigger value="value">Highest theft value</TabsTrigger>
        </TabsList>

        <TabsContent value="count">
          <Card className="rounded-[1.5rem]">
            <CardHeader>
              <CardTitle>Theft reports by store</CardTitle>
              <CardDescription>Ranked by number of theft reports submitted.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Theft reports</TableHead>
                    <TableHead className="text-right">Reported value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCount.map((row, index) => (
                    <TableRow key={row.storeId}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{row.storeName}</TableCell>
                      <TableCell>{row.storeCode || '-'}</TableCell>
                      <TableCell className="text-right">{row.theftCount}</TableCell>
                      <TableCell className="text-right">£{row.theftValue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="value">
          <Card className="rounded-[1.5rem]">
            <CardHeader>
              <CardTitle>Reported theft value by store</CardTitle>
              <CardDescription>Ranked by total reported theft value.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Reported value</TableHead>
                    <TableHead className="text-right">Theft reports</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byValue.map((row, index) => (
                    <TableRow key={row.storeId}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{row.storeName}</TableCell>
                      <TableCell>{row.storeCode || '-'}</TableCell>
                      <TableCell className="text-right">£{row.theftValue.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{row.theftCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </WorkspaceShell>
  )
}
