import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { FaIncidentStatus, FaActionStatus, FaSeverity, FaInvestigationStatus } from '@/types/db'

interface StatusBadgeProps {
  status: FaIncidentStatus | FaActionStatus | FaSeverity | FaInvestigationStatus | string | null | undefined
  type?: 'incident' | 'action' | 'severity' | 'investigation'
}

const statusColors: Record<string, string> = {
  // Incident statuses
  open: 'bg-blue-50 text-blue-700',
  under_investigation: 'bg-yellow-50 text-yellow-700',
  actions_in_progress: 'bg-orange-50 text-orange-700',
  closed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-700',
  
  // Action statuses
  in_progress: 'bg-yellow-50 text-yellow-700',
  blocked: 'bg-red-50 text-red-700',
  complete: 'bg-emerald-50 text-emerald-700',
  
  // Severity
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-50 text-yellow-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
  
  // Investigation statuses
  not_started: 'bg-gray-100 text-gray-700',
  awaiting_actions: 'bg-orange-50 text-orange-700',
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const normalizedStatus = String(status || 'unknown').trim().toLowerCase()
  const colorClass = statusColors[normalizedStatus] || 'bg-gray-100 text-gray-700'
  const displayText = normalizedStatus.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')

  return (
    <Badge variant="default" className={cn('rounded-full shadow-sm', colorClass)}>
      {displayText}
    </Badge>
  )
}

