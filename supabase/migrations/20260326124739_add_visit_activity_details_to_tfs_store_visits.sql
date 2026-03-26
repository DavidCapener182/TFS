begin;

alter table public.tfs_store_visits
  add column if not exists completed_activity_details jsonb not null default '{}'::jsonb;

update public.tfs_store_visits
set completed_activity_details = '{}'::jsonb
where completed_activity_details is null;

alter table public.tfs_store_visits
  drop constraint if exists tfs_store_visits_activity_details_object_check;

alter table public.tfs_store_visits
  add constraint tfs_store_visits_activity_details_object_check
  check (jsonb_typeof(completed_activity_details) = 'object');

comment on column public.tfs_store_visits.completed_activity_details is
  'Optional free-text notes keyed by completed visit activity.';

commit;
