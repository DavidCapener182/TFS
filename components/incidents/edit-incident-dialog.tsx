'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { updateIncident } from '@/app/actions/incidents'
import { Pencil } from 'lucide-react'

const editIncidentSchema = z.object({
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
  status: z.enum(['open', 'under_investigation', 'actions_in_progress', 'closed', 'cancelled']),
  summary: z.string().min(1, 'Summary is required'),
  description: z.string().optional(),
  occurred_at: z.string().min(1, 'Occurred date is required'),
  reported_at: z.string().optional(),
  closed_at: z.string().optional(),
  riddor_reportable: z.enum(['yes', 'no']),
  target_close_date: z.string().optional(),
  closure_summary: z.string().optional(),
  assigned_investigator_user_id: z.string().optional(),
})

type EditIncidentFormValues = z.infer<typeof editIncidentSchema>

interface EditIncidentDialogProps {
  incident: any
}

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function EditIncidentDialog({ incident }: EditIncidentDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const form = useForm<EditIncidentFormValues>({
    resolver: zodResolver(editIncidentSchema),
    defaultValues: {
      incident_category: incident.incident_category,
      severity: incident.severity,
      status: incident.status || 'open',
      summary: incident.summary || '',
      description: incident.description || '',
      occurred_at: toLocalDateTimeInput(incident.occurred_at),
      reported_at: toLocalDateTimeInput(incident.reported_at),
      closed_at: toLocalDateTimeInput(incident.closed_at),
      riddor_reportable: incident.riddor_reportable ? 'yes' : 'no',
      target_close_date: incident.target_close_date || '',
      closure_summary: incident.closure_summary || '',
      assigned_investigator_user_id: incident.assigned_investigator_user_id || '',
    },
  })

  const onSubmit = async (values: EditIncidentFormValues) => {
    setIsSaving(true)
    try {
      await updateIncident(incident.id, {
        incident_category: values.incident_category,
        severity: values.severity,
        status: values.status,
        summary: values.summary.trim(),
        description: values.description?.trim() || '',
        occurred_at: new Date(values.occurred_at).toISOString(),
        reported_at: values.reported_at ? new Date(values.reported_at).toISOString() : undefined,
        closed_at: values.closed_at ? new Date(values.closed_at).toISOString() : undefined,
        riddor_reportable: values.riddor_reportable === 'yes',
        target_close_date: values.target_close_date || null,
        closure_summary: values.closure_summary?.trim() || null,
        assigned_investigator_user_id: values.assigned_investigator_user_id?.trim() || null,
        // Keep structured JSON fields immutable in this modal to avoid accidental schema-breaking edits.
        persons_involved: incident.persons_involved ?? null,
        injury_details: incident.injury_details ?? null,
        witnesses: incident.witnesses ?? null,
      })

      setOpen(false)
      router.refresh()
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to update incident'
      alert(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Pencil className="h-4 w-4 mr-2" />
          Edit Incident
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[96vw] sm:max-w-[96vw] lg:max-w-[1300px] xl:max-w-[1500px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Incident</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="incident_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="under_investigation">Under Investigation</SelectItem>
                        <SelectItem value="actions_in_progress">Actions In Progress</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
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

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

              <FormField
                control={form.control}
                name="reported_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reported At</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_close_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Close Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="riddor_reportable"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RIDDOR Reportable</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="closed_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Closed At</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assigned_investigator_user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned Investigator ID</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="UUID (optional)" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="closure_summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Closure Summary</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
