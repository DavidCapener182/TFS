'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createIncident } from '@/app/actions/incidents'
import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatStoreName } from '@/lib/store-display'
import { shouldHideStore } from '@/lib/store-normalization'
import { WorkspaceHeader, WorkspaceShell } from '@/components/workspace/workspace-shell'
import { AlertTriangle } from 'lucide-react'

const incidentSchema = z.object({
  store_id: z.string().min(1, 'Store is required'),
  incident_category: z.enum([
    'accident',
    'near_miss',
    'security',
    'theft',
    'fire',
    'health_safety',
    'other',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  summary: z.string().min(1, 'Summary is required'),
  description: z.string().optional(),
  occurred_at: z.string().min(1, 'Occurred date is required'),
  riddor_reportable: z.boolean().default(false),
})

type IncidentFormValues = z.infer<typeof incidentSchema>

function NewIncidentPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stores, setStores] = useState<Array<{ id: string; store_name: string; store_code: string | null }>>([])

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

  useEffect(() => {
    const presetStoreId = searchParams?.get('storeId')
    if (!presetStoreId) return

    if (stores.some((store) => store.id === presetStoreId)) {
      form.setValue('store_id', presetStoreId)
    }
  }, [searchParams, stores, form])

  const onSubmit = async (values: IncidentFormValues) => {
    try {
      const incident = await createIncident({
        ...values,
        occurred_at: new Date(values.occurred_at).toISOString(),
      })
      router.push(`/incidents/${incident.id}`)
    } catch (error) {
      console.error('Failed to create incident:', error)
      alert('Failed to create incident. Please try again.')
    }
  }

  return (
    <WorkspaceShell className="space-y-6 p-4 md:p-6">
      <WorkspaceHeader
        eyebrow="Incidents"
        icon={AlertTriangle}
        title="Log new incident"
        description="Create a new incident record and route it into the operational workflow."
      />

      <Card>
        <CardHeader>
          <CardTitle>Incident Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="store_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
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

              <FormField
                control={form.control}
                name="incident_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="accident">Accident</SelectItem>
                        <SelectItem value="near_miss">Near Miss</SelectItem>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="theft">Theft</SelectItem>
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
                    <FormLabel>Severity</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
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

              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Summary</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                      <Textarea {...field} rows={5} />
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
                    <FormLabel>Occurred At</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Button type="submit">Create Incident</Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </WorkspaceShell>
  )
}

export default function NewIncidentPage() {
  return (
    <Suspense
      fallback={
        <WorkspaceShell className="space-y-6 p-4 md:p-6">
          <WorkspaceHeader
            eyebrow="Incidents"
            icon={AlertTriangle}
            title="Log new incident"
            description="Create a new incident record and route it into the operational workflow."
          />

          <Card>
            <CardHeader>
              <CardTitle>Incident Details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Loading incident form...</p>
            </CardContent>
          </Card>
        </WorkspaceShell>
      }
    >
      <NewIncidentPageContent />
    </Suspense>
  )
}
