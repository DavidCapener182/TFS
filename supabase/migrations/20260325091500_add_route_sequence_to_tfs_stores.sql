begin;

alter table public.tfs_stores
  add column if not exists route_sequence integer null;

create index if not exists tfs_stores_route_sequence_idx
  on public.tfs_stores (compliance_audit_2_planned_date, compliance_audit_2_assigned_manager_user_id, route_sequence)
  where route_sequence is not null;

commit;
