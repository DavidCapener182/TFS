import { requireAuth, isSupabaseConfigured, type UserRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { MobileTabBar } from '@/components/layout/mobile-tab-bar'
import { SidebarProvider } from '@/components/layout/sidebar-provider'
import { Toaster } from '@/components/ui/toaster'
import { ReleaseNotesModal } from '@/components/ReleaseNotesModal'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth()
  const supabaseEnabled = isSupabaseConfigured()
  const supabase = supabaseEnabled ? createClient() : null
  let profile: { id?: string; role?: UserRole | null } | null = supabaseEnabled
    ? null
    : { id: 'mock-user-id', role: 'admin' }
  
  // Ensure profile exists and check role
  if (supabase) {
    const { data } = await supabase
      .from('fa_profiles')
      .select('id, role')
      .eq('id', session.user.id)
      .single()
    profile = data
  }

  // Block access for pending users and readonly users (treat readonly as pending)
  if (profile && (profile.role === 'pending' || profile.role === 'readonly')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Account Pending Approval</h1>
          <p className="text-gray-600 mb-6">
            Your account has been created but is pending admin approval. 
            You will be able to access the system once an administrator approves your account and changes your role to Ops, Client, or Admin.
          </p>
          <p className="text-sm text-gray-500">
            If you have any questions, please contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  if (supabase && !profile && session.user) {
    // Get intended role from user metadata (set during sign-up or invitation)
    const intendedRole = session.user.user_metadata?.intended_role
    
    // For invited users, use the intended_role from metadata if it's set
    // For self-registered users, default to pending unless an intended role is provided
    // Always default to 'pending' if no intended_role is set (safety first)
    let defaultRole: string = 'pending'
    
    if (intendedRole) {
      // If intended_role is explicitly set (from invitation), use it
      const validRoles = ['admin', 'ops', 'readonly', 'client', 'pending']
      if (validRoles.includes(intendedRole)) {
        defaultRole = intendedRole
      }
    } else {
      // No intended_role in metadata - this is likely a self-registered user
      // Default to 'pending' for admin approval
      defaultRole = 'pending'
    }
    
    // Use full_name from metadata if available, otherwise derive from email
    const fullName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || null
    
    // Create profile with intended role or default to pending
    await supabase
      .from('fa_profiles')
      .insert({
        id: session.user.id,
        full_name: fullName,
        role: defaultRole,
      })
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] bg-shell md:h-screen-zoom md:min-h-0 md:overflow-hidden">
        <Sidebar />
        <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col bg-canvas md:ml-[18rem] md:min-h-0 md:overflow-hidden">
          <Header />
          <main className="min-w-0 flex-1 overflow-x-hidden bg-canvas px-3.5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(var(--mobile-header-height,0px)+1rem)] sm:px-4 sm:pt-[calc(var(--mobile-header-height,0px)+1rem)] md:min-h-0 md:overflow-y-auto md:px-6 md:pb-6 md:pt-6 lg:px-8 md:[-webkit-overflow-scrolling:touch]">
            <div className="max-w-full overflow-x-hidden bg-transparent p-0 shadow-none md:min-h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
      <MobileTabBar userRole={profile?.role || null} />
      <ReleaseNotesModal />
      <Toaster />
    </SidebarProvider>
  )
}
