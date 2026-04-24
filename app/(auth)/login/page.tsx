'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { AuthShell } from '@/components/auth/auth-shell'
import { AUTH_LINK_CLASS } from '@/components/auth/auth-ui'
import { Button } from '@/components/ui/button'
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
    <AuthShell
      variant="split"
      splitTagline="Secure access for field operations, audit follow-up, incident management, route planning, and reporting."
    >
      <div className="mb-8 text-left">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Welcome back</p>
        <h2 className="text-4xl font-semibold tracking-normal text-slate-950">Sign in</h2>
      </div>

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

        <div className="space-y-2 pt-1 text-center">
          <Link href="/login/forgot-password" className={`text-sm ${AUTH_LINK_CLASS}`}>
            Forgot your password?
          </Link>
          <div className="text-sm text-slate-600">
            No account?{' '}
            <Link href="/login/signup" className={AUTH_LINK_CLASS}>
              Sign up
            </Link>
          </div>
        </div>
      </form>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell variant="split">
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-slate-600">Loading sign-in...</p>
          </div>
        </AuthShell>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
