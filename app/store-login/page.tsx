import Link from 'next/link'

import { AuthShell } from '@/components/auth/auth-shell'
import { AUTH_LINK_CLASS } from '@/components/auth/auth-ui'
import { StoreLoginForm } from '@/components/store-portal/store-login-form'

export default function StoreLoginPage() {
  return (
    <AuthShell
      variant="split"
      splitTagline="Store teams can open their portal quickly with a secure store code."
    >
      <div className="mb-8 text-left">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          TFS Store Portal
        </p>
        <h2 className="text-3xl font-semibold tracking-normal text-slate-950">Store login</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Enter your store code to open the store portal.
        </p>
      </div>

      <div className="space-y-6">
        <StoreLoginForm />
        <div className="space-y-3 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
          <p>Head office and field teams use email sign-in.</p>
          <Link href="/login" className={AUTH_LINK_CLASS}>
            Staff sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
