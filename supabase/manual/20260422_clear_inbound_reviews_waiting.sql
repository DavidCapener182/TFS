-- Option A — Wipe ALL inbound email rows (fresh start).
-- Clears: Dashboard "Reviews waiting", /inbound-emails queue, visit-tracker email
-- flags tied to this table, and monthly-report rows sourced from inbound emails.
-- Does NOT delete store-portal incidents, visits, or CRM data elsewhere.
--
-- Run in Supabase SQL editor. Preview count first.

select count(*) as tfs_inbound_emails_before from public.tfs_inbound_emails;

begin;

delete from public.tfs_inbound_emails;

commit;

select count(*) as tfs_inbound_emails_after from public.tfs_inbound_emails;

-- ---------------------------------------------------------------------------
-- Option B (alternative) — Keep rows, only stop them from queuing:
--
-- update public.tfs_inbound_emails
-- set
--   processing_status = 'reviewed',
--   analysis_needs_action = false,
--   analysis_needs_visit = false,
--   analysis_needs_incident = false,
--   last_error = null,
--   analysis_error = null;
