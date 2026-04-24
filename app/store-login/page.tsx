import Link from 'next/link'

import { AuthShell } from '@/components/auth/auth-shell'
import { AUTH_CARD_CLASS, AUTH_LINK_CLASS } from '@/components/auth/auth-ui'
import { StoreLoginForm } from '@/components/store-portal/store-login-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function StoreLoginPage() {
  return (
    <AuthShell contentClassName="max-w-lg">
      <Card className={AUTH_CARD_CLASS}>
        <CardHeader className="space-y-2 px-5 pt-5 text-center sm:px-6 sm:pt-6">
          <div className="mx-auto mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            TFS Store Portal
          </div>
          <CardTitle className="text-2xl text-slate-950 sm:text-3xl">Store login</CardTitle>
          <CardDescription className="mx-auto max-w-sm text-slate-600">
            Enter your store code to open the store portal. Example: <span className="font-mono font-semibold">11</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-5 pb-6 sm:px-6 sm:pb-6">
          <StoreLoginForm />
          <div className="space-y-3 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
            <p>Head office and field teams use email sign-in.</p>
            <Link href="/login" className={AUTH_LINK_CLASS}>
              Staff sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
