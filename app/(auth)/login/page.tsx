'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { AuthShell } from '@/components/auth/auth-shell'
import { AUTH_CARD_CLASS, AUTH_LINK_CLASS } from '@/components/auth/auth-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const passwordReset = searchParams?.get('password_reset')
    if (passwordReset === 'success') {
      setSuccess('Your password has been reset. Sign in with your new password.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (data?.user) {
        router.push('/')
        router.refresh()
        return
      }

      setError('Sign in failed. Please try again.')
      setLoading(false)
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <AuthShell contentClassName="max-w-lg">
      <Card className={AUTH_CARD_CLASS}>
        <CardHeader className="px-5 pt-5 text-center sm:px-6 sm:pt-6">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            TFS Operations Platform
          </div>
          <CardTitle className="text-3xl text-slate-950 sm:text-[2rem]">Sign in</CardTitle>
          <CardDescription className="mx-auto max-w-sm text-sm text-slate-600 sm:text-base">
            Access operations, incidents, store visits, route planning, and reporting from one workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-medium text-slate-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-medium text-slate-700">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <div className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-3 text-sm text-critical">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-lg border border-success/20 bg-success-soft px-3 py-3 text-sm text-success">
                {success}
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <Link href="/store-login" className="block">
              <Button type="button" variant="outline" className="w-full">
                Store login with code
              </Button>
            </Link>

            <p className="text-center text-xs text-slate-500">
              Store teams can sign in with their store code only.
            </p>

            <div className="space-y-2 text-center">
              <Link href="/login/forgot-password" className={`text-sm ${AUTH_LINK_CLASS}`}>
                Forgot your password?
              </Link>
              <div className="text-sm text-slate-600">
                Don&apos;t have an account?{' '}
                <Link href="/login/signup" className={AUTH_LINK_CLASS}>
                  Sign up
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell contentClassName="max-w-lg">
          <Card className={AUTH_CARD_CLASS}>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">Loading sign-in...</p>
              </div>
            </CardContent>
          </Card>
        </AuthShell>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
