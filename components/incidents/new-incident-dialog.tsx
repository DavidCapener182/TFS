'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createIncident } from '@/app/actions/incidents'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatStoreName } from '@/lib/store-display'
import { shouldHideStore } from '@/lib/store-normalization'

const incidentSchema = z.object({
  store_id: z.string().min(1, 'Store is required'),
  incident_category: z.enum(['accident', 'near_miss', 'security', 'fire', 'health_safety', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  summary: z.string().min(1, 'Summary is required'),
  description: z.string().optional(),
  occurred_at: z.string().min(1, 'Occurred date is required'),
  riddor_reportable: z.boolean().default(false),
})

type IncidentFormValues = z.infer<typeof incidentSchema>

interface NewIncidentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewIncidentDialog({ open, onOpenChange }: NewIncidentDialogProps) {
  const router = useRouter()
  const [stores, setStores] = useState<Array<{ id: string; store_name: string; store_code: string | null }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchStores() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tfs_stores')
        .select('id, store_name, store_code')
        .eq('is_active', true)
        .order('store_name')

      if (data) {
        setStores(data.filter((store) => !shouldHideStore(store)))
      }
    }
    fetchStores()
  }, [])

  const form = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentSchema),
    defaultValues: {
      store_id: '',
      incident_category: 'other',
      severity: 'medium',
      summary: '',
      description: '',
      occurred_at: new Date().toISOString().slice(0, 16),
      riddor_reportable: false,
    },
  })

  const onSubmit = async (values: IncidentFormValues) => {
    setIsSubmitting(true)
    try {
      const incident = await createIncident({
        ...values,
        occurred_at: new Date(values.occurred_at).toISOString(),
      })
      form.reset()
      onOpenChange(false)
      router.push(`/incidents/${incident.id}`)
      router.refresh()
    } catch (error) {
      console.error('Failed to create incident:', error)
      alert('Failed to create incident. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log New Incident</DialogTitle>
          <DialogDescription>
            Report a new safety incident. Fill in all required fields and submit.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="store_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="min-h-[44px] sm:min-h-0">
                        <SelectValue placeholder="Select a store" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {formatStoreName(store.store_name)} {store.store_code && `(${store.store_code})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="incident_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="min-h-[44px] sm:min-h-0">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="accident">Accident</SelectItem>
                        <SelectItem value="near_miss">Near Miss</SelectItem>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="fire">Fire</SelectItem>
                        <SelectItem value="health_safety">Health & Safety</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Severity *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="min-h-[44px] sm:min-h-0">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summary *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Brief description of the incident" className="min-h-[44px] sm:min-h-0" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} placeholder="Detailed description of what happened" className="min-h-[120px]" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="occurred_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Occurred At *</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} className="min-h-[44px] sm:min-h-0" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {isSubmitting ? 'Creating...' : 'Create Incident'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
