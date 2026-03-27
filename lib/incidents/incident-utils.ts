const VISIT_REPORT_SOURCE_MARKER_PREFIX = 'Source visit report ID:'
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export type IncidentPersonRoleLabel =
  | 'Employee'
  | 'Public'
  | 'Contractor'
  | 'Near Miss'
  | 'Unknown'

export type IncidentPersonEntry = {
  name: string | null
  role: IncidentPersonRoleLabel
  involvement: string | null
  injured: boolean
  injuryDetails: string | null
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(source: Record<string, any> | null, keys: string[]): string | null {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function readBoolean(source: Record<string, any> | null, keys: string[]): boolean | null {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', 'yes', 'y'].includes(normalized)) return true
      if (['false', 'no', 'n'].includes(normalized)) return false
    }
  }
  return null
}

function normalizeRoleLabel(value: string | null | undefined): IncidentPersonRoleLabel | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (
    normalized.includes('employee') ||
    normalized.includes('staff') ||
    normalized.includes('colleague') ||
    normalized.includes('team')
  ) {
    return 'Employee'
  }
  if (
    normalized.includes('public') ||
    normalized.includes('offender') ||
    normalized.includes('customer') ||
    normalized.includes('suspect') ||
    normalized.includes('thief') ||
    normalized.includes('shoplifter')
  ) {
    return 'Public'
  }
  if (normalized.includes('contractor')) {
    return 'Contractor'
  }
  if (normalized.includes('near')) {
    return 'Near Miss'
  }
  if (normalized.includes('unknown')) {
    return 'Unknown'
  }
  return 'Unknown'
}

function extractPersonsValue(value: unknown): unknown {
  if (isRecord(value) && 'persons_involved' in value) {
    return value.persons_involved
  }
  return value
}

function extractIncidentCategory(value: unknown): string | null {
  if (!isRecord(value)) return null
  return readString(value, ['incident_category'])
}

function normalizePersonEntry(value: unknown): IncidentPersonEntry | null {
  if (!isRecord(value)) return null

  const injuryDetails = readString(value, ['injuryDetails', 'injury_details'])
  const injured = readBoolean(value, ['injured', 'isInjured']) ?? Boolean(injuryDetails)
  const role =
    normalizeRoleLabel(readString(value, ['role', 'personType', 'person_type', 'type'])) ||
    'Unknown'
  const name =
    readString(value, ['name', 'fullName', 'full_name']) ||
    [readString(value, ['firstName', 'first_name']), readString(value, ['lastName', 'last_name'])]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    null
  const involvement = readString(value, ['involvement', 'details', 'notes', 'summary'])

  if (!name && !involvement && role === 'Unknown' && !injured && !injuryDetails) {
    return null
  }

  return {
    name,
    role,
    involvement,
    injured,
    injuryDetails,
  }
}

function buildFallbackVisitReportPerson(
  source: Record<string, any> | null,
  incidentCategory: string | null
): IncidentPersonEntry | null {
  const hasVisitReportLink =
    String(source?.source || '').toLowerCase() === 'visit_report' ||
    Boolean(readString(source, ['visit_report_id', 'visitReportId']))
  const directRole =
    normalizeRoleLabel(readString(source, ['person_type', 'personType', 'type', 'role'])) ||
    null
  const name =
    readString(source, ['name', 'full_name', 'person_name']) ||
    [
      readString(source, ['first_name', 'firstName']),
      readString(source, ['last_name', 'lastName']),
    ]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    null
  const injuryDetails = readString(source, ['injury_details', 'injuryDetails'])
  const injured = readBoolean(source, ['injured', 'is_injured', 'isInjured']) ?? Boolean(injuryDetails)
  const involvement =
    readString(source, ['involvement', 'notes', 'summary']) ||
    (hasVisitReportLink ? 'Linked visit report incident.' : null)

  // Legacy visit-report incidents (created before injured person capture)
  // should default to Employee when injury is recorded but role is missing.
  const fallbackRole = injured ? 'Employee' : inferIncidentRole(source, incidentCategory)

  if (name || directRole || involvement || injured || injuryDetails) {
    return {
      name,
      role: directRole || fallbackRole,
      involvement,
      injured,
      injuryDetails,
    }
  }

  if (
    hasVisitReportLink ||
    (incidentCategory === 'security' &&
      (Boolean(source?.same_offenders_suspected) || Boolean(source?.violence_involved)))
  ) {
    return {
      name: null,
      role: 'Public',
      involvement: 'Public / offender involvement captured via linked visit report.',
      injured: false,
      injuryDetails: null,
    }
  }

  return null
}

function inferIncidentRole(
  source: Record<string, any> | null,
  incidentCategory: string | null
): IncidentPersonRoleLabel {
  const hasVisitReportLink =
    String(source?.source || '').toLowerCase() === 'visit_report' ||
    Boolean(readString(source, ['visit_report_id', 'visitReportId']))
  const explicitRole =
    normalizeRoleLabel(readString(source, ['person_type', 'personType', 'type', 'role'])) || null
  if (explicitRole) return explicitRole
  if (
    hasVisitReportLink ||
    (incidentCategory === 'security' &&
      (Boolean(source?.same_offenders_suspected) || Boolean(source?.violence_involved)))
  ) {
    return 'Public'
  }
  return 'Unknown'
}

export function getIncidentPeople(
  value: unknown,
  incidentCategory?: string | null
): IncidentPersonEntry[] {
  const personsValue = extractPersonsValue(value)
  const resolvedIncidentCategory = incidentCategory || extractIncidentCategory(value)

  if (Array.isArray(personsValue)) {
    const normalized = personsValue.map(normalizePersonEntry).filter(Boolean) as IncidentPersonEntry[]
    if (normalized.length > 0) return normalized
  }

  const meta = isRecord(personsValue) ? personsValue : null
  const listCandidate =
    (Array.isArray(meta?.people) ? meta.people : null) ||
    (Array.isArray(meta?.peopleInvolved) ? meta.peopleInvolved : null)

  if (Array.isArray(listCandidate)) {
    const normalized = listCandidate.map(normalizePersonEntry).filter(Boolean) as IncidentPersonEntry[]
    if (normalized.length > 0) return normalized
  }

  const fallbackPerson = buildFallbackVisitReportPerson(meta, resolvedIncidentCategory || null)
  return fallbackPerson ? [fallbackPerson] : []
}

export function getIncidentPersonLabel(
  value: unknown,
  incidentCategory?: string | null
): string {
  const people = getIncidentPeople(value, incidentCategory)
  if (people.length === 0) return 'Unknown'

  const uniqueRoles = Array.from(new Set(people.map((person) => person.role)))
  if (uniqueRoles.length === 1) return uniqueRoles[0]
  return `${uniqueRoles[0]} +${uniqueRoles.length - 1}`
}

export function getIncidentRoleBreakdown(
  value: unknown,
  incidentCategory?: string | null
): IncidentPersonRoleLabel[] {
  const people = getIncidentPeople(value, incidentCategory)
  if (people.length === 0) return ['Unknown']
  return people.map((person) => person.role)
}

export function extractLinkedVisitReportId(value: unknown): string | null {
  const personsValue = extractPersonsValue(value)
  const meta = isRecord(personsValue) ? personsValue : null
  const directId = readString(meta, ['visit_report_id', 'visitReportId'])

  if (directId && UUID_PATTERN.test(directId)) {
    const match = directId.match(UUID_PATTERN)
    return match ? match[0] : directId
  }

  const description = isRecord(value) ? readString(value, ['description']) : null
  if (!description) return null

  const match = description.match(
    new RegExp(`${VISIT_REPORT_SOURCE_MARKER_PREFIX}\\s*(${UUID_PATTERN.source})`, 'i')
  )
  return match?.[1] || null
}

export function buildVisitReportPdfUrl(reportId: string): string {
  return `/api/reports/visit-reports/${reportId}/pdf?mode=view`
}
