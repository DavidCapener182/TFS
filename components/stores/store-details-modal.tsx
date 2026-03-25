'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { format } from 'date-fns'
import { MapPin, Building2, Award, AlertTriangle, CheckCircle2, Clock, CalendarDays, Navigation } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getStoreActionListTitle } from '@/components/shared/store-action-title'
import { getInternalAreaDisplayName, getReportingAreaDisplayName } from '@/lib/areas'
import { formatStoreName } from '@/lib/store-display'
import { formatPercent, getDisplayStoreCode } from '@/lib/utils'

interface StoreDetailsModalProps {
  store: any
  incidents: any[]
  actions: any[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StoreDetailsModal({ store, incidents, actions, open, onOpenChange }: StoreDetailsModalProps) {
  // Separate incidents by status
  const ongoingIncidents = incidents?.filter((i: any) => !['closed', 'cancelled'].includes(i.status)) || []
  const completedIncidents = incidents?.filter((i: any) => i.status === 'closed') || []
  
  // Separate actions by status
  const ongoingActions = actions?.filter((a: any) => !['complete', 'cancelled'].includes(a.status)) || []
  const completedActions = actions?.filter((a: any) => a.status === 'complete') || []

  const isStoreTaskAction = (action: any) => action?.source_type === 'store'
  const getActionTitle = (action: any) => (isStoreTaskAction(action) ? getStoreActionListTitle(action) : action.title)
  const getActionDueLabel = (action: any) =>
    action?.due_date ? format(new Date(action.due_date), 'MMM d, yyyy') : '—'
  
  // Calculate average compliance score
  const complianceScores = [
    store.compliance_audit_1_overall_pct,
    store.compliance_audit_2_overall_pct,
    store.compliance_audit_3_overall_pct,
  ].filter((score): score is number => score !== null && score !== undefined)
  
  const averageCompliance = complianceScores.length > 0
    ? complianceScores.reduce((sum, score) => sum + score, 0) / complianceScores.length
    : null
  
  // Helper for score color
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600'
    if (score >= 80) return 'text-amber-600'
    return 'text-rose-600'
  }

  // Build address string for map
  const addressParts = [
    store.address_line_1,
    store.city,
    store.postcode,
  ].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  
  // Google Maps embed URL (no API key required)
  const googleMapsEmbedUrl = fullAddress
    ? `https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`
    : null

  // Navigation handler - opens in Apple Maps on iOS, Google Maps otherwise
  const handleNavigate = () => {
    if (!fullAddress) return
    
    // Detect iOS devices
    const isIOS = typeof window !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
    
    if (isIOS) {
      // Apple Maps URL - try native app first, fallback to web
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`
      window.open(appleMapsUrl, '_blank')
    } else {
      // Google Maps navigation URL
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
      window.open(googleMapsUrl, '_blank')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl md:max-w-8xl max-h-[90vh] overflow-y-auto p-0 gap-0 bg-white [&>button]:z-20 [&>button]:top-3 [&>button]:right-3">
        <DialogHeader className="p-4 md:p-6 bg-white border-b sticky top-0 z-10 relative safe-top">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 pr-10 md:pr-0">
              <DialogTitle className="text-xl md:text-2xl font-bold text-slate-900 text-center md:text-left break-words">{formatStoreName(store.store_name)}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center justify-center md:justify-start gap-2 flex-wrap">
                <Badge variant="outline" className="font-mono text-xs bg-slate-50">
                  {getDisplayStoreCode(store.store_code) || '—'}
                </Badge>
                {store.region && (
                  <span className="text-xs md:text-sm text-slate-500 flex items-center gap-1">
                    • <MapPin className="h-3 w-3" /> {getInternalAreaDisplayName(store.region, { fallback: store.region, includeCode: false })}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 md:p-6 space-y-4 md:space-y-6 safe-bottom">
          {/* Location Details with Map Below */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-500" />
                Location Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Address</p>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 min-w-[16px]">
                    <MapPin className="h-4 w-4 text-slate-400" />
                  </div>
                  <div>
                    {store.address_line_1 && <p className="text-sm text-slate-700 font-medium">{store.address_line_1}</p>}
                    {(store.city || store.postcode) && (
                      <p className="text-sm text-slate-600">
                        {store.city}
                        {store.city && store.postcode && ', '}
                        {store.postcode}
                      </p>
                    )}
                    {!fullAddress && <p className="text-sm text-slate-400 italic">No address on file</p>}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {store.region && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Region</p>
                    <p className="text-sm text-slate-700">
                      {getInternalAreaDisplayName(store.region, { fallback: store.region, includeCode: false })}
                    </p>
                  </div>
                )}
                {store.reporting_area && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reporting Area</p>
                    <p className="text-sm text-slate-700">
                      {getReportingAreaDisplayName(store.reporting_area, 'Unassigned')}
                    </p>
                  </div>
                )}
                {store.city && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">City</p>
                    <p className="text-sm text-slate-700">{store.city}</p>
                  </div>
                )}
              </div>

              {/* Map Preview - Below Address */}
              <div className="mt-4 -mx-4 md:-mx-6">
                <div className="bg-slate-100 relative min-h-[300px] md:min-h-[400px]">
                  {googleMapsEmbedUrl ? (
                    <iframe
                      src={googleMapsEmbedUrl}
                      width="100%"
                      height="100%"
                      style={{ border: 0, minHeight: '300px' }}
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="absolute inset-0 w-full h-full"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                      <MapPin className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-sm">No map data available</p>
                    </div>
                  )}
                  {fullAddress && (
                    <div className="absolute top-2 right-2 md:top-3 md:right-3 z-10">
                      <Button
                        onClick={handleNavigate}
                        size="sm"
                        className="bg-white hover:bg-slate-50 text-slate-900 shadow-md border border-slate-200 text-xs md:text-sm min-h-[44px] md:min-h-0 px-2 md:px-3"
                      >
                        <Navigation className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                        <span className="hidden sm:inline">Navigate to Store</span>
                        <span className="sm:hidden">Navigate</span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance Scores */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-500" />
                Audit Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 md:pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                {[1, 2, 3].map((num) => {
                  const score = store[`compliance_audit_${num}_overall_pct`]
                  const date = store[`compliance_audit_${num}_date`]
                  
                  if (score === null || score === undefined) return null

                  return (
                    <div key={num} className="flex flex-col">
                      <span className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Audit {num}</span>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl md:text-3xl font-bold ${getScoreColor(score)}`}>
                          {formatPercent(score)}
                        </span>
                      </div>
                      {date && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] md:text-xs text-slate-400">
                          <CalendarDays className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{format(new Date(date), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                
                {averageCompliance !== null && (
                  <div className="flex flex-col border-l border-slate-200 pl-3 md:pl-6">
                    <span className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Avg Score</span>
                    <span className={`text-xl md:text-3xl font-bold ${getScoreColor(averageCompliance)}`}>
                      {formatPercent(averageCompliance)}
                    </span>
                    <span className="text-[10px] md:text-xs text-slate-400 mt-1">FY To Date</span>
                  </div>
                )}
                
                {complianceScores.length === 0 && (
                  <div className="col-span-3 md:col-span-4 py-2 text-center text-xs md:text-sm text-slate-500 italic">
                    No compliance audit data available for this fiscal year.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Incidents and Actions Tabs */}
          <Tabs defaultValue="incidents" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-[400px] mx-auto min-h-[44px]">
              <TabsTrigger value="incidents" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Incidents 
                <Badge variant="secondary" className="ml-1 px-1.5 h-5 min-w-[20px]">{incidents?.length || 0}</Badge>
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Actions
                <Badge variant="secondary" className="ml-1 px-1.5 h-5 min-w-[20px]">{actions?.length || 0}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="incidents" className="space-y-4 mt-6">
              {/* Ongoing Incidents Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  Open Cases
                </h4>
                {ongoingIncidents.length > 0 ? (
                  <div className="grid gap-3">
                    {ongoingIncidents.map((incident: any) => (
                      <Link key={incident.id} href={`/incidents/${incident.id}`} className="block group">
                        <div className="bg-white border border-slate-200 rounded-lg p-4 hover:border-orange-300 hover:shadow-sm transition-all">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-xs font-medium bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                  {incident.reference_no}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {format(new Date(incident.occurred_at), 'MMM d, yyyy')}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-900 group-hover:text-orange-700 transition-colors line-clamp-1">
                                {incident.summary}
                              </p>
                            </div>
                            <Badge variant="outline" className="capitalize bg-orange-50 text-orange-700 border-orange-200">
                              {incident.status.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic bg-slate-50 p-4 rounded-lg border border-dashed border-slate-200 text-center">
                    No open incidents.
                  </div>
                )}
              </div>

              {/* Completed Incidents Section */}
              {completedIncidents.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    Closed History
                  </h4>
                  <div className="grid gap-2">
                    {completedIncidents.map((incident: any) => (
                      <Link key={incident.id} href={`/incidents/${incident.id}`} className="block group">
                        <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-3 hover:bg-white hover:border-slate-300 transition-all opacity-80 hover:opacity-100">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <div>
                                <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                                  {incident.summary}
                                </p>
                                <p className="text-xs text-slate-400">
                                  Closed {incident.closed_at ? format(new Date(incident.closed_at), 'MMM d, yyyy') : ''}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-mono text-slate-400">{incident.reference_no}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="actions" className="space-y-4 mt-6">
              {/* Ongoing Actions */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  Pending Actions
                </h4>
                {ongoingActions.length > 0 ? (
                  <div className="grid gap-3">
                    {ongoingActions.map((action: any) => {
                      const isStoreTask = isStoreTaskAction(action)
                      const card = (
                        <div className="bg-white border border-slate-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-sm font-medium text-slate-900 group-hover:text-blue-700 transition-colors">
                              {getActionTitle(action)}
                            </p>
                            <Badge variant="outline" className="capitalize bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap ml-2">
                              {String(action.status || 'open').replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Due: {getActionDueLabel(action)}
                            </span>
                            {isStoreTask ? (
                              <span className="text-slate-400">Store task</span>
                            ) : action.incident?.reference_no ? (
                              <span className="text-slate-400">Ref: {action.incident.reference_no}</span>
                            ) : null}
                          </div>
                        </div>
                      )

                      if (isStoreTask || !action.incident_id) {
                        return (
                          <div key={action.id} className="block group">
                            {card}
                          </div>
                        )
                      }

                      return (
                        <Link key={action.id} href={`/incidents/${action.incident_id}`} className="block group">
                          {card}
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic bg-slate-50 p-4 rounded-lg border border-dashed border-slate-200 text-center">
                    No pending actions.
                  </div>
                )}
              </div>

              {/* Completed Actions */}
              {completedActions.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-slate-400" />
                    Completed
                  </h4>
                  <div className="grid gap-2">
                    {completedActions.map((action: any) => {
                      const isStoreTask = isStoreTaskAction(action)
                      const card = (
                        <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-3 hover:bg-white hover:border-slate-300 transition-all opacity-75 hover:opacity-100">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <CheckCircle2 className="h-4 w-4 text-slate-400 group-hover:text-green-600 transition-colors" />
                              <p className="text-sm font-medium text-slate-600 group-hover:text-slate-900 decoration-slate-400 group-hover:decoration-transparent transition-all">
                                {getActionTitle(action)}
                              </p>
                            </div>
                            <span className="text-xs text-slate-400">
                              {action.completed_at ? format(new Date(action.completed_at), 'MMM d') : 'Done'}
                            </span>
                          </div>
                        </div>
                      )

                      if (isStoreTask || !action.incident_id) {
                        return (
                          <div key={action.id} className="block group">
                            {card}
                          </div>
                        )
                      }

                      return (
                        <Link key={action.id} href={`/incidents/${action.incident_id}`} className="block group">
                          {card}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
