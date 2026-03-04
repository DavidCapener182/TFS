import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminClient } from '@/components/admin/admin-client'

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-base sm:text-lg font-semibold text-red-900 mb-2">Bug Tracking</h2>
          <p className="text-sm text-red-700 mb-3">
            View and manage user-submitted bug reports, feature requests, and feedback.
          </p>
          <a
            href="/admin/bugs"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
          >
            Open Bug Tracker
          </a>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h2 className="text-base sm:text-lg font-semibold text-purple-900 mb-2">Release Notes</h2>
          <p className="text-sm text-purple-700 mb-3">
            Create, edit, and publish release notes. Users see the latest active release on login.
          </p>
          <a
            href="/admin/releases"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            Manage Releases
          </a>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="text-base sm:text-lg font-semibold text-blue-900 mb-2">SafeHub (Experimental)</h2>
          <p className="text-sm text-blue-700 mb-3">
            Preview the new Safety Culture-style audit pages. Internal development feature.
          </p>
          <a
            href="/audit-lab"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Open SafeHub
          </a>
        </div>
      </div>

      <AdminClient />
    </div>
  )
}
