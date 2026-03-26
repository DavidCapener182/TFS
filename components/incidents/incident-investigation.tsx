'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InvestigationForm } from './investigation-form'

interface IncidentInvestigationProps {
  incident: any
  investigation: any
  profiles: Array<{ id: string; full_name: string | null }>
}

export function IncidentInvestigation({ incident, investigation, profiles }: IncidentInvestigationProps) {
  const [open, setOpen] = useState(false)

  if (!investigation) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">No investigation has been created yet.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}>
            Create Investigation
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Investigation</DialogTitle>
              </DialogHeader>
              <InvestigationForm
                incidentId={incident.id}
                profiles={profiles}
                defaultLeadInvestigatorUserId={incident.assigned_investigator_user_id}
                onSuccess={() => setOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Investigation Details</CardTitle>
            <StatusBadge status={investigation.status} type="investigation" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Type</div>
              <div>{investigation.investigation_type.split('_').map((w: string) => 
                w.charAt(0).toUpperCase() + w.slice(1)
              ).join(' ')}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Lead Investigator</div>
              <div>{investigation.lead_investigator?.full_name || 'Unknown'}</div>
            </div>
            {investigation.started_at && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Started At</div>
                <div>{format(new Date(investigation.started_at), 'dd MMM yyyy HH:mm')}</div>
              </div>
            )}
            {investigation.completed_at && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Completed At</div>
                <div>{format(new Date(investigation.completed_at), 'dd MMM yyyy HH:mm')}</div>
              </div>
            )}
          </div>

          {investigation.root_cause && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Root Cause</div>
              <p className="whitespace-pre-wrap">{investigation.root_cause}</p>
            </div>
          )}

          {investigation.contributing_factors && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Contributing Factors</div>
              <p className="whitespace-pre-wrap">{investigation.contributing_factors}</p>
            </div>
          )}

          {investigation.findings && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Findings</div>
              <p className="whitespace-pre-wrap">{investigation.findings}</p>
            </div>
          )}

          {investigation.recommendations && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Recommendations</div>
              <p className="whitespace-pre-wrap">{investigation.recommendations}</p>
            </div>
          )}

          <Button onClick={() => setOpen(true)}>Edit Investigation</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Investigation</DialogTitle>
              </DialogHeader>
              <InvestigationForm
                incidentId={incident.id}
                investigation={investigation}
                profiles={profiles}
                defaultLeadInvestigatorUserId={incident.assigned_investigator_user_id}
                onSuccess={() => setOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}

