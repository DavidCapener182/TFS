import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_CSV = '/Users/davidcapener/Downloads/FA - Sheet1.csv'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing Supabase env vars. Load .env.local first.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const STORE_ALIASES = {
  p62: 'Middleton',
  'point 62': 'Middleton',
  m3: 'Heywood',
  'manchester womens': 'Manchester',
  'metro centre': 'Metro New',
  'metro center': 'Metro New',
  nottingham: 'Nottingham Clumber St.',
  lakeside: 'Lakeside New',
  watford: 'Watford New Store',
  bullring: 'Bull ring new',
  'west brom': 'West Bromwich',
  'trafford maga': 'Trafford Mega',
  'trafford mags': 'Trafford Mega',
}

const UNKNOWN_STORE_NAME = 'Unknown Location (Imported)'

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {
    csvPath: DEFAULT_CSV,
    dryRun: false,
    sourceTag: 'fa-sheet1',
    refPrefix: 'SHEET1',
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') {
      parsed.dryRun = true
      continue
    }
    if (arg === '--csv' && args[i + 1]) {
      parsed.csvPath = args[i + 1]
      i += 1
      continue
    }
    if (arg === '--source-tag' && args[i + 1]) {
      parsed.sourceTag = args[i + 1]
      i += 1
      continue
    }
    if (arg === '--ref-prefix' && args[i + 1]) {
      parsed.refPrefix = args[i + 1]
      i += 1
      continue
    }
  }

  return parsed
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        value += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(value)
      value = ''
      continue
    }
    if (ch === '\n') {
      row.push(value)
      rows.push(row)
      row = []
      value = ''
      continue
    }
    if (ch === '\r') {
      continue
    }
    value += ch
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value)
    rows.push(row)
  }

  return rows
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function storeKey(value) {
  return normalizeText(value).replace(/\s+/g, '')
}

function boolFromYesNo(value) {
  const v = normalizeText(value)
  return v === 'yes' || v === 'true' || v === 'y'
}

function toIsoAtNoon(value) {
  const [dd, mm, yyyy] = String(value || '').trim().split('/')
  if (!dd || !mm || !yyyy) return null
  return `${yyyy}-${mm}-${dd}T12:00:00Z`
}

function toIsoDate(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function categoryFromRow(row) {
  const accidentType = normalizeText(row.accidentType)
  const personType = normalizeText(row.personType)

  if (accidentType.includes('near miss') || personType.includes('near miss')) return 'near_miss'
  if (accidentType.includes('violence') || accidentType.includes('assault')) return 'security'
  if (accidentType.includes('fire')) return 'fire'
  if (accidentType.includes('illness')) return 'health_safety'
  if (accidentType === 'other') return 'other'
  return 'accident'
}

function severityFromRow(row) {
  const comment = normalizeText(row.comments)
  const accidentType = normalizeText(row.accidentType)
  if (boolFromYesNo(row.riddor)) return 'high'
  if (accidentType.includes('near miss')) return 'low'
  if (
    comment.includes('ambulance') ||
    comment.includes('unconcious') ||
    comment.includes('unconscious') ||
    comment.includes('chest pain') ||
    comment.includes('fainted') ||
    comment.includes('faint')
  ) {
    return 'medium'
  }
  return 'low'
}

function incidentTypeFromExisting(incident) {
  const injury = incident?.injury_details && typeof incident.injury_details === 'object' ? incident.injury_details : {}
  const fromJson = injury.incident_type || injury.accident_type
  if (typeof fromJson === 'string' && fromJson.trim()) return fromJson

  const summary = String(incident.summary || '')
  if (summary.includes(' - ')) {
    return summary.split(' - ')[0].trim()
  }
  return summary
}

function coreNarrative(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const firstParagraph = text.split(/\n\s*\n/)[0] || text
  return normalizeText(firstParagraph).slice(0, 180)
}

function buildFingerprintParts(data) {
  return {
    date: toIsoDate(data.occurredAt),
    store: storeKey(data.storeName),
    personType: normalizeText(data.personType),
    child: data.childInvolved ? 'yes' : 'no',
    accidentType: normalizeText(data.accidentType),
    rootCause: normalizeText(data.rootCause),
    name: `${normalizeText(data.firstName)} ${normalizeText(data.lastName)}`.trim(),
    comment: coreNarrative(data.comments),
  }
}

function strictFingerprint(parts) {
  return [
    parts.date,
    parts.store,
    parts.personType,
    parts.child,
    parts.accidentType,
    parts.rootCause,
    parts.name,
    parts.comment,
  ].join('|')
}

function looseFingerprint(parts) {
  return [
    parts.date,
    parts.store,
    parts.personType,
    parts.child,
    parts.accidentType,
    parts.comment,
  ].join('|')
}

function narrativeFingerprint(parts) {
  return [
    parts.date,
    parts.store,
    parts.comment,
  ].join('|')
}

function sanitizeForSummary(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSummary(row) {
  const parts = [sanitizeForSummary(row.accidentType), sanitizeForSummary(row.personType)]
  return parts.filter(Boolean).join(' - ').slice(0, 500) || 'Imported incident'
}

function buildDescription(row) {
  const chunks = [
    sanitizeForSummary(row.comments),
    row.firstAid ? `First aid / action: ${sanitizeForSummary(row.firstAid)}` : '',
    row.foreseeable ? `Foreseeable: ${sanitizeForSummary(row.foreseeable)}` : '',
    row.reportedToInsurers ? `Reported to insurers: ${sanitizeForSummary(row.reportedToInsurers)}` : '',
  ].filter(Boolean)
  return chunks.join('\n\n') || null
}

function normalizeStoreName(raw) {
  const key = normalizeText(raw)
  if (!key) return ''
  return STORE_ALIASES[key] || raw
}

function mapRows(parsedRows) {
  if (!parsedRows.length) return []
  const headers = parsedRows[0].map((h) => normalizeText(h))
  const idx = (name) => headers.indexOf(normalizeText(name))

  const mapped = []
  for (let i = 1; i < parsedRows.length; i += 1) {
    const row = parsedRows[i]
    if (!row || row.every((v) => String(v || '').trim() === '')) continue

    const itemNoIndex = idx('Item No')
    const blankIndex = idx('')
    const sheetId = String(
      (itemNoIndex >= 0 ? row[itemNoIndex] : undefined) ||
      (blankIndex >= 0 ? row[blankIndex] : undefined) ||
      '',
    ).trim() || String(i)
    mapped.push({
      sheetId,
      month: row[idx('Month')] || '',
      incidentDate: row[idx('Incident Date')] || '',
      firstName: row[idx('First Name')] || '',
      lastName: row[idx('Last Name')] || '',
      personType: row[idx('Persons Affected')] || '',
      childInvolved: row[idx('Child Involved')] || '',
      location: row[idx('Location')] || '',
      riddor: row[idx('RIDDOR')] || '',
      accidentType: row[idx('Accident Type')] || '',
      rootCause: row[idx('Root Cause')] || '',
      comments: row[idx('Comments / Actions / Recommendations')] || '',
      reportedToInsurers: row[idx('Reported to Insurers')] || '',
      foreseeable: row[idx('Forseeable')] || '',
      firstAid: row[idx('Type of First Aid Administered / Action Required')] || '',
    })
  }
  return mapped
}

async function getDefaultUserId() {
  const { data, error } = await supabase
    .from('fa_profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw new Error(`Failed loading fa_profiles: ${error.message}`)
  if (!data?.[0]?.id) throw new Error('No fa_profiles rows found.')
  return data[0].id
}

async function loadStores() {
  const { data, error } = await supabase.from('fa_stores').select('id,store_name')
  if (error) throw new Error(`Failed loading stores: ${error.message}`)

  const byExact = new Map()
  const byKey = new Map()
  for (const s of data || []) {
    byExact.set(normalizeText(s.store_name), s.id)
    byKey.set(storeKey(s.store_name), s.id)
  }
  return { byExact, byKey }
}

async function resolveStoreId(location, storeMaps) {
  const raw = String(location || '').trim() || UNKNOWN_STORE_NAME

  const normalized = normalizeStoreName(raw)
  const keyExact = normalizeText(normalized)
  const keySquash = storeKey(normalized)

  if (storeMaps.byExact.has(keyExact)) return storeMaps.byExact.get(keyExact)
  if (storeMaps.byKey.has(keySquash)) return storeMaps.byKey.get(keySquash)

  const safeCode = `EXT-${normalized.replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}`
  const { data, error } = await supabase
    .from('fa_stores')
    .insert({
      store_name: normalized,
      store_code: safeCode || null,
      is_active: true,
    })
    .select('id,store_name')
    .single()

  if (error) throw new Error(`Failed creating store "${normalized}": ${error.message}`)
  storeMaps.byExact.set(normalizeText(data.store_name), data.id)
  storeMaps.byKey.set(storeKey(data.store_name), data.id)
  return data.id
}

async function loadExistingIncidents() {
  const [openResult, closedResult, storesResult] = await Promise.all([
    supabase
      .from('fa_incidents')
      .select('id,store_id,occurred_at,persons_involved,injury_details,summary,description,source_reference'),
    supabase
      .from('fa_closed_incidents')
      .select('id,store_id,occurred_at,persons_involved,injury_details,summary,description'),
    supabase.from('fa_stores').select('id,store_name'),
  ])

  if (openResult.error) throw new Error(`Failed loading fa_incidents: ${openResult.error.message}`)
  if (closedResult.error) throw new Error(`Failed loading fa_closed_incidents: ${closedResult.error.message}`)
  if (storesResult.error) throw new Error(`Failed loading stores for matching: ${storesResult.error.message}`)

  const storeById = new Map((storesResult.data || []).map((s) => [s.id, s.store_name]))
  const all = [...(openResult.data || []), ...(closedResult.data || [])]
  return all.map((incident) => {
    const persons = incident?.persons_involved && typeof incident.persons_involved === 'object'
      ? incident.persons_involved
      : {}
    const injury = incident?.injury_details && typeof incident.injury_details === 'object'
      ? incident.injury_details
      : {}

    return {
      occurredAt: incident.occurred_at || '',
      storeName: storeById.get(incident.store_id) || '',
      personType: persons.person_type || persons.personType || '',
      childInvolved: Boolean(persons.child_involved ?? persons.childInvolved),
      firstName: persons.first_name || persons.firstName || '',
      lastName: persons.last_name || persons.lastName || '',
      accidentType: incidentTypeFromExisting(incident),
      rootCause: injury.root_cause || injury.rootCause || '',
      comments: incident.description || incident.summary || '',
      sourceReference: incident.source_reference || '',
    }
  })
}

function buildExistingFingerprintSets(existingRows) {
  const strictSet = new Set()
  const looseSet = new Set()
  const narrativeSet = new Set()
  const sourceRefSet = new Set()

  for (const row of existingRows) {
    if (row.sourceReference) sourceRefSet.add(String(row.sourceReference))
    const parts = buildFingerprintParts(row)
    strictSet.add(strictFingerprint(parts))
    looseSet.add(looseFingerprint(parts))
    narrativeSet.add(narrativeFingerprint(parts))
  }
  return { strictSet, looseSet, narrativeSet, sourceRefSet }
}

async function main() {
  const args = parseArgs()
  const csvPath = path.resolve(args.csvPath)
  const csvText = fs.readFileSync(csvPath, 'utf8')
  const parsedRows = parseCsv(csvText)
  const csvRows = mapRows(parsedRows)

  const defaultUserId = await getDefaultUserId()
  const storeMaps = await loadStores()
  const existingRows = await loadExistingIncidents()
  const existing = buildExistingFingerprintSets(existingRows)

  const csvStrictSeen = new Set()
  const csvLooseSeen = new Set()
  const csvNarrativeSeen = new Set()

  let inserted = 0
  let skippedCsvDupes = 0
  let skippedExisting = 0
  let skippedInvalidDate = 0
  let skippedMissingStore = 0
  const insertedRefs = []
  const skippedSamples = []

  for (const row of csvRows) {
    const occurredAt = toIsoAtNoon(row.incidentDate)
    if (!occurredAt) {
      skippedInvalidDate += 1
      if (skippedSamples.length < 10) skippedSamples.push({ reason: 'invalid_date', sheetId: row.sheetId })
      continue
    }

    const sourceReference = `${args.sourceTag}:${row.sheetId}`
    const rowForFingerprint = {
      occurredAt,
      storeName: normalizeStoreName(row.location),
      personType: row.personType,
      childInvolved: boolFromYesNo(row.childInvolved),
      firstName: row.firstName,
      lastName: row.lastName,
      accidentType: row.accidentType,
      rootCause: row.rootCause,
      comments: row.comments,
    }
    const fpParts = buildFingerprintParts(rowForFingerprint)
    const fpStrict = strictFingerprint(fpParts)
    const fpLoose = looseFingerprint(fpParts)
    const fpNarrative = narrativeFingerprint(fpParts)

    if (csvStrictSeen.has(fpStrict) || csvLooseSeen.has(fpLoose) || csvNarrativeSeen.has(fpNarrative)) {
      skippedCsvDupes += 1
      if (skippedSamples.length < 10) skippedSamples.push({ reason: 'duplicate_in_csv', sheetId: row.sheetId })
      continue
    }
    csvStrictSeen.add(fpStrict)
    csvLooseSeen.add(fpLoose)
    csvNarrativeSeen.add(fpNarrative)

    if (
      existing.sourceRefSet.has(sourceReference) ||
      existing.strictSet.has(fpStrict) ||
      existing.looseSet.has(fpLoose) ||
      existing.narrativeSet.has(fpNarrative)
    ) {
      skippedExisting += 1
      if (skippedSamples.length < 10) skippedSamples.push({ reason: 'already_in_db', sheetId: row.sheetId })
      continue
    }

    const storeId = await resolveStoreId(row.location, storeMaps)
    if (!storeId) {
      skippedMissingStore += 1
      if (skippedSamples.length < 10) skippedSamples.push({ reason: 'missing_store', sheetId: row.sheetId })
      continue
    }

    const incidentCategory = categoryFromRow(row)
    const severity = severityFromRow(row)
    const description = buildDescription(row)
    const summary = buildSummary(row)
    const childInvolved = boolFromYesNo(row.childInvolved)
    const personType = row.personType || 'Unknown'
    const reportedToInsurers = boolFromYesNo(row.reportedToInsurers)
    const foreseeable = boolFromYesNo(row.foreseeable)
    const riddor = boolFromYesNo(row.riddor)

    const referenceNo = `${args.refPrefix}-${String(row.sheetId).padStart(3, '0')}`

    if (!args.dryRun) {
      const { data: insertedIncident, error: insertErr } = await supabase
        .from('fa_incidents')
        .insert({
          reference_no: referenceNo,
          source_reference: sourceReference,
          store_id: storeId,
          reported_by_user_id: defaultUserId,
          incident_category: incidentCategory,
          severity,
          summary,
          description,
          occurred_at: occurredAt,
          reported_at: occurredAt,
          persons_involved: {
            person_type: personType,
            first_name: row.firstName || null,
            last_name: row.lastName || null,
            child_involved: childInvolved,
          },
          injury_details: {
            incident_type: row.accidentType || null,
            root_cause: row.rootCause || null,
            first_aid_action: row.firstAid || null,
            foreseeable,
            reported_to_insurers: reportedToInsurers,
          },
          riddor_reportable: riddor,
          status: 'closed',
          closed_at: occurredAt,
          closure_summary: 'Imported from FA - Sheet1.csv',
        })
        .select('id')
        .single()

      if (insertErr) {
        throw new Error(`Failed inserting sheet row ${row.sheetId}: ${insertErr.message}`)
      }

      const { error: invErr } = await supabase.from('fa_investigations').insert({
        incident_id: insertedIncident.id,
        investigation_type: 'formal',
        status: 'complete',
        lead_investigator_user_id: defaultUserId,
        root_cause: row.rootCause || null,
        findings: description || null,
        recommendations: null,
        started_at: occurredAt,
        completed_at: occurredAt,
      })

      if (invErr) {
        throw new Error(`Failed creating investigation for sheet row ${row.sheetId}: ${invErr.message}`)
      }
    }

    inserted += 1
    insertedRefs.push(referenceNo)
    existing.sourceRefSet.add(sourceReference)
    existing.strictSet.add(fpStrict)
    existing.looseSet.add(fpLoose)
    existing.narrativeSet.add(fpNarrative)
  }

  console.log(
    JSON.stringify(
      {
        csvPath,
        sourceTag: args.sourceTag,
        refPrefix: args.refPrefix,
        totalCsvRows: csvRows.length,
        inserted,
        skippedCsvDupes,
        skippedExisting,
        skippedInvalidDate,
        skippedMissingStore,
        insertedRefSample: insertedRefs.slice(0, 25),
        skippedSamples,
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
