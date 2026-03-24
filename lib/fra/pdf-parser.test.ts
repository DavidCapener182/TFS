import { describe, expect, it } from 'vitest'
import {
  detectFraParserVariantFromPdfText,
  extractConductedDateFromPdfText,
  extractDateFromText,
  extractFraPdfDataFromText,
  getLockedFraParserVariantFromResponses,
  parseAuditDateString,
  resolveFraParserVariantFromUserName,
} from '@/lib/fra/pdf-parser'

const ANDY_DUPLICATE_TEXT = `
Footasylum H&S Audit - duplicate
S0087 Bullring Mega / 18 Feb 2026 / Andy McIntosh Complete
Score 96 / 100 (96%)
Conducted on 18.02.2026 14:49 GMT
Prepared by Andy McIntosh

General Site Information
Number of floors (list ie Basement; Ground; 1st, 2nd in comments section)
2
The store comprises of two floors, both shop floor and back of house on the ground floor and basement.
Square Footage or Square Meterage of site
Number of Fire Exits 4
Number of Staff employed at the site 39
Maximum number of staff working on site at any one time 22
Number of Young persons (under the age of 18 yrs) employed at the site
0

Training
H&S induction training onboarding up to date and at 100%? Yes
H&S toolbox refresher training completed in the last 12 months and records available for
Manual handling
Housekeeping
Fire Safety
Stepladders
No
At the time of inspection, the toolbox training was at 74% compliance which falls short of the hundred percent required.

Statutory Testing
PAT? Yes
PAT testing was last actioned on the 3rd of October 2025
Fixed Electrical Wiring? Yes
Fire Extinguisher Service? Yes
Fire extinguishers were last serviced on the 23rd of September 2025

Fire Safety
Combustible materials are stored correctly? Yes
At a time of inspection there were a few areas where there are a lot of boxes which have been built up, but there is a conscious effort to keep them away from a source of heat.
Fire doors are kept shut and not held open? No
At the time of inspection 25 doors have been wedged opened.
Fire doors in a good condition? Yes
At the time of inspection, all fire doors were found to be in a good safe condition.
Are fire door intumescent strips in place and intact, to ensure the door retains its fire resisting properties and holds back the blaze to enable persons to escape? Yes
Structure found to be in a good condition with no evidence of damage which would compromise fire safety - EG Missing ceiling tiles / gaps from area to area? Yes
Fire exit routes clear and unobstructed? Yes
At a time of inspection, all fire exits were clear with no hazards to report.
Are all Fire Extinguishers clear and easily accessible Yes
At the time of inspection, fire extinguishers were all clear and accessible.
Are all call points clear and easily accessible Yes
At the time of inspection all call points were clear and accessible.
Weekly Fire Tests carried out and documented? Yes
Weekly fire tests make up part of the weekly health and safety checks. These are recorded in zipline.
Fire drill has been carried out in the past 6 months and
Yes
records available on site?
The last fire drill was actioned in October 2025
Evidence of Monthly Emergency Lighting test being
Yes
conducted?
Emergency lighting makes up part of the health and safety weekly checks. These are recorded in zipline.
Location of Fire Panel Ground floor fire exit.
Alarm Panel Photo
Is panel free of faults Yes
Location of Emergency Lighting Test Switch (Photograph) Ground floor stockroom
Emergency Lighting Switch Photo

Signature of Person in Charge of store at time of assessment. Luisa Asiedu 18.02.2026 10:48 GMT
Audit Completed by Andy McIntosh 18.02.2026 10:34 GMT
`

const ANDY_DUPLICATE_PDFJS_TEXT = `
17.ActionPlanSignOff-0/0(0%) Action Plan Sign Off 0 / 0 (0%)
Due Date to Resolve/Complete the action point 18.03.2026 10:34 GMT
Any other comments or findings to note:
Sign off and acceptance to complete Action Plan by Due Dates
I acknowledge and understand the detailed Action Points, and agree to complete the necessary actions by the set due date.
Signature of Person in Charge of store at time of assessment. Luisa Asiedu 18.02.2026 10:48 GMT 1 7 . 2 . 1 . A u d i t C o m p l e t e d b y Audit Completed by Andy McIntosh 18.02.2026 10:34 GMT Private & Confidential 25/34

Are all call points clear and easily accessible Yes
At the time of inspection or call points were clear and accessible.
Photo 59 Photo 60 Photo 61 Photo 62 Photo 63
Weekly Fire Tests carried out and documented? Yes
Weekly fire tests make up part of the weekly health and safety checks. These are recorded in zip line.
Photo 64
Fire drill has been carried out in the past 6 months and records available on site? Yes
The last fire drill was actioned in October 2025
Evidence of Monthly Emergency Lighting test being conducted? Yes
Emergency lighting makes up part of the health and safety weekly checks. These are recorded in zip line.
Location of Fire Panel Ground floor fire exit.
Alarm Panel Photo
Photo 65
Is panel free of faults Yes
Location of Emergency Lighting Test Switch (Photograph) Ground floor stockroom
Emergency Lighting Switch Photo
Private & Confidential 22/34
`

const ANDY_DUPLICATE_DENSE_TEXT = `
Conductedon 18.02.202614:49GMT
Preparedby AndyMcIntosh
FireSafety
Areallcallpointsclearandeasilyaccessible Yes
Atthetimeofinspectionorcallpointswereclearandaccessible.
Photo59 Photo60 Photo61 Photo62 Photo63
WeeklyFireTestscarriedoutanddocumented? Yes
Weeklyfiretestsmakeuppartoftheweeklyhealthandsafetychecks.Thesearerecordedinzipline.
Photo64
Firedrillhasbeencarriedoutinthepast6monthsand
Yes
recordsavailableonsite?
ThelastfiredrillwasactionedinOctober2025
EvidenceofMonthlyEmergencyLighting testbeing
Yes
conducted?
Emergencylightingmakesuppartofthehealthandsafetyweeklychecks.Thesearerecordedinzipline.
LocationofFirePanel Groundfloorfireexit.
AlarmPanelPhoto
Photo65
Ispanelfreeoffaults Yes
LocationofEmergencyLightingTestSwitch(Photograph) Groundfloorstockroom
EmergencyLightingSwitchPhoto
Private&Confidential 22/34

SignatureofPersoninChargeofstoreattimeofassessment.
LuisaAsiedu
18.02.202610:48GMT
17.2.1.AuditCompletedby
AuditCompletedby
AndyMcIntosh
18.02.202610:34GMT
Private&Confidential 25/34
`

describe('FRA PDF parser', () => {
  it('prefers a locked parser variant when one is already stored', () => {
    const variant = getLockedFraParserVariantFromResponses([
      { response_json: { fra_parser_variant: 'andy_duplicate' } },
      { response_json: { fra_parser_variant: 'default' } },
    ])

    expect(variant).toBe('andy_duplicate')
  })

  it('resolves parser variants from auditor names', () => {
    expect(resolveFraParserVariantFromUserName('Andy McIntosh')).toBe('andy_duplicate')
    expect(resolveFraParserVariantFromUserName('David Capener')).toBe('default')
    expect(resolveFraParserVariantFromUserName('Dave Smith')).toBe('default')
    expect(resolveFraParserVariantFromUserName('Someone Else')).toBe('default')
  })

  it('detects the Andy duplicate parser from PDF text regardless of logged-in user', () => {
    expect(detectFraParserVariantFromPdfText(ANDY_DUPLICATE_TEXT)).toBe('andy_duplicate')
    expect(detectFraParserVariantFromPdfText(ANDY_DUPLICATE_DENSE_TEXT)).toBe('andy_duplicate')
    expect(detectFraParserVariantFromPdfText('Generic audit text with no duplicate markers')).toBeNull()
  })

  it('extracts the Andy duplicate audit format with the new parser variant', () => {
    const extracted = extractFraPdfDataFromText(ANDY_DUPLICATE_TEXT, { variant: 'andy_duplicate' })

    expect(extracted.conductedDate).toBe('18 February 2026')
    expect(extracted.assessmentStartTime).toBe('14:49 GMT')
    expect(extracted.storeManager).toBe('Luisa Asiedu')
    expect(extracted.numberOfFloors).toBe('2')
    expect(extracted.numberOfFireExits).toBe('4')
    expect(extracted.totalStaffEmployed).toBe('39')
    expect(extracted.maxStaffOnSite).toBe('22')
    expect(extracted.youngPersonsCount).toBe('0')
    expect(extracted.firePanelLocation).toBe('Ground floor fire exit')
    expect(extracted.emergencyLightingSwitch).toBe('Ground floor stockroom')
    expect(extracted.fireDoorsHeldOpen).toBe('yes')
    expect(extracted.fireDoorsCondition).toContain('25 doors have been wedged opened')
    expect(extracted.fireSafetyTrainingShortfall).toBe('yes')
    expect(extracted.trainingCompletionRate).toBe('74')
    expect(extracted.fireDrillDate).toBe('October 2025')
    expect(extracted.patTestingStatus).toBe('Satisfactory, last conducted 3 October 2025')
    expect(extracted.extinguisherServiceDate).toBe('23 September 2025')
    expect(extracted.callPointAccessibility).toContain('clear and accessible')
  })

  it('extracts Andy duplicate fields from flattened pdf.js text', () => {
    const extracted = extractFraPdfDataFromText(ANDY_DUPLICATE_PDFJS_TEXT, { variant: 'andy_duplicate' })

    expect(extracted.storeManager).toBe('Luisa Asiedu')
    expect(extracted.firePanelLocation).toBe('Ground floor fire exit')
    expect(extracted.firePanelFaults).toBe('No faults')
    expect(extracted.emergencyLightingSwitch).toBe('Ground floor stockroom')
    expect(extracted.weeklyFireTests).toContain('recorded in zip line')
  })

  it('extracts Andy duplicate fields from dense copied text', () => {
    const extracted = extractFraPdfDataFromText(ANDY_DUPLICATE_DENSE_TEXT, { variant: 'andy_duplicate' })

    expect(extracted.storeManager).toBe('Luisa Asiedu')
    expect(extracted.conductedDate).toBe('18 February 2026')
    expect(extracted.assessmentStartTime).toBe('14:49 GMT')
    expect(extracted.firePanelLocation).toBe('Ground floor fire exit')
    expect(extracted.firePanelFaults).toBe('No faults')
    expect(extracted.emergencyLightingSwitch).toBe('Ground floor stockroom')
    expect(extracted.weeklyFireTests).toContain('recorded in zip line')
  })

  it('normalizes dotted and ordinal dates for downstream use', () => {
    expect(extractConductedDateFromPdfText('Conducted on 18.02.2026 14:49 GMT')).toBe('18 February 2026')
    expect(extractDateFromText('PAT testing was last actioned on the 3rd of October 2025')).toBe('3 October 2025')
    expect(extractDateFromText('The last fire drill was actioned in October 2025')).toBe('October 2025')
  })

  it('parses normalized audit dates into stable Date objects', () => {
    const dotted = parseAuditDateString('18.02.2026')
    const text = parseAuditDateString('3 October 2025')

    expect(dotted?.toISOString()).toBe('2026-02-18T12:00:00.000Z')
    expect(text?.toISOString()).toBe('2025-10-03T12:00:00.000Z')
  })
})
