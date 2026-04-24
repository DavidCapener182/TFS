import { requireRole } from '@/lib/auth'
import { listQueueCases } from '@/lib/cases/service'
import { QueueClient } from '@/components/cases/queue-client'

export default async function QueuePage() {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])
  const cases = await listQueueCases({ includeClosed: true })

  return (
    <QueueClient
      initialCases={cases}
      canManage={profile.role === 'admin' || profile.role === 'ops'}
    />
  )
}
