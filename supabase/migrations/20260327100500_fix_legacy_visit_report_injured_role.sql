begin;

-- Data fix for legacy visit-report incidents created before injured person role capture.
-- For the affected incident, set the recorded injured person's role to Employee.
update public.tfs_incidents
set persons_involved = jsonb_strip_nulls(
  coalesce(persons_involved, '{}'::jsonb) ||
  jsonb_build_object(
    'person_type', 'employee',
    'people', jsonb_build_array(
      jsonb_build_object(
        'role', 'Employee',
        'injured', true
      )
    )
  )
)
where reference_no = 'INC-2026-000001';

update public.tfs_closed_incidents
set persons_involved = jsonb_strip_nulls(
  coalesce(persons_involved, '{}'::jsonb) ||
  jsonb_build_object(
    'person_type', 'employee',
    'people', jsonb_build_array(
      jsonb_build_object(
        'role', 'Employee',
        'injured', true
      )
    )
  )
)
where reference_no = 'INC-2026-000001';

commit;

