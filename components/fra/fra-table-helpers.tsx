import { Badge } from '@/components/ui/badge'
import { cn, formatAppDate, formatPercent } from '@/lib/utils'

/**
 * Render a percentage badge (similar to audit table)
 */
export function pctBadge(value: number | null) {
  if (value === null || value === undefined || isNaN(value)) {
    return <span className="text-xs text-slate-400">—</span>
  }
  const pct = Number(value)
  const tone =
    pct >= 90 ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
    pct >= 80 ? 'bg-amber-50 text-amber-800 border-amber-300' :
    'bg-rose-50 text-rose-800 border-rose-300'
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-6 rounded-full border px-2.5 font-mono text-[11px] font-semibold tabular-nums leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]',
        tone
      )}
    >
      {formatPercent(pct)}
    </Badge>
  )
}

export interface FRARow {
  id: string
  region: string | null
  store_code: string | null
  store_name: string
  is_active: boolean
  compliance_audit_1_date: string | null
  compliance_audit_2_date: string | null
  fire_risk_assessment_date: string | null
  fire_risk_assessment_pdf_path: string | null
  fire_risk_assessment_notes: string | null
  fire_risk_assessment_pct: number | null
  fire_risk_assessment_rating?: string | null
}

export type FRAStatus = 'up_to_date' | 'due' | 'overdue' | 'not_required' | 'required'
const FRA_DUE_WINDOW_DAYS = 20

/**
 * Calculate the next FRA due date (12 months from last FRA date)
 */
export function calculateNextDueDate(fraDate: string | null): Date | null {
  if (!fraDate) return null
  
  const date = new Date(fraDate)
  const nextDue = new Date(date)
  nextDue.setMonth(nextDue.getMonth() + 12)
  return nextDue
}

/**
 * Get the FRA status based on the last FRA date
 */
export function getFRAStatus(fraDate: string | null, needsFRA: boolean): FRAStatus {
  if (!needsFRA) return 'not_required'
  if (!fraDate) return 'required'
  
  const nextDue = calculateNextDueDate(fraDate)
  if (!nextDue) return 'required'
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(nextDue)
  dueDate.setHours(0, 0, 0, 0)
  
  const daysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  
  if (daysDiff < 0) return 'overdue'
  if (daysDiff <= FRA_DUE_WINDOW_DAYS) return 'due'
  return 'up_to_date'
}

/**
 * Get days until due (positive) or days overdue (negative)
 */
export function getDaysUntilDue(fraDate: string | null): number | null {
  if (!fraDate) return null
  
  const nextDue = calculateNextDueDate(fraDate)
  if (!nextDue) return null
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(nextDue)
  dueDate.setHours(0, 0, 0, 0)
  
  return Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Format a date string to UK format
 */
export function formatDate(value: string | null): string {
  if (!value) return '—'
  return formatAppDate(value)
}

/**
 * Render a status badge for FRA status
 */
export function statusBadge(status: FRAStatus, days: number | null) {
  const baseClass =
    'h-6 rounded-full border px-2.5 text-[11px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]'

  switch (status) {
    case 'up_to_date':
      return (
        <Badge variant="outline" className={cn(baseClass, 'bg-emerald-50 text-emerald-800 border-emerald-300')}>
          Up to date
        </Badge>
      )
    case 'due':
      return (
        <Badge variant="outline" className={cn(baseClass, 'bg-amber-50 text-amber-800 border-amber-300')}>
          Due in {days} {days === 1 ? 'day' : 'days'}
        </Badge>
      )
    case 'overdue':
      return (
        <Badge variant="outline" className={cn(baseClass, 'bg-rose-50 text-rose-800 border-rose-300')}>
          {days && days < 0 ? `${Math.abs(days)} days overdue` : 'Overdue'}
        </Badge>
      )
    case 'required':
      return (
        <Badge variant="outline" className={cn(baseClass, 'bg-orange-50 text-orange-800 border-orange-300')}>
          Required
        </Badge>
      )
    case 'not_required':
      return (
        <span className="text-xs text-slate-400">—</span>
      )
    default:
      return <span className="text-xs text-slate-400">—</span>
  }
}

export function fraRiskRatingBadge(value: string | null | undefined) {
  if (!value) {
    return <span className="text-xs text-slate-400">—</span>
  }

  const normalized = value.toLowerCase()
  const tone =
    normalized.includes('intolerable')
      ? 'bg-rose-50 text-rose-800 border-rose-300'
      : normalized.includes('substantial')
        ? 'bg-orange-50 text-orange-800 border-orange-300'
        : normalized.includes('moderate')
          ? 'bg-amber-50 text-amber-800 border-amber-300'
          : 'bg-emerald-50 text-emerald-800 border-emerald-300'

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-6 rounded-full border px-2.5 text-[11px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]',
        tone
      )}
    >
      {value}
    </Badge>
  )
}

/**
 * Check if a store needs an FRA (only after at least one completed H&S audit)
 */
export function storeNeedsFRA(row: FRARow): boolean {
  return Boolean(row.compliance_audit_1_date || row.compliance_audit_2_date)
}
