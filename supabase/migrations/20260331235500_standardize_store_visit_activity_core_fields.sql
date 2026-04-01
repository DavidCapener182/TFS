begin;

create or replace function public.tfs_store_visit_activity_allowed_field_keys(activity_key text)
returns text[]
language sql
immutable
as $$
  select case activity_key
    when 'checked_banking' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'bankingReference', 'reviewCompletedWith', 'bankingItemsChecked', 'paperworkReviewed',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'discrepancyType',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline', 'discrepancyAction'
    ]
    when 'completed_till_checks' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'tillsChecked', 'reviewCompletedWith', 'cashControlsReviewed', 'spotCheckWindow',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'variancePattern',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline', 'varianceAction'
    ]
    when 'completed_line_checks' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'linesChecked', 'areasChecked', 'countMethod', 'highRiskProductsChecked',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline'
    ]
    when 'internal_theft_interview' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'caseReference', 'interviewSubject', 'allegationSummary', 'datesOrShiftsInScope', 'interviewSetting',
      'cashQuestionsAsked', 'stockQuestionsAsked', 'accessOrOpportunityExplored',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness',
      'interviewAccountSummary', 'admissionOrInconsistency', 'evidenceMatchOrConflict', 'otherPersonsNamed',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'followUpOwnerDeadline', 'evidencePreserved', 'disciplinaryOrPoliceEscalation', 'recoveryOrFurtherChecks'
    ]
    when 'internal_theft_cctv_confirmed' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'caseReference', 'subjectIdentified', 'datesOrClipsInScope', 'cctvSummary', 'theftMethodObserved',
      'stockOrCashAffected', 'accessOrOpportunityConfirmed',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness',
      'supportingEvidence', 'responseOrStatus', 'otherPersonsNamed',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'followUpOwnerDeadline', 'evidencePreserved', 'disciplinaryOrPoliceEscalation', 'recoveryOrFurtherChecks'
    ]
    when 'supported_investigation' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'caseReference', 'investigationFocus', 'subjectsInvolved', 'evidenceReviewed',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'keyLPConcern',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'followUpOwnerDeadline', 'workCompleted', 'outcomeOrEscalation'
    ]
    when 'reviewed_cctv_or_alarm' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'systemsChecked', 'areasReviewed', 'functionTestCompleted',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'faultsFound', 'evidenceQuality',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'followUpOwnerDeadline', 'actionsAgreed', 'calloutOrTicketReference'
    ]
    when 'reviewed_loss_controls' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'controlsChecked', 'hotspotsReviewed', 'highRiskProductsReviewed',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'weaknessesFound', 'deterrenceGap',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline', 'correctiveAction'
    ]
    when 'conducted_stop_on_close' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'teamPresent', 'closingChecksCompleted', 'cashAndKeysVerified',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'issuesAtClose',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline', 'actionsBeforeLeaving'
    ]
    when 'took_statements_or_interviews' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'caseReference', 'peopleSpokenTo', 'statementPurpose', 'recordsCaptured',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'keyPointsCaptured',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'followUpOwnerDeadline', 'followUpRequired', 'evidenceStored'
    ]
    when 'reviewed_paperwork_or_processes' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'paperworkChecked', 'areasReviewed', 'periodCovered',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'nonComplianceFound', 'repeatProcessGap',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'followUpOwnerDeadline', 'correctionsMade'
    ]
    when 'reviewed_stock_loss_or_counts' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'stockAreaReviewed', 'lossIssueReviewed', 'countSourceUsed',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'countFindings', 'trendOrPattern',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline', 'actionEscalated'
    ]
    when 'checked_delivery_or_parcel_issue' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'deliveryReference', 'issueReviewed', 'carrierOrSupplier',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'affectedItems', 'sealOrPackagingCondition',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'followUpOwnerDeadline', 'actionsTaken', 'claimOrCaseReference'
    ]
    when 'reviewed_security_procedures' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'proceduresChecked', 'areasCovered', 'guardOrKeyholderPresent',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'weaknessesFound', 'breachOrExposure',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'followUpOwnerDeadline', 'actionsAgreed'
    ]
    when 'provided_store_support_or_training' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'topicCovered', 'deliveredTo', 'trainingReason',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'observedKnowledgeGap',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline', 'guidanceGiven', 'followUpNeeded'
    ]
    when 'other' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'activityType', 'details',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'lpRiskObserved',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline'
    ]
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
    allowed_payload_keys := array['fields', 'itemsChecked'];
  elsif activity_key in ('checked_banking', 'completed_till_checks') then
    allowed_payload_keys := array['fields', 'amountConfirmed', 'amountChecks'];
  elsif activity_key in ('internal_theft_interview', 'internal_theft_cctv_confirmed') then
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

commit;
