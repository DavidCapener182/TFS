begin;

alter table public.tfs_store_visits
  add column if not exists completed_activity_payloads jsonb not null default '{}'::jsonb;

update public.tfs_store_visits
set completed_activity_payloads = '{}'::jsonb
where completed_activity_payloads is null;

alter table public.tfs_store_visits
  drop constraint if exists tfs_store_visits_activity_payloads_object_check;

alter table public.tfs_store_visits
  add constraint tfs_store_visits_activity_payloads_object_check
  check (jsonb_typeof(completed_activity_payloads) = 'object');

comment on column public.tfs_store_visits.completed_activity_payloads is
  'Structured visit activity data keyed by completed visit activity.';

create table if not exists public.tfs_store_visit_evidence (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.tfs_store_visits(id) on delete cascade,
  activity_key text not null,
  file_name text not null,
  file_path text not null,
  file_type text null,
  file_size bigint null,
  uploaded_by_user_id uuid not null references public.fa_profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.tfs_store_visit_evidence is
  'Documents and supporting evidence uploaded against structured store visit activities.';

create index if not exists tfs_store_visit_evidence_visit_idx
  on public.tfs_store_visit_evidence (visit_id, created_at desc);

create index if not exists tfs_store_visit_evidence_activity_idx
  on public.tfs_store_visit_evidence (activity_key, created_at desc);

grant select, insert, delete on public.tfs_store_visit_evidence to authenticated;
grant all on public.tfs_store_visit_evidence to service_role;

alter table public.tfs_store_visit_evidence enable row level security;

drop policy if exists tfs_store_visit_evidence_select_authenticated on public.tfs_store_visit_evidence;
create policy tfs_store_visit_evidence_select_authenticated
on public.tfs_store_visit_evidence
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_store_visit_evidence_insert_self on public.tfs_store_visit_evidence;
create policy tfs_store_visit_evidence_insert_self
on public.tfs_store_visit_evidence
for insert
to authenticated
with check (
  auth.uid() = uploaded_by_user_id
  and public.tfs_current_user_role() in ('admin', 'ops')
);

drop policy if exists tfs_store_visit_evidence_delete_admin_ops on public.tfs_store_visit_evidence;
create policy tfs_store_visit_evidence_delete_admin_ops
on public.tfs_store_visit_evidence
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

commit;
