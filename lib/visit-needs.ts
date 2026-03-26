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

export interface StoreVisitActivityFieldDefinition {
  key: string
  label: string
  placeholder: string
  input: 'text' | 'textarea'
}

export interface StoreVisitActivityOption {
  key: string
  label: string
  description: string
  detailPlaceholder: string
  formVariant: 'structured' | 'line-check' | 'cash-check'
  evidenceLabel: string
  fields?: readonly StoreVisitActivityFieldDefinition[]
  detailFieldKeys?: readonly string[]
  legacyFieldMap?: Partial<Record<StoreVisitLegacyPayloadField, string>>
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
      {
        key: 'bankingReference',
        label: 'Banking reference',
        placeholder: 'Deposit number, bag reference, banking slip...',
        input: 'text',
      },
      {
        key: 'bankingItemsChecked',
        label: 'Banking items checked',
        placeholder: 'List the bags, envelopes, safe contents, or deposits reviewed.',
        input: 'textarea',
      },
      {
        key: 'paperworkReviewed',
        label: 'Paperwork reviewed',
        placeholder: 'Banking sheet, handover log, pay-in slips, safe records...',
        input: 'textarea',
      },
      {
        key: 'discrepancyAction',
        label: 'Discrepancy notes / action taken',
        placeholder: 'Record any shortfall, overage, missing paperwork, or action taken on site.',
        input: 'textarea',
      },
    ],
    detailFieldKeys: ['bankingItemsChecked', 'discrepancyAction', 'bankingReference'],
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
    description: 'Checked tills, tills balances, or cash handling controls.',
    detailPlaceholder: 'Record which tills were checked, any variances found, and what was actioned on site.',
    formVariant: 'cash-check',
    evidenceLabel: 'Till document',
    fields: [
      {
        key: 'tillsChecked',
        label: 'Tills checked',
        placeholder: 'List the tills, floats, or terminals reviewed.',
        input: 'textarea',
      },
      {
        key: 'cashControlsReviewed',
        label: 'Cash controls reviewed',
        placeholder: 'Describe the till processes or controls checked during the visit.',
        input: 'textarea',
      },
      {
        key: 'varianceAction',
        label: 'Variance / action taken',
        placeholder: 'Record mismatches found and what was done on site.',
        input: 'textarea',
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
  },
  {
    key: 'supported_investigation',
    label: 'Investigation work',
    description: 'Supported or progressed a theft, fraud, or conduct investigation.',
    detailPlaceholder: 'Add the investigation context, evidence reviewed, and next actions agreed.',
    formVariant: 'structured',
    evidenceLabel: 'Investigation evidence',
    fields: [
      {
        key: 'caseReference',
        label: 'Case reference',
        placeholder: 'Incident, case, or investigation reference...',
        input: 'text',
      },
      {
        key: 'investigationFocus',
        label: 'Investigation focus',
        placeholder: 'What allegation, loss event, or concern was investigated?',
        input: 'textarea',
      },
      {
        key: 'evidenceReviewed',
        label: 'Evidence reviewed',
        placeholder: 'CCTV, till records, statements, refunds, stock movements...',
        input: 'textarea',
      },
      {
        key: 'workCompleted',
        label: 'Work completed on site',
        placeholder: 'Explain what the LP officer did during the visit.',
        input: 'textarea',
      },
      {
        key: 'outcomeOrEscalation',
        label: 'Outcome / escalation',
        placeholder: 'Record the current outcome or who it was escalated to.',
        input: 'textarea',
      },
    ],
    detailFieldKeys: ['investigationFocus', 'workCompleted', 'caseReference'],
    legacyFieldMap: {
      summary: 'investigationFocus',
      findings: 'evidenceReviewed',
      actionsTaken: 'workCompleted',
      nextSteps: 'outcomeOrEscalation',
      peopleInvolved: 'outcomeOrEscalation',
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
      {
        key: 'systemsChecked',
        label: 'Systems checked',
        placeholder: 'Which cameras, alarm points, DVRs, or panic systems were reviewed?',
        input: 'textarea',
      },
      {
        key: 'areasReviewed',
        label: 'Areas reviewed',
        placeholder: 'Sales floor, till area, stockroom, entrance, fire exit...',
        input: 'textarea',
      },
      {
        key: 'faultsFound',
        label: 'Faults / blind spots found',
        placeholder: 'Record any dead cameras, blind spots, alarm faults, or usage issues.',
        input: 'textarea',
      },
      {
        key: 'actionsAgreed',
        label: 'Action agreed',
        placeholder: 'Training given, engineer callout, escalation, or immediate fix.',
        input: 'textarea',
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
      {
        key: 'controlsChecked',
        label: 'Controls checked',
        placeholder: 'Tagging, cabinet locking, tester control, refund control, stockroom security...',
        input: 'textarea',
      },
      {
        key: 'hotspotsReviewed',
        label: 'Hotspots reviewed',
        placeholder: 'Which theft hotspots or risk areas were checked?',
        input: 'textarea',
      },
      {
        key: 'weaknessesFound',
        label: 'Weaknesses found',
        placeholder: 'Record the control gaps or standards missed.',
        input: 'textarea',
      },
      {
        key: 'correctiveAction',
        label: 'Corrective action agreed',
        placeholder: 'What was fixed on site or agreed with the team?',
        input: 'textarea',
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
    key: 'conducted_stop_on_close',
    label: 'Stop on close',
    description: 'Completed an end-of-day stop-on-close review with the store team.',
    detailPlaceholder: 'Record who was present, what was checked at close, and any concerns identified.',
    formVariant: 'structured',
    evidenceLabel: 'Stop-on-close evidence',
    fields: [
      {
        key: 'teamPresent',
        label: 'Team present',
        placeholder: 'Manager, keyholder, staff members, guard...',
        input: 'text',
      },
      {
        key: 'closingChecksCompleted',
        label: 'Closing checks completed',
        placeholder: 'Cash secure, doors checked, stockroom clear, alarm set, keys controlled...',
        input: 'textarea',
      },
      {
        key: 'issuesAtClose',
        label: 'Issues found at close',
        placeholder: 'Record any missed steps, unsecured stock, or process breaches.',
        input: 'textarea',
      },
      {
        key: 'actionsBeforeLeaving',
        label: 'Actions before leaving',
        placeholder: 'What was corrected or agreed before the store closed?',
        input: 'textarea',
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
      {
        key: 'caseReference',
        label: 'Case reference',
        placeholder: 'Incident, statement, or HR reference...',
        input: 'text',
      },
      {
        key: 'peopleSpokenTo',
        label: 'People spoken to',
        placeholder: 'Who provided a statement or interview on site?',
        input: 'text',
      },
      {
        key: 'statementPurpose',
        label: 'Statement purpose',
        placeholder: 'What was the statement or interview for?',
        input: 'textarea',
      },
      {
        key: 'keyPointsCaptured',
        label: 'Key points captured',
        placeholder: 'Summarise the main account or evidence captured.',
        input: 'textarea',
      },
      {
        key: 'followUpRequired',
        label: 'Follow-up required',
        placeholder: 'Any next interviews, witness requests, or paperwork still needed.',
        input: 'textarea',
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
      {
        key: 'paperworkChecked',
        label: 'Paperwork / processes checked',
        placeholder: 'Weekly paperwork, refunds, damages, deliveries, stockroom process...',
        input: 'textarea',
      },
      {
        key: 'areasReviewed',
        label: 'Areas reviewed',
        placeholder: 'Back office, till point, stockroom, manager files...',
        input: 'textarea',
      },
      {
        key: 'nonComplianceFound',
        label: 'Non-compliance found',
        placeholder: 'Record any missing paperwork or process breaches.',
        input: 'textarea',
      },
      {
        key: 'correctionsMade',
        label: 'Corrections made / agreed',
        placeholder: 'What was corrected on site or agreed with the store team?',
        input: 'textarea',
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
      {
        key: 'stockAreaReviewed',
        label: 'Stock area / category reviewed',
        placeholder: 'What stock line, area, or category was reviewed?',
        input: 'textarea',
      },
      {
        key: 'lossIssueReviewed',
        label: 'Loss issue reviewed',
        placeholder: 'Explain the shrink trend, adjustment issue, or count concern.',
        input: 'textarea',
      },
      {
        key: 'countFindings',
        label: 'Count findings',
        placeholder: 'Record the main variances or count findings.',
        input: 'textarea',
      },
      {
        key: 'actionEscalated',
        label: 'Action / escalation',
        placeholder: 'What was actioned or escalated after the review?',
        input: 'textarea',
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
      {
        key: 'deliveryReference',
        label: 'Delivery reference',
        placeholder: 'Delivery note, carrier reference, parcel ID...',
        input: 'text',
      },
      {
        key: 'issueReviewed',
        label: 'Issue reviewed',
        placeholder: 'What was wrong with the delivery or parcel?',
        input: 'textarea',
      },
      {
        key: 'affectedItems',
        label: 'Affected items',
        placeholder: 'List the missing, damaged, or tampered stock.',
        input: 'textarea',
      },
      {
        key: 'actionsTaken',
        label: 'Action taken',
        placeholder: 'What was done on site or who was notified?',
        input: 'textarea',
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
      {
        key: 'proceduresChecked',
        label: 'Procedures checked',
        placeholder: 'Search policy, key control, guard deployment, opening / closing...',
        input: 'textarea',
      },
      {
        key: 'weaknessesFound',
        label: 'Weaknesses found',
        placeholder: 'Record any missed steps or security weaknesses found.',
        input: 'textarea',
      },
      {
        key: 'actionsAgreed',
        label: 'Action agreed',
        placeholder: 'Training, escalation, or immediate changes agreed with the store.',
        input: 'textarea',
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
      {
        key: 'topicCovered',
        label: 'Topic covered',
        placeholder: 'What control, process, or LP topic was covered?',
        input: 'text',
      },
      {
        key: 'deliveredTo',
        label: 'Delivered to',
        placeholder: 'Manager, keyholder, whole team...',
        input: 'text',
      },
      {
        key: 'guidanceGiven',
        label: 'Guidance given',
        placeholder: 'Describe the coaching or support delivered on site.',
        input: 'textarea',
      },
      {
        key: 'followUpNeeded',
        label: 'Follow-up needed',
        placeholder: 'Any return visit, manager action, or further training needed.',
        input: 'textarea',
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
      {
        key: 'details',
        label: 'Details',
        placeholder: 'Describe the additional work completed on site.',
        input: 'textarea',
      },
    ],
    detailFieldKeys: ['details'],
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
  return getStoreVisitActivityOption(activityKey)?.fields || []
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
    if (allowedFieldKeySet && !allowedFieldKeySet.has(key)) {
      return fields
    }

    const value = normalizeOptionalText(rawValue)
    if (value) {
      fields[key] = value
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
    option?.fields?.map((field) => field.key) ||
    []
  const fieldSummaryBits = detailFieldKeys
    .map((fieldKey) => normalizedPayload.fields?.[fieldKey])
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
    option?.formVariant === 'cash-check'
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
