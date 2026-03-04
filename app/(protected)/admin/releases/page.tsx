import { requireRole } from '@/lib/auth'
import { ReleaseEditor } from '@/components/ReleaseEditor'

export default async function AdminReleasesPage() {
  await requireRole(['admin'])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Release Notes</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          Create, edit, and publish release notes. Users see the latest active release on login.
        </p>
      </div>
      <ReleaseEditor />
    </div>
  )
}
