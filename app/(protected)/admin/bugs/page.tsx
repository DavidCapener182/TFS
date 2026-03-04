import { requireRole } from '@/lib/auth'
import { BugTable } from '@/components/BugTable'

export default async function AdminBugsPage() {
  await requireRole(['admin'])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Bug Tracking</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          View and manage user-submitted bug reports, feature requests, and feedback.
        </p>
      </div>
      <BugTable />
    </div>
  )
}
