'use client'

import { useReleaseNotes } from '@/hooks/useReleaseNotes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Rocket } from 'lucide-react'
import { format } from 'date-fns'

function renderMarkdown(content: string) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="space-y-1.5 mb-4">
          {listItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }
    if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-gray-900 mt-4 mb-2">
          {trimmed.slice(3)}
        </h3>
      )
    } else if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2))
    } else {
      flushList()
      elements.push(
        <p key={key++} className="text-sm text-gray-600 mb-2">{trimmed}</p>
      )
    }
  }
  flushList()

  return elements
}

export function ReleaseNotesModal() {
  const { latestRelease, shouldShow, loading, dismissRelease } = useReleaseNotes()

  if (loading || !shouldShow || !latestRelease) return null

  const releaseDate = latestRelease.created_at
    ? format(new Date(latestRelease.created_at), 'MMMM yyyy')
    : ''

  return (
    <Dialog open={shouldShow} onOpenChange={(open) => { if (!open) dismissRelease() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Rocket className="h-4 w-4 text-blue-600" />
            </div>
            <DialogTitle className="text-lg font-bold">
              {latestRelease.title || 'New Update Available'}
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                v{latestRelease.version}
              </span>
              {releaseDate && <span>Released: {releaseDate}</span>}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto pr-2 -mr-2">
          {latestRelease.content ? (
            renderMarkdown(latestRelease.content)
          ) : latestRelease.description ? (
            <p className="text-sm text-gray-600">{latestRelease.description}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={dismissRelease} className="w-full sm:w-auto">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
