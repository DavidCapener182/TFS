import { getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { HeaderClient } from './header-client'

async function signOut() {
  'use server'
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function Header() {
  const profile = await getUserProfile()
  const currentUser = {
    id: profile?.id || 'unknown-user',
    name: profile?.full_name || 'User',
    role: profile?.role || 'pending',
  }

  return (
    <Suspense fallback={null}>
      <HeaderClient signOut={signOut} currentUser={currentUser} />
    </Suspense>
  )
}
