'use client'

import { useState, useCallback, useEffect } from 'react'

export type ToastVariant = 'default' | 'destructive' | 'success'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
}

let listeners: Array<(toasts: Toast[]) => void> = []
let memoryState: Toast[] = []

function dispatch(toasts: Toast[]) {
  memoryState = toasts
  listeners.forEach((listener) => listener(toasts))
}

let toastCount = 0

export function toast({ title, description, variant }: Omit<Toast, 'id'>) {
  const id = String(toastCount++)
  dispatch([...memoryState, { id, title, description, variant }])

  setTimeout(() => {
    dispatch(memoryState.filter((t) => t.id !== id))
  }, 4000)

  return id
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(memoryState)

  useEffect(() => {
    listeners.push(setToasts)
    return () => {
      listeners = listeners.filter((l) => l !== setToasts)
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    dispatch(memoryState.filter((t) => t.id !== id))
  }, [])

  return { toasts, dismiss, toast }
}
