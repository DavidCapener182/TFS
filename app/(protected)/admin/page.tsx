import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminClient } from '@/components/admin/admin-client'
import { InboundEmailImporter } from '@/components/admin/inbound-email-importer'

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
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          Manage user roles and permissions. Only accessible to administrators.
        </p>
      </div>

      {/* Admin Tools */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-lg sm:border-red-200 sm:bg-red-50 sm:p-4 sm:shadow-none">
          <h2 className="mb-2 text-base font-semibold text-slate-900 sm:text-lg sm:text-red-900">Bug Tracking</h2>
          <p className="mb-4 text-sm text-slate-600 sm:mb-3 sm:text-red-700">
            View and manage user-submitted bug reports, feature requests, and feedback.
          </p>
          <a
            href="/admin/bugs"
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 sm:min-h-0 sm:w-auto sm:rounded-md sm:bg-red-600 sm:px-4 sm:py-2 sm:hover:bg-red-700"
          >
            Open Bug Tracker
          </a>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-lg sm:border-purple-200 sm:bg-purple-50 sm:p-4 sm:shadow-none">
          <h2 className="mb-2 text-base font-semibold text-slate-900 sm:text-lg sm:text-purple-900">Release Notes</h2>
          <p className="mb-4 text-sm text-slate-600 sm:mb-3 sm:text-purple-700">
            Create, edit, and publish release notes. Users see the latest active release on login.
          </p>
          <a
            href="/admin/releases"
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 sm:min-h-0 sm:w-auto sm:rounded-md sm:bg-purple-600 sm:px-4 sm:py-2 sm:hover:bg-purple-700"
          >
            Manage Releases
          </a>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-lg sm:border-sky-200 sm:bg-sky-50 sm:p-4 sm:shadow-none">
          <h2 className="mb-2 text-base font-semibold text-slate-900 sm:text-lg sm:text-sky-900">Inbound Email Import</h2>
          <p className="mb-4 text-sm text-slate-600 sm:mb-3 sm:text-sky-700">
            Paste raw email text and save it straight into the inbound email queue without SQL.
          </p>
          <a
            href="#inbound-email-import"
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 sm:min-h-0 sm:w-auto sm:rounded-md sm:bg-sky-600 sm:px-4 sm:py-2 sm:hover:bg-sky-700"
          >
            Open Email Importer
          </a>
        </div>

      </div>

      <div id="inbound-email-import">
        <InboundEmailImporter />
      </div>

      <AdminClient />
    </div>
  )
}
