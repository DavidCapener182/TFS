const STORE_VISITS_TABLE = 'tfs_store_visits'

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

export function isMissingStoreVisitsTableError(error: unknown): boolean {
  const errorLike = getErrorLike(error)
  if (!errorLike || errorLike.code !== 'PGRST205') return false
  return tableMentioned(errorLike)
}

export function getStoreVisitsUnavailableMessage(): string {
  return `Store visit logging is unavailable because the connected Supabase project is missing ${STORE_VISITS_TABLE}. Apply the latest Supabase migrations and refresh.`
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
