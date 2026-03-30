const VISIT_REPORTS_TABLE = 'tfs_visit_reports'
const VISIT_REPORTS_REQUIRED_COLUMNS = ['store_visit_id'] as const
const LINKED_VISIT_REPORTS_MIGRATION =
  '20260330110000_add_linked_visit_report_sessions.sql'

const FOLLOW_UP_TABLES = ['tfs_incidents', 'tfs_actions'] as const

type QueryErrorLike = {
  code?: string | null
  hint?: string | null
  message?: string | null
}

function getErrorLike(error: unknown): QueryErrorLike | null {
  if (!error || typeof error !== 'object') return null
  return error as QueryErrorLike
}

function tableMentioned(error: QueryErrorLike): boolean {
  const haystack = `${error.message || ''} ${error.hint || ''}`.toLowerCase()
  return haystack.includes(VISIT_REPORTS_TABLE) || haystack.includes(`public.${VISIT_REPORTS_TABLE}`)
}

function requiredColumnMentioned(error: QueryErrorLike): boolean {
  const haystack = `${error.message || ''} ${error.hint || ''}`.toLowerCase()
  return VISIT_REPORTS_REQUIRED_COLUMNS.some((column) => {
    return (
      haystack.includes(`'${column}' column`) ||
      haystack.includes(`"${column}"`) ||
      (haystack.includes(column) && haystack.includes('column'))
    )
  })
}

function followUpTableMentioned(error: QueryErrorLike): boolean {
  const haystack = `${error.message || ''} ${error.hint || ''}`.toLowerCase()
  return FOLLOW_UP_TABLES.some(
    (name) => haystack.includes(name) || haystack.includes(`public.${name}`)
  )
}

export function isMissingFollowUpTablesError(error: unknown): boolean {
  const errorLike = getErrorLike(error)
  if (!errorLike) return false

  if (errorLike.code === 'PGRST205' || errorLike.code === '42P01') {
    return followUpTableMentioned(errorLike)
  }

  const haystack = `${errorLike.message || ''} ${errorLike.hint || ''}`.toLowerCase()
  return followUpTableMentioned(errorLike) && (
    haystack.includes('could not find the table') ||
    haystack.includes('does not exist') ||
    haystack.includes('schema cache')
  )
}

export function isMissingVisitReportsTableError(error: unknown): boolean {
  const errorLike = getErrorLike(error)
  if (!errorLike) return false

  if (errorLike.code === 'PGRST205' || errorLike.code === '42P01') {
    return tableMentioned(errorLike)
  }

  const haystack = `${errorLike.message || ''} ${errorLike.hint || ''}`.toLowerCase()
  return tableMentioned(errorLike) && (
    haystack.includes('could not find the table') ||
    haystack.includes('does not exist') ||
    (
      requiredColumnMentioned(errorLike) &&
      (haystack.includes('schema cache') || haystack.includes('could not find'))
    )
  )
}

export function getVisitReportsUnavailableMessage(): string {
  return `Visit reports are unavailable because the connected Supabase project is missing required linked-visit report schema (for example ${VISIT_REPORTS_TABLE}.store_visit_id). Apply the latest Supabase migrations, including ${LINKED_VISIT_REPORTS_MIGRATION}, and refresh.`
}

export function formatVisitReportsActionError(actionLabel: string, error: unknown): string {
  if (isMissingVisitReportsTableError(error)) {
    return getVisitReportsUnavailableMessage()
  }

  const errorLike = getErrorLike(error)
  if (errorLike?.message) {
    return `${actionLabel}: ${errorLike.message}`
  }

  return actionLabel
}
