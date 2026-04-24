begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tfs_case_stage') then
    create type public.tfs_case_stage as enum (
      'new_submission',
      'under_review',
      'action_agreed',
      'visit_required',
      'awaiting_follow_up',
      'ready_to_close',
      'closed'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tfs_intake_source') then
    create type public.tfs_intake_source as enum (
      'store_portal',
      'legacy_incident',
      'legacy_store_action',
      'manual_internal',
      'visit_follow_up',
      'report_workflow'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tfs_review_outcome') then
    create type public.tfs_review_outcome as enum (
      'acknowledged_only',
      'store_action_created',
      'visit_required',
      'incident_escalated',
      'closed_no_further_action'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tfs_visit_outcome') then
    create type public.tfs_visit_outcome as enum (
      'no_further_action',
      'follow_up_visit_required',
      'store_action_created',
      'incident_task_created',
      'escalated_to_manager',
      'report_required'
    );
  end if;
end $$;

create table if not exists public.tfs_cases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  case_type text not null,
  intake_source public.tfs_intake_source not null,
  origin_reference text null,
  severity text not null default 'medium',
  owner_user_id uuid null references public.fa_profiles(id) on delete set null,
  due_at timestamptz null,
  stage public.tfs_case_stage not null default 'new_submission',
  next_action_code text null,
  next_action_label text null,
  last_update_summary text null,
  review_outcome public.tfs_review_outcome null,
  closure_outcome text null,
  closed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_cases_case_type_not_blank check (btrim(case_type) <> ''),
  constraint tfs_cases_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  )
);

create table if not exists public.tfs_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tfs_cases(id) on delete cascade,
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  event_type text not null,
  stage public.tfs_case_stage null,
  summary text not null,
  detail text null,
  actor_user_id uuid null references public.fa_profiles(id) on delete set null,
  event_at timestamptz not null default timezone('utc', now()),
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint tfs_case_events_event_type_not_blank check (btrim(event_type) <> ''),
  constraint tfs_case_events_summary_not_blank check (btrim(summary) <> '')
);

create table if not exists public.tfs_case_links (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tfs_cases(id) on delete cascade,
  link_role text not null,
  target_table text not null,
  target_id uuid not null,
  label text null,
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint tfs_case_links_role_check check (
    link_role in ('origin', 'result', 'blocking', 'evidence')
  ),
  constraint tfs_case_links_target_table_not_blank check (btrim(target_table) <> '')
);

create table if not exists public.tfs_visits (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tfs_cases(id) on delete cascade,
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  visit_type text not null default 'follow_up',
  status text not null default 'planned',
  scheduled_for timestamptz null,
  assigned_user_id uuid null references public.fa_profiles(id) on delete set null,
  started_at timestamptz null,
  completed_at timestamptz null,
  visit_outcome public.tfs_visit_outcome null,
  outcome_summary text null,
  linked_store_visit_id uuid null references public.tfs_store_visits(id) on delete set null,
  created_by_user_id uuid null references public.fa_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_visits_visit_type_check check (
    visit_type in ('action_led', 'planned', 'random_area', 'follow_up', 'targeted')
  ),
  constraint tfs_visits_status_check check (
    status in ('planned', 'in_progress', 'completed', 'cancelled')
  )
);

comment on table public.tfs_cases is
  'Primary operational work item for the TFS case-driven workflow.';
comment on table public.tfs_case_events is
  'Chronological timeline for every case decision, action, visit, report, and closure event.';
comment on table public.tfs_case_links is
  'Links legacy and new operational records to TFS cases with explicit roles.';
comment on table public.tfs_visits is
  'Case-driven visit execution records that sit alongside the legacy store visit log.';

create index if not exists tfs_cases_stage_due_idx
  on public.tfs_cases (stage, due_at, updated_at desc);

create index if not exists tfs_cases_store_stage_idx
  on public.tfs_cases (store_id, stage, updated_at desc);

create index if not exists tfs_cases_owner_stage_idx
  on public.tfs_cases (owner_user_id, stage, due_at);

create index if not exists tfs_case_events_case_event_at_idx
  on public.tfs_case_events (case_id, event_at desc);

create index if not exists tfs_case_events_store_event_at_idx
  on public.tfs_case_events (store_id, event_at desc);

create unique index if not exists tfs_case_links_origin_target_idx
  on public.tfs_case_links (target_table, target_id)
  where link_role = 'origin';

create unique index if not exists tfs_case_links_case_target_role_idx
  on public.tfs_case_links (case_id, target_table, target_id, link_role);

create index if not exists tfs_case_links_case_role_idx
  on public.tfs_case_links (case_id, link_role);

create index if not exists tfs_visits_case_status_idx
  on public.tfs_visits (case_id, status, scheduled_for);

create index if not exists tfs_visits_store_status_idx
  on public.tfs_visits (store_id, status, scheduled_for);

drop trigger if exists set_tfs_cases_updated_at on public.tfs_cases;
create trigger set_tfs_cases_updated_at
before update on public.tfs_cases
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_visits_updated_at on public.tfs_visits;
create trigger set_tfs_visits_updated_at
before update on public.tfs_visits
for each row
execute function public.tfs_set_updated_at();

grant select, insert, update, delete on public.tfs_cases to authenticated;
grant all on public.tfs_cases to service_role;
grant select, insert, update, delete on public.tfs_case_events to authenticated;
grant all on public.tfs_case_events to service_role;
grant select, insert, update, delete on public.tfs_case_links to authenticated;
grant all on public.tfs_case_links to service_role;
grant select, insert, update, delete on public.tfs_visits to authenticated;
grant all on public.tfs_visits to service_role;

alter table public.tfs_cases enable row level security;
alter table public.tfs_case_events enable row level security;
alter table public.tfs_case_links enable row level security;
alter table public.tfs_visits enable row level security;

drop policy if exists tfs_cases_select_authenticated on public.tfs_cases;
create policy tfs_cases_select_authenticated
on public.tfs_cases
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_cases_insert_admin_ops on public.tfs_cases;
create policy tfs_cases_insert_admin_ops
on public.tfs_cases
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_cases_update_admin_ops on public.tfs_cases;
create policy tfs_cases_update_admin_ops
on public.tfs_cases
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_cases_delete_admin_ops on public.tfs_cases;
create policy tfs_cases_delete_admin_ops
on public.tfs_cases
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_case_events_select_authenticated on public.tfs_case_events;
create policy tfs_case_events_select_authenticated
on public.tfs_case_events
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_case_events_insert_admin_ops on public.tfs_case_events;
create policy tfs_case_events_insert_admin_ops
on public.tfs_case_events
for insert
to authenticated
with check (
  public.tfs_current_user_role() in ('admin', 'ops')
  and (actor_user_id is null or actor_user_id = auth.uid())
);

drop policy if exists tfs_case_events_update_admin_ops on public.tfs_case_events;
create policy tfs_case_events_update_admin_ops
on public.tfs_case_events
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_case_events_delete_admin_ops on public.tfs_case_events;
create policy tfs_case_events_delete_admin_ops
on public.tfs_case_events
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_case_links_select_authenticated on public.tfs_case_links;
create policy tfs_case_links_select_authenticated
on public.tfs_case_links
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_case_links_insert_admin_ops on public.tfs_case_links;
create policy tfs_case_links_insert_admin_ops
on public.tfs_case_links
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_case_links_update_admin_ops on public.tfs_case_links;
create policy tfs_case_links_update_admin_ops
on public.tfs_case_links
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_case_links_delete_admin_ops on public.tfs_case_links;
create policy tfs_case_links_delete_admin_ops
on public.tfs_case_links
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_visits_select_authenticated on public.tfs_visits;
create policy tfs_visits_select_authenticated
on public.tfs_visits
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_visits_insert_admin_ops on public.tfs_visits;
create policy tfs_visits_insert_admin_ops
on public.tfs_visits
for insert
to authenticated
with check (
  public.tfs_current_user_role() in ('admin', 'ops')
  and (created_by_user_id is null or created_by_user_id = auth.uid())
);

drop policy if exists tfs_visits_update_admin_ops on public.tfs_visits;
create policy tfs_visits_update_admin_ops
on public.tfs_visits
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_visits_delete_admin_ops on public.tfs_visits;
create policy tfs_visits_delete_admin_ops
on public.tfs_visits
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

commit;
