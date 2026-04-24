import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { FaIncidentStatus, FaActionStatus, FaSeverity, FaInvestigationStatus } from '@/types/db'

interface StatusBadgeProps {
  status: FaIncidentStatus | FaActionStatus | FaSeverity | FaInvestigationStatus | string | null | undefined
  type?: 'incident' | 'action' | 'severity' | 'investigation'
}

const statusColors: Record<string, string> = {
  // Incident statuses
  open: 'info',
  under_investigation: 'warning',
  actions_in_progress: 'warning',
  closed: 'success',
  cancelled: 'secondary',
  
  // Action statuses
  in_progress: 'warning',
  blocked: 'critical',
  complete: 'success',
  
  // Severity
  low: 'secondary',
  medium: 'warning',
  high: 'warning',
  critical: 'critical',
  
  // Investigation statuses
  not_started: 'secondary',
  awaiting_actions: 'warning',
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const normalizedStatus = String(status || 'unknown').trim().toLowerCase()
  const variant = statusColors[normalizedStatus] || 'secondary'
  const displayText = normalizedStatus.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')

  return (
    <Badge variant={variant as any} className={cn('shadow-none normal-case tracking-normal')}>
      {displayText}
    </Badge>
  )
}
