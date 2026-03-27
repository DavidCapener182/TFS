begin;

create sequence if not exists public.tfs_incident_reference_seq;

create or replace function public.tfs_generate_incident_reference()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  seq_value bigint;
begin
  seq_value := nextval('public.tfs_incident_reference_seq');
  return format(
    'INC-%s-%s',
    to_char(timezone('utc', now()), 'YYYY'),
    lpad(seq_value::text, 6, '0')
  );
end;
$$;

create table if not exists public.tfs_incidents (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null,
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  reported_by_user_id uuid not null references public.fa_profiles(id),
  incident_category text not null default 'security',
  severity text not null default 'low',
  summary text not null,
  description text null,
  occurred_at timestamptz not null,
  reported_at timestamptz not null default timezone('utc', now()),
  persons_involved jsonb null,
  injury_details jsonb null,
  witnesses jsonb null,
  riddor_reportable boolean not null default false,
  status text not null default 'open',
  assigned_investigator_user_id uuid null references public.fa_profiles(id),
  target_close_date date null,
  closed_at timestamptz null,
  closure_summary text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_incidents_reference_no_key unique (reference_no),
  constraint tfs_incidents_category_check check (
    incident_category in ('accident', 'near_miss', 'security', 'fire', 'health_safety', 'other')
  ),
  constraint tfs_incidents_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  constraint tfs_incidents_status_check check (
    status in ('open', 'under_investigation', 'actions_in_progress', 'closed', 'cancelled')
  )
);

create table if not exists public.tfs_closed_incidents (
  id uuid primary key,
  reference_no text not null,
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  reported_by_user_id uuid not null references public.fa_profiles(id),
  incident_category text not null default 'security',
  severity text not null default 'low',
  summary text not null,
  description text null,
  occurred_at timestamptz not null,
  reported_at timestamptz not null,
  persons_involved jsonb null,
  injury_details jsonb null,
  witnesses jsonb null,
  riddor_reportable boolean not null default false,
  status text not null default 'closed',
  assigned_investigator_user_id uuid null references public.fa_profiles(id),
  target_close_date date null,
  closed_at timestamptz null,
  closure_summary text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_closed_incidents_reference_no_key unique (reference_no),
  constraint tfs_closed_incidents_category_check check (
    incident_category in ('accident', 'near_miss', 'security', 'fire', 'health_safety', 'other')
  ),
  constraint tfs_closed_incidents_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  constraint tfs_closed_incidents_status_check check (
    status in ('open', 'under_investigation', 'actions_in_progress', 'closed', 'cancelled')
  )
);

create table if not exists public.tfs_investigations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.tfs_incidents(id) on delete cascade,
  investigation_type text not null default 'light_touch',
  status text not null default 'not_started',
  lead_investigator_user_id uuid not null references public.fa_profiles(id),
  root_cause text null,
  contributing_factors text null,
  findings text null,
  recommendations text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_investigations_type_check check (
    investigation_type in ('light_touch', 'formal')
  ),
  constraint tfs_investigations_status_check check (
    status in ('not_started', 'in_progress', 'awaiting_actions', 'complete')
  ),
  constraint tfs_investigations_incident_id_key unique (incident_id)
);

create table if not exists public.tfs_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.tfs_incidents(id) on delete cascade,
  investigation_id uuid null references public.tfs_investigations(id) on delete set null,
  title text not null,
  description text null,
  priority text not null default 'medium',
  assigned_to_user_id uuid not null references public.fa_profiles(id),
  due_date date not null,
  status text not null default 'open',
  evidence_required boolean not null default false,
  completion_notes text null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_actions_priority_check check (
    priority in ('low', 'medium', 'high', 'urgent')
  ),
  constraint tfs_actions_status_check check (
    status in ('open', 'in_progress', 'blocked', 'complete', 'cancelled')
  )
);

create table if not exists public.tfs_attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  file_path text not null,
  file_type text null,
  file_size bigint null,
  uploaded_by_user_id uuid not null references public.fa_profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  constraint tfs_attachments_entity_type_check check (
    entity_type in ('incident', 'investigation', 'action', 'store')
  )
);

create table if not exists public.tfs_claims (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid null references public.tfs_incidents(id) on delete set null,
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  reference_no text not null,
  claimant_type text null,
  allegation text null,
  status text not null default 'open',
  owner text null,
  next_action text null,
  due_date date null,
  received_date date not null default current_date,
  evidence_cctv boolean not null default false,
  evidence_photos boolean not null default false,
  evidence_statements boolean not null default false,
  evidence_ra_sop boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_claims_reference_no_key unique (reference_no)
);

select setval(
  'public.tfs_incident_reference_seq',
  greatest(
    (
      select coalesce(max((substring(reference_no from '(\d+)$'))::bigint), 0)
      from public.tfs_incidents
      where substring(reference_no from '(\d+)$') is not null
    ),
    1
  ),
  (
    select coalesce(max((substring(reference_no from '(\d+)$'))::bigint), 0) > 0
    from public.tfs_incidents
    where substring(reference_no from '(\d+)$') is not null
  )
);

comment on table public.tfs_incidents is
  'LP and security incident records that power stores, dashboard, and incidents pages.';
comment on table public.tfs_closed_incidents is
  'Archived copy of incidents after closure.';
comment on table public.tfs_investigations is
  'Optional investigation record linked one-to-one with an open incident.';
comment on table public.tfs_actions is
  'Corrective or follow-up actions linked to LP incidents.';
comment on table public.tfs_attachments is
  'Attachment metadata for incidents, investigations, actions, and stores.';
comment on table public.tfs_claims is
  'Claims register entries linked to incidents where available.';

create index if not exists tfs_incidents_store_occurred_at_idx
  on public.tfs_incidents (store_id, occurred_at desc);

create index if not exists tfs_incidents_status_occurred_at_idx
  on public.tfs_incidents (status, occurred_at desc);

create index if not exists tfs_incidents_severity_idx
  on public.tfs_incidents (severity);

create index if not exists tfs_closed_incidents_store_occurred_at_idx
  on public.tfs_closed_incidents (store_id, occurred_at desc);

create index if not exists tfs_closed_incidents_status_idx
  on public.tfs_closed_incidents (status);

create index if not exists tfs_investigations_lead_status_idx
  on public.tfs_investigations (lead_investigator_user_id, status);

create index if not exists tfs_actions_incident_idx
  on public.tfs_actions (incident_id, created_at desc);

create index if not exists tfs_actions_assigned_status_idx
  on public.tfs_actions (assigned_to_user_id, status);

create index if not exists tfs_actions_due_date_idx
  on public.tfs_actions (due_date);

create index if not exists tfs_attachments_entity_created_at_idx
  on public.tfs_attachments (entity_type, entity_id, created_at desc);

create index if not exists tfs_claims_store_received_date_idx
  on public.tfs_claims (store_id, received_date desc);

create index if not exists tfs_claims_status_received_date_idx
  on public.tfs_claims (status, received_date desc);

drop trigger if exists set_tfs_incidents_updated_at on public.tfs_incidents;
create trigger set_tfs_incidents_updated_at
before update on public.tfs_incidents
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_closed_incidents_updated_at on public.tfs_closed_incidents;
create trigger set_tfs_closed_incidents_updated_at
before update on public.tfs_closed_incidents
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_investigations_updated_at on public.tfs_investigations;
create trigger set_tfs_investigations_updated_at
before update on public.tfs_investigations
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_actions_updated_at on public.tfs_actions;
create trigger set_tfs_actions_updated_at
before update on public.tfs_actions
for each row
execute function public.tfs_set_updated_at();

drop trigger if exists set_tfs_claims_updated_at on public.tfs_claims;
create trigger set_tfs_claims_updated_at
before update on public.tfs_claims
for each row
execute function public.tfs_set_updated_at();

grant usage, select on sequence public.tfs_incident_reference_seq to authenticated;
grant usage, select on sequence public.tfs_incident_reference_seq to service_role;
grant execute on function public.tfs_generate_incident_reference() to authenticated;
grant execute on function public.tfs_generate_incident_reference() to service_role;

grant select, insert, update, delete on public.tfs_incidents to authenticated;
grant select, insert, update, delete on public.tfs_closed_incidents to authenticated;
grant select, insert, update, delete on public.tfs_investigations to authenticated;
grant select, insert, update, delete on public.tfs_actions to authenticated;
grant select, insert, update, delete on public.tfs_attachments to authenticated;
grant select, insert, update, delete on public.tfs_claims to authenticated;

grant all on public.tfs_incidents to service_role;
grant all on public.tfs_closed_incidents to service_role;
grant all on public.tfs_investigations to service_role;
grant all on public.tfs_actions to service_role;
grant all on public.tfs_attachments to service_role;
grant all on public.tfs_claims to service_role;

alter table public.tfs_incidents enable row level security;
alter table public.tfs_closed_incidents enable row level security;
alter table public.tfs_investigations enable row level security;
alter table public.tfs_actions enable row level security;
alter table public.tfs_attachments enable row level security;
alter table public.tfs_claims enable row level security;

drop policy if exists tfs_incidents_select_authenticated on public.tfs_incidents;
create policy tfs_incidents_select_authenticated
on public.tfs_incidents
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_incidents_insert_admin_ops on public.tfs_incidents;
create policy tfs_incidents_insert_admin_ops
on public.tfs_incidents
for insert
to authenticated
with check (
  auth.uid() = reported_by_user_id
  and public.tfs_current_user_role() in ('admin', 'ops')
);

drop policy if exists tfs_incidents_update_admin_ops on public.tfs_incidents;
create policy tfs_incidents_update_admin_ops
on public.tfs_incidents
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_incidents_delete_admin_ops on public.tfs_incidents;
create policy tfs_incidents_delete_admin_ops
on public.tfs_incidents
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_closed_incidents_select_authenticated on public.tfs_closed_incidents;
create policy tfs_closed_incidents_select_authenticated
on public.tfs_closed_incidents
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_closed_incidents_insert_admin_ops on public.tfs_closed_incidents;
create policy tfs_closed_incidents_insert_admin_ops
on public.tfs_closed_incidents
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_closed_incidents_update_admin_ops on public.tfs_closed_incidents;
create policy tfs_closed_incidents_update_admin_ops
on public.tfs_closed_incidents
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_closed_incidents_delete_admin_ops on public.tfs_closed_incidents;
create policy tfs_closed_incidents_delete_admin_ops
on public.tfs_closed_incidents
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_investigations_select_authenticated on public.tfs_investigations;
create policy tfs_investigations_select_authenticated
on public.tfs_investigations
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_investigations_insert_admin_ops on public.tfs_investigations;
create policy tfs_investigations_insert_admin_ops
on public.tfs_investigations
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_investigations_update_admin_ops on public.tfs_investigations;
create policy tfs_investigations_update_admin_ops
on public.tfs_investigations
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_investigations_delete_admin_ops on public.tfs_investigations;
create policy tfs_investigations_delete_admin_ops
on public.tfs_investigations
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_actions_select_authenticated on public.tfs_actions;
create policy tfs_actions_select_authenticated
on public.tfs_actions
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_actions_insert_admin_ops on public.tfs_actions;
create policy tfs_actions_insert_admin_ops
on public.tfs_actions
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_actions_update_admin_ops on public.tfs_actions;
create policy tfs_actions_update_admin_ops
on public.tfs_actions
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_actions_delete_admin_ops on public.tfs_actions;
create policy tfs_actions_delete_admin_ops
on public.tfs_actions
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_attachments_select_authenticated on public.tfs_attachments;
create policy tfs_attachments_select_authenticated
on public.tfs_attachments
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_attachments_insert_admin_ops on public.tfs_attachments;
create policy tfs_attachments_insert_admin_ops
on public.tfs_attachments
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_attachments_update_admin_ops on public.tfs_attachments;
create policy tfs_attachments_update_admin_ops
on public.tfs_attachments
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_attachments_delete_admin_ops on public.tfs_attachments;
create policy tfs_attachments_delete_admin_ops
on public.tfs_attachments
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_claims_select_authenticated on public.tfs_claims;
create policy tfs_claims_select_authenticated
on public.tfs_claims
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_claims_insert_admin_ops on public.tfs_claims;
create policy tfs_claims_insert_admin_ops
on public.tfs_claims
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_claims_update_admin_ops on public.tfs_claims;
create policy tfs_claims_update_admin_ops
on public.tfs_claims
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_claims_delete_admin_ops on public.tfs_claims;
create policy tfs_claims_delete_admin_ops
on public.tfs_claims
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

with final_reports as (
  select
    vr.id as report_id,
    vr.store_id,
    vr.created_by_user_id,
    vr.title,
    vr.visit_date,
    vr.summary,
    vr.payload,
    vr.created_at,
    ('Source visit report ID: ' || vr.id::text) as source_marker,
    coalesce(nullif(vr.payload->>'riskRating', ''), 'low') as risk_rating,
    case
      when nullif(vr.payload->>'timeOut', '') ~ '^\d{2}:\d{2}$'
        then ((vr.visit_date::text || 'T' || (vr.payload->>'timeOut') || ':00+00')::timestamptz)
      when nullif(vr.payload->>'timeIn', '') ~ '^\d{2}:\d{2}$'
        then ((vr.visit_date::text || 'T' || (vr.payload->>'timeIn') || ':00+00')::timestamptz)
      else ((vr.visit_date::text || 'T12:00:00+00')::timestamptz)
    end as occurred_at,
    nullif(btrim(vr.summary), '') as summary_text,
    nullif(btrim(vr.payload#>>'{incidentOverview,summary}'), '') as incident_overview_summary,
    nullif(btrim(vr.payload#>>'{incidentOverview,primaryProducts}'), '') as primary_products,
    nullif(btrim(vr.payload#>>'{incidentOverview,entryPoint}'), '') as entry_point,
    nullif(btrim(vr.payload#>>'{incidentOverview,incidentCount}'), '') as incident_count_text,
    nullif(btrim(vr.payload#>>'{riskJustification}'), '') as risk_justification,
    nullif(btrim(vr.payload#>>'{recommendations,details}'), '') as recommendation_details,
    nullif(btrim(vr.payload#>>'{immediateActionsTaken,actionsCompleted}'), '') as immediate_actions_text,
    nullif(btrim(vr.payload#>>'{storeLayoutExposure,observations}'), '') as store_layout_observations,
    nullif(btrim(vr.payload#>>'{productControlMeasures,atRiskSkus}'), '') as at_risk_skus,
    nullif(btrim(vr.payload#>>'{productControlMeasures,recommendations}'), '') as control_recommendations,
    nullif(btrim(vr.payload#>>'{cctvSurveillance,issuesIdentified}'), '') as cctv_issues,
    nullif(btrim(vr.payload#>>'{staffSafetyResponse,responseDescription}'), '') as staff_response,
    nullif(btrim(vr.payload#>>'{communicationRadioUse,effectiveness}'), '') as communication_effectiveness,
    nullif(btrim(vr.payload#>>'{environmentalExternalFactors,externalRisks}'), '') as external_risks,
    nullif(btrim(vr.payload#>>'{staffPositioningBehaviour,observedBehaviour}'), '') as staff_behaviour,
    nullif(btrim(vr.payload->>'storeManager'), '') as store_manager_name,
    coalesce(nullif(btrim(vr.payload#>>'{signOff,visitedBy}'), ''), nullif(btrim(vr.payload->>'preparedBy'), '')) as visited_by,
    nullif(btrim(vr.payload#>>'{signOff,storeRepresentative}'), '') as store_representative,
    coalesce((vr.payload#>>'{incidentOverview,sameOffendersSuspected}')::boolean, false) as same_offenders_suspected,
    coalesce((vr.payload#>>'{incidentOverview,violenceInvolved}')::boolean, false) as violence_involved,
    coalesce((vr.payload#>>'{recommendations,physical,counterModificationsRequired}')::boolean, false) as rec_counter_mod_required,
    coalesce((vr.payload#>>'{recommendations,physical,lockableStorageRequired}')::boolean, false) as rec_lockable_storage_required,
    coalesce((vr.payload#>>'{recommendations,physical,additionalSecurityPresenceRecommended}')::boolean, false) as rec_security_presence_required,
    coalesce((vr.payload#>>'{recommendations,operational,staffTrainingRequired}')::boolean, false) as rec_staff_training_required,
    coalesce((vr.payload#>>'{recommendations,operational,improvedIncidentLoggingRequired}')::boolean, false) as rec_incident_logging_required,
    coalesce((vr.payload#>>'{recommendations,operational,revisedProceduresRequired}')::boolean, false) as rec_revised_procedures_required,
    coalesce((vr.payload#>>'{recommendations,intelligence,offenderInformationSharingRequired}')::boolean, false) as rec_info_sharing_required,
    coalesce((vr.payload#>>'{recommendations,intelligence,liaisonWithCentreSecurityRequired}')::boolean, false) as rec_centre_security_required,
    coalesce((vr.payload#>>'{recommendations,intelligence,policeEngagementRequired}')::boolean, false) as rec_police_engagement_required,
    coalesce((vr.payload#>>'{recommendations,deterrence,highValueStockSignageRecommended}')::boolean, false) as rec_signage_required,
    coalesce((vr.payload#>>'{recommendations,deterrence,strongStaffEngagementOnEntryRequired}')::boolean, false) as rec_staff_engagement_required
  from public.tfs_visit_reports vr
  where vr.status = 'final'
),
final_reports_enriched as (
  select
    fr.*,
    (fr.risk_rating in ('critical', 'high'))
      or fr.recommendation_details is not null
      or fr.rec_counter_mod_required
      or fr.rec_lockable_storage_required
      or fr.rec_security_presence_required
      or fr.rec_staff_training_required
      or fr.rec_incident_logging_required
      or fr.rec_revised_procedures_required
      or fr.rec_info_sharing_required
      or fr.rec_centre_security_required
      or fr.rec_police_engagement_required
      or fr.rec_signage_required
      or fr.rec_staff_engagement_required as follow_up_required,
    case fr.risk_rating
      when 'critical' then 92
      when 'high' then 78
      when 'medium' then 58
      when 'low' then 26
      else 0
    end as need_score_snapshot,
    array_remove(array[
      case when fr.risk_rating <> '' then 'Risk rating recorded as ' || upper(fr.risk_rating) || '.' end,
      case when fr.recommendation_details is not null then 'Report recommendations still require store follow-up.' end,
      case when fr.recommendation_details is null and (
        fr.rec_counter_mod_required
        or fr.rec_lockable_storage_required
        or fr.rec_security_presence_required
        or fr.rec_staff_training_required
        or fr.rec_incident_logging_required
        or fr.rec_revised_procedures_required
        or fr.rec_info_sharing_required
        or fr.rec_centre_security_required
        or fr.rec_police_engagement_required
        or fr.rec_signage_required
        or fr.rec_staff_engagement_required
      ) then 'Structured LP recommendations were captured for follow-up.' end
    ]::text[], null) as need_reasons
  from final_reports fr
),
inserted_incidents as (
  insert into public.tfs_incidents (
    reference_no,
    store_id,
    reported_by_user_id,
    incident_category,
    severity,
    summary,
    description,
    occurred_at,
    reported_at,
    persons_involved,
    riddor_reportable,
    status,
    created_at,
    updated_at
  )
  select
    public.tfs_generate_incident_reference(),
    fr.store_id,
    fr.created_by_user_id,
    'security',
    case fr.risk_rating
      when 'critical' then 'critical'
      when 'high' then 'high'
      when 'medium' then 'medium'
      else 'low'
    end,
    'Visit report follow-up: ' || fr.title,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          fr.summary_text,
          fr.incident_overview_summary,
          case when fr.risk_justification is not null then 'Risk justification: ' || fr.risk_justification end,
          case when fr.recommendation_details is not null then 'Recommendations: ' || fr.recommendation_details end,
          fr.source_marker
        )
      ),
      ''
    ),
    fr.occurred_at,
    coalesce(fr.created_at, timezone('utc', now())),
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'visit_report',
        'visit_report_id', fr.report_id,
        'visited_by', fr.visited_by,
        'store_representative', coalesce(fr.store_representative, fr.store_manager_name),
        'same_offenders_suspected', fr.same_offenders_suspected,
        'violence_involved', fr.violence_involved
      )
    ),
    false,
    'open',
    coalesce(fr.created_at, timezone('utc', now())),
    timezone('utc', now())
  from final_reports_enriched fr
  where not exists (
    select 1
    from public.tfs_incidents i
    where i.store_id = fr.store_id
      and coalesce(i.description, '') ilike '%' || fr.source_marker || '%'
  )
),
report_incidents as (
  select
    fr.*,
    incident_lookup.id as incident_id
  from final_reports_enriched fr
  join lateral (
    select i.id
    from public.tfs_incidents i
    where i.store_id = fr.store_id
      and coalesce(i.description, '') ilike '%' || fr.source_marker || '%'
    order by i.created_at desc nulls last
    limit 1
  ) as incident_lookup on true
),
inserted_actions as (
  insert into public.tfs_actions (
    incident_id,
    title,
    description,
    priority,
    assigned_to_user_id,
    due_date,
    status,
    evidence_required,
    created_at,
    updated_at
  )
  select
    ri.incident_id,
    'Implement visit report actions: ' || ri.title,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          'Implement agreed mitigations from the visit report.',
          ri.immediate_actions_text,
          ri.recommendation_details,
          ri.source_marker
        )
      ),
      ''
    ),
    case ri.risk_rating
      when 'critical' then 'urgent'
      when 'high' then 'high'
      when 'medium' then 'medium'
      else 'low'
    end,
    ri.created_by_user_id,
    case ri.risk_rating
      when 'critical' then ri.visit_date + 2
      when 'high' then ri.visit_date + 5
      when 'medium' then ri.visit_date + 7
      else ri.visit_date + 14
    end,
    'open',
    false,
    coalesce(ri.created_at, timezone('utc', now())),
    timezone('utc', now())
  from report_incidents ri
  where not exists (
    select 1
    from public.tfs_actions a
    where a.incident_id = ri.incident_id
      and coalesce(a.description, '') ilike '%' || ri.source_marker || '%'
  )
),
visit_drafts as (
  select
    fr.*,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          case when fr.summary_text is not null then 'Visit summary: ' || fr.summary_text end,
          case when fr.incident_overview_summary is not null then 'Incident overview: ' || fr.incident_overview_summary end,
          case when fr.primary_products is not null then 'Primary products: ' || fr.primary_products end,
          case when fr.entry_point is not null then 'Entry point / route: ' || fr.entry_point end,
          case when fr.incident_count_text is not null then 'Recent incidents reviewed: ' || fr.incident_count_text end
        )
      ),
      ''
    ) as supported_investigation_detail,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          case when fr.store_layout_observations is not null then 'Layout exposure: ' || fr.store_layout_observations end,
          case when fr.at_risk_skus is not null then 'At-risk SKUs: ' || fr.at_risk_skus end,
          case when fr.control_recommendations is not null then 'Control recommendations: ' || fr.control_recommendations end,
          case when fr.immediate_actions_text is not null then 'Immediate actions completed: ' || fr.immediate_actions_text end
        )
      ),
      ''
    ) as reviewed_loss_controls_detail,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          case when fr.cctv_issues is not null then 'CCTV / alarm issues: ' || fr.cctv_issues end,
          case when coalesce((fr.payload#>>'{cctvSurveillance,facialIdentificationPossible}')::boolean, false)
            then 'Footage was assessed as capable of facial identification.' end,
          case when coalesce((fr.payload#>>'{cctvSurveillance,cameraAnglesAppropriate}')::boolean, false)
            then 'Camera angle coverage was confirmed during the visit.' end
        )
      ),
      ''
    ) as reviewed_cctv_or_alarm_detail,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          case when fr.staff_response is not null then 'Team response reviewed: ' || fr.staff_response end,
          case when fr.communication_effectiveness is not null then 'Radio / communication effectiveness: ' || fr.communication_effectiveness end,
          case when fr.external_risks is not null then 'External risk context: ' || fr.external_risks end
        )
      ),
      ''
    ) as reviewed_security_procedures_detail,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          case when fr.staff_behaviour is not null then 'Observed team behaviour: ' || fr.staff_behaviour end,
          case when fr.recommendation_details is not null then 'Recommendations issued: ' || fr.recommendation_details end,
          case when fr.store_manager_name is not null then 'Store manager present: ' || fr.store_manager_name end,
          case when fr.store_representative is not null then 'Store representative sign-off: ' || fr.store_representative end
        )
      ),
      ''
    ) as provided_store_support_or_training_detail,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          coalesce(fr.summary_text, fr.title),
          case when fr.risk_justification is not null then 'Risk justification: ' || fr.risk_justification end
        )
      ),
      ''
    ) as other_detail,
    nullif(
      btrim(
        concat_ws(
          E'\n\n',
          'Created from final visit report: ' || fr.title,
          fr.summary_text,
          case when fr.risk_justification is not null then 'Risk justification: ' || fr.risk_justification end,
          fr.source_marker
        )
      ),
      ''
    ) as visit_notes
  from final_reports_enriched fr
)
insert into public.tfs_store_visits (
  store_id,
  visit_type,
  visited_at,
  completed_activity_keys,
  completed_activity_details,
  completed_activity_payloads,
  notes,
  follow_up_required,
  need_score_snapshot,
  need_level_snapshot,
  need_reasons_snapshot,
  created_by_user_id,
  created_at,
  updated_at
)
select
  vd.store_id,
  'action_led',
  vd.occurred_at,
  case
    when cardinality(
      array_remove(array[
        case when vd.supported_investigation_detail is not null then 'supported_investigation' end,
        case when vd.reviewed_loss_controls_detail is not null then 'reviewed_loss_controls' end,
        case when vd.reviewed_cctv_or_alarm_detail is not null then 'reviewed_cctv_or_alarm' end,
        case when vd.reviewed_security_procedures_detail is not null then 'reviewed_security_procedures' end,
        case when vd.provided_store_support_or_training_detail is not null then 'provided_store_support_or_training' end
      ]::text[], null)
    ) = 0
      then array['other']::text[]
    else array_remove(array[
      case when vd.supported_investigation_detail is not null then 'supported_investigation' end,
      case when vd.reviewed_loss_controls_detail is not null then 'reviewed_loss_controls' end,
      case when vd.reviewed_cctv_or_alarm_detail is not null then 'reviewed_cctv_or_alarm' end,
      case when vd.reviewed_security_procedures_detail is not null then 'reviewed_security_procedures' end,
      case when vd.provided_store_support_or_training_detail is not null then 'provided_store_support_or_training' end
    ]::text[], null)
  end,
  case
    when cardinality(
      array_remove(array[
        case when vd.supported_investigation_detail is not null then 'supported_investigation' end,
        case when vd.reviewed_loss_controls_detail is not null then 'reviewed_loss_controls' end,
        case when vd.reviewed_cctv_or_alarm_detail is not null then 'reviewed_cctv_or_alarm' end,
        case when vd.reviewed_security_procedures_detail is not null then 'reviewed_security_procedures' end,
        case when vd.provided_store_support_or_training_detail is not null then 'provided_store_support_or_training' end
      ]::text[], null)
    ) = 0
      then jsonb_build_object('other', vd.other_detail)
    else jsonb_strip_nulls(
      jsonb_build_object(
        'supported_investigation', vd.supported_investigation_detail,
        'reviewed_loss_controls', vd.reviewed_loss_controls_detail,
        'reviewed_cctv_or_alarm', vd.reviewed_cctv_or_alarm_detail,
        'reviewed_security_procedures', vd.reviewed_security_procedures_detail,
        'provided_store_support_or_training', vd.provided_store_support_or_training_detail
      )
    )
  end,
  '{}'::jsonb,
  vd.visit_notes,
  vd.follow_up_required,
  vd.need_score_snapshot,
  case
    when not vd.follow_up_required then case when vd.need_score_snapshot > 0 then 'monitor' else 'none' end
    when vd.risk_rating in ('critical', 'high') then 'urgent'
    when vd.risk_rating = 'medium' then 'needed'
    else 'monitor'
  end,
  to_jsonb(vd.need_reasons),
  vd.created_by_user_id,
  coalesce(vd.created_at, timezone('utc', now())),
  timezone('utc', now())
from visit_drafts vd
where not exists (
  select 1
  from public.tfs_store_visits sv
  where sv.store_id = vd.store_id
    and coalesce(sv.notes, '') ilike '%' || vd.source_marker || '%'
);

commit;
