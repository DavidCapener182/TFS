begin;

create table if not exists public.tfs_visit_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  report_type text not null,
  status text not null default 'draft',
  title text not null,
  visit_date date not null,
  summary text null,
  payload jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references public.fa_profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_visit_reports_report_type_check check (
    report_type in ('targeted_theft_visit')
  ),
  constraint tfs_visit_reports_status_check check (
    status in ('draft', 'final')
  ),
  constraint tfs_visit_reports_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  )
);

comment on table public.tfs_visit_reports is
  'Structured LP reporting records for targeted theft visits and future TFS report templates.';

comment on column public.tfs_visit_reports.payload is
  'Structured report answers keyed by report template type.';

create index if not exists tfs_visit_reports_store_visit_date_idx
  on public.tfs_visit_reports (store_id, visit_date desc);

create index if not exists tfs_visit_reports_type_updated_at_idx
  on public.tfs_visit_reports (report_type, updated_at desc);

drop trigger if exists set_tfs_visit_reports_updated_at on public.tfs_visit_reports;
create trigger set_tfs_visit_reports_updated_at
before update on public.tfs_visit_reports
for each row
execute function public.tfs_set_updated_at();

grant select, insert, update, delete on public.tfs_visit_reports to authenticated;
grant all on public.tfs_visit_reports to service_role;

alter table public.tfs_visit_reports enable row level security;

drop policy if exists tfs_visit_reports_select_authenticated on public.tfs_visit_reports;
create policy tfs_visit_reports_select_authenticated
on public.tfs_visit_reports
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_visit_reports_insert_self on public.tfs_visit_reports;
create policy tfs_visit_reports_insert_self
on public.tfs_visit_reports
for insert
to authenticated
with check (
  auth.uid() = created_by_user_id
  and public.tfs_current_user_role() in ('admin', 'ops')
);

drop policy if exists tfs_visit_reports_update_admin_ops on public.tfs_visit_reports;
create policy tfs_visit_reports_update_admin_ops
on public.tfs_visit_reports
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_visit_reports_delete_admin_ops on public.tfs_visit_reports;
create policy tfs_visit_reports_delete_admin_ops
on public.tfs_visit_reports
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

commit;
