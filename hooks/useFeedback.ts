'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'

export type FeedbackType = 'bug' | 'feature' | 'feedback'

export interface FeedbackFormData {
  type: FeedbackType
  title: string
  description: string
  page_url: string
}

export function useFeedback() {
  const [submitting, setSubmitting] = useState(false)

  const submitFeedback = useCallback(async (data: FeedbackFormData) => {
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast({ title: 'Error', description: 'You must be logged in to submit feedback.', variant: 'destructive' })
        return false
      }

      const { error } = await supabase
        .from('tfs_user_feedback')
        .insert({
          user_id: user.id,
          type: data.type,
          title: data.title,
          description: data.description,
          page_url: data.page_url,
          browser_info: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        })

      if (error) {
        toast({ title: 'Error', description: 'Failed to submit feedback. Please try again.', variant: 'destructive' })
        return false
      }

      toast({ title: 'Thanks!', description: 'Your report has been submitted.', variant: 'success' })
      return true
    } catch {
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' })
      return false
    } finally {
      setSubmitting(false)
    }
  }, [])

  return { submitFeedback, submitting }
}
