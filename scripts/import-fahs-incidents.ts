/**
 * Import FAHS incidents and claims into FootAsylumKSS fa_incidents, fa_investigations, fa_claims.
 *
 * Prerequisites:
 * - Same Supabase project
 * - FAHS tables exist: FAHS_incidents, FAHS_claims, FAHS_sites (or "FAHS-incidents" etc - update SOURCE_TABLES below)
 * - fa_claims table created (migration 019)
 * - At least one fa_profiles user for reported_by_user_id
 *
 * Run: npx tsx scripts/import-fahs-incidents.ts
 *
 * Set env: SUPABASE_SERVICE_ROLE_KEY or use .env.local
 */

import { createClient } from '@supabase/supabase-js'

// FAHS tables (hyphenated names as in Supabase)
const SOURCE_INCIDENTS = 'FAHS-incidents'
const SOURCE_CLAIMS = 'FAHS-claims'
const SOURCE_SITES = 'FAHS-sites'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

function mapSeverity(s: string): 'low' | 'medium' | 'high' | 'critical' {
  const v = (s || '').toLowerCase()
  if (v === 'critical' || v === 'major') return 'high'
  if (v === 'moderate') return 'medium'
  return 'low'
}

function mapCategory(incidentType: string, personType: string): 'accident' | 'near_miss' | 'health_safety' | 'other' {
  const t = (incidentType || '').toLowerCase()
  if (t === 'nearmiss' || t === 'near miss') return 'near_miss'
  if (t === 'accident') return 'accident'
  return 'health_safety'
}

function mapStatus(s: string): 'open' | 'under_investigation' | 'actions_in_progress' | 'closed' | 'cancelled' {
  const v = (s || '').toLowerCase()
  if (v === 'closed') return 'closed'
  if (v === 'open') return 'under_investigation'
  return 'open'
}

async function main() {
  const supabase = getSupabase()

  // Get default user (first admin or first profile)
  const { data: profiles } = await supabase.from('fa_profiles').select('id').limit(1)
  const defaultUserId = profiles?.[0]?.id
  if (!defaultUserId) {
    throw new Error('No fa_profiles found. Create at least one user first.')
  }
  console.log('Using default user:', defaultUserId)

  // Build site_name -> store_id map
  const { data: stores } = await supabase.from('fa_stores').select('id, store_name')
  const storeByName = new Map<string, string>()
  for (const s of stores || []) {
    storeByName.set((s.store_name || '').trim().toLowerCase(), s.id)
  }

  // Add FAHS sites not in fa_stores
  try {
    const { data: fahsSites } = await supabase.from(SOURCE_SITES).select('id, name, business_area, region')
    for (const site of fahsSites || []) {
      const name = (site.name || '').trim()
      const key = name.toLowerCase()
      if (!name || storeByName.has(key)) continue
      const { data: inserted } = await supabase
        .from('fa_stores')
        .insert({
          store_name: name,
          store_code: `FAHS-${(site.id || '').slice(0, 8)}`,
          region: site.region || null,
          is_active: true,
        })
        .select('id')
        .single()
      if (inserted) {
        storeByName.set(key, inserted.id)
        console.log('Added store:', name)
      }
    }
  } catch (e) {
    console.warn('Could not load FAHS_sites (table may not exist):', (e as Error).message)
  }

  const getStoreId = (siteName: string): string | null => {
    if (!siteName || siteName === 'Unknown') return null
    return storeByName.get(siteName.trim().toLowerCase()) ?? null
  }

  // Fetch FAHS incidents
  const { data: incidents, error: incErr } = await supabase
    .from(SOURCE_INCIDENTS)
    .select('*')
    .order('incident_date', { ascending: true })

  if (incErr) {
    throw new Error(`Failed to fetch ${SOURCE_INCIDENTS}: ${incErr.message}. Check table name.`)
  }
  console.log('Found', incidents?.length ?? 0, 'FAHS incidents')

  const fahsIdToFaId = new Map<string, string>()
  let imported = 0
  let skipped = 0

  // Existing incidents by reference_no (for idempotent re-runs)
  const { data: existing } = await supabase
    .from('fa_incidents')
    .select('id, reference_no')
    .in('reference_no', (incidents || []).map((i) => i.id))
  for (const e of existing || []) {
    fahsIdToFaId.set(e.reference_no, e.id)
  }

  for (const inc of incidents || []) {
    const siteName = inc.site_name || ''
    const storeId = getStoreId(siteName)
    if (!storeId) {
      console.warn('Skipping incident', inc.id, '- no store for site:', siteName)
      skipped++
      continue
    }

    if (fahsIdToFaId.has(inc.id)) {
      skipped++
      continue
    }

    const occurredAt = inc.incident_date ? `${inc.incident_date}T12:00:00Z` : new Date().toISOString()
    const status = mapStatus(inc.status)
    const { data: inserted } = await supabase
      .from('fa_incidents')
      .insert({
        reference_no: inc.id,
        source_reference: inc.id,
        store_id: storeId,
        reported_by_user_id: defaultUserId,
        incident_category: mapCategory(inc.incident_type, inc.person_type),
        severity: mapSeverity(inc.severity),
        summary: (inc.narrative || '').slice(0, 500) || 'Imported from FAHS',
        description: inc.narrative || null,
        occurred_at: occurredAt,
        reported_at: occurredAt,
        persons_involved: {
          person_type: inc.person_type,
          child_involved: inc.child_involved,
        },
        riddor_reportable: !!inc.riddor_reportable,
        status,
        closed_at: status === 'closed' ? occurredAt : null,
        closure_summary: status === 'closed' ? 'Imported from FAHS' : null,
      })
      .select('id')
      .single()

    if (inserted) {
      fahsIdToFaId.set(inc.id, inserted.id)
      imported++

      // Create investigation with root_cause
      if (inc.root_cause || inc.actions_required) {
        const invStatus = inc.investigation_status === 'Completed' ? 'complete' : 'in_progress'
        await supabase.from('fa_investigations').insert({
          incident_id: inserted.id,
          investigation_type: 'formal',
          status: invStatus,
          lead_investigator_user_id: defaultUserId,
          root_cause: inc.root_cause || null,
          recommendations: inc.actions_required || null,
          findings: inc.narrative || null,
          started_at: occurredAt,
          completed_at: invStatus === 'complete' ? occurredAt : null,
        })
      }
    }
  }

  console.log('Imported', imported, 'incidents, skipped', skipped)

  // Import claims
  const { data: claims, error: clmErr } = await supabase
    .from(SOURCE_CLAIMS)
    .select('*')
    .order('received_date', { ascending: true })

  if (clmErr) {
    console.warn('Could not fetch claims:', clmErr.message)
  } else if (claims?.length) {
    const { data: existingClaims } = await supabase
      .from('fa_claims')
      .select('reference_no')
      .in('reference_no', claims.map((c) => c.id))
    const existingClaimIds = new Set((existingClaims || []).map((x) => x.reference_no))
    let claimsImported = 0
    for (const c of claims) {
      if (existingClaimIds.has(c.id)) continue
      const storeId = getStoreId(c.site_name || '')
      if (!storeId) {
        console.warn('Skipping claim', c.id, '- no store for site:', c.site_name)
        continue
      }
      const incidentId = c.incident_id ? fahsIdToFaId.get(c.incident_id) ?? null : null
      const { error: claimErr } = await supabase.from('fa_claims').insert({
        reference_no: c.id,
        incident_id: incidentId,
        store_id: storeId,
        received_date: c.received_date,
        claimant_type: c.claimant_type || 'Public',
        allegation: c.allegation || 'No allegation recorded',
        insurer_notified: !!c.insurer_notified,
        status: c.status || 'Open',
        evidence_cctv: !!c.evidence_cctv,
        evidence_photos: !!c.evidence_photos,
        evidence_statements: !!c.evidence_statements,
        evidence_ra_sop: !!c.evidence_ra_sop,
        next_action: c.next_action || null,
        owner: c.owner || null,
        due_date: c.due_date || null,
      })
      if (!claimErr) claimsImported++
    }
    console.log('Imported', claimsImported, 'claims')
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
