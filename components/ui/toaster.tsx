'use client'

import { useToast } from '@/hooks/use-toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto rounded-lg border bg-white p-4 shadow-lg transition-all animate-in slide-in-from-bottom-5 fade-in-0 duration-300',
            toast.variant === 'destructive' && 'border-red-200 bg-red-50 text-red-900',
            toast.variant === 'success' && 'border-green-200 bg-green-50 text-green-900',
            !toast.variant && 'border-gray-200 text-gray-900'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className="text-sm font-semibold">{toast.title}</p>
              )}
              {toast.description && (
                <p className="text-sm opacity-80 mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="flex-shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
