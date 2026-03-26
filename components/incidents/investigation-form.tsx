'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createInvestigation, updateInvestigation } from '@/app/actions/investigations'

const investigationSchema = z.object({
  investigation_type: z.enum(['light_touch', 'formal']),
  status: z.enum(['not_started', 'in_progress', 'awaiting_actions', 'complete']),
  lead_investigator_user_id: z.string().min(1),
  root_cause: z.string().optional(),
  contributing_factors: z.string().optional(),
  findings: z.string().optional(),
  recommendations: z.string().optional(),
})

type InvestigationFormValues = z.infer<typeof investigationSchema>

interface InvestigationFormProps {
  incidentId: string
  investigation?: any
  profiles?: Array<{ id: string; full_name: string | null }>
  defaultLeadInvestigatorUserId?: string | null
  onSuccess?: () => void
}

export function InvestigationForm({
  incidentId,
  investigation,
  profiles = [],
  defaultLeadInvestigatorUserId,
  onSuccess,
}: InvestigationFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<InvestigationFormValues>({
    resolver: zodResolver(investigationSchema),
    defaultValues: investigation ? {
      investigation_type: investigation.investigation_type,
      status: investigation.status,
      lead_investigator_user_id: investigation.lead_investigator_user_id,
      root_cause: investigation.root_cause || '',
      contributing_factors: investigation.contributing_factors || '',
      findings: investigation.findings || '',
      recommendations: investigation.recommendations || '',
    } : {
      investigation_type: 'light_touch',
      status: 'not_started',
      lead_investigator_user_id: defaultLeadInvestigatorUserId || '',
      root_cause: '',
      contributing_factors: '',
      findings: '',
      recommendations: '',
    },
  })

  const onSubmit = async (values: InvestigationFormValues) => {
    setIsSubmitting(true)
    setError(null)
    try {
      if (investigation) {
        await updateInvestigation(investigation.id, values)
      } else {
        await createInvestigation(incidentId, values)
      }
      onSuccess?.()
      router.refresh()
    } catch (error) {
      console.error('Failed to save investigation:', error)
      setError(error instanceof Error ? error.message : 'Failed to save investigation.')
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="investigation_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Investigation Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="light_touch">Light Touch</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="awaiting_actions">Awaiting Actions</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="lead_investigator_user_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lead Investigator</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a lead investigator" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="root_cause"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Root Cause</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contributing_factors"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contributing Factors</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="findings"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Findings</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="recommendations"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Recommendations</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving...'
            : investigation
              ? 'Update Investigation'
              : 'Create Investigation'}
        </Button>
      </form>
    </Form>
  )
}

