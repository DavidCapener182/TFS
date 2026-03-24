import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLatestHSAuditForStore } from '@/app/actions/fra-reports'
import { getAuditInstance } from '@/app/actions/safehub'
import { getStoreDataFromGoogleSearch } from '@/lib/fra/google-store-data-search'
import { getOpeningHoursFromSearch } from '@/lib/fra/opening-hours-search'
import {
  ensureLockedFraParserVariant,
  extractFraPdfDataFromText,
  type FraPdfExtractedData,
} from '@/lib/fra/pdf-parser'

export const dynamic = 'force-dynamic'

const SOURCE_QUESTIONS: Record<string, string> = {
  storeManager: 'Signature of Person in Charge of store at time of assessment.',
  conductedDate: 'Conducted on',
  assessmentStartTime: 'Conducted on (time portion, if present)',
  numberOfFloors: 'Number of floors (list ie Basement; Ground; 1st, 2nd in comments section)',
  squareFootage: 'Square Footage or Square Meterage of site',
  operatingHours: 'Web search from store details (not from H&S audit PDF)',
  firePanelLocation: 'Location of Fire Panel',
  firePanelFaults: 'Is panel free of faults',
  emergencyLightingSwitch: 'Location of Emergency Lighting Test Switch (Photograph)',
  escapeRoutesEvidence: 'Fire exit routes clear and unobstructed?',
  combustibleStorageEscapeCompromise: 'Combustible materials are stored correctly?',
  fireSafetyTrainingNarrative: 'H&S induction training onboarding up to date and at 100%? + H&S toolbox refresher training completed in the last 12 months...',
  fireDoorsCondition: 'Fire doors in a good condition? / Are fire door intumescent strips in place and intact? / Fire doors closed and not held open? / Fire doors are kept shut and not held open?',
  weeklyFireTests: 'Weekly Fire Tests carried out and documented?',
  emergencyLightingMonthlyTest: 'Evidence of Monthly Emergency Lighting test being conducted?',
  fireExtinguisherService: 'Fire Extinguisher Service?',
  managementReviewStatement: 'Management review statement / explicit sentence (e.g., "This assessment has been informed by...")',
  numberOfFireExits: 'Number of Fire Exits',
  totalStaffEmployed: 'Number of Staff employed at the site',
  maxStaffOnSite: 'Maximum number of staff working on site at any one time',
  youngPersonsCount: 'Number of Young persons (under the age of 18 yrs) employed at the site',
  fireDrillDate: 'Fire drill has been carried out in the past 6 months and records available on site?',
  patTestingStatus: 'PAT?',
  fixedWireTestDate: 'Fixed Electrical Wiring?',
  exitSignageCondition: 'Fire exit signage / exit sign condition statements in the audit PDF',
  compartmentationStatus: 'Structure found to be in a good condition... (missing ceiling tiles / gaps from area to area?)',
  extinguisherServiceDate: 'Fire Extinguisher Service?',
  callPointAccessibility: 'Are all call points clear and easily accessible',
}

async function getDirectPdfText(
  supabase: ReturnType<typeof createClient>,
  instanceId: string
): Promise<string | null> {
  const { data: responses } = await supabase
    .from('fa_audit_responses')
    .select('response_json')
    .eq('audit_instance_id', instanceId)

  for (const response of responses || []) {
    const text = response?.response_json?.fra_pdf_text
    if (typeof text === 'string' && text.trim()) {
      return text
    }
  }

  return null
}

async function enrichStoreFallbacks(
  extracted: FraPdfExtractedData,
  store: { store_name?: string | null; address_line_1?: string | null; city?: string | null } | null
) {
  if (!store?.store_name) return extracted

  try {
    const googleData = await getStoreDataFromGoogleSearch({
      storeName: store.store_name,
      address: store.address_line_1 || '',
      city: store.city || '',
    })

    let operatingHours = googleData.openingTimes
    if (!operatingHours) {
      operatingHours = await getOpeningHoursFromSearch({
        storeName: store.store_name,
        address: store.address_line_1 || '',
        city: store.city || '',
      })
    }

    extracted.operatingHours = operatingHours || null
    if (!extracted.squareFootage && googleData.squareFootage) {
      extracted.squareFootage = googleData.squareFootage
      extracted.squareFootageSource = 'WEB_SEARCH'
    }
  } catch (error) {
    console.error('[EXTRACT] Store search fallback failed:', error)
  }

  return extracted
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const instanceId = searchParams.get('instanceId')

    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    const fraInstance = await getAuditInstance(instanceId)
    if (!fraInstance || (fraInstance.fa_audit_templates as any)?.category !== 'fire_risk_assessment') {
      return NextResponse.json({ error: 'Invalid FRA audit instance' }, { status: 400 })
    }

    const store = fraInstance.fa_stores as any
    const storeId = store.id

    const directPdfText = await getDirectPdfText(supabase, instanceId)
    const hsAuditResult = await getLatestHSAuditForStore(storeId, instanceId)
    const pdfText = directPdfText || hsAuditResult.pdfText

    let pdfExtractedData: FraPdfExtractedData = {}
    if (pdfText) {
      const parserVariant = await ensureLockedFraParserVariant({
        supabase,
        instanceId,
        userId: user.id,
      })
      pdfExtractedData = extractFraPdfDataFromText(pdfText, { variant: parserVariant })
      pdfExtractedData = await enrichStoreFallbacks(pdfExtractedData, store)
    }

    const extractedData = {
      storeManager: pdfExtractedData.storeManager || null,
      assessmentStartTime: pdfExtractedData.assessmentStartTime || null,
      firePanelLocation: pdfExtractedData.firePanelLocation || null,
      firePanelFaults: pdfExtractedData.firePanelFaults || null,
      emergencyLightingSwitch: pdfExtractedData.emergencyLightingSwitch || null,
      numberOfFloors: pdfExtractedData.numberOfFloors || null,
      operatingHours: pdfExtractedData.operatingHours || null,
      conductedDate: pdfExtractedData.conductedDate || null,
      squareFootage: pdfExtractedData.squareFootage || null,
      escapeRoutesEvidence: pdfExtractedData.escapeRoutesEvidence || null,
      combustibleStorageEscapeCompromise: pdfExtractedData.combustibleStorageEscapeCompromise || null,
      fireSafetyTrainingNarrative: pdfExtractedData.fireSafetyTrainingNarrative || null,
      fireDoorsCondition: pdfExtractedData.fireDoorsCondition || null,
      weeklyFireTests: pdfExtractedData.weeklyFireTests || null,
      emergencyLightingMonthlyTest: pdfExtractedData.emergencyLightingMonthlyTest || null,
      fireExtinguisherService: pdfExtractedData.fireExtinguisherService || null,
      managementReviewStatement: pdfExtractedData.managementReviewStatement || null,
      numberOfFireExits: pdfExtractedData.numberOfFireExits || null,
      totalStaffEmployed: pdfExtractedData.totalStaffEmployed || null,
      maxStaffOnSite: pdfExtractedData.maxStaffOnSite || null,
      youngPersonsCount: pdfExtractedData.youngPersonsCount || null,
      fireDrillDate: pdfExtractedData.fireDrillDate || null,
      patTestingStatus: pdfExtractedData.patTestingStatus || null,
      fixedWireTestDate: pdfExtractedData.fixedWireTestDate || null,
      exitSignageCondition: pdfExtractedData.exitSignageCondition || null,
      compartmentationStatus: pdfExtractedData.compartmentationStatus || null,
      extinguisherServiceDate: pdfExtractedData.extinguisherServiceDate || null,
      callPointAccessibility: pdfExtractedData.callPointAccessibility || null,
      sources: {
        storeManager: pdfExtractedData.storeManager ? 'PDF' : 'NOT_FOUND',
        assessmentStartTime: pdfExtractedData.assessmentStartTime ? 'PDF' : 'NOT_FOUND',
        firePanelLocation: pdfExtractedData.firePanelLocation ? 'PDF' : 'NOT_FOUND',
        firePanelFaults: pdfExtractedData.firePanelFaults ? 'PDF' : 'NOT_FOUND',
        emergencyLightingSwitch: pdfExtractedData.emergencyLightingSwitch ? 'PDF' : 'NOT_FOUND',
        numberOfFloors: pdfExtractedData.numberOfFloors ? 'PDF' : 'NOT_FOUND',
        operatingHours: pdfExtractedData.operatingHours ? 'PDF' : 'NOT_FOUND',
        conductedDate: pdfExtractedData.conductedDate ? 'PDF' : 'NOT_FOUND',
        squareFootage:
          pdfExtractedData.squareFootageSource
          || (pdfExtractedData.squareFootage ? 'PDF' : 'NOT_FOUND'),
        escapeRoutesEvidence: pdfExtractedData.escapeRoutesEvidence ? 'PDF' : 'NOT_FOUND',
        combustibleStorageEscapeCompromise: pdfExtractedData.combustibleStorageEscapeCompromise ? 'PDF' : 'NOT_FOUND',
        fireSafetyTrainingNarrative: pdfExtractedData.fireSafetyTrainingNarrative ? 'PDF' : 'NOT_FOUND',
        fireDoorsCondition: pdfExtractedData.fireDoorsCondition ? 'PDF' : 'NOT_FOUND',
        weeklyFireTests: pdfExtractedData.weeklyFireTests ? 'PDF' : 'NOT_FOUND',
        emergencyLightingMonthlyTest: pdfExtractedData.emergencyLightingMonthlyTest ? 'PDF' : 'NOT_FOUND',
        fireExtinguisherService: pdfExtractedData.fireExtinguisherService ? 'PDF' : 'NOT_FOUND',
        managementReviewStatement:
          pdfExtractedData.managementReviewStatementSource
          || (pdfExtractedData.managementReviewStatement ? 'PDF' : 'NOT_FOUND'),
        numberOfFireExits: pdfExtractedData.numberOfFireExits ? 'PDF' : 'NOT_FOUND',
        totalStaffEmployed: pdfExtractedData.totalStaffEmployed ? 'PDF' : 'NOT_FOUND',
        maxStaffOnSite: pdfExtractedData.maxStaffOnSite ? 'PDF' : 'NOT_FOUND',
        youngPersonsCount: pdfExtractedData.youngPersonsCount ? 'PDF' : 'NOT_FOUND',
        fireDrillDate: pdfExtractedData.fireDrillDate ? 'PDF' : 'NOT_FOUND',
        patTestingStatus: pdfExtractedData.patTestingStatus ? 'PDF' : 'NOT_FOUND',
        fixedWireTestDate: pdfExtractedData.fixedWireTestDate ? 'PDF' : 'NOT_FOUND',
        exitSignageCondition: pdfExtractedData.exitSignageCondition ? 'PDF' : 'NOT_FOUND',
        compartmentationStatus: pdfExtractedData.compartmentationStatus ? 'PDF' : 'NOT_FOUND',
        extinguisherServiceDate: pdfExtractedData.extinguisherServiceDate ? 'PDF' : 'NOT_FOUND',
        callPointAccessibility: pdfExtractedData.callPointAccessibility ? 'PDF' : 'NOT_FOUND',
      },
      sourceQuestions: SOURCE_QUESTIONS,
      hasPdfText: !!pdfText,
      hasDatabaseAudit: false,
      pdfTextLength: pdfText?.length || 0,
      pdfExtractedCount: Object.keys(pdfExtractedData).filter((key) => (pdfExtractedData as Record<string, unknown>)[key] != null).length,
      dbExtractedCount: 0,
    }

    return NextResponse.json({
      ...extractedData,
      rawPdfText: pdfText ? pdfText.substring(0, 5000) + (pdfText.length > 5000 ? '...' : '') : null,
    })
  } catch (error: any) {
    console.error('Error extracting FRA data:', error)
    return NextResponse.json(
      { error: 'Failed to extract FRA data', details: error.message },
      { status: 500 }
    )
  }
}
