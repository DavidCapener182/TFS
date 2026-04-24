'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { DeleteIncidentButton } from '@/components/shared/delete-incident-button'
import { Eye, MapPin } from 'lucide-react'
import { buildVisitReportPdfUrl, extractLinkedVisitReportId, getIncidentPersonLabel } from '@/lib/incidents/incident-utils'
import { format } from 'date-fns'
import { Card } from '@/components/ui/card'
import { formatStoreName } from '@/lib/store-display'

interface ClosedIncidentMobileCardProps {
  incident: any
  referenceLabel?: string
}

function formatCompactDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return format(parsed, 'dd MMM')
}

export function ClosedIncidentMobileCard({ incident, referenceLabel }: ClosedIncidentMobileCardProps) {
  const refText = referenceLabel ?? incident.reference_no
  const category = incident.incident_category?.split('_').map((w: string) => 
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ') || 'Uncategorized'
  const personMeta = incident?.persons_involved && typeof incident.persons_involved === 'object'
    ? incident.persons_involved
    : {}
  const personType = getIncidentPersonLabel(incident, incident?.incident_category)
  const childInvolved = Boolean(personMeta.child_involved ?? personMeta.childInvolved)
  const linkedVisitReportId = extractLinkedVisitReportId(incident)

  return (
    <Card className="relative p-3 hover:shadow-sm transition-shadow border-slate-200 bg-slate-50/30">
      <div className="flex flex-col gap-2.5">
        
        {/* Top Row: Identity & Actions */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5 min-w-0 pr-2">
            <Link href={`/incidents/${incident.id}`} className="block">
              <span className="font-mono text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                {refText}
              </span>
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
               <MapPin className="h-3 w-3 flex-shrink-0 text-slate-400" />
               <span className="truncate font-medium text-slate-700">
                 {formatStoreName(incident.tfs_stores?.store_name) || 'Unknown Store'}
               </span>
            </div>
          </div>

          <div className="flex items-center gap-0.5 -mr-1 -mt-1">
            <Link href={`/incidents/${incident.id}`}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                <Eye className="h-4 w-4" />
                <span className="sr-only">View</span>
              </Button>
            </Link>
            <div className="scale-90">
                <DeleteIncidentButton incidentId={incident.id} referenceNo={refText} />
            </div>
          </div>
        </div>

        {/* Middle Row: Badges & Date */}
        <div className="flex items-center justify-between gap-3">
           <div className="flex items-center gap-2 overflow-hidden">
              <StatusBadge status={incident.severity} type="severity" />
           </div>
           <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
             {formatCompactDate(incident.closed_at)}
           </span>
        </div>

        {/* Bottom Row: Footer Info */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 mt-0.5">
           <div className="flex min-w-0 flex-col gap-1">
             <span className="text-xs text-slate-600 font-medium truncate">
               {category}
             </span>
             <div className="flex items-center gap-1.5">
               <Badge variant="outline" className="px-2 py-0 text-[10px]">{personType}</Badge>
             </div>
           </div>

           <details className="group shrink-0 text-right">
             <summary className="list-none text-[11px] font-semibold text-slate-500">
               Details
             </summary>
             <div className="absolute right-4 z-10 mt-2 w-[min(260px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
               <div className="flex flex-wrap gap-1.5">
                 {incident.riddor_reportable ? (
                   <Badge variant="destructive" className="px-2 py-0 text-[10px]">RIDDOR</Badge>
                 ) : null}
                 {linkedVisitReportId ? (
                   <Link href={buildVisitReportPdfUrl(linkedVisitReportId)} target="_blank">
                     <Badge variant="outline" className="px-2 py-0 text-[10px] border-indigo-200 text-indigo-700">
                       PDF
                     </Badge>
                   </Link>
                 ) : null}
                 {childInvolved ? (
                   <Badge variant="outline" className="px-2 py-0 text-[10px] border-amber-300 text-amber-700">Child</Badge>
                 ) : null}
                 {!incident.riddor_reportable && !linkedVisitReportId && !childInvolved ? (
                   <span className="text-xs text-slate-500">No additional flags</span>
                 ) : null}
               </div>
               <div className="mt-2 text-xs text-slate-500">
                 Investigator: <span className="font-medium text-slate-700">{incident.investigator?.full_name || 'Unassigned'}</span>
               </div>
             </div>
           </details>
        </div>

      </div>
    </Card>
  )
}
