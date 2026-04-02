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
    when 'staff_theft_interview_plan' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'caseReference', 'subjectProfile', 'interviewLocation', 'evidenceAvailable',
      'introductionFormalities', 'toneSetting', 'generalQuestions', 'policyAwareness',
      'allegationIntroduction', 'evidencePresentation',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'directQuestioning', 'widerInvestigation',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo',
      'evidenceRetained', 'evidenceStoredAt', 'evidenceHeldBy', 'externalInvolvement', 'externalReference',
      'closingInterview', 'postInterviewActions'
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
    when 'conducted_opening_checks' then array[
      'activityReference', 'timeWindowInScope', 'storeArea', 'evidenceReference',
      'lpObjective', 'peoplePresent', 'recordsReviewed',
      'teamPresentAtOpen', 'openingChecksCompleted', 'alarmAndAccessStatus', 'safeAndHighRiskStockStatus',
      'caseConfidence', 'lossValueImpact', 'rootCauseOrWeakness', 'issuesAtOpen', 'signsOfEntryOrExposure',
      'outcomeStatus', 'followUpOwner', 'followUpDeadline', 'followUpStatus', 'followUpCompletedAt',
      'immediateContainment', 'escalatedTo', 'followUpOwnerDeadline', 'actionsBeforeTrading'
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
    'staff_theft_interview_plan',
    'supported_investigation',
    'reviewed_cctv_or_alarm',
    'reviewed_loss_controls',
    'conducted_opening_checks',
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

alter function public.tfs_store_visit_activity_allowed_field_keys(text)
  set search_path = public, pg_temp;

alter function public.tfs_validate_store_visit_activity_payloads(text[], jsonb)
  set search_path = public, pg_temp;

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
      'staff_theft_interview_plan',
      'supported_investigation',
      'reviewed_cctv_or_alarm',
      'reviewed_loss_controls',
      'conducted_opening_checks',
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
