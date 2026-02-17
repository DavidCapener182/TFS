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
  incident_category: z.enum(['accident', 'near_miss', 'security', 'fire', 'health_safety', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['open', 'under_investigation', 'actions_in_progress']),
  summary: z.string().min(1, 'Summary is required'),
  description: z.string().optional(),
  occurred_at: z.string().min(1, 'Occurred date is required'),
  riddor_reportable: z.enum(['yes', 'no']),
  target_close_date: z.string().optional(),
  persons_involved_json: z.string().optional(),
  injury_details_json: z.string().optional(),
  witnesses_json: z.string().optional(),
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

function toPrettyJson(value: unknown) {
  if (!value) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

function parseOptionalJson(raw: string | undefined, fieldName: string) {
  const trimmed = raw?.trim() || ''
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error(`${fieldName} must be valid JSON`)
  }
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
      status: incident.status === 'closed' ? 'actions_in_progress' : incident.status,
      summary: incident.summary || '',
      description: incident.description || '',
      occurred_at: toLocalDateTimeInput(incident.occurred_at),
      riddor_reportable: incident.riddor_reportable ? 'yes' : 'no',
      target_close_date: incident.target_close_date || '',
      persons_involved_json: toPrettyJson(incident.persons_involved),
      injury_details_json: toPrettyJson(incident.injury_details),
      witnesses_json: toPrettyJson(incident.witnesses),
    },
  })

  const onSubmit = async (values: EditIncidentFormValues) => {
    setIsSaving(true)
    try {
      const personsInvolved = parseOptionalJson(values.persons_involved_json, 'Persons involved')
      const injuryDetails = parseOptionalJson(values.injury_details_json, 'Injury details')
      const witnesses = parseOptionalJson(values.witnesses_json, 'Witness statements')

      await updateIncident(incident.id, {
        incident_category: values.incident_category,
        severity: values.severity,
        status: values.status,
        summary: values.summary.trim(),
        description: values.description?.trim() || '',
        occurred_at: new Date(values.occurred_at).toISOString(),
        riddor_reportable: values.riddor_reportable === 'yes',
        target_close_date: values.target_close_date || null,
        persons_involved: personsInvolved,
        injury_details: injuryDetails,
        witnesses,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Incident</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <FormField
              control={form.control}
              name="persons_involved_json"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Persons Involved (JSON)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} className="font-mono text-xs" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="injury_details_json"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Injury Details (JSON)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} className="font-mono text-xs" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="witnesses_json"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Witness Statements (JSON)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} className="font-mono text-xs" />
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
