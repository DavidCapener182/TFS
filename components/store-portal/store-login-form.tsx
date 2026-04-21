'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loginStorePortal } from '@/app/actions/store-portal'

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
      <Input
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="Store code (example: 11)"
        className="min-h-[44px]"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full bg-indigo-600 hover:bg-indigo-700">
        {pending ? 'Signing in…' : 'Sign in with store code'}
      </Button>
    </form>
  )
}
