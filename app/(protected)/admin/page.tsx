import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminClient } from '@/components/admin/admin-client'
import { Settings2, ShieldCheck, Bug, Mail, NotebookTabs } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkspaceHeader, WorkspaceShell, WorkspaceStat, WorkspaceStatGrid } from '@/components/workspace/workspace-shell'

const ADMIN_EMAIL = 'david.capener@kssnwltd.co.uk'

export default async function AdminPage() {
  const session = await requireAuth()
  const supabase = createClient()

  // Check if user is the admin email
  if (session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }

  // Verify user has admin role in profile
  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  // If profile doesn't exist or role is not admin, ensure it's set to admin
  if (!profile || profile.role !== 'admin') {
    // Update or create profile with admin role
    const { data: existingProfile } = await supabase
      .from('fa_profiles')
      .select('id')
      .eq('id', session.user.id)
      .single()

    if (existingProfile) {
      await supabase
        .from('fa_profiles')
        .update({ role: 'admin' })
        .eq('id', session.user.id)
    } else {
      await supabase
        .from('fa_profiles')
        .insert({
          id: session.user.id,
          full_name: session.user.email?.split('@')[0] || null,
          role: 'admin',
        })
    }
  }

  return (
    <WorkspaceShell>
      <WorkspaceHeader
        eyebrow="Admin"
        icon={ShieldCheck}
        title="Admin tools"
        description="Manage platform administration, release controls, and operational support tools. Only accessible to administrators."
      />

      <WorkspaceStatGrid className="xl:grid-cols-3">
        <WorkspaceStat label="Modules" value={4} note="Bug tracker, releases, email inbox, and paste importer" icon={Settings2} tone="info" />
        <WorkspaceStat label="Access" value="Admin" note="Restricted to the administrator account" icon={ShieldCheck} tone="critical" />
        <WorkspaceStat label="User management" value="Live" note="Role sync and admin client are active below" icon={NotebookTabs} tone="success" />
      </WorkspaceStatGrid>

      {/* Admin Tools */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="app-panel rounded-[1.5rem] p-5">
          <div className="mb-3 inline-flex rounded-full border border-critical/20 bg-critical-soft px-2 py-1 text-critical">
            <Bug className="h-4 w-4" />
          </div>
          <h2 className="mb-2 text-base font-semibold text-foreground sm:text-lg">Bug Tracking</h2>
          <p className="mb-4 text-sm text-ink-soft">
            View and manage user-submitted bug reports, feature requests, and feedback.
          </p>
          <Button asChild className="w-full sm:w-auto">
            <a href="/admin/bugs">
              Open Bug Tracker
            </a>
          </Button>
        </div>

        <div className="app-panel rounded-[1.5rem] p-5">
          <div className="mb-3 inline-flex rounded-full border border-info/20 bg-info-soft px-2 py-1 text-info">
            <NotebookTabs className="h-4 w-4" />
          </div>
          <h2 className="mb-2 text-base font-semibold text-foreground sm:text-lg">Release Notes</h2>
          <p className="mb-4 text-sm text-ink-soft">
            Create, edit, and publish release notes. Users see the latest active release on login.
          </p>
          <Button asChild className="w-full sm:w-auto">
            <a href="/admin/releases">
              Manage Releases
            </a>
          </Button>
        </div>

        <div className="app-panel rounded-[1.5rem] p-5">
          <div className="mb-3 inline-flex rounded-full border border-warning/20 bg-warning-soft px-2 py-1 text-warning">
            <Mail className="h-4 w-4" />
          </div>
          <h2 className="mb-2 text-base font-semibold text-foreground sm:text-lg">Inbound emails</h2>
          <p className="mb-4 text-sm text-ink-soft">
            Review the shared inbox (same as the former Email Review nav item) or paste raw email text into the queue.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild className="w-full sm:w-auto">
              <a href="/inbound-emails">Open email inbox</a>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <a href="/admin/inbound-email-import">Open email importer</a>
            </Button>
          </div>
        </div>

      </div>

      <AdminClient />
    </WorkspaceShell>
  )
}
