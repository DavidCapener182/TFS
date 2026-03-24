import type { SupabaseClient } from '@supabase/supabase-js'

export type FRAParserVariant = 'default' | 'andy_duplicate'

export type ParsedYesNoQuestion = {
  answer: 'yes' | 'no' | 'na' | null
  comment: string | null
}

type ParsedAnchoredQuestion = {
  answer: 'yes' | 'no' | 'na' | null
  comment: string | null
  windowText: string
}

type ExtractSectionMap = {
  full: string
  generalSiteInformation?: string
  statutoryTesting?: string
  fireSafety?: string
  training?: string
}

type ParserConfig = {
  fireDoorsClosedAnchor: RegExp
  inductionTrainingAnchor: RegExp
  toolboxTrainingAnchor: RegExp
  fireDrillAnchor: RegExp
}

type FraResponseRow = {
  id: string
  question_id: string
  response_json: Record<string, unknown> | null
  created_at?: string
}

export type FraPdfExtractedData = {
  storeManager?: string | null
  assessmentStartTime?: string | null
  firePanelLocation?: string | null
  firePanelFaults?: string | null
  emergencyLightingSwitch?: string | null
  numberOfFloors?: string | null
  operatingHours?: string | null
  conductedDate?: string | null
  squareFootage?: string | null
  squareFootageSource?: string | null
  escapeRoutesEvidence?: string | null
  escapeRoutesObstructed?: string | null
  combustibleStorageEscapeCompromise?: string | null
  combustibleStorageEscapeCompromiseFlag?: string | null
  fireSafetyTrainingNarrative?: string | null
  fireSafetyTrainingShortfall?: string | null
  trainingCompletionRate?: string | null
  fireDoorsCondition?: string | null
  fireDoorsHeldOpen?: string | null
  fireDoorsHeldOpenComment?: string | null
  fireDoorsBlocked?: string | null
  weeklyFireTests?: string | null
  emergencyLightingMonthlyTest?: string | null
  fireExtinguisherService?: string | null
  managementReviewStatement?: string | null
  managementReviewStatementSource?: string | null
  numberOfFireExits?: string | null
  totalStaffEmployed?: string | null
  maxStaffOnSite?: string | null
  youngPersonsCount?: string | null
  fireDrillDate?: string | null
  patTestingStatus?: string | null
  fixedWireTestDate?: string | null
  exitSignageCondition?: string | null
  compartmentationStatus?: string | null
  extinguisherServiceDate?: string | null
  callPointAccessibility?: string | null
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const DENSE_AUDIT_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Conductedon/gi, 'Conducted on'],
  [/Preparedby/gi, 'Prepared by'],
  [/Siteconducted/gi, 'Site conducted'],
  [/Private&Confidential/gi, 'Private & Confidential'],
  [/GeneralSiteInformation/gi, 'General Site Information'],
  [/StatutoryTesting/gi, 'Statutory Testing'],
  [/FireSafety/gi, 'Fire Safety'],
  [/SignatureofPersoninChargeofstoreattimeofassessment/gi, 'Signature of Person in Charge of store at time of assessment'],
  [/AuditCompletedby/gi, 'Audit Completed by'],
  [/LocationofFirePanel/gi, 'Location of Fire Panel'],
  [/AlarmPanelPhoto/gi, 'Alarm Panel Photo'],
  [/Ispanelfreeoffaults/gi, 'Is panel free of faults'],
  [/LocationofEmergencyLightingTestSwitch/gi, 'Location of Emergency Lighting Test Switch'],
  [/EmergencyLightingSwitchPhoto/gi, 'Emergency Lighting Switch Photo'],
  [/Areallcallpointsclearandeasilyaccessible/gi, 'Are all call points clear and easily accessible'],
  [/WeeklyFireTestscarriedoutanddocumented/gi, 'Weekly Fire Tests carried out and documented'],
  [/Weeklyfiretestsmakeuppartoftheweeklyhealthandsafetychecks/gi, 'Weekly fire tests make up part of the weekly health and safety checks'],
  [/Firedrillhasbeencarriedoutinthepast6monthsand/gi, 'Fire drill has been carried out in the past 6 months and'],
  [/recordsavailableonsite/gi, 'records available on site'],
  [/Thelastfiredrillwasactionedin/gi, 'The last fire drill was actioned in'],
  [/EvidenceofMonthlyEmergencyLighting\s*testbeing/gi, 'Evidence of Monthly Emergency Lighting test being'],
  [/Emergencylightingmakesuppartofthehealthandsafetyweeklychecks/gi, 'Emergency lighting makes up part of the health and safety weekly checks'],
  [/Thesearerecordedinzip\s*line/gi, 'These are recorded in zip line'],
  [/Atthetimeofinspection/gi, 'At the time of inspection'],
  [/Attimeofinspection/gi, 'At time of inspection'],
  [/Atatimeofinspection/gi, 'At a time of inspection'],
  [/Atimeofinspection/gi, 'At time of inspection'],
  [/Groundfloor/gi, 'Ground floor'],
  [/Basementfloor/gi, 'Basement floor'],
  [/backofhouse/gi, 'back of house'],
  [/frontofhouse/gi, 'front of house'],
  [/fireexit/gi, 'fire exit'],
  [/callpoints/gi, 'call points'],
  [/firedoors/gi, 'fire doors'],
  [/floorfire/gi, 'floor fire'],
  [/floorstock/gi, 'floor stock'],
  [/inspectionor/gi, 'inspection or '],
  [/pointswere/gi, 'points were '],
  [/wereclearandaccessible/gi, 'were clear and accessible'],
  [/doorshave/gi, 'doors have'],
  [/wedgedopened/gi, 'wedged opened'],
  [/foundtobe/gi, 'found to be'],
  [/goodsafecondition/gi, 'good safe condition'],
  [/andintact/gi, 'and intact'],
  [/retainsits/gi, 'retains its'],
  [/PATtestingwaslastactionedonthe/gi, 'PAT testing was last actioned on the'],
  [/FixedElectricalWiring/gi, 'Fixed Electrical Wiring'],
  [/FireAlarmMaintenance/gi, 'Fire Alarm Maintenance'],
  [/Thefirealarmwaslastcheckedonthe/gi, 'The fire alarm was last checked on the'],
  [/EmergencyLightingMaintenance/gi, 'Emergency Lighting Maintenance'],
  [/Emergencylightingwaslastexternallycheckedonthe/gi, 'Emergency lighting was last externally checked on the'],
  [/FireExtinguisherService/gi, 'Fire Extinguisher Service'],
  [/Fireextinguisherswerelastservicedonthe/gi, 'Fire extinguishers were last serviced on the'],
]

const NEXT_QUESTION_BOUNDARIES: RegExp[] = [
  /location\s+of\s+fire\s+panel/i,
  /is\s+panel\s+free\s+of\s+faults\s*\??/i,
  /location\s+of\s+emergency\s+lighting\s+test\s+switch/i,
  /fire\s+panel\s+location/i,
  /fire\s+exit\s+routes\s+clear\s+and\s+unobstructed\?/i,
  /combustible\s+materials\s+are\s+stored\s+correctly\?/i,
  /fire\s+doors\s+in\s+a\s+good\s+condition\?/i,
  /are\s+fire\s+door\s+intumescent\s+strips\s+in\s+place\s+and\s+intact\?/i,
  /fire\s+doors\s+(?:closed|are\s+kept\s+shut|kept\s+shut)\s+and\s+not\s+held\s+open\?/i,
  /are\s+all\s+call\s+points\s+clear\s+and\s+easily\s+accessible/i,
  /records?\s+available\s+on\s+site\?/i,
  /are\s+all\s+fire\s+extinguishers?\s+clear\s+and\s+easily\s+accessible/i,
  /is\s+there\s+a\s+50mm\s+clearance\s+from\s+stock\s+to\s+sprinkler\s+head/i,
  /are\s+plugs\s+and\s+extension\s+leads\s+managed\s+and\s+not\s+overloaded/i,
  /fire\s+drill\s+has\s+been\s+carried\s+out\s+in\s+the\s+past\s+6\s+months/i,
  /weekly\s+fire\s+tests?\s+carried\s+out\s+and\s+documented\s*\??/i,
  /weekly\s+fire\s+alarm\s+testing\s+is\s+being\s+completed\s+and\s+recorded/i,
  /weekly\s+fire\s+alarm\s+tests?\s+carried\s+out\s+and\s+documented\s*\??/i,
  /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test\s+being\s+conducted\?/i,
  /monthly\s+emergency\s+lighting\s+testing\s+is\s+being\s+conducted/i,
  /fire\s+extinguisher\s+service\?/i,
  /fire\s+drill\s+has\s+been\s+carried\s+out\s+in\s+the\s+past\s+6\s+months\s+and\s+records?\s+available\s+on\s+site\?/i,
  /\bpat\s*\?/i,
  /fixed\s+electrical\s+wiring\?/i,
  /store\s+compliance/i,
  /action\s+plan\s+sign\s+off/i,
  /due\s+date\s+to\s+resolve\/complete/i,
  /actions?\s+by\s+the\s+set\s+due\s+date/i,
  /signature\s+of\s+person\s+in\s+charge/i,
]

const TRAILING_CONTAMINATION_PATTERNS: RegExp[] = [
  /records?\s+available\s+on\s+site\??/i,
  /weekly\s+fire\s+tests?\s+carried\s+out\s+and\s+documented/i,
  /weekly\s+fire\s+alarm\s+testing\s+is\s+being\s+completed\s+and\s+recorded/i,
  /weekly\s+fire\s+alarm\s+tests?\s+carried\s+out\s+and\s+documented/i,
  /fire\s+drill\s+has\s+been\s+carried\s+out/i,
  /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test/i,
  /is\s+there\s+a\s+50mm\s+clearance\s+from\s+stock\s+to\s+sprinkler\s+head/i,
  /are\s+plugs?\s+and\s+extension\s+leads?\s+managed\s+and\s+not\s+overloaded/i,
  /location\s+of\s+fire\s+panel/i,
  /is\s+panel\s+free\s+of\s+faults/i,
  /location\s+of\s+emergency\s+lighting\s+test\s+switch/i,
  /store\s+compliance/i,
  /action\s+plan\s+sign\s+off/i,
  /due\s+date\s+to\s+resolve\/complete/i,
  /actions?\s+by\s+the\s+set\s+due\s+date/i,
  /signature\s+of\s+person\s+in\s+charge/i,
  /private\s*&\s*confidential/i,
]

const DEFAULT_CONFIG: ParserConfig = {
  fireDoorsClosedAnchor: /fire\s+doors\s+closed\s+and\s+not\s+held\s+open\s*\?/i,
  inductionTrainingAnchor: /h\s*&\s*s\s+induction\s+training\s+onboarding\s+up\s+to\s+date\s+and\s+at\s+100%\s*\?/i,
  toolboxTrainingAnchor: /h\s*&\s*s\s+toolbox\s+refresher\s+training\s+completed\s+in\s+the\s+last\s+12\s+months(?:\s+and\s+records\s+available\s+for)?\s*\??/i,
  fireDrillAnchor: /fire\s+drill\s+has\s+been\s+carried\s+out\s+in\s+the\s+past\s+6\s+months\s+and\s+records\s+available\s+on\s+site\s*\?/i,
}

const ANDY_DUPLICATE_CONFIG: ParserConfig = {
  fireDoorsClosedAnchor: /fire\s+doors?\s+(?:are\s+kept\s+shut|kept\s+shut|closed)\s+and\s+not\s+held\s+open\s*\?/i,
  inductionTrainingAnchor: /h\s*&\s*s\s+induction\s+training(?:\s+onboarding)?\s+up\s+to\s+date\s+and\s+at\s+100%\s*\?/i,
  toolboxTrainingAnchor: /h\s*&\s*s\s+toolbox\s+refresher\s+training\s+completed\s+in\s+the\s+last\s+12\s+months(?:\s+and\s+records\s+available\s+for)?\s*\??/i,
  fireDrillAnchor: /fire\s+drill\s+has\s+been\s+carried\s+out\s+in\s+the\s+past\s+6\s+months\s+and\s+records\s+available\s+on\s+site\s*\?/i,
}

function normalizeDenseAuditText(value: string): string {
  let normalized = value.replace(/\u00A0/g, ' ')

  for (const [pattern, replacement] of DENSE_AUDIT_TEXT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement)
  }

  normalized = normalized
    .replace(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(\d{1,2}:\d{2}\s*(?:am|pm|gmt|bst|utc))/gi, '$1 $2')
    .replace(/(\d{1,2}:\d{2})(am|pm|gmt|bst|utc)\b/gi, '$1 $2')
    .replace(/(\b\d{1,2}(?:st|nd|rd|th))of\b/gi, '$1 of')
    .replace(/([a-z]{2,})([A-Z][a-z]{2,})/g, '$1 $2')

  return normalized
}

export function normalizeWhitespace(value: string): string {
  return normalizeDenseAuditText(value).replace(/\s+/g, ' ').trim()
}

export function normalizeFraParserVariant(value: unknown): FRAParserVariant | null {
  if (value !== 'default' && value !== 'andy_duplicate') {
    return null
  }
  return value
}

export function resolveFraParserVariantFromUserName(fullName?: string | null): FRAParserVariant {
  const normalized = normalizeWhitespace(fullName || '').toLowerCase()
  if (!normalized) return 'default'
  if (normalized.startsWith('andy')) return 'andy_duplicate'
  if (normalized.startsWith('dave') || normalized.startsWith('david')) return 'default'
  return 'default'
}

function formatDayMonthYear(day: number, month1Based: number, year: number): string {
  return `${day} ${MONTH_NAMES[month1Based - 1]} ${year}`
}

function formatMonthYear(month1Based: number, year: number): string {
  return `${MONTH_NAMES[month1Based - 1]} ${year}`
}

function buildNoonUtcDate(year: number, month1Based: number, day: number): Date {
  return new Date(Date.UTC(year, month1Based - 1, day, 12, 0, 0))
}

export function parseAuditDateString(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null

  const dmy = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
  if (dmy) {
    const day = Number.parseInt(dmy[1], 10)
    const month = Number.parseInt(dmy[2], 10)
    let year = Number.parseInt(dmy[3], 10)
    if (year < 100) year += 2000
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return buildNoonUtcDate(year, month, day)
    }
  }

  const dMonY = value.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([a-z]{3,9})\w*\s+(\d{4})$/i)
  if (dMonY) {
    const day = Number.parseInt(dMonY[1], 10)
    const month = MONTH_MAP[dMonY[2].toLowerCase().slice(0, 3)]
    const year = Number.parseInt(dMonY[3], 10)
    if (month && day >= 1 && day <= 31) {
      return buildNoonUtcDate(year, month, day)
    }
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return buildNoonUtcDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate())
  }

  return null
}

export function normalizeAuditDateString(raw: unknown): string | null {
  const parsed = parseAuditDateString(raw)
  if (!parsed) return null
  return formatDayMonthYear(
    parsed.getUTCDate(),
    parsed.getUTCMonth() + 1,
    parsed.getUTCFullYear()
  )
}

export function extractDateFromText(value: string): string | null {
  const normalized = normalizeWhitespace(value)
  if (!normalized) return null

  const strictPatterns = [
    /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/i,
    /\b(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})\b/i,
    /\b(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})\b/i,
  ]

  for (const pattern of strictPatterns) {
    const match = normalized.match(pattern)
    const extracted = normalizeAuditDateString(match?.[1])
    if (extracted) return extracted
  }

  const monthYearMatch = normalized.match(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})\b/i)
  if (monthYearMatch?.[1]) {
    const parts = monthYearMatch[1].split(/\s+/)
    const month = MONTH_MAP[parts[0].toLowerCase().slice(0, 3)]
    const year = Number.parseInt(parts[1], 10)
    if (month && Number.isFinite(year)) {
      return formatMonthYear(month, year)
    }
  }

  return null
}

export function extractConductedDateFromPdfText(pdfText: string): string | null {
  const patterns = [
    /(?:conducted\s*on|conducted\s*at|assessment\s*date)[\s:]*([^\n\r]{1,80})/i,
    /conducted[\s\S]{0,100}?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
    /conducted[\s\S]{0,100}?(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
  ]

  for (const pattern of patterns) {
    const match = pdfText.match(pattern)
    if (!match?.[1]) continue
    const date = extractDateFromText(match[1])
    if (date) return date
  }

  return null
}

export function extractAssessmentStartTime(text: string): string | null {
  const patterns = [
    /(?:conducted\s*on|conducted\s*at|assessment\s*date)[^\n\r]{0,120}?(\d{1,2}:\d{2}\s*(?:am|pm)\s*(?:gmt|bst|utc)?)/i,
    /(?:conducted\s*on|conducted\s*at|assessment\s*date)[^\n\r]{0,120}?(\d{1,2}\.\d{2}\s*(?:am|pm)\s*(?:gmt|bst|utc)?)/i,
    /(?:conducted\s*on|conducted\s*at|assessment\s*date)[^\n\r]{0,120}?(\d{1,2}:\d{2}\s*(?:gmt|bst|utc))/i,
    /(?:conducted\s*on|conducted\s*at|assessment\s*date)[^\n\r]{0,120}?(\d{1,2}\.\d{2}\s*(?:gmt|bst|utc))/i,
    /\b(\d{1,2}:\d{2}\s*(?:am|pm)\s*(?:gmt|bst|utc))\b/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue
    const raw = normalizeWhitespace(match[1]).replace(/(\d{1,2})\.(\d{2})/, '$1:$2')
    const normalized = raw
      .replace(/\bam\b/i, 'AM')
      .replace(/\bpm\b/i, 'PM')
      .replace(/\bgmt\b/i, 'GMT')
      .replace(/\bbst\b/i, 'BST')
      .replace(/\butc\b/i, 'UTC')
    if (normalized) return normalized
  }

  return null
}

function toFlexibleWhitespaceRegex(regex: RegExp): RegExp {
  return new RegExp(
    regex.source
      .replace(/\\s\+/g, '\\s*')
      .replace(/\\s\*/g, '\\s*'),
    regex.flags.replace(/g/g, '')
  )
}

function normalizeLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

function isPhotoOnlyLine(value: string): boolean {
  return /^\s*photo\s+\d+(?:\s+photo\s+\d+)*\s*$/i.test(value)
}

function isSectionHeadingLine(value: string): boolean {
  const line = normalizeWhitespace(value)
  if (!line) return false
  return [
    'General Site Information',
    'Statutory Testing',
    'Fire Safety',
    'Store Compliance',
    'COSHH',
    'Training',
  ].some((heading) => new RegExp(`^${heading}\\b`, 'i').test(line))
}

function isLikelyNewQuestionLine(value: string): boolean {
  const line = normalizeWhitespace(value)
  if (!line) return false
  if (/\?$/.test(line) && line.length > 12) return true
  if (/^(number of|location of|evidence of|is panel|are all|fire drill has|h&s)/i.test(line)) return true
  return false
}

function splitBeforeNextQuestionBoundary(value: string): { before: string; hitBoundary: boolean } {
  let cutIndex = -1
  for (const pattern of NEXT_QUESTION_BOUNDARIES) {
    const match = toFlexibleWhitespaceRegex(pattern).exec(value)
    if (!match || typeof match.index !== 'number') continue
    if (cutIndex < 0 || match.index < cutIndex) cutIndex = match.index
  }
  if (cutIndex < 0) {
    return { before: value, hitBoundary: false }
  }
  return { before: value.slice(0, cutIndex).trim(), hitBoundary: true }
}

function cutAtEarliestPattern(value: string, patterns: RegExp[]): string {
  let cutIndex = -1
  for (const pattern of patterns) {
    const safePattern = toFlexibleWhitespaceRegex(pattern)
    const match = safePattern.exec(value)
    if (!match || typeof match.index !== 'number') continue
    if (cutIndex < 0 || match.index < cutIndex) {
      cutIndex = match.index
    }
  }
  return cutIndex >= 0 ? value.slice(0, cutIndex).trim() : value
}

function isLikelyGeneralSiteLabel(value: string): boolean {
  const lower = normalizeWhitespace(value).toLowerCase()
  if (!lower) return false
  return [
    'general site information',
    'number of floors',
    'square footage',
    'number of fire exits',
    'number of staff',
    'maximum number of staff',
    'number of young persons',
    'any know enforcement action',
    'any known enforcement action',
    'health and safety policy',
    'risk assessments',
    'training',
    'statutory testing',
    'fire safety',
  ].some((label) => lower.startsWith(label))
}

function isInvalidLocationValue(value: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(value || '')
  if (!normalized) return true
  if (/^(yes|no|n\/a|na)$/i.test(normalized)) return true
  if (/^photo\s+\d+(?:\s+photo\s+\d+)*$/i.test(normalized)) return true
  if (/(?:alarm\s+panel\s+photo|emergency\s+lighting\s+switch\s+photo)/i.test(normalized)) return true
  if (/^location\s+of\s+(?:fire\s+panel|emergency\s+lighting\s+test\s+switch)/i.test(normalized)) return true
  if (/(?:action\s+plan\s+sign\s+off|actions?\s+by\s+the\s+set\s+due\s+date|sign\s+off\s+and\s+acceptance|due\s+date\s+to\s+resolve\/complete|signature\s+of\s+person\s+in\s+charge)/i.test(normalized)) return true
  if (/(?:records?\s+available\s+on\s+site|recorded\s+(?:on|in)\s+zip\s*line|weekly\s+fire\s+tests?\s+carried\s+out\s+and\s+documented|weekly\s+fire\s+alarm\s+testing\s+is\s+being\s+completed\s+and\s+recorded|weekly\s+fire\s+alarm\s+tests?\s+carried\s+out\s+and\s+documented|fire\s+drill\s+has\s+been\s+carried\s+out|evidence\s+of\s+monthly\s+emergency\s+lighting\s+test|private\s*&\s*confidential)/i.test(normalized)) return true
  return false
}

function isLikelyLocationText(value: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(value || '')
  if (!normalized || isInvalidLocationValue(normalized)) return false
  if (normalized.length < 3) return false
  if (normalized.length > 90) return false
  return /(?:rear|front|side|stock(?:room)?|fire\s+door|door|alarm\s*panel|panel|cupboard|electrical|entrance|exit|stair|corridor|office|room|wall|next to|beside|by\s+(?:alarm|panel|rear|fire|door|exit|stock|office|stairs?|corridor|electrical|cupboard))/i.test(normalized)
}

function sanitizeAnchoredValue(
  value: string | null | undefined,
  options?: { asLocation?: boolean }
): string | null {
  if (!value) return null
  const boundaryTrimmed = splitBeforeNextQuestionBoundary(normalizeWhitespace(value)).before
  let cleaned = normalizeWhitespace(
    boundaryTrimmed
      .replace(/\bPhoto\s+\d+(?:\s+Photo\s+\d+)*/gi, ' ')
      .replace(/\b(?:Alarm Panel Photo|Emergency Lighting Switch Photo)\b/gi, ' ')
      .replace(/\([^)]*photograph[^)]*\)/gi, ' ')
      .replace(/\bphotograph\b/gi, ' ')
  )
  cleaned = cutAtEarliestPattern(cleaned, TRAILING_CONTAMINATION_PATTERNS)
  cleaned = normalizeWhitespace(cleaned.replace(/^[:\-\s]+/, '').replace(/[.]+$/, ''))
  if (!cleaned) return null
  if (options?.asLocation) {
    cleaned = cutAtEarliestPattern(cleaned, [/\b(?:yes|no|n\/a|na)\b/i])
    cleaned = normalizeWhitespace(cleaned)
    if (!cleaned) return null
    if (!isLikelyLocationText(cleaned) || isInvalidLocationValue(cleaned)) {
      return null
    }
  }
  return cleaned
}

function sanitizeCompartmentationText(value: string | null | undefined): string | null {
  if (!value) return null
  return sanitizeAnchoredValue(
    value
      .replace(/\brecords?\s+available\s+on\s+site\?.*$/i, '')
      .replace(/\brecorded\s+(?:on|in)\s+zip\s*line.*$/i, '')
      .replace(/\bfire\s+drill\s+has\s+been\s+carried\s+out.*$/i, '')
      .replace(/\bweekly\s+fire\s+tests?\s+carried\s+out\s+and\s+documented.*$/i, '')
      .replace(/\bevidence\s+of\s+monthly\s+emergency\s+lighting\s+test.*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

function extractNumericAfterLabel(text: string, labelRegex: RegExp): string | null {
  const sameLineRegex = new RegExp(`${labelRegex.source}[^\\n\\r]*`, 'i')
  const sameLine = text.match(sameLineRegex)?.[0] || null
  if (sameLine) {
    const candidate = normalizeWhitespace(
      sameLine
        .replace(labelRegex, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/under\s+the\s+age\s+of\s+\d+\s*yrs?/i, ' ')
    )
    const trailingNumber = candidate.match(/(\d+)\s*$/)?.[1] || candidate.match(/\b(\d+)\b/)?.[1] || null
    if (trailingNumber) return trailingNumber
  }

  const blockRegex = new RegExp(`${labelRegex.source}[\\s\\S]{0,160}`, 'i')
  const block = text.match(blockRegex)?.[0] || null
  if (!block) return null

  const lines = block
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const labelIndex = lines.findIndex((line) => labelRegex.test(line))
  if (labelIndex < 0) return null

  for (let i = labelIndex + 1; i < lines.length && i <= labelIndex + 3; i += 1) {
    const line = lines[i]
    if (isLikelyGeneralSiteLabel(line)) break
    const numeric = line.match(/^(\d+)\b/)?.[1] || null
    if (numeric) return numeric
  }

  return null
}

function isValidSquareFootageValue(value: string): boolean {
  const cleaned = normalizeWhitespace(value).replace(/^[:\-\s]*/, '')
  if (!cleaned) return false
  if (/^(n\/a|na|none|nil|not applicable|not provided|—|-)$/.test(cleaned.toLowerCase())) return false
  if (!/\d/.test(cleaned)) return false
  if (isLikelyGeneralSiteLabel(cleaned)) return false
  if (/number of fire exits|number of staff|maximum number of staff|young persons|enforcement action/i.test(cleaned)) return false

  return /^(\d[\d,]*(?:\.\d+)?)\s*(sq\s*ft|sq\s*m|m²|ft²|square\s*(feet|meters|metres))?$/i.test(cleaned)
}

function extractSquareFootageAfterLabel(text: string): string | null {
  const labelRegex = /square footage or square meterage of site/i
  const sameLine = text.match(/square footage or square meterage of site[^\n\r]*/i)?.[0] || null
  if (sameLine) {
    const candidate = normalizeWhitespace(sameLine.replace(labelRegex, ''))
    if (isValidSquareFootageValue(candidate)) {
      return candidate
    }
  }

  const block = text.match(/square footage or square meterage of site[\s\S]{0,200}/i)?.[0] || null
  if (!block) return null

  const lines = block
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const labelIndex = lines.findIndex((line) => labelRegex.test(line))
  if (labelIndex < 0) return null

  for (let i = labelIndex + 1; i < lines.length && i <= labelIndex + 4; i += 1) {
    const line = normalizeWhitespace(lines[i]).replace(/^[:\-\s]*/, '')
    if (isLikelyGeneralSiteLabel(line)) break
    if (isValidSquareFootageValue(line)) return line
  }

  return null
}

function preCleanAuditText(text: string): string {
  let cleaned = text.replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ')
  cleaned = cleaned.replace(/disclaimer[\s\S]*?(?=general site information)/i, '')
  cleaned = cleaned.replace(/media summary[\s\S]*$/i, '')
  cleaned = normalizeLines(cleaned)
    .filter((line) => !isPhotoOnlyLine(line))
    .join('\n')
  return cleaned.replace(/\n{3,}/g, '\n\n').trim()
}

function splitAuditSections(cleanedText: string): ExtractSectionMap {
  const normalizedText = cleanedText.replace(/\r\n?/g, '\n')
  const lines = normalizedText.split('\n')
  const offsets: number[] = []
  let cursor = 0
  for (const line of lines) {
    offsets.push(cursor)
    cursor += line.length + 1
  }

  const sectionDefs: Array<{ key: keyof Omit<ExtractSectionMap, 'full'>; title: string }> = [
    { key: 'generalSiteInformation', title: 'General Site Information' },
    { key: 'statutoryTesting', title: 'Statutory Testing' },
    { key: 'fireSafety', title: 'Fire Safety' },
    { key: 'training', title: 'Training' },
  ]

  const getNextNonEmptyLine = (fromIndex: number): string => {
    for (let i = fromIndex + 1; i < lines.length; i += 1) {
      const candidate = normalizeWhitespace(lines[i])
      if (candidate) return candidate
    }
    return ''
  }

  const isSectionHeadingCandidate = (index: number, title: string): boolean => {
    const normalizedTitle = normalizeWhitespace(title).toLowerCase()
    const current = normalizeWhitespace(lines[index]).toLowerCase()
    if (!current) return false

    const exactOrPrefixed =
      current === normalizedTitle
      || current.startsWith(normalizedTitle)
      || new RegExp(`^(?:\\d+[.)-]\\s*)?${normalizedTitle.replace(/\s+/g, '\\s*')}`).test(current)
      || new RegExp(`\\b${normalizedTitle.replace(/\s+/g, '\\s*')}\\b`).test(current)

    if (!exactOrPrefixed) return false

    const previous = index > 0 ? normalizeWhitespace(lines[index - 1]) : ''
    const next = getNextNonEmptyLine(index)

    const hasHeadingSignals =
      current === normalizedTitle
      || /\bflagged\b/i.test(current)
      || /\b\d+\s*\/\s*\d+\b/.test(current)
      || /\(\d+(?:\.\d+)?%\)/.test(current)
      || /\s-\s/.test(lines[index])

    if (
      hasHeadingSignals
      && (
        previous === ''
        || /\bflagged\b/i.test(current)
        || /\b\d+\s*\/\s*\d+\b/.test(current)
        || normalizedTitle === 'general site information'
      )
    ) {
      return true
    }

    if (
      current.includes(normalizedTitle)
      && (/\?$/.test(next) || /^(is|are|has|number of|location of|evidence of|fire drill)\b/i.test(next))
    ) {
      return true
    }

    return false
  }

  const findHeadingOffset = (title: string): number | null => {
    for (let i = 0; i < lines.length; i += 1) {
      if (isSectionHeadingCandidate(i, title)) return offsets[i]
    }
    return null
  }

  const hits: Array<{ key: keyof Omit<ExtractSectionMap, 'full'>; index: number }> = []
  for (const def of sectionDefs) {
    const index = findHeadingOffset(def.title)
    if (typeof index === 'number' && index >= 0) {
      hits.push({ key: def.key, index })
    }
  }

  hits.sort((a, b) => a.index - b.index)

  const sections: ExtractSectionMap = { full: normalizedText }
  for (let i = 0; i < hits.length; i += 1) {
    const current = hits[i]
    const next = hits[i + 1]
    const start = current.index
    const end = next ? next.index : normalizedText.length
    sections[current.key] = normalizedText.slice(start, end).trim()
  }

  return sections
}

function combineUniqueNarratives(parts: Array<string | null | undefined>): string | null {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const part of parts) {
    const normalized = normalizeWhitespace(part || '')
      .replace(/^[:\-\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(normalized)
  }

  return merged.length ? merged.join(' ') : null
}

function findAnchorLineIndex(sectionText: string, anchorRegex: RegExp): number {
  const safeRegex = toFlexibleWhitespaceRegex(anchorRegex)
  const match = safeRegex.exec(sectionText)
  if (!match || typeof match.index !== 'number') return -1
  return sectionText.slice(0, match.index).split(/\r\n?|\n/).length - 1
}

function parseAnchoredQuestionBlock(
  sectionText: string,
  anchorRegex: RegExp,
  options?: { maxLines?: number; skipLinePatterns?: RegExp[] }
): ParsedAnchoredQuestion {
  const lines = normalizeLines(sectionText)
  const anchorIndex = findAnchorLineIndex(sectionText, anchorRegex)
  if (anchorIndex < 0) {
    return { answer: null, comment: null, windowText: '' }
  }

  const maxLines = options?.maxLines ?? 18
  let answer: ParsedAnchoredQuestion['answer'] = null
  const commentParts: string[] = []
  const windowParts: string[] = []
  const safeRegex = toFlexibleWhitespaceRegex(anchorRegex)

  const anchorLine = normalizeWhitespace(lines[anchorIndex] || '')
  if (anchorLine) {
    windowParts.push(anchorLine)
  }

  const anchorRemainderRaw = normalizeWhitespace(anchorLine.replace(safeRegex, '').replace(/^[:\-\s]+/, ''))
  const { before: anchorRemainder } = splitBeforeNextQuestionBoundary(anchorRemainderRaw)
  if (anchorRemainder) {
    const standaloneAnswer = anchorRemainder.match(/^(yes|no|n\/a|na)$/i)
    if (standaloneAnswer) {
      const raw = standaloneAnswer[1].toLowerCase()
      answer = raw === 'yes' ? 'yes' : raw === 'no' ? 'no' : 'na'
    } else {
      commentParts.push(anchorRemainder)
    }
  }

  for (let i = anchorIndex + 1; i < lines.length && i <= anchorIndex + maxLines; i += 1) {
    const rawLine = normalizeWhitespace(lines[i])
    const { before, hitBoundary } = splitBeforeNextQuestionBoundary(rawLine)
    const line = before
    if (!line) continue

    if (options?.skipLinePatterns?.some((re) => re.test(line))) {
      windowParts.push(line)
      continue
    }

    if (isPhotoOnlyLine(line) || isSectionHeadingLine(line)) break
    if (i > anchorIndex && isLikelyNewQuestionLine(line)) break

    windowParts.push(line)

    const standaloneAnswer = line.match(/^(yes|no|n\/a|na)$/i)
    if (standaloneAnswer) {
      const raw = standaloneAnswer[1].toLowerCase()
      answer = raw === 'yes' ? 'yes' : raw === 'no' ? 'no' : 'na'
      break
    }

    const leadingAnswer = line.match(/^(yes|no|n\/a|na)\b(?:\s*[:\-]\s*(.*))?$/i)
    if (leadingAnswer) {
      const raw = leadingAnswer[1].toLowerCase()
      answer = raw === 'yes' ? 'yes' : raw === 'no' ? 'no' : 'na'
      if (leadingAnswer[2]) commentParts.push(leadingAnswer[2])
      break
    }

    commentParts.push(line)
    if (hitBoundary) break
  }

  const comment = normalizeWhitespace(
    commentParts
      .join(' ')
      .replace(safeRegex, ' ')
      .replace(/\bPhoto\s+\d+(?:\s+Photo\s+\d+)*/gi, ' ')
      .replace(/^[:\-\s]+/, '')
  ) || null

  return {
    answer,
    comment,
    windowText: normalizeWhitespace(windowParts.join(' ')),
  }
}

export function parseYesNoQuestionBlock(
  text: string,
  questionRegex: RegExp
): ParsedYesNoQuestion {
  const safeRegex = toFlexibleWhitespaceRegex(questionRegex)
  const questionMatch = safeRegex.exec(text)
  if (!questionMatch || questionMatch.index === undefined) {
    return { answer: null, comment: null }
  }

  const lines = normalizeLines(text)
  const anchorLineIndex = text.slice(0, questionMatch.index).split(/\r\n?|\n/).length - 1
  let answer: ParsedYesNoQuestion['answer'] = null
  const commentParts: string[] = []

  for (let i = anchorLineIndex + 1; i < lines.length && i <= anchorLineIndex + 18; i += 1) {
    const rawLine = normalizeWhitespace(lines[i])
    const { before, hitBoundary } = splitBeforeNextQuestionBoundary(rawLine)
    const line = before
    if (!line) continue
    if (isPhotoOnlyLine(line)) continue
    if (isSectionHeadingLine(line)) break
    if (i > anchorLineIndex + 1 && isLikelyNewQuestionLine(line)) break

    const standaloneAnswer = line.match(/^(yes|no|n\/a|na)$/i)
    if (standaloneAnswer) {
      const raw = standaloneAnswer[1].toLowerCase()
      answer = raw === 'yes' ? 'yes' : raw === 'no' ? 'no' : 'na'
      break
    }

    const leadingAnswer = line.match(/^(yes|no|n\/a|na)\b(?:\s*[:\-]\s*(.*))?$/i)
    if (leadingAnswer) {
      const raw = leadingAnswer[1].toLowerCase()
      answer = raw === 'yes' ? 'yes' : raw === 'no' ? 'no' : 'na'
      if (leadingAnswer[2]) commentParts.push(leadingAnswer[2])
      break
    }

    commentParts.push(line)
    if (hitBoundary) break
  }

  const comment = sanitizeAnchoredValue(
    commentParts
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )

  return {
    answer,
    comment: comment || null,
  }
}

function toDisplayAnswer(answer: ParsedYesNoQuestion['answer']): string | null {
  if (answer === 'yes') return 'Yes'
  if (answer === 'no') return 'No'
  if (answer === 'na') return 'N/A'
  return null
}

function extractNumericAfterAnchoredLabel(sectionText: string, anchorRegex: RegExp): string | null {
  const lines = normalizeLines(sectionText)
  const anchorIndex = findAnchorLineIndex(sectionText, anchorRegex)
  if (anchorIndex < 0) return null

  const safeRegex = toFlexibleWhitespaceRegex(anchorRegex)
  const sameLine = normalizeWhitespace(lines[anchorIndex] || '')
  const sameLineRemainder = normalizeWhitespace(
    sameLine
      .replace(safeRegex, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/under\s+the\s+age\s+of\s+\d+\s*yrs?/i, ' ')
      .replace(/^[:\-\s]+/, '')
  )
  const sameLineNumber = sameLineRemainder.match(/\b(\d+)\s*$/)?.[1] || sameLineRemainder.match(/\b(\d+)\b/)?.[1] || null
  if (sameLineNumber) return sameLineNumber

  for (let i = anchorIndex + 1; i < lines.length && i <= anchorIndex + 6; i += 1) {
    const line = normalizeWhitespace(lines[i])
    if (!line) continue
    if (isPhotoOnlyLine(line)) continue
    if (isLikelyGeneralSiteLabel(line) || isSectionHeadingLine(line) || (i > anchorIndex + 1 && isLikelyNewQuestionLine(line))) break
    const numeric = line.match(/\b(\d+)\b/)?.[1] || null
    if (numeric) return numeric
  }

  return null
}

function extractSquareFootageAfterAnchoredLabel(sectionText: string): string | null {
  const anchor = /square\s+footage\s+or\s+square\s+meterage\s+of\s+site/i
  const lines = normalizeLines(sectionText)
  const anchorIndex = findAnchorLineIndex(sectionText, anchor)
  if (anchorIndex < 0) return null

  const sameLine = normalizeWhitespace(lines[anchorIndex] || '')
  const sameLineCandidate = normalizeWhitespace(sameLine.replace(anchor, '').replace(/^[:\-\s]+/, ''))
  if (sameLineCandidate && isValidSquareFootageValue(sameLineCandidate)) {
    return sameLineCandidate
  }

  for (let i = anchorIndex + 1; i < lines.length && i <= anchorIndex + 8; i += 1) {
    const line = normalizeWhitespace(lines[i]).replace(/^[:\-\s]+/, '')
    if (!line) continue
    if (isPhotoOnlyLine(line)) continue
    if (isLikelyGeneralSiteLabel(line) || isSectionHeadingLine(line) || (i > anchorIndex + 1 && isLikelyNewQuestionLine(line))) break
    if (isValidSquareFootageValue(line)) return line
  }

  return null
}

function extractExplicitManagementReviewStatement(cleanedText: string): string | null {
  const directMatch = cleanedText.match(/management\s+review\s+statement\s*[:\-]\s*([^\n]+)/i)
  if (directMatch?.[1]) {
    const value = normalizeWhitespace(directMatch[1])
    if (value) return value
  }

  const lines = normalizeLines(cleanedText)
  const anchorIndex = findAnchorLineIndex(cleanedText, /management\s+review\s+statement/i)
  if (anchorIndex >= 0) {
    const captured: string[] = []
    for (let i = anchorIndex + 1; i < lines.length && i <= anchorIndex + 5; i += 1) {
      const line = normalizeWhitespace(lines[i])
      if (!line) continue
      if (isPhotoOnlyLine(line) || isSectionHeadingLine(line) || isLikelyNewQuestionLine(line)) break
      if (/^(yes|no|n\/a|na)$/i.test(line)) break
      captured.push(line)
    }
    const value = normalizeWhitespace(captured.join(' '))
    if (value) return value
  }

  const sentenceMatch = cleanedText.match(/this assessment has been informed by[^.!?\n]*(?:[.!?])/i)
  return sentenceMatch?.[0] ? normalizeWhitespace(sentenceMatch[0]) : null
}

function extractValueAfterAnchoredLabel(
  sectionText: string,
  anchorRegex: RegExp,
  options?: {
    maxLines?: number
    disallowLinePatterns?: RegExp[]
  }
): string | null {
  const lines = normalizeLines(sectionText)
  const anchorIndex = findAnchorLineIndex(sectionText, anchorRegex)
  if (anchorIndex < 0) return null

  const safeRegex = new RegExp(anchorRegex.source, anchorRegex.flags.replace(/g/g, ''))
  const maxLines = options?.maxLines ?? 6

  const sameLine = normalizeWhitespace(lines[anchorIndex] || '')
  const sameLineRemainderRaw = normalizeWhitespace(sameLine.replace(safeRegex, '').replace(/^[:\-\s]+/, ''))
  const { before: sameLineRemainder } = splitBeforeNextQuestionBoundary(sameLineRemainderRaw)
  if (
    sameLineRemainder
    && !options?.disallowLinePatterns?.some((re) => re.test(sameLineRemainder))
  ) {
    return sameLineRemainder
  }

  for (let i = anchorIndex + 1; i < lines.length && i <= anchorIndex + maxLines; i += 1) {
    const rawLine = normalizeWhitespace(lines[i])
    const { before, hitBoundary } = splitBeforeNextQuestionBoundary(rawLine)
    const line = before
    if (!line) continue
    if (isPhotoOnlyLine(line)) continue
    if (isSectionHeadingLine(line)) break
    if (i > anchorIndex && isLikelyNewQuestionLine(line)) break
    if (options?.disallowLinePatterns?.some((re) => re.test(line))) {
      if (hitBoundary) break
      continue
    }
    return line
  }

  return null
}

function extractCoLocatedPanelAndSwitchLocations(sectionText: string): {
  firePanelLocation: string | null
  emergencyLightingSwitch: string | null
} {
  const lines = normalizeLines(sectionText)
  const normalized = lines.map((line) => normalizeWhitespace(line)).filter(Boolean)
  if (!normalized.length) {
    return { firePanelLocation: null, emergencyLightingSwitch: null }
  }

  const panelAnchorIndex = normalized.findIndex((line) => /location\s+of\s+fire\s+panel/i.test(line))
  const switchAnchorIndex = normalized.findIndex((line) => /location\s+of\s+emergency\s+lighting\s+test\s+switch/i.test(line))
  const faultsAnchorIndex = normalized.findIndex((line) => /is\s+panel\s+free\s+of\s+faults/i.test(line))
  const anchorIndexes = [panelAnchorIndex, switchAnchorIndex, faultsAnchorIndex].filter((idx) => idx >= 0)
  if (!anchorIndexes.length) {
    return { firePanelLocation: null, emergencyLightingSwitch: null }
  }

  const start = Math.min(...anchorIndexes)
  const end = Math.min(normalized.length, start + 28)
  const candidateSet = new Set<string>()
  const candidates: string[] = []

  for (let i = start; i < end; i += 1) {
    const raw = normalized[i]
    if (!raw) continue
    if (
      /location\s+of\s+fire\s+panel/i.test(raw)
      || /location\s+of\s+emergency\s+lighting\s+test\s+switch/i.test(raw)
      || /is\s+panel\s+free\s+of\s+faults/i.test(raw)
      || /alarm\s+panel\s+photo/i.test(raw)
      || /emergency\s+lighting\s+switch\s+photo/i.test(raw)
      || /^(yes|no|n\/a|na)$/i.test(raw)
      || isPhotoOnlyLine(raw)
      || /\?$/.test(raw)
    ) {
      continue
    }

    const { before } = splitBeforeNextQuestionBoundary(raw)
    const cleaned = normalizeWhitespace(before)
      .replace(/^[:\-\s]+/, '')
      .replace(/[.]+$/, '')
    if (!cleaned) continue
    if (!isLikelyLocationText(cleaned)) continue
    const key = cleaned.toLowerCase()
    if (candidateSet.has(key)) continue
    candidateSet.add(key)
    candidates.push(cleaned)
  }

  if (candidates.length === 0) {
    return { firePanelLocation: null, emergencyLightingSwitch: null }
  }
  if (candidates.length === 1) {
    return { firePanelLocation: candidates[0], emergencyLightingSwitch: null }
  }

  return {
    firePanelLocation: candidates[0],
    emergencyLightingSwitch: candidates[candidates.length - 1],
  }
}

function extractBetweenAnchors(
  text: string,
  anchorRegex: RegExp,
  stopRegexes: RegExp[],
  options?: {
    maxChars?: number
    stripLeadingAnswer?: boolean
  }
): string | null {
  const safeAnchor = toFlexibleWhitespaceRegex(anchorRegex)
  const anchorMatch = safeAnchor.exec(text)
  if (!anchorMatch || typeof anchorMatch.index !== 'number') return null

  const start = anchorMatch.index + anchorMatch[0].length
  const maxChars = options?.maxChars ?? 500
  let window = text.slice(start, start + maxChars)

  let cutIndex = window.length
  for (const stopRegex of stopRegexes) {
    const safeStop = toFlexibleWhitespaceRegex(stopRegex)
    const stopMatch = safeStop.exec(window)
    if (!stopMatch || typeof stopMatch.index !== 'number') continue
    if (stopMatch.index < cutIndex) cutIndex = stopMatch.index
  }
  window = window.slice(0, cutIndex)

  let value = normalizeWhitespace(
    window
      .replace(/\bPhoto\s+\d+(?:\s+Photo\s+\d+)*/gi, ' ')
      .replace(/^\s*[:\-]?\s*/, '')
  )

  if (options?.stripLeadingAnswer !== false) {
    value = value.replace(/^(yes|no|n\/a|na)\b[:\-]?\s*/i, '').trim()
  }

  value = normalizeWhitespace(value)
  return value || null
}

function extractFireDrillDateFromAnchorBlock(
  text: string,
  config: ParserConfig
): { dateOrStatus: string | null; answer: 'yes' | 'no' | 'na' | null; block: string } {
  const anchorPatterns = [
    config.fireDrillAnchor,
    /fire\s+drill\s+has\s+been?\s+carried\s+out\s+in\s+the\s+past\s+6\s+months[\s\S]{0,80}?records?\s+available\s+on\s+site\s*\??/i,
  ]

  let match: RegExpExecArray | null = null
  for (const pattern of anchorPatterns) {
    match = pattern.exec(text)
    if (match) break
  }
  if (!match || typeof match.index !== 'number') {
    return { dateOrStatus: null, answer: null, block: '' }
  }

  const lines = normalizeLines(text)
  const anchorLineIndex = text.slice(0, match.index).split(/\r\n?|\n/).length - 1
  const blockParts: string[] = []
  for (let i = anchorLineIndex; i < lines.length && i <= anchorLineIndex + 16; i += 1) {
    const line = normalizeWhitespace(lines[i])
    if (!line) continue
    if (i > anchorLineIndex && isSectionHeadingLine(line)) break
    if (i > anchorLineIndex + 1 && isLikelyNewQuestionLine(line)) break
    blockParts.push(line)
  }

  const block = normalizeWhitespace(blockParts.join(' '))
  if (!block) return { dateOrStatus: null, answer: null, block: '' }

  const explicitDate = extractDateFromText(block)
  const yesNoMatch =
    block.match(/\?\s*(Yes|No|N\/A|NA)\b/i)?.[1]
    || block.match(/\b(Yes|No|N\/A|NA)\b/i)?.[1]
    || null
  const answer: 'yes' | 'no' | 'na' | null =
    !yesNoMatch ? null :
      yesNoMatch.toLowerCase() === 'yes' ? 'yes' :
      yesNoMatch.toLowerCase() === 'no' ? 'no' :
      'na'

  if (explicitDate) {
    return { dateOrStatus: explicitDate, answer, block }
  }

  if (
    (answer === 'yes' || /marked\s+as\s+completed\s*\(yes\)/i.test(block))
    && /no date|not been recorded|not recorded/i.test(block)
  ) {
    return {
      dateOrStatus: 'The fire drill is marked as completed (Yes) on the weekly check sheet, but no date has been recorded.',
      answer,
      block,
    }
  }

  return { dateOrStatus: null, answer, block }
}

function extractCompartmentationNarrativeFromAnchor(text: string): string | null {
  const anchorPatterns = [
    /structure\s+found\s+to\s+be\s+in\s+a\s+good\s+condition[\s\S]{0,140}?gaps?\s+from\s+area\s+to\s+area\?/i,
    /structure\s+found\s+to\s+be\s+in\s+a\s+good\s+condition[\s\S]{0,140}?ceiling\s+tiles?[\s\S]{0,80}\?/i,
  ]

  let anchorMatch: RegExpExecArray | null = null
  for (const pattern of anchorPatterns) {
    anchorMatch = pattern.exec(text)
    if (anchorMatch) break
  }
  if (!anchorMatch || typeof anchorMatch.index !== 'number') return null

  const lines = normalizeLines(text)
  const anchorLineIndex = text.slice(0, anchorMatch.index).split(/\r\n?|\n/).length - 1
  const captured: string[] = []
  let captureStarted = false

  const isQuestionFragment = (line: string): boolean => (
    /\?$/.test(line)
    || /structure\s+found\s+to\s+be\s+in\s+a\s+good\s+condition/i.test(line)
    || /would\s+compromise\s+fire\s+safety/i.test(line)
    || /\beg\s+missing\b/i.test(line)
    || /missing\s+.*(?:tiles?|gaps?\s+from\s+area\s+to\s+area)/i.test(line)
    || /gaps?\s+from\s+area\s+to\s+area/i.test(line)
  )

  for (let i = anchorLineIndex + 1; i < lines.length && i <= anchorLineIndex + 16; i += 1) {
    const rawLine = normalizeWhitespace(lines[i])
    const { before, hitBoundary } = splitBeforeNextQuestionBoundary(rawLine)
    const line = before
    if (!line) continue
    if (isPhotoOnlyLine(line)) continue
    if (isSectionHeadingLine(line)) break
    if ((i > anchorLineIndex + 1 && isLikelyNewQuestionLine(line) && captureStarted) || (hitBoundary && captureStarted)) break
    if (/^photo\b/i.test(line)) continue

    if (/^(yes|no|n\/a|na)$/i.test(line)) {
      if (hitBoundary && captureStarted) break
      continue
    }

    if (!captureStarted) {
      if (isQuestionFragment(line)) {
        continue
      }
      captureStarted = true
    }

    if (isQuestionFragment(line)) continue
    captured.push(line)

    if (captured.join(' ').length > 260 && /[.!?]$/.test(line)) break
    if (hitBoundary) break
  }

  const narrative = normalizeWhitespace(captured.join(' '))
  return narrative.length >= 20 ? narrative : null
}

function sanitizeStoreManagerName(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value || '')
  if (!normalized) return null

  const trimmed = normalized
    .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b[\s\S]*$/i, '')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}\b[\s\S]*$/i, '')
    .replace(/\baudit\s+completed\s+by\b[\s\S]*$/i, '')
    .replace(/\bprivate\s*&\s*confidential\b[\s\S]*$/i, '')
    .replace(/\b\d{1,2}:\d{2}\s*(?:am|pm|gmt|bst|utc)\b[\s\S]*$/i, '')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!trimmed || trimmed.length < 2) return null
  if (/^(yes|no|n\/a|na)$/i.test(trimmed)) return null
  return trimmed
}

function extractStoreManagerFromSignatureBlock(text: string): string | null {
  const signatureBlock = text.match(
    /signature\s*of\s*person\s*in\s*charge\s*of\s*store\s*at\s*time\s*of\s*assessment[.\s:]*([\s\S]{0,220})/i
  )?.[1]

  if (!signatureBlock) return null

  return sanitizeStoreManagerName(
    cutAtEarliestPattern(signatureBlock, [
      /\baudit\s+completed\s+by\b/i,
      /\bprivate\s*&\s*confidential\b/i,
    ])
  )
}

function getParserConfig(variant: FRAParserVariant): ParserConfig {
  return variant === 'andy_duplicate' ? ANDY_DUPLICATE_CONFIG : DEFAULT_CONFIG
}

export function extractFraPdfDataFromText(
  pdfText: string,
  options?: { variant?: FRAParserVariant }
): FraPdfExtractedData {
  const variant = options?.variant ?? 'default'
  const config = getParserConfig(variant)
  const originalText = pdfText
  const cleanedAuditText = preCleanAuditText(originalText)
  const sectionText = splitAuditSections(cleanedAuditText)
  const generalSiteText = sectionText.generalSiteInformation || cleanedAuditText
  const statutoryTestingText = sectionText.statutoryTesting || cleanedAuditText
  const fireSafetyText = sectionText.fireSafety || cleanedAuditText
  const trainingText = sectionText.training || cleanedAuditText
  const pdfExtractedData: FraPdfExtractedData = {}

  const storeManagerCandidates = [
    extractStoreManagerFromSignatureBlock(cleanedAuditText),
    extractStoreManagerFromSignatureBlock(originalText),
    sanitizeStoreManagerName(
      extractValueAfterAnchoredLabel(
        cleanedAuditText,
        /signature\s+of\s+person\s+in\s+charge\s+of\s+store\s+at\s+time\s+of\s+assessment/i,
        { maxLines: 2 }
      )
    ),
    sanitizeStoreManagerName(
      extractValueAfterAnchoredLabel(
        originalText,
        /signature\s+of\s+person\s+in\s+charge\s+of\s+store\s+at\s+time\s+of\s+assessment/i,
        { maxLines: 2 }
      )
    ),
    sanitizeStoreManagerName(
      originalText.match(/signature\s+of\s+person\s+in\s+charge\s+of\s+store\s+at\s+time\s+of\s+assessment[.\s:]*([^\n\r]+?)(?:audit\s+completed\s+by|private\s*&\s*confidential|$)/i)?.[1]
    ),
  ].filter(Boolean)

  if (storeManagerCandidates[0]) {
    pdfExtractedData.storeManager = storeManagerCandidates[0]
  }

  const labelWindowFirePanelLocation =
    extractBetweenAnchors(
      fireSafetyText,
      /location\s+of\s+fire\s+panel/i,
      [
        /alarm\s+panel\s+photo/i,
        /is\s+panel\s+free\s+of\s+faults/i,
        /location\s+of\s+emergency\s+lighting\s+test\s+switch/i,
      ],
      { maxChars: 260 }
    )
  const anchoredFirePanelLocation =
    sanitizeAnchoredValue(labelWindowFirePanelLocation, { asLocation: true })
    || sanitizeAnchoredValue(extractValueAfterAnchoredLabel(
      fireSafetyText,
      /location\s+of\s+fire\s+panel/i,
      {
        maxLines: 6,
        disallowLinePatterns: [
          /^alarm\s+panel\s+photo$/i,
          /^is\s+panel\s+free\s+of\s+faults/i,
        ],
      }
    ), { asLocation: true })
    || sanitizeAnchoredValue(extractValueAfterAnchoredLabel(
      cleanedAuditText,
      /location\s+of\s+fire\s+panel/i,
      {
        maxLines: 6,
        disallowLinePatterns: [
          /^alarm\s+panel\s+photo$/i,
          /^is\s+panel\s+free\s+of\s+faults/i,
        ],
      }
    ), { asLocation: true })

  if (anchoredFirePanelLocation) {
    pdfExtractedData.firePanelLocation = anchoredFirePanelLocation
  }

  const firePanelFaultsQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /is\s+panel\s+free\s+of\s+faults\s*\??/i,
    { maxLines: 10 }
  )
  const firePanelFaultsInline = normalizeWhitespace(
    extractBetweenAnchors(
      fireSafetyText,
      /is\s+panel\s+free\s+of\s+faults\s*\??/i,
      [
        /location\s+of\s+emergency\s+lighting\s+test\s+switch/i,
        /\bphoto\s+\d+\b/i,
        /private\s*&\s*confidential/i,
      ],
      { maxChars: 120, stripLeadingAnswer: false }
    ) || ''
  )
  const sanitizedPanelFaultComment = sanitizeAnchoredValue(firePanelFaultsQuestion.comment)
  if (firePanelFaultsQuestion.answer === 'no') {
    pdfExtractedData.firePanelFaults = sanitizedPanelFaultComment || 'Fault present at time of inspection'
  } else if (firePanelFaultsQuestion.answer === 'yes') {
    pdfExtractedData.firePanelFaults = sanitizedPanelFaultComment || 'No faults'
  } else if (/^yes\b/i.test(firePanelFaultsInline)) {
    pdfExtractedData.firePanelFaults = 'No faults'
  } else if (/^no\b/i.test(firePanelFaultsInline)) {
    pdfExtractedData.firePanelFaults = sanitizeAnchoredValue(
      firePanelFaultsInline.replace(/^no\b[:\-\s]*/i, '')
    ) || 'Fault present at time of inspection'
  } else {
    const panelFaultAnswer = sanitizeAnchoredValue(
      extractBetweenAnchors(
        fireSafetyText,
        /is\s+panel\s+free\s+of\s+faults\s*\??/i,
        [
          /location\s+of\s+emergency\s+lighting\s+test\s+switch/i,
          /\bphoto\s+\d+\b/i,
        ],
        { maxChars: 260 }
      )
    )
    if (panelFaultAnswer) {
      pdfExtractedData.firePanelFaults = panelFaultAnswer
    }
  }

  const switchLocationByLabelWindow = extractBetweenAnchors(
    fireSafetyText,
    /location\s+of\s+emergency\s+lighting\s+test\s+switch\s*(?:\([^)]*photograph[^)]*\))?/i,
    [
      /emergency\s+lighting\s+switch\s+photo/i,
      /private\s*&\s*confidential/i,
      /\bphoto\s+\d+\b/i,
    ],
    { maxChars: 220 }
  )
  const strictSwitchLocation =
    sanitizeAnchoredValue(switchLocationByLabelWindow, { asLocation: true })
    || sanitizeAnchoredValue(extractValueAfterAnchoredLabel(
      fireSafetyText,
      /location\s+of\s+emergency\s+lighting\s+test\s+switch\s*(?:\([^)]*photograph[^)]*\))?/i,
      {
        maxLines: 6,
        disallowLinePatterns: [
          /^emergency\s+lighting\s+switch\s+photo$/i,
        ],
      }
    ), { asLocation: true })
    || sanitizeAnchoredValue(extractValueAfterAnchoredLabel(
      cleanedAuditText,
      /location\s+of\s+emergency\s+lighting\s+test\s+switch\s*(?:\([^)]*photograph[^)]*\))?/i,
      {
        maxLines: 6,
        disallowLinePatterns: [
          /^emergency\s+lighting\s+switch\s+photo$/i,
        ],
      }
    ), { asLocation: true })

  if (strictSwitchLocation) {
    pdfExtractedData.emergencyLightingSwitch = strictSwitchLocation
  }

  const coLocatedLocations = extractCoLocatedPanelAndSwitchLocations(fireSafetyText)
  if (!pdfExtractedData.firePanelLocation && coLocatedLocations.firePanelLocation) {
    pdfExtractedData.firePanelLocation = coLocatedLocations.firePanelLocation
  }
  if (!pdfExtractedData.emergencyLightingSwitch && coLocatedLocations.emergencyLightingSwitch) {
    pdfExtractedData.emergencyLightingSwitch = coLocatedLocations.emergencyLightingSwitch
  }

  const extractedFloors =
    extractNumericAfterAnchoredLabel(generalSiteText, /number\s+of\s+floors/i)
    || extractNumericAfterLabel(generalSiteText, /number\s+of\s+floors/i)
    || extractNumericAfterLabel(cleanedAuditText, /number\s+of\s+floors/i)
  if (extractedFloors) {
    pdfExtractedData.numberOfFloors = extractedFloors
  }

  const conductedDate = extractConductedDateFromPdfText(originalText)
  if (conductedDate) {
    pdfExtractedData.conductedDate = conductedDate
  }

  const extractedStartTime = extractAssessmentStartTime(originalText)
  if (extractedStartTime) {
    pdfExtractedData.assessmentStartTime = extractedStartTime
  }

  const extractedSquareFootage =
    extractSquareFootageAfterAnchoredLabel(generalSiteText)
    || extractSquareFootageAfterAnchoredLabel(cleanedAuditText)
    || extractSquareFootageAfterLabel(cleanedAuditText)
  if (extractedSquareFootage) {
    pdfExtractedData.squareFootage = extractedSquareFootage
    pdfExtractedData.squareFootageSource = 'PDF'
  }

  const fireExitRoutesQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /fire\s+exit\s+routes\s+clear\s+and\s+unobstructed\s*\?/i,
    { maxLines: 12 }
  )
  if (fireExitRoutesQuestion.comment) {
    pdfExtractedData.escapeRoutesEvidence = sanitizeAnchoredValue(fireExitRoutesQuestion.comment) || fireExitRoutesQuestion.comment
  }
  if (fireExitRoutesQuestion.answer === 'no') {
    pdfExtractedData.escapeRoutesObstructed = 'yes'
  }
  if (!pdfExtractedData.escapeRoutesObstructed) {
    const explicitObstruction = originalText.match(/\b(?:fire\s+exit|escape\s+route|delivery\s+door)s?\b[\s\S]{0,80}\b(?:blocked|partially\s+blocked|restricted)\b/i)
    if (explicitObstruction && !/\bunobstructed\b/i.test(explicitObstruction[0])) {
      pdfExtractedData.escapeRoutesObstructed = 'yes'
    }
  }

  const combustibleStorageQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /combustible\s+materials\s+are\s+stored\s+correctly\s*\?/i,
    { maxLines: 14 }
  )
  if (combustibleStorageQuestion.answer === 'no') {
    pdfExtractedData.combustibleStorageEscapeCompromise =
      combustibleStorageQuestion.comment || 'Escape routes compromised'
    pdfExtractedData.combustibleStorageEscapeCompromiseFlag = 'yes'
  } else if (combustibleStorageQuestion.answer === 'yes') {
    pdfExtractedData.combustibleStorageEscapeCompromise =
      combustibleStorageQuestion.comment || 'OK'
    pdfExtractedData.combustibleStorageEscapeCompromiseFlag = 'no'
  } else if (combustibleStorageQuestion.comment) {
    pdfExtractedData.combustibleStorageEscapeCompromise = combustibleStorageQuestion.comment
  }

  const inductionTrainingQuestion = parseAnchoredQuestionBlock(
    trainingText,
    config.inductionTrainingAnchor,
    { maxLines: 16 }
  )
  const toolboxTrainingQuestion = parseAnchoredQuestionBlock(
    trainingText,
    config.toolboxTrainingAnchor,
    {
      maxLines: 18,
      skipLinePatterns: [
        /^manual handling$/i,
        /^housekeeping$/i,
        /^fire safety$/i,
        /^stepladders$/i,
      ],
    }
  )
  const fallbackInductionTrainingQuestion = !inductionTrainingQuestion.comment
    ? parseYesNoQuestionBlock(
        cleanedAuditText,
        config.inductionTrainingAnchor
      )
    : { answer: null, comment: null }
  const fallbackToolboxTrainingQuestion = !toolboxTrainingQuestion.comment
    ? parseYesNoQuestionBlock(
        cleanedAuditText,
        config.toolboxTrainingAnchor
      )
    : { answer: null, comment: null }

  const combinedTrainingNarrative = combineUniqueNarratives([
    inductionTrainingQuestion.comment,
    toolboxTrainingQuestion.comment,
    fallbackInductionTrainingQuestion.comment,
    fallbackToolboxTrainingQuestion.comment,
  ])
  if (combinedTrainingNarrative) {
    pdfExtractedData.fireSafetyTrainingNarrative = combinedTrainingNarrative
  }

  const trainingCompletionMatch =
    combinedTrainingNarrative?.match(/(\d{1,3}(?:\.\d+)?)\s*%/)
    || originalText.match(/(?:toolbox(?:\s+refresher)?\s+training|refresher\s+training|completion\s+rate)[\s\S]{0,180}?(\d{1,3}(?:\.\d+)?)\s*%/i)
    || originalText.match(/standing\s+at\s+(\d{1,3}(?:\.\d+)?)\s*%/i)
  if (trainingCompletionMatch?.[1]) {
    pdfExtractedData.trainingCompletionRate = trainingCompletionMatch[1]
  }
  if (
    inductionTrainingQuestion.answer === 'no'
    || toolboxTrainingQuestion.answer === 'no'
    || fallbackInductionTrainingQuestion.answer === 'no'
    || fallbackToolboxTrainingQuestion.answer === 'no'
    || (
      pdfExtractedData.trainingCompletionRate
      && Number.parseFloat(pdfExtractedData.trainingCompletionRate) < 100
    )
  ) {
    pdfExtractedData.fireSafetyTrainingShortfall = 'yes'
  }

  const fireDoorsClosedQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    config.fireDoorsClosedAnchor,
    { maxLines: 12 }
  )
  const fireDoorsConditionQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /fire\s+doors\s+in\s+a\s+good\s+condition\s*\?/i,
    { maxLines: 12 }
  )
  const intumescentQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /are\s+fire\s+door\s+intumescent\s+strips\s+in\s+place\s+and\s+intact/i,
    { maxLines: 14 }
  )
  const fireDoorNarrative =
    (intumescentQuestion.answer === 'no' ? intumescentQuestion.comment : null)
    || (fireDoorsClosedQuestion.answer === 'no' ? fireDoorsClosedQuestion.comment : null)
    || combineUniqueNarratives([
      fireDoorsConditionQuestion.comment,
      intumescentQuestion.comment,
      fireDoorsClosedQuestion.comment,
    ])
    || combineUniqueNarratives([
      toDisplayAnswer(fireDoorsConditionQuestion.answer),
      toDisplayAnswer(intumescentQuestion.answer),
      toDisplayAnswer(fireDoorsClosedQuestion.answer),
    ])
  const intumescentDefectFallback = (() => {
    const match = fireSafetyText.match(/some\s+fire\s+doors?[\s\S]{0,260}?intumescent\s+strips?[\s\S]{0,180}?(?:missing|not\s+having|not\s+present|absent)[\s\S]{0,180}?(?:performance|exposure|escape|smoke|seal)?/i)
    if (!match?.[0]) return null
    const line = normalizeWhitespace(match[0])
    const { before } = splitBeforeNextQuestionBoundary(line)
    const cleaned = normalizeWhitespace(before).replace(/^[:\-\s]+/, '')
    return cleaned || null
  })()

  const finalFireDoorNarrative =
    intumescentDefectFallback
    || fireDoorNarrative
  if (finalFireDoorNarrative) {
    pdfExtractedData.fireDoorsCondition = finalFireDoorNarrative
  }
  if (fireDoorsClosedQuestion.answer === 'no') {
    pdfExtractedData.fireDoorsHeldOpen = 'yes'
  } else if (fireDoorsClosedQuestion.answer === 'yes') {
    pdfExtractedData.fireDoorsHeldOpen = 'no'
  }
  if (fireDoorsClosedQuestion.comment) {
    pdfExtractedData.fireDoorsHeldOpenComment = sanitizeAnchoredValue(fireDoorsClosedQuestion.comment) || fireDoorsClosedQuestion.comment
  }
  const fireDoorsBlockedMatch = originalText.match(
    /\b(fire door(?:s)?|door(?:s)?)\b[\s\S]{0,60}\b(blocked|obstructed|restricted|impeded|wedged)\b/i
  )
  if (fireDoorsBlockedMatch && !/\bnot blocked|unobstructed\b/i.test(fireDoorsBlockedMatch[0])) {
    pdfExtractedData.fireDoorsBlocked = 'yes'
  }

  const weeklyByLabelWindow = extractBetweenAnchors(
    fireSafetyText,
    /weekly\s+fire\s+tests?\s+carried\s+out\s+and\s+documented\s*\??/i,
    [
      config.fireDrillAnchor,
      /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test\s+being\s+conducted/i,
      /is\s+there\s+a\s+50mm\s+clearance\s+from\s+stock\s+to\s+sprinkler\s+head/i,
      /are\s+plugs\s+and\s+extension\s+leads\s+managed\s+and\s+not\s+overloaded/i,
      /location\s+of\s+fire\s+panel/i,
      /\bphoto\s+\d+\b/i,
    ],
    { maxChars: 360 }
  )
  const weeklyFireTestsQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /weekly\s+fire\s+tests?\s+carried\s+out\s+and\s+documented\s*\??/i,
    { maxLines: 12 }
  )
  if (weeklyByLabelWindow) {
    pdfExtractedData.weeklyFireTests = sanitizeAnchoredValue(weeklyByLabelWindow) || weeklyByLabelWindow
  } else if (weeklyFireTestsQuestion.comment) {
    pdfExtractedData.weeklyFireTests = sanitizeAnchoredValue(weeklyFireTestsQuestion.comment) || weeklyFireTestsQuestion.comment
  } else {
    const weeklyAnswer = toDisplayAnswer(weeklyFireTestsQuestion.answer)
    if (weeklyAnswer) pdfExtractedData.weeklyFireTests = weeklyAnswer
  }

  const monthlyByLabelWindow = extractBetweenAnchors(
    fireSafetyText,
    /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test\s+being\s+conducted\s*\??/i,
    [
      /is\s+there\s+a\s+50mm\s+clearance\s+from\s+stock\s+to\s+sprinkler\s+head/i,
      /are\s+plugs\s+and\s+extension\s+leads\s+managed\s+and\s+not\s+overloaded/i,
      /location\s+of\s+fire\s+panel/i,
      /store\s+compliance/i,
      /\bphoto\s+\d+\b/i,
    ],
    { maxChars: 360 }
  )
  const monthlyEmergencyLightingQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test\s+being\s+conducted\s*\??/i,
    { maxLines: 18 }
  )
  const monthlyEmergencyLightingComment =
    sanitizeAnchoredValue(monthlyByLabelWindow)
    || sanitizeAnchoredValue(monthlyEmergencyLightingQuestion.comment)
    || sanitizeAnchoredValue(parseAnchoredQuestionBlock(
      cleanedAuditText,
      /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test\s+being\s+conducted\s*\??/i,
      { maxLines: 18 }
    ).comment)

  if (monthlyEmergencyLightingComment) {
    pdfExtractedData.emergencyLightingMonthlyTest = monthlyEmergencyLightingComment
  } else {
    const monthlyLightingAnswer = toDisplayAnswer(monthlyEmergencyLightingQuestion.answer)
    if (monthlyLightingAnswer) pdfExtractedData.emergencyLightingMonthlyTest = monthlyLightingAnswer
  }

  const fireExtinguisherServiceQuestion = parseAnchoredQuestionBlock(
    statutoryTestingText,
    /fire\s+extinguisher\s+service\s*\?/i,
    { maxLines: 12 }
  )
  if (fireExtinguisherServiceQuestion.comment) {
    pdfExtractedData.fireExtinguisherService = fireExtinguisherServiceQuestion.comment
  } else {
    const extinguisherAnswer = toDisplayAnswer(fireExtinguisherServiceQuestion.answer)
    if (extinguisherAnswer) pdfExtractedData.fireExtinguisherService = extinguisherAnswer
  }
  const extinguisherDateFromQuestion = extractDateFromText(fireExtinguisherServiceQuestion.comment || '')
  if (extinguisherDateFromQuestion) {
    pdfExtractedData.extinguisherServiceDate = extinguisherDateFromQuestion
  }

  const explicitManagementReviewStatement = extractExplicitManagementReviewStatement(cleanedAuditText)
  pdfExtractedData.managementReviewStatement = explicitManagementReviewStatement
  pdfExtractedData.managementReviewStatementSource = explicitManagementReviewStatement ? 'PDF' : 'NOT_FOUND'

  const extractedFireExits =
    extractNumericAfterAnchoredLabel(generalSiteText, /number\s+of\s+fire\s+exits/i)
    || extractNumericAfterLabel(generalSiteText, /number\s+of\s+fire\s+exits/i)
  if (extractedFireExits) {
    pdfExtractedData.numberOfFireExits = extractedFireExits
  }

  const extractedTotalStaff =
    extractNumericAfterAnchoredLabel(generalSiteText, /number\s+of\s+staff\s+employed\s+at\s+the\s+site/i)
    || extractNumericAfterAnchoredLabel(generalSiteText, /number\s+of\s+staff\s+employed/i)
    || extractNumericAfterLabel(generalSiteText, /number\s+of\s+staff\s+employed/i)
  if (extractedTotalStaff) {
    pdfExtractedData.totalStaffEmployed = extractedTotalStaff
  }

  const extractedMaxStaff =
    extractNumericAfterAnchoredLabel(generalSiteText, /maximum\s+number\s+of\s+staff\s+working\s+on\s+site\s+at\s+any\s+one\s+time/i)
    || extractNumericAfterAnchoredLabel(generalSiteText, /maximum\s+number\s+of\s+staff\s+working/i)
    || extractNumericAfterLabel(generalSiteText, /maximum\s+number\s+of\s+staff\s+working/i)
  if (extractedMaxStaff) {
    pdfExtractedData.maxStaffOnSite = extractedMaxStaff
  }

  const extractedYoungPersons =
    extractNumericAfterAnchoredLabel(generalSiteText, /number\s+of\s+young\s+persons?[\s\S]{0,40}?employed/i)
    || extractNumericAfterAnchoredLabel(generalSiteText, /number\s+of\s+young\s+persons?/i)
    || extractNumericAfterLabel(generalSiteText, /number\s+of\s+young\s+persons?/i)
  if (extractedYoungPersons) {
    pdfExtractedData.youngPersonsCount = extractedYoungPersons
  }

  const fireDrillQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    config.fireDrillAnchor,
    { maxLines: 20 }
  )
  const fireDrillText = fireDrillQuestion.windowText || fireDrillQuestion.comment || ''
  let fireDrillAnswer = fireDrillQuestion.answer
  if (!fireDrillAnswer) {
    const inlineAnswer =
      fireDrillText.match(/\?\s*(Yes|No|N\/A|NA)\b/i)?.[1]
      || fireDrillText.match(/marked\s+as\s+completed\s*\((Yes|No|N\/A|NA)\)/i)?.[1]
      || fireDrillText.match(/\((Yes|No|N\/A|NA)\)/i)?.[1]
      || null
    if (inlineAnswer) {
      const lower = inlineAnswer.toLowerCase()
      fireDrillAnswer =
        lower === 'yes' ? 'yes' :
        lower === 'no' ? 'no' :
        'na'
    }
  }
  const fireDrillDateFromQuestion = extractDateFromText(fireDrillText)
  if (fireDrillDateFromQuestion) {
    pdfExtractedData.fireDrillDate = fireDrillDateFromQuestion
  } else if (/recorded\s+(?:on|in)\s+zip\s*line/i.test(fireDrillText)) {
    pdfExtractedData.fireDrillDate = 'Recorded on Zipline; latest fire drill date to be verified.'
  } else if (
    (
      fireDrillAnswer === 'yes'
      || /marked\s+as\s+completed\s*\(yes\)/i.test(fireDrillText)
    )
    && /no date|not been recorded|not recorded/i.test(fireDrillText)
  ) {
    pdfExtractedData.fireDrillDate =
      'The fire drill is marked as completed (Yes) on the weekly check sheet, but no date has been recorded.'
  }

  if (!pdfExtractedData.fireDrillDate) {
    const anchoredFireDrill = extractFireDrillDateFromAnchorBlock(fireSafetyText, config)
    if (anchoredFireDrill.dateOrStatus) {
      pdfExtractedData.fireDrillDate = anchoredFireDrill.dateOrStatus
    }
  }

  if (!pdfExtractedData.fireDrillDate) {
    const anchoredFireDrillFromFull = extractFireDrillDateFromAnchorBlock(cleanedAuditText, config)
    if (anchoredFireDrillFromFull.dateOrStatus) {
      pdfExtractedData.fireDrillDate = anchoredFireDrillFromFull.dateOrStatus
    }
  }

  if (!pdfExtractedData.fireDrillDate) {
    const fireDrillDatePatterns = [
      /(?:fire\s+drill|last\s+fire\s+drill|drill\s+was\s+actioned|evacuation\s+drill)[\s\S]{0,80}?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      /(?:fire\s+drill|last\s+fire\s+drill|drill.*carried\s+out|evacuation\s+drill)[\s\S]{0,80}?(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      /(?:fire\s+drill|last\s+fire\s+drill|drill.*carried\s+out|evacuation\s+drill)[\s\S]{0,80}?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
    ]

    for (const pattern of fireDrillDatePatterns) {
      const match = originalText.match(pattern)
      const parsed = extractDateFromText(match?.[1] || '')
      if (parsed) {
        pdfExtractedData.fireDrillDate = parsed
        break
      }
    }
  }

  const patQuestion = parseAnchoredQuestionBlock(
    statutoryTestingText,
    /\bpat\s*\?/i,
    { maxLines: 10 }
  )
  const patDateFromQuestion = extractDateFromText(patQuestion.comment || '')
  if (patQuestion.answer === 'yes') {
    pdfExtractedData.patTestingStatus = patDateFromQuestion
      ? `Satisfactory, last conducted ${patDateFromQuestion}`
      : (patQuestion.comment || 'Satisfactory')
  } else if (patQuestion.answer === 'no') {
    pdfExtractedData.patTestingStatus = patQuestion.comment || 'Unsatisfactory'
  }
  if (!pdfExtractedData.patTestingStatus) {
    const patYesMatch = statutoryTestingText.match(/\bpat\??[\s\S]{0,60}?(?:yes|satisfactory|passed|ok)/i)
    if (patYesMatch) {
      pdfExtractedData.patTestingStatus = 'Satisfactory'
    }
  }

  const fixedWiringQuestion = parseAnchoredQuestionBlock(
    statutoryTestingText,
    /fixed\s+electrical\s+wiring\s*\?/i,
    { maxLines: 10 }
  )
  const fixedWiringDateFromQuestion = extractDateFromText(fixedWiringQuestion.comment || '')
  if (fixedWiringDateFromQuestion) {
    pdfExtractedData.fixedWireTestDate = fixedWiringDateFromQuestion
  }
  if (!pdfExtractedData.fixedWireTestDate) {
    const fixedWireDatePatterns = [
      /(?:fixed electrical wiring|fixed wire|fixed wiring|fixed wire installation)[\s\S]{0,100}?(?:last tested|inspected and tested|tested|last conducted|conducted)[\s\S]{0,50}?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
      /(?:fixed electrical wiring|fixed wire|fixed wiring)[\s\S]{0,80}?(?:yes|satisfactory)[\s\S]{0,80}?last (?:tested|conducted)[\s\S]{0,30}?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
      /(?:electrical installation|fixed wiring)[\s\S]{0,60}?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
      /(?:fixed electrical wiring|fixed wire|fixed wiring)[\s\S]{0,120}?last\s+conducted[\s\S]{0,30}?(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
    ]
    for (const pattern of fixedWireDatePatterns) {
      const match = statutoryTestingText.match(pattern) || originalText.match(pattern)
      const parsed = extractDateFromText(match?.[1] || '')
      if (parsed) {
        pdfExtractedData.fixedWireTestDate = parsed
        break
      }
    }
  }

  if (originalText.match(/(?:exit sign|signage|fire exit sign).*?(?:good|satisfactory|clear|visible|yes|ok)/i)
    || originalText.match(/(?:signage).*?(?:installed|visible|clearly|in place)/i)
    || originalText.match(/(?:fire exit.*sign|emergency.*sign).*?(?:good|satisfactory|visible|yes)/i)
    || originalText.match(/(?:signs.*visible|signage.*adequate|signage.*good)/i)) {
    pdfExtractedData.exitSignageCondition = 'Good condition'
  }

  const extractCompartmentationStatusFromText = (text: string): string | null => {
    const sentences = text
      .replace(/\r/g, '\n')
      .split(/[\n.?!]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    const issueSentence = sentences.find((sentence) => {
      const lower = sentence.toLowerCase()
      const hasIssueSignal = /missing ceiling tiles?|ceiling tiles? missing|breach(?:es)?|gaps? from area to area|c\s*wiling\s+tiles?|compartmentation[\s\S]{0,40}?(?:damage|breach|issue)/i.test(sentence)
      if (!hasIssueSignal) return false
      if (lower.includes('e.g. missing') || lower.includes('eg missing')) return false
      if (/^structure\s+found\s+to\s+be\s+in\s+a\s+good\s+condition/i.test(lower)) return false
      if (/\bno missing\b|\bno breaches\b|\bno evidence of damage\b|\bno evident breaches\b/.test(lower)) return false
      return true
    })

    if (issueSentence) {
      return issueSentence.replace(/\s+/g, ' ').replace(/[.]+$/, '')
    }

    const noBreachDetected = /(?:ceiling tile|compartmentation|fire stopping|structure|structural)[\s\S]{0,120}?(?:no missing|no breaches|no evidence of damage|no obvious damage|intact|satisfactory|good condition|no evident breaches)/i.test(text)
    return noBreachDetected ? 'No breaches identified' : null
  }

  const compartmentationByLabelWindow = sanitizeCompartmentationText(
    extractBetweenAnchors(
      fireSafetyText,
      /structure\s+found\s+to\s+be\s+in\s+a\s+good\s+condition[\s\S]{0,120}?(?:ceiling\s+tiles?|gaps?\s+from\s+area\s+to\s+area)\s*\??/i,
      [
        /fire\s+exit\s+routes\s+clear\s+and\s+unobstructed/i,
        /are\s+all\s+fire\s+extinguishers?\s+clear\s+and\s+easily\s+accessible/i,
        /are\s+all\s+call\s+points\s+clear\s+and\s+easily\s+accessible/i,
        /weekly\s+fire\s+tests?\s+carried\s+out\s+and\s+documented/i,
        /fire\s+drill\s+has\s+been\s+carried\s+out/i,
        /records?\s+available\s+on\s+site\?/i,
        /recorded\s+(?:on|in)\s+zip\s*line/i,
        /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test/i,
        /is\s+there\s+a\s+50mm\s+clearance\s+from\s+stock\s+to\s+sprinkler\s+head/i,
        /are\s+plugs\s+and\s+extension\s+leads\s+managed\s+and\s+not\s+overloaded/i,
        /location\s+of\s+fire\s+panel/i,
        /\bphoto\s+\d+\b/i,
      ],
      { maxChars: 520 }
    )
  )

  const anchoredCompartmentationNarrative =
    sanitizeCompartmentationText(extractCompartmentationNarrativeFromAnchor(cleanedAuditText))
    || sanitizeCompartmentationText(extractCompartmentationNarrativeFromAnchor(originalText))
  const anchoredCompartmentationQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /structure\s+found\s+to\s+be\s+in\s+a\s+good\s+condition[\s\S]{0,120}?(?:ceiling\s+tiles?|gaps?\s+from\s+area\s+to\s+area)\s*\??/i,
    { maxLines: 12 }
  )
  const anchoredCompartmentationComment = sanitizeCompartmentationText(anchoredCompartmentationQuestion.comment)
  const isQuestionFragmentOnly =
    !!anchoredCompartmentationComment
    && /(?:missing\s+ceiling\s+tiles?|c\s*wiling\s+tiles?|gaps?\s+from\s+area\s+to\s+area)/i.test(anchoredCompartmentationComment)
    && !/(?:there are|overall|building|structure|no obvious damage|no evident breaches|no breaches|no evidence)/i.test(anchoredCompartmentationComment)

  if (compartmentationByLabelWindow) {
    pdfExtractedData.compartmentationStatus = compartmentationByLabelWindow
  } else if (anchoredCompartmentationNarrative) {
    pdfExtractedData.compartmentationStatus = anchoredCompartmentationNarrative
  } else if (anchoredCompartmentationComment && !isQuestionFragmentOnly) {
    pdfExtractedData.compartmentationStatus = anchoredCompartmentationComment
  } else {
    const compartmentationQuestion = parseAnchoredQuestionBlock(
      cleanedAuditText,
      /structure\s+found\s+to\s+be\s+in\s+a\s+good\s+condition[\s\S]{0,80}?missing\s+ceiling\s+tiles?\s*\/\s*gaps?\s+from\s+area\s+to\s+area\?/i,
      { maxLines: 10 }
    )
    const fallbackCompartmentationComment = sanitizeCompartmentationText(compartmentationQuestion.comment)
    const fallbackLooksLikeQuestionOnly =
      !!fallbackCompartmentationComment
      && /(?:missing\s+ceiling\s+tiles?|c\s*wiling\s+tiles?|gaps?\s+from\s+area\s+to\s+area)/i.test(fallbackCompartmentationComment)
      && !/(?:there are|overall|building|structure|no obvious damage|no evident breaches|no breaches|no evidence)/i.test(fallbackCompartmentationComment)
    if (fallbackCompartmentationComment && fallbackCompartmentationComment.length > 20 && !fallbackLooksLikeQuestionOnly) {
      pdfExtractedData.compartmentationStatus = fallbackCompartmentationComment
    } else {
      const compartmentationStatusFromText = sanitizeCompartmentationText(extractCompartmentationStatusFromText(originalText))
      if (compartmentationStatusFromText) {
        pdfExtractedData.compartmentationStatus = compartmentationStatusFromText
      }
    }
  }

  if (!pdfExtractedData.extinguisherServiceDate) {
    const extinguisherServicePatterns = [
      /(?:extinguisher.*service|fire extinguisher.*service|last service.*extinguisher)[\s\S]{0,50}?(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      /(?:extinguisher)[\s\S]{0,50}?serviced[\s\S]{0,30}?(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      /(?:extinguisher.*service|fire extinguisher.*service)[\s\S]{0,50}?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
      /(?:fire extinguisher service)[\s\S]{0,100}?(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
    ]
    for (const pattern of extinguisherServicePatterns) {
      const match = originalText.match(pattern)
      const parsed = extractDateFromText(match?.[1] || '')
      if (parsed) {
        pdfExtractedData.extinguisherServiceDate = parsed
        break
      }
    }
  }

  const callPointByLabelWindow = extractBetweenAnchors(
    fireSafetyText,
    /are\s+all\s+call\s+points\s+clear\s+and\s+easily\s+accessible/i,
    [
      /weekly\s+fire\s+tests?\s+carried\s+out\s+and\s+documented/i,
      /weekly\s+fire\s+alarm\s+testing/i,
      /fire\s+drill\s+has\s+been\s+carried\s+out/i,
      /records?\s+available\s+on\s+site\?/i,
      /recorded\s+(?:on|in)\s+zip\s*line/i,
      /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test/i,
      /is\s+there\s+a\s+50mm\s+clearance\s+from\s+stock\s+to\s+sprinkler\s+head/i,
      /are\s+plugs\s+and\s+extension\s+leads\s+managed\s+and\s+not\s+overloaded/i,
      /location\s+of\s+fire\s+panel/i,
      /\bphoto\s+\d+\b/i,
    ],
    { maxChars: 320 }
  )
  const callPointQuestion = parseAnchoredQuestionBlock(
    fireSafetyText,
    /are\s+all\s+call\s+points\s+clear\s+and\s+easily\s+accessible/i,
    { maxLines: 10 }
  )
  const cleanedCallPointComment = normalizeWhitespace(
    (sanitizeAnchoredValue(callPointByLabelWindow) || sanitizeAnchoredValue(callPointQuestion.comment) || '')
      .replace(/\brecords?\s+available\s+on\s+site\?.*$/i, '')
      .replace(/\brecorded\s+(?:on|in)\s+zip\s*line.*$/i, '')
      .replace(/\bweekly\s+fire\s+tests?.*$/i, '')
      .replace(/\bfire\s+drill\s+has\s+been\s+carried\s+out.*$/i, '')
  )

  if (cleanedCallPointComment) {
    pdfExtractedData.callPointAccessibility = cleanedCallPointComment
  } else if (callPointQuestion.answer) {
    pdfExtractedData.callPointAccessibility =
      callPointQuestion.answer === 'yes'
        ? 'Accessible and unobstructed'
        : callPointQuestion.answer === 'no'
          ? 'Accessibility concerns identified'
          : 'N/A'
  }

  pdfExtractedData.firePanelLocation = sanitizeAnchoredValue(pdfExtractedData.firePanelLocation, { asLocation: true })
  pdfExtractedData.emergencyLightingSwitch = sanitizeAnchoredValue(pdfExtractedData.emergencyLightingSwitch, { asLocation: true })
  pdfExtractedData.firePanelFaults = sanitizeAnchoredValue(pdfExtractedData.firePanelFaults)
  pdfExtractedData.escapeRoutesEvidence = sanitizeAnchoredValue(pdfExtractedData.escapeRoutesEvidence)
  pdfExtractedData.fireDoorsCondition = sanitizeAnchoredValue(pdfExtractedData.fireDoorsCondition)
  pdfExtractedData.fireDoorsHeldOpenComment = sanitizeAnchoredValue(pdfExtractedData.fireDoorsHeldOpenComment)
  pdfExtractedData.weeklyFireTests = sanitizeAnchoredValue(pdfExtractedData.weeklyFireTests)
  pdfExtractedData.emergencyLightingMonthlyTest = sanitizeAnchoredValue(pdfExtractedData.emergencyLightingMonthlyTest)
  pdfExtractedData.callPointAccessibility = sanitizeAnchoredValue(pdfExtractedData.callPointAccessibility)
  pdfExtractedData.compartmentationStatus = sanitizeCompartmentationText(pdfExtractedData.compartmentationStatus)

  return pdfExtractedData
}

async function loadAllFraResponseRows(
  supabase: SupabaseClient<any>,
  instanceId: string
): Promise<FraResponseRow[]> {
  const { data } = await supabase
    .from('fa_audit_responses')
    .select('id, question_id, response_json, created_at')
    .eq('audit_instance_id', instanceId)
    .order('created_at', { ascending: false })

  return (data || []) as FraResponseRow[]
}

export function getLockedFraParserVariantFromResponses(
  responses: Array<{ response_json?: Record<string, unknown> | null }>
): FRAParserVariant | null {
  for (const response of responses) {
    const variant = normalizeFraParserVariant(response.response_json?.fra_parser_variant)
    if (variant) return variant
  }
  return null
}

async function ensureFraMetadataResponseRow(
  supabase: SupabaseClient<any>,
  instanceId: string,
  existingResponses: FraResponseRow[]
): Promise<FraResponseRow | null> {
  if (existingResponses[0]) return existingResponses[0]

  const { data: fraInstance } = await supabase
    .from('fa_audit_instances')
    .select('template_id')
    .eq('id', instanceId)
    .single()

  if (!fraInstance?.template_id) return null

  const { data: sections } = await supabase
    .from('fa_audit_template_sections')
    .select('id')
    .eq('template_id', fraInstance.template_id)
    .order('order_index', { ascending: true })

  const firstSection = sections?.[0]
  if (!firstSection?.id) return null

  const { data: firstQuestion } = await supabase
    .from('fa_audit_template_questions')
    .select('id')
    .eq('section_id', firstSection.id)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!firstQuestion?.id) return null

  const now = new Date().toISOString()
  const { data: inserted } = await supabase
    .from('fa_audit_responses')
    .insert({
      audit_instance_id: instanceId,
      question_id: firstQuestion.id,
      response_json: {},
      created_at: now,
    })
    .select('id, question_id, response_json, created_at')
    .single()

  return (inserted as FraResponseRow | null) || null
}

export async function ensureLockedFraParserVariant(params: {
  supabase: SupabaseClient<any>
  instanceId: string
  userId: string
  userFullName?: string | null
}): Promise<FRAParserVariant> {
  const { supabase, instanceId, userId, userFullName } = params
  const existingResponses = await loadAllFraResponseRows(supabase, instanceId)
  const lockedVariant = getLockedFraParserVariantFromResponses(existingResponses)
  if (lockedVariant) return lockedVariant

  let resolvedFullName = userFullName ?? null
  if (!resolvedFullName) {
    const { data: profile } = await supabase
      .from('fa_profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    resolvedFullName = profile?.full_name || null
  }

  const variant = resolveFraParserVariantFromUserName(resolvedFullName)
  const targetResponse = await ensureFraMetadataResponseRow(supabase, instanceId, existingResponses)
  if (!targetResponse?.id) return variant

  const existingJson =
    targetResponse.response_json && typeof targetResponse.response_json === 'object'
      ? targetResponse.response_json
      : {}

  const lockedAt =
    typeof existingJson.fra_parser_locked_at === 'string' && existingJson.fra_parser_locked_at
      ? existingJson.fra_parser_locked_at
      : new Date().toISOString()

  await supabase
    .from('fa_audit_responses')
    .update({
      response_json: {
        ...existingJson,
        fra_parser_variant: variant,
        fra_parser_locked_at: lockedAt,
      },
    })
    .eq('id', targetResponse.id)

  return variant
}
