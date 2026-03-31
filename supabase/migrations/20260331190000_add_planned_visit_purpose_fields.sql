alter table public.tfs_stores
  add column if not exists compliance_audit_2_planned_purpose text null,
  add column if not exists compliance_audit_2_planned_note text null;

comment on column public.tfs_stores.compliance_audit_2_planned_purpose is
  'Optional intent for a planned LP visit (for example targeted_theft_visit, checked_banking, general_follow_up).';

comment on column public.tfs_stores.compliance_audit_2_planned_note is
  'Optional free-text context for why a planned LP visit is being scheduled.';
