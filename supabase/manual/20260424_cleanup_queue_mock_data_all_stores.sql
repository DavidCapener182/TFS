begin;

-- Remove mock queue data inserted by:
-- 20260424_seed_queue_mock_data_all_stores.sql
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tfs_case_events'
      and column_name = 'event_type'
  ) then
    delete from public.tfs_case_events
    where event_type = 'queue_demo_seed_v1'
       or (
         case_id in (
           select id
           from public.tfs_cases
           where (origin_reference like 'DEMO-%' or origin_reference like 'SP-%' or origin_reference like 'MOCK-%' or case_type = 'mock_queue_case')
            and intake_source = 'legacy_incident'
         )
       );
  else
    delete from public.tfs_case_events
    where case_id in (
      select id
      from public.tfs_cases
      where (origin_reference like 'DEMO-%' or origin_reference like 'SP-%' or origin_reference like 'MOCK-%' or case_type = 'mock_queue_case')
        and intake_source = 'legacy_incident'
    );
  end if;
end $$;

delete from public.tfs_case_links
where case_id in (
  select id
  from public.tfs_cases
  where (origin_reference like 'DEMO-%' or origin_reference like 'SP-%' or origin_reference like 'MOCK-%' or case_type = 'mock_queue_case')
    and intake_source = 'legacy_incident'
);

delete from public.tfs_cases
where (origin_reference like 'DEMO-%' or origin_reference like 'SP-%' or origin_reference like 'MOCK-%' or case_type = 'mock_queue_case')
  and intake_source = 'legacy_incident';

delete from public.tfs_incidents
where reference_no like 'DEMO-SP-%'
   or coalesce(persons_involved->>'seedTag', '') = 'store_portal_live_seed_v1';

commit;
