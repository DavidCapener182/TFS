'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
      setSuccess('Your password has been reset successfully. Please sign in with your new password.')
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
        // Successfully authenticated, redirect to home
        router.push('/')
        router.refresh()
      } else {
        setError('Login failed. Please try again.')
        setLoading(false)
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[linear-gradient(140deg,#1c0259_0%,#232154_52%,#312d73_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_42%)]"></div>
      <div className="absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(circle_at_bottom,rgba(42,135,66,0.26),transparent_58%)]"></div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
        <div className="mb-8 flex justify-center">
          <Image
            src="/tfs-logo.svg"
            alt="The Fragrance Shop"
            width={240}
            height={70}
            className="h-auto w-auto object-contain"
            priority
          />
        </div>

        <Card className="w-full max-w-md bg-white/95 backdrop-blur-sm shadow-2xl border-0">
          <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 text-center">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
              The Fragrance Shop Platform
            </CardTitle>
            <CardDescription className="text-sm sm:text-base text-slate-600">
              Sign in to access operations, incidents, visits, and route planning.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="bg-white h-10 min-h-[44px] rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="bg-white h-10 min-h-[44px] rounded-md px-3 py-2 text-sm"
                />
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
                  {error}
                </div>
              )}
              {success && (
                <div className="text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">
                  {success}
                </div>
              )}
              <Button type="submit" className="w-full bg-[#232154] text-white hover:bg-[#1c0259]" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">or</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <Link href="/store-login" className="block">
                <Button type="button" variant="outline" className="w-full border-slate-300 text-slate-700 hover:bg-slate-50">
                  Store login with code
                </Button>
              </Link>
              <p className="text-center text-xs text-slate-500">
                Stores can sign in with their store code only.
              </p>
              <div className="space-y-2 text-center">
                <a
                  href="/login/forgot-password"
                  className="text-sm text-[#232154] hover:text-[#1c0259] hover:underline block font-medium"
                >
                  Forgot your password?
                </a>
                <div className="text-sm text-slate-600">
                  Don&apos;t have an account?{' '}
                  <a
                    href="/login/signup"
                    className="text-[#232154] hover:text-[#1c0259] hover:underline font-medium"
                  >
                    Sign up
                  </a>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[linear-gradient(140deg,#1c0259_0%,#232154_52%,#312d73_100%)] flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/95 backdrop-blur-sm">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-slate-600">Loading...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
