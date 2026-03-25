import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Create or update user profile on first login
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if profile exists
  const { data: existingProfile } = await supabase
    .from('fa_profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (existingProfile) {
    return NextResponse.json({ message: 'Profile already exists' })
  }

  // Create profile with role from metadata or default to pending
  // For invited users, use the intended_role from metadata if it's set
  // For self-registered users, default to pending unless an intended role is provided
  const intendedRole = user.user_metadata?.intended_role
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
  
  const { data: profile, error } = await supabase
    .from('fa_profiles')
    .insert({
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
      role: defaultRole,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating profile:', error)
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
  }

  return NextResponse.json({ profile })
}

