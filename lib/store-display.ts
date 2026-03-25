const STORE_NAME_OVERRIDES = new Map<string, string>([
  ['liverpool1', 'Liverpool One'],
])

const STORE_NAME_WORD_OVERRIDES = new Map<string, string>([
  ['o2', 'O2'],
  ['uk', 'UK'],
])

function normalizeStoreNameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function titleCaseWord(word: string): string {
  if (!word) return word

  const lower = word.toLowerCase()
  const override = STORE_NAME_WORD_OVERRIDES.get(lower)
  if (override) return override

  if (/[a-z]/i.test(word) && /\d/.test(word)) {
    return word.toUpperCase()
  }

  // Handle apostrophes and compound segments like o'connor -> O'Connor.
  return lower.replace(/(^|[-'’/&])([a-z])/g, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`)
}

export function formatStoreName(name: string | null | undefined): string {
  const raw = String(name || '').trim()
  if (!raw) return ''

  const override = STORE_NAME_OVERRIDES.get(normalizeStoreNameKey(raw))
  if (override) return override

  return raw
    .split(/\s+/)
    .flatMap((part) => {
      const partOverride = STORE_NAME_WORD_OVERRIDES.get(normalizeStoreNameKey(part))
      if (partOverride) return [partOverride]

      return part
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .replace(/(\d)([a-zA-Z])/g, '$1 $2')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(/\s+/)
    })
    .map((part) => titleCaseWord(part))
    .join(' ')
}

export function formatUkPostcode(postcode: string | null | undefined): string {
  const raw = String(postcode || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!raw) return ''
  if (raw.length <= 3) return raw

  return `${raw.slice(0, -3)} ${raw.slice(-3)}`
}
