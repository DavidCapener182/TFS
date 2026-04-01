begin;

alter table public.tfs_inbound_emails
  add column if not exists analysis_source text null,
  add column if not exists analysis_template_key text null,
  add column if not exists analysis_summary text null,
  add column if not exists analysis_confidence numeric(5,2) null,
  add column if not exists analysis_needs_action boolean not null default false,
  add column if not exists analysis_needs_visit boolean not null default false,
  add column if not exists analysis_needs_incident boolean not null default false,
  add column if not exists analysis_payload jsonb not null default '{}'::jsonb,
  add column if not exists analysis_last_ran_at timestamptz null,
  add column if not exists analysis_error text null;

alter table public.tfs_inbound_emails
  drop constraint if exists tfs_inbound_emails_analysis_source_check;

alter table public.tfs_inbound_emails
  add constraint tfs_inbound_emails_analysis_source_check check (
    analysis_source is null or analysis_source in ('rule', 'ai')
  );

alter table public.tfs_inbound_emails
  drop constraint if exists tfs_inbound_emails_analysis_payload_object_check;

alter table public.tfs_inbound_emails
  add constraint tfs_inbound_emails_analysis_payload_object_check check (
    jsonb_typeof(analysis_payload) = 'object'
  );

create index if not exists tfs_inbound_emails_analysis_last_ran_at_idx
  on public.tfs_inbound_emails (analysis_last_ran_at desc nulls last);

create index if not exists tfs_inbound_emails_analysis_needs_follow_up_idx
  on public.tfs_inbound_emails (
    analysis_needs_action,
    analysis_needs_visit,
    analysis_needs_incident
  );

comment on column public.tfs_inbound_emails.analysis_source is
  'Whether the current classification came from the deterministic parser or fallback AI.';

comment on column public.tfs_inbound_emails.analysis_payload is
  'Structured parser output including extracted fields, suggested next steps, and matching evidence.';

commit;
