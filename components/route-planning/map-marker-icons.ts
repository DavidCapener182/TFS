import L from 'leaflet'

const GROUP_MARKER_COLORS: Record<string, string> = {
  Scotland: '#2f80ed',
  'North East': '#d94f70',
  'North West': '#0f9d8a',
  Manchester: '#2d6cdf',
  Liverpool: '#f97316',
  Birmingham: '#f3b23c',
  Yorkshire: '#8b5cf6',
  Wales: '#84cc16',
  London: '#c026d3',
  Midlands: '#2f6fed',
  'West Midlands': '#2563eb',
  'East Midlands': '#16a34a',
  'South East': '#334155',
  'South West': '#ec4899',
  'East of England': '#06b6d4',
  Ireland: '#ef4444',
  Other: '#64748b',
}

const DEFAULT_MARKER_COLOR = GROUP_MARKER_COLORS.Other
const markerIconCache = new Map<string, L.Icon>()

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function buildMarkerSvg(
  color: string,
  options: {
    selected?: boolean
    label?: string | null
  } = {}
) {
  const selected = Boolean(options.selected)
  const label = options.label ? options.label.trim().slice(0, 2) : ''
  const width = selected ? 38 : label ? 34 : 30
  const height = selected ? 54 : label ? 48 : 42
  const pinPath = 'M16 1C7.7 1 1 7.7 1 16c0 12.3 14.1 29.2 15 30.4c0.9-1.2 15-18.1 15-30.4C31 7.7 24.3 1 16 1Z'
  const innerMarkup = label
    ? `<circle cx="16" cy="15.5" r="9" fill="rgba(255,255,255,0.22)" />
       <text x="16" y="19" text-anchor="middle" font-family="Arial, sans-serif" font-size="${label.length > 1 ? 8.5 : 10}" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>`
    : `<circle cx="16" cy="15.5" r="8" fill="rgba(255,255,255,0.26)" />
       <circle cx="16" cy="15.5" r="3.2" fill="#ffffff" />`

  return {
    width,
    height,
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 32 48" fill="none">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="rgba(15,23,42,0.35)" />
          </filter>
        </defs>
        <g filter="url(#shadow)">
          <path d="${pinPath}" fill="${color}" stroke="${selected ? '#ffffff' : 'rgba(255,255,255,0.72)'}" stroke-width="${selected ? 2.5 : 1.6}" />
          ${innerMarkup}
        </g>
      </svg>
    `.trim(),
  }
}

function createMarkerIcon(
  color: string,
  options: {
    selected?: boolean
    label?: string | null
  } = {}
) {
  const label = options.label ? options.label.trim().slice(0, 2) : ''
  const cacheKey = `${color}|${options.selected ? 'selected' : 'default'}|${label || 'dot'}`
  const cachedIcon = markerIconCache.get(cacheKey)
  if (cachedIcon) return cachedIcon

  const { svg, width, height } = buildMarkerSvg(color, options)
  const icon = L.icon({
    iconUrl: toDataUrl(svg),
    iconRetinaUrl: toDataUrl(svg),
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), height],
    popupAnchor: [0, -height + 10],
    className: 'tfs-map-marker',
  })

  markerIconCache.set(cacheKey, icon)
  return icon
}

export function getGroupMarkerColor(group: string | null | undefined): string {
  return GROUP_MARKER_COLORS[group || ''] || DEFAULT_MARKER_COLOR
}

export function getGroupMarkerIcon(
  group: string | null | undefined,
  options: {
    selected?: boolean
  } = {}
) {
  return createMarkerIcon(getGroupMarkerColor(group), options)
}

export function getRouteStopMarkerIcon(stopNumber: number) {
  return createMarkerIcon('#3b82f6', { label: String(stopNumber) })
}

export function getSolidMarkerIcon(color: string, options: { selected?: boolean } = {}) {
  return createMarkerIcon(color, options)
}
