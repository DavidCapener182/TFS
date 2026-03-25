export type StoreNormalizationInput = {
  id?: string | null
  store_name?: string | null
  store_code?: string | null
  address_line_1?: string | null
  city?: string | null
  postcode?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
}

type StoreCoordinates = {
  latitude: number
  longitude: number
}

const SHARPS_PROJECT_COORDS: StoreCoordinates = {
  latitude: 53.501447,
  longitude: -2.195506,
}

const HEYWOOD_M3_COORDS: StoreCoordinates = {
  latitude: 53.581329,
  longitude: -2.238981,
}

const POINT62_COORDS: StoreCoordinates = {
  latitude: 53.5636,
  longitude: -2.166744,
}

const UNKNOWN_IMPORTED_STORE_NAMES = new Set([
  'unknown loaction (imported)',
  'unknown location (imported)',
])

const ALWAYS_INCLUDE_STORE_CODE_MATCHERS = [
  's0900',
  'wh003',
  'wh004',
  'sharpproject', // Photo Studio code variant
  'm3',
  'point62',
  'p62',
] as const

const ALWAYS_EXCLUDE_STORE_CODE_MATCHERS = [
  'extsharpproject',
] as const

const STORE_COORDINATE_OVERRIDES_BY_CODE: Record<string, StoreCoordinates> = {
  S0900: SHARPS_PROJECT_COORDS,
  WH003: HEYWOOD_M3_COORDS,
  WH004: POINT62_COORDS,
}

const STORE_COORDINATE_OVERRIDES_BY_MATCHER: Record<string, StoreCoordinates> = {
  s0900: SHARPS_PROJECT_COORDS,
  wh003: HEYWOOD_M3_COORDS,
  wh004: POINT62_COORDS,
  extsharpproject: SHARPS_PROJECT_COORDS,
  sharpproject: SHARPS_PROJECT_COORDS,
  sharpsproject: SHARPS_PROJECT_COORDS,
  m3: HEYWOOD_M3_COORDS,
  point62: POINT62_COORDS,
  p62: POINT62_COORDS,
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeStoreName(value: string | null | undefined): string {
  return normalizeWhitespace(String(value || '')).toLowerCase()
}

function normalizeStoreCode(value: string | null | undefined): string {
  return normalizeWhitespace(String(value || '')).toUpperCase()
}

function normalizeMatcherKey(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function parseFiniteNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function isExtStoreCode(storeCode: string | null | undefined): boolean {
  return normalizeStoreCode(storeCode).startsWith('EXT-')
}

export function getStoreCoordinateOverride(
  storeCode: string | null | undefined,
  storeName?: string | null
): StoreCoordinates | null {
  const normalizedStoreCode = normalizeStoreCode(storeCode)
  if (normalizedStoreCode && STORE_COORDINATE_OVERRIDES_BY_CODE[normalizedStoreCode]) {
    return STORE_COORDINATE_OVERRIDES_BY_CODE[normalizedStoreCode]
  }

  const codeMatcher = normalizeMatcherKey(storeCode)
  if (codeMatcher && STORE_COORDINATE_OVERRIDES_BY_MATCHER[codeMatcher]) {
    return STORE_COORDINATE_OVERRIDES_BY_MATCHER[codeMatcher]
  }

  const nameMatcher = normalizeMatcherKey(storeName)
  if (!nameMatcher) return null
  if (nameMatcher.includes('sharpproject') || nameMatcher.includes('sharpsproject')) return SHARPS_PROJECT_COORDS
  if (nameMatcher.includes('heywood')) return HEYWOOD_M3_COORDS
  if (nameMatcher.includes('point62')) return POINT62_COORDS

  return null
}

export function hasStoreLocationData(store: StoreNormalizationInput): boolean {
  const hasAddressFields = [store.address_line_1, store.city, store.postcode]
    .some((value) => normalizeWhitespace(String(value || '')).length > 0)

  if (hasAddressFields) {
    return true
  }

  const latitude = parseFiniteNumber(store.latitude)
  const longitude = parseFiniteNumber(store.longitude)
  return latitude !== null && longitude !== null
}

export function isUnknownImportedStore(storeName: string | null | undefined): boolean {
  return UNKNOWN_IMPORTED_STORE_NAMES.has(normalizeStoreName(storeName))
}

function hasLocationFieldsInShape(store: StoreNormalizationInput): boolean {
  return ['address_line_1', 'city', 'postcode', 'latitude', 'longitude']
    .some((key) => Object.prototype.hasOwnProperty.call(store, key))
}

export function shouldAlwaysIncludeStore(store: StoreNormalizationInput): boolean {
  const codeKey = normalizeMatcherKey(store.store_code)
  if (!codeKey) return false
  if (ALWAYS_EXCLUDE_STORE_CODE_MATCHERS.some((matcher) => codeKey.includes(matcher))) return false

  return ALWAYS_INCLUDE_STORE_CODE_MATCHERS.some((matcher) => codeKey.includes(matcher))
}

export function applyStoreCoordinateOverride<T extends StoreNormalizationInput>(store: T): T {
  const override = getStoreCoordinateOverride(store.store_code, store.store_name)
  if (!override) return store

  const hasLatitude = parseFiniteNumber(store.latitude) !== null
  const hasLongitude = parseFiniteNumber(store.longitude) !== null
  if (hasLatitude && hasLongitude) return store

  return {
    ...store,
    latitude: override.latitude,
    longitude: override.longitude,
  }
}

export function shouldHideStore(store: StoreNormalizationInput): boolean {
  if (shouldAlwaysIncludeStore(store)) return false
  if (isExtStoreCode(store.store_code)) return true
  if (isUnknownImportedStore(store.store_name)) return true
  if (hasLocationFieldsInShape(store) && !hasStoreLocationData(store)) return true
  return false
}

function isGlasgowArgyleStore(store: StoreNormalizationInput): boolean {
  return normalizeStoreName(store.store_name) === 'glasgow argyle'
}

function isLegacyGlasgowAliasStore(store: StoreNormalizationInput): boolean {
  if (isGlasgowArgyleStore(store)) return false
  if (normalizeStoreCode(store.store_code) === 'EXT-GLASGOW') return true
  return normalizeStoreName(store.store_name) === 'glasgow'
}

function isPhotoStudioStore(store: StoreNormalizationInput): boolean {
  return (
    normalizeStoreName(store.store_name) === 'photo studio' ||
    normalizeStoreCode(store.store_code) === 'S0900'
  )
}

function isSharpProjectAliasStore(store: StoreNormalizationInput): boolean {
  if (isPhotoStudioStore(store)) return false

  const normalizedName = normalizeStoreName(store.store_name)
  const normalizedCode = normalizeStoreCode(store.store_code)
  return normalizedName === 'sharp project' || normalizedCode === 'EXT-SHARPPROJECT'
}

export type StoreMergeContext = {
  canonicalStoreIdByStoreId: Map<string, string>
  aliasStoreIdsByCanonicalId: Map<string, string[]>
}

function registerStoreAliasMerge(
  stores: StoreNormalizationInput[],
  canonicalPredicate: (store: StoreNormalizationInput) => boolean,
  aliasPredicate: (store: StoreNormalizationInput) => boolean,
  canonicalStoreIdByStoreId: Map<string, string>,
  aliasStoreIdsByCanonicalId: Map<string, string[]>
) {
  const canonicalStore = stores.find((store) => Boolean(store.id) && canonicalPredicate(store))
  if (!canonicalStore?.id) return

  for (const store of stores) {
    if (!store.id || store.id === canonicalStore.id) continue
    if (!aliasPredicate(store)) continue

    canonicalStoreIdByStoreId.set(store.id, canonicalStore.id)
    const existing = aliasStoreIdsByCanonicalId.get(canonicalStore.id) || []
    existing.push(store.id)
    aliasStoreIdsByCanonicalId.set(canonicalStore.id, existing)
  }
}

export function buildStoreMergeContext(stores: StoreNormalizationInput[]): StoreMergeContext {
  const canonicalStoreIdByStoreId = new Map<string, string>()
  const aliasStoreIdsByCanonicalId = new Map<string, string[]>()

  registerStoreAliasMerge(
    stores,
    isGlasgowArgyleStore,
    isLegacyGlasgowAliasStore,
    canonicalStoreIdByStoreId,
    aliasStoreIdsByCanonicalId
  )

  registerStoreAliasMerge(
    stores,
    isPhotoStudioStore,
    isSharpProjectAliasStore,
    canonicalStoreIdByStoreId,
    aliasStoreIdsByCanonicalId
  )

  return { canonicalStoreIdByStoreId, aliasStoreIdsByCanonicalId }
}

export function getCanonicalStoreId(
  storeId: string | null | undefined,
  mergeContext: StoreMergeContext
): string | null {
  if (!storeId) return null
  return mergeContext.canonicalStoreIdByStoreId.get(storeId) || storeId
}

export function getStoreIdsIncludingAliases(
  storeId: string,
  mergeContext: StoreMergeContext
): string[] {
  const canonicalStoreId = getCanonicalStoreId(storeId, mergeContext)
  if (!canonicalStoreId) return []

  const aliasStoreIds = mergeContext.aliasStoreIdsByCanonicalId.get(canonicalStoreId) || []
  return Array.from(new Set([canonicalStoreId, ...aliasStoreIds]))
}
