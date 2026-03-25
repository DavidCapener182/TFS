export const STORE_CRM_TABLES = [
  'tfs_store_contacts',
  'tfs_store_notes',
  'tfs_store_contact_tracker',
] as const

export type StoreCrmTableName = (typeof STORE_CRM_TABLES)[number]

type QueryErrorLike = {
  code?: string | null
  hint?: string | null
  message?: string | null
}

function getErrorLike(error: unknown): QueryErrorLike | null {
  if (!error || typeof error !== 'object') return null
  return error as QueryErrorLike
}

function tableMentioned(error: QueryErrorLike, tableName: StoreCrmTableName): boolean {
  const haystack = `${error.message || ''} ${error.hint || ''}`.toLowerCase()
  return haystack.includes(tableName.toLowerCase()) || haystack.includes(`public.${tableName}`.toLowerCase())
}

export function getMissingStoreCrmTables(
  errors: Partial<Record<StoreCrmTableName, unknown>>
): StoreCrmTableName[] {
  return STORE_CRM_TABLES.filter((tableName) => {
    const error = getErrorLike(errors[tableName])
    return Boolean(error?.code === 'PGRST205' && tableMentioned(error, tableName))
  })
}

export function isMissingStoreCrmTableError(error: unknown): boolean {
  const errorLike = getErrorLike(error)
  if (!errorLike || errorLike.code !== 'PGRST205') return false
  return STORE_CRM_TABLES.some((tableName) => tableMentioned(errorLike, tableName))
}

export function getStoreCrmUnavailableMessage(missingTables: readonly StoreCrmTableName[]): string {
  const tableList = missingTables.join(', ')
  return `Store CRM is unavailable because the connected Supabase project is missing required tables (${tableList}). Apply the latest Supabase migrations and refresh.`
}

export function formatStoreCrmActionError(actionLabel: string, error: unknown): string {
  if (isMissingStoreCrmTableError(error)) {
    return getStoreCrmUnavailableMessage(STORE_CRM_TABLES)
  }

  const errorLike = getErrorLike(error)
  if (errorLike?.message) {
    return `${actionLabel}: ${errorLike.message}`
  }

  return actionLabel
}
