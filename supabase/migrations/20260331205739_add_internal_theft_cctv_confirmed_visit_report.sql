begin;

create or replace function public.tfs_store_visit_activity_allowed_field_keys(activity_key text)
returns text[]
language sql
immutable
as $$
  select case activity_key
    when 'checked_banking' then array['bankingReference', 'bankingItemsChecked', 'paperworkReviewed', 'discrepancyAction']
    when 'completed_till_checks' then array['tillsChecked', 'cashControlsReviewed', 'varianceAction']
    when 'completed_line_checks' then array[]::text[]
    when 'internal_theft_interview' then array[
      'lpObjective',
      'peoplePresent',
      'recordsReviewed',
      'caseReference',
      'interviewSubject',
      'allegationSummary',
      'datesOrShiftsInScope',
      'interviewSetting',
      'cashQuestionsAsked',
      'stockQuestionsAsked',
      'accessOrOpportunityExplored',
      'lossValueImpact',
      'rootCauseOrWeakness',
      'interviewAccountSummary',
      'admissionOrInconsistency',
      'evidenceMatchOrConflict',
      'otherPersonsNamed',
      'immediateContainment',
      'escalatedTo',
      'followUpOwnerDeadline',
      'evidencePreserved',
      'disciplinaryOrPoliceEscalation',
      'recoveryOrFurtherChecks'
    ]
    when 'internal_theft_cctv_confirmed' then array[
      'lpObjective',
      'peoplePresent',
      'recordsReviewed',
      'caseReference',
      'subjectIdentified',
      'datesOrClipsInScope',
      'cctvSummary',
      'theftMethodObserved',
      'stockOrCashAffected',
      'accessOrOpportunityConfirmed',
      'lossValueImpact',
      'rootCauseOrWeakness',
      'supportingEvidence',
      'responseOrStatus',
      'otherPersonsNamed',
      'immediateContainment',
      'escalatedTo',
      'followUpOwnerDeadline',
      'evidencePreserved',
      'disciplinaryOrPoliceEscalation',
      'recoveryOrFurtherChecks'
    ]
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
  elsif activity_key in ('checked_banking', 'completed_till_checks', 'internal_theft_interview', 'internal_theft_cctv_confirmed') then
    allowed_payload_keys := array['fields', 'amountConfirmed', 'amountChecks', 'itemsChecked'];
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
    'internal_theft_interview',
    'internal_theft_cctv_confirmed',
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

alter table public.tfs_visit_reports
  drop constraint if exists tfs_visit_reports_report_type_check;

alter table public.tfs_visit_reports
  add constraint tfs_visit_reports_report_type_check check (
    report_type in (
      'targeted_theft_visit',
      'checked_banking',
      'completed_till_checks',
      'completed_line_checks',
      'internal_theft_interview',
      'internal_theft_cctv_confirmed',
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
    )
  );

commit;
