'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { UserRole } from '@/lib/auth'

export interface UserWithProfile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  last_sign_in_at: string | null
}

type AuthLookupRecord = {
  email: string
  last_sign_in_at: string | null
}

async function getAuthLookupById(): Promise<Map<string, AuthLookupRecord>> {
  const adminClient = createAdminSupabaseClient()
  const lookup = new Map<string, AuthLookupRecord>()
  const perPage = 200

  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.warn('Unable to list auth users for admin table enrichment:', error.message)
      break
    }

    const users = data?.users || []
    for (const authUser of users) {
      lookup.set(authUser.id, {
        email: authUser.email || 'Email not available',
        last_sign_in_at: authUser.last_sign_in_at || null,
      })
    }

    if (users.length < perPage) break
  }

  return lookup
}

/**
 * Get all users with their profiles
 * Only accessible by admin users
 */
export async function getAllUsers(): Promise<UserWithProfile[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('role, id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Unauthorized - Admin access required')
  }

  const authLookupById = await getAuthLookupById()

  // Use SQL to join fa_profiles with auth.users to get emails
  // This requires a function that can access auth.users
  const { data, error } = await supabase.rpc('get_users_with_profiles')

  if (error) {
    // If the function doesn't exist, fall back to just profiles
    // and enrich rows from auth users
    const { data: profiles, error: profilesError } = await supabase
      .from('fa_profiles')
      .select('id, full_name, role, created_at')
      .order('created_at', { ascending: false })

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`)
    }

    return (profiles || []).map((profile: any) => {
      const authUser = authLookupById.get(profile.id)
      return {
        id: profile.id,
        email: authUser?.email || 'Email not available',
        full_name: profile.full_name,
        role: profile.role,
        created_at: profile.created_at,
        last_sign_in_at: authUser?.last_sign_in_at || null,
      }
    })
  }

  // If function exists and works, use its results
  return (data || []).map((row: any) => ({
    id: row.id,
    email: row.email || authLookupById.get(row.id)?.email || 'Email not available',
    full_name: row.full_name,
    role: row.role,
    created_at: row.created_at,
    last_sign_in_at: row.last_sign_in_at || authLookupById.get(row.id)?.last_sign_in_at || null,
  }))
}

/**
 * Invite a user by email
 * Only accessible by admin users
 */
export async function inviteUserByEmail(
  email: string,
  role: UserRole = 'pending'
): Promise<{ success: boolean; message?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Unauthorized - Admin access required')
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email address')
  }

  // Validate role
  const validRoles: UserRole[] = ['admin', 'ops', 'readonly', 'client', 'pending']
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role: ${role}`)
  }

  try {
    // Use admin client for admin operations
    const adminClient = createAdminSupabaseClient()
    
    // Check if user already exists by listing users and filtering by email
    const { data: usersList, error: listError } = await adminClient.auth.admin.listUsers()
    const existingUser = usersList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (existingUser) {
      // User already exists, check if they have a profile
      const { data: existingProfile } = await supabase
        .from('fa_profiles')
        .select('id, role')
        .eq('id', existingUser.id)
        .single()

      if (existingProfile) {
        return {
          success: false,
          message: `User with email ${email} already exists with role: ${existingProfile.role}`
        }
      } else {
        // User exists but no profile - create profile with specified role
        await supabase
          .from('fa_profiles')
          .insert({
            id: existingUser.id,
            full_name: email.split('@')[0],
            role: role,
          })
        return {
          success: true,
          message: `Profile created for existing user ${email} with role: ${role}`
        }
      }
    }

    // Get the app URL for redirect (use environment variable or default to production URL)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://foot-asylum-kss.vercel.app'
    const redirectTo = `${appUrl}/login/reset-password`

    // Invite new user using admin client
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        intended_role: role,
        full_name: email.split('@')[0]
      },
      redirectTo: redirectTo
    })

    if (inviteError) {
      throw new Error(`Failed to invite user: ${inviteError.message}`)
    }

    // Create profile with the intended role using admin client to bypass RLS
    // The profile will be created when they first log in, but we can pre-create it
    if (inviteData?.user?.id) {
      // Use admin client to create profile to ensure it works regardless of RLS
      const adminClient = createAdminSupabaseClient()
      const { error: profileError } = await adminClient
        .from('fa_profiles')
        .insert({
          id: inviteData.user.id,
          full_name: email.split('@')[0],
          role: role,
        })

      // If profile creation fails (e.g., already exists), that's okay
      // It will be created on first login
      if (profileError && profileError.code !== '23505') {
        console.error('Profile creation error (non-critical):', profileError)
      }
    }

    return {
      success: true,
      message: `Invitation sent to ${email}. They will receive an email to set their password.`
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to invite user')
  }
}

/**
 * Update a user's role
 * Only accessible by admin users
 */
export async function updateUserRole(userId: string, newRole: UserRole): Promise<{ success: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Unauthorized - Admin access required')
  }

  // Validate role
  const validRoles: UserRole[] = ['admin', 'ops', 'readonly', 'client', 'pending']
  if (!validRoles.includes(newRole)) {
    throw new Error(`Invalid role: ${newRole}`)
  }

  // Check if profile exists, if not create it
  const { data: existingProfile } = await supabase
    .from('fa_profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (!existingProfile) {
    // Get user email to create profile using admin client
    const adminClient = createAdminSupabaseClient()
    const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(userId)
    if (getUserError || !authUser?.user) {
      throw new Error('User not found')
    }

    // Create profile with new role
    const { error: createError } = await supabase
      .from('fa_profiles')
      .insert({
        id: userId,
        full_name: authUser.user.email?.split('@')[0] || null,
        role: newRole,
      })

    if (createError) {
      throw new Error(`Failed to create profile: ${createError.message}`)
    }
  } else {
    // Update existing profile
    const { error: updateError } = await supabase
      .from('fa_profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (updateError) {
      throw new Error(`Failed to update role: ${updateError.message}`)
    }
  }

  return { success: true }
}

/**
 * Delete a user completely from the database
 * Only accessible by admin users
 * This will delete:
 * - User profile from fa_profiles
 * - User from auth.users
 */
export async function deleteUser(userId: string): Promise<{ success: boolean; message?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('fa_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Unauthorized - Admin access required')
  }

  // Prevent admin from deleting themselves
  if (userId === user.id) {
    throw new Error('You cannot delete your own account')
  }

  try {
    // Use admin client for admin operations
    const adminClient = createAdminSupabaseClient()

    // First, delete the profile (this might have foreign key constraints, so we do it first)
    const { error: profileError } = await supabase
      .from('fa_profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      // If profile deletion fails, still try to delete auth user
      console.error('Error deleting profile:', profileError)
    }

    // Delete the user from auth.users using admin API
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)

    if (deleteError) {
      throw new Error(`Failed to delete user: ${deleteError.message}`)
    }

    return {
      success: true,
      message: 'User deleted successfully'
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to delete user')
  }
}
