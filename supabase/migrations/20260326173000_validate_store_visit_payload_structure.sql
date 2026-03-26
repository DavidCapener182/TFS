begin;

create or replace function public.tfs_jsonb_object_keys_subset(
  p_object jsonb,
  allowed_keys text[]
)
returns boolean
language sql
immutable
as $$
  select case
    when p_object is null then true
    when jsonb_typeof(p_object) <> 'object' then false
    else not exists (
      select 1
      from jsonb_object_keys(p_object) as key_name
      where not (key_name = any(allowed_keys))
    )
  end;
$$;

create or replace function public.tfs_validate_store_visit_field_values(p_fields jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when p_fields is null then true
    when jsonb_typeof(p_fields) <> 'object' then false
    else not exists (
      select 1
      from jsonb_each(p_fields) as field_entry(key_name, field_value)
      where jsonb_typeof(field_value) not in ('string', 'null')
    )
  end;
$$;

create or replace function public.tfs_validate_store_visit_items_checked(p_items jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
begin
  if p_items is null then
    return true;
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;

    if not public.tfs_jsonb_object_keys_subset(
      item,
      array['productId', 'productLabel', 'variantLabel', 'sizeLabel', 'systemQuantity', 'countedQuantity', 'notes']
    ) then
      return false;
    end if;

    if item ? 'productId' and jsonb_typeof(item -> 'productId') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'productLabel' and jsonb_typeof(item -> 'productLabel') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'variantLabel' and jsonb_typeof(item -> 'variantLabel') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'sizeLabel' and jsonb_typeof(item -> 'sizeLabel') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'notes' and jsonb_typeof(item -> 'notes') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'systemQuantity' and jsonb_typeof(item -> 'systemQuantity') not in ('number', 'null') then
      return false;
    end if;

    if item ? 'countedQuantity' and jsonb_typeof(item -> 'countedQuantity') not in ('number', 'null') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.tfs_validate_store_visit_amount_checks(p_checks jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
begin
  if p_checks is null then
    return true;
  end if;

  if jsonb_typeof(p_checks) <> 'array' then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_checks)
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;

    if not public.tfs_jsonb_object_keys_subset(
      item,
      array['label', 'systemAmount', 'countedAmount', 'amountMatches', 'notes']
    ) then
      return false;
    end if;

    if item ? 'label' and jsonb_typeof(item -> 'label') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'notes' and jsonb_typeof(item -> 'notes') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'systemAmount' and jsonb_typeof(item -> 'systemAmount') not in ('number', 'null') then
      return false;
    end if;

    if item ? 'countedAmount' and jsonb_typeof(item -> 'countedAmount') not in ('number', 'null') then
      return false;
    end if;

    if item ? 'amountMatches' and jsonb_typeof(item -> 'amountMatches') not in ('boolean', 'null') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.tfs_store_visit_activity_allowed_field_keys(activity_key text)
returns text[]
language sql
immutable
as $$
  select case activity_key
    when 'checked_banking' then array['bankingReference', 'bankingItemsChecked', 'paperworkReviewed', 'discrepancyAction']
    when 'completed_till_checks' then array['tillsChecked', 'cashControlsReviewed', 'varianceAction']
    when 'completed_line_checks' then array[]::text[]
    when 'supported_investigation' then array['caseReference', 'investigationFocus', 'evidenceReviewed', 'workCompleted', 'outcomeOrEscalation']
    when 'reviewed_cctv_or_alarm' then array['systemsChecked', 'areasReviewed', 'faultsFound', 'actionsAgreed']
    when 'reviewed_loss_controls' then array['controlsChecked', 'hotspotsReviewed', 'weaknessesFound', 'correctiveAction']
    when 'conducted_stop_on_close' then array['teamPresent', 'closingChecksCompleted', 'issuesAtClose', 'actionsBeforeLeaving']
    when 'took_statements_or_interviews' then array['caseReference', 'peopleSpokenTo', 'statementPurpose', 'keyPointsCaptured', 'followUpRequired']
    when 'reviewed_paperwork_or_processes' then array['paperworkChecked', 'areasReviewed', 'nonComplianceFound', 'correctionsMade']
    when 'reviewed_stock_loss_or_counts' then array['stockAreaReviewed', 'lossIssueReviewed', 'countFindings', 'actionEscalated']
    when 'checked_delivery_or_parcel_issue' then array['deliveryReference', 'issueReviewed', 'affectedItems', 'actionsTaken']
    when 'reviewed_security_procedures' then array['proceduresChecked', 'weaknessesFound', 'actionsAgreed']
    when 'provided_store_support_or_training' then array['topicCovered', 'deliveredTo', 'guidanceGiven', 'followUpNeeded']
    when 'other' then array['details']
    else array[]::text[]
  end;
$$;

create or replace function public.tfs_validate_store_visit_activity_payload(
  activity_key text,
  payload jsonb
)
returns boolean
language plpgsql
immutable
as $$
declare
  allowed_payload_keys text[];
  allowed_field_keys text[];
begin
  if payload is null then
    return true;
  end if;

  if jsonb_typeof(payload) <> 'object' then
    return false;
  end if;

  allowed_field_keys := public.tfs_store_visit_activity_allowed_field_keys(activity_key);

  if activity_key = 'completed_line_checks' then
    allowed_payload_keys := array['itemsChecked'];
  elsif activity_key in ('checked_banking', 'completed_till_checks') then
    allowed_payload_keys := array['fields', 'amountConfirmed', 'amountChecks'];
  else
    allowed_payload_keys := array['fields'];
  end if;

  if not public.tfs_jsonb_object_keys_subset(payload, allowed_payload_keys) then
    return false;
  end if;

  if payload ? 'fields' then
    if not public.tfs_validate_store_visit_field_values(payload -> 'fields') then
      return false;
    end if;

    if not public.tfs_jsonb_object_keys_subset(payload -> 'fields', allowed_field_keys) then
      return false;
    end if;
  end if;

  if payload ? 'amountConfirmed' and jsonb_typeof(payload -> 'amountConfirmed') not in ('boolean', 'null') then
    return false;
  end if;

  if payload ? 'itemsChecked' and not public.tfs_validate_store_visit_items_checked(payload -> 'itemsChecked') then
    return false;
  end if;

  if payload ? 'amountChecks' and not public.tfs_validate_store_visit_amount_checks(payload -> 'amountChecks') then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.tfs_validate_store_visit_activity_payloads(
  activity_keys text[],
  payloads jsonb
)
returns boolean
language plpgsql
immutable
as $$
declare
  allowed_activity_keys constant text[] := array[
    'checked_banking',
    'completed_till_checks',
    'completed_line_checks',
    'supported_investigation',
    'reviewed_cctv_or_alarm',
    'reviewed_loss_controls',
    'conducted_stop_on_close',
    'took_statements_or_interviews',
    'reviewed_paperwork_or_processes',
    'reviewed_stock_loss_or_counts',
    'checked_delivery_or_parcel_issue',
    'reviewed_security_procedures',
    'provided_store_support_or_training',
    'other'
  ];
  entry record;
begin
  if payloads is null then
    return true;
  end if;

  if jsonb_typeof(payloads) <> 'object' then
    return false;
  end if;

  for entry in select key, value from jsonb_each(payloads)
  loop
    if not (entry.key = any(allowed_activity_keys)) then
      return false;
    end if;

    if not (entry.key = any(coalesce(activity_keys, array[]::text[]))) then
      return false;
    end if;

    if not public.tfs_validate_store_visit_activity_payload(entry.key, entry.value) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter table public.tfs_store_visits
  drop constraint if exists tfs_store_visits_activity_payloads_structured_check;

alter table public.tfs_store_visits
  add constraint tfs_store_visits_activity_payloads_structured_check
  check (
    public.tfs_validate_store_visit_activity_payloads(
      completed_activity_keys,
      completed_activity_payloads
    )
  ) not valid;

comment on column public.tfs_store_visits.completed_activity_payloads is
  'Structured visit activity data keyed by completed visit activity, including task-specific fields, line counts, and cash checks.';

commit;
