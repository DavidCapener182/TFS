'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthShell } from '@/components/auth/auth-shell'
import { AUTH_CARD_CLASS } from '@/components/auth/auth-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [linkType, setLinkType] = useState<string | null>(null)
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    // Check if we have the necessary tokens in the URL
    // Can come from password reset (type=recovery) or invitation (type=invite)
    // Tokens can be in hash (#) or query parameters (?)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const queryParams = new URLSearchParams(window.location.search)
    
    // Try hash first, then query params
    const accessToken = hashParams.get('access_token') || queryParams.get('access_token')
    const type = hashParams.get('type') || queryParams.get('type')
    const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token')

    if (type) {
      setLinkType(type)
    }

    if ((type === 'recovery' || type === 'invite' || type === 'signup') && accessToken) {
      // User came from email link (password reset or invitation), we can proceed
      // If tokens are in query params, we might need to redirect to hash format
      if (queryParams.get('access_token') && !hashParams.get('access_token')) {
        // Supabase sometimes uses query params, but we need hash for client-side
        // The page should still work, but let's log for debugging
        console.log('Tokens found in query params')
      }
    } else if (!accessToken) {
      // No valid token found - might be a direct visit or expired link
      setIsExpired(true)
      setError('This link has expired or is invalid.')
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    const supabase = createClient()
    
    // Get the access token from the URL (check both hash and query params)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const queryParams = new URLSearchParams(window.location.search)
    
    const accessToken = hashParams.get('access_token') || queryParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token')
    const type = hashParams.get('type') || queryParams.get('type')

    if (!accessToken) {
      setError('Invalid or expired link. Please request a new invitation or password reset.')
      setIsExpired(true)
      setLoading(false)
      return
    }

    // Set the session with the tokens from the email link
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken || '',
    })

    if (sessionError) {
      setError('Invalid or expired link. Please request a new one.')
      setIsExpired(true)
      setLoading(false)
      return
    }

    // Update the password
    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
    } else {
      setSuccess(true)
      // Redirect to home page after password is set (user is now logged in)
      // For invitations, they should go to the app, not back to login
      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 1500)
    }
  }

  if (success) {
    return (
      <AuthShell logoSize="compact" desktopLogoPosition="corner">
          <Card className={AUTH_CARD_CLASS}>
            <CardHeader className="px-5 pt-5 text-center sm:px-6 sm:pt-6">
              <CardTitle className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                Password set successfully
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 sm:text-base">
                Your password has been set. Redirecting to the app...
              </CardDescription>
            </CardHeader>
          </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell logoSize="compact" desktopLogoPosition="corner">
        <Card className={AUTH_CARD_CLASS}>
          <CardHeader className="px-5 pt-5 text-center sm:px-6 sm:pt-6">
            <CardTitle className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              {(() => {
                const hashParams = new URLSearchParams(window.location.hash.substring(1))
                const queryParams = new URLSearchParams(window.location.search)
                const type = hashParams.get('type') || queryParams.get('type')
                return type === 'invite' ? 'Set your password' : 'Set new password'
              })()}
            </CardTitle>
            <CardDescription className="mx-auto max-w-sm text-sm text-slate-600 sm:text-base">
              {(() => {
                const hashParams = new URLSearchParams(window.location.hash.substring(1))
                const queryParams = new URLSearchParams(window.location.search)
                const type = hashParams.get('type') || queryParams.get('type')
                return type === 'invite' 
                  ? 'Welcome! Please set a password to complete your account setup.'
                  : 'Enter your new password below'
              })()}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
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
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="bg-white"
                />
              </div>
            {error && (
              <div className="space-y-4">
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
                {isExpired && (
                  <div className="space-y-3 pt-2">
                    <p className="text-sm text-muted-foreground">
                      {linkType === 'invite' 
                        ? 'This invitation link has expired. Please contact your administrator to request a new invitation, or use the options below:'
                        : 'This password reset link has expired. Please request a new one:'}
                    </p>
                    <div className="flex flex-col gap-2">
                      {linkType === 'invite' ? (
                        <>
                          <Link href="/login/forgot-password">
                            <Button variant="outline" className="w-full">
                              Reset Password
                            </Button>
                          </Link>
                          <p className="text-xs text-center text-slate-500">
                            If you already have an account, you can reset your password here.
                          </p>
                        </>
                      ) : (
                        <Link href="/login/forgot-password">
                          <Button variant="outline" className="w-full">
                            Request New Reset Link
                          </Button>
                        </Link>
                      )}
                      <Link href="/login">
                        <Button variant="ghost" className="w-full">
                          Back to Login
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
              {!isExpired && (
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Updating password...' : 'Update password'}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthShell logoSize="compact" desktopLogoPosition="corner">
        <Card className={AUTH_CARD_CLASS}>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-slate-600">Loading...</p>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
