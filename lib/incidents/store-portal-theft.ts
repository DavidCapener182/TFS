/**
 * Store portal submits theft as `tfs_incidents` with structured `persons_involved`.
 * LP "live cases" can hide rows once follow-up is marked complete without closing the incident.
 */

export function getStorePortalTheftPersonsMeta(personsInvolved: unknown): Record<string, unknown> | null {
  if (!personsInvolved || typeof personsInvolved !== 'object' || Array.isArray(personsInvolved)) return null
  const meta = personsInvolved as Record<string, unknown>
  if (meta.reportType !== 'theft' || meta.source !== 'store_portal') return null
  return meta
}

export function isStorePortalTheftIncident(incident: { persons_involved?: unknown }): boolean {
  return Boolean(getStorePortalTheftPersonsMeta(incident.persons_involved))
}

export function isStorePortalTheftFollowUpComplete(incident: { persons_involved?: unknown }): boolean {
  const meta = getStorePortalTheftPersonsMeta(incident.persons_involved)
  if (!meta) return false
  return meta.theftFollowUpComplete === true
}

/** Open store-portal thefts that still need LP follow-up (shown in Incidents live cases + nav badge). */
export function shouldShowStorePortalTheftInLiveCases(incident: {
  persons_involved?: unknown
  status?: string | null
}): boolean {
  if (!isStorePortalTheftIncident(incident)) return true
  const status = String(incident.status || '').toLowerCase()
  if (status === 'closed' || status === 'cancelled') return false
  return !isStorePortalTheftFollowUpComplete(incident)
}

export function effectiveSeverityForDisplay(incident: {
  persons_involved?: unknown
  severity?: string | null
}): string {
  if (isStorePortalTheftIncident(incident)) return 'low'
  return String(incident.severity || 'low')
}
