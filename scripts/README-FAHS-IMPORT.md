# FAHS Incident & Claims Import

Import incidents and claims from the FAHS (Footasylum Health & Safety) dashboard into the KSS incidents section.

## Prerequisites

1. **Same Supabase project** – FAHS and KSS tables live in the same database.
2. **Migration 019 applied** – `fa_claims` table must exist.
3. **At least one user** – `fa_profiles` must have at least one row (used as `reported_by_user_id`).
4. **FAHS tables** – `FAHS_incidents`, `FAHS_claims`, `FAHS_sites` (or equivalent names).

## Table name mapping

If your FAHS tables use different names, edit `scripts/import-fahs-incidents.ts`:

```ts
const SOURCE_INCIDENTS = 'FAHS_incidents'  // or "FAHS-incidents", "fahs_incidents"
const SOURCE_CLAIMS = 'FAHS_claims'
const SOURCE_SITES = 'FAHS_sites'
```

## Run the import

```bash
# From project root, with .env.local loaded
npx tsx scripts/import-fahs-incidents.ts
```

Requires `SUPABASE_SERVICE_ROLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and `NEXT_PUBLIC_SUPABASE_URL`.

## What it does

1. **Site mapping** – Matches `site_name` from FAHS to `fa_stores.store_name`. Adds any FAHS sites not in `fa_stores`.
2. **Incidents** – Inserts into `fa_incidents` with `reference_no` = FAHS id (e.g. DEC-025). Creates `fa_investigations` with `root_cause`.
3. **Claims** – Inserts into `fa_claims`, linking to incidents via `incident_id` when FAHS `incident_id` matches (e.g. CLM-002 → DEC-025).

## Field mapping

| FAHS | KSS |
|------|-----|
| id | reference_no, source_reference |
| incident_date | occurred_at |
| site_name | store_id (via fa_stores) |
| person_type | persons_involved.person_type |
| incident_type | incident_category |
| riddor_reportable | riddor_reportable |
| root_cause | fa_investigations.root_cause |
| accident_type | (in summary/description) |
| severity | severity |
| narrative | summary, description |
| child_involved | persons_involved.child_involved |
| status | status |

## After import

- Incidents appear in `/incidents`.
- Claims require a Claims & RIDDOR UI (similar to the FAHS dashboard) – the `fa_claims` table is ready for that.
