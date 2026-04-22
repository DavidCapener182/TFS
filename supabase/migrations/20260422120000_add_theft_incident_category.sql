begin;

-- Allow explicit theft category (store portal + manual) alongside legacy security.
alter table public.tfs_incidents
  drop constraint if exists tfs_incidents_category_check;

alter table public.tfs_incidents
  add constraint tfs_incidents_category_check check (
    incident_category in (
      'accident',
      'near_miss',
      'security',
      'fire',
      'health_safety',
      'other',
      'theft'
    )
  );

alter table public.tfs_closed_incidents
  drop constraint if exists tfs_closed_incidents_category_check;

alter table public.tfs_closed_incidents
  add constraint tfs_closed_incidents_category_check check (
    incident_category in (
      'accident',
      'near_miss',
      'security',
      'fire',
      'health_safety',
      'other',
      'theft'
    )
  );

-- Store portal theft rows were inserted as `security` before `theft` existed.
update public.tfs_incidents
set incident_category = 'theft'
where coalesce(persons_involved->>'reportType', '') = 'theft'
  and coalesce(persons_involved->>'source', '') = 'store_portal'
  and incident_category = 'security';

update public.tfs_closed_incidents
set incident_category = 'theft'
where coalesce(persons_involved->>'reportType', '') = 'theft'
  and coalesce(persons_involved->>'source', '') = 'store_portal'
  and incident_category = 'security';

commit;
