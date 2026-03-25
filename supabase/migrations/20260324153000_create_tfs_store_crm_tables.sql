begin;

-- Additive-only migration for the TFS clone.
-- No existing fa_* tables, rows, or policies are removed or modified here.
-- Use tfs_ identifiers instead of literal TFS- table names to avoid quoted identifiers in Postgres.

create or replace function public.tfs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.tfs_current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from public.fa_profiles
  where id = auth.uid()
  limit 1
$$;

create table if not exists public.tfs_stores (
  id uuid primary key default gen_random_uuid(),
  store_code text null,
  store_name text not null,
  address_line_1 text null,
  city text null,
  postcode text null,
  region text null,
  reporting_area text null,
  reporting_area_manager_name text null,
  reporting_area_manager_email text null,
  is_active boolean not null default true,
  compliance_audit_1_date date null,
  compliance_audit_1_overall_pct numeric(5, 2) null,
  action_plan_1_sent boolean null,
  compliance_audit_1_pdf_path text null,
  compliance_audit_2_date date null,
  compliance_audit_2_overall_pct numeric(5, 2) null,
  action_plan_2_sent boolean null,
  compliance_audit_2_pdf_path text null,
  compliance_audit_2_assigned_manager_user_id uuid null references public.fa_profiles(id),
  compliance_audit_2_planned_date date null,
  compliance_audit_3_date date null,
  compliance_audit_3_overall_pct numeric(5, 2) null,
  action_plan_3_sent boolean null,
  area_average_pct numeric(5, 2) null,
  total_audits_to_date integer null,
  fire_risk_assessment_date date null,
  fire_risk_assessment_pdf_path text null,
  fire_risk_assessment_notes text null,
  fire_risk_assessment_pct numeric(5, 2) null,
  latitude double precision null,
  longitude double precision null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_stores_store_name_not_blank check (btrim(store_name) <> ''),
  constraint tfs_stores_latitude_check check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint tfs_stores_longitude_check check (longitude is null or (longitude >= -180 and longitude <= 180)),
  constraint tfs_stores_compliance_audit_1_pct_check check (
    compliance_audit_1_overall_pct is null
    or (compliance_audit_1_overall_pct >= 0 and compliance_audit_1_overall_pct <= 100)
  ),
  constraint tfs_stores_compliance_audit_2_pct_check check (
    compliance_audit_2_overall_pct is null
    or (compliance_audit_2_overall_pct >= 0 and compliance_audit_2_overall_pct <= 100)
  ),
  constraint tfs_stores_compliance_audit_3_pct_check check (
    compliance_audit_3_overall_pct is null
    or (compliance_audit_3_overall_pct >= 0 and compliance_audit_3_overall_pct <= 100)
  ),
  constraint tfs_stores_area_average_pct_check check (
    area_average_pct is null
    or (area_average_pct >= 0 and area_average_pct <= 100)
  ),
  constraint tfs_stores_fire_risk_assessment_pct_check check (
    fire_risk_assessment_pct is null
    or (fire_risk_assessment_pct >= 0 and fire_risk_assessment_pct <= 100)
  ),
  constraint tfs_stores_total_audits_non_negative check (
    total_audits_to_date is null
    or total_audits_to_date >= 0
  )
);

create table if not exists public.tfs_store_contacts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  contact_name text not null,
  job_title text null,
  email text null,
  phone text null,
  preferred_method text null,
  is_primary boolean not null default false,
  notes text null,
  created_by_user_id uuid not null references public.fa_profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_store_contacts_contact_name_not_blank check (btrim(contact_name) <> ''),
  constraint tfs_store_contacts_preferred_method_check check (
    preferred_method is null
    or preferred_method in ('phone', 'email', 'either')
  )
);

create table if not exists public.tfs_store_notes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  note_type text not null default 'general',
  title text null,
  body text not null,
  created_by_user_id uuid not null references public.fa_profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_store_notes_body_not_blank check (btrim(body) <> ''),
  constraint tfs_store_notes_note_type_check check (
    note_type in ('general', 'contact', 'audit', 'fra', 'other')
  )
);

create table if not exists public.tfs_store_contact_tracker (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  contact_id uuid null references public.tfs_store_contacts(id) on delete set null,
  interaction_type text not null,
  subject text not null,
  details text null,
  outcome text null,
  interaction_at timestamptz not null default timezone('utc', now()),
  follow_up_date date null,
  created_by_user_id uuid not null references public.fa_profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_store_contact_tracker_subject_not_blank check (btrim(subject) <> ''),
  constraint tfs_store_contact_tracker_interaction_type_check check (
    interaction_type in (
      'phone_call',
      'email',
      'meeting',
      'visit',
      'audit_update',
      'fra_update',
      'other'
    )
  )
);

create table if not exists public.tfs_activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  performed_by_user_id uuid not null references public.fa_profiles(id),
  details jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint tfs_activity_log_entity_type_check check (
    entity_type in ('incident', 'investigation', 'action', 'store')
  ),
  constraint tfs_activity_log_action_not_blank check (btrim(action) <> '')
);

comment on table public.tfs_stores is 'TFS-owned store records for the Stores / CRM area.';
comment on table public.tfs_store_contacts is 'TFS-owned store CRM contacts.';
comment on table public.tfs_store_notes is 'TFS-owned store CRM notes.';
comment on table public.tfs_store_contact_tracker is 'TFS-owned CRM communication history per store.';
comment on table public.tfs_activity_log is 'TFS-owned activity log to avoid mixing CRM events into fa_activity_log.';

create index if not exists tfs_stores_store_name_idx
  on public.tfs_stores (store_name);

create index if not exists tfs_stores_store_code_idx
  on public.tfs_stores (store_code);

create index if not exists tfs_stores_region_idx
  on public.tfs_stores (region);

create index if not exists tfs_stores_is_active_idx
  on public.tfs_stores (is_active);

create index if not exists tfs_store_contacts_store_id_idx
  on public.tfs_store_contacts (store_id);

create index if not exists tfs_store_contacts_store_name_idx
  on public.tfs_store_contacts (store_id, contact_name);

create unique index if not exists tfs_store_contacts_one_primary_per_store_idx
  on public.tfs_store_contacts (store_id)
  where is_primary;

create index if not exists tfs_store_notes_store_created_at_idx
  on public.tfs_store_notes (store_id, created_at desc);

create index if not exists tfs_store_contact_tracker_store_interaction_at_idx
  on public.tfs_store_contact_tracker (store_id, interaction_at desc);

create index if not exists tfs_store_contact_tracker_contact_id_idx
  on public.tfs_store_contact_tracker (contact_id);

create index if not exists tfs_store_contact_tracker_follow_up_date_idx
  on public.tfs_store_contact_tracker (follow_up_date)
  where follow_up_date is not null;

create index if not exists tfs_activity_log_entity_created_at_idx
  on public.tfs_activity_log (entity_type, entity_id, created_at desc);

drop trigger if exists set_tfs_stores_updated_at on public.tfs_stores;
create trigger set_tfs_stores_updated_at
before update on public.tfs_stores
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_store_contacts_updated_at on public.tfs_store_contacts;
create trigger set_tfs_store_contacts_updated_at
before update on public.tfs_store_contacts
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_store_notes_updated_at on public.tfs_store_notes;
create trigger set_tfs_store_notes_updated_at
before update on public.tfs_store_notes
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_store_contact_tracker_updated_at on public.tfs_store_contact_tracker;
create trigger set_tfs_store_contact_tracker_updated_at
before update on public.tfs_store_contact_tracker
for each row
execute function public.tfs_set_updated_at();

grant select, insert, update, delete on public.tfs_stores to authenticated;
grant select, insert, update, delete on public.tfs_store_contacts to authenticated;
grant select, insert, update, delete on public.tfs_store_notes to authenticated;
grant select, insert, update, delete on public.tfs_store_contact_tracker to authenticated;
grant select, insert on public.tfs_activity_log to authenticated;

grant all on public.tfs_stores to service_role;
grant all on public.tfs_store_contacts to service_role;
grant all on public.tfs_store_notes to service_role;
grant all on public.tfs_store_contact_tracker to service_role;
grant all on public.tfs_activity_log to service_role;

alter table public.tfs_stores enable row level security;
alter table public.tfs_store_contacts enable row level security;
alter table public.tfs_store_notes enable row level security;
alter table public.tfs_store_contact_tracker enable row level security;
alter table public.tfs_activity_log enable row level security;

drop policy if exists tfs_stores_select_authenticated on public.tfs_stores;
create policy tfs_stores_select_authenticated
on public.tfs_stores
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_stores_insert_admin on public.tfs_stores;
create policy tfs_stores_insert_admin
on public.tfs_stores
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_stores_update_admin on public.tfs_stores;
create policy tfs_stores_update_admin
on public.tfs_stores
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_stores_delete_admin on public.tfs_stores;
create policy tfs_stores_delete_admin
on public.tfs_stores
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_store_contacts_select_authenticated on public.tfs_store_contacts;
create policy tfs_store_contacts_select_authenticated
on public.tfs_store_contacts
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_store_contacts_insert_admin on public.tfs_store_contacts;
create policy tfs_store_contacts_insert_admin
on public.tfs_store_contacts
for insert
to authenticated
with check (
  public.tfs_current_user_role() in ('admin', 'ops')
  and created_by_user_id = auth.uid()
);

drop policy if exists tfs_store_contacts_update_admin on public.tfs_store_contacts;
create policy tfs_store_contacts_update_admin
on public.tfs_store_contacts
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_store_contacts_delete_admin on public.tfs_store_contacts;
create policy tfs_store_contacts_delete_admin
on public.tfs_store_contacts
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_store_notes_select_authenticated on public.tfs_store_notes;
create policy tfs_store_notes_select_authenticated
on public.tfs_store_notes
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_store_notes_insert_admin on public.tfs_store_notes;
create policy tfs_store_notes_insert_admin
on public.tfs_store_notes
for insert
to authenticated
with check (
  public.tfs_current_user_role() in ('admin', 'ops')
  and created_by_user_id = auth.uid()
);

drop policy if exists tfs_store_notes_update_admin on public.tfs_store_notes;
create policy tfs_store_notes_update_admin
on public.tfs_store_notes
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_store_notes_delete_admin on public.tfs_store_notes;
create policy tfs_store_notes_delete_admin
on public.tfs_store_notes
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_store_contact_tracker_select_authenticated on public.tfs_store_contact_tracker;
create policy tfs_store_contact_tracker_select_authenticated
on public.tfs_store_contact_tracker
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_store_contact_tracker_insert_admin on public.tfs_store_contact_tracker;
create policy tfs_store_contact_tracker_insert_admin
on public.tfs_store_contact_tracker
for insert
to authenticated
with check (
  public.tfs_current_user_role() in ('admin', 'ops')
  and created_by_user_id = auth.uid()
);

drop policy if exists tfs_store_contact_tracker_update_admin on public.tfs_store_contact_tracker;
create policy tfs_store_contact_tracker_update_admin
on public.tfs_store_contact_tracker
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_store_contact_tracker_delete_admin on public.tfs_store_contact_tracker;
create policy tfs_store_contact_tracker_delete_admin
on public.tfs_store_contact_tracker
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_activity_log_select_authenticated on public.tfs_activity_log;
create policy tfs_activity_log_select_authenticated
on public.tfs_activity_log
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_activity_log_insert_self on public.tfs_activity_log;
create policy tfs_activity_log_insert_self
on public.tfs_activity_log
for insert
to authenticated
with check (
  auth.uid() is not null
  and performed_by_user_id = auth.uid()
);

commit;
