begin;

-- Repoint tfs_case_events.store_id FK to TFS-owned stores table.
-- Defensive guard: fail if any existing event rows reference store IDs
-- not present in public.tfs_stores.

do $$
declare
  orphan_count integer;
begin
  select count(*)
  into orphan_count
  from public.tfs_case_events e
  left join public.tfs_stores s on s.id = e.store_id
  where s.id is null;

  if orphan_count > 0 then
    raise exception
      'Cannot repoint tfs_case_events FK: % rows have store_id not found in public.tfs_stores.',
      orphan_count;
  end if;
end $$;

alter table public.tfs_case_events
  drop constraint if exists tfs_case_events_store_id_fkey;

alter table public.tfs_case_events
  add constraint tfs_case_events_store_id_fkey
  foreign key (store_id)
  references public.tfs_stores(id)
  on delete cascade;

commit;
