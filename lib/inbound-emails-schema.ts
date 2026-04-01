const INBOUND_EMAILS_TABLE = 'tfs_inbound_emails'
const INBOUND_EMAILS_MIGRATION = '20260401090000_add_tfs_inbound_emails.sql'

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
  return haystack.includes(INBOUND_EMAILS_TABLE) || haystack.includes(`public.${INBOUND_EMAILS_TABLE}`)
}

export function isMissingInboundEmailsTableError(error: unknown): boolean {
  const errorLike = getErrorLike(error)
  if (!errorLike) return false

  if (errorLike.code === 'PGRST205' || errorLike.code === '42P01') {
    return tableMentioned(errorLike)
  }

  const haystack = `${errorLike.message || ''} ${errorLike.hint || ''}`.toLowerCase()
  return tableMentioned(errorLike) && (
    haystack.includes('could not find the table') ||
    haystack.includes('does not exist') ||
    haystack.includes('schema cache')
  )
}

export function getInboundEmailsUnavailableMessage(): string {
  return `Inbound email review is unavailable because the connected Supabase project is missing ${INBOUND_EMAILS_TABLE}. Apply the latest Supabase migrations, including ${INBOUND_EMAILS_MIGRATION}, and refresh.`
}
