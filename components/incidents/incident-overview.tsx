'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
// import { StatusBadge } from '@/components/shared/status-badge'
import { AssignInvestigator } from './assign-investigator'
import { format } from 'date-fns'
import { 
  MapPin, 
  Calendar, 
  Clock, 
  User, 
  FileText, 
  AlertTriangle, 
  Users, 
  Activity, 
  Eye, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { formatStoreName } from '@/lib/store-display'

// --- MOCK COMPONENT (Delete in production) ---
const StatusBadge = ({ status, type }: { status: string, type: 'severity' | 'incident' }) => {
  const styles: any = {
    severity: {
      critical: 'bg-red-50 text-red-700 border-red-200',
      high: 'bg-orange-50 text-orange-700 border-orange-200',
      medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      low: 'bg-green-50 text-green-700 border-green-200',
    },
    incident: {
      open: 'bg-blue-50 text-blue-700 border-blue-200',
      closed: 'bg-slate-100 text-slate-700 border-slate-200',
      investigating: 'bg-purple-50 text-purple-700 border-purple-200',
    }
  };
  const category = styles[type] || {};
  const className = category[status?.toLowerCase()] || 'bg-gray-100 text-gray-700 border-gray-200';
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className} capitalize`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
};
// ---------------------------------------------

interface IncidentOverviewProps {
  incident: any
  profiles?: Array<{ id: string; full_name: string | null }>
}

function DetailRow({ icon: Icon, label, value, subValue }: { icon: any, label: string, value: React.ReactNode, subValue?: string }) {
  return (
    <div className="flex items-start gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg hover:bg-slate-50 transition-colors">
      <div className="mt-0.5 p-1.5 md:p-2 bg-white border border-slate-100 rounded-md shadow-sm text-slate-500 flex-shrink-0">
        <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <div className="text-xs md:text-sm font-medium text-slate-900 mt-0.5 truncate">{value}</div>
        {subValue && <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">{subValue}</p>}
      </div>
    </div>
  )
}

export function IncidentOverview({ incident, profiles = [] }: IncidentOverviewProps) {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* RIDDOR Alert */}
      {incident.riddor_reportable && (
        <div className="rounded-lg border-l-4 border-red-600 bg-red-50 p-4 shadow-sm flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
                <h3 className="text-sm font-bold text-red-900">RIDDOR Reportable Incident</h3>
                <p className="text-sm text-red-700 mt-1">
                    This incident meets the criteria for Reporting of Injuries, Diseases and Dangerous Occurrences Regulations. Ensure external reporting is completed within the required timeframe.
                </p>
            </div>
        </div>
      )}

      {/* Main Stats Grid - Bento Layout on Mobile */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 auto-rows-auto">
        {/* Status Card */}
        <Card className="shadow-sm border-slate-200">
            <CardContent className="p-3 md:p-4 flex flex-col justify-between h-full">
                <span className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Current Status</span>
                <div className="flex items-center justify-between">
                    <StatusBadge status={incident.status} type="incident" />
                    {incident.closed_at && <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5 text-slate-300" />}
                </div>
            </CardContent>
        </Card>

        {/* Severity Card */}
        <Card className="shadow-sm border-slate-200">
            <CardContent className="p-3 md:p-4 flex flex-col justify-between h-full">
                <span className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Severity Level</span>
                <div className="flex items-center justify-between">
                    <StatusBadge status={incident.severity} type="severity" />
                    <Activity className="h-4 w-4 md:h-5 md:w-5 text-slate-300" />
                </div>
            </CardContent>
        </Card>

        {/* Location Card - Spans full width on mobile */}
        <Card className="shadow-sm border-slate-200 col-span-2 md:col-span-2 lg:col-span-2">
            <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 bg-indigo-50 text-indigo-600 rounded-lg flex-shrink-0">
                    <MapPin className="h-5 w-5 md:h-6 md:w-6" />
                </div>
                <div className="min-w-0 flex-1">
                    <span className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</span>
                    <p className="text-base md:text-lg font-bold text-slate-900 truncate">{formatStoreName(incident.tfs_stores?.store_name) || 'Unknown Store'}</p>
                    {incident.tfs_stores?.store_code && (
                        <p className="text-xs md:text-sm text-slate-500">Store Code: <span className="font-mono text-slate-700">{incident.tfs_stores.store_code}</span></p>
                    )}
                </div>
            </CardContent>
        </Card>
      </div>

      {/* Bento Grid Layout on Mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 auto-rows-auto">
            
            {/* Description Panel - Full width on mobile */}
            <Card className="shadow-sm border-slate-200 col-span-2 lg:col-span-2">
                <CardHeader className="pb-3 border-b bg-slate-50/50 px-4 md:px-6 pt-4 md:pt-6">
                    <CardTitle className="text-sm md:text-base font-semibold text-slate-800 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        <span>Incident Description</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {incident.description || <span className="italic text-slate-400">No description provided.</span>}
                    </p>
                </CardContent>
            </Card>

            {/* Details Grid - Full width on mobile, spans 2 cols on desktop */}
            <Card className="shadow-sm border-slate-200 col-span-2 lg:col-span-2">
                 <CardHeader className="pb-3 border-b bg-slate-50/50 px-4 md:px-6 pt-4 md:pt-6">
                    <CardTitle className="text-sm md:text-base font-semibold text-slate-800">Operational Details</CardTitle>
                </CardHeader>
                <CardContent className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <DetailRow 
                        icon={AlertCircle} 
                        label="Category" 
                        value={incident.incident_category.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} 
                    />
                    <DetailRow 
                        icon={Calendar} 
                        label="Occurred At" 
                        value={format(new Date(incident.occurred_at), 'dd MMM yyyy')}
                        subValue={format(new Date(incident.occurred_at), 'HH:mm')}
                    />
                    <DetailRow 
                        icon={Clock} 
                        label="Reported At" 
                        value={format(new Date(incident.reported_at), 'dd MMM yyyy')}
                        subValue={format(new Date(incident.reported_at), 'HH:mm')}
                    />
                    <DetailRow 
                        icon={User} 
                        label="Reported By" 
                        value={incident.reporter?.full_name || 'Unknown'} 
                    />
                     <div className="flex items-start gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg hover:bg-slate-50 transition-colors col-span-1 sm:col-span-2">
                        <div className="mt-0.5 p-1.5 md:p-2 bg-white border border-slate-100 rounded-md shadow-sm text-slate-500 flex-shrink-0">
                          <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Assigned Investigator</p>
                          {profiles.length > 0 ? (
                            <AssignInvestigator 
                              incidentId={incident.id} 
                              currentInvestigatorId={incident.assigned_investigator_user_id}
                              profiles={profiles}
                            />
                          ) : (
                            <div className="text-xs md:text-sm font-medium text-slate-900">
                              {incident.investigator?.full_name || 'Unassigned'}
                            </div>
                          )}
                        </div>
                     </div>
                </CardContent>
            </Card>

             {/* Closure Summary (if closed) - Full width */}
             {incident.closure_summary && (
                <Card className="shadow-sm border-emerald-100 bg-emerald-50/10 col-span-2 lg:col-span-3">
                    <CardHeader className="pb-3 border-b border-emerald-100 bg-emerald-50/30 px-4 md:px-6 pt-4 md:pt-6">
                        <CardTitle className="text-sm md:text-base font-semibold text-emerald-800 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                            Resolution & Closure
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6">
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {incident.closure_summary}
                        </p>
                        {incident.closed_at && (
                            <div className="mt-4 pt-4 border-t border-emerald-100 flex items-center gap-2 text-xs text-emerald-700 font-medium">
                                <Clock className="h-3.5 w-3.5" />
                                Case Closed on {format(new Date(incident.closed_at), 'dd MMM yyyy HH:mm')}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

             {/* Persons Involved - Takes 1 column on mobile, full width on desktop */}
             <Card className="shadow-sm border-slate-200 col-span-1 lg:col-span-1">
                <CardHeader className="pb-3 border-b bg-slate-50/50 px-4 md:px-6 pt-4 md:pt-6">
                    <CardTitle className="text-xs md:text-sm font-semibold text-slate-800 flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-slate-500 flex-shrink-0" />
                        <span className="truncate">Persons Involved</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {incident.persons_involved ? (
                        <div className="bg-slate-50 p-3 md:p-4 overflow-x-auto">
                            <pre className="text-[10px] md:text-xs text-slate-600 font-mono">
                                {JSON.stringify(incident.persons_involved, null, 2)}
                            </pre>
                        </div>
                    ) : (
                        <div className="p-4 md:p-6 text-center text-xs md:text-sm text-slate-400 italic">No persons recorded</div>
                    )}
                </CardContent>
            </Card>

            {/* Injury Details */}
            {incident.injury_details && (
                 <Card className="shadow-sm border-slate-200 col-span-1 lg:col-span-1">
                    <CardHeader className="pb-3 border-b bg-slate-50/50 px-4 md:px-6 pt-4 md:pt-6">
                        <CardTitle className="text-xs md:text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <Activity className="h-3.5 w-3.5 md:h-4 md:w-4 text-slate-500 flex-shrink-0" />
                            <span className="truncate">Injury Details</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="bg-slate-50 p-3 md:p-4 overflow-x-auto">
                            <pre className="text-[10px] md:text-xs text-slate-600 font-mono">
                                {JSON.stringify(incident.injury_details, null, 2)}
                            </pre>
                        </div>
                    </CardContent>
                </Card>
            )}

             {/* Witnesses */}
             {incident.witnesses && (
                 <Card className="shadow-sm border-slate-200 col-span-2 lg:col-span-1">
                    <CardHeader className="pb-3 border-b bg-slate-50/50 px-4 md:px-6 pt-4 md:pt-6">
                        <CardTitle className="text-xs md:text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <Eye className="h-3.5 w-3.5 md:h-4 md:w-4 text-slate-500 flex-shrink-0" />
                            <span>Witness Statements</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="bg-slate-50 p-3 md:p-4 overflow-x-auto">
                            <pre className="text-[10px] md:text-xs text-slate-600 font-mono">
                                {JSON.stringify(incident.witnesses, null, 2)}
                            </pre>
                        </div>
                    </CardContent>
                </Card>
            )}
      </div>
    </div>
  )
}