const VISIT_REPORTS_TABLE = 'tfs_visit_reports'

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

export function isMissingVisitReportsTableError(error: unknown): boolean {
  const errorLike = getErrorLike(error)
  if (!errorLike) return false

  if (errorLike.code === 'PGRST205' || errorLike.code === '42P01') {
    return tableMentioned(errorLike)
  }

  const haystack = `${errorLike.message || ''} ${errorLike.hint || ''}`.toLowerCase()
  return tableMentioned(errorLike) && (
    haystack.includes('could not find the table') || haystack.includes('does not exist')
  )
}

export function getVisitReportsUnavailableMessage(): string {
  return `Visit reports are unavailable because the connected Supabase project is missing ${VISIT_REPORTS_TABLE}. Apply the latest Supabase migrations and refresh.`
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
