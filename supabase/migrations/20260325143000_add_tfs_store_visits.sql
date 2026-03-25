begin;

create table if not exists public.tfs_store_visits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  visit_type text not null,
  visited_at timestamptz not null default timezone('utc', now()),
  completed_activity_keys text[] not null default '{}'::text[],
  notes text null,
  follow_up_required boolean not null default false,
  need_score_snapshot integer not null default 0,
  need_level_snapshot text not null default 'none',
  need_reasons_snapshot jsonb null,
  created_by_user_id uuid not null references public.fa_profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_store_visits_type_check check (
    visit_type in ('action_led', 'planned', 'random_area', 'follow_up')
  ),
  constraint tfs_store_visits_need_level_check check (
    need_level_snapshot in ('none', 'monitor', 'needed', 'urgent')
  ),
  constraint tfs_store_visits_need_score_check check (
    need_score_snapshot >= 0 and need_score_snapshot <= 100
  )
);

comment on table public.tfs_store_visits is 'Dedicated LP / security visit records for the visit tracker.';

create index if not exists tfs_store_visits_store_visited_at_idx
  on public.tfs_store_visits (store_id, visited_at desc);

create index if not exists tfs_store_visits_type_visited_at_idx
  on public.tfs_store_visits (visit_type, visited_at desc);

drop trigger if exists set_tfs_store_visits_updated_at on public.tfs_store_visits;
create trigger set_tfs_store_visits_updated_at
before update on public.tfs_store_visits
for each row
execute function public.tfs_set_updated_at();

grant select, insert, update, delete on public.tfs_store_visits to authenticated;
grant all on public.tfs_store_visits to service_role;

alter table public.tfs_store_visits enable row level security;

drop policy if exists tfs_store_visits_select_authenticated on public.tfs_store_visits;
create policy tfs_store_visits_select_authenticated
on public.tfs_store_visits
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_store_visits_insert_self on public.tfs_store_visits;
create policy tfs_store_visits_insert_self
on public.tfs_store_visits
for insert
to authenticated
with check (
  auth.uid() = created_by_user_id
  and public.tfs_current_user_role() in ('admin', 'ops')
);

drop policy if exists tfs_store_visits_update_admin_ops on public.tfs_store_visits;
create policy tfs_store_visits_update_admin_ops
on public.tfs_store_visits
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_store_visits_delete_admin_ops on public.tfs_store_visits;
create policy tfs_store_visits_delete_admin_ops
on public.tfs_store_visits
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

commit;
