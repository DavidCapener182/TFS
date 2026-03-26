export type VisitReportType = 'targeted_theft_visit'

export type VisitReportStatus = 'draft' | 'final'

export type VisitReportRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface VisitReportStoreOption {
  id: string
  storeName: string
  storeCode: string | null
  region: string | null
  city: string | null
}

export interface TargetedTheftVisitPayload {
  preparedBy: string
  visitDate: string
  timeIn: string
  timeOut: string
  storeManager: string
  incidentOverview: {
    incidentCount: string
    datesTimesRecorded: boolean
    sameOffendersSuspected: boolean
    violenceInvolved: boolean
    summary: string
    primaryProducts: string
    entryPoint: string
    durationSeconds: string
  }
  storeLayoutExposure: {
    highValueVisibleFromEntrance: boolean
    highValueReachableWithinFiveSeconds: boolean
    counterLeanOverAccess: boolean
    counterBypassPossible: boolean
    clearEscapeRouteBehindCounter: boolean
    observations: string
  }
  productControlMeasures: {
    testersUsedInsteadOfLiveStock: boolean
    emptyBoxesUsedForDisplay: boolean
    highValueStockReducedOnShopFloor: boolean
    fsduPositionedNearTill: boolean
    excessStockRemovedFromDisplay: boolean
    atRiskSkus: string
    recommendations: string
  }
  staffPositioningBehaviour: {
    staffFacingEntrance: boolean
    immediateGreetingInPlace: boolean
    staffAwareOfGroupEntryRisks: boolean
    staffMaintainVisibility: boolean
    observedBehaviour: string
  }
  staffSafetyResponse: {
    staffUnderstandDoNotEngage: boolean
    noPhysicalInterventionObserved: boolean
    clearEscalationProcessInPlace: boolean
    policeReportingProcedureUnderstood: boolean
    incidentLoggingProcedureFollowed: boolean
    responseDescription: string
  }
  cctvSurveillance: {
    entranceCoveredClearly: boolean
    tillAreaCovered: boolean
    highValueAreasCovered: boolean
    facialIdentificationPossible: boolean
    cameraAnglesAppropriate: boolean
    issuesIdentified: string
  }
  communicationRadioUse: {
    radioPresentAndWorking: boolean
    staffTrainedOnRadioUsage: boolean
    nearbyStoreCommunicationActive: boolean
    earlyWarningSystemInPlace: boolean
    effectiveness: string
  }
  environmentalExternalFactors: {
    nearbyStoresAlsoTargeted: boolean
    shoppingCentreSecurityEngaged: boolean
    offenderDescriptionsShared: boolean
    peakRiskTimesIdentified: boolean
    externalRisks: string
  }
  immediateActionsTaken: {
    highRiskStockRemoved: boolean
    stockRepositionedBehindCounter: boolean
    staffBriefedOnSafetyProcedures: boolean
    entryAwarenessProtocolImplemented: boolean
    storeLayoutAdjustedWherePossible: boolean
    actionsCompleted: string
  }
  recommendations: {
    physical: {
      counterModificationsRequired: boolean
      lockableStorageRequired: boolean
      additionalSecurityPresenceRecommended: boolean
    }
    operational: {
      staffTrainingRequired: boolean
      improvedIncidentLoggingRequired: boolean
      revisedProceduresRequired: boolean
    }
    intelligence: {
      offenderInformationSharingRequired: boolean
      liaisonWithCentreSecurityRequired: boolean
      policeEngagementRequired: boolean
    }
    deterrence: {
      highValueStockSignageRecommended: boolean
      strongStaffEngagementOnEntryRequired: boolean
    }
    details: string
  }
  riskRating: VisitReportRiskLevel | ''
  riskJustification: string
  signOff: {
    visitedBy: string
    storeRepresentative: string
  }
}

export interface VisitReportRecord {
  id: string
  storeId: string
  storeName: string
  storeCode: string | null
  reportType: VisitReportType
  status: VisitReportStatus
  title: string
  summary: string | null
  visitDate: string
  riskRating: VisitReportRiskLevel | ''
  payload: TargetedTheftVisitPayload
  createdAt: string
  updatedAt: string
  createdByName: string | null
}

export const VISIT_REPORT_TYPE_OPTIONS: Array<{
  value: VisitReportType
  label: string
  description: string
}> = [
  {
    value: 'targeted_theft_visit',
    label: 'Targeted Theft Visit Report',
    description:
      'Structured LP visit report for repeat theft, violence escalation, layout exposure, staff response, and immediate actions.',
  },
]

function normalizeBoolean(value: unknown): boolean {
  return value === true
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeRiskLevel(value: unknown): VisitReportRiskLevel | '' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
    return normalized
  }
  return ''
}

export function getVisitReportTypeLabel(value: VisitReportType): string {
  return VISIT_REPORT_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'Visit Report'
}

export function getEmptyTargetedTheftVisitPayload(
  preparedBy: string | null | undefined,
  referenceDate = new Date()
): TargetedTheftVisitPayload {
  return {
    preparedBy: '',
    visitDate: referenceDate.toISOString().slice(0, 10),
    timeIn: '',
    timeOut: '',
    storeManager: '',
    incidentOverview: {
      incidentCount: '',
      datesTimesRecorded: false,
      sameOffendersSuspected: false,
      violenceInvolved: false,
      summary: '',
      primaryProducts: '',
      entryPoint: '',
      durationSeconds: '',
    },
    storeLayoutExposure: {
      highValueVisibleFromEntrance: false,
      highValueReachableWithinFiveSeconds: false,
      counterLeanOverAccess: false,
      counterBypassPossible: false,
      clearEscapeRouteBehindCounter: false,
      observations: '',
    },
    productControlMeasures: {
      testersUsedInsteadOfLiveStock: false,
      emptyBoxesUsedForDisplay: false,
      highValueStockReducedOnShopFloor: false,
      fsduPositionedNearTill: false,
      excessStockRemovedFromDisplay: false,
      atRiskSkus: '',
      recommendations: '',
    },
    staffPositioningBehaviour: {
      staffFacingEntrance: false,
      immediateGreetingInPlace: false,
      staffAwareOfGroupEntryRisks: false,
      staffMaintainVisibility: false,
      observedBehaviour: '',
    },
    staffSafetyResponse: {
      staffUnderstandDoNotEngage: false,
      noPhysicalInterventionObserved: false,
      clearEscalationProcessInPlace: false,
      policeReportingProcedureUnderstood: false,
      incidentLoggingProcedureFollowed: false,
      responseDescription: '',
    },
    cctvSurveillance: {
      entranceCoveredClearly: false,
      tillAreaCovered: false,
      highValueAreasCovered: false,
      facialIdentificationPossible: false,
      cameraAnglesAppropriate: false,
      issuesIdentified: '',
    },
    communicationRadioUse: {
      radioPresentAndWorking: false,
      staffTrainedOnRadioUsage: false,
      nearbyStoreCommunicationActive: false,
      earlyWarningSystemInPlace: false,
      effectiveness: '',
    },
    environmentalExternalFactors: {
      nearbyStoresAlsoTargeted: false,
      shoppingCentreSecurityEngaged: false,
      offenderDescriptionsShared: false,
      peakRiskTimesIdentified: false,
      externalRisks: '',
    },
    immediateActionsTaken: {
      highRiskStockRemoved: false,
      stockRepositionedBehindCounter: false,
      staffBriefedOnSafetyProcedures: false,
      entryAwarenessProtocolImplemented: false,
      storeLayoutAdjustedWherePossible: false,
      actionsCompleted: '',
    },
    recommendations: {
      physical: {
        counterModificationsRequired: false,
        lockableStorageRequired: false,
        additionalSecurityPresenceRecommended: false,
      },
      operational: {
        staffTrainingRequired: false,
        improvedIncidentLoggingRequired: false,
        revisedProceduresRequired: false,
      },
      intelligence: {
        offenderInformationSharingRequired: false,
        liaisonWithCentreSecurityRequired: false,
        policeEngagementRequired: false,
      },
      deterrence: {
        highValueStockSignageRecommended: false,
        strongStaffEngagementOnEntryRequired: false,
      },
      details: '',
    },
    riskRating: '',
    riskJustification: '',
    signOff: {
      visitedBy: '',
      storeRepresentative: '',
    },
  }
}

export function normalizeTargetedTheftVisitPayload(
  input: unknown,
  preparedBy?: string | null
): TargetedTheftVisitPayload {
  const defaults = getEmptyTargetedTheftVisitPayload(preparedBy)

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaults
  }

  const payload = input as Record<string, unknown>
  const incidentOverview =
    payload.incidentOverview && typeof payload.incidentOverview === 'object' && !Array.isArray(payload.incidentOverview)
      ? (payload.incidentOverview as Record<string, unknown>)
      : {}
  const storeLayoutExposure =
    payload.storeLayoutExposure && typeof payload.storeLayoutExposure === 'object' && !Array.isArray(payload.storeLayoutExposure)
      ? (payload.storeLayoutExposure as Record<string, unknown>)
      : {}
  const productControlMeasures =
    payload.productControlMeasures && typeof payload.productControlMeasures === 'object' && !Array.isArray(payload.productControlMeasures)
      ? (payload.productControlMeasures as Record<string, unknown>)
      : {}
  const staffPositioningBehaviour =
    payload.staffPositioningBehaviour && typeof payload.staffPositioningBehaviour === 'object' && !Array.isArray(payload.staffPositioningBehaviour)
      ? (payload.staffPositioningBehaviour as Record<string, unknown>)
      : {}
  const staffSafetyResponse =
    payload.staffSafetyResponse && typeof payload.staffSafetyResponse === 'object' && !Array.isArray(payload.staffSafetyResponse)
      ? (payload.staffSafetyResponse as Record<string, unknown>)
      : {}
  const cctvSurveillance =
    payload.cctvSurveillance && typeof payload.cctvSurveillance === 'object' && !Array.isArray(payload.cctvSurveillance)
      ? (payload.cctvSurveillance as Record<string, unknown>)
      : {}
  const communicationRadioUse =
    payload.communicationRadioUse && typeof payload.communicationRadioUse === 'object' && !Array.isArray(payload.communicationRadioUse)
      ? (payload.communicationRadioUse as Record<string, unknown>)
      : {}
  const environmentalExternalFactors =
    payload.environmentalExternalFactors && typeof payload.environmentalExternalFactors === 'object' && !Array.isArray(payload.environmentalExternalFactors)
      ? (payload.environmentalExternalFactors as Record<string, unknown>)
      : {}
  const immediateActionsTaken =
    payload.immediateActionsTaken && typeof payload.immediateActionsTaken === 'object' && !Array.isArray(payload.immediateActionsTaken)
      ? (payload.immediateActionsTaken as Record<string, unknown>)
      : {}
  const recommendations =
    payload.recommendations && typeof payload.recommendations === 'object' && !Array.isArray(payload.recommendations)
      ? (payload.recommendations as Record<string, unknown>)
      : {}
  const recommendationsPhysical =
    recommendations.physical && typeof recommendations.physical === 'object' && !Array.isArray(recommendations.physical)
      ? (recommendations.physical as Record<string, unknown>)
      : {}
  const recommendationsOperational =
    recommendations.operational && typeof recommendations.operational === 'object' && !Array.isArray(recommendations.operational)
      ? (recommendations.operational as Record<string, unknown>)
      : {}
  const recommendationsIntelligence =
    recommendations.intelligence && typeof recommendations.intelligence === 'object' && !Array.isArray(recommendations.intelligence)
      ? (recommendations.intelligence as Record<string, unknown>)
      : {}
  const recommendationsDeterrence =
    recommendations.deterrence && typeof recommendations.deterrence === 'object' && !Array.isArray(recommendations.deterrence)
      ? (recommendations.deterrence as Record<string, unknown>)
      : {}
  const signOff =
    payload.signOff && typeof payload.signOff === 'object' && !Array.isArray(payload.signOff)
      ? (payload.signOff as Record<string, unknown>)
      : {}

  return {
    preparedBy: normalizeString(payload.preparedBy) || defaults.preparedBy,
    visitDate: normalizeString(payload.visitDate) || defaults.visitDate,
    timeIn: normalizeString(payload.timeIn),
    timeOut: normalizeString(payload.timeOut),
    storeManager: normalizeString(payload.storeManager),
    incidentOverview: {
      incidentCount: normalizeString(incidentOverview.incidentCount),
      datesTimesRecorded: normalizeBoolean(incidentOverview.datesTimesRecorded),
      sameOffendersSuspected: normalizeBoolean(incidentOverview.sameOffendersSuspected),
      violenceInvolved: normalizeBoolean(incidentOverview.violenceInvolved),
      summary: normalizeString(incidentOverview.summary),
      primaryProducts: normalizeString(incidentOverview.primaryProducts),
      entryPoint: normalizeString(incidentOverview.entryPoint),
      durationSeconds: normalizeString(incidentOverview.durationSeconds),
    },
    storeLayoutExposure: {
      highValueVisibleFromEntrance: normalizeBoolean(storeLayoutExposure.highValueVisibleFromEntrance),
      highValueReachableWithinFiveSeconds: normalizeBoolean(storeLayoutExposure.highValueReachableWithinFiveSeconds),
      counterLeanOverAccess: normalizeBoolean(storeLayoutExposure.counterLeanOverAccess),
      counterBypassPossible: normalizeBoolean(storeLayoutExposure.counterBypassPossible),
      clearEscapeRouteBehindCounter: normalizeBoolean(storeLayoutExposure.clearEscapeRouteBehindCounter),
      observations: normalizeString(storeLayoutExposure.observations),
    },
    productControlMeasures: {
      testersUsedInsteadOfLiveStock: normalizeBoolean(productControlMeasures.testersUsedInsteadOfLiveStock),
      emptyBoxesUsedForDisplay: normalizeBoolean(productControlMeasures.emptyBoxesUsedForDisplay),
      highValueStockReducedOnShopFloor: normalizeBoolean(productControlMeasures.highValueStockReducedOnShopFloor),
      fsduPositionedNearTill: normalizeBoolean(productControlMeasures.fsduPositionedNearTill),
      excessStockRemovedFromDisplay: normalizeBoolean(productControlMeasures.excessStockRemovedFromDisplay),
      atRiskSkus: normalizeString(productControlMeasures.atRiskSkus),
      recommendations: normalizeString(productControlMeasures.recommendations),
    },
    staffPositioningBehaviour: {
      staffFacingEntrance: normalizeBoolean(staffPositioningBehaviour.staffFacingEntrance),
      immediateGreetingInPlace: normalizeBoolean(staffPositioningBehaviour.immediateGreetingInPlace),
      staffAwareOfGroupEntryRisks: normalizeBoolean(staffPositioningBehaviour.staffAwareOfGroupEntryRisks),
      staffMaintainVisibility: normalizeBoolean(staffPositioningBehaviour.staffMaintainVisibility),
      observedBehaviour: normalizeString(staffPositioningBehaviour.observedBehaviour),
    },
    staffSafetyResponse: {
      staffUnderstandDoNotEngage: normalizeBoolean(staffSafetyResponse.staffUnderstandDoNotEngage),
      noPhysicalInterventionObserved: normalizeBoolean(staffSafetyResponse.noPhysicalInterventionObserved),
      clearEscalationProcessInPlace: normalizeBoolean(staffSafetyResponse.clearEscalationProcessInPlace),
      policeReportingProcedureUnderstood: normalizeBoolean(staffSafetyResponse.policeReportingProcedureUnderstood),
      incidentLoggingProcedureFollowed: normalizeBoolean(staffSafetyResponse.incidentLoggingProcedureFollowed),
      responseDescription: normalizeString(staffSafetyResponse.responseDescription),
    },
    cctvSurveillance: {
      entranceCoveredClearly: normalizeBoolean(cctvSurveillance.entranceCoveredClearly),
      tillAreaCovered: normalizeBoolean(cctvSurveillance.tillAreaCovered),
      highValueAreasCovered: normalizeBoolean(cctvSurveillance.highValueAreasCovered),
      facialIdentificationPossible: normalizeBoolean(cctvSurveillance.facialIdentificationPossible),
      cameraAnglesAppropriate: normalizeBoolean(cctvSurveillance.cameraAnglesAppropriate),
      issuesIdentified: normalizeString(cctvSurveillance.issuesIdentified),
    },
    communicationRadioUse: {
      radioPresentAndWorking: normalizeBoolean(communicationRadioUse.radioPresentAndWorking),
      staffTrainedOnRadioUsage: normalizeBoolean(communicationRadioUse.staffTrainedOnRadioUsage),
      nearbyStoreCommunicationActive: normalizeBoolean(communicationRadioUse.nearbyStoreCommunicationActive),
      earlyWarningSystemInPlace: normalizeBoolean(communicationRadioUse.earlyWarningSystemInPlace),
      effectiveness: normalizeString(communicationRadioUse.effectiveness),
    },
    environmentalExternalFactors: {
      nearbyStoresAlsoTargeted: normalizeBoolean(environmentalExternalFactors.nearbyStoresAlsoTargeted),
      shoppingCentreSecurityEngaged: normalizeBoolean(environmentalExternalFactors.shoppingCentreSecurityEngaged),
      offenderDescriptionsShared: normalizeBoolean(environmentalExternalFactors.offenderDescriptionsShared),
      peakRiskTimesIdentified: normalizeBoolean(environmentalExternalFactors.peakRiskTimesIdentified),
      externalRisks: normalizeString(environmentalExternalFactors.externalRisks),
    },
    immediateActionsTaken: {
      highRiskStockRemoved: normalizeBoolean(immediateActionsTaken.highRiskStockRemoved),
      stockRepositionedBehindCounter: normalizeBoolean(immediateActionsTaken.stockRepositionedBehindCounter),
      staffBriefedOnSafetyProcedures: normalizeBoolean(immediateActionsTaken.staffBriefedOnSafetyProcedures),
      entryAwarenessProtocolImplemented: normalizeBoolean(immediateActionsTaken.entryAwarenessProtocolImplemented),
      storeLayoutAdjustedWherePossible: normalizeBoolean(immediateActionsTaken.storeLayoutAdjustedWherePossible),
      actionsCompleted: normalizeString(immediateActionsTaken.actionsCompleted),
    },
    recommendations: {
      physical: {
        counterModificationsRequired: normalizeBoolean(recommendationsPhysical.counterModificationsRequired),
        lockableStorageRequired: normalizeBoolean(recommendationsPhysical.lockableStorageRequired),
        additionalSecurityPresenceRecommended: normalizeBoolean(recommendationsPhysical.additionalSecurityPresenceRecommended),
      },
      operational: {
        staffTrainingRequired: normalizeBoolean(recommendationsOperational.staffTrainingRequired),
        improvedIncidentLoggingRequired: normalizeBoolean(recommendationsOperational.improvedIncidentLoggingRequired),
        revisedProceduresRequired: normalizeBoolean(recommendationsOperational.revisedProceduresRequired),
      },
      intelligence: {
        offenderInformationSharingRequired: normalizeBoolean(recommendationsIntelligence.offenderInformationSharingRequired),
        liaisonWithCentreSecurityRequired: normalizeBoolean(recommendationsIntelligence.liaisonWithCentreSecurityRequired),
        policeEngagementRequired: normalizeBoolean(recommendationsIntelligence.policeEngagementRequired),
      },
      deterrence: {
        highValueStockSignageRecommended: normalizeBoolean(recommendationsDeterrence.highValueStockSignageRecommended),
        strongStaffEngagementOnEntryRequired: normalizeBoolean(recommendationsDeterrence.strongStaffEngagementOnEntryRequired),
      },
      details: normalizeString(recommendations.details),
    },
    riskRating: normalizeRiskLevel(payload.riskRating),
    riskJustification: normalizeString(payload.riskJustification),
    signOff: {
      visitedBy: normalizeString(signOff.visitedBy) || normalizeString(payload.preparedBy) || defaults.signOff.visitedBy,
      storeRepresentative: normalizeString(signOff.storeRepresentative),
    },
  }
}

export function buildVisitReportTitle(
  reportType: VisitReportType,
  storeName: string,
  visitDate: string
): string {
  const normalizedDate = visitDate || new Date().toISOString().slice(0, 10)
  return `${getVisitReportTypeLabel(reportType)} - ${storeName} - ${normalizedDate}`
}

function truncateText(value: string, maxLength = 120): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

export function buildTargetedTheftVisitSummary(
  payload: TargetedTheftVisitPayload
): string {
  const summaryParts: string[] = []

  if (payload.riskRating) {
    summaryParts.push(`Risk ${payload.riskRating.toUpperCase()}`)
  }

  if (payload.incidentOverview.incidentCount) {
    summaryParts.push(`${payload.incidentOverview.incidentCount} recent incident(s) reviewed`)
  }

  if (payload.incidentOverview.primaryProducts.trim()) {
    summaryParts.push(`Targeted products: ${truncateText(payload.incidentOverview.primaryProducts)}`)
  }

  if (payload.immediateActionsTaken.actionsCompleted.trim()) {
    summaryParts.push(`Immediate actions: ${truncateText(payload.immediateActionsTaken.actionsCompleted)}`)
  }

  if (payload.recommendations.details.trim()) {
    summaryParts.push(`Recommendations: ${truncateText(payload.recommendations.details)}`)
  }

  if (summaryParts.length === 0 && payload.incidentOverview.summary.trim()) {
    summaryParts.push(truncateText(payload.incidentOverview.summary))
  }

  return summaryParts.join(' • ')
}
