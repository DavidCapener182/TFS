'use client'

import { useState, useEffect } from 'react'
import { useFeedback, type FeedbackType } from '@/hooks/useFeedback'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Bug, Lightbulb, MessageSquare } from 'lucide-react'

interface FeedbackModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const typeOptions: { value: FeedbackType; label: string; icon: React.ReactNode }[] = [
  { value: 'bug', label: 'Bug Report', icon: <Bug className="h-4 w-4 text-red-500" /> },
  { value: 'feature', label: 'Feature Request', icon: <Lightbulb className="h-4 w-4 text-amber-500" /> },
  { value: 'feedback', label: 'General Feedback', icon: <MessageSquare className="h-4 w-4 text-blue-500" /> },
]

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const { submitFeedback, submitting } = useFeedback()
  const [type, setType] = useState<FeedbackType>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open && typeof window !== 'undefined') {
      setPageUrl(window.location.href)
    }
  }, [open])

  function resetForm() {
    setType('bug')
    setTitle('')
    setDescription('')
    setPageUrl('')
    setErrors({})
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = 'Title is required'
    if (!description.trim()) newErrors.description = 'Description is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const success = await submitFeedback({
      type,
      title: title.trim(),
      description: description.trim(),
      page_url: pageUrl,
    })

    if (success) {
      resetForm()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a Bug or Request a Feature</DialogTitle>
          <DialogDescription>
            Help us improve by sharing your feedback.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FeedbackType)}>
              <SelectTrigger id="feedback-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      {opt.icon}
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-title">Title</Label>
            <Input
              id="feedback-title"
              placeholder="Brief summary of the issue or request"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: '' })) }}
            />
            {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-description">Description</Label>
            <Textarea
              id="feedback-description"
              placeholder="Describe the issue or feature in detail..."
              rows={4}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: '' })) }}
            />
            {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-url">Page URL</Label>
            <Input
              id="feedback-url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              readOnly
              className="text-gray-500 bg-gray-50"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
