'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignUpPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isFootAsylumClient, setIsFootAsylumClient] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (!fullName.trim()) {
      setError('Full name is required')
      return
    }

    setLoading(true)

    const supabase = createClient()
    
    // Determine role
    const role = isFootAsylumClient ? 'client' : 'readonly'
    
    // Sign up the user with role in metadata
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          intended_role: role, // Store intended role for profile creation
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })

    if (signUpError) {
      // Handle specific error cases
      if (signUpError.message.includes('already registered') || signUpError.message.includes('already exists')) {
        setError('An account with this email already exists. Please sign in instead or use a different email.')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    // Check if user was actually created (handles case where email already exists)
    if (!data.user) {
      setError('Unable to create account. This email may already be registered. Please try signing in instead.')
      setLoading(false)
      return
    }

    if (data.user) {
      // Check if email confirmation is required
      if (data.session) {
        // User is immediately signed in (email confirmation disabled)
        // Create profile now with intended role
        // Head office users get client access, others need admin approval ('pending')
        const finalRole = isFootAsylumClient ? 'client' : 'pending'
        
        const { error: profileError } = await supabase
          .from('fa_profiles')
          .insert({
            id: data.user.id,
            full_name: fullName,
            role: finalRole,
          })

        if (profileError) {
          console.error('Profile creation error:', profileError)
          // If profile already exists, try to update it
          if (profileError.code === '23505') { // Unique violation
            const { error: updateError } = await supabase
              .from('fa_profiles')
              .update({ role: finalRole, full_name: fullName })
              .eq('id', data.user.id)
            
            if (updateError) {
              console.error('Profile update error:', updateError)
            }
          }
        }

        setSuccess('Account created successfully! Redirecting...')
        setTimeout(() => {
          router.push('/')
          router.refresh()
        }, 1500)
      } else {
        // Email confirmation required
        // Role is stored in user metadata and will be used when profile is created on first login
        setSuccess('Account created! Please check your email to confirm your account before signing in.')
      }
    }
  }

  if (success) {
    return (
      <AuthShell logoSize="compact" desktopLogoPosition="corner">
          <Card className="w-full rounded-[28px] border border-white/65 bg-white/94 shadow-[0_20px_60px_rgba(2,12,27,0.28)] backdrop-blur-xl sm:rounded-lg sm:border-0 sm:bg-white/95 sm:shadow-2xl sm:backdrop-blur-sm">
            <CardHeader className="px-5 pt-5 text-center sm:px-6 sm:pt-6">
              <CardTitle className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                Check your email
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 sm:text-base">
                {success}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
              <Button asChild className="w-full bg-[#232154] text-white hover:bg-[#1c0259]">
                <Link href="/login">
                  Back to login
                </Link>
              </Button>
            </CardContent>
          </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
        <Card className="w-full rounded-[28px] border border-white/65 bg-white/94 shadow-[0_20px_60px_rgba(2,12,27,0.28)] backdrop-blur-xl sm:rounded-lg sm:border-0 sm:bg-white/95 sm:shadow-2xl sm:backdrop-blur-sm">
          <CardHeader className="px-5 pt-5 text-center sm:px-6 sm:pt-6">
            <CardTitle className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              Create an account
            </CardTitle>
            <CardDescription className="mx-auto max-w-sm text-sm text-slate-600 sm:text-base">
              Sign up to access The Fragrance Shop Platform
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-slate-700 font-medium">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-700 font-medium">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="bg-white"
                />
              </div>
              <div className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 sm:min-h-0 sm:space-x-2 sm:gap-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0">
                <input
                  type="checkbox"
                  id="isFootAsylumClient"
                  checked={isFootAsylumClient}
                  onChange={(e) => setIsFootAsylumClient(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#232154] focus:ring-[#232154]"
                />
                <Label htmlFor="isFootAsylumClient" className="cursor-pointer text-sm font-medium text-slate-700">
                  The Fragrance Shop Head Office
                </Label>
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full bg-[#232154] hover:bg-[#1c0259] text-white" disabled={loading}>
                {loading ? 'Creating account...' : 'Create account'}
              </Button>
              <Link
                href="/login"
                className="flex min-h-[48px] items-center justify-center rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 sm:hidden"
              >
                Already have an account? Sign in
              </Link>
              <div className="hidden text-center text-sm text-slate-600 sm:block">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="font-medium text-[#232154] hover:text-[#1c0259] hover:underline"
                >
                  Sign in
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
    </AuthShell>
  )
}
