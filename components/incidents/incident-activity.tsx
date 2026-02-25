import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'

// Helper to format field names to be more readable
function formatFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    status: 'Status',
    severity: 'Severity',
    summary: 'Summary',
    incident_category: 'Category',
    occurred_at: 'Occurred At',
    reported_at: 'Reported At',
    assigned_investigator_user_id: 'Assigned Investigator',
    title: 'Title',
    description: 'Description',
    priority: 'Priority',
    due_date: 'Due Date',
    completed_at: 'Completed At',
    investigation_type: 'Investigation Type',
    root_cause: 'Root Cause',
    findings: 'Findings',
    recommendations: 'Recommendations',
  }
  return fieldMap[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Helper to check if a string is a UUID
function isUUID(str: any): boolean {
  if (typeof str !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

// Helper to format field values
function formatFieldValue(value: any, fieldName: string, userMap?: Map<string, string | null>): string {
  if (value === null || value === undefined) return '—'
  
  // If this is a user_id field and we have a user map, try to resolve the name
  if (fieldName.includes('_user_id') && userMap && isUUID(value)) {
    const userName = userMap.get(value)
    if (userName) return userName
  }
  
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      return format(new Date(value), 'dd MMM yyyy HH:mm')
    } catch {
      return value
    }
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Helper to get changed fields from details
function getChangedFields(details: any): Array<{ field: string; oldValue: any; newValue: any }> {
  if (!details || !details.old || !details.new) return []
  
  const oldData = details.old as Record<string, any>
  const newData = details.new as Record<string, any>
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = []
  
  // Ignore these fields as they change frequently and aren't meaningful
  const ignoreFields = ['updated_at', 'id']
  
  // Check all fields in new data
  Object.keys(newData).forEach(key => {
    if (ignoreFields.includes(key)) return
    
    const oldVal = oldData[key]
    const newVal = newData[key]
    
    // Compare values (handling null/undefined)
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal })
    }
  })
  
  return changes
}

// Helper to format entity type
function formatEntityType(entityType: string): string {
  const typeMap: Record<string, string> = {
    incident: 'Incident',
    action: 'Action',
    investigation: 'Investigation',
    store: 'Store',
  }
  return typeMap[entityType] || entityType.charAt(0).toUpperCase() + entityType.slice(1)
}

interface IncidentActivityProps {
  activityLog: any[]
  userMap: Map<string, string | null>
  incidentActorOverrideName?: string | null
}

function isStoreManagerLabel(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  return /\s-\smanager$/i.test(value.trim())
}

function resolveActorName(
  activity: any,
  userMap: Map<string, string | null>,
  incidentActorOverrideName?: string | null
): string {
  if (activity?.entity_type === 'incident' && isStoreManagerLabel(incidentActorOverrideName)) {
    return incidentActorOverrideName!.trim()
  }

  const profileName = activity?.performed_by?.full_name
  if (typeof profileName === 'string' && profileName.trim()) {
    return profileName.trim()
  }

  if (isUUID(activity?.performed_by_user_id)) {
    const userName = userMap.get(activity.performed_by_user_id)
    if (userName) return userName
  }

  return 'System'
}

export function IncidentActivity({ activityLog, userMap, incidentActorOverrideName }: IncidentActivityProps) {

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLog.length === 0 ? (
            <p className="text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="space-y-6">
              {activityLog.map((activity) => {
                const changedFields = getChangedFields(activity.details)
                const entityTypeLabel = formatEntityType(activity.entity_type)
                const actorName = resolveActorName(activity, userMap, incidentActorOverrideName)
                
                return (
                  <div key={activity.id} className="relative pl-6 border-l-2 border-slate-200">
                    <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-indigo-500 shadow-sm" />
                    
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              {format(new Date(activity.created_at), 'MMM dd, HH:mm')}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                              {entityTypeLabel}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              activity.action === 'CREATED' ? 'bg-green-100 text-green-700' :
                              activity.action === 'DELETED' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {activity.action}
                            </span>
                          </div>
                          
                          {/* Show changed fields for updates */}
                          {activity.action === 'UPDATED' && changedFields.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {changedFields.slice(0, 10).map((change, idx) => (
                                <div key={idx} className="text-sm">
                                  <span className="font-medium text-slate-700">
                                    {formatFieldName(change.field)}:
                                  </span>
                                  <span className="text-slate-600 ml-2">
                                    <span className="line-through text-red-400 mr-2">
                                      {formatFieldValue(change.oldValue, change.field, userMap)}
                                    </span>
                                    →
                                    <span className="text-green-600 ml-2 font-medium">
                                      {formatFieldValue(change.newValue, change.field, userMap)}
                                    </span>
                                  </span>
                                </div>
                              ))}
                              {changedFields.length > 10 && (
                                <p className="text-xs text-slate-500 italic">
                                  ... and {changedFields.length - 10} more changes
                                </p>
                              )}
                            </div>
                          )}
                          
                          {activity.action === 'CREATED' && (
                            <p className="text-sm text-slate-600 mt-1">
                              {entityTypeLabel} was created
                            </p>
                          )}
                          
                          {activity.action === 'DELETED' && (
                            <p className="text-sm text-slate-600 mt-1">
                              {entityTypeLabel} was deleted
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-200">
                          {(actorName || 'S')[0]}
                        </div>
                        <span>{actorName}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
