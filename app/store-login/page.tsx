import { StoreLoginForm } from '@/components/store-portal/store-login-form'

export default function StoreLoginPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Store login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Test access is enabled. Enter your store code only. Example: 11.
        </p>
        <div className="mt-5">
          <StoreLoginForm />
        </div>
      </div>
    </div>
  )
}
