begin;

-- Repoint tfs_cases.store_id FK to TFS-owned stores table.
-- This script is intentionally defensive: it fails if existing case rows
-- do not have matching store IDs in public.tfs_stores.

do $$
declare
  orphan_count integer;
begin
  select count(*)
  into orphan_count
  from public.tfs_cases c
  left join public.tfs_stores s on s.id = c.store_id
  where s.id is null;

  if orphan_count > 0 then
    raise exception
      'Cannot repoint FK: % tfs_cases rows have store_id not found in public.tfs_stores.',
      orphan_count;
  end if;
end $$;

alter table public.tfs_cases
  drop constraint if exists tfs_cases_store_id_fkey;

alter table public.tfs_cases
  add constraint tfs_cases_store_id_fkey
  foreign key (store_id)
  references public.tfs_stores(id)
  on delete cascade;

commit;
