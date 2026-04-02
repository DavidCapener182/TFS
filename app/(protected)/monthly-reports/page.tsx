import { MonthlyReportWorkspace } from '@/components/reports/monthly-report-workspace'
import { requireRole } from '@/lib/auth'
import { buildMonthlyReportData } from '@/lib/reports/monthly-report'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function MonthlyReportsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])
  const userAgent = headers().get('user-agent') || ''
  const isMobileDevice = /(android|iphone|ipad|ipod|mobile)/i.test(userAgent)
  if (isMobileDevice) {
    redirect('/reports')
  }
  const monthParam = searchParams?.month
  const month = Array.isArray(monthParam) ? monthParam[0] : monthParam
  const supabase = createClient()
  const data = await buildMonthlyReportData(supabase, month || null)

  return (
    <MonthlyReportWorkspace
      key={data.period.month}
      data={data}
      canEdit={profile.role === 'admin' || profile.role === 'ops'}
    />
  )
}
