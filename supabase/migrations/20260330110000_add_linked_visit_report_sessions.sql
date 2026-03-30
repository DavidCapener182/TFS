begin;

alter table public.tfs_store_visits
  add column if not exists status text not null default 'completed';

update public.tfs_store_visits
set status = 'completed'
where status is null;

alter table public.tfs_store_visits
  drop constraint if exists tfs_store_visits_status_check;

alter table public.tfs_store_visits
  add constraint tfs_store_visits_status_check
  check (status in ('draft', 'completed'));

create index if not exists tfs_store_visits_status_store_visited_idx
  on public.tfs_store_visits (status, store_id, visited_at desc);

alter table public.tfs_visit_reports
  add column if not exists store_visit_id uuid null references public.tfs_store_visits(id) on delete set null;

alter table public.tfs_visit_reports
  drop constraint if exists tfs_visit_reports_report_type_check;

alter table public.tfs_visit_reports
  add constraint tfs_visit_reports_report_type_check check (
    report_type in (
      'targeted_theft_visit',
      'checked_banking',
      'completed_till_checks',
      'completed_line_checks',
      'supported_investigation',
      'reviewed_cctv_or_alarm',
      'reviewed_loss_controls',
      'conducted_stop_on_close',
      'took_statements_or_interviews',
      'reviewed_paperwork_or_processes',
      'reviewed_stock_loss_or_counts',
      'checked_delivery_or_parcel_issue',
      'reviewed_security_procedures',
      'provided_store_support_or_training',
      'other'
    )
  );

create index if not exists tfs_visit_reports_store_visit_idx
  on public.tfs_visit_reports (store_visit_id, updated_at desc);

with matched_links as (
  select distinct on (vr.id)
    vr.id as report_id,
    sv.id as store_visit_id
  from public.tfs_visit_reports vr
  join public.tfs_store_visits sv
    on sv.store_id = vr.store_id
   and coalesce(sv.notes, '') ilike '%' || ('Source visit report ID: ' || vr.id::text) || '%'
  where vr.store_visit_id is null
  order by vr.id, sv.visited_at desc, sv.created_at desc
)
update public.tfs_visit_reports vr
set store_visit_id = matched_links.store_visit_id
from matched_links
where vr.id = matched_links.report_id;

comment on column public.tfs_visit_reports.store_visit_id is
  'Optional canonical link to the visit tracker session this report belongs to.';

comment on column public.tfs_store_visits.status is
  'Visit tracker session lifecycle. Draft sessions can collect multiple linked reports before completion.';

commit;
