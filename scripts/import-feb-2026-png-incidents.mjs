import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing Supabase env vars. Load .env.local first.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const FEB_ROWS = [
  {
    ref: 'FEB26-PNG-001',
    date: '05/02/2026',
    firstName: 'Charlotte',
    lastName: 'Cranstoun',
    personType: 'Employee',
    childInvolved: false,
    storeName: 'Blackpool',
    incidentType: 'Struck by moving object',
    rootCause: 'Human Error',
    injuryArea: 'Head',
    narrative:
      'Employee placed a metal footwear riser on a high shelf, moved the shelf and forgot the riser was on it. The riser fell and caused a small cut on the head.',
    firstAid: 'Alcohol wipe and tissue offered.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-002',
    date: '05/02/2026',
    firstName: 'David',
    lastName: 'Sandham',
    personType: 'Employee',
    childInvolved: false,
    storeName: 'Trafford Mega',
    incidentType: 'Slips, trip or falls on same level',
    rootCause: 'Human Error',
    injuryArea: 'Left Leg',
    narrative:
      'Employee went up stairs jogging, misjudged footing, tripped and banged knee on metal stairs causing a cut to the left knee.',
    firstAid: 'Plaster offered but not required.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-003',
    date: '06/02/2026',
    firstName: 'Singh',
    lastName: 'Cheema',
    personType: 'Employee',
    childInvolved: false,
    storeName: 'Bluewater',
    incidentType: 'Slips, trip or falls on same level',
    rootCause: 'Human Error',
    injuryArea: 'Right Ankle',
    narrative:
      'Employee tripped on POS metal work, hit right ankle on metal work and then fell to the floor.',
    firstAid: 'Ice pack offered.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-004',
    date: '07/02/2026',
    firstName: 'Maireen',
    lastName: 'Hussain',
    personType: 'Employee',
    childInvolved: false,
    storeName: 'White Rose',
    incidentType: 'Cut with something sharp or pointed',
    rootCause: 'Human Error',
    injuryArea: 'Fingers / Thumb Left Hand',
    narrative:
      'Employee was kimbing accessories when the kimbing gun went through the thumb.',
    firstAid: 'Antiseptic wipes and plaster given.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-005',
    date: '07/02/2026',
    firstName: 'Elzbieta',
    lastName: 'Patryiak',
    personType: 'Employee',
    childInvolved: false,
    storeName: '',
    incidentType: 'Illness (Non injury related)',
    rootCause: 'Illness',
    injuryArea: 'No Injury Sustained',
    narrative:
      'Employee felt dizzy, started hearing ringing noises, went pale, lost consciousness and collapsed. Staff lowered them safely. Ambulance was called for checks and employee was sent home.',
    firstAid: 'Drink of water and sweets provided.',
    followUp: 'Ambulance later not required.',
  },
  {
    ref: 'FEB26-PNG-006',
    date: '09/02/2026',
    firstName: 'Casey',
    lastName: 'Ratcliffe',
    personType: 'Employee',
    childInvolved: false,
    storeName: 'P62',
    incidentType: 'Strike against fixed or stationary object',
    rootCause: 'Human Error',
    injuryArea: 'Right Leg',
    narrative:
      'Employee moved to get an item and walked into a pallet previously placed down, cutting the right shin.',
    firstAid: 'Antiseptic wipes and plaster given.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-007',
    date: '10/02/2026',
    firstName: 'Andy',
    lastName: 'Pate',
    personType: 'Employee',
    childInvolved: false,
    storeName: 'Sharp Project',
    incidentType: 'Strike against fixed or stationary object',
    rootCause: 'Human Error',
    injuryArea: 'Head',
    narrative:
      'Employee moved a table and banged the top/side of head on a vent door left down while works were being finished.',
    firstAid: 'Verbal concussion check performed.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-008',
    date: '11/02/2026',
    firstName: 'Seren',
    lastName: 'Wilkinson',
    personType: 'Employee',
    childInvolved: false,
    storeName: 'Wrexham',
    incidentType: 'Fall from height',
    rootCause: 'Human Error',
    injuryArea: 'Left Ankle',
    narrative:
      'Employee walked down stairs while looking at phone, missed a step and fell down three steps.',
    firstAid: 'General medical advice given.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-009',
    date: '12/02/2026',
    firstName: 'Jagger',
    lastName: 'Bolding',
    personType: 'Public',
    childInvolved: true,
    storeName: 'Glasgow Fort',
    incidentType: 'Strike against fixed or stationary object',
    rootCause: 'Human Error',
    injuryArea: 'Knees',
    narrative:
      'Member of public walked into a door and suffered bruising around face/nose and knees.',
    firstAid: 'Seat offered in store; guardian advised they were fine.',
    followUp: 'Store note says face soreness became clearer on camera review.',
  },
  {
    ref: 'FEB26-PNG-010',
    date: '13/02/2026',
    firstName: 'Unknown',
    lastName: 'Unknown',
    personType: 'Public',
    childInvolved: false,
    storeName: 'Thanet',
    incidentType: 'Acts of violence / Physical assault',
    rootCause: 'Deliberate act',
    injuryArea: 'No Injury Sustained',
    narrative:
      'Two members of public started a fist fight outside, entered store and one person was pushed into front door glass.',
    firstAid: 'No treatment provided as individual left without details.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-011',
    date: '14/02/2026',
    firstName: 'Dekosh',
    lastName: 'Setareh',
    personType: 'Public',
    childInvolved: false,
    storeName: 'Trafford Maga',
    incidentType: 'Slips, trip or falls on same level',
    rootCause: 'Human Error',
    injuryArea: 'No Injury Sustained',
    narrative:
      'Member of public walking down stairs became dizzy and fell.',
    firstAid: 'Ice pack offered and declined.',
    followUp: 'Did not want Trafford Centre first aider.',
  },
  {
    ref: 'FEB26-PNG-012',
    date: '16/02/2026',
    firstName: 'Bonnie',
    lastName: 'Williams',
    personType: 'Public',
    childInvolved: true,
    storeName: 'Meadowhall',
    incidentType: 'Illness (Non injury related)',
    rootCause: 'Illness',
    injuryArea: 'Non injury related illness',
    narrative:
      'Member of public felt faint; Meadowhall security was called to assist.',
    firstAid: 'Glass of water provided.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-013',
    date: '16/02/2026',
    firstName: 'Unknown',
    lastName: 'Unknown',
    personType: 'Public',
    childInvolved: true,
    storeName: 'Trafford Mega',
    incidentType: 'Slips, trip or falls on same level',
    rootCause: 'Human Error',
    injuryArea: 'Right Knee',
    narrative:
      'Mother and child walking down front stairs; child tripped on last stair, mother picked child up and checked they were okay.',
    firstAid: 'They left before first aid was offered and did not complete report form.',
    followUp: '',
  },
  {
    ref: 'FEB26-PNG-014',
    date: '19/02/2026',
    firstName: 'Umra',
    lastName: 'Shaheem',
    personType: 'Public',
    childInvolved: false,
    storeName: 'Sharp Project',
    incidentType: 'Cut with something sharp or pointed',
    rootCause: 'Human Error',
    injuryArea: 'Fingers',
    narrative:
      'Model putting on a jumper, clothing tag caught and cut the inside of the finger/nail.',
    firstAid: 'Antiseptic wipe and plaster given.',
    followUp: 'No CCTV in fitting rooms.',
  },
  {
    ref: 'FEB26-PNG-015',
    date: '20/02/2026',
    firstName: 'Uchenngame',
    lastName: 'Ajoh',
    personType: 'Employee',
    childInvolved: false,
    storeName: 'Coventry',
    incidentType: 'Other',
    rootCause: 'Human Error',
    injuryArea: 'Mouth',
    narrative:
      'While staff were pulling down a wall, glass fell and shattered, and some landed on the staff member who reported shards in throat.',
    firstAid: 'Staff requested to wash mouth when asked by ASM.',
    followUp: 'Awaiting further information from store.',
  },
]

const STORE_ALIASES = {
  p62: 'Middleton',
  'trafford maga': 'Trafford Mega',
  'trafford mags': 'Trafford Mega',
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function toIsoAtNoon(dateString) {
  const [dd, mm, yyyy] = dateString.split('/')
  if (!dd || !mm || !yyyy) throw new Error(`Invalid date: ${dateString}`)
  return `${yyyy}-${mm}-${dd}T12:00:00Z`
}

function mapCategory(incidentType) {
  const t = normalize(incidentType)
  if (t.includes('violence') || t.includes('assault')) return 'security'
  if (t.includes('illness')) return 'health_safety'
  if (t.includes('near miss')) return 'near_miss'
  if (t === 'other') return 'other'
  return 'accident'
}

function mapSeverity(row) {
  const detail = `${row.injuryArea} ${row.narrative} ${row.followUp}`.toLowerCase()
  if (detail.includes('no injury')) return 'low'
  if (detail.includes('ambulance') || detail.includes('concussion') || detail.includes('lost consciousness')) {
    return 'medium'
  }
  return 'low'
}

function buildSummary(row) {
  const parts = [row.incidentType, row.injuryArea, row.personType]
  return parts.filter(Boolean).join(' - ').slice(0, 500)
}

function buildDescription(row) {
  return [row.narrative, row.firstAid ? `First aid: ${row.firstAid}` : '', row.followUp ? `Follow-up: ${row.followUp}` : '']
    .filter(Boolean)
    .join('\n\n')
}

async function ensureStoreId(rowStoreName, storeMap) {
  if (!rowStoreName) return null
  const alias = STORE_ALIASES[normalize(rowStoreName)]
  const resolvedName = alias || rowStoreName
  const key = normalize(resolvedName)

  if (storeMap.has(key)) return storeMap.get(key)

  const safeCode = `EXT-${resolvedName.replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}`
  const { data, error } = await supabase
    .from('fa_stores')
    .insert({
      store_name: resolvedName,
      store_code: safeCode || null,
      is_active: true,
    })
    .select('id, store_name')
    .single()

  if (error) throw new Error(`Could not create store "${resolvedName}": ${error.message}`)
  storeMap.set(key, data.id)
  return data.id
}

async function main() {
  const { data: profiles, error: profileErr } = await supabase
    .from('fa_profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)

  if (profileErr) throw new Error(`Failed loading profiles: ${profileErr.message}`)
  const defaultUserId = profiles?.[0]?.id
  if (!defaultUserId) throw new Error('No fa_profiles row available for reported_by_user_id.')

  const { data: stores, error: storesErr } = await supabase
    .from('fa_stores')
    .select('id, store_name')

  if (storesErr) throw new Error(`Failed loading stores: ${storesErr.message}`)
  const storeMap = new Map()
  for (const store of stores || []) {
    storeMap.set(normalize(store.store_name), store.id)
  }

  const refs = FEB_ROWS.map((row) => row.ref)
  const { data: existing, error: existingErr } = await supabase
    .from('fa_incidents')
    .select('reference_no')
    .in('reference_no', refs)

  if (existingErr) throw new Error(`Failed checking existing refs: ${existingErr.message}`)
  const existingRefs = new Set((existing || []).map((row) => row.reference_no))

  let imported = 0
  let skippedExisting = 0
  let skippedMissingStore = 0

  for (const row of FEB_ROWS) {
    if (existingRefs.has(row.ref)) {
      skippedExisting++
      continue
    }

    const storeId = await ensureStoreId(row.storeName, storeMap)
    if (!storeId) {
      skippedMissingStore++
      console.warn(`Skipping ${row.ref}: missing store in source row (${row.firstName} ${row.lastName})`)
      continue
    }

    const occurredAt = toIsoAtNoon(row.date)
    const incidentCategory = mapCategory(row.incidentType)
    const severity = mapSeverity(row)
    const summary = buildSummary(row)
    const description = buildDescription(row)

    const { data: insertedIncident, error: insertErr } = await supabase
      .from('fa_incidents')
      .insert({
      reference_no: row.ref,
      source_reference: `png-feb-2026:${row.ref}`,
      store_id: storeId,
      reported_by_user_id: defaultUserId,
      incident_category: incidentCategory,
      severity,
      summary,
      description,
      occurred_at: occurredAt,
      reported_at: occurredAt,
      persons_involved: {
        person_type: row.personType,
        first_name: row.firstName,
        last_name: row.lastName,
        child_involved: row.childInvolved,
      },
      injury_details: {
        incident_type: row.incidentType,
        root_cause: row.rootCause,
        injury_area: row.injuryArea,
      },
      riddor_reportable: false,
      status: 'closed',
      closed_at: occurredAt,
      closure_summary: 'Imported from February 2026 PNG incident sheet.',
      })
      .select('id')
      .single()

    if (insertErr) {
      throw new Error(`Failed inserting ${row.ref}: ${insertErr.message}`)
    }

    const { error: invErr } = await supabase.from('fa_investigations').insert({
      incident_id: insertedIncident.id,
      investigation_type: 'formal',
      status: 'complete',
      lead_investigator_user_id: defaultUserId,
      root_cause: row.rootCause || null,
      findings: description || null,
      recommendations: row.followUp || null,
      started_at: occurredAt,
      completed_at: occurredAt,
    })

    if (invErr) {
      throw new Error(`Failed creating investigation for ${row.ref}: ${invErr.message}`)
    }

    imported++
  }

  console.log(
    JSON.stringify(
      {
        imported,
        skippedExisting,
        skippedMissingStore,
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
