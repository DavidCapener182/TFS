-- One-off cleanup: remove April 2026 store-theft inbound email rows used in monthly reports.
-- Run in Supabase SQL editor after reviewing the SELECT. Not applied by migrate automatically.
--
-- Store codes in `tfs_stores` may be unpadded (e.g. "16", "42") while the UI sometimes
-- showed "016"/"042". Include both forms so DELETE matches what the monthly report shows.

begin;

-- Preview first — confirm ids before delete:
-- select e.id, e.received_at::date, s.store_code, s.store_name, e.subject
-- from tfs_inbound_emails e
-- join tfs_stores s on s.id = e.matched_store_id
-- where e.analysis_template_key = 'store_theft'
--   and s.store_code in ('016','16','042','42','201','306','392')
--   and e.received_at >= '2026-04-01'
--   and e.received_at < '2026-05-01'
-- order by e.received_at desc;

delete from tfs_inbound_emails e
using tfs_stores s
where e.matched_store_id = s.id
  and e.analysis_template_key = 'store_theft'
  and s.store_code in ('016','16','042','42','201','306','392')
  and e.received_at >= '2026-04-01'
  and e.received_at < '2026-05-01';

commit;
