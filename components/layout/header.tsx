import { getUserProfile } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { LogOut, Menu, Search } from 'lucide-react'
import { redirect } from 'next/navigation'
import { HeaderClient } from './header-client'

async function signOut() {
  'use server'
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function Header() {
  const profile = await getUserProfile()
  const userName = profile?.full_name || 'User'

  return <HeaderClient signOut={signOut} activeUserNames={[userName]} />
}
