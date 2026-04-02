begin;

create table if not exists public.tfs_route_operational_items (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references public.fa_profiles(id) on delete cascade,
  planned_date date not null,
  region text null,
  title text not null,
  location text null,
  start_time time not null,
  duration_minutes integer not null default 30,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_route_operational_items_title_not_blank check (btrim(title) <> ''),
  constraint tfs_route_operational_items_duration_positive check (duration_minutes > 0)
);

create table if not exists public.tfs_route_visit_times (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references public.fa_profiles(id) on delete cascade,
  planned_date date not null,
  region text null,
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_route_visit_times_time_order check (end_time > start_time)
);

create unique index if not exists tfs_route_visit_times_unique_slot_idx
  on public.tfs_route_visit_times (manager_user_id, planned_date, region, store_id);

create index if not exists tfs_route_operational_items_lookup_idx
  on public.tfs_route_operational_items (manager_user_id, planned_date, region, start_time);

create index if not exists tfs_route_visit_times_lookup_idx
  on public.tfs_route_visit_times (manager_user_id, planned_date, region, start_time);

drop trigger if exists set_tfs_route_operational_items_updated_at on public.tfs_route_operational_items;
create trigger set_tfs_route_operational_items_updated_at
before update on public.tfs_route_operational_items
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_route_visit_times_updated_at on public.tfs_route_visit_times;
create trigger set_tfs_route_visit_times_updated_at
before update on public.tfs_route_visit_times
for each row
execute function public.tfs_set_updated_at();

grant select, insert, update, delete on public.tfs_route_operational_items to authenticated;
grant all on public.tfs_route_operational_items to service_role;
grant select, insert, update, delete on public.tfs_route_visit_times to authenticated;
grant all on public.tfs_route_visit_times to service_role;

alter table public.tfs_route_operational_items enable row level security;
alter table public.tfs_route_visit_times enable row level security;

drop policy if exists tfs_route_operational_items_select_authenticated on public.tfs_route_operational_items;
create policy tfs_route_operational_items_select_authenticated
on public.tfs_route_operational_items
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_route_operational_items_insert_admin_ops on public.tfs_route_operational_items;
create policy tfs_route_operational_items_insert_admin_ops
on public.tfs_route_operational_items
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_route_operational_items_update_admin_ops on public.tfs_route_operational_items;
create policy tfs_route_operational_items_update_admin_ops
on public.tfs_route_operational_items
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_route_operational_items_delete_admin_ops on public.tfs_route_operational_items;
create policy tfs_route_operational_items_delete_admin_ops
on public.tfs_route_operational_items
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_route_visit_times_select_authenticated on public.tfs_route_visit_times;
create policy tfs_route_visit_times_select_authenticated
on public.tfs_route_visit_times
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_route_visit_times_insert_admin_ops on public.tfs_route_visit_times;
create policy tfs_route_visit_times_insert_admin_ops
on public.tfs_route_visit_times
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_route_visit_times_update_admin_ops on public.tfs_route_visit_times;
create policy tfs_route_visit_times_update_admin_ops
on public.tfs_route_visit_times
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_route_visit_times_delete_admin_ops on public.tfs_route_visit_times;
create policy tfs_route_visit_times_delete_admin_ops
on public.tfs_route_visit_times
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

do $$
begin
  if to_regclass('public.fa_route_operational_items') is not null then
    insert into public.tfs_route_operational_items (
      id,
      manager_user_id,
      planned_date,
      region,
      title,
      location,
      start_time,
      duration_minutes,
      created_at,
      updated_at
    )
    select
      id,
      manager_user_id,
      planned_date,
      region,
      title,
      location,
      start_time,
      duration_minutes,
      coalesce(created_at, timezone('utc', now())),
      coalesce(updated_at, timezone('utc', now()))
    from public.fa_route_operational_items
    on conflict (id) do nothing;
  end if;
end $$;

do $$
begin
  if to_regclass('public.fa_route_visit_times') is not null then
    insert into public.tfs_route_visit_times (
      id,
      manager_user_id,
      planned_date,
      region,
      store_id,
      start_time,
      end_time,
      created_at,
      updated_at
    )
    select
      legacy.id,
      legacy.manager_user_id,
      legacy.planned_date,
      legacy.region,
      legacy.store_id,
      legacy.start_time,
      legacy.end_time,
      coalesce(legacy.created_at, timezone('utc', now())),
      coalesce(legacy.updated_at, timezone('utc', now()))
    from public.fa_route_visit_times legacy
    inner join public.tfs_stores stores
      on stores.id = legacy.store_id
    inner join public.fa_profiles profiles
      on profiles.id = legacy.manager_user_id
    on conflict (id) do nothing;
  end if;
end $$;

commit;
