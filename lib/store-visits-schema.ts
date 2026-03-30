const STORE_VISITS_TABLE = 'tfs_store_visits'
const STORE_VISITS_REQUIRED_COLUMNS = ['status'] as const
const STORE_VISITS_LINKED_SESSIONS_MIGRATION =
  '20260330110000_add_linked_visit_report_sessions.sql'

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
  return haystack.includes(STORE_VISITS_TABLE) || haystack.includes(`public.${STORE_VISITS_TABLE}`)
}

function requiredColumnMentioned(error: QueryErrorLike): boolean {
  const haystack = `${error.message || ''} ${error.hint || ''}`.toLowerCase()
  return STORE_VISITS_REQUIRED_COLUMNS.some((column) => {
    return (
      haystack.includes(`'${column}' column`) ||
      haystack.includes(`"${column}"`) ||
      (haystack.includes(column) && haystack.includes('column'))
    )
  })
}

export function isMissingStoreVisitsTableError(error: unknown): boolean {
  const errorLike = getErrorLike(error)
  if (!errorLike) return false

  if (errorLike.code === 'PGRST205' && tableMentioned(errorLike)) {
    return true
  }

  const haystack = `${errorLike.message || ''} ${errorLike.hint || ''}`.toLowerCase()
  return (
    tableMentioned(errorLike) &&
    requiredColumnMentioned(errorLike) &&
    (haystack.includes('schema cache') ||
      haystack.includes('does not exist') ||
      haystack.includes('could not find'))
  )
}

export function getStoreVisitsUnavailableMessage(): string {
  return `Store visit logging is unavailable because the connected Supabase project is missing required linked-visit schema (for example ${STORE_VISITS_TABLE}.status). Apply the latest Supabase migrations, including ${STORE_VISITS_LINKED_SESSIONS_MIGRATION}, and refresh.`
}

export function formatStoreVisitsActionError(actionLabel: string, error: unknown): string {
  if (isMissingStoreVisitsTableError(error)) {
    return getStoreVisitsUnavailableMessage()
  }

  const errorLike = getErrorLike(error)
  if (errorLike?.message) {
    return `${actionLabel}: ${errorLike.message}`
  }

  return actionLabel
}
