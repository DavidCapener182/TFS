begin;

-- Seed realistic queue mock data for every active store.
-- Safe to run multiple times: existing mock rows are deleted first.
delete from public.tfs_case_events
where event_type = 'queue_demo_seed_v1';

delete from public.tfs_case_links
where case_id in (
  select id
  from public.tfs_cases
  where (origin_reference like 'DEMO-%' or origin_reference like 'SP-%')
    and intake_source = 'legacy_incident'
);

delete from public.tfs_cases
where (origin_reference like 'DEMO-%' or origin_reference like 'SP-%')
  and intake_source = 'legacy_incident';

delete from public.tfs_incidents
where reference_no like 'DEMO-SP-%'
   or coalesce(persons_involved->>'seedTag', '') = 'store_portal_live_seed_v1';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class cls on cls.oid = c.confrelid
    join pg_namespace n on n.oid = cls.relnamespace
    where c.conname = 'tfs_cases_store_id_fkey'
      and n.nspname = 'public'
      and cls.relname = 'tfs_stores'
  ) then
    raise exception 'tfs_cases_store_id_fkey is not pointing to public.tfs_stores. Please fix FK before running TFS-only seed.';
  end if;
end $$;

do $$
declare
  demo_reporter_id uuid;
begin
  select id
  into demo_reporter_id
  from public.fa_profiles
  order by full_name nulls last, id
  limit 1;

  if demo_reporter_id is null then
    raise exception 'No rows found in public.fa_profiles; cannot seed store-portal incidents.';
  end if;

  with store_rows as (
    select
      s.id as store_id,
      coalesce(nullif(trim(s.store_code), ''), 'STORE') as store_code,
      coalesce(nullif(trim(s.store_name), ''), 'Store') as store_name,
      row_number() over (order by s.store_code nulls last, s.store_name) as rn
    from public.tfs_stores s
    where coalesce(s.is_active, true) = true
  )
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
    status,
    riddor_reportable
  )
  select
    format('INC-%s-%s', to_char(current_date, 'YYYYMMDD'), lpad(sr.rn::text, 4, '0')),
    sr.store_id,
    demo_reporter_id,
    case
      when (sr.rn % 3) = 0 then 'theft'
      when (sr.rn % 3) = 1 then 'near_miss'
      else 'accident'
    end,
    case
      when (sr.rn % 3) = 0 then
        case
          when (120 + (sr.rn % 450)) <= 200 then 'low'
          when (120 + (sr.rn % 450)) <= 400 then 'medium'
          else 'high'
        end
      when (sr.rn % 3) = 1 then 'low'
      else 'high'
    end::public.fa_severity,
    case
      when (sr.rn % 3) = 0 then
        format('Theft reported: fragrance stock missing from sales floor at %s.', sr.store_name)
      when (sr.rn % 3) = 1 then
        format('Near miss reported at %s stockroom.', sr.store_name)
      else
        format('Injury incident reported in %s stockroom.', sr.store_name)
    end,
    case
      when (sr.rn % 3) = 0 then
        'Store team identified missing fragrance lines during floor check; CCTV review and offender pattern check required.'
      when (sr.rn % 3) = 1 then
        'Near miss recorded after a slip hazard was identified before injury occurred. Housekeeping controls and supervision checks required.'
      else
        'Team member slipped in stockroom due to packaging debris and sustained a minor injury. Incident logged for investigation and corrective action.'
    end,
    now() - (((sr.rn % 21) + 1)::int * interval '1 day') - ((sr.rn % 9)::int * interval '1 hour'),
    now() - ((sr.rn % 20)::int * interval '1 day'),
    case
      when (sr.rn % 3) = 0 then
        jsonb_build_object(
          'source', 'store_portal',
          'seedTag', 'store_portal_live_seed_v1',
          'reportType', 'theft',
          'submittedByStoreCode', sr.store_code,
          'people', jsonb_build_array(
            jsonb_build_object(
              'name', 'Unknown offender',
              'role', 'public',
              'involvement', 'Suspected shop theft from fragrance fixture.'
            )
          ),
          'theftItems', jsonb_build_array(
            jsonb_build_object(
              'productId', format('SKU-%s-A', lpad(sr.rn::text, 4, '0')),
              'title', 'Dior Miss Dior EDP 50ml',
              'barcode', format('55%04s', sr.rn::text),
              'quantity', ((sr.rn % 2) + 1),
              'unitPrice', 98.00
            ),
            jsonb_build_object(
              'productId', format('SKU-%s-B', lpad(sr.rn::text, 4, '0')),
              'title', 'YSL Libre EDP 50ml',
              'barcode', format('66%04s', sr.rn::text),
              'quantity', 1,
              'unitPrice', 86.00
            )
          ),
          'theftValueGbp', (((sr.rn % 2) + 1) * 98.00 + 86.00),
          'hasTheftBeenReported', true,
          'adjustedThroughTill', ((sr.rn % 4) = 0),
          'stockRecovered', ((sr.rn % 6) = 0)
        )
      else
        jsonb_build_object(
          'source', 'store_portal',
          'seedTag', 'store_portal_live_seed_v1',
          'reportType', 'incident',
          'submittedByStoreCode', sr.store_code,
          'personType', case when (sr.rn % 2) = 0 then 'employee' else 'public' end,
          'people', jsonb_build_array(
            jsonb_build_object(
              'name', case when (sr.rn % 2) = 0 then 'Store colleague' else 'Customer' end,
              'role', case when (sr.rn % 2) = 0 then 'employee' else 'public' end,
              'involvement',
              case
                when (sr.rn % 3) = 1 then 'Verbal altercation at checkout.'
                else 'Slip and trip in stockroom area.'
              end
            )
          )
        )
    end,
    case
      when (sr.rn % 7) = 0 then 'closed'
      when (sr.rn % 7) in (1, 2) then 'under_investigation'
      when (sr.rn % 7) in (3, 4) then 'actions_in_progress'
      else 'open'
    end::public.fa_incident_status,
    ((sr.rn % 9) = 0)
  from store_rows sr;
end $$;

with incident_rows as (
  select
    i.id as incident_id,
    i.store_id,
    i.reference_no,
    i.severity,
    i.summary,
    i.description,
    i.persons_involved,
    row_number() over (order by i.store_id, i.created_at nulls last, i.id) as rn
  from public.tfs_incidents i
  where coalesce(i.persons_involved->>'seedTag', '') = 'store_portal_live_seed_v1'
),
inserted_cases as (
  insert into public.tfs_cases (
    store_id,
    case_type,
    intake_source,
    origin_reference,
    severity,
    due_at,
    stage,
    next_action_code,
    next_action_label,
    last_update_summary,
    review_outcome,
    closure_outcome,
    closed_at
  )
  select
    ir.store_id,
    case
      when lower(coalesce(ir.persons_involved->>'reportType', 'incident')) = 'theft' then 'portal_theft'
      else 'portal_incident'
    end,
    'legacy_incident',
    format('SP-%s-%s', to_char(current_date, 'YYYYMMDD'), lpad(ir.rn::text, 4, '0')),
    coalesce(ir.severity, 'low')::public.fa_severity,
    case
      when (ir.rn % 7) = 0 then now() + interval '14 days'
      when (ir.rn % 7) = 1 then now() + interval '7 days'
      when (ir.rn % 7) = 2 then now() + interval '3 days'
      when (ir.rn % 7) = 3 then now() + interval '1 day'
      when (ir.rn % 7) = 4 then now() - interval '1 day'
      when (ir.rn % 7) = 5 then now() - interval '3 days'
      else null
    end,
    (array[
      'new_submission',
      'under_review',
      'action_agreed',
      'visit_required',
      'awaiting_follow_up',
      'ready_to_close',
      'closed'
    ]::public.tfs_case_stage[])[((ir.rn % 7) + 1)],
    case
      when (ir.rn % 7) = 0 then 'review_submission'
      when (ir.rn % 7) = 1 then 'complete_review'
      when (ir.rn % 7) = 2 then 'track_action'
      when (ir.rn % 7) = 3 then 'plan_visit'
      when (ir.rn % 7) = 4 then 'confirm_follow_up'
      when (ir.rn % 7) = 5 then 'close_case'
      else 'view_case'
    end,
    case
      when (ir.rn % 7) = 0 then 'Review new submission'
      when (ir.rn % 7) = 1 then 'Complete review decision'
      when (ir.rn % 7) = 2 then 'Track linked action'
      when (ir.rn % 7) = 3 then 'Plan and complete visit'
      when (ir.rn % 7) = 4 then 'Confirm follow-up status'
      when (ir.rn % 7) = 5 then 'Ready to close'
      else 'Closed'
    end,
    case
      when (ir.rn % 7) = 0 then coalesce(ir.description, ir.summary, 'New submission awaiting triage.')
      when (ir.rn % 7) = 1 then 'Case is under review by LP.'
      when (ir.rn % 7) = 2 then 'Follow-up action agreed and in progress.'
      when (ir.rn % 7) = 3 then 'Visit required to validate controls.'
      when (ir.rn % 7) = 4 then 'Awaiting follow-up evidence from store.'
      when (ir.rn % 7) = 5 then 'Blockers are clear and ready to close.'
      else coalesce(ir.description, ir.summary, 'Case already closed for baseline history.')
    end,
    case
      when (ir.rn % 7) in (2, 3, 4, 5) then 'store_action_created'::public.tfs_review_outcome
      when (ir.rn % 7) = 6 then 'closed_no_further_action'::public.tfs_review_outcome
      else null
    end,
    case
      when (ir.rn % 7) = 6 then 'Closure outcome: validated as no further action.'
      else null
    end,
    case
      when (ir.rn % 7) = 6 then now() - interval '2 days'
      else null
    end
  from incident_rows ir
  returning id, store_id, stage, last_update_summary
)
select 1;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tfs_case_links'
      and column_name = 'target_table'
  ) then
    insert into public.tfs_case_links (
      case_id,
      link_role,
      target_table,
      target_id,
      label
    )
    select
      c.id,
      'origin'::public.tfs_case_link_role,
      'tfs_incidents',
      i.id,
      i.reference_no
    from public.tfs_cases c
    join public.tfs_incidents i
      on i.store_id = c.store_id
     and coalesce(i.persons_involved->>'seedTag', '') = 'store_portal_live_seed_v1'
    where c.intake_source = 'legacy_incident'
      and c.origin_reference like 'SP-%'
      and not exists (
        select 1
        from public.tfs_case_links l
        where l.case_id = c.id
          and l.link_role = 'origin'
          and l.target_table = 'tfs_incidents'
          and l.target_id = i.id
      );
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tfs_case_links'
      and column_name = 'record_type'
  ) then
    insert into public.tfs_case_links (
      case_id,
      link_role,
      record_type,
      record_id
    )
    select
      c.id,
      'origin',
      'fa_incident',
      i.id
    from public.tfs_cases c
    join public.tfs_incidents i
      on i.store_id = c.store_id
     and coalesce(i.persons_involved->>'seedTag', '') = 'store_portal_live_seed_v1'
    where c.intake_source = 'legacy_incident'
      and c.origin_reference like 'SP-%'
      and not exists (
        select 1
        from public.tfs_case_links l
        where l.case_id = c.id
          and l.link_role = 'origin'
          and l.record_type = 'fa_incident'
          and l.record_id = i.id
      );
  else
    raise notice 'Skipping origin link seed rows because tfs_case_links schema is not recognized.';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tfs_case_events'
      and column_name = 'event_type'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tfs_case_events'
      and column_name = 'summary'
  ) and exists (
    select 1
    from pg_constraint c
    join pg_class cls on cls.oid = c.confrelid
    join pg_namespace n on n.oid = cls.relnamespace
    where c.conname = 'tfs_case_events_store_id_fkey'
      and n.nspname = 'public'
      and cls.relname = 'tfs_stores'
  ) then
    insert into public.tfs_case_events (
      case_id,
      store_id,
      event_type,
      summary
    )
    select
      c.id,
      c.store_id,
      'queue_demo_seed_v1',
      c.last_update_summary
    from public.tfs_cases c
    where (c.origin_reference like 'DEMO-%' or c.origin_reference like 'SP-%')
      and c.intake_source = 'legacy_incident';
  else
    raise notice 'Skipping tfs_case_events seed rows because tfs_case_events_store_id_fkey is not pointing to public.tfs_stores.';
  end if;
end $$;

commit;
