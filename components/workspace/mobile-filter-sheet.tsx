'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

export function MobileFilterSheet({
  activeFilterCount = 0,
  title = 'Filters',
  description = 'Refine the current operational view.',
  children,
}: {
  activeFilterCount?: number
  title?: string
  description?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="min-h-[48px] w-full justify-between rounded-[16px] bg-white px-4"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-500" />
          {title}
        </span>
        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          {activeFilterCount > 0 ? `${activeFilterCount} active` : 'Optional'}
        </span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[86dvh] overflow-y-auto rounded-t-[1.75rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="mt-1">{description}</SheetDescription>
          <div className="mt-5">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
