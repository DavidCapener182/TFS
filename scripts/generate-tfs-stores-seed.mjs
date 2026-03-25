import fs from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer'

const SOURCE_PAGE_URL = 'https://www.thefragranceshop.co.uk/store-finder/listing'
const SOURCE_API_PATH = '/api/stores/all'
const DEFAULT_OUTPUT_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260324190000_refresh_tfs_stores_normalized.sql'
)

const SMALL_TITLE_WORDS = new Set([
  'and',
  'at',
  'for',
  'in',
  'of',
  'on',
  'the',
  'under',
  'upon',
])

const STORE_NAME_OVERRIDES = new Map([
  ['liverpool1', 'Liverpool One'],
  ['westonsupermare', 'Weston-super-Mare'],
  ['bishopsstortford', "Bishop's Stortford"],
])

const LOCATION_LABEL_OVERRIDES = new Map([
  ['bideford', 'Bideford'],
  ['bishopsstortford', "Bishop's Stortford"],
  ['bishopstortford', "Bishop's Stortford"],
  ['eastkilbride', 'East Kilbride'],
  ['essec', 'Essex'],
  ['kinstonuponthames', 'Kingston upon Thames'],
  ['newcastleupontyme', 'Newcastle upon Tyne'],
  ['northyorks', 'North Yorkshire'],
  ['southendonsea', 'Southend-on-Sea'],
  ['staffordshire', 'Staffordshire'],
  ['tyreandwear', 'Tyne and Wear'],
  ['westonsupermare', 'Weston-super-Mare'],
  ['wyorkshire', 'West Yorkshire'],
  ['wiltshire', 'Wiltshire'],
])

const POSTCODE_OVERRIDES_BY_STORE_CODE = new Map([
  ['390', 'CO1 1WF'],
])

function cleanText(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ', ')
    .replace(/,+$/g, '')
    .trim()

  return text.length > 0 ? text : null
}

function normalizeMatcherKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function toSmartTitleCase(value) {
  const cleaned = cleanText(value)
  if (!cleaned) return null

  const words = cleaned.split(' ')

  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      const isFirst = index === 0
      const isLast = index === words.length - 1

      if (!isFirst && !isLast && SMALL_TITLE_WORDS.has(lower)) {
        return lower
      }

      return lower
        .split(/([-/'’.])/g)
        .map((part) => {
          if (!part) return part
          if (/^[-/'’.]$/.test(part)) return part
          if (part === 'o2') return 'O2'
          return part.charAt(0).toUpperCase() + part.slice(1)
        })
        .join('')
    })
    .join(' ')
}

function normalizeStoreName(value) {
  const cleaned = cleanText(value)
  if (!cleaned) return null

  const override = STORE_NAME_OVERRIDES.get(normalizeMatcherKey(cleaned))
  return override || toSmartTitleCase(cleaned)
}

function normalizeLocationLabel(value) {
  const cleaned = cleanText(value)
  if (!cleaned) return null

  const override = LOCATION_LABEL_OVERRIDES.get(normalizeMatcherKey(cleaned))
  return override || toSmartTitleCase(cleaned)
}

function cleanPostcode(value, storeCode = null) {
  const text = cleanText(value)
  if (!text) return null

  const override = POSTCODE_OVERRIDES_BY_STORE_CODE.get(String(storeCode || '').trim())
  return (override || text).toUpperCase()
}

function parseCoordinate(value) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function dedupeParts(parts) {
  const seen = new Set()
  const result = []

  for (const part of parts) {
    const cleaned = cleanText(part)
    if (!cleaned) continue

    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    result.push(cleaned)
  }

  return result
}

function buildAddressLine(store) {
  const parts = dedupeParts([store.address1, store.address2])
  return parts.length > 0 ? parts.join(', ') : null
}

function buildRegion(store) {
  const state = normalizeLocationLabel(store.state)
  const city = normalizeLocationLabel(store.city)
  if (state && city && state.toLowerCase() === city.toLowerCase()) return state
  return state || city || null
}

function isStoreActive(store) {
  const openingHours = cleanText(store.openingHours)
  if (!openingHours) return true
  return /\d{2}:\d{2}/.test(openingHours)
}

function normalizeStore(store) {
  const id = cleanText(store.id)
  if (!id) {
    throw new Error(`Store is missing id: ${JSON.stringify(store)}`)
  }

  return {
    id,
    store_code: cleanText(store.yourId),
    store_name: normalizeStoreName(store.name),
    address_line_1: buildAddressLine(store),
    city: normalizeLocationLabel(store.city),
    postcode: cleanPostcode(store.postCode, store.yourId),
    region: buildRegion(store),
    is_active: isStoreActive(store),
    latitude: parseCoordinate(store.latitude),
    longitude: parseCoordinate(store.longitude),
  }
}

function escapeSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function toSqlValue(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  return escapeSqlString(value)
}

function buildSeedSql(stores, generatedAtIso) {
  const rows = stores
    .map((store) => {
      const values = [
        store.id,
        store.store_code,
        store.store_name,
        store.address_line_1,
        store.city,
        store.postcode,
        store.region,
        store.is_active,
        store.latitude,
        store.longitude,
      ]

      return `  (${values.map((value) => toSqlValue(value)).join(', ')})`
    })
    .join(',\n')

  return `begin;

-- Generated from ${SOURCE_PAGE_URL}
-- Source API: ${SOURCE_API_PATH}
-- Generated at: ${generatedAtIso}
-- Store count: ${stores.length}
-- Additive only: this upserts live TFS store records into public.tfs_stores.

insert into public.tfs_stores (
  id,
  store_code,
  store_name,
  address_line_1,
  city,
  postcode,
  region,
  is_active,
  latitude,
  longitude
)
values
${rows}
on conflict (id) do update
set
  store_code = excluded.store_code,
  store_name = excluded.store_name,
  address_line_1 = excluded.address_line_1,
  city = excluded.city,
  postcode = excluded.postcode,
  region = excluded.region,
  is_active = excluded.is_active,
  latitude = excluded.latitude,
  longitude = excluded.longitude;

commit;
`
}

async function fetchStores() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  try {
    const page = await browser.newPage()
    const storeResponsePromise = page.waitForResponse(
      (response) => response.url().includes(SOURCE_API_PATH) && response.status() === 200,
      { timeout: 120_000 }
    )

    await page.goto(SOURCE_PAGE_URL, {
      waitUntil: 'networkidle2',
      timeout: 120_000,
    })

    const storeResponse = await storeResponsePromise
    const payload = await storeResponse.json()

    if (!payload?.success || !Array.isArray(payload.result)) {
      throw new Error(`Unexpected store payload shape: ${JSON.stringify(payload).slice(0, 500)}`)
    }

    return payload.result
  } finally {
    await browser.close()
  }
}

async function main() {
  const outputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : DEFAULT_OUTPUT_PATH

  const rawStores = await fetchStores()
  const normalizedStores = rawStores
    .map(normalizeStore)
    .sort((a, b) => a.store_name.localeCompare(b.store_name, undefined, { sensitivity: 'base' }))

  const generatedAtIso = new Date().toISOString()
  const sql = buildSeedSql(normalizedStores, generatedAtIso)

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, sql, 'utf8')

  console.log(`Wrote ${normalizedStores.length} TFS stores to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
