'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { loginStorePortal } from '@/app/actions/store-portal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function StoreLoginForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          try {
            await loginStorePortal(code)
            router.push('/store-portal')
            router.refresh()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to sign in')
          }
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="store-code" className="text-slate-700">
          Store code
        </Label>
        <Input
          id="store-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="e.g. 11"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="min-h-[44px]"
        />
      </div>
      {error ? (
        <div className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-3 text-sm text-critical">
          {error}
        </div>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in with store code'}
      </Button>
    </form>
  )
}
