export const STORE_VISIT_TYPE_OPTIONS = [
  {
    value: 'action_led',
    label: 'Action-led visit',
    description: 'Triggered by current loss prevention actions or incidents.',
  },
  {
    value: 'planned',
    label: 'Planned route visit',
    description: 'Completed as part of a scheduled route or arranged visit.',
  },
  {
    value: 'random_area',
    label: 'Random in-area visit',
    description: 'Officer called in while already working nearby.',
  },
  {
    value: 'follow_up',
    label: 'Follow-up visit',
    description: 'Return visit to check previous concerns or actions.',
  },
] as const

type StoreVisitLegacyPayloadField =
  | 'summary'
  | 'findings'
  | 'actionsTaken'
  | 'nextSteps'
  | 'peopleInvolved'
  | 'reference'

export type StoreVisitActivityFieldSection = 'what_checked' | 'findings' | 'actions'
export type StoreVisitActivityFieldInput = 'text' | 'textarea' | 'select' | 'date'

export interface StoreVisitActivityFieldOption {
  value: string
  label: string
}

export interface StoreVisitActivityGuidance {
  helperText?: string
  scriptLines?: readonly string[]
  captureHint?: string
}

export interface StoreVisitActivityFieldDefinition {
  key: string
  label: string
  placeholder: string
  input: StoreVisitActivityFieldInput
  section?: StoreVisitActivityFieldSection
  required?: boolean
  options?: readonly StoreVisitActivityFieldOption[]
  helperText?: string
  scriptLines?: readonly string[]
  captureHint?: string
}

export interface StoreVisitActivityGuideCard {
  title: string
  intro: string
  prompts: readonly string[]
}

export interface StoreVisitActivityOption {
  key: string
  label: string
  description: string
  detailPlaceholder: string
  formVariant: 'structured' | 'line-check' | 'cash-check' | 'internal-theft'
  evidenceLabel: string
  specialist?: boolean
  fields?: readonly StoreVisitActivityFieldDefinition[]
  detailFieldKeys?: readonly string[]
  legacyFieldMap?: Partial<Record<StoreVisitLegacyPayloadField, string>>
  sectionGuides?: Partial<Record<StoreVisitActivityFieldSection, StoreVisitActivityGuideCard>>
  countedItemsGuide?: StoreVisitActivityGuideCard
  amountChecksGuide?: StoreVisitActivityGuideCard
}

const COMMON_ACTIVITY_CONTEXT_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  {
    key: 'lpObjective',
    label: 'LP objective / trigger',
    placeholder: 'What incident, action, trend, audit gap, complaint, or intelligence triggered this report?',
    input: 'textarea',
    section: 'what_checked',
    scriptLines: ['"What brought you to site today, and what LP concern or trigger are you working on?"'],
    captureHint: 'Record the incident, trend, request, complaint, or control gap that triggered the activity.',
  },
  {
    key: 'peoplePresent',
    label: 'People present / involved',
    placeholder: 'Manager, keyholder, sales advisor, guard, courier, witness, contractor...',
    input: 'text',
    section: 'what_checked',
    scriptLines: ['"Who was involved in this work, who did you review it with, and who needs to be named?"'],
    captureHint: 'List the key people present, spoken to, or directly involved in the activity.',
  },
  {
    key: 'recordsReviewed',
    label: 'Records / evidence reviewed',
    placeholder: 'CCTV, paperwork, till reports, stock files, statements, delivery notes, alarm logs...',
    input: 'textarea',
    section: 'what_checked',
    scriptLines: ['"What records, systems, footage, paperwork, or evidence did you review while doing this work?"'],
    captureHint: 'Capture the evidence and records checked so the report shows what the review was based on.',
  },
]

const COMMON_ACTIVITY_FINDINGS_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  {
    key: 'lossValueImpact',
    label: 'Loss / value impact',
    placeholder: 'Known shortage, units missing, cash discrepancy, value at risk, or potential exposure.',
    input: 'text',
    section: 'findings',
    scriptLines: ['"What loss, shortage, value at risk, or exposure was identified or ruled out?"'],
    captureHint: 'Record the confirmed or suspected loss value, stock units, cash variance, or exposure.',
  },
  {
    key: 'rootCauseOrWeakness',
    label: 'Root cause / control weakness',
    placeholder: 'What control or process weakness allowed the issue to happen or continue?',
    input: 'textarea',
    section: 'findings',
    scriptLines: ['"What control gap, behaviour, or process weakness appears to explain the issue?"'],
    captureHint: 'Summarise the root cause, missed control, or weakness that allowed the issue to happen or continue.',
  },
]

const COMMON_ACTIVITY_ACTION_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  {
    key: 'immediateContainment',
    label: 'Immediate containment completed',
    placeholder: 'What was secured, removed, corrected, coached, or contained before leaving site?',
    input: 'textarea',
    section: 'actions',
    scriptLines: ['"What did you secure, correct, contain, or coach before leaving site?"'],
    captureHint: 'Record the immediate containment or corrective action completed before the visit ended.',
  },
  {
    key: 'escalatedTo',
    label: 'Escalated to',
    placeholder: 'Manager, area manager, finance, investigations, HR, security provider, police...',
    input: 'text',
    section: 'actions',
    scriptLines: ['"Who was updated or escalated to after this work was completed?"'],
    captureHint: 'List the people or teams the issue was escalated or handed over to.',
  },
  {
    key: 'followUpOwnerDeadline',
    label: 'Follow-up owner / timescale',
    placeholder: 'Who owns the next step and by when?',
    input: 'text',
    section: 'actions',
    scriptLines: ['"Who owns the next step, and by what date or deadline?"'],
    captureHint: 'Record the owner and timescale for any follow-up action.',
  },
]

export const STORE_VISIT_ACTIVITY_OUTCOME_STATUS_OPTIONS = [
  { value: 'closed_no_issue', label: 'Closed - no issue' },
  { value: 'closed_corrected_on_site', label: 'Closed - corrected on site' },
  { value: 'follow_up_required', label: 'Follow-up required' },
  { value: 'escalated_internal', label: 'Escalated internally' },
  { value: 'escalated_external', label: 'Escalated externally' },
] as const satisfies readonly StoreVisitActivityFieldOption[]

export const STORE_VISIT_ACTIVITY_CONFIDENCE_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'probable', label: 'Probable' },
  { value: 'suspected', label: 'Suspected' },
  { value: 'ruled_out', label: 'Ruled out' },
  { value: 'not_substantiated', label: 'Not substantiated' },
] as const satisfies readonly StoreVisitActivityFieldOption[]

export const STORE_VISIT_ACTIVITY_FOLLOW_UP_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
] as const satisfies readonly StoreVisitActivityFieldOption[]

const ACTIVITY_SCOPE_CORE_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  {
    key: 'activityReference',
    label: 'Incident / visit reference',
    placeholder: 'Incident number, visit ref, case ref, claim ref, or other tracking reference...',
    input: 'text',
    section: 'what_checked',
    required: true,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"What is the main incident, visit, case, or claim reference for this activity?"'],
    captureHint: 'Record the main reference that should be used to trace this activity later.',
  },
  {
    key: 'timeWindowInScope',
    label: 'Exact date / time window in scope',
    placeholder: 'Exact date, shift, clip time, transaction window, delivery slot, or period reviewed...',
    input: 'text',
    section: 'what_checked',
    required: true,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"What exact date, time window, shift, or review period does this activity cover?"'],
    captureHint: 'Record the precise operational window in scope for this activity, even though the visit itself already has a visit date/time.',
  },
  {
    key: 'storeArea',
    label: 'Exact store area',
    placeholder: 'Till area, stockroom, entrance, fragrance wall, cabinet, office, delivery bay...',
    input: 'text',
    section: 'what_checked',
    required: true,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"Which exact store area, location, fixture, or control point does this activity relate to?"'],
    captureHint: 'Name the specific store area or operational point that was checked.',
  },
  {
    key: 'evidenceReference',
    label: 'Evidence reference',
    placeholder: 'Uploaded file name, case ref, clip ref, claim ref, ticket ref, or external evidence reference...',
    input: 'text',
    section: 'what_checked',
    required: true,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"What evidence reference links this activity to uploaded files, footage, documents, or external records?"'],
    captureHint: 'Record the evidence reference that ties this activity back to uploaded or external evidence.',
  },
]

const ACTIVITY_FINDINGS_CORE_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  {
    key: 'caseConfidence',
    label: 'Confidence / case status',
    placeholder: 'Select confidence level',
    input: 'select',
    section: 'findings',
    required: true,
    options: STORE_VISIT_ACTIVITY_CONFIDENCE_OPTIONS,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"Based on the evidence reviewed, is this confirmed, probable, suspected, ruled out, or not substantiated?"'],
    captureHint: 'Choose the confidence level that best reflects the evidence position without overstating it.',
  },
]

const ACTIVITY_ACTION_CORE_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  {
    key: 'outcomeStatus',
    label: 'Outcome status',
    placeholder: 'Select outcome status',
    input: 'select',
    section: 'actions',
    required: true,
    options: STORE_VISIT_ACTIVITY_OUTCOME_STATUS_OPTIONS,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"What is the overall outcome of this activity right now?"'],
    captureHint: 'Choose the operational outcome that best describes how this activity closed or escalated.',
  },
  {
    key: 'followUpOwner',
    label: 'Follow-up owner',
    placeholder: 'Name the person or team who owns the next step...',
    input: 'text',
    section: 'actions',
    required: true,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"Who owns the next action after this visit or report?"'],
    captureHint: 'Record the named owner for the next step.',
  },
  {
    key: 'followUpDeadline',
    label: 'Follow-up deadline',
    placeholder: 'Select follow-up deadline',
    input: 'date',
    section: 'actions',
    required: true,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"What is the deadline for that follow-up action?"'],
    captureHint: 'Record the target date for follow-up completion.',
  },
  {
    key: 'followUpStatus',
    label: 'Follow-up status',
    placeholder: 'Select follow-up status',
    input: 'select',
    section: 'actions',
    required: true,
    options: STORE_VISIT_ACTIVITY_FOLLOW_UP_STATUS_OPTIONS,
    helperText: 'Required core field for every activity.',
    scriptLines: ['"What is the current status of the follow-up work?"'],
    captureHint: 'Choose the current status of the follow-up action.',
  },
  {
    key: 'followUpCompletedAt',
    label: 'Follow-up completed date',
    placeholder: 'Select completion date',
    input: 'date',
    section: 'actions',
    required: true,
    helperText: 'Complete this when the follow-up has actually been finished.',
    scriptLines: ['"If the follow-up is complete, on what date was it completed?"'],
    captureHint: 'Record the completion date when the follow-up has been closed out.',
  },
]

const ACTIVITY_EVIDENCE_CHAIN_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  {
    key: 'evidenceRetained',
    label: 'Evidence retained',
    placeholder: 'What evidence was retained, preserved, exported, or requested?',
    input: 'textarea',
    section: 'actions',
    scriptLines: ['"What evidence was retained, preserved, exported, or requested as part of this activity?"'],
    captureHint: 'Record the evidence that was formally retained or preserved.',
  },
  {
    key: 'evidenceStoredAt',
    label: 'Where evidence is stored',
    placeholder: 'Shared drive, case folder, system, locker, safe, email chain, police portal...',
    input: 'text',
    section: 'actions',
    scriptLines: ['"Where is the retained evidence now stored?"'],
    captureHint: 'State where the evidence is stored so it can be located later.',
  },
  {
    key: 'evidenceHeldBy',
    label: 'Who holds evidence now',
    placeholder: 'LP officer, store manager, HR, police, courier claims team...',
    input: 'text',
    section: 'actions',
    scriptLines: ['"Who currently holds or controls that evidence?"'],
    captureHint: 'Name the person or team currently holding the evidence.',
  },
  {
    key: 'externalInvolvement',
    label: 'External involvement',
    placeholder: 'Police, HR, insurer, courier claim, supplier claim, contractor ticket, none...',
    input: 'text',
    section: 'actions',
    scriptLines: ['"Is any external party or formal process involved in this case?"'],
    captureHint: 'Record any external party or formal process now involved.',
  },
  {
    key: 'externalReference',
    label: 'External reference number',
    placeholder: 'Police CAD, HR case, insurer claim, courier claim, contractor ticket...',
    input: 'text',
    section: 'actions',
    scriptLines: ['"What external reference number or case number is linked to that involvement?"'],
    captureHint: 'Record the linked external reference if one exists.',
  },
]

const INTERNAL_THEFT_FACTUAL_NOTE =
  'Record material wording verbatim where it matters, separate fact from inference, and avoid opinion.'

function getActivityFieldDefinition(
  fields: readonly StoreVisitActivityFieldDefinition[],
  key: string
): StoreVisitActivityFieldDefinition {
  const field = fields.find((entry) => entry.key === key)
  if (!field) {
    throw new Error(`Missing store visit activity field definition: ${key}`)
  }
  return field
}

function withFieldGuidance(
  field: StoreVisitActivityFieldDefinition,
  guidance: StoreVisitActivityGuidance
): StoreVisitActivityFieldDefinition {
  return {
    ...field,
    ...guidance,
  }
}

const INTERNAL_THEFT_SECTION_GUIDES: Partial<Record<StoreVisitActivityFieldSection, StoreVisitActivityGuideCard>> = {
  what_checked: {
    title: 'Opening Interview Script',
    intro: 'Use this flow while opening the meeting and putting the allegation.',
    prompts: [
      '"This meeting is to discuss concerns about [loss / transaction / stock issue] linked to [dates / shifts]."',
      '"For the record, confirm who is present, the subject\'s role, and whether any representative or witness is attending."',
      '"I am going to put the information we have to you and ask for your explanation of the cash, stock, access, and evidence in scope."',
    ],
  },
  findings: {
    title: 'Account And Challenge Script',
    intro: `Use this section to capture the subject's account and compare it against the evidence. ${INTERNAL_THEFT_FACTUAL_NOTE}`,
    prompts: [
      '"Talk me through what happened from your point of view, step by step."',
      '"Help me understand any difference between your account and the CCTV, till, banking, or stock evidence."',
      '"Is there anyone else involved, or any process weakness that explains what we are seeing?"',
    ],
  },
  actions: {
    title: 'Close And Escalation Script',
    intro: 'Use this before ending the interview so the report clearly records the next steps.',
    prompts: [
      '"What needs securing immediately before anyone leaves: cash, stock, keys, logins, CCTV, paperwork, or statements?"',
      '"Who else needs to be updated or interviewed after this meeting?"',
      '"The immediate next steps after this interview are..."',
    ],
  },
}

const INTERNAL_THEFT_COUNTED_ITEMS_GUIDE: StoreVisitActivityGuideCard = {
  title: 'Stock Line Challenge Prompts',
  intro: 'Use each fragrance row to test the subject\'s explanation against the stock position.',
  prompts: [
    '"Talk me through this fragrance line. What should be on hand and when was it last counted?"',
    '"Who handled, moved, sold, adjusted, damaged, tested, or accessed this stock?"',
    '"How do you explain any missing or extra units on this line?"',
  ],
}

const INTERNAL_THEFT_AMOUNT_CHECKS_GUIDE: StoreVisitActivityGuideCard = {
  title: 'Cash Discrepancy Prompts',
  intro: 'Use each cash row to challenge shortages, overages, and paperwork gaps.',
  prompts: [
    '"Talk me through this till, banking bag, safe amount, or cash item from start to finish."',
    '"Who counted it, who verified it, and who had access before the discrepancy was found?"',
    '"How do you explain any shortage, overage, refund pattern, void, or paperwork mismatch here?"',
  ],
}

const INTERNAL_THEFT_CCTV_SECTION_GUIDES: Partial<Record<StoreVisitActivityFieldSection, StoreVisitActivityGuideCard>> = {
  what_checked: {
    title: 'CCTV Case Script',
    intro: 'Use this flow when the internal theft has already been evidenced on CCTV and the report needs to document the case clearly.',
    prompts: [
      '"State the case reference, who reviewed the footage, and the dates, times, and clips in scope."',
      '"Describe exactly what CCTV shows: approach, access, concealment, stock or cash handling, and exit."',
      '"Record how the subject was identified and what supporting records were checked alongside the footage."',
    ],
  },
  findings: {
    title: 'Confirmed Findings Script',
    intro: `Use this section to document what the footage proves and what the business impact is. ${INTERNAL_THEFT_FACTUAL_NOTE}`,
    prompts: [
      '"What does the CCTV clearly confirm, and what part of the allegation is now evidenced?"',
      '"What stock, cash, or process loss is linked to the footage?"',
      '"What weakness in controls, supervision, keys, till access, or stock handling enabled this?"',
    ],
  },
  actions: {
    title: 'Outcome And Handover Script',
    intro: 'Use this before closing the report so the evidence chain and next actions are explicit.',
    prompts: [
      '"What footage, exports, logs, statements, or paperwork have been preserved, and who now holds them?"',
      '"What suspension, disciplinary, recovery, police, or follow-up interview action has been agreed?"',
      '"Who owns the next step, and by when?"',
    ],
  },
}

const INTERNAL_THEFT_CCTV_COUNTED_ITEMS_GUIDE: StoreVisitActivityGuideCard = {
  title: 'CCTV Stock Evidence Prompts',
  intro: 'Use each fragrance row for stock lines that appear on CCTV or were confirmed missing during the case review.',
  prompts: [
    '"Which exact fragrance line is seen being handled or removed on CCTV?"',
    '"What should the stock position have been, and what did the physical or system check confirm?"',
    '"Does this row support the footage, the loss value, or the recovery position?"',
  ],
}

const INTERNAL_THEFT_CCTV_AMOUNT_CHECKS_GUIDE: StoreVisitActivityGuideCard = {
  title: 'CCTV Cash Evidence Prompts',
  intro: 'Use each cash row for tills, safe counts, banking bags, refunds, or void activity linked to the footage.',
  prompts: [
    '"Which till, banking bag, safe count, refund, or void activity is tied to the CCTV evidence?"',
    '"What does the footage show compared with the recorded cash position?"',
    '"What shortage, overage, or unexplained movement does this row prove?"',
  ],
}

const STAFF_THEFT_INTERVIEW_PLAN_SECTION_GUIDES: Partial<
  Record<StoreVisitActivityFieldSection, StoreVisitActivityGuideCard>
> = {
  what_checked: {
    title: 'Interview Opening Script',
    intro:
      'Use this while opening a Loss Prevention interview with a TFS staff member about suspected theft, setting the tone, and introducing the allegation and evidence.',
    prompts: [
      '"Confirm full name, job title, and length of service, then introduce yourself as the Loss Prevention interviewer."',
      '"Explain the meeting is part of a fair and objective internal theft investigation and outline how LP investigations can arise."',
      '"Cover the colleague\'s role and policy awareness, then put the allegation in neutral terms and present the evidence available."',
    ],
  },
  findings: {
    title: 'Challenge And Wider Enquiry Script',
    intro: `Use this section to capture the direct answers given, the explanation of the evidence, and whether the theft concern is isolated or wider. ${INTERNAL_THEFT_FACTUAL_NOTE}`,
    prompts: [
      '"Ask the colleague to explain what they see on the evidence and then ask directly whether any item was removed without payment."',
      '"Ask what was taken and record the answer accurately in their own words."',
      '"Explore whether this was the first occurrence or whether there are any other incidents to disclose, without leading the answer."',
    ],
  },
  actions: {
    title: 'Closing And Escalation Script',
    intro:
      'Use this before ending the meeting so the close, evidence review, escalation, and pending outcome are documented clearly.',
    prompts: [
      '"Summarise the key points back to the colleague and offer the chance to add anything further."',
      '"Explain the next steps and the internal review process after the interview."',
      '"Record the post-interview evidence review, escalation to the appropriate Regional Director and stakeholders, and pending outcome stage."',
    ],
  },
}

export const STORE_VISIT_ACTIVITY_OPTIONS = [
  {
    key: 'checked_banking',
    label: 'Checked banking',
    description: 'Verified banking paperwork, cash handling, or deposit controls.',
    detailPlaceholder: 'Summarise the banking checks completed, paperwork reviewed, and any discrepancies found.',
    formVariant: 'cash-check',
    evidenceLabel: 'Banking document',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'bankingReference',
        label: 'Banking reference',
        placeholder: 'Deposit number, bag reference, banking slip...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'reviewCompletedWith',
        label: 'Reviewed with',
        placeholder: 'Manager, keyholder, cash office colleague...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'bankingItemsChecked',
        label: 'Banking items checked',
        placeholder: 'List the bags, envelopes, safe contents, or deposits reviewed.',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'paperworkReviewed',
        label: 'Paperwork reviewed',
        placeholder: 'Banking sheet, handover log, pay-in slips, safe records...',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'discrepancyType',
        label: 'Discrepancy / irregularity found',
        placeholder: 'Missing slip, short banking, bag mismatch, late banking, paperwork gap...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'discrepancyAction',
        label: 'Discrepancy notes / action taken',
        placeholder: 'Record any shortfall, overage, missing paperwork, or action taken on site.',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['bankingItemsChecked', 'discrepancyType', 'bankingReference'],
    legacyFieldMap: {
      summary: 'bankingItemsChecked',
      findings: 'paperworkReviewed',
      actionsTaken: 'discrepancyAction',
      nextSteps: 'discrepancyAction',
      reference: 'bankingReference',
    },
  },
  {
    key: 'completed_till_checks',
    label: 'Till checks',
    description: 'Checked tills, till balances, or cash handling controls.',
    detailPlaceholder: 'Record which tills were checked, any variances found, and what was actioned on site.',
    formVariant: 'cash-check',
    evidenceLabel: 'Till document',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'tillsChecked',
        label: 'Tills checked',
        placeholder: 'List the tills, floats, or terminals reviewed.',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'reviewCompletedWith',
        label: 'Reviewed with',
        placeholder: 'Manager, supervisor, cash office colleague...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'cashControlsReviewed',
        label: 'Cash controls reviewed',
        placeholder: 'Describe the till processes or controls checked during the visit.',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'spotCheckWindow',
        label: 'Period / shift checked',
        placeholder: 'Opening, mid-day, close, shift handover, float set-up...',
        input: 'text',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'variancePattern',
        label: 'Variance pattern / concern',
        placeholder: 'Repeat till mismatch, poor paperwork, training issue, refund risk, keying error...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'varianceAction',
        label: 'Variance / action taken',
        placeholder: 'Record mismatches found and what was done on site.',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['tillsChecked', 'varianceAction'],
    legacyFieldMap: {
      summary: 'tillsChecked',
      findings: 'cashControlsReviewed',
      actionsTaken: 'varianceAction',
      nextSteps: 'varianceAction',
    },
  },
  {
    key: 'completed_line_checks',
    label: 'Line checks',
    description: 'Reviewed line checks, spot checks, or customer-facing controls.',
    detailPlaceholder: 'Capture which line checks were reviewed and any compliance gaps or coaching given.',
    formVariant: 'line-check',
    evidenceLabel: 'Line-check evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'linesChecked',
        label: 'Lines / ranges checked',
        placeholder: 'Which brands, bays, cabinets, drawers, or high-risk ranges were checked?',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'areasChecked',
        label: 'Areas checked',
        placeholder: 'Sales floor, stockroom, till point, fragrance wall, promo table...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'countMethod',
        label: 'Count method / stock source used',
        placeholder: 'Stock system, report, blind count, re-count, manual spot check...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'highRiskProductsChecked',
        label: 'High-risk products checked',
        placeholder: 'List the key fragrances or stock lines prioritised during the check.',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      ...COMMON_ACTIVITY_ACTION_FIELDS,
    ],
    detailFieldKeys: ['linesChecked', 'areasChecked', 'highRiskProductsChecked'],
  },
  {
    key: 'internal_theft_interview',
    label: 'Internal theft interview',
    description:
      'Specialist interview template for suspected employee cash or stock theft, including evidence prompts, cash discrepancies, and fragrance line checks.',
    detailPlaceholder:
      'Capture who was interviewed, the allegation explored, the evidence discussed, and what was admitted, denied, or contradicted.',
    formVariant: 'internal-theft',
    evidenceLabel: 'Interview evidence',
    specialist: true,
    sectionGuides: INTERNAL_THEFT_SECTION_GUIDES,
    countedItemsGuide: INTERNAL_THEFT_COUNTED_ITEMS_GUIDE,
    amountChecksGuide: INTERNAL_THEFT_AMOUNT_CHECKS_GUIDE,
    fields: [
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'lpObjective'), {
        scriptLines: [
          '"This meeting is to discuss concerns about..."',
          '"The trigger for this interview is..."',
        ],
        captureHint: 'Record the exact concern, trigger, and LP objective put to the subject.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'peoplePresent'), {
        scriptLines: [
          '"For the record, confirm everyone present in the room and their role."',
        ],
        captureHint: 'List the interviewer, note taker, witness, representative, manager, and any other attendee.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'recordsReviewed'), {
        scriptLines: [
          '"The evidence reviewed for this interview includes..."',
        ],
        captureHint: 'Record the CCTV, till data, banking paperwork, stock counts, statements, or reports relied on.',
      }),
      {
        key: 'caseReference',
        label: 'Case / HR reference',
        placeholder: 'Investigation, HR, ER, incident, or case reference linked to the interview.',
        input: 'text',
        section: 'what_checked',
        scriptLines: ['"For the record, this interview relates to case / HR reference..."'],
        captureHint: 'Enter the investigation, HR, ER, incident, or case reference used during the meeting.',
      },
      {
        key: 'interviewSubject',
        label: 'Interview subject / role',
        placeholder: 'Who was interviewed, what is their role, and what access or responsibility do they hold?',
        input: 'text',
        section: 'what_checked',
        scriptLines: [
          '"Please confirm your full name, role, and normal responsibilities / access in store."',
        ],
        captureHint: 'Record the subject, their role, and any relevant access, till use, keyholding, or stock responsibility.',
      },
      {
        key: 'allegationSummary',
        label: 'Allegation / reason for interview',
        placeholder: 'What suspected internal theft, cash loss, stock loss, refund abuse, void abuse, or dishonesty issue was put to them?',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"The concern being put to you is..."',
        ],
        captureHint: 'Write the allegation clearly enough that another manager can see exactly what was put to the subject.',
      },
      {
        key: 'datesOrShiftsInScope',
        label: 'Dates / shifts / transactions in scope',
        placeholder: 'Which dates, shifts, deposits, tills, stock counts, deliveries, or transactions were discussed?',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"We are discussing the following dates, shifts, transactions, tills, counts, or deposits..."',
        ],
        captureHint: 'List the exact dates, shifts, transaction references, till IDs, or count windows covered in the interview.',
      },
      {
        key: 'interviewSetting',
        label: 'Interview setting / people present',
        placeholder: 'Where was the interview held, who was present, and was any representative or witness involved?',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"Confirm where this interview is taking place and whether anyone is accompanying or witnessing it."',
        ],
        captureHint: 'Record the room/location, attendees, and whether a representative, witness, or note taker was present.',
      },
      {
        key: 'cashQuestionsAsked',
        label: 'Cash handling questions asked',
        placeholder: 'Ask about till access, safe keys, banking, refunds, voids, handovers, shortages, overages, and any explanation for discrepancies.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"Talk me through your normal till, safe, refund, void, and banking responsibilities."',
          '"Who else had access, who verified the cash, and what happened on the shift in question?"',
          '"How do you explain any shortage, overage, missing bag, refund pattern, or paperwork gap?"',
        ],
        captureHint: 'Record the actual cash-handling questions you asked so the report shows how the subject was challenged.',
      },
      {
        key: 'stockQuestionsAsked',
        label: 'Stock handling / line check questions asked',
        placeholder: 'Ask about fragrance handling, deliveries, counts, adjustments, testers, damaged stock, stockroom access, and missing lines identified on line checks.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"Talk me through your handling of deliveries, counts, adjustments, damages, testers, and stockroom access."',
          '"Who last handled the missing lines, and how would you explain any stock difference?"',
        ],
        captureHint: 'Record the stock, line-check, and handling questions you put to the subject.',
      },
      {
        key: 'accessOrOpportunityExplored',
        label: 'Access / opportunity explored',
        placeholder: 'What keys, logins, till IDs, stockroom access, or unattended process gaps could have given the subject opportunity?',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"What keys, codes, logins, till IDs, stockroom areas, or process gaps could you access?"',
          '"When were you able to act without challenge or supervision?"',
        ],
        captureHint: 'Capture the access points, opportunity windows, and process gaps discussed.',
      },
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_FINDINGS_FIELDS, 'lossValueImpact'), {
        scriptLines: [
          '"What is the confirmed or suspected value at risk from the evidence reviewed?"',
        ],
        captureHint: 'Record the cash value, stock value, units missing, or exposure discussed during the interview.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_FINDINGS_FIELDS, 'rootCauseOrWeakness'), {
        scriptLines: [
          '"Which control failure, process gap, or supervision weakness appears to have enabled this?"',
        ],
        captureHint: 'Summarise the weakness that seems to have allowed the issue to happen or continue.',
      }),
      {
        key: 'interviewAccountSummary',
        label: 'Subject account / explanation',
        placeholder: 'Summarise the account given in interview and any explanation offered for the loss, variance, or suspicious activity.',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"In your own words, talk me through what happened from your point of view."',
        ],
        captureHint: 'Write the subject\'s account in a fair, chronological summary, using their wording where it matters.',
      },
      {
        key: 'admissionOrInconsistency',
        label: 'Admission, denial, or inconsistency',
        placeholder: 'What was admitted, denied, changed, contradicted, or left unexplained during the interview?',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"Is there anything you admit, dispute, need to correct, or cannot explain?"',
        ],
        captureHint: 'Record the key admission, denial, inconsistency, change of account, or unanswered point.',
      },
      {
        key: 'evidenceMatchOrConflict',
        label: 'Evidence corroborated / contradicted',
        placeholder: 'Which CCTV, till records, cash paperwork, stock counts, line checks, or witness evidence supported or conflicted with the account?',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"Which parts of the CCTV, till, banking, or stock evidence do you accept, and which do you dispute?"',
        ],
        captureHint: 'Link the subject\'s account to the evidence that supported it or contradicted it.',
      },
      {
        key: 'otherPersonsNamed',
        label: 'Other people named / implicated',
        placeholder: 'Did the subject identify any other staff, managers, witnesses, or process owners relevant to the theft or control failure?',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"Is anyone else involved, aware, responsible for the process, or able to explain part of this issue?"',
        ],
        captureHint: 'List any other people named, their role, and why they are relevant.',
      },
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_ACTION_FIELDS, 'immediateContainment'), {
        scriptLines: [
          '"What needs securing immediately before anyone leaves: cash, stock, keys, logins, CCTV, paperwork, or statements?"',
        ],
        captureHint: 'Record exactly what was secured, suspended, removed, or controlled immediately after the interview.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_ACTION_FIELDS, 'escalatedTo'), {
        scriptLines: [
          '"Who is being updated immediately after this interview?"',
        ],
        captureHint: 'Name the manager, HR, ER, investigations, finance, or police contact told about the outcome.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_ACTION_FIELDS, 'followUpOwnerDeadline'), {
        scriptLines: [
          '"Who owns the next step, and by what date or time?"',
        ],
        captureHint: 'Record the owner and deadline for the next action so follow-up is accountable.',
      }),
      {
        key: 'evidencePreserved',
        label: 'Evidence preserved / requested',
        placeholder: 'What CCTV, till logs, banking sheets, line-check outputs, stock reports, statements, or device records were secured or requested?',
        input: 'textarea',
        section: 'actions',
        scriptLines: [
          '"What evidence has been secured already, and what still needs pulling or preserving?"',
        ],
        captureHint: 'List the exact evidence preserved, requested, or handed over after the meeting.',
      },
      {
        key: 'disciplinaryOrPoliceEscalation',
        label: 'Disciplinary / HR / police escalation',
        placeholder: 'Record any HR, ER, management, investigations, or police escalation agreed after the interview.',
        input: 'textarea',
        section: 'actions',
        scriptLines: [
          '"Does this now require HR, ER, disciplinary, investigations, or police referral, and who makes that decision?"',
        ],
        captureHint: 'Record the escalation path agreed after the interview and who was tasked to take it forward.',
      },
      {
        key: 'recoveryOrFurtherChecks',
        label: 'Recovery / further checks required',
        placeholder: 'What further cash reconciliation, stock recount, fragrance line checks, statement taking, suspension, recovery, or follow-up interview is required?',
        input: 'textarea',
        section: 'actions',
        scriptLines: [
          '"What further reconciliations, recounts, statements, recovery steps, or follow-up interviews are still required?"',
        ],
        captureHint: 'List the remaining checks, recovery work, and follow-up actions that still need to happen.',
      },
    ],
    detailFieldKeys: ['interviewSubject', 'allegationSummary', 'interviewAccountSummary'],
    legacyFieldMap: {
      summary: 'allegationSummary',
      findings: 'interviewAccountSummary',
      actionsTaken: 'recoveryOrFurtherChecks',
      nextSteps: 'recoveryOrFurtherChecks',
      peopleInvolved: 'interviewSubject',
      reference: 'caseReference',
    },
  },
  {
    key: 'internal_theft_cctv_confirmed',
    label: 'Internal theft confirmed on CCTV',
    description:
      'Specialist CCTV-confirmed internal theft template for cases already evidenced on footage, with linked stock and cash checks.',
    detailPlaceholder:
      'Capture what CCTV confirmed, who was identified, the stock or cash loss evidenced, and the case outcome or escalation.',
    formVariant: 'internal-theft',
    evidenceLabel: 'CCTV case evidence',
    specialist: true,
    sectionGuides: INTERNAL_THEFT_CCTV_SECTION_GUIDES,
    countedItemsGuide: INTERNAL_THEFT_CCTV_COUNTED_ITEMS_GUIDE,
    amountChecksGuide: INTERNAL_THEFT_CCTV_AMOUNT_CHECKS_GUIDE,
    fields: [
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'lpObjective'), {
        scriptLines: [
          '"This report records an internal theft case already confirmed on CCTV."',
          '"The objective of this report is to document the evidenced theft, loss value, and agreed case outcome."',
        ],
        captureHint: 'Record the case purpose, the confirmed theft issue, and why this CCTV-backed report is being completed.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'peoplePresent'), {
        scriptLines: [
          '"Record who reviewed, agreed, or received this CCTV case summary."',
        ],
        captureHint: 'List the LP reviewer, manager, HR/ER contact, investigator, or witness linked to the case review.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'recordsReviewed'), {
        scriptLines: [
          '"List the CCTV footage and the supporting records checked alongside it."',
        ],
        captureHint: 'Record the clips, till logs, banking paperwork, stock counts, statements, rota data, or reports reviewed.',
      }),
      {
        key: 'caseReference',
        label: 'Case / HR / incident reference',
        placeholder: 'Investigation, HR, ER, incident, or case reference linked to the CCTV-confirmed theft.',
        input: 'text',
        section: 'what_checked',
        scriptLines: ['"For the record, this CCTV-confirmed case relates to reference..."'],
        captureHint: 'Enter the main investigation, HR, ER, or incident reference for the case.',
      },
      {
        key: 'subjectIdentified',
        label: 'Subject identified / role',
        placeholder: 'Who is identified on CCTV, what is their role, and what access or responsibility did they hold?',
        input: 'text',
        section: 'what_checked',
        scriptLines: [
          '"Identify the subject shown on CCTV and confirm their role, access, and store responsibility."',
        ],
        captureHint: 'Record the subject name, role, and relevant access such as till use, keyholding, stockroom access, or banking duty.',
      },
      {
        key: 'datesOrClipsInScope',
        label: 'Dates / times / CCTV clips in scope',
        placeholder: 'Which dates, times, cameras, clip references, shifts, tills, deposits, or stock checks are covered?',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"Record the exact dates, times, cameras, shifts, or clip references that evidence the theft."',
        ],
        captureHint: 'List the dates, times, cameras, clip IDs, tills, deposits, or stock checks tied to this case.',
      },
      {
        key: 'cctvSummary',
        label: 'CCTV summary / what is seen',
        placeholder: 'Describe exactly what the CCTV shows, including movements, concealment, till activity, handling of stock or cash, and exit behaviour.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"Describe, step by step, what the CCTV shows from approach to exit."',
        ],
        captureHint: 'Write a clear chronological summary of the footage so the theft behaviour is obvious without replaying it.',
      },
      {
        key: 'theftMethodObserved',
        label: 'Theft method / behaviour observed',
        placeholder: 'Pocketing stock, concealing product, manipulating tills, false refund, void abuse, banking removal, key misuse...',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"What method of theft or dishonest behaviour is visible on the footage?"',
        ],
        captureHint: 'Record the specific dishonest act or method evidenced on CCTV.',
      },
      {
        key: 'stockOrCashAffected',
        label: 'Stock / cash / process affected',
        placeholder: 'Which fragrance lines, cash items, tills, refunds, voids, banking steps, or stock processes were affected?',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"What stock, cash, till, refund, void, or banking process is affected by the CCTV evidence?"',
        ],
        captureHint: 'Record the affected product lines, tills, cash movements, or process stages linked to the case.',
      },
      {
        key: 'accessOrOpportunityConfirmed',
        label: 'Access / opportunity confirmed',
        placeholder: 'What access, keys, logins, till IDs, stockroom opportunity, or supervision gaps are confirmed by the CCTV timeline?',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"What access, keys, logins, tills, or unattended opportunity is confirmed by the CCTV sequence?"',
        ],
        captureHint: 'Capture the opportunity window and access that the footage confirms the subject had.',
      },
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_FINDINGS_FIELDS, 'lossValueImpact'), {
        scriptLines: [
          '"What is the confirmed stock or cash loss value evidenced by this case?"',
        ],
        captureHint: 'Record the confirmed or suspected value, units missing, cash shortage, or exposure evidenced by the footage.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_FINDINGS_FIELDS, 'rootCauseOrWeakness'), {
        scriptLines: [
          '"What control, process, or supervision weakness allowed the CCTV-confirmed theft to happen?"',
        ],
        captureHint: 'Summarise the key weakness that enabled the offence or delayed detection.',
      }),
      {
        key: 'supportingEvidence',
        label: 'Supporting evidence / corroboration',
        placeholder: 'Which till logs, stock counts, statements, rota evidence, refunds, voids, banking paperwork, or audit data support the CCTV finding?',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"What records or evidence support the CCTV finding and strengthen the case?"',
        ],
        captureHint: 'Record the non-CCTV evidence that corroborates the case.',
      },
      {
        key: 'responseOrStatus',
        label: 'Subject response / case status',
        placeholder: 'Admitted, denied, resigned, suspended, not yet interviewed, disciplinary pending, police referral pending...',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"What is the subject response or current case status following the CCTV finding?"',
        ],
        captureHint: 'Record whether the subject has been spoken to and the current employment or case status.',
      },
      {
        key: 'otherPersonsNamed',
        label: 'Other people named / implicated',
        placeholder: 'Any other staff, witnesses, process owners, or managers relevant to the confirmed CCTV case.',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"Are any other people identified, implicated, or needed for follow-up in this CCTV case?"',
        ],
        captureHint: 'List any other person linked to the case and why they matter.',
      },
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_ACTION_FIELDS, 'immediateContainment'), {
        scriptLines: [
          '"What was secured immediately once the CCTV-confirmed case was established?"',
        ],
        captureHint: 'Record the immediate containment, suspension, access removal, stock security, or till/security action taken.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_ACTION_FIELDS, 'escalatedTo'), {
        scriptLines: [
          '"Who has this CCTV-confirmed case been escalated to?"',
        ],
        captureHint: 'Name the manager, HR, ER, investigator, finance lead, or police contact informed.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_ACTION_FIELDS, 'followUpOwnerDeadline'), {
        scriptLines: [
          '"Who owns the next step, and what is the deadline?"',
        ],
        captureHint: 'Record the owner and timescale for the next action.',
      }),
      {
        key: 'evidencePreserved',
        label: 'Evidence preserved / exported',
        placeholder: 'Which CCTV clips, exports, screenshots, till logs, banking sheets, stock counts, statements, or device records were secured?',
        input: 'textarea',
        section: 'actions',
        scriptLines: [
          '"What footage, exports, records, or statements have been preserved, and where are they stored?"',
        ],
        captureHint: 'Record the evidence chain, what was exported, and who now holds it.',
      },
      {
        key: 'disciplinaryOrPoliceEscalation',
        label: 'Disciplinary / HR / police action',
        placeholder: 'Record suspension, disciplinary action, HR / ER steps, resignation, recovery action, or police involvement agreed for the CCTV-confirmed case.',
        input: 'textarea',
        section: 'actions',
        scriptLines: [
          '"What formal action has been agreed following the confirmed CCTV evidence?"',
        ],
        captureHint: 'Record the disciplinary, HR, ER, recovery, or police action agreed after the finding.',
      },
      {
        key: 'recoveryOrFurtherChecks',
        label: 'Recovery / further checks required',
        placeholder: 'What further stock recount, till reconciliation, recovery, statement taking, footage review, or follow-up action is still required?',
        input: 'textarea',
        section: 'actions',
        scriptLines: [
          '"What recovery work, reconciliations, or follow-up checks still need completing?"',
        ],
        captureHint: 'List the remaining recovery, reconciliation, or follow-up work still open on the case.',
      },
    ],
    detailFieldKeys: ['subjectIdentified', 'cctvSummary', 'theftMethodObserved'],
    legacyFieldMap: {
      summary: 'cctvSummary',
      findings: 'supportingEvidence',
      actionsTaken: 'recoveryOrFurtherChecks',
      nextSteps: 'recoveryOrFurtherChecks',
      peopleInvolved: 'subjectIdentified',
      reference: 'caseReference',
    },
  },
  {
    key: 'staff_theft_interview_plan',
    label: 'Interview plan - staff theft',
    description:
      'Specialist interview-plan template for Loss Prevention officers interviewing TFS staff about suspected theft, with a full script for each interview stage.',
    detailPlaceholder:
      'Capture the theft interview plan, the evidence discussed, and the staff member responses from opening through close.',
    formVariant: 'structured',
    evidenceLabel: 'Interview-plan evidence',
    specialist: true,
    sectionGuides: STAFF_THEFT_INTERVIEW_PLAN_SECTION_GUIDES,
    fields: [
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'lpObjective'), {
        scriptLines: [
          '"This interview is being conducted by Loss Prevention as part of a theft investigation involving a member of TFS staff."',
          '"The purpose today is to put the allegation to you, review the evidence available, and give you a fair opportunity to explain."',
        ],
        captureHint:
          'Record the theft concern, why Loss Prevention is holding the interview, and what the meeting needs to establish.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'peoplePresent'), {
        scriptLines: [
          '"For the record, confirm everyone present for this interview and the role each person holds."',
        ],
        captureHint:
          'List the interviewer, note taker, witness, representative, manager, or any other attendee present during the meeting.',
      }),
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_CONTEXT_FIELDS, 'recordsReviewed'), {
        scriptLines: [
          '"The evidence and records reviewed for this interview include..."',
        ],
        captureHint:
          'Record the CCTV, stock records, till records, witness material, or other documents reviewed before or during the interview.',
      }),
      {
        key: 'caseReference',
        label: 'Case / incident reference',
        placeholder: 'Investigation, HR, ER, or incident reference linked to the theft interview.',
        input: 'text',
        section: 'what_checked',
        scriptLines: ['"For the record, this interview relates to case / incident reference..."'],
        captureHint:
          'Enter the main case, incident, HR, or ER reference attached to the interview plan.',
      },
      {
        key: 'subjectProfile',
        label: 'Employee (subject)',
        placeholder: 'Full name, job title, and length of service.',
        input: 'text',
        section: 'what_checked',
        scriptLines: [
          '"Please confirm your full name, current job title, and length of service with The Fragrance Shop."',
        ],
        captureHint:
          'Record the subject\'s full name, job title, and service length exactly as confirmed at the start of the meeting.',
      },
      {
        key: 'interviewLocation',
        label: 'Interview location',
        placeholder: 'Store, office, or meeting room where the interview took place.',
        input: 'text',
        section: 'what_checked',
        scriptLines: [
          '"For the record, confirm where this interview is taking place and note the exact room or location."',
        ],
        captureHint:
          'Record the interview location and whether it took place in the store office, another room, or another formal setting.',
      },
      {
        key: 'evidenceAvailable',
        label: 'Evidence available',
        placeholder: 'CCTV footage, stock discrepancy, witness account, till data, or other evidence available for the interview.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"The evidence currently available for this interview is..."',
        ],
        captureHint:
          'Record the evidence available at the point the interview started, including the key allegation-supporting material.',
      },
      {
        key: 'introductionFormalities',
        label: '1. Introduction & formalities',
        placeholder: 'Record how full name, job title, service length, interviewer introduction, and internal-investigation context were covered.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"Before we begin, I need to confirm your full name, job title, and length of service."',
          '"My name is [name], my role is [role], and my investigative background is [background]."',
          '"This meeting forms part of an internal investigation and I will keep the questions neutral and factual."',
        ],
        captureHint:
          'Summarise how the introduction and formalities were covered at the start of the meeting.',
      },
      {
        key: 'toneSetting',
        label: '2. Setting the tone',
        placeholder: 'Record how fairness, objectivity, investigation scope, and investigation methods were explained.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"This investigation will be conducted fairly and objectively."',
          '"People can make mistakes for different reasons, and this meeting is to understand what happened."',
          '"Loss Prevention investigates theft of cash, theft of stock, and fraudulent transactions involving the business."',
          '"Those investigations may arise from whistleblowing, CCTV review, stock discrepancies, till data, or other evidence."',
        ],
        captureHint:
          'Record how the fair-process explanation and investigation context were set out to the subject.',
      },
      {
        key: 'generalQuestions',
        label: '3. General questions',
        placeholder: 'Summarise the subject response about their day-to-day role and understanding of company policies.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"Talk me through your normal day-to-day role in the store."',
          '"What is your understanding of the company policies that apply to stock, testers, cash, and unpaid items?"',
        ],
        captureHint:
          'Summarise the subject\'s account of their role and their understanding of the relevant company policies.',
      },
      {
        key: 'policyAwareness',
        label: '4. Policy awareness',
        placeholder: 'Record how the subject described the removal of an unpaid item and whether they accepted it would be theft / misconduct.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"How would the removal of an unpaid item from the store be viewed by the company?"',
          '"Do you understand that removing an unpaid item would amount to theft or misconduct?"',
        ],
        captureHint:
          'Record the subject\'s policy-awareness answer and whether they acknowledged the expected theft / misconduct position.',
      },
      {
        key: 'allegationIntroduction',
        label: '5. Introduction of allegation',
        placeholder: 'Record exactly how the removal-of-stock-without-payment allegation was put in neutral terms.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"The allegation being investigated is the removal of stock or company property from the business without payment."',
          '"At this stage I am putting that allegation to you in general terms and asking for your response."',
        ],
        captureHint:
          'Record exactly how the allegation was introduced, keeping it neutral and non-specific at the outset.',
      },
      {
        key: 'evidencePresentation',
        label: '6. Presentation of evidence',
        placeholder: 'Record how the CCTV was shown and what explanation the subject gave when asked what they could see.',
        input: 'textarea',
        section: 'what_checked',
        scriptLines: [
          '"I am now showing you the evidence relied on in this investigation."',
          '"Please explain, in your own words, what you can see and what was happening at that point."',
        ],
        captureHint:
          'Summarise how the evidence was presented and the subject\'s immediate explanation of what it showed.',
      },
      {
        key: 'directQuestioning',
        label: '7. Direct questioning',
        placeholder: 'Record the answers given when asked directly whether any item was removed without payment and what item was taken.',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"Did you remove any item from the store without paying for it?"',
          '"What item or items were taken?"',
          '"I am recording your answers accurately, so please explain in your own words what happened."',
        ],
        captureHint:
          'Record the direct answers given when the theft allegation was put plainly and the subject was asked to explain.',
      },
      {
        key: 'widerInvestigation',
        label: '8. Wider investigation',
        placeholder: 'Summarise what was said about whether this was the first occurrence and whether any other incidents were disclosed.',
        input: 'textarea',
        section: 'findings',
        scriptLines: [
          '"Was this the first time anything like this has happened?"',
          '"Are there any other incidents involving stock, testers, cash, or unpaid items that you need to disclose?"',
          '"I am not going to lead you; I need you to answer in your own words and I will document your response exactly."',
        ],
        captureHint:
          'Summarise what was said about any previous or wider incidents while keeping the notes factual and non-leading.',
      },
      {
        key: 'closingInterview',
        label: '9. Closing the interview',
        placeholder: 'Record the key summary given, any final comments offered, and how next steps were explained.',
        input: 'textarea',
        section: 'actions',
        scriptLines: [
          '"To summarise, the key points from this interview are..."',
          '"Is there anything further you want to add before we close the meeting?"',
          '"The next step is for the evidence and your account to be reviewed through the internal process."',
        ],
        captureHint:
          'Record how the meeting was summarised, whether the subject added anything further, and what next-step explanation was given.',
      },
      {
        key: 'postInterviewActions',
        label: '10. Post-interview actions',
        placeholder: 'Record the evidence review, Steve Brant escalation, and the pending outcome position.',
        input: 'textarea',
        section: 'actions',
        scriptLines: [
          '"Following this interview, the evidence will be reviewed again in full."',
          '"The case will be escalated to the appropriate Regional Director and any other relevant stakeholders for review."',
          '"After that review, the business will await the outcome of the internal process."',
        ],
        captureHint:
          'Record the post-interview action plan exactly, including the evidence review, escalation route, and pending outcome stage.',
      },
      withFieldGuidance(getActivityFieldDefinition(COMMON_ACTIVITY_ACTION_FIELDS, 'escalatedTo'), {
        scriptLines: [
          '"This case is being escalated to the appropriate Regional Director and any other agreed stakeholders."',
        ],
        captureHint:
          'Record the Regional Director, HR/ER lead, and any other stakeholder updated immediately after the interview.',
      }),
    ],
    detailFieldKeys: ['subjectProfile', 'directQuestioning'],
    legacyFieldMap: {
      summary: 'evidencePresentation',
      findings: 'directQuestioning',
      actionsTaken: 'postInterviewActions',
      nextSteps: 'postInterviewActions',
      peopleInvolved: 'subjectProfile',
      reference: 'caseReference',
    },
  },
  {
    key: 'supported_investigation',
    label: 'Investigation work',
    description: 'Supported or progressed a theft, fraud, or conduct investigation.',
    detailPlaceholder: 'Add the investigation context, evidence reviewed, and next actions agreed.',
    formVariant: 'structured',
    evidenceLabel: 'Investigation evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'caseReference',
        label: 'Case reference',
        placeholder: 'Incident, case, or investigation reference...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'investigationFocus',
        label: 'Investigation focus',
        placeholder: 'What allegation, loss event, or concern was investigated?',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'subjectsInvolved',
        label: 'Subjects / people involved',
        placeholder: 'Offender, employee, witness, contractor, customer...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'evidenceReviewed',
        label: 'Evidence reviewed',
        placeholder: 'CCTV, till records, statements, refunds, stock movements...',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'keyLPConcern',
        label: 'Key LP concern identified',
        placeholder: 'Fraud indicator, repeat theft method, process bypass, collusion concern...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'workCompleted',
        label: 'Work completed on site',
        placeholder: 'Explain what the LP officer did during the visit.',
        input: 'textarea',
        section: 'actions',
      },
      {
        key: 'outcomeOrEscalation',
        label: 'Outcome / escalation',
        placeholder: 'Record the current outcome or who it was escalated to.',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['investigationFocus', 'workCompleted', 'caseReference'],
    legacyFieldMap: {
      summary: 'investigationFocus',
      findings: 'evidenceReviewed',
      actionsTaken: 'workCompleted',
      nextSteps: 'outcomeOrEscalation',
      peopleInvolved: 'subjectsInvolved',
      reference: 'caseReference',
    },
  },
  {
    key: 'reviewed_cctv_or_alarm',
    label: 'CCTV / alarm review',
    description: 'Checked CCTV coverage, alarm usage, or security equipment.',
    detailPlaceholder: 'Note what was tested or reviewed and any system issues or training points.',
    formVariant: 'structured',
    evidenceLabel: 'CCTV / alarm evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'systemsChecked',
        label: 'Systems checked',
        placeholder: 'Which cameras, alarm points, DVRs, or panic systems were reviewed?',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'areasReviewed',
        label: 'Areas reviewed',
        placeholder: 'Sales floor, till area, stockroom, entrance, fire exit...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'functionTestCompleted',
        label: 'Function / playback test completed',
        placeholder: 'Playback checked, panic alarm tested, date/time reviewed, engineer status confirmed...',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'faultsFound',
        label: 'Faults / blind spots found',
        placeholder: 'Record any dead cameras, blind spots, alarm faults, or usage issues.',
        input: 'textarea',
        section: 'findings',
      },
      {
        key: 'evidenceQuality',
        label: 'Evidence quality concern',
        placeholder: 'Facial ID issue, poor angle, poor lighting, export issue, retention concern...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'actionsAgreed',
        label: 'Action agreed',
        placeholder: 'Training given, engineer callout, escalation, or immediate fix.',
        input: 'textarea',
        section: 'actions',
      },
      {
        key: 'calloutOrTicketReference',
        label: 'Callout / ticket reference',
        placeholder: 'Engineer ticket, contractor job number, helpdesk ref...',
        input: 'text',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['systemsChecked', 'faultsFound'],
    legacyFieldMap: {
      summary: 'systemsChecked',
      findings: 'faultsFound',
      actionsTaken: 'actionsAgreed',
      nextSteps: 'actionsAgreed',
    },
  },
  {
    key: 'reviewed_loss_controls',
    label: 'Loss controls review',
    description: 'Reviewed shrink controls, hotspots, and in-store LP standards.',
    detailPlaceholder: 'Describe the control weaknesses, hotspots, and any immediate fixes completed.',
    formVariant: 'structured',
    evidenceLabel: 'Loss-control evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'controlsChecked',
        label: 'Controls checked',
        placeholder: 'Tagging, cabinet locking, tester control, refund control, stockroom security...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'hotspotsReviewed',
        label: 'Hotspots reviewed',
        placeholder: 'Which theft hotspots or risk areas were checked?',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'highRiskProductsReviewed',
        label: 'High-risk products / areas reviewed',
        placeholder: 'Which high-risk SKUs, fixtures, or stock locations were prioritised?',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'weaknessesFound',
        label: 'Weaknesses found',
        placeholder: 'Record the control gaps or standards missed.',
        input: 'textarea',
        section: 'findings',
      },
      {
        key: 'deterrenceGap',
        label: 'Deterrence / visibility gap',
        placeholder: 'Poor greeting, weak guarding, exposed stock, blind spot, lack of signage...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'correctiveAction',
        label: 'Corrective action agreed',
        placeholder: 'What was fixed on site or agreed with the team?',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['controlsChecked', 'weaknessesFound'],
    legacyFieldMap: {
      summary: 'controlsChecked',
      findings: 'weaknessesFound',
      actionsTaken: 'correctiveAction',
      nextSteps: 'correctiveAction',
    },
  },
  {
    key: 'conducted_opening_checks',
    label: 'Opening checks',
    description: 'Completed an opening / open-up security review before trading began.',
    detailPlaceholder: 'Record who opened, what was checked before trade, and any exposure identified at open.',
    formVariant: 'structured',
    evidenceLabel: 'Opening-check evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'teamPresentAtOpen',
        label: 'Team present / opening responsibility',
        placeholder: 'Manager, keyholder, security, or colleague opening the store...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'openingChecksCompleted',
        label: 'Opening checks completed',
        placeholder: 'Shutters, doors, alarm unset, fire exits, stockroom, sales floor, safe, and trading-readiness checks...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'alarmAndAccessStatus',
        label: 'Alarm / access / entry status',
        placeholder: 'Alarm unset correctly, no forced entry, locks secure, shutters intact, access points checked...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'safeAndHighRiskStockStatus',
        label: 'Safe / high-risk stock status',
        placeholder: 'Safe condition, cabinets intact, tagged stock present, tester/live stock control, fragrance wall ready...',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'issuesAtOpen',
        label: 'Issues found at opening',
        placeholder: 'Record any alarm issue, stock exposure, key-control gap, readiness failure, or opening concern.',
        input: 'textarea',
        section: 'findings',
      },
      {
        key: 'signsOfEntryOrExposure',
        label: 'Signs of entry / exposure',
        placeholder: 'Forced entry, damaged shutter, insecure door, missing key, exposed stock, safe concern, blind spot...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'actionsBeforeTrading',
        label: 'Actions before trading',
        placeholder: 'What was secured, escalated, or corrected before the store opened to customers?',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['openingChecksCompleted', 'issuesAtOpen'],
    legacyFieldMap: {
      summary: 'openingChecksCompleted',
      findings: 'issuesAtOpen',
      actionsTaken: 'actionsBeforeTrading',
      nextSteps: 'actionsBeforeTrading',
      peopleInvolved: 'teamPresentAtOpen',
    },
  },
  {
    key: 'conducted_stop_on_close',
    label: 'Stop on close',
    description: 'Completed an end-of-day stop-on-close review with the store team.',
    detailPlaceholder: 'Record who was present, what was checked at close, and any concerns identified.',
    formVariant: 'structured',
    evidenceLabel: 'Stop-on-close evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'teamPresent',
        label: 'Team present',
        placeholder: 'Manager, keyholder, staff members, guard...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'closingChecksCompleted',
        label: 'Closing checks completed',
        placeholder: 'Cash secure, doors checked, stockroom clear, alarm set, keys controlled...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'cashAndKeysVerified',
        label: 'Cash / keys / alarm verification',
        placeholder: 'Who held keys, how cash was secured, alarm set confirmation, locking checks...',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'issuesAtClose',
        label: 'Issues found at close',
        placeholder: 'Record any missed steps, unsecured stock, or process breaches.',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'actionsBeforeLeaving',
        label: 'Actions before leaving',
        placeholder: 'What was corrected or agreed before the store closed?',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['closingChecksCompleted', 'issuesAtClose'],
    legacyFieldMap: {
      summary: 'closingChecksCompleted',
      findings: 'issuesAtClose',
      actionsTaken: 'actionsBeforeLeaving',
      peopleInvolved: 'teamPresent',
    },
  },
  {
    key: 'took_statements_or_interviews',
    label: 'Statements / interviews',
    description: 'Took statements, interviews, or witness accounts as part of follow-up work.',
    detailPlaceholder: 'Summarise who was spoken to, what evidence was captured, and any follow-up needed.',
    formVariant: 'structured',
    evidenceLabel: 'Statement evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'caseReference',
        label: 'Case reference',
        placeholder: 'Incident, statement, or HR reference...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'peopleSpokenTo',
        label: 'People spoken to',
        placeholder: 'Who provided a statement or interview on site?',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'statementPurpose',
        label: 'Statement purpose',
        placeholder: 'What was the statement or interview for?',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'recordsCaptured',
        label: 'Records / evidence captured',
        placeholder: 'Signed statement, audio note, witness notes, CCTV clip, HR notes...',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'keyPointsCaptured',
        label: 'Key points captured',
        placeholder: 'Summarise the main account or evidence captured.',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'followUpRequired',
        label: 'Follow-up required',
        placeholder: 'Any next interviews, witness requests, or paperwork still needed.',
        input: 'textarea',
        section: 'actions',
      },
      {
        key: 'evidenceStored',
        label: 'Evidence stored / handed to',
        placeholder: 'Who received the statement or where the evidence was stored.',
        input: 'text',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['peopleSpokenTo', 'statementPurpose', 'caseReference'],
    legacyFieldMap: {
      summary: 'statementPurpose',
      findings: 'keyPointsCaptured',
      actionsTaken: 'followUpRequired',
      nextSteps: 'followUpRequired',
      peopleInvolved: 'peopleSpokenTo',
      reference: 'caseReference',
    },
  },
  {
    key: 'reviewed_paperwork_or_processes',
    label: 'Paperwork / process review',
    description: 'Reviewed weekly paperwork, process compliance, or stockroom standards.',
    detailPlaceholder: 'List the paperwork or processes reviewed and any corrective actions agreed.',
    formVariant: 'structured',
    evidenceLabel: 'Process review evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'paperworkChecked',
        label: 'Paperwork / processes checked',
        placeholder: 'Weekly paperwork, refunds, damages, deliveries, stockroom process...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'areasReviewed',
        label: 'Areas reviewed',
        placeholder: 'Back office, till point, stockroom, manager files...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'periodCovered',
        label: 'Period covered',
        placeholder: 'Today, week ending, previous month, last delivery cycle...',
        input: 'text',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'nonComplianceFound',
        label: 'Non-compliance found',
        placeholder: 'Record any missing paperwork or process breaches.',
        input: 'textarea',
        section: 'findings',
      },
      {
        key: 'repeatProcessGap',
        label: 'Repeat process gap',
        placeholder: 'Is this a repeat issue or isolated? Note the control weakness or repeat behaviour.',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'correctionsMade',
        label: 'Corrections made / agreed',
        placeholder: 'What was corrected on site or agreed with the store team?',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['paperworkChecked', 'nonComplianceFound'],
    legacyFieldMap: {
      summary: 'paperworkChecked',
      findings: 'nonComplianceFound',
      actionsTaken: 'correctionsMade',
      nextSteps: 'correctionsMade',
    },
  },
  {
    key: 'reviewed_stock_loss_or_counts',
    label: 'Stock loss / counts',
    description: 'Reviewed stock-loss patterns, adjustments, counts, or shrink concerns.',
    detailPlaceholder: 'Explain the stock-loss issue reviewed, count findings, and what was escalated.',
    formVariant: 'structured',
    evidenceLabel: 'Stock-loss evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'stockAreaReviewed',
        label: 'Stock area / category reviewed',
        placeholder: 'What stock line, area, or category was reviewed?',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'lossIssueReviewed',
        label: 'Loss issue reviewed',
        placeholder: 'Explain the shrink trend, adjustment issue, or count concern.',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'countSourceUsed',
        label: 'Count source / system used',
        placeholder: 'Stock system, count sheet, adjustment report, delivery variance report...',
        input: 'text',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'countFindings',
        label: 'Count findings',
        placeholder: 'Record the main variances or count findings.',
        input: 'textarea',
        section: 'findings',
      },
      {
        key: 'trendOrPattern',
        label: 'Trend / repeat pattern',
        placeholder: 'Repeat SKU loss, ongoing discrepancy, same shift, same delivery pattern...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'actionEscalated',
        label: 'Action / escalation',
        placeholder: 'What was actioned or escalated after the review?',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['lossIssueReviewed', 'countFindings'],
    legacyFieldMap: {
      summary: 'lossIssueReviewed',
      findings: 'countFindings',
      actionsTaken: 'actionEscalated',
      nextSteps: 'actionEscalated',
    },
  },
  {
    key: 'checked_delivery_or_parcel_issue',
    label: 'Delivery / parcel issue',
    description: 'Investigated delivery discrepancies, tampered parcels, or missing stock on receipt.',
    detailPlaceholder: 'Add the delivery issue reviewed, affected stock, and any evidence or follow-up.',
    formVariant: 'structured',
    evidenceLabel: 'Delivery evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'deliveryReference',
        label: 'Delivery reference',
        placeholder: 'Delivery note, carrier reference, parcel ID...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'issueReviewed',
        label: 'Issue reviewed',
        placeholder: 'What was wrong with the delivery or parcel?',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'carrierOrSupplier',
        label: 'Carrier / supplier',
        placeholder: 'Courier, supplier, depot, store transfer source...',
        input: 'text',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'affectedItems',
        label: 'Affected items',
        placeholder: 'List the missing, damaged, or tampered stock.',
        input: 'textarea',
        section: 'findings',
      },
      {
        key: 'sealOrPackagingCondition',
        label: 'Seal / packaging condition',
        placeholder: 'Broken seal, re-taped parcel, damaged packaging, count mismatch, empty carton...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'actionsTaken',
        label: 'Action taken',
        placeholder: 'What was done on site or who was notified?',
        input: 'textarea',
        section: 'actions',
      },
      {
        key: 'claimOrCaseReference',
        label: 'Claim / escalation reference',
        placeholder: 'Claim ID, incident ref, supplier escalation ref...',
        input: 'text',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['issueReviewed', 'affectedItems', 'deliveryReference'],
    legacyFieldMap: {
      summary: 'issueReviewed',
      findings: 'affectedItems',
      actionsTaken: 'actionsTaken',
      nextSteps: 'actionsTaken',
      reference: 'deliveryReference',
    },
  },
  {
    key: 'reviewed_security_procedures',
    label: 'Security procedure review',
    description: 'Reviewed search procedures, guard deployment, key controls, or opening / closing security.',
    detailPlaceholder: 'Capture which procedures were checked, any weaknesses found, and actions agreed.',
    formVariant: 'structured',
    evidenceLabel: 'Security-procedure evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'proceduresChecked',
        label: 'Procedures checked',
        placeholder: 'Search policy, key control, guard deployment, opening / closing...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'areasCovered',
        label: 'Areas / process stages covered',
        placeholder: 'Entrance, till area, stockroom, back door, key safe, opening, closing...',
        input: 'textarea',
        section: 'what_checked',
      },
      {
        key: 'guardOrKeyholderPresent',
        label: 'Guard / keyholder presence',
        placeholder: 'Who was present while the procedure was reviewed?',
        input: 'text',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'weaknessesFound',
        label: 'Weaknesses found',
        placeholder: 'Record any missed steps or security weaknesses found.',
        input: 'textarea',
        section: 'findings',
      },
      {
        key: 'breachOrExposure',
        label: 'Breach / exposure identified',
        placeholder: 'Key control gap, search not completed, open access, poor guarding, uncontrolled entry...',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'actionsAgreed',
        label: 'Action agreed',
        placeholder: 'Training, escalation, or immediate changes agreed with the store.',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['proceduresChecked', 'weaknessesFound'],
    legacyFieldMap: {
      summary: 'proceduresChecked',
      findings: 'weaknessesFound',
      actionsTaken: 'actionsAgreed',
      nextSteps: 'actionsAgreed',
    },
  },
  {
    key: 'provided_store_support_or_training',
    label: 'Store support / training',
    description: 'Coached the team or management on LP controls, standards, or immediate actions.',
    detailPlaceholder: 'Describe the support or training given and who it was delivered to.',
    formVariant: 'structured',
    evidenceLabel: 'Training evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'topicCovered',
        label: 'Topic covered',
        placeholder: 'What control, process, or LP topic was covered?',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'deliveredTo',
        label: 'Delivered to',
        placeholder: 'Manager, keyholder, whole team...',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'trainingReason',
        label: 'Reason for support / training',
        placeholder: 'What concern, incident, audit gap, or request drove the coaching session?',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'observedKnowledgeGap',
        label: 'Observed knowledge / behaviour gap',
        placeholder: 'What did the team not understand or apply consistently before the coaching?',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
      {
        key: 'guidanceGiven',
        label: 'Guidance given',
        placeholder: 'Describe the coaching or support delivered on site.',
        input: 'textarea',
        section: 'actions',
      },
      {
        key: 'followUpNeeded',
        label: 'Follow-up needed',
        placeholder: 'Any return visit, manager action, or further training needed.',
        input: 'textarea',
        section: 'actions',
      },
    ],
    detailFieldKeys: ['topicCovered', 'guidanceGiven'],
    legacyFieldMap: {
      summary: 'guidanceGiven',
      actionsTaken: 'guidanceGiven',
      nextSteps: 'followUpNeeded',
      peopleInvolved: 'deliveredTo',
    },
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Capture any other on-site LP activity not covered above.',
    detailPlaceholder: 'Describe the additional work completed on site.',
    formVariant: 'structured',
    evidenceLabel: 'Supporting evidence',
    fields: [
      ...COMMON_ACTIVITY_CONTEXT_FIELDS,
      {
        key: 'activityType',
        label: 'Activity type',
        placeholder: 'What kind of LP work was completed that is not covered by the standard templates?',
        input: 'text',
        section: 'what_checked',
      },
      {
        key: 'details',
        label: 'Details',
        placeholder: 'Describe the additional work completed on site.',
        input: 'textarea',
        section: 'what_checked',
      },
      ...COMMON_ACTIVITY_FINDINGS_FIELDS,
      {
        key: 'lpRiskObserved',
        label: 'LP risk / issue captured',
        placeholder: 'What loss risk, concern, or operational weakness was captured during this activity?',
        input: 'textarea',
        section: 'findings',
      },
      ...COMMON_ACTIVITY_ACTION_FIELDS,
    ],
    detailFieldKeys: ['activityType', 'details'],
    legacyFieldMap: {
      summary: 'details',
      findings: 'details',
      actionsTaken: 'details',
      nextSteps: 'details',
    },
  },
] as const satisfies readonly StoreVisitActivityOption[]

export type StoreVisitType = (typeof STORE_VISIT_TYPE_OPTIONS)[number]['value']
export type StoreVisitActivityKey = (typeof STORE_VISIT_ACTIVITY_OPTIONS)[number]['key']
export type StoreVisitNeedLevel = 'none' | 'monitor' | 'needed' | 'urgent'
export type StoreVisitActivityDetails = Partial<Record<StoreVisitActivityKey, string>>
export type StoreVisitActivityFormVariant = (typeof STORE_VISIT_ACTIVITY_OPTIONS)[number]['formVariant']

const STORE_VISIT_ACTIVITY_KEYS_WITH_EVIDENCE_CHAIN = new Set<StoreVisitActivityKey>([
  'supported_investigation',
  'reviewed_cctv_or_alarm',
  'took_statements_or_interviews',
  'reviewed_paperwork_or_processes',
  'checked_delivery_or_parcel_issue',
  'reviewed_security_procedures',
  'internal_theft_interview',
  'internal_theft_cctv_confirmed',
  'staff_theft_interview_plan',
])

const STORE_VISIT_ACTIVITY_CORE_WHAT_CHECKED_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  ...ACTIVITY_SCOPE_CORE_FIELDS,
  ...COMMON_ACTIVITY_CONTEXT_FIELDS,
]

const STORE_VISIT_ACTIVITY_CORE_FINDINGS_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  ...ACTIVITY_FINDINGS_CORE_FIELDS,
  ...COMMON_ACTIVITY_FINDINGS_FIELDS,
]

const STORE_VISIT_ACTIVITY_CORE_ACTION_FIELDS: readonly StoreVisitActivityFieldDefinition[] = [
  ...ACTIVITY_ACTION_CORE_FIELDS,
  ...COMMON_ACTIVITY_ACTION_FIELDS.filter((field) => field.key !== 'followUpOwnerDeadline'),
]

const STORE_VISIT_ACTIVITY_CORE_FIELD_KEYS = new Set(
  [
    ...STORE_VISIT_ACTIVITY_CORE_WHAT_CHECKED_FIELDS,
    ...STORE_VISIT_ACTIVITY_CORE_FINDINGS_FIELDS,
    ...STORE_VISIT_ACTIVITY_CORE_ACTION_FIELDS,
  ].map((field) => field.key)
)

const STORE_VISIT_ACTIVITY_EVIDENCE_FIELD_KEYS = new Set(
  ACTIVITY_EVIDENCE_CHAIN_FIELDS.map((field) => field.key)
)

const STORE_VISIT_ACTIVITY_GENERIC_DETAIL_EXCLUDED_KEYS = new Set([
  ...STORE_VISIT_ACTIVITY_CORE_FIELD_KEYS,
  ...STORE_VISIT_ACTIVITY_EVIDENCE_FIELD_KEYS,
  'followUpOwnerDeadline',
])

const LEGACY_ACTIVITY_FIELD_ALIASES: Partial<Record<string, string>> = {
  followUpOwnerDeadline: 'followUpOwner',
}

function dedupeActivityFields(
  fields: readonly StoreVisitActivityFieldDefinition[]
): readonly StoreVisitActivityFieldDefinition[] {
  const seen = new Set<string>()

  return fields.filter((field) => {
    if (seen.has(field.key)) return false
    seen.add(field.key)
    return true
  })
}

function getTemplateSpecificActivityFields(
  option: StoreVisitActivityOption | undefined,
  section: StoreVisitActivityFieldSection
): readonly StoreVisitActivityFieldDefinition[] {
  return (option?.fields || []).filter((field) => {
    if ((field.section || section) !== section) return false
    if (STORE_VISIT_ACTIVITY_CORE_FIELD_KEYS.has(field.key)) return false
    if (STORE_VISIT_ACTIVITY_EVIDENCE_FIELD_KEYS.has(field.key)) return false
    if (field.key === 'followUpOwnerDeadline') return false
    return true
  })
}

function composeActivityFields(
  activityKey: StoreVisitActivityKey,
  option: StoreVisitActivityOption | undefined
): readonly StoreVisitActivityFieldDefinition[] {
  const actionFields = [
    ...STORE_VISIT_ACTIVITY_CORE_ACTION_FIELDS,
    ...(STORE_VISIT_ACTIVITY_KEYS_WITH_EVIDENCE_CHAIN.has(activityKey)
      ? ACTIVITY_EVIDENCE_CHAIN_FIELDS
      : []),
    ...getTemplateSpecificActivityFields(option, 'actions'),
  ]

  return dedupeActivityFields([
    ...STORE_VISIT_ACTIVITY_CORE_WHAT_CHECKED_FIELDS,
    ...getTemplateSpecificActivityFields(option, 'what_checked'),
    ...STORE_VISIT_ACTIVITY_CORE_FINDINGS_FIELDS,
    ...getTemplateSpecificActivityFields(option, 'findings'),
    ...actionFields,
  ])
}

function getStoreVisitActivityFieldOptionLabelFromDefinition(
  field: Pick<StoreVisitActivityFieldDefinition, 'options'>,
  value: string
): string | undefined {
  return field.options?.find((option) => option.value === value)?.label
}

export interface StoreVisitActivityCompletenessIssue {
  activityKey: StoreVisitActivityKey
  missingFields: Array<Pick<StoreVisitActivityFieldDefinition, 'key' | 'label' | 'section'>>
}

export interface StoreVisitCountedItem {
  productId?: string
  productLabel?: string
  variantLabel?: string
  sizeLabel?: string
  unitPrice?: number | null
  systemQuantity?: number | null
  countedQuantity?: number | null
  notes?: string
}

export interface StoreVisitAmountCheck {
  label?: string
  systemAmount?: number | null
  countedAmount?: number | null
  amountMatches?: boolean | null
  notes?: string
}

export interface StoreVisitActivityPayload {
  fields?: Record<string, string>
  amountConfirmed?: boolean | null
  itemsChecked?: StoreVisitCountedItem[]
  amountChecks?: StoreVisitAmountCheck[]
}

export type StoreVisitActivityPayloads = Partial<Record<StoreVisitActivityKey, StoreVisitActivityPayload>>

type StoreVisitActivityFieldGuidanceMap = Partial<Record<string, StoreVisitActivityGuidance>>
type StoreVisitActivitySectionGuideMap = Partial<
  Record<StoreVisitActivityFieldSection, StoreVisitActivityGuideCard>
>

const STORE_VISIT_ACTIVITY_SECTION_GUIDES: Partial<
  Record<StoreVisitActivityKey, StoreVisitActivitySectionGuideMap>
> = {
  checked_banking: {
    what_checked: {
      title: 'Banking Review Script',
      intro: 'Use this when walking through the banking paperwork and physical cash handling.',
      prompts: [
        '"Which banking reference, bag, deposit, or safe amount are we checking?"',
        '"Talk me through the normal banking process, who handled it, and which records support it."',
        '"What bags, slips, logs, or safe contents did we physically compare today?"',
      ],
    },
    findings: {
      title: 'Banking Findings Script',
      intro: 'Use this section to pin down the discrepancy and the control failure behind it.',
      prompts: [
        '"What does the expected banking position show compared with what was found?"',
        '"Is this a shortage, overage, paperwork gap, late banking, or bag mismatch?"',
        '"What control weakness or handover failure allowed the issue to happen?"',
      ],
    },
    actions: {
      title: 'Banking Action Script',
      intro: 'Use this before closing so the cash issue and next ownership are clear.',
      prompts: [
        '"What was secured, recounted, corrected, or contained before leaving site?"',
        '"Who was updated about the banking issue?"',
        '"Who owns the follow-up and by when?"',
      ],
    },
  },
  completed_till_checks: {
    what_checked: {
      title: 'Till Check Script',
      intro: 'Use this while checking tills, floats, and shift controls with the store team.',
      prompts: [
        '"Which tills, floats, or terminals are we checking and for what shift or period?"',
        '"Who completed the review with you and who normally controls these tills?"',
        '"What till-control steps, paperwork, or cash-handling routines were tested?"',
      ],
    },
    findings: {
      title: 'Till Findings Script',
      intro: 'Use this section to capture patterns in the cash result and what they suggest.',
      prompts: [
        '"What mismatch, variance pattern, or refund concern did the till check show?"',
        '"Is this isolated or part of a repeat issue?"',
        '"What weakness in till process, training, or supervision explains it?"',
      ],
    },
    actions: {
      title: 'Till Action Script',
      intro: 'Use this to record what was corrected, escalated, or handed over after the check.',
      prompts: [
        '"What was recounted, corrected, coached, or secured before you finished?"',
        '"Who was told about the till outcome?"',
        '"What follow-up action is still required and who owns it?"',
      ],
    },
  },
  completed_line_checks: {
    what_checked: {
      title: 'Line Check Script',
      intro: 'Use this while walking the sales floor or stock area and recording what was counted.',
      prompts: [
        '"Which brands, fixtures, bays, or stock lines are we checking?"',
        '"Which areas were reviewed and what count source or method are we using?"',
        '"Which high-risk products were prioritised during the check?"',
      ],
    },
    findings: {
      title: 'Line Check Findings Script',
      intro: 'Use this to capture the stock result and any control weakness it exposed.',
      prompts: [
        '"What missing, extra, damaged, or unexplained stock did the line check show?"',
        '"Which product lines carry the greatest loss risk from this result?"',
        '"What process or control weakness might explain the variance?"',
      ],
    },
    actions: {
      title: 'Line Check Action Script',
      intro: 'Use this before closing so recounts, coaching, and ownership are explicit.',
      prompts: [
        '"What was re-counted, secured, corrected, or highlighted before leaving site?"',
        '"Who was updated about the line-check result?"',
        '"Who owns the follow-up actions and by when?"',
      ],
    },
  },
  supported_investigation: {
    what_checked: {
      title: 'Investigation Support Script',
      intro: 'Use this when documenting the investigation scope and the work completed on site.',
      prompts: [
        '"What allegation, incident, or loss event is this investigation focused on?"',
        '"Who are the subjects, witnesses, or relevant staff in scope?"',
        '"What evidence did you review to progress the case?"',
      ],
    },
    findings: {
      title: 'Investigation Findings Script',
      intro: 'Use this section to capture the strongest LP concern and what the evidence suggests.',
      prompts: [
        '"What does the evidence indicate so far?"',
        '"What fraud indicator, theft method, or process bypass is the key LP concern?"',
        '"What control weakness or exposure sits behind the case?"',
      ],
    },
    actions: {
      title: 'Investigation Handover Script',
      intro: 'Use this to record the work you completed and the case status when you left.',
      prompts: [
        '"What investigation work did you complete on site today?"',
        '"Who was the case escalated or handed over to?"',
        '"What is the next step and who owns it?"',
      ],
    },
  },
  reviewed_cctv_or_alarm: {
    what_checked: {
      title: 'CCTV / Alarm Review Script',
      intro: 'Use this while checking coverage, playback, alarms, and equipment health.',
      prompts: [
        '"Which cameras, alarm points, recorders, or panic systems were checked?"',
        '"Which areas of the store were reviewed for coverage or response?"',
        '"What playback, date-time, export, or function tests were completed?"',
      ],
    },
    findings: {
      title: 'Security Equipment Findings Script',
      intro: 'Use this section to describe the weakness in coverage or evidence quality.',
      prompts: [
        '"What faults, blind spots, or usage issues were identified?"',
        '"Does the system produce usable evidence, and if not why not?"',
        '"What loss risk or investigative gap does the weakness create?"',
      ],
    },
    actions: {
      title: 'Security Equipment Action Script',
      intro: 'Use this to record the interim control and any contractor or helpdesk escalation.',
      prompts: [
        '"What was fixed, reset, or coached immediately?"',
        '"Was a callout, ticket, or contractor referral raised?"',
        '"Who owns the follow-up and when should it be complete?"',
      ],
    },
  },
  reviewed_loss_controls: {
    what_checked: {
      title: 'Loss Controls Review Script',
      intro: 'Use this while walking shrink controls, risk hotspots, and display standards.',
      prompts: [
        '"Which controls, fixtures, or routines are we reviewing today?"',
        '"Which theft hotspots or high-risk areas did we prioritise?"',
        '"Which high-risk products, cabinets, or stock locations were checked?"',
      ],
    },
    findings: {
      title: 'Loss Controls Findings Script',
      intro: 'Use this to record where the control standard is weak and what risk it creates.',
      prompts: [
        '"What standards were missed or inconsistently applied?"',
        '"Where is the biggest deterrence or visibility gap?"',
        '"What root cause or behaviour is leaving the store exposed?"',
      ],
    },
    actions: {
      title: 'Loss Controls Action Script',
      intro: 'Use this to capture what was fixed on site and what still needs owning.',
      prompts: [
        '"What was corrected, re-merchandised, secured, or coached immediately?"',
        '"Who was updated or briefed about the control gap?"',
        '"Who owns the remaining corrective action and by when?"',
      ],
    },
  },
  conducted_opening_checks: {
    what_checked: {
      title: 'Opening Checks Script',
      intro: 'Use this while completing the opening routine before the store trades.',
      prompts: [
        '"Who is opening the site and who holds key responsibility this morning?"',
        '"Which opening checks were physically completed before trading began?"',
        '"What was the status of alarms, access points, shutters, safe controls, and high-risk stock at open?"',
      ],
    },
    findings: {
      title: 'Opening Checks Findings Script',
      intro: 'Use this section to capture any exposure identified before the store opened to customers.',
      prompts: [
        '"Was there any sign of forced entry, alarm fault, unsecured access point, or missing control at open?"',
        '"Was any stock, safe content, key, or high-risk area exposed or not ready for trade?"',
        '"What weakness in the opening routine, handover, or security control caused the issue?"',
      ],
    },
    actions: {
      title: 'Opening Checks Action Script',
      intro: 'Use this before the doors open so any immediate fix or escalation is clearly documented.',
      prompts: [
        '"What was corrected, secured, or isolated before customers were admitted?"',
        '"Who was informed about the opening concern or exposure?"',
        '"What follow-up action is still needed after the opening checks?"',
      ],
    },
  },
  conducted_stop_on_close: {
    what_checked: {
      title: 'Stop On Close Script',
      intro: 'Use this while walking the closing routine with the team before final lock-up.',
      prompts: [
        '"Who is present for close and who holds key responsibility tonight?"',
        '"Which closing checks were physically completed before lock-up?"',
        '"How were cash, keys, alarms, and final access controls verified?"',
      ],
    },
    findings: {
      title: 'Stop On Close Findings Script',
      intro: 'Use this section to record any exposure left in the close-down process.',
      prompts: [
        '"What steps were missed, rushed, or completed incorrectly at close?"',
        '"Was any stock, cash, key, alarm, or access point left exposed?"',
        '"What weakness in process or supervision caused the issue?"',
      ],
    },
    actions: {
      title: 'Stop On Close Action Script',
      intro: 'Use this before leaving so the final corrections and ownership are documented.',
      prompts: [
        '"What was corrected before the team left the building?"',
        '"Who was informed about any close-down concern?"',
        '"What follow-up action is still needed after tonight?"',
      ],
    },
  },
  took_statements_or_interviews: {
    what_checked: {
      title: 'Statement / Interview Script',
      intro: 'Use this while taking the account so the purpose, attendees, and records are clear.',
      prompts: [
        '"What case or incident does this statement or interview relate to?"',
        '"Who was spoken to and in what capacity?"',
        '"What evidence, notes, or signed records were captured during the meeting?"',
      ],
    },
    findings: {
      title: 'Statement Findings Script',
      intro: 'Use this section to summarise the key points and where they help or harm the case.',
      prompts: [
        '"What are the main points from the account you captured?"',
        '"What part of the statement supports, contradicts, or adds to the evidence?"',
        '"What loss concern or process issue becomes clearer after this account?"',
      ],
    },
    actions: {
      title: 'Statement Handover Script',
      intro: 'Use this to record storage, handover, and any further witness work required.',
      prompts: [
        '"Who now holds the statement or interview record?"',
        '"What further interviews, statements, or paperwork are still required?"',
        '"Who owns the next step and by when?"',
      ],
    },
  },
  reviewed_paperwork_or_processes: {
    what_checked: {
      title: 'Paperwork / Process Review Script',
      intro: 'Use this while walking compliance records and process stages with the store team.',
      prompts: [
        '"Which paperwork, reports, or store processes are we reviewing?"',
        '"Which area and time period does the review cover?"',
        '"What records or files support the process being tested?"',
      ],
    },
    findings: {
      title: 'Process Compliance Findings Script',
      intro: 'Use this to record where compliance failed and whether the issue is repeat behaviour.',
      prompts: [
        '"What missing paperwork, inaccurate record, or process breach was found?"',
        '"Is this isolated or a repeat gap?"',
        '"What control weakness allowed the non-compliance to continue?"',
      ],
    },
    actions: {
      title: 'Process Compliance Action Script',
      intro: 'Use this section to document the correction, coaching, and follow-up owner.',
      prompts: [
        '"What was corrected or completed on site?"',
        '"Who was briefed or escalated to about the compliance gap?"',
        '"Who owns the follow-up and by when?"',
      ],
    },
  },
  reviewed_stock_loss_or_counts: {
    what_checked: {
      title: 'Stock Loss Review Script',
      intro: 'Use this while walking the shrink concern, count source, and stock area in scope.',
      prompts: [
        '"What stock area, category, or SKU group are we reviewing?"',
        '"What shrink trend, adjustment issue, or count concern triggered the review?"',
        '"What count source, report, or system position are we comparing against?"',
      ],
    },
    findings: {
      title: 'Stock Loss Findings Script',
      intro: 'Use this section to pin down the main variance and whether there is a repeat pattern.',
      prompts: [
        '"What did the count or stock review actually show?"',
        '"Is there a repeat SKU, shift, delivery, or handling pattern?"',
        '"What control weakness or root cause sits behind the stock loss?"',
      ],
    },
    actions: {
      title: 'Stock Loss Action Script',
      intro: 'Use this before closing so escalations, recounts, and ownership are explicit.',
      prompts: [
        '"What was recounted, corrected, secured, or escalated after the review?"',
        '"Who was informed about the stock loss finding?"',
        '"Who owns the next step and by when?"',
      ],
    },
  },
  checked_delivery_or_parcel_issue: {
    what_checked: {
      title: 'Delivery / Parcel Issue Script',
      intro: 'Use this while recording the shipment, carrier, and problem found on receipt.',
      prompts: [
        '"Which delivery, parcel, or transfer are we reviewing?"',
        '"What exactly was wrong with the shipment when it was checked?"',
        '"Which carrier, supplier, or sending location is linked to the issue?"',
      ],
    },
    findings: {
      title: 'Delivery Findings Script',
      intro: 'Use this section to capture the affected stock and the evidence of tamper or shortage.',
      prompts: [
        '"Which items were missing, damaged, or otherwise affected?"',
        '"What did the seal, carton, or packaging condition show?"',
        '"What loss value or control weakness does the delivery issue create?"',
      ],
    },
    actions: {
      title: 'Delivery Action Script',
      intro: 'Use this to record quarantine, notification, and claim ownership.',
      prompts: [
        '"What was done with the affected stock or parcel on site?"',
        '"Who was notified or escalated to about the issue?"',
        '"Was a claim, incident, or supplier case raised and who owns it?"',
      ],
    },
  },
  reviewed_security_procedures: {
    what_checked: {
      title: 'Security Procedure Review Script',
      intro: 'Use this while testing procedures, key control, and guarding arrangements.',
      prompts: [
        '"Which security procedures or routines are we checking?"',
        '"Which areas or stages of the process are covered by the review?"',
        '"Who was present while the procedure was tested or demonstrated?"',
      ],
    },
    findings: {
      title: 'Security Procedure Findings Script',
      intro: 'Use this section to describe the breach, exposure, or control weakness found.',
      prompts: [
        '"What step was missed or applied weakly?"',
        '"What breach, uncontrolled access, or exposure does that create?"',
        '"What weakness in training, guarding, or supervision explains it?"',
      ],
    },
    actions: {
      title: 'Security Procedure Action Script',
      intro: 'Use this to capture the immediate change, coaching, or escalation agreed.',
      prompts: [
        '"What was changed or reinforced immediately?"',
        '"Who was updated or escalated to about the security weakness?"',
        '"Who owns the remaining action and by when?"',
      ],
    },
  },
  provided_store_support_or_training: {
    what_checked: {
      title: 'Store Support / Training Script',
      intro: 'Use this while documenting the coaching session and why it was needed.',
      prompts: [
        '"What LP topic, control, or process are we covering today?"',
        '"Who received the support or training?"',
        '"What incident, audit gap, or performance concern led to this session?"',
      ],
    },
    findings: {
      title: 'Training Needs Script',
      intro: 'Use this section to capture the knowledge or behaviour gap that was observed.',
      prompts: [
        '"What did the team not understand, apply, or complete consistently?"',
        '"What loss risk did that gap create?"',
        '"What root cause sits behind the gap: knowledge, confidence, supervision, or process?"',
      ],
    },
    actions: {
      title: 'Training Delivery Script',
      intro: 'Use this to record what guidance was given and how follow-up will be checked.',
      prompts: [
        '"What practical guidance, coaching, or demonstration was given?"',
        '"Who was updated about the support provided?"',
        '"What follow-up, revisit, or manager action is still needed?"',
      ],
    },
  },
  other: {
    what_checked: {
      title: 'Other LP Activity Script',
      intro: 'Use this when the work does not fit a standard template but still needs a clear LP record.',
      prompts: [
        '"What activity was completed and why was it necessary?"',
        '"Who was involved and what evidence or records were used?"',
        '"What exactly did you do on site?"',
      ],
    },
    findings: {
      title: 'Other Activity Findings Script',
      intro: 'Use this section to capture the risk, issue, or weakness that came out of the activity.',
      prompts: [
        '"What LP risk or operational weakness was identified?"',
        '"What loss exposure or concern does it create?"',
        '"What appears to be the root cause?"',
      ],
    },
    actions: {
      title: 'Other Activity Action Script',
      intro: 'Use this to close the activity with a clear action and owner.',
      prompts: [
        '"What did you correct, escalate, or complete before leaving site?"',
        '"Who was updated about the issue?"',
        '"What next step remains and who owns it?"',
      ],
    },
  },
}

const STORE_VISIT_ACTIVITY_FIELD_GUIDANCE: Partial<
  Record<StoreVisitActivityKey, StoreVisitActivityFieldGuidanceMap>
> = {
  checked_banking: {
    bankingReference: {
      scriptLines: ['"Which deposit, bag, or banking reference are we reviewing?"'],
      captureHint: 'Record the deposit number, bag reference, or banking identifier used for the review.',
    },
    reviewCompletedWith: {
      scriptLines: ['"Who completed the banking review with you and who normally owns the process?"'],
      captureHint: 'List the colleague or manager who reviewed the banking with you.',
    },
    bankingItemsChecked: {
      scriptLines: ['"Which bags, envelopes, safe contents, or deposits did we physically check?"'],
      captureHint: 'List the cash items or banking units that were checked during the review.',
    },
    paperworkReviewed: {
      scriptLines: ['"Which slips, logs, or banking records did we compare against the physical cash?"'],
      captureHint: 'Record the paperwork and records used to confirm the banking position.',
    },
    discrepancyType: {
      scriptLines: ['"What discrepancy, irregularity, or control gap did the banking review identify?"'],
      captureHint: 'Summarise the issue found, such as a shortage, overage, missing slip, mismatch, or delay.',
    },
    discrepancyAction: {
      scriptLines: ['"What did you do about the discrepancy before leaving site?"'],
      captureHint: 'Capture the immediate action taken on the banking issue or shortfall.',
    },
  },
  completed_till_checks: {
    tillsChecked: {
      scriptLines: ['"Which tills, floats, or terminals were checked?"'],
      captureHint: 'List the tills, floats, or terminals included in the visit.',
    },
    reviewCompletedWith: {
      scriptLines: ['"Who completed the till check with you and who controls the tills on that shift?"'],
      captureHint: 'Name the manager, supervisor, or colleague involved in the till review.',
    },
    cashControlsReviewed: {
      scriptLines: ['"What till-control steps, cash routines, or paperwork checks were tested?"'],
      captureHint: 'Describe the cash controls or till processes reviewed during the check.',
    },
    spotCheckWindow: {
      scriptLines: ['"What shift, handover, or time window does this till check cover?"'],
      captureHint: 'Record the shift or period linked to the till review.',
    },
    variancePattern: {
      scriptLines: ['"What variance pattern, refund concern, or till behaviour did the check show?"'],
      captureHint: 'Summarise the main variance concern or repeat pattern found in the till check.',
    },
    varianceAction: {
      scriptLines: ['"What was corrected, escalated, or coached after the till result was found?"'],
      captureHint: 'Record the action taken on site in response to the till finding.',
    },
  },
  completed_line_checks: {
    linesChecked: {
      scriptLines: ['"Which brands, ranges, bays, or lines were counted?"'],
      captureHint: 'List the main stock lines or ranges reviewed.',
    },
    areasChecked: {
      scriptLines: ['"Which store areas or fixtures were covered by the line check?"'],
      captureHint: 'Record the physical areas included in the check.',
    },
    countMethod: {
      scriptLines: ['"What count source, report, or method are we using for this check?"'],
      captureHint: 'Note the system, report, blind count, or manual count method used.',
    },
    highRiskProductsChecked: {
      scriptLines: ['"Which high-risk products or fragrances were prioritised?"'],
      captureHint: 'List the high-risk products or lines that were specifically checked.',
    },
  },
  supported_investigation: {
    caseReference: {
      scriptLines: ['"What case, incident, or investigation reference does this work relate to?"'],
      captureHint: 'Enter the case or incident reference tied to the investigation.',
    },
    investigationFocus: {
      scriptLines: ['"What allegation, loss event, or conduct issue are we investigating?"'],
      captureHint: 'Describe the main investigation focus in clear terms.',
    },
    subjectsInvolved: {
      scriptLines: ['"Who are the subjects, witnesses, or other people involved in this case?"'],
      captureHint: 'List the key people linked to the investigation and their role.',
    },
    evidenceReviewed: {
      scriptLines: ['"What evidence did you review to progress the investigation?"'],
      captureHint: 'Record the CCTV, paperwork, statements, logs, or data reviewed.',
    },
    keyLPConcern: {
      scriptLines: ['"What is the main LP concern or method identified so far?"'],
      captureHint: 'Summarise the key fraud, theft, collusion, or control concern emerging from the case.',
    },
    workCompleted: {
      scriptLines: ['"What investigation work did you personally complete on site?"'],
      captureHint: 'Explain what steps you completed during the visit.',
    },
    outcomeOrEscalation: {
      scriptLines: ['"What is the current outcome or escalation point for the case?"'],
      captureHint: 'Record the case status, escalation, or agreed next stage.',
    },
  },
  reviewed_cctv_or_alarm: {
    systemsChecked: {
      scriptLines: ['"Which cameras, alarm points, or recorders were checked?"'],
      captureHint: 'List the security systems or devices reviewed.',
    },
    areasReviewed: {
      scriptLines: ['"Which store areas were checked for coverage or alarm response?"'],
      captureHint: 'Record the physical areas reviewed during the equipment check.',
    },
    functionTestCompleted: {
      scriptLines: ['"What playback, test, or function checks were completed?"'],
      captureHint: 'Summarise the tests completed on the CCTV or alarm system.',
    },
    faultsFound: {
      scriptLines: ['"What faults, blind spots, or equipment failures were found?"'],
      captureHint: 'Record the defects or weaknesses identified in the system.',
    },
    evidenceQuality: {
      scriptLines: ['"Is the footage or alarm output usable, and if not what is the problem?"'],
      captureHint: 'Capture any evidence-quality concern such as poor image, angle, export, or retention.',
    },
    actionsAgreed: {
      scriptLines: ['"What fix, reset, training, or escalation was agreed?"'],
      captureHint: 'Record the action agreed to address the equipment issue.',
    },
    calloutOrTicketReference: {
      scriptLines: ['"Was a helpdesk, contractor, or engineer reference raised?"'],
      captureHint: 'Enter the ticket or callout reference if one was created.',
    },
  },
  reviewed_loss_controls: {
    controlsChecked: {
      scriptLines: ['"Which shrink controls or LP standards were checked?"'],
      captureHint: 'List the controls, fixtures, or procedures reviewed.',
    },
    hotspotsReviewed: {
      scriptLines: ['"Which theft hotspots or risk areas were reviewed?"'],
      captureHint: 'Record the hotspots or vulnerable areas covered during the review.',
    },
    highRiskProductsReviewed: {
      scriptLines: ['"Which high-risk products or locations were prioritised?"'],
      captureHint: 'List the key products, SKUs, or areas reviewed for loss exposure.',
    },
    weaknessesFound: {
      scriptLines: ['"What control gaps or missed standards did you find?"'],
      captureHint: 'Summarise the weaknesses identified in the store controls.',
    },
    deterrenceGap: {
      scriptLines: ['"Where is the deterrence, visibility, or guarding gap?"'],
      captureHint: 'Record the deterrence issue or visibility gap that leaves stock exposed.',
    },
    correctiveAction: {
      scriptLines: ['"What corrective action was completed or agreed with the team?"'],
      captureHint: 'Capture what was fixed on site and what was agreed for follow-up.',
    },
  },
  conducted_opening_checks: {
    teamPresentAtOpen: {
      scriptLines: ['"Who is opening the site and who holds responsibility this morning?"'],
      captureHint: 'List the keyholder, manager, security colleague, or other team members present at open.',
    },
    openingChecksCompleted: {
      scriptLines: ['"Which opening checks were physically completed before trading began?"'],
      captureHint: 'Record the specific opening checks completed before the store opened.',
    },
    alarmAndAccessStatus: {
      scriptLines: ['"What was the status of alarms, shutters, locks, and entry points at open?"'],
      captureHint: 'Summarise the opening status of alarms, access points, shutters, and locks.',
    },
    safeAndHighRiskStockStatus: {
      scriptLines: ['"What was the status of the safe, high-risk stock, and protected fixtures at open?"'],
      captureHint: 'Describe the condition of the safe, cabinets, high-risk stock, and trading-readiness controls.',
    },
    issuesAtOpen: {
      scriptLines: ['"What issue, missed step, or exposure did you find during the opening routine?"'],
      captureHint: 'Describe the opening concern or operational issue found before trade.',
    },
    signsOfEntryOrExposure: {
      scriptLines: ['"Was there any sign of forced entry, damage, or stock/security exposure?"'],
      captureHint: 'Record any sign of entry, damaged security measure, or exposed stock/control issue.',
    },
    actionsBeforeTrading: {
      scriptLines: ['"What was corrected, secured, or escalated before the doors opened?"'],
      captureHint: 'Capture the actions completed before trade and any escalation made from the opening check.',
    },
  },
  conducted_stop_on_close: {
    teamPresent: {
      scriptLines: ['"Who was present for close and who held responsibility?"'],
      captureHint: 'List the staff, manager, keyholder, or guard present at close.',
    },
    closingChecksCompleted: {
      scriptLines: ['"Which close-down checks were physically completed?"'],
      captureHint: 'Record the specific closing checks completed during the visit.',
    },
    cashAndKeysVerified: {
      scriptLines: ['"How were cash, keys, and alarm status verified?"'],
      captureHint: 'Summarise how key security items were checked before lock-up.',
    },
    issuesAtClose: {
      scriptLines: ['"What issue, missed step, or exposure did you find at close?"'],
      captureHint: 'Describe the close-down issue or security concern identified.',
    },
    actionsBeforeLeaving: {
      scriptLines: ['"What did you put right before the team left site?"'],
      captureHint: 'Record the final corrections or agreements completed before leaving.',
    },
  },
  took_statements_or_interviews: {
    caseReference: {
      scriptLines: ['"What case or incident reference does this statement relate to?"'],
      captureHint: 'Enter the relevant case or incident reference.',
    },
    peopleSpokenTo: {
      scriptLines: ['"Who gave a statement or interview during this visit?"'],
      captureHint: 'List the people spoken to and their role.',
    },
    statementPurpose: {
      scriptLines: ['"What was the purpose of taking this statement or interview?"'],
      captureHint: 'Record what the statement or interview was intended to establish.',
    },
    recordsCaptured: {
      scriptLines: ['"What statement records, notes, or supporting evidence were captured?"'],
      captureHint: 'List the signed forms, notes, recordings, or related evidence captured.',
    },
    keyPointsCaptured: {
      scriptLines: ['"What are the main points from the account you captured?"'],
      captureHint: 'Summarise the main evidence or account obtained from the interview.',
    },
    followUpRequired: {
      scriptLines: ['"What further interviews, witness work, or paperwork is still needed?"'],
      captureHint: 'Record the follow-up work still required after this statement.',
    },
    evidenceStored: {
      scriptLines: ['"Who holds the statement or where has the evidence been stored?"'],
      captureHint: 'State where the record was stored or who received it.',
    },
  },
  reviewed_paperwork_or_processes: {
    paperworkChecked: {
      scriptLines: ['"Which paperwork sets or process steps were checked?"'],
      captureHint: 'List the paperwork or processes reviewed.',
    },
    areasReviewed: {
      scriptLines: ['"Which physical areas or files were included in the review?"'],
      captureHint: 'Record the store areas or admin locations covered by the check.',
    },
    periodCovered: {
      scriptLines: ['"What date range or operating period does the review cover?"'],
      captureHint: 'Record the time period examined during the process review.',
    },
    nonComplianceFound: {
      scriptLines: ['"What missing paperwork, inaccurate record, or process breach was found?"'],
      captureHint: 'Describe the non-compliance issue identified.',
    },
    repeatProcessGap: {
      scriptLines: ['"Is this a repeat process issue or an isolated miss?"'],
      captureHint: 'Record whether the issue is repeat behaviour and what weakness it shows.',
    },
    correctionsMade: {
      scriptLines: ['"What correction or process fix was completed or agreed on site?"'],
      captureHint: 'Capture the corrective action or agreement made with the store.',
    },
  },
  reviewed_stock_loss_or_counts: {
    stockAreaReviewed: {
      scriptLines: ['"Which stock area, category, or SKU group was reviewed?"'],
      captureHint: 'Record the stock area or category in scope.',
    },
    lossIssueReviewed: {
      scriptLines: ['"What stock-loss trend, adjustment issue, or shrink concern are we looking at?"'],
      captureHint: 'Describe the stock-loss issue that triggered the review.',
    },
    countSourceUsed: {
      scriptLines: ['"What count source, report, or system position are we using?"'],
      captureHint: 'List the source used to compare the stock position.',
    },
    countFindings: {
      scriptLines: ['"What did the count or stock review actually show?"'],
      captureHint: 'Summarise the main variance or stock finding identified.',
    },
    trendOrPattern: {
      scriptLines: ['"Is there a repeat SKU, shift, or delivery pattern behind the issue?"'],
      captureHint: 'Record any trend or repeat pattern linked to the stock-loss concern.',
    },
    actionEscalated: {
      scriptLines: ['"What was actioned or escalated after the stock review?"'],
      captureHint: 'Capture the action or escalation raised from the review.',
    },
  },
  checked_delivery_or_parcel_issue: {
    deliveryReference: {
      scriptLines: ['"Which delivery, parcel, or transfer reference are we reviewing?"'],
      captureHint: 'Enter the delivery note, carrier, or parcel reference.',
    },
    issueReviewed: {
      scriptLines: ['"What exactly was wrong with the delivery or parcel?"'],
      captureHint: 'Describe the delivery, tamper, or shortage issue identified.',
    },
    carrierOrSupplier: {
      scriptLines: ['"Which carrier, supplier, or source location is linked to the issue?"'],
      captureHint: 'Record the courier, supplier, or transfer source involved.',
    },
    affectedItems: {
      scriptLines: ['"Which items were missing, damaged, or affected?"'],
      captureHint: 'List the stock impacted by the delivery issue.',
    },
    sealOrPackagingCondition: {
      scriptLines: ['"What did the seal, carton, or packaging condition show?"'],
      captureHint: 'Capture the packaging condition and any signs of tamper or mishandling.',
    },
    actionsTaken: {
      scriptLines: ['"What was done with the parcel or stock on site?"'],
      captureHint: 'Record the action taken, such as quarantine, notification, or evidence capture.',
    },
    claimOrCaseReference: {
      scriptLines: ['"Was a claim, incident, or supplier case reference raised?"'],
      captureHint: 'Enter the claim, incident, or escalation reference if one exists.',
    },
  },
  reviewed_security_procedures: {
    proceduresChecked: {
      scriptLines: ['"Which security procedures or routines were reviewed?"'],
      captureHint: 'List the procedures, controls, or routines tested.',
    },
    areasCovered: {
      scriptLines: ['"Which areas or process stages were covered in the review?"'],
      captureHint: 'Record the physical areas or process stages included.',
    },
    guardOrKeyholderPresent: {
      scriptLines: ['"Who was present while the procedure was reviewed or demonstrated?"'],
      captureHint: 'List the guard, keyholder, or manager present for the review.',
    },
    weaknessesFound: {
      scriptLines: ['"What missed steps or security weaknesses were found?"'],
      captureHint: 'Summarise the main security weakness identified.',
    },
    breachOrExposure: {
      scriptLines: ['"What breach, uncontrolled access, or exposure does the weakness create?"'],
      captureHint: 'Describe the security exposure or breach created by the issue.',
    },
    actionsAgreed: {
      scriptLines: ['"What change, coaching, or escalation was agreed?"'],
      captureHint: 'Record the security action agreed with the team.',
    },
  },
  provided_store_support_or_training: {
    topicCovered: {
      scriptLines: ['"What LP topic, control, or process was covered?"'],
      captureHint: 'Record the subject of the coaching or training.',
    },
    deliveredTo: {
      scriptLines: ['"Who received the support or training?"'],
      captureHint: 'List the people or team who received the guidance.',
    },
    trainingReason: {
      scriptLines: ['"What concern, incident, or audit gap drove this support session?"'],
      captureHint: 'Explain why the coaching or support was needed.',
    },
    observedKnowledgeGap: {
      scriptLines: ['"What knowledge, behaviour, or process gap did you observe?"'],
      captureHint: 'Describe the gap or weakness that prompted the training content.',
    },
    guidanceGiven: {
      scriptLines: ['"What practical guidance or demonstration did you give?"'],
      captureHint: 'Summarise the support or coaching delivered on site.',
    },
    followUpNeeded: {
      scriptLines: ['"What further training, revisit, or manager action is still needed?"'],
      captureHint: 'Record any follow-up support or checks still required.',
    },
  },
  other: {
    activityType: {
      scriptLines: ['"What type of LP activity was completed?"'],
      captureHint: 'Name the activity clearly so the record is easy to understand later.',
    },
    details: {
      scriptLines: ['"Talk me through exactly what work was completed on site."'],
      captureHint: 'Describe the activity in practical terms, including what was checked or done.',
    },
    lpRiskObserved: {
      scriptLines: ['"What LP risk, issue, or weakness came out of this work?"'],
      captureHint: 'Summarise the key risk or concern identified through the activity.',
    },
  },
}

const STORE_VISIT_ACTIVITY_COUNTED_ITEMS_GUIDES: Partial<
  Record<StoreVisitActivityKey, StoreVisitActivityGuideCard>
> = {
  completed_line_checks: {
    title: 'Line Count Prompts',
    intro: 'Use each row to record what was counted and challenge any variance clearly.',
    prompts: [
      '"Which exact product or line are we checking here?"',
      '"What should the stock position be, and what was physically counted?"',
      '"How do we explain any missing, extra, or damaged units on this row?"',
    ],
  },
}

const STORE_VISIT_ACTIVITY_AMOUNT_CHECKS_GUIDES: Partial<
  Record<StoreVisitActivityKey, StoreVisitActivityGuideCard>
> = {
  checked_banking: {
    title: 'Banking Amount Prompts',
    intro: 'Use each row to record the expected versus actual banking figure and any gap.',
    prompts: [
      '"Which banking bag, safe amount, or deposit figure does this row represent?"',
      '"What should the amount have been and what was physically found?"',
      '"How is any shortage, overage, or mismatch being explained or escalated?"',
    ],
  },
  completed_till_checks: {
    title: 'Till Amount Prompts',
    intro: 'Use each row to compare the till or float expectation against the counted result.',
    prompts: [
      '"Which till, float, or cash point does this row relate to?"',
      '"What was the expected amount and what was actually counted?"',
      '"What explains any mismatch and what action followed?"',
    ],
  },
}

const STORE_VISIT_ACTIVITY_KEY_SET = new Set<StoreVisitActivityKey>(
  STORE_VISIT_ACTIVITY_OPTIONS.map((option) => option.key)
)

export function isStoreVisitActivityKey(value: string): value is StoreVisitActivityKey {
  return STORE_VISIT_ACTIVITY_KEY_SET.has(value as StoreVisitActivityKey)
}

export function getStoreVisitActivityOption(
  activityKey: StoreVisitActivityKey
): StoreVisitActivityOption | undefined {
  return STORE_VISIT_ACTIVITY_OPTIONS.find((option) => option.key === activityKey)
}

export function getStoreVisitActivityFieldDefinitions(
  activityKey: StoreVisitActivityKey
): readonly StoreVisitActivityFieldDefinition[] {
  const option = getStoreVisitActivityOption(activityKey)
  const fields = composeActivityFields(activityKey, option)
  const fieldGuidance = STORE_VISIT_ACTIVITY_FIELD_GUIDANCE[activityKey]

  if (!fieldGuidance) return fields

  return fields.map((field) => {
    const guidance = fieldGuidance[field.key]
    return guidance ? withFieldGuidance(field, guidance) : field
  })
}

export function getStoreVisitActivityFieldDefinition(
  activityKey: StoreVisitActivityKey,
  fieldKey: string
): StoreVisitActivityFieldDefinition | undefined {
  return getStoreVisitActivityFieldDefinitions(activityKey).find((field) => field.key === fieldKey)
}

export function formatStoreVisitActivityFieldValue(
  activityKey: StoreVisitActivityKey,
  fieldKey: string,
  value: string | null | undefined
): string {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) return ''

  const fieldDefinition = getStoreVisitActivityFieldDefinition(activityKey, fieldKey)
  if (!fieldDefinition) return normalizedValue

  return getStoreVisitActivityFieldOptionLabelFromDefinition(fieldDefinition, normalizedValue) || normalizedValue
}

export function getStoreVisitActivitySectionGuide(
  activityKey: StoreVisitActivityKey,
  section: StoreVisitActivityFieldSection
): StoreVisitActivityGuideCard | undefined {
  return (
    getStoreVisitActivityOption(activityKey)?.sectionGuides?.[section] ||
    STORE_VISIT_ACTIVITY_SECTION_GUIDES[activityKey]?.[section]
  )
}

export function getStoreVisitActivityCountedItemsGuide(
  activityKey: StoreVisitActivityKey
): StoreVisitActivityGuideCard | undefined {
  return (
    getStoreVisitActivityOption(activityKey)?.countedItemsGuide ||
    STORE_VISIT_ACTIVITY_COUNTED_ITEMS_GUIDES[activityKey]
  )
}

export function getStoreVisitActivityAmountChecksGuide(
  activityKey: StoreVisitActivityKey
): StoreVisitActivityGuideCard | undefined {
  return (
    getStoreVisitActivityOption(activityKey)?.amountChecksGuide ||
    STORE_VISIT_ACTIVITY_AMOUNT_CHECKS_GUIDES[activityKey]
  )
}

export function getStoreVisitActivityFieldSection(
  activityKey: StoreVisitActivityKey,
  field: StoreVisitActivityFieldDefinition
): StoreVisitActivityFieldSection {
  if (field.section) return field.section

  const option = getStoreVisitActivityOption(activityKey)
  const legacyEntry = Object.entries(option?.legacyFieldMap || {}).find(
    ([, mappedField]) => mappedField === field.key
  )?.[0]

  if (legacyEntry === 'findings') return 'findings'
  if (legacyEntry === 'actionsTaken' || legacyEntry === 'nextSteps') return 'actions'
  if (
    legacyEntry === 'summary' ||
    legacyEntry === 'peopleInvolved' ||
    legacyEntry === 'reference'
  ) {
    return 'what_checked'
  }

  const normalizedKey = field.key.toLowerCase()
  if (
    normalizedKey.includes('issue') ||
    normalizedKey.includes('finding') ||
    normalizedKey.includes('weakness') ||
    normalizedKey.includes('variance') ||
    normalizedKey.includes('fault') ||
    normalizedKey.includes('affected') ||
    normalizedKey.includes('countfindings') ||
    normalizedKey.includes('noncompliance')
  ) {
    return 'findings'
  }

  if (
    normalizedKey.includes('action') ||
    normalizedKey.includes('followup') ||
    normalizedKey.includes('outcome') ||
    normalizedKey.includes('correction') ||
    normalizedKey.includes('escalation')
  ) {
    return 'actions'
  }

  return 'what_checked'
}

export function validateStoreVisitActivityPayloadCompleteness(
  selectedKeys: readonly StoreVisitActivityKey[],
  payloads: StoreVisitActivityPayloads | null | undefined
): StoreVisitActivityCompletenessIssue[] {
  const normalizedPayloads = normalizeStoreVisitActivityPayloads(payloads, selectedKeys)

  return selectedKeys.reduce<StoreVisitActivityCompletenessIssue[]>((issues, activityKey) => {
    const payload = normalizedPayloads[activityKey]
    const fields = payload?.fields || {}
    const missingFields = getStoreVisitActivityFieldDefinitions(activityKey)
      .filter((field) => field.required)
      .filter((field) => {
        const value = String(fields[field.key] || '').trim()
        if (field.key === 'followUpCompletedAt') {
          const followUpStatus = String(fields.followUpStatus || '').trim()
          if (followUpStatus !== 'complete') {
            return false
          }
        }
        return !value
      })
      .map((field) => ({
        key: field.key,
        label: field.label,
        section: getStoreVisitActivityFieldSection(activityKey, field),
      }))

    if (missingFields.length > 0) {
      issues.push({
        activityKey,
        missingFields,
      })
    }

    return issues
  }, [])
}

export function normalizeStoreVisitActivityDetails(
  input: unknown,
  selectedKeys?: readonly StoreVisitActivityKey[]
): StoreVisitActivityDetails {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const allowedKeys = new Set<StoreVisitActivityKey>(
    selectedKeys && selectedKeys.length > 0 ? selectedKeys : STORE_VISIT_ACTIVITY_OPTIONS.map((option) => option.key)
  )

  const details: StoreVisitActivityDetails = {}

  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (!isStoreVisitActivityKey(rawKey) || !allowedKeys.has(rawKey)) continue
    const trimmedValue = String(rawValue || '').trim()
    if (!trimmedValue) continue
    details[rawKey] = trimmedValue
  }

  return details
}

function normalizeOptionalText(value: unknown): string | undefined {
  const trimmedValue = String(value || '').trim()
  return trimmedValue || undefined
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed)
}

function normalizeOptionalAmount(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true
  if (['false', 'no', 'n', '0'].includes(normalized)) return false
  return null
}

function normalizeStoreVisitTextFields(
  input: unknown,
  allowedFieldKeys?: readonly string[]
): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const allowedFieldKeySet =
    allowedFieldKeys && allowedFieldKeys.length > 0 ? new Set(allowedFieldKeys) : null

  return Object.entries(input as Record<string, unknown>).reduce<Record<string, string>>((fields, [key, rawValue]) => {
    const normalizedKey = LEGACY_ACTIVITY_FIELD_ALIASES[key] || key

    if (allowedFieldKeySet && !allowedFieldKeySet.has(normalizedKey)) {
      return fields
    }

    const value = normalizeOptionalText(rawValue)
    if (value) {
      if (!fields[normalizedKey]) {
        fields[normalizedKey] = value
      } else if (!fields[normalizedKey].includes(value)) {
        fields[normalizedKey] = `${fields[normalizedKey]}\n\n${value}`
      }
    }

    return fields
  }, {})
}

function appendLegacyFieldValue(
  fields: Record<string, string>,
  fieldKey: string,
  value: string | undefined
) {
  if (!value) return

  if (!fields[fieldKey]) {
    fields[fieldKey] = value
    return
  }

  if (!fields[fieldKey].includes(value)) {
    fields[fieldKey] = `${fields[fieldKey]}\n\n${value}`
  }
}

function normalizeLegacyStoreVisitFields(
  activityKey: StoreVisitActivityKey,
  rawPayload: Record<string, unknown>
): Record<string, string> {
  const option = getStoreVisitActivityOption(activityKey)
  const fieldDefinitions: readonly StoreVisitActivityFieldDefinition[] = option?.fields || []
  if (fieldDefinitions.length === 0) return {}

  const allowedFieldKeys = new Set(fieldDefinitions.map((field) => field.key))
  const legacyFieldMap: Partial<Record<StoreVisitLegacyPayloadField, string>> =
    option?.legacyFieldMap || {}
  const fields: Record<string, string> = {}

  for (const [legacyKey, fieldKey] of Object.entries(legacyFieldMap)) {
    if (!fieldKey || !allowedFieldKeys.has(fieldKey)) continue
    appendLegacyFieldValue(
      fields,
      fieldKey,
      normalizeOptionalText(rawPayload[legacyKey as StoreVisitLegacyPayloadField])
    )
  }

  return fields
}

function normalizeStoreVisitCountedItems(input: unknown): StoreVisitCountedItem[] {
  if (!Array.isArray(input)) return []

  return input
    .map((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null

      const item: StoreVisitCountedItem = {
        productId: normalizeOptionalText((rawItem as Record<string, unknown>).productId),
        productLabel: normalizeOptionalText((rawItem as Record<string, unknown>).productLabel),
        variantLabel: normalizeOptionalText((rawItem as Record<string, unknown>).variantLabel),
        sizeLabel: normalizeOptionalText((rawItem as Record<string, unknown>).sizeLabel),
        unitPrice: normalizeOptionalAmount((rawItem as Record<string, unknown>).unitPrice),
        systemQuantity: normalizeOptionalInteger((rawItem as Record<string, unknown>).systemQuantity),
        countedQuantity: normalizeOptionalInteger((rawItem as Record<string, unknown>).countedQuantity),
        notes: normalizeOptionalText((rawItem as Record<string, unknown>).notes),
      }

      if (
        !item.productId &&
        !item.productLabel &&
        !item.variantLabel &&
        !item.sizeLabel &&
        item.unitPrice === null &&
        item.systemQuantity === null &&
        item.countedQuantity === null &&
        !item.notes
      ) {
        return null
      }

      return item
    })
    .filter((item): item is StoreVisitCountedItem => item !== null)
}

function normalizeStoreVisitAmountChecks(input: unknown): StoreVisitAmountCheck[] {
  if (!Array.isArray(input)) return []

  return input
    .map((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null

      const item: StoreVisitAmountCheck = {
        label: normalizeOptionalText((rawItem as Record<string, unknown>).label),
        systemAmount: normalizeOptionalAmount((rawItem as Record<string, unknown>).systemAmount),
        countedAmount: normalizeOptionalAmount((rawItem as Record<string, unknown>).countedAmount),
        amountMatches: normalizeOptionalBoolean((rawItem as Record<string, unknown>).amountMatches),
        notes: normalizeOptionalText((rawItem as Record<string, unknown>).notes),
      }

      if (
        !item.label &&
        item.systemAmount === null &&
        item.countedAmount === null &&
        item.amountMatches === null &&
        !item.notes
      ) {
        return null
      }

      return item
    })
    .filter((item): item is StoreVisitAmountCheck => item !== null)
}

function normalizeStoreVisitActivityPayload(
  activityKey: StoreVisitActivityKey,
  input: unknown
): StoreVisitActivityPayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null

  const rawPayload = input as Record<string, unknown>
  const payload: StoreVisitActivityPayload = {}
  const fieldDefinitions = getStoreVisitActivityFieldDefinitions(activityKey)
  const allowedFieldKeys = fieldDefinitions.map((field) => field.key)
  const fields = {
    ...normalizeLegacyStoreVisitFields(activityKey, rawPayload),
    ...normalizeStoreVisitTextFields(rawPayload.fields, allowedFieldKeys),
  }
  const amountConfirmed = normalizeOptionalBoolean(rawPayload.amountConfirmed)
  const itemsChecked = normalizeStoreVisitCountedItems(rawPayload.itemsChecked)
  const amountChecks = normalizeStoreVisitAmountChecks(rawPayload.amountChecks)

  if (Object.keys(fields).length > 0) payload.fields = fields
  if (amountConfirmed !== null) payload.amountConfirmed = amountConfirmed
  if (itemsChecked.length > 0) payload.itemsChecked = itemsChecked
  if (amountChecks.length > 0) payload.amountChecks = amountChecks

  return Object.keys(payload).length > 0 ? payload : null
}

export function normalizeStoreVisitActivityPayloads(
  input: unknown,
  selectedKeys?: readonly StoreVisitActivityKey[]
): StoreVisitActivityPayloads {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const allowedKeys = new Set<StoreVisitActivityKey>(
    selectedKeys && selectedKeys.length > 0 ? selectedKeys : STORE_VISIT_ACTIVITY_OPTIONS.map((option) => option.key)
  )

  const payloads: StoreVisitActivityPayloads = {}

  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (!isStoreVisitActivityKey(rawKey) || !allowedKeys.has(rawKey)) continue
    const normalizedPayload = normalizeStoreVisitActivityPayload(rawKey, rawValue)
    if (!normalizedPayload) continue
    payloads[rawKey] = normalizedPayload
  }

  return payloads
}

export function formatStoreVisitCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'

  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value)
}

export function getStoreVisitCountedItemDelta(item: StoreVisitCountedItem): number | null {
  if (
    typeof item.systemQuantity !== 'number' ||
    Number.isNaN(item.systemQuantity) ||
    typeof item.countedQuantity !== 'number' ||
    Number.isNaN(item.countedQuantity)
  ) {
    return null
  }

  return item.countedQuantity - item.systemQuantity
}

export function getStoreVisitCountedItemVarianceValue(
  item: StoreVisitCountedItem
): number | null {
  const delta = getStoreVisitCountedItemDelta(item)
  if (!delta || typeof item.unitPrice !== 'number' || Number.isNaN(item.unitPrice)) {
    return null
  }

  return Math.round(Math.abs(delta) * item.unitPrice * 100) / 100
}

export function buildStoreVisitCountedItemVarianceNote(
  item: StoreVisitCountedItem
): string | undefined {
  const delta = getStoreVisitCountedItemDelta(item)
  if (!delta) return undefined

  const quantity = Math.abs(delta)
  const directionLabel =
    delta < 0
      ? `${quantity} missing`
      : `${quantity} extra`
  const varianceValue = getStoreVisitCountedItemVarianceValue(item)
  const totalLabel = varianceValue !== null ? ` totalling ${formatStoreVisitCurrency(varianceValue)}` : ''
  const priceLabel =
    typeof item.unitPrice === 'number' && !Number.isNaN(item.unitPrice)
      ? ` at ${formatStoreVisitCurrency(item.unitPrice)} each`
      : ''

  return `Variance: ${directionLabel}${totalLabel}${priceLabel}.`
}

export function buildStoreVisitActivityDetailText(
  key: StoreVisitActivityKey,
  detail: string | null | undefined,
  payload: StoreVisitActivityPayload | null | undefined
): string | undefined {
  const explicitDetail = normalizeOptionalText(detail)
  if (explicitDetail) return explicitDetail

  const normalizedPayload = normalizeStoreVisitActivityPayload(key, payload)
  if (!normalizedPayload) return undefined

  const summaryBits: string[] = []
  const option = getStoreVisitActivityOption(key)
  const detailFieldKeys =
    option?.detailFieldKeys ||
    getStoreVisitActivityFieldDefinitions(key)
      .map((field) => field.key)
      .filter((fieldKey) => !STORE_VISIT_ACTIVITY_GENERIC_DETAIL_EXCLUDED_KEYS.has(fieldKey)) ||
    []
  const fieldSummaryBits = detailFieldKeys
    .map((fieldKey) => {
      const fieldValue = normalizedPayload.fields?.[fieldKey]
      if (!fieldValue) return null
      return formatStoreVisitActivityFieldValue(key, fieldKey, fieldValue)
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 2)

  summaryBits.push(...fieldSummaryBits)

  if (normalizedPayload.itemsChecked?.length) {
    const varianceCount = normalizedPayload.itemsChecked.filter((item) => {
      const delta = getStoreVisitCountedItemDelta(item)
      return delta !== null && delta !== 0
    }).length
    const varianceValueTotal = normalizedPayload.itemsChecked.reduce((total, item) => {
      const varianceValue = getStoreVisitCountedItemVarianceValue(item)
      return varianceValue !== null ? total + varianceValue : total
    }, 0)

    summaryBits.push(
      `${normalizedPayload.itemsChecked.length} item check${normalizedPayload.itemsChecked.length === 1 ? '' : 's'} recorded${varianceCount > 0 ? `, ${varianceCount} variance${varianceCount === 1 ? '' : 's'} found` : ''}`
    )

    if (varianceValueTotal > 0) {
      summaryBits.push(`variance value ${formatStoreVisitCurrency(varianceValueTotal)}`)
    }
  }

  if (normalizedPayload.amountChecks?.length) {
    const mismatchCount = normalizedPayload.amountChecks.filter((item) => item.amountMatches === false).length
    summaryBits.push(
      `${normalizedPayload.amountChecks.length} cash check${normalizedPayload.amountChecks.length === 1 ? '' : 's'} recorded${mismatchCount > 0 ? `, ${mismatchCount} mismatch${mismatchCount === 1 ? '' : 'es'} found` : ''}`
    )
  }

  if (
    normalizedPayload.amountConfirmed !== null &&
    normalizedPayload.amountConfirmed !== undefined &&
    (option?.formVariant === 'cash-check' || option?.formVariant === 'internal-theft')
  ) {
    summaryBits.push(
      normalizedPayload.amountConfirmed ? 'Correct amount confirmed' : 'Amount discrepancy found'
    )
  }

  if (summaryBits.length === 0 && key === 'other') {
    return undefined
  }

  return summaryBits.join(' • ') || undefined
}

export interface VisitNeedActionInput {
  title?: string | null
  description?: string | null
  sourceFlaggedItem?: string | null
  priority?: string | null
  status?: string | null
  dueDate?: string | null
  createdAt?: string | null
}

export interface VisitNeedIncidentInput {
  summary?: string | null
  description?: string | null
  category?: string | null
  severity?: string | null
  status?: string | null
  occurredAt?: string | null
}

export interface StoreVisitNeedDriver {
  label: string
  points: number
  source: 'action' | 'incident' | 'mitigation'
}

export interface StoreVisitNeedAssessment {
  score: number
  level: StoreVisitNeedLevel
  needsVisit: boolean
  reasons: string[]
  drivers: StoreVisitNeedDriver[]
  relevantActionCount: number
  relevantIncidentCount: number
}

interface ComputeStoreVisitNeedInput {
  actions: VisitNeedActionInput[]
  incidents: VisitNeedIncidentInput[]
  lastVisitAt?: string | null
  nextPlannedVisitDate?: string | null
  now?: string | Date
}

type RiskRule = {
  label: string
  points: number
  pattern: RegExp
}

const ACTION_RISK_RULES: RiskRule[] = [
  {
    label: 'Internal theft or fraud risk is open',
    points: 34,
    pattern: /\b(internal theft|employee theft|dishonesty|fraud|refund abuse|void abuse)\b/i,
  },
  {
    label: 'High theft or shrink concern is open',
    points: 28,
    pattern: /\b(high theft|theft|shoplift|shoplifting|shrink|stock loss|stock discrepancy)\b/i,
  },
  {
    label: 'Banking discrepancy or cash control issue is open',
    points: 26,
    pattern: /\b(banking|bank discrepancy|cash discrepancy|cash loss|cash handling|deposit|safe count)\b/i,
  },
  {
    label: 'Till control issue is open',
    points: 20,
    pattern: /\b(till discrepancy|till check|cash drawer|till|tender control)\b/i,
  },
  {
    label: 'Security system or CCTV issue is open',
    points: 18,
    pattern: /\b(cctv|alarm|security gate|eas|tagging|door guard|security system)\b/i,
  },
  {
    label: 'Line check or store-floor control issue is open',
    points: 14,
    pattern: /\b(line check|line checks|receipt check|queue control|floorwalk|floor walk)\b/i,
  },
  {
    label: 'Internal theft or interview-led follow-up is open',
    points: 24,
    pattern: /\b(internal theft interview|internal theft|employee theft interview|disciplinary interview|investigation interview)\b/i,
  },
  {
    label: 'Investigation support is still required',
    points: 16,
    pattern: /\b(investigation|investigations|interview|statement|case file)\b/i,
  },
]

const INCIDENT_RISK_RULES: RiskRule[] = [
  {
    label: 'Security incident needs follow-up',
    points: 22,
    pattern: /\b(security|theft|shoplift|shoplifting|burglary|robbery|fraud|assault|violence)\b/i,
  },
  {
    label: 'Cash handling incident needs follow-up',
    points: 20,
    pattern: /\b(banking|cash|deposit|safe|till discrepancy|cash loss)\b/i,
  },
  {
    label: 'Investigation-led incident needs support',
    points: 16,
    pattern: /\b(investigation|interview|witness|statement|disciplinary)\b/i,
  },
]

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysSince(value: string | Date | null | undefined, now: Date): number | null {
  const parsed = parseDate(value)
  if (!parsed) return null
  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
}

function daysUntil(value: string | Date | null | undefined, now: Date): number | null {
  const parsed = parseDate(value)
  if (!parsed) return null
  return Math.ceil((parsed.getTime() - now.getTime()) / 86_400_000)
}

function clampScore(value: number): number {
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

function normalizeText(...values: Array<string | null | undefined>): string {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
}

function isActionOpen(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized !== 'complete' && normalized !== 'cancelled'
}

function isIncidentOpen(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return !['closed', 'cancelled'].includes(normalized)
}

function getActionPriorityBonus(priority: string | null | undefined): number {
  const normalized = String(priority || '').trim().toLowerCase()
  if (normalized === 'urgent') return 10
  if (normalized === 'high') return 6
  if (normalized === 'medium') return 2
  return 0
}

function getIncidentSeverityBonus(severity: string | null | undefined): number {
  const normalized = String(severity || '').trim().toLowerCase()
  if (normalized === 'critical') return 16
  if (normalized === 'high') return 10
  if (normalized === 'medium') return 4
  return 0
}

function findHighestRule(text: string, rules: RiskRule[]): RiskRule | null {
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      return rule
    }
  }
  return null
}

export function getStoreVisitTypeLabel(value: StoreVisitType): string {
  return STORE_VISIT_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'Visit'
}

export function getStoreVisitActivityLabel(value: StoreVisitActivityKey): string {
  return STORE_VISIT_ACTIVITY_OPTIONS.find((option) => option.key === value)?.label || value
}

export function getStoreVisitNeedLevelLabel(level: StoreVisitNeedLevel): string {
  if (level === 'urgent') return 'Urgent'
  if (level === 'needed') return 'Visit Needed'
  if (level === 'monitor') return 'Monitor'
  return 'No Current Need'
}

export function computeStoreVisitNeed({
  actions,
  incidents,
  lastVisitAt,
  nextPlannedVisitDate,
  now = new Date(),
}: ComputeStoreVisitNeedInput): StoreVisitNeedAssessment {
  const referenceDate = parseDate(now) || new Date()
  const positiveDrivers: StoreVisitNeedDriver[] = []
  const mitigationDrivers: StoreVisitNeedDriver[] = []

  const openActions = actions.filter((action) => isActionOpen(action.status))
  const openIncidents = incidents.filter((incident) => isIncidentOpen(incident.status))

  let relevantActionCount = 0
  let relevantIncidentCount = 0

  for (const action of openActions) {
    const combined = normalizeText(action.title, action.sourceFlaggedItem, action.description)
    const highestRule = findHighestRule(combined, ACTION_RISK_RULES)
    const priorityBonus = getActionPriorityBonus(action.priority)
    const overdueDays = daysSince(action.dueDate, referenceDate)
    const isOverdue = overdueDays !== null && overdueDays > 0

    if (highestRule) {
      positiveDrivers.push({
        label: highestRule.label,
        points: highestRule.points,
        source: 'action',
      })
      relevantActionCount += 1
    }

    if (priorityBonus > 0) {
      positiveDrivers.push({
        label: normalizedPriorityLabel(action.priority),
        points: priorityBonus,
        source: 'action',
      })
    }

    if (isOverdue) {
      positiveDrivers.push({
        label: 'Overdue open LP action is still unresolved',
        points: 6,
        source: 'action',
      })
    }
  }

  for (const incident of openIncidents) {
    const combined = normalizeText(incident.category, incident.summary, incident.description)
    const highestRule = findHighestRule(combined, INCIDENT_RISK_RULES)
    const severityBonus = getIncidentSeverityBonus(incident.severity)

    if (highestRule) {
      positiveDrivers.push({
        label: highestRule.label,
        points: highestRule.points,
        source: 'incident',
      })
      relevantIncidentCount += 1
    }

    if (String(incident.category || '').trim().toLowerCase() === 'security') {
      positiveDrivers.push({
        label: 'Open security incident is active at the store',
        points: 8,
        source: 'incident',
      })
      relevantIncidentCount += 1
    }

    if (severityBonus > 0) {
      positiveDrivers.push({
        label: normalizedSeverityLabel(incident.severity),
        points: severityBonus,
        source: 'incident',
      })
    }
  }

  if (relevantActionCount > 1) {
    positiveDrivers.push({
      label: 'Multiple LP actions are open at the store',
      points: Math.min(18, (relevantActionCount - 1) * 4),
      source: 'action',
    })
  }

  if (relevantIncidentCount > 1) {
    positiveDrivers.push({
      label: 'Multiple incidents are driving follow-up',
      points: Math.min(18, (relevantIncidentCount - 1) * 6),
      source: 'incident',
    })
  }

  const daysFromLastVisit = daysSince(lastVisitAt, referenceDate)
  if (daysFromLastVisit !== null) {
    if (daysFromLastVisit <= 7) {
      mitigationDrivers.push({
        label: 'Store was visited in the last 7 days',
        points: -20,
        source: 'mitigation',
      })
    } else if (daysFromLastVisit <= 14) {
      mitigationDrivers.push({
        label: 'Store was visited in the last 14 days',
        points: -14,
        source: 'mitigation',
      })
    } else if (daysFromLastVisit <= 30) {
      mitigationDrivers.push({
        label: 'Store was visited in the last 30 days',
        points: -8,
        source: 'mitigation',
      })
    }
  }

  const daysToPlannedVisit = daysUntil(nextPlannedVisitDate, referenceDate)
  if (daysToPlannedVisit !== null && daysToPlannedVisit >= 0) {
    if (daysToPlannedVisit <= 7) {
      mitigationDrivers.push({
        label: 'A visit is already planned within 7 days',
        points: -14,
        source: 'mitigation',
      })
    } else if (daysToPlannedVisit <= 14) {
      mitigationDrivers.push({
        label: 'A visit is already planned within 14 days',
        points: -8,
        source: 'mitigation',
      })
    }
  }

  const drivers = [...positiveDrivers, ...mitigationDrivers]
  const score = clampScore(drivers.reduce((total, driver) => total + driver.points, 0))

  let level: StoreVisitNeedLevel = 'none'
  if (score >= 70) level = 'urgent'
  else if (score >= 40) level = 'needed'
  else if (score >= 15) level = 'monitor'

  const reasons = Array.from(
    new Set(
      positiveDrivers
        .sort((a, b) => b.points - a.points)
        .map((driver) => driver.label)
    )
  ).slice(0, 3)

  return {
    score,
    level,
    needsVisit: level === 'urgent' || level === 'needed',
    reasons,
    drivers,
    relevantActionCount,
    relevantIncidentCount,
  }
}

function normalizedPriorityLabel(priority: string | null | undefined): string {
  const normalized = String(priority || '').trim().toLowerCase()
  if (normalized === 'urgent') return 'Urgent action is open'
  if (normalized === 'high') return 'High-priority action is open'
  if (normalized === 'medium') return 'Medium-priority action is open'
  return 'Open action is active'
}

function normalizedSeverityLabel(severity: string | null | undefined): string {
  const normalized = String(severity || '').trim().toLowerCase()
  if (normalized === 'critical') return 'Critical incident severity is active'
  if (normalized === 'high') return 'High-severity incident is active'
  if (normalized === 'medium') return 'Medium-severity incident is active'
  return 'Incident is active'
}
