'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { DeleteIncidentButton } from '@/components/shared/delete-incident-button'
import { Eye, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { Card } from '@/components/ui/card'

interface IncidentMobileCardProps {
  incident: any
}

export function IncidentMobileCard({ incident }: IncidentMobileCardProps) {
  const category = incident.incident_category?.split('_').map((w: string) => 
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ') || 'Uncategorized'
  const personMeta = incident?.persons_involved && typeof incident.persons_involved === 'object'
    ? incident.persons_involved
    : {}
  const personType = personMeta.person_type || personMeta.personType || 'Unknown'
  const childInvolved = Boolean(personMeta.child_involved ?? personMeta.childInvolved)

  return (
    <Card className="p-3 hover:shadow-sm transition-shadow border-slate-200">
      <div className="flex flex-col gap-2.5">
        
        {/* Top Row: Identity & Actions */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5 min-w-0 pr-2">
            <Link href={`/incidents/${incident.id}`} className="block">
              <span className="font-mono text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                {incident.reference_no}
              </span>
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
               <MapPin className="h-3 w-3 flex-shrink-0 text-slate-400" />
               <span className="truncate font-medium text-slate-700">
                 {incident.fa_stores?.store_name || 'Unknown Store'}
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
                <DeleteIncidentButton incidentId={incident.id} referenceNo={incident.reference_no} />
            </div>
          </div>
        </div>

        {/* Middle Row: Badges & Date */}
        <div className="flex items-center justify-between gap-3">
           <div className="flex items-center gap-2 overflow-hidden">
              <StatusBadge status={incident.severity} type="severity" />
              <StatusBadge status={incident.status} type="incident" />
           </div>
           <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
             {format(new Date(incident.occurred_at), 'dd MMM')}
           </span>
        </div>

        {/* Bottom Row: Footer Info */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-50 mt-0.5">
           <div className="flex flex-col gap-1 max-w-[60%]">
             <span className="text-xs text-slate-600 font-medium truncate">
               {category}
             </span>
             <div className="flex items-center gap-1.5 flex-wrap">
               <Badge variant="outline" className="px-2 py-0 text-[10px]">{personType}</Badge>
               {incident.riddor_reportable ? (
                 <Badge variant="destructive" className="px-2 py-0 text-[10px]">RIDDOR</Badge>
               ) : null}
               {childInvolved ? (
                 <Badge variant="outline" className="px-2 py-0 text-[10px] border-amber-300 text-amber-700">Child</Badge>
               ) : null}
             </div>
           </div>
           
           <div className="flex items-center gap-1.5 max-w-[40%] justify-end">
              {incident.investigator?.full_name ? (
                <div className="flex items-center gap-1.5" title={`Investigator: ${incident.investigator.full_name}`}>
                   <span className="text-[10px] text-slate-400 truncate hidden sm:inline-block max-w-[80px]">
                     {incident.investigator.full_name.split(' ')[0]}
                   </span>
                   <div className="h-5 w-5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center text-[8px] font-bold flex-shrink-0">
                     {incident.investigator.full_name
                       .split(' ')
                       .map((name: string) => name[0])
                       .join('')
                       .toUpperCase()
                       .slice(0, 2)}
                   </div>
                </div>
              ) : (
                <span className="text-[10px] text-slate-400 italic">Unassigned</span>
              )}
           </div>
        </div>

      </div>
    </Card>
  )
}
