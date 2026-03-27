begin;

with final_reports as (
  select
    vr.id as report_id,
    vr.store_id,
    vr.created_by_user_id,
    vr.title,
    vr.visit_date,
    vr.created_at,
    ('Source visit report ID: ' || vr.id::text) as source_marker,
    coalesce(nullif(vr.payload->>'riskRating', ''), 'low') as risk_rating,
    coalesce(
      nullif(btrim(vr.payload#>>'{signOff,visitedBy}'), ''),
      nullif(btrim(vr.payload->>'preparedBy'), '')
    ) as visited_by,
    nullif(btrim(vr.payload#>>'{signOff,storeRepresentative}'), '') as store_representative,
    coalesce((vr.payload#>>'{incidentOverview,sameOffendersSuspected}')::boolean, false) as same_offenders_suspected,
    coalesce((vr.payload#>>'{incidentOverview,violenceInvolved}')::boolean, false) as violence_involved,
    coalesce((vr.payload#>>'{incidentPeople,someoneInjured}')::boolean, false) as someone_injured_flag,
    nullif(btrim(vr.payload#>>'{incidentPeople,injurySummary}'), '') as injury_summary,
    nullif(btrim(vr.payload#>>'{recommendations,details}'), '') as recommendation_details,
    nullif(btrim(vr.payload#>>'{immediateActionsTaken,actionsCompleted}'), '') as immediate_actions_text,
    (
      select coalesce(
        jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'name', nullif(btrim(person ->> 'name'), ''),
              'role',
                case lower(coalesce(person ->> 'role', 'public'))
                  when 'employee' then 'Employee'
                  when 'contractor' then 'Contractor'
                  when 'other' then 'Unknown'
                  else 'Public'
                end,
              'involvement', nullif(btrim(person ->> 'involvement'), ''),
              'injured', coalesce((person ->> 'injured')::boolean, false),
              'injuryDetails', nullif(btrim(coalesce(person ->> 'injuryDetails', person ->> 'injury_details')), '')
            )
          )
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(
        case
          when jsonb_typeof(vr.payload#>'{incidentPeople,people}') = 'array'
            then vr.payload#>'{incidentPeople,people}'
          else '[]'::jsonb
        end
      ) as people(person)
    ) as structured_people
  from public.tfs_visit_reports vr
  where vr.status = 'final'
),
normalized_reports as (
  select
    fr.*,
    case
      when jsonb_array_length(fr.structured_people) > 0 then fr.structured_people
      else jsonb_build_array(
        jsonb_build_object(
          'name', null,
          'role', 'Public',
          'involvement', 'Public / offender involvement captured via targeted theft visit report.',
          'injured', false
        )
      )
    end as normalized_people,
    case
      when jsonb_array_length(fr.structured_people) > 0 then coalesce(
        (
          select
            case
              when lower(person ->> 'role') like '%employee%' then 'Employee'
              when lower(person ->> 'role') like '%contractor%' then 'Contractor'
              when lower(person ->> 'role') like '%near%' then 'Near Miss'
              when lower(person ->> 'role') like '%public%' then 'Public'
              else 'Unknown'
            end
          from jsonb_array_elements(fr.structured_people) as people(person)
          limit 1
        ),
        'Public'
      )
      else 'Public'
    end as primary_person_type,
    (
      select coalesce(jsonb_agg(person), '[]'::jsonb)
      from jsonb_array_elements(
        case
          when jsonb_array_length(fr.structured_people) > 0 then fr.structured_people
          else '[]'::jsonb
        end
      ) as people(person)
      where coalesce((person ->> 'injured')::boolean, false)
    ) as injured_people
  from final_reports fr
),
open_links as (
  select
    nr.*,
    incident_lookup.id as incident_id
  from normalized_reports nr
  join lateral (
    select i.id
    from public.tfs_incidents i
    where i.store_id = nr.store_id
      and coalesce(i.description, '') ilike '%' || nr.source_marker || '%'
    order by i.created_at desc nulls last
    limit 1
  ) as incident_lookup on true
),
closed_links as (
  select
    nr.*,
    incident_lookup.id as incident_id
  from normalized_reports nr
  join lateral (
    select i.id
    from public.tfs_closed_incidents i
    where i.store_id = nr.store_id
      and coalesce(i.description, '') ilike '%' || nr.source_marker || '%'
    order by i.updated_at desc nulls last
    limit 1
  ) as incident_lookup on true
),
updated_open_incidents as (
  update public.tfs_incidents i
  set
    persons_involved = jsonb_strip_nulls(
      coalesce(i.persons_involved, '{}'::jsonb) ||
      jsonb_build_object(
        'source', 'visit_report',
        'visit_report_id', ol.report_id,
        'person_type', coalesce(nullif(i.persons_involved->>'person_type', ''), ol.primary_person_type),
        'visited_by', coalesce(nullif(i.persons_involved->>'visited_by', ''), ol.visited_by),
        'store_representative', coalesce(nullif(i.persons_involved->>'store_representative', ''), ol.store_representative),
        'same_offenders_suspected', ol.same_offenders_suspected,
        'violence_involved', ol.violence_involved,
        'people', ol.normalized_people
      )
    ),
    injury_details = jsonb_strip_nulls(
      coalesce(i.injury_details, '{}'::jsonb) ||
      jsonb_build_object(
        'source', 'visit_report',
        'incident_type', 'Targeted Theft Visit',
        'someone_injured', (
          ol.someone_injured_flag
          or jsonb_array_length(ol.injured_people) > 0
          or ol.injury_summary is not null
        ),
        'injury_summary', ol.injury_summary,
        'first_aid_action',
          case
            when (
              ol.someone_injured_flag
              or jsonb_array_length(ol.injured_people) > 0
              or ol.injury_summary is not null
            ) then 'See visit report injury summary.'
            else 'No injury reported.'
          end,
        'injured_people', ol.injured_people
      )
    )
  from open_links ol
  where i.id = ol.incident_id
  returning i.id
),
updated_closed_incidents as (
  update public.tfs_closed_incidents i
  set
    persons_involved = jsonb_strip_nulls(
      coalesce(i.persons_involved, '{}'::jsonb) ||
      jsonb_build_object(
        'source', 'visit_report',
        'visit_report_id', cl.report_id,
        'person_type', coalesce(nullif(i.persons_involved->>'person_type', ''), cl.primary_person_type),
        'visited_by', coalesce(nullif(i.persons_involved->>'visited_by', ''), cl.visited_by),
        'store_representative', coalesce(nullif(i.persons_involved->>'store_representative', ''), cl.store_representative),
        'same_offenders_suspected', cl.same_offenders_suspected,
        'violence_involved', cl.violence_involved,
        'people', cl.normalized_people
      )
    ),
    injury_details = jsonb_strip_nulls(
      coalesce(i.injury_details, '{}'::jsonb) ||
      jsonb_build_object(
        'source', 'visit_report',
        'incident_type', 'Targeted Theft Visit',
        'someone_injured', (
          cl.someone_injured_flag
          or jsonb_array_length(cl.injured_people) > 0
          or cl.injury_summary is not null
        ),
        'injury_summary', cl.injury_summary,
        'first_aid_action',
          case
            when (
              cl.someone_injured_flag
              or jsonb_array_length(cl.injured_people) > 0
              or cl.injury_summary is not null
            ) then 'See visit report injury summary.'
            else 'No injury reported.'
          end,
        'injured_people', cl.injured_people
      )
    )
  from closed_links cl
  where i.id = cl.incident_id
  returning i.id
)
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
  ol.incident_id,
  'Implement visit report actions: ' || ol.title,
  nullif(
    btrim(
      concat_ws(
        E'\n\n',
        'Implement agreed mitigations from the visit report.',
        ol.immediate_actions_text,
        ol.recommendation_details,
        ol.source_marker
      )
    ),
    ''
  ),
  case ol.risk_rating
    when 'critical' then 'urgent'
    when 'high' then 'high'
    when 'medium' then 'medium'
    else 'low'
  end,
  ol.created_by_user_id,
  case ol.risk_rating
    when 'critical' then ol.visit_date + 2
    when 'high' then ol.visit_date + 5
    when 'medium' then ol.visit_date + 7
    else ol.visit_date + 14
  end,
  'open',
  false,
  coalesce(ol.created_at, timezone('utc', now())),
  timezone('utc', now())
from open_links ol
where not exists (
  select 1
  from public.tfs_actions a
  where a.incident_id = ol.incident_id
    and coalesce(a.description, '') ilike '%' || ol.source_marker || '%'
);

update public.tfs_incidents i
set status = 'actions_in_progress'
where i.status not in ('closed', 'cancelled')
  and exists (
    select 1
    from public.tfs_actions a
    where a.incident_id = i.id
      and a.status not in ('complete', 'cancelled')
  );

commit;
