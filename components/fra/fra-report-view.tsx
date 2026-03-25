'use client'

/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Save, Loader2, Upload, X } from 'lucide-react'
import {
  buildFRAConsistencyNarratives,
  FRA_RISK_CONSEQUENCE_ORDER,
  FRA_RISK_LIKELIHOOD_ORDER,
  FRA_RISK_MATRIX,
  type FRAOverallRisk,
  type FRARiskConsequence,
  type FRARiskFindings,
  type FRARiskLikelihood,
} from '@/lib/fra/risk-rating'
import { getFraAssessmentReference } from '@/lib/utils'

/** Parse floor area string to sq ft. Supports values in sq ft and m². */
function parseFloorAreaSqFt(s: string | null | undefined): number | null {
  if (!s || typeof s !== 'string') return null

  const trimmed = s.trim()
  const numericToken = trimmed.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!numericToken) return null

  const numericValue = parseFloat(numericToken[1])
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null

  const hasSqFtUnit = /\b(?:sq\.?\s*ft|sqft|ft2|ft²|square\s*feet)\b/i.test(trimmed)
  const hasM2Unit = /\b(?:m²|m2|sq\.?\s*m|sqm|square\s*met(?:re|er)s?)\b/i.test(trimmed)

  if (hasSqFtUnit) return numericValue
  if (hasM2Unit) return numericValue * 10.7639

  return numericValue <= 1000 ? numericValue * 10.7639 : numericValue
}

/** Occupancy and capacity for retail using standard and peak sq ft densities. */
function occupancyFromFloorArea(areaSqFt: number): string {
  const roundedAreaSqFt = Math.round(areaSqFt)
  const standardPeople = Math.round(areaSqFt / 60)
  const peakPeople = Math.round(areaSqFt / 30)
  const areaLabel = roundedAreaSqFt.toLocaleString('en-GB')

  return [
    `Standard (60 sq ft/person): ${areaLabel} sq ft ÷ 60 = ~${standardPeople} people`,
    `Peak (30 sq ft/person): ${areaLabel} sq ft ÷ 30 = ~${peakPeople} people`,
  ].join('\n')
}

/** True if occupancy is the default text or a previously calculated value (so we should recalc from floor area). */
function isOccupancyDerivedFromFloorArea(occupancy: string | null | undefined): boolean {
  if (!occupancy || occupancy === 'To be calculated based on floor area') return true
  const normalized = occupancy.trim().toLowerCase()
  const isLegacyPattern = /^approximately \d+ persons based on 2 m² per person$/i.test(
    occupancy.trim()
  )
  const isRetailSqFtPattern =
    normalized.includes('standard (60 sq ft/person)') &&
    normalized.includes('peak (30 sq ft/person)')
  return isLegacyPattern || isRetailSqFtPattern
}

function parseFloorCount(value: string | null | undefined): number | null {
  if (!value) return null
  const raw = String(value).trim().toLowerCase()
  const digitMatch = raw.match(/\d+/)
  if (digitMatch) {
    const parsed = parseInt(digitMatch[0], 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  if (/\bone\b/.test(raw)) return 1
  if (/\btwo\b/.test(raw)) return 2
  if (/\bthree\b/.test(raw)) return 3
  if (/\bfour\b/.test(raw)) return 4
  if (/\bfive\b/.test(raw)) return 5
  return null
}

function floorLayoutPhrase(floorCount: number | null): string {
  if (!floorCount || floorCount <= 1) return 'a single level (ground floor)'
  if (floorCount === 2) return 'two levels (ground and first floors)'
  if (floorCount === 3) return 'three levels (ground, first and second floors)'
  return `${floorCount} levels (ground floor and upper floors)`
}

function defaultPremisesDescriptionLine(numberOfFloors: string | null | undefined): string {
  const floorCount = parseFloorCount(numberOfFloors)
  if (!floorCount || floorCount <= 1) {
    return 'The premises operates over one level (Ground Floor) and comprises a main sales floor to the front of the unit with associated back-of-house areas to the rear, including stockroom, office and staff welfare facilities.'
  }

  const floorNames =
    floorCount === 2
      ? 'Ground Floor and First Floor'
      : floorCount === 3
        ? 'Ground Floor, First Floor and Second Floor'
        : `Ground Floor and ${floorCount - 1} upper level(s)`

  return `The premises is arranged over ${floorCount} level(s) (${floorNames}) and comprises a main sales floor to the front of the unit with associated back-of-house areas to the rear, including stockroom, office and staff welfare facilities.`
}

// Dynamically import the map component to avoid SSR issues
const StoreMap = dynamic(() => import('./store-map'), { ssr: false })

interface FRAData {
  clientName: string
  premises: string
  address: string
  responsiblePerson: string
  ultimateResponsiblePerson: string
  appointedPerson: string
  assessorName: string
  assessmentDate: string | null
  assessmentStartTime: string | null
  assessmentEndTime: string | null
  assessmentReviewDate: string | null
  buildDate: string
  storeOpeningTimes: string | null
  accessDescription: string | null
  hasSprinklers: boolean
  propertyType: string
  description: string
  /** When set (e.g. from custom data), used for Adjacent occupancies; otherwise derived from description */
  adjacentOccupancies?: string | null
  numberOfFloors: string
  floorArea: string
  floorAreaComment: string | null
  occupancy: string
  occupancyComment: string | null
  operatingHours: string
  operatingHoursComment: string | null
  photos: any[] | null
  sleepingRisk: string
  internalFireDoors: string
  historyOfFires: string
  fireAlarmDescription: string
  fireAlarmPanelLocation: string
  fireAlarmPanelLocationComment: string | null
  fireAlarmPanelFaults: string
  fireAlarmPanelFaultsComment: string | null
  fireAlarmMaintenance: string
  emergencyLightingDescription: string
  emergencyLightingTestSwitchLocation: string
  emergencyLightingTestSwitchLocationComment: string | null
  emergencyLightingMaintenance: string
  fireExtinguishersDescription: string
  fireExtinguisherService: string
  sprinklerDescription: string
  sprinklerClearance: string
  sourcesOfIgnition: string[]
  sourcesOfFuel: string[]
  sourcesOfOxygen: string[]
  peopleAtRisk: string[]
  significantFindings: string[]
  recommendedControls: string[]
  /** Evidence-led: obstructed escape routes observation (from H&S audit/PDF). When set, shown in FRA Report. */
  escapeRoutesEvidence?: string | null
  /** Evidence-led: fire safety training narrative (shortfall vs standard). */
  fireSafetyTrainingNarrative?: string
  /** When set, shown under Assessment review: "This assessment has been informed by recent health and safety inspections and site observations." */
  managementReviewStatement?: string | null
  /** Brief COSHH reference for Sources of fuel (e.g. "COSHH is managed under a separate assessment."). */
  sourcesOfFuelCoshhNote?: string
  // High priority H&S audit fields
  numberOfFireExits?: string | null
  totalStaffEmployed?: string | null
  maxStaffOnSite?: string | null
  youngPersonsCount?: string | null
  fireDrillDate?: string | null
  patTestingStatus?: string | null
  /** Fixed wire installation inspected/tested date (from audit). */
  fixedWireTestDate?: string | null
  // Medium priority H&S audit fields
  exitSignageCondition?: string | null
  compartmentationStatus?: string | null
  extinguisherServiceDate?: string | null
  callPointAccessibility?: string | null
  store: any
  hsAuditDate: string | null
  fraInstance: any
  _sources?: Record<string, string>
  riskRatingLikelihood?: 'Low' | 'Normal' | 'High'
  riskRatingConsequences?: 'Slight Harm' | 'Moderate Harm' | 'Extreme Harm'
  summaryOfRiskRating?: string
  actionPlanLevel?: string
  riskRatingRationale?: string[]
  fireFindings?: FRARiskFindings
  actionPlanItems?: Array<{ recommendation: string; priority: 'Low' | 'Medium' | 'High'; dueNote?: string }>
  /** Intumescent strips on fire doors present (custom toggle). When false, an action plan item is added. */
  intumescentStripsPresent?: boolean
  sitePremisesPhotos?: any[]
  /** Uploaded photos per placeholder (from storage), so they appear after refresh and in PDF */
  placeholderPhotos?: Record<string, { file_path: string; public_url: string }[]>
}

interface FRAReportViewProps {
  data: FRAData
  onDataUpdate?: () => void
  /** When true, show print header/footer on screen (for print preview) */
  showPrintHeaderFooter?: boolean
}

type UploadMode = 'append' | 'replace'

const MAX_UPLOAD_IMAGE_DIMENSION = 1800
const MAX_UPLOAD_IMAGE_BYTES = 2 * 1024 * 1024
const COMPRESSION_QUALITIES = [0.78, 0.68, 0.58]

function buildCompressedFileName(originalName: string, mimeType: string): string {
  const baseName = originalName.replace(/\.[^/.]+$/, '')
  if (mimeType === 'image/jpeg') return `${baseName}.jpg`
  if (mimeType === 'image/png') return `${baseName}.png`
  return originalName
}

async function loadImageForCompression(file: File): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }
    img.src = objectUrl
  })
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return await new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function optimizeImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  if (typeof window === 'undefined') return file

  try {
    const img = await loadImageForCompression(file)
    const originalWidth = img.naturalWidth || img.width
    const originalHeight = img.naturalHeight || img.height
    const longEdge = Math.max(originalWidth, originalHeight)
    const scale = longEdge > MAX_UPLOAD_IMAGE_DIMENSION
      ? MAX_UPLOAD_IMAGE_DIMENSION / longEdge
      : 1
    const targetWidth = Math.max(1, Math.round(originalWidth * scale))
    const targetHeight = Math.max(1, Math.round(originalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    // fa-attachments bucket rejects image/webp in production, so always normalize
    // to broadly supported upload MIME types.
    const outputType = 'image/jpeg'
    let bestBlob: Blob | null = null

    for (const quality of COMPRESSION_QUALITIES) {
      const blob = await canvasToBlob(canvas, outputType, quality)
      if (!blob) continue
      bestBlob = blob
      if (blob.size <= MAX_UPLOAD_IMAGE_BYTES) {
        break
      }
    }

    if (!bestBlob) return file

    const unchangedSize = scale >= 1 && bestBlob.size >= file.size
    if (unchangedSize) return file

    return new File(
      [bestBlob],
      buildCompressedFileName(file.name, bestBlob.type),
      { type: bestBlob.type, lastModified: Date.now() }
    )
  } catch (error) {
    console.warn('Image compression skipped:', error)
    return file
  }
}

export function FRAReportView({ data, onDataUpdate, showPrintHeaderFooter }: FRAReportViewProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showDebug, setShowDebug] = useState(false) // Data source badges hidden by default
  const [showFirePlanPhoto, setShowFirePlanPhoto] = useState(true)
  const [customData, setCustomData] = useState({
    floorArea: data.floorArea,
    occupancy: data.occupancy,
    operatingHours: data.operatingHours,
    buildDate: data.buildDate ?? '',
    propertyType: data.propertyType ?? '',
    numberOfFloors: data.numberOfFloors ?? '',
    numberOfFireExits: data.numberOfFireExits ?? '',
    adjacentOccupancies: data.adjacentOccupancies ?? '',
    sleepingRisk: data.sleepingRisk ?? '',
    totalStaffEmployed: data.totalStaffEmployed ?? '',
    maxStaffOnSite: data.maxStaffOnSite ?? '',
    youngPersonsCount: data.youngPersonsCount ?? '',
    description: data.description ?? '',
    intumescentStripsPresent: data.intumescentStripsPresent ?? true,
  })
  const [uploadingPhotos, setUploadingPhotos] = useState<Record<string, boolean>>({})
  const [deletingPhotoPath, setDeletingPhotoPath] = useState<string | null>(null)
  const [placeholderPhotos, setPlaceholderPhotos] = useState<Record<string, any[]>>({})
  const [logoError, setLogoError] = useState(false)
  const lowerEscapeEvidence = String(data.escapeRoutesEvidence || '').toLowerCase()
  const lowerFireDoorText = `${String(data.internalFireDoors || '')} ${String(data.compartmentationStatus || '')}`.toLowerCase()
  const fallbackHeldOpenSentences = lowerFireDoorText.match(/[^.!?\n]*\b(held open|wedged open|propped open)\b[^.!?\n]*/gi) || []
  const fallbackHeldOpenSignal = fallbackHeldOpenSentences.some((sentence) => !/\bnot\b/i.test(sentence))
  const fallbackDoorBlockedSentences =
    lowerFireDoorText.match(/[^.!?\n]*\b(fire door(?:s)?|door(?:s)?)\b[^.!?\n]*\b(blocked|obstructed)\b[^.!?\n]*/gi)
    || lowerFireDoorText.match(/[^.!?\n]*\b(blocked|obstructed)\b[^.!?\n]*\b(fire door(?:s)?|door(?:s)?)\b[^.!?\n]*/gi)
    || []
  const fallbackDoorBlockedSignal = fallbackDoorBlockedSentences.some((sentence) => !/\b(not blocked|unobstructed|clear|free from obstruction)\b/i.test(sentence))
  const fallbackExplicitDoorSafeSignal = /\b(closed and not held open|not held open|not wedged|not propped open|in the close position)\b/.test(lowerFireDoorText)
  const fallbackFindings: FRARiskFindings = {
    escape_routes_obstructed: /\b(obstructed|blocked|restricted|compromised|impeded)\b/.test(lowerEscapeEvidence),
    fire_exits_obstructed: /\b(final exits?|fire exits?|exit doors?)\b[\s\S]{0,30}\b(obstructed|blocked|restricted|compromised|impeded)\b/.test(lowerEscapeEvidence),
    fire_doors_held_open: fallbackHeldOpenSignal && !fallbackExplicitDoorSafeSignal,
    fire_doors_blocked: fallbackDoorBlockedSignal && !fallbackExplicitDoorSafeSignal,
    combustibles_in_escape_routes: /\b(combustible|stock|packaging|cardboard)\b[\s\S]{0,40}\b(escape routes?|final exits?)\b/.test(lowerEscapeEvidence),
    combustibles_poorly_stored: false,
    fire_panel_access_obstructed: /\b(panel)\b[\s\S]{0,30}\b(blocked|obstructed|restricted)\b/.test(String(data.fireAlarmPanelLocation || '').toLowerCase()),
    fire_door_integrity_issues: /\b(missing|damaged|defect|breach|gap)\b/.test(lowerFireDoorText),
    housekeeping_poor_back_of_house: false,
    housekeeping_good: true,
    training_completion_rate: null,
    recent_fire_drill_within_6_months: null,
    emergency_lighting_tests_current: null,
    fire_alarm_tests_current: null,
    extinguishers_serviced_current: null,
  }
  const fireFindings = data.fireFindings ?? fallbackFindings
  const effectiveFloorCount = parseFloorCount(customData.numberOfFloors || data.numberOfFloors)
  const effectiveRiskLikelihood: FRARiskLikelihood = data.riskRatingLikelihood ?? 'Normal'
  const effectiveRiskConsequence: FRARiskConsequence = data.riskRatingConsequences ?? 'Moderate Harm'
  const matrixDerivedOverallRisk = FRA_RISK_MATRIX[effectiveRiskLikelihood][effectiveRiskConsequence]
  const effectiveOverallRisk = matrixDerivedOverallRisk
  const consistencyNarratives = buildFRAConsistencyNarratives(
    fireFindings,
    effectiveOverallRisk as FRAOverallRisk
  )
  const hasHighRiskTriggers =
    fireFindings.escape_routes_obstructed
    || fireFindings.fire_exits_obstructed
    || fireFindings.combustibles_in_escape_routes
    || fireFindings.fire_doors_held_open
    || fireFindings.fire_doors_blocked
  const effectiveOverallRiskLower = effectiveOverallRisk.toLowerCase()
  const overallRiskNarrative = effectiveOverallRiskLower === 'tolerable' || effectiveOverallRiskLower === 'low'
    ? 'indicating that existing controls are generally adequate; ongoing monitoring and routine management are required.'
    : effectiveOverallRiskLower === 'moderate'
      ? 'indicating that improvement actions are required to strengthen day-to-day fire safety controls and maintain compliance.'
      : effectiveOverallRiskLower === 'substantial'
        ? 'indicating significant control weaknesses requiring urgent corrective action and close management oversight.'
        : 'indicating unacceptable risk exposure requiring immediate remedial action.'
  const formattedAssessmentReviewDate = data.assessmentReviewDate
    ? new Date(data.assessmentReviewDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  // Rehydrate placeholder photos from server (so PDF and refresh show uploaded photos)
  useEffect(() => {
    if (data.placeholderPhotos && Object.keys(data.placeholderPhotos).length > 0) {
      setPlaceholderPhotos(data.placeholderPhotos)
    }
  }, [data.placeholderPhotos])

  // Debug badge component
  const DebugBadge = ({ source, fieldName }: { source?: string, fieldName: string }) => {
    if (!showDebug || !source) return null
    
    const sourceColors: Record<string, string> = {
      'H&S_AUDIT': 'bg-blue-100 text-blue-800 border-blue-300',
      'CUSTOM': 'bg-green-100 text-green-800 border-green-300',
      'DATABASE': 'bg-purple-100 text-purple-800 border-purple-300',
      'CHATGPT': 'bg-orange-100 text-orange-800 border-orange-300',
      'WEB_SEARCH': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'DEFAULT': 'bg-gray-100 text-gray-800 border-gray-300',
      'FRA_INSTANCE': 'bg-indigo-100 text-indigo-800 border-indigo-300',
      'H&S_AUDIT_CALCULATED': 'bg-blue-50 text-blue-700 border-blue-200',
      'FRA_INSTANCE_CALCULATED': 'bg-indigo-50 text-indigo-700 border-indigo-200',
      'H&S_AUDIT_MIXED': 'bg-cyan-100 text-cyan-800 border-cyan-300',
      'N/A': 'bg-slate-100 text-slate-600 border-slate-300',
    }
    
    const sourceLabels: Record<string, string> = {
      'H&S_AUDIT': 'H&S Audit',
      'CUSTOM': 'Custom Entry',
      'DATABASE': 'Database',
      'CHATGPT': 'ChatGPT',
      'WEB_SEARCH': 'Web Search',
      'DEFAULT': 'Default',
      'FRA_INSTANCE': 'FRA Instance',
      'H&S_AUDIT_CALCULATED': 'H&S Audit (Calculated)',
      'FRA_INSTANCE_CALCULATED': 'FRA Instance (Calculated)',
      'H&S_AUDIT_MIXED': 'H&S Audit (Mixed)',
      'N/A': 'N/A',
    }
    
    const colorClass = sourceColors[source] || 'bg-gray-100 text-gray-800 border-gray-300'
    const label = sourceLabels[source] || source
    
    return (
      <span 
        className={`ml-2 px-1.5 py-0.5 text-xs rounded border print:hidden ${colorClass}`}
        title={`${fieldName}: ${label}`}
      >
        {label}
      </span>
    )
  }

  // Traffic-light colours for risk badges: green = low, amber = normal/medium, red = high
  const getLikelihoodBadgeClass = (value: string | undefined) => {
    const v = (value ?? 'Normal').toLowerCase()
    if (v === 'low') return 'bg-green-600 text-white border-green-800'
    if (v === 'high') return 'bg-red-600 text-white border-red-800'
    return 'bg-amber-500 text-slate-900 border-amber-700'
  }
  const getConsequencesBadgeClass = (value: string | undefined) => {
    const v = (value ?? 'Moderate Harm').toLowerCase()
    if (v.includes('slight')) return 'bg-green-600 text-white border-green-800'
    if (v.includes('extreme')) return 'bg-red-600 text-white border-red-800'
    return 'bg-amber-500 text-slate-900 border-amber-700'
  }
  const getOverallRiskBadgeClass = (value: string | undefined) => {
    const v = (value ?? 'Tolerable').toLowerCase()
    if (v.includes('intolerable') || v.includes('unacceptable') || v === 'high') return 'bg-red-600 text-white border-red-800'
    if (v === 'tolerable' || v === 'low' || v === 'acceptable') return 'bg-green-600 text-white border-green-800'
    return 'bg-amber-500 text-slate-900 border-amber-700'
  }
  const getRiskMatrixCellClass = (value: string, selected: boolean) => {
    const v = value.toLowerCase()
    const base = selected ? 'ring-2 ring-slate-900 ring-inset font-black' : 'font-semibold'
    if (v.includes('intolerable')) return `${base} bg-red-600 text-white`
    if (v.includes('substantial')) return `${base} bg-orange-500 text-white`
    if (v.includes('moderate')) return `${base} bg-amber-300 text-slate-900`
    return `${base} bg-emerald-500 text-white`
  }

  // Update local state when data prop changes
  useEffect(() => {
    setCustomData({
      floorArea: data.floorArea,
      occupancy: data.occupancy,
      operatingHours: data.operatingHours,
      buildDate: data.buildDate ?? '',
      propertyType: data.propertyType ?? '',
      numberOfFloors: data.numberOfFloors ?? '',
      numberOfFireExits: data.numberOfFireExits ?? '',
      adjacentOccupancies: data.adjacentOccupancies ?? '',
      sleepingRisk: data.sleepingRisk ?? '',
      totalStaffEmployed: data.totalStaffEmployed ?? '',
      maxStaffOnSite: data.maxStaffOnSite ?? '',
      youngPersonsCount: data.youngPersonsCount ?? '',
      description: data.description ?? '',
      intumescentStripsPresent: data.intumescentStripsPresent ?? true,
    })
  }, [data.floorArea, data.occupancy, data.operatingHours, data.buildDate, data.propertyType, data.numberOfFloors, data.numberOfFireExits, data.adjacentOccupancies, data.sleepingRisk, data.totalStaffEmployed, data.maxStaffOnSite, data.youngPersonsCount, data.description, data.intumescentStripsPresent])

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/fra-reports/save-custom-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId: data.fraInstance.id,
          customData: customData,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save data')
      }

      // Re-fetch persisted data so the UI reflects exactly what is stored.
      if (onDataUpdate) {
        await onDataUpdate()
      }

      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (error: any) {
      console.error('Error saving custom data:', error)
      alert(`Failed to save: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleIntumescentStripsToggle = async (value: boolean) => {
    const previousValue = customData.intumescentStripsPresent
    const nextCustomData = { ...customData, intumescentStripsPresent: value }
    setCustomData(nextCustomData)
    try {
      const response = await fetch('/api/fra-reports/save-custom-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: data.fraInstance.id,
          customData: nextCustomData,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save')
      }

      if (onDataUpdate) {
        await onDataUpdate()
      }
    } catch (e: any) {
      setCustomData(prev => ({ ...prev, intumescentStripsPresent: previousValue }))
      alert(e?.message || 'Failed to save intumescent strips setting')
    }
  }

  const handlePhotoUpload = async (
    placeholderId: string,
    files: FileList | null,
    maxPhotos: number = 5,
    mode: UploadMode = 'append'
  ) => {
    if (!files || files.length === 0) return
    if (!data.fraInstance?.id) {
      alert('Cannot upload: report instance not loaded.')
      return
    }

    const fileArray = Array.from(files).slice(0, maxPhotos)

    setUploadingPhotos(prev => ({ ...prev, [placeholderId]: true }))

    try {
      const optimizedFiles: File[] = []
      for (const file of fileArray) {
        optimizedFiles.push(await optimizeImageForUpload(file))
      }

      const formData = new FormData()
      formData.append('instanceId', data.fraInstance.id)
      formData.append('placeholderId', placeholderId)
      formData.append('replace', mode === 'replace' ? 'true' : 'false')
      optimizedFiles.forEach(file => {
        formData.append('files', file)
      })

      const response = await fetch('/api/fra-reports/upload-photo', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = (result?.error ?? result?.details ?? 'Failed to upload photos') as string
        throw new Error(message)
      }

      setPlaceholderPhotos(prev => {
        const newFiles = Array.isArray(result?.files) ? result.files : []
        if (mode === 'replace') {
          return {
            ...prev,
            [placeholderId]: newFiles,
          }
        }
        return {
          ...prev,
          [placeholderId]: [...(prev[placeholderId] || []), ...newFiles],
        }
      })
      // Don't call onDataUpdate() here – it triggers a full refetch and loading state.
      // New photos are already in state above, so they show immediately.
    } catch (error: any) {
      console.error('Error uploading photos:', error)
      alert(`Failed to upload photos: ${error.message}`)
    } finally {
      setUploadingPhotos(prev => ({ ...prev, [placeholderId]: false }))
    }
  }

  const handlePhotoRemove = async (placeholderId: string, idx: number) => {
    const photos = placeholderPhotos[placeholderId] || []
    const photo = photos[idx]
    if (!photo?.file_path) {
      setPlaceholderPhotos(prev => ({
        ...prev,
        [placeholderId]: prev[placeholderId]?.filter((_, i) => i !== idx) || []
      }))
      return
    }
    setDeletingPhotoPath(photo.file_path)
    try {
      const response = await fetch('/api/fra-reports/delete-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: data.fraInstance.id,
          filePath: photo.file_path,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error((result?.error ?? result?.details ?? 'Failed to delete photo') as string)
      }
      setPlaceholderPhotos(prev => ({
        ...prev,
        [placeholderId]: prev[placeholderId]?.filter((_, i) => i !== idx) || []
      }))
    } catch (e: any) {
      console.error('Error deleting photo:', e)
      alert(e?.message || 'Failed to delete photo')
    } finally {
      setDeletingPhotoPath(null)
    }
  }

  const PhotoPlaceholder = ({ placeholderId, label, maxPhotos = 5, aspect = 'landscape', stacked = false, compact = false, fit = 'cover', fullHeight = false }: { placeholderId: string, label: string, maxPhotos?: number, aspect?: 'portrait' | 'landscape', stacked?: boolean, compact?: boolean, fit?: 'cover' | 'contain', fullHeight?: boolean }) => {
    const photos = placeholderPhotos[placeholderId] || []
    const isUploading = uploadingPhotos[placeholderId]
    const fileInputRef = useRef<HTMLInputElement>(null)
    const nextUploadModeRef = useRef<UploadMode>('append')
    const dragDepthRef = useRef(0)
    const [isDragActive, setIsDragActive] = useState(false)
    const isPortrait = aspect === 'portrait'

    const triggerFileInput = (mode: UploadMode = 'append') => {
      if (isUploading) return
      nextUploadModeRef.current = mode
      fileInputRef.current?.click()
    }

    const hasDraggedFiles = (event: React.DragEvent<HTMLDivElement>): boolean => {
      if (!event.dataTransfer) return false
      if (Array.from(event.dataTransfer.types || []).includes('Files')) return true
      return Array.from(event.dataTransfer.items || []).some((item) => item.kind === 'file')
    }

    const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      if (isUploading) return
      dragDepthRef.current += 1
      setIsDragActive(true)
    }

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      if (isUploading) return
      event.dataTransfer.dropEffect = 'copy'
      setIsDragActive(true)
    }

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDragActive(false)
      }
    }

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current = 0
      setIsDragActive(false)
      if (isUploading) return

      const droppedFiles = event.dataTransfer?.files || null
      handlePhotoUpload(placeholderId, droppedFiles, maxPhotos, 'append')
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const mode = nextUploadModeRef.current
      handlePhotoUpload(placeholderId, e.target.files, maxPhotos, mode)
      nextUploadModeRef.current = 'append'
      e.target.value = '' // allow re-selecting same file
    }

    const isGrid = (maxPhotos ?? 5) > 1
    const isContain = fit === 'contain'
    const imageWrapperClass = fullHeight && photos.length === 1
      ? 'w-full h-[420px] overflow-hidden rounded border border-slate-300'
      : isPortrait
        ? `aspect-[3/4] w-full overflow-hidden ${compact ? 'max-w-[220px]' : ''}`
        : ''
    const imageClass = fullHeight && photos.length === 1
      ? 'w-full h-full object-cover rounded border-0 print:object-cover print:w-full print:h-full'
      : isPortrait
      ? `w-full h-full ${isContain ? 'object-contain' : 'object-cover'} rounded border border-slate-300 print:object-contain print:w-full print:h-full`
      : `w-full h-48 ${isContain ? 'object-contain' : 'object-cover'} rounded border border-slate-300 print:object-contain print:w-full print:h-full`
    const emptyClass = fullHeight
      ? 'border-2 border-dashed border-slate-300 rounded p-4 h-[420px] w-full flex flex-col items-center justify-center text-slate-400 text-sm fra-photo-block'
      : isPortrait
        ? `border-2 border-dashed border-slate-300 rounded p-4 aspect-[3/4] w-full flex flex-col items-center justify-center text-slate-400 text-sm fra-photo-block ${compact ? 'max-w-[220px]' : ''}`
        : 'border-2 border-dashed border-slate-300 rounded p-4 h-48 flex flex-col items-center justify-center text-slate-400 text-sm fra-photo-block'

    return (
      <div
        className={`mt-4 ${compact ? 'max-w-[220px]' : ''} ${isDragActive ? 'rounded-lg ring-2 ring-blue-300 ring-offset-2 ring-offset-white' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
        {photos.length > 0 ? (
          <div className={photos.length === 1 ? 'flex justify-center' : stacked ? 'grid grid-cols-1 gap-2' : `grid grid-cols-2 md:grid-cols-3 gap-2 ${isGrid ? 'fra-photo-grid' : ''}`}>
            {photos.map((photo: any, idx: number) => (
              <div key={idx} className={`relative fra-photo-block ${photos.length === 1 && !fullHeight ? 'max-w-lg w-full' : ''} ${photos.length === 1 && fullHeight ? 'w-full' : ''} ${imageWrapperClass}`}>
                <img 
                  src={photo.public_url || photo.file_path} 
                  alt={`${label} ${idx + 1}`}
                  className={imageClass}
                />
                <button
                  type="button"
                  onClick={() => handlePhotoRemove(placeholderId, idx)}
                  disabled={deletingPhotoPath === photo.file_path}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 disabled:opacity-50 print:hidden"
                >
                  {deletingPhotoPath === photo.file_path ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={`fra-photo-placeholder-empty ${emptyClass}`}>
            <p className="mb-2">{label}</p>
            <p className="mb-3 text-xs text-slate-500">
              {isDragActive ? 'Drop photos to upload' : 'Drag and drop photos here, or use the button below.'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => triggerFileInput('append')}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Add Photos (1–{maxPhotos})
                </>
              )}
            </Button>
          </div>
        )}
        {photos.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 print:hidden">
            {photos.length < maxPhotos && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                className="flex items-center gap-2"
                onClick={() => triggerFileInput('append')}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Add More Photos
                  </>
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              className="flex items-center gap-2"
              onClick={() => triggerFileInput('replace')}
            >
              <Upload className="h-4 w-4" />
              Change photos
            </Button>
          </div>
        )}
      </div>
    )
  }

  const showHeaderFooter = showPrintHeaderFooter === true
  const headerFooterStyle: React.CSSProperties | undefined = showHeaderFooter
    ? {
        display: 'flex',
        position: 'fixed',
        left: 0,
        right: 0,
        background: '#fff',
        borderColor: '#cbd5e1',
        zIndex: 9999,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }
    : undefined
  const headerStyle: React.CSSProperties | undefined = showHeaderFooter
    ? {
        ...headerFooterStyle,
        top: 48, /* below print preview toolbar (preview uses full-screen overlay) */
        height: 44,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        fontSize: '11pt',
        fontWeight: 600,
        color: '#0f172a',
        borderBottom: '1px solid #cbd5e1',
      }
    : undefined
  const footerStyle: React.CSSProperties | undefined = showHeaderFooter
    ? {
        ...headerFooterStyle,
        bottom: 0,
        height: 28,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        fontSize: '9pt',
        color: '#64748b',
        borderTop: '1px solid #cbd5e1',
        boxShadow: '0 -1px 3px rgba(0,0,0,0.08)',
      }
    : undefined

  const printHeaderContent = (
    <>
      <span className="fra-report-print-logo flex items-center shrink-0">
        {logoError ? (
          <span className="font-semibold text-slate-800">KSS NW Ltd</span>
        ) : (
          <img
            src="/kss-logo.png"
            alt="KSS"
            className="h-8 w-auto object-contain"
            onError={() => setLogoError(true)}
          />
        )}
      </span>
      <span className="fra-report-print-title flex-1 text-center mx-3">Fire Risk Assessment</span>
      <span className="w-[80px] shrink-0" aria-hidden="true" />
    </>
  )
  const printFooterContent = (
    <>
      <span>{data.assessorName} – KSS NW Ltd</span>
      <span>{data.assessmentDate ? new Date(data.assessmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span>
    </>
  )

  const pdfFooterDate = data.assessmentDate ? new Date(data.assessmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
  return (
    <div
      id="print-root"
      className={`print-root min-h-screen bg-slate-100 print:bg-white fra-report-print-wrapper ${showHeaderFooter ? 'fra-print-preview-mode' : ''}`}
      data-pdf-premises={data.premises ?? ''}
      data-pdf-assessor={data.assessorName ?? ''}
      data-pdf-date={pdfFooterDate}
    >
      {/* On-screen preview: fixed header. Omit in print/PDF context so only per-page headers show (avoids double header on page 1). */}
      {!showHeaderFooter && (
        <header
          className="fra-report-print-header no-print"
          aria-hidden={!showHeaderFooter}
          style={headerStyle}
        >
          {printHeaderContent}
        </header>
      )}
      <div className="fra-report-print-content" style={showHeaderFooter ? { paddingTop: 92, paddingBottom: 36 } : undefined}>
      {/* Debug Toggle - only show in development, and never in print preview so preview matches print/PDF */}
      {process.env.NODE_ENV === 'development' && !showHeaderFooter && (
        <div className="fixed top-4 right-4 z-50 bg-white border border-slate-300 rounded-lg shadow-lg p-3 print:hidden">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              className="rounded"
            />
            <span>Show Data Sources</span>
          </label>
        </div>
      )}
      {/* Front Page – top: branding/title, middle: site (largest), lower: boxed details, footer */}
      <div className="fra-a4-page fra-print-page fra-front-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-front-page-body flex flex-col min-h-[calc(100vh-120px)]">
          {/* Top third: document type */}
          <div className="fra-front-page-title-band text-center mb-8 py-4">
            {logoError ? (
              <p className="text-lg font-semibold text-slate-700">KSS NW Ltd</p>
            ) : (
              <img
                src="/kss-logo.png"
                alt="KSS NW Ltd"
                className="h-10 w-auto mx-auto object-contain"
                onError={() => setLogoError(true)}
              />
            )}
            <h1 className="text-2xl font-bold text-slate-900 mt-4">Fire Risk Assessment</h1>
            <p className="text-base font-medium text-slate-600 mt-2">Life Safety Assessment – Retail Premises</p>
            <hr className="mt-3 w-24 mx-auto border-slate-300" />
          </div>

          {/* Middle: premises + address (largest text), very light grey behind for restraint */}
          <div className="fra-front-page-address-block flex-1 flex flex-col justify-center text-center mb-8 py-6 px-4 rounded-lg">
            <p className="fra-front-page-premises text-2xl md:text-3xl font-bold text-slate-900 leading-tight">{data.premises}</p>
            <p className="mt-3 text-lg text-slate-700 whitespace-pre-line max-w-xl mx-auto">{data.address}</p>
          </div>

          {/* Lower: boxed assessment details */}
          <div className="fra-front-page-details border border-slate-200 rounded-lg bg-slate-50/50 px-6 py-5 space-y-2 text-sm">
            <p><span className="font-semibold">Assessment Date:</span> {data.assessmentDate ? new Date(data.assessmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
            <p><span className="font-semibold">Review Date:</span> {data.assessmentReviewDate ? new Date(data.assessmentReviewDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
            <p><span className="font-semibold">Responsible Person:</span> {data.responsiblePerson}</p>
            <p><span className="font-semibold">Assessor:</span> {data.assessorName} – KSS NW Ltd</p>
          </div>

          <div className="fra-front-page-footer mt-auto pt-8 border-t border-slate-200 text-center text-xs text-slate-600 space-y-1">
            <p>Prepared in accordance with the Regulatory Reform (Fire Safety) Order 2005</p>
            <p>Prepared by KSS NW Ltd | Confidential</p>
            <p>Confidential – for the use of the client and relevant duty holders only.</p>
          </div>
        </div>
      </div>

      {/* Assessment Details (client, premises, responsibilities) */}
      <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Assessment Details</h2>
        </div>

        <div className="space-y-6 mb-8">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{data.premises}</h3>
            <div className="space-y-2 text-sm">
              <div><span className="font-semibold">Client Name:</span> {data.clientName}</div>
              <div><span className="font-semibold">Premises:</span> {data.premises}</div>
              <div className="whitespace-pre-line"><span className="font-semibold">Address:</span> {data.address}</div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="font-semibold">Responsible person (as defined by the Regulatory Reform (Fire Safety) Order 2005):</span> {data.responsiblePerson}
            </div>
            <div>
              <span className="font-semibold">Ultimate responsible person:</span> {data.ultimateResponsiblePerson}
            </div>
            <div>
              <span className="font-semibold">Appointed Person at {data.premises}:</span> {data.appointedPerson}
              <DebugBadge source={data._sources?.appointedPerson} fieldName="Appointed Person" />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Responsibilities of Appointed Person</h3>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Ensuring effective communication and coordination of emergency response arrangements</li>
              <li>Oversight of Fire Wardens and Fire Marshals</li>
              <li>Ensuring fire drills are conducted and recorded</li>
              <li>Ensuring staff fire safety training is completed and maintained</li>
              <li>Communicating non-compliance and concerns to Head Office</li>
              <li>Implementing and maintaining the site Fire Safety Plan</li>
            </ul>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="font-semibold">Name of person undertaking the assessment:</span> {data.assessorName} – KSS NW Ltd
            </div>
            <div>
              <span className="font-semibold">Assessment date:</span> {data.assessmentDate || 'Not specified'}
              <DebugBadge source={data._sources?.assessmentDate} fieldName="Assessment Date" />
            </div>
            {data.assessmentStartTime && (
              <div>
                <span className="font-semibold">Assessment start time:</span> {data.assessmentStartTime}
                <DebugBadge source={data._sources?.assessmentStartTime} fieldName="Assessment Start Time" />
              </div>
            )}
            {data.assessmentEndTime && (
              <div>
                <span className="font-semibold">Assessment end time:</span> {data.assessmentEndTime}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Photo of Site / Building / Premises + Table of Contents (one printed page) */}
      <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Photo of Site / Building / Premises</h2>
        <p className="text-sm text-slate-600 mb-4">Add screenshots or photos of the site, building and premises (e.g. from pages 3–6 of the reference FRA).</p>
        <PhotoPlaceholder
          placeholderId="site-premises-photos"
          label="Site / Building / Premises (Photo 1–6)"
          maxPhotos={6}
          fit="contain"
        />
        <h2 className="text-xl font-semibold mb-4 mt-8">Table of Contents</h2>
        <div className="fra-toc">
          <div className="fra-toc-list space-y-2 text-sm">
            <div className="fra-toc-item flex items-center justify-between"><span>Purpose of This Assessment</span><span className="ml-auto">2</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Regulatory Reform (Fire Safety) Order 2005 – Fire Risk Assessment</span><span className="ml-auto">3</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Travel Distances</span><span className="ml-auto">4</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Category L Fire Alarm Systems - Life Protection</span><span className="ml-auto">5</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Fire Resistance</span><span className="ml-auto">6</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Fire Risk Assessment – Terms, Conditions and Limitations</span><span className="ml-auto">7</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Scope of Assessment / Limitations / Enforcement / Specialist Advice / Liability</span><span className="ml-auto">7</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>About the Property</span><span className="ml-auto">9</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Stage 1 – Fire Hazards</span><span className="ml-auto">10</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Stage 2 – People at Risk</span><span className="ml-auto">10</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Stage 3 – Evaluate, remove, reduce and protect from risk</span><span className="ml-auto">10</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Fire Plan</span><span className="ml-auto">12</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Fire Risk Assessment Report</span><span className="ml-auto">13</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Risk Rating</span><span className="ml-auto">14</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Action Plan</span><span className="ml-auto">15</span></div>
            <div className="fra-toc-item flex items-center justify-between"><span>Additional Site Pictures / Appendices</span><span className="ml-auto">16</span></div>
          </div>
        </div>
      </div>

      {/* Purpose of This Assessment */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Purpose of This Assessment</h2>
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            The purpose of this Fire Risk Assessment is to provide a suitable and sufficient assessment of the risk
            to life from fire within the above premises and to confirm that appropriate fire safety measures are
            in place to comply with current fire safety legislation.
          </p>
          <p>
            This assessment relates solely to life safety and does not address business continuity or property
            protection.
          </p>
          <p>
            This document represents a live, operational Fire Risk Assessment and supersedes the pre-opening
            assumptions contained within the previous assessment.
          </p>
        </div>
        <figure className="fra-figure mt-6">
          <img
            src="/fire-safety-process-overview.png"
            alt="Fire safety process: Fire Detection, Alarm Activation, Escape Routes, Assembly Point, and Fire-Fighting Equipment"
            className="w-full max-w-2xl mx-auto rounded border border-slate-200 print:max-w-full"
          />
          <figcaption className="text-xs text-slate-600 mt-2 text-center italic">
            Figure 1: Overview of the fire safety process within the premises, from detection through to evacuation and assembly.
          </figcaption>
        </figure>
      </div>

      {/* Regulatory Reform (Fire Safety) Order 2005 – FIRE RISK ASSESSMENT (5 steps) */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <div className="bg-slate-100 border border-slate-300 rounded-lg p-6 mb-8 text-center">
          <h2 className="text-xl font-bold text-slate-900">Regulatory Reform (Fire Safety) Order 2005</h2>
          <h2 className="text-xl font-bold text-slate-900 mt-2">FIRE RISK ASSESSMENT</h2>
        </div>
        <div className="space-y-4 text-sm">
          <div className="border border-slate-300 rounded-lg p-4 bg-white">
            <div className="flex gap-3">
              <span className="font-bold text-slate-700 shrink-0">STEP 1:</span>
              <div>
                <p className="font-semibold uppercase text-slate-800">Identify fire hazards</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-slate-700">
                  <li>Sources of ignition</li>
                  <li>Sources of fuel</li>
                  <li>Work processes</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border border-slate-300 rounded-lg p-4 bg-white">
            <div className="flex gap-3">
              <span className="font-bold text-slate-700 shrink-0">STEP 2:</span>
              <p className="font-semibold uppercase text-slate-800">Identify the location of people at significant risk in case of fire</p>
            </div>
          </div>
          <div className="border border-slate-300 rounded-lg p-4 bg-white">
            <div className="flex gap-3">
              <span className="font-bold text-slate-700 shrink-0">STEP 3:</span>
              <div>
                <p className="font-semibold uppercase text-slate-800">Evaluate the risk</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-slate-700">
                  <li>Are existing fire safety measures adequate?</li>
                  <li>Control of ignition sources / sources of fuel</li>
                  <li>Fire detection / warning</li>
                  <li>Means of escape</li>
                  <li>Means of fighting fire</li>
                  <li>Maintenance and testing of fire precautions</li>
                  <li>Fire safety training for employees</li>
                  <li>Emergency services provisions and information</li>
                </ul>
                <p className="font-semibold uppercase text-slate-800 mt-3">Carry out any improvements needed</p>
              </div>
            </div>
          </div>
          <div className="border border-slate-300 rounded-lg p-4 bg-white">
            <div className="flex gap-3">
              <span className="font-bold text-slate-700 shrink-0">STEP 4:</span>
              <div>
                <p className="font-semibold uppercase text-slate-800">Record findings and action taken</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-slate-700">
                  <li>Prepare emergency plan</li>
                  <li>Inform, instruct and train employees in fire precautions</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border border-slate-300 rounded-lg p-4 bg-white">
            <div className="flex gap-3">
              <span className="font-bold text-slate-700 shrink-0">STEP 5:</span>
              <div>
                <p className="font-semibold uppercase text-slate-800">Keep assessment under review</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-slate-700">
                  <li>Revise if situation changes</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Travel Distances */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Travel Distances:</h2>
        <p className="text-sm leading-relaxed mb-4">
          The distance of travel should be measured as the actual distance between any point in the building and the nearest storey exit. Recommended maximum travel distances for escape are detailed below.
        </p>
        <div className="fra-keep fra-travel-distances-tables overflow-x-auto mt-4 space-y-4">
          <table className="fra-print-table w-full border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">No.</th>
                <th className="border border-slate-300 p-2 text-left">Category of risk</th>
                <th className="border border-slate-300 p-2 text-left">Distance of travel within room, work-room or enclosure</th>
                <th className="border border-slate-300 p-2 text-left">Total distance of travel</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="border border-slate-300 p-2 font-semibold bg-slate-50">TABLE A: Escape in more than one direction (Factories)</td></tr>
              <tr><td className="border border-slate-300 p-2">1</td><td className="border border-slate-300 p-2">High</td><td className="border border-slate-300 p-2">12m</td><td className="border border-slate-300 p-2">25m</td></tr>
              <tr><td className="border border-slate-300 p-2">2</td><td className="border border-slate-300 p-2">Normal</td><td className="border border-slate-300 p-2">25m</td><td className="border border-slate-300 p-2">45m</td></tr>
              <tr><td className="border border-slate-300 p-2">3</td><td className="border border-slate-300 p-2">Low</td><td className="border border-slate-300 p-2">35m</td><td className="border border-slate-300 p-2">60m</td></tr>
            </tbody>
          </table>
          <table className="fra-print-table w-full border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">No.</th>
                <th className="border border-slate-300 p-2 text-left">Category of risk</th>
                <th className="border border-slate-300 p-2 text-left">Distance of travel within room, work-room or enclosure</th>
                <th className="border border-slate-300 p-2 text-left">Total distance of travel</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="border border-slate-300 p-2 font-semibold bg-slate-50">TABLE B: Escape in one direction only (Factories)</td></tr>
              <tr><td className="border border-slate-300 p-2">4</td><td className="border border-slate-300 p-2">High</td><td className="border border-slate-300 p-2">6m</td><td className="border border-slate-300 p-2">12m</td></tr>
              <tr><td className="border border-slate-300 p-2">5</td><td className="border border-slate-300 p-2">Normal</td><td className="border border-slate-300 p-2">12m</td><td className="border border-slate-300 p-2">25m</td></tr>
              <tr><td className="border border-slate-300 p-2">6</td><td className="border border-slate-300 p-2">Low</td><td className="border border-slate-300 p-2">25m</td><td className="border border-slate-300 p-2">45m</td></tr>
            </tbody>
          </table>
          <table className="fra-print-table w-full border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">No.</th>
                <th className="border border-slate-300 p-2 text-left">Category of risk</th>
                <th className="border border-slate-300 p-2 text-left">Distance of travel within room, work-room or enclosure</th>
                <th className="border border-slate-300 p-2 text-left">Total distance of travel</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="border border-slate-300 p-2 font-semibold bg-slate-50">TABLE C: Escape in more than one direction (Shops)</td></tr>
              <tr><td className="border border-slate-300 p-2">1</td><td className="border border-slate-300 p-2">High</td><td className="border border-slate-300 p-2">12m</td><td className="border border-slate-300 p-2">25m</td></tr>
              <tr><td className="border border-slate-300 p-2">2</td><td className="border border-slate-300 p-2">Normal</td><td className="border border-slate-300 p-2">25m</td><td className="border border-slate-300 p-2">45m</td></tr>
            </tbody>
          </table>
          <table className="fra-print-table w-full border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">No.</th>
                <th className="border border-slate-300 p-2 text-left">Category of risk</th>
                <th className="border border-slate-300 p-2 text-left">Distance of travel within room, work-room or enclosure</th>
                <th className="border border-slate-300 p-2 text-left">Total distance of travel</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="border border-slate-300 p-2 font-semibold bg-slate-50">TABLE D: Escape in one direction only (Shops)</td></tr>
              <tr><td className="border border-slate-300 p-2">3</td><td className="border border-slate-300 p-2">High</td><td className="border border-slate-300 p-2">6m</td><td className="border border-slate-300 p-2">12m</td></tr>
              <tr><td className="border border-slate-300 p-2">4</td><td className="border border-slate-300 p-2">Normal</td><td className="border border-slate-300 p-2">12m</td><td className="border border-slate-300 p-2">25m</td></tr>
            </tbody>
          </table>
          <table className="fra-print-table w-full border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">No.</th>
                <th className="border border-slate-300 p-2 text-left">Category of risk</th>
                <th className="border border-slate-300 p-2 text-left">Distance of travel within room, work-room or enclosure</th>
                <th className="border border-slate-300 p-2 text-left">Total distance of travel</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="border border-slate-300 p-2 font-semibold bg-slate-50">TABLE E: Escape in more than one direction (Offices)</td></tr>
              <tr><td className="border border-slate-300 p-2">1</td><td className="border border-slate-300 p-2">Normal</td><td className="border border-slate-300 p-2">25m</td><td className="border border-slate-300 p-2">45m</td></tr>
            </tbody>
          </table>
          <table className="fra-print-table w-full border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">No.</th>
                <th className="border border-slate-300 p-2 text-left">Category of risk</th>
                <th className="border border-slate-300 p-2 text-left">Distance of travel within room, work-room or enclosure</th>
                <th className="border border-slate-300 p-2 text-left">Total distance of travel</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="border border-slate-300 p-2 font-semibold bg-slate-50">TABLE F: Escape in one direction only (Offices)</td></tr>
              <tr><td className="border border-slate-300 p-2">2</td><td className="border border-slate-300 p-2">Normal</td><td className="border border-slate-300 p-2">12m</td><td className="border border-slate-300 p-2">25m</td></tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-sm">
          <p className="mb-2">
            Where a room is an inner room (i.e. a room accessible only via an access room) the distance to the exit from the access room should be a maximum of:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>If the inner room is of &apos;high risk&apos; 6m</li>
            <li>If the access room is of &apos;normal risk&apos; 12m</li>
            <li>If the access room is of &apos;low risk&apos; 25m</li>
          </ul>
          <p className="mt-4 font-medium text-slate-700">
            Observed travel distances within the {data.premises} premises are consistent with the above guidance for a retail environment and do not exceed recommended maximums.
          </p>
        </div>
      </div>

      {/* Category L Fire Alarm Systems - Life Protection */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Category L Fire Alarm Systems - Life Protection</h2>
        <div className="space-y-3 text-sm leading-snug">
          <p>
            Life protection systems can be divided into various categories, L1, L2, L3, L4, L5.
          </p>
          <p>
            <strong>L1</strong> provides for Automatic Fire Detection (AFD) to be installed into all areas of a building.
          </p>
          <p>
            <strong>L2</strong> provides Automatic Fire Detection (AFD) as defined in L3 as well as high risk or hazardous areas. Examples of this could be Kitchens, boiler rooms, sleeping risk, storerooms if not fire resistant or if smoke could affect escape routes.
          </p>
          <p>
            <strong>L3</strong> Automatic Fire Detection (AFD) with smoke detection should be installed on escape routes with detection in rooms opening onto escape routes.
          </p>
          <p>
            <strong>L4</strong> provides Automatic Fire Detection (AFD) within escape routes only.
          </p>
          <p>
            <strong>L5</strong> is installed in building with a specific risk that has been identified. An example of this would be if there was an area of high risk that requires detection the category would be L5/M.
          </p>
        </div>
        <figure className="fra-figure mt-6">
          <img
            src="/fra-category-l-fire-alarm-systems.png"
            alt="Category L1, L2, L3, L4 and L5 fire alarm system floor plans showing smoke detector and manual call point placement"
            className="w-full max-w-4xl mx-auto rounded border border-slate-200 print:max-w-full"
          />
          <figcaption className="text-xs text-slate-500 mt-2 text-center">
            L1–L5 fire alarm system coverage: detector and manual call point placement by category.
          </figcaption>
          <p className="text-sm mt-3 font-medium text-slate-700 text-center">
            The installed fire alarm system at {data.premises} aligns with a Category L1 system providing life protection throughout the premises.
          </p>
        </figure>
      </div>

      {/* Fire Resistance */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Fire Resistance:</h2>
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            There are standards recommended for the fire resistance of the elements of a building structure (e.g. floors, walls etc.) and these are given in the table below.
          </p>
        </div>
        <div className="overflow-x-auto mt-6">
          <table className="fra-print-table w-full border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">Element being separated or protected</th>
                <th className="border border-slate-300 p-2 text-left">Walls (mins)</th>
                <th className="border border-slate-300 p-2 text-left">Fire-resisting doors (mins)</th>
                <th className="border border-slate-300 p-2 text-left">Floors (mins)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-2">Floor immediately over a basement</td><td className="border border-slate-300 p-2">—</td><td className="border border-slate-300 p-2">—</td><td className="border border-slate-300 p-2">60</td></tr>
              <tr><td className="border border-slate-300 p-2">All separating floors</td><td className="border border-slate-300 p-2">—</td><td className="border border-slate-300 p-2">—</td><td className="border border-slate-300 p-2">30 (1)</td></tr>
              <tr><td className="border border-slate-300 p-2">Separating a stairway</td><td className="border border-slate-300 p-2">30</td><td className="border border-slate-300 p-2">30 (2)</td><td className="border border-slate-300 p-2">—</td></tr>
              <tr><td className="border border-slate-300 p-2">Separating a protected lobby</td><td className="border border-slate-300 p-2">30</td><td className="border border-slate-300 p-2">30</td><td className="border border-slate-300 p-2">—</td></tr>
              <tr><td className="border border-slate-300 p-2">Separating a lift well</td><td className="border border-slate-300 p-2">30 (4)</td><td className="border border-slate-300 p-2">30 (3)</td><td className="border border-slate-300 p-2">—</td></tr>
              <tr><td className="border border-slate-300 p-2">Separating a lift motor room</td><td className="border border-slate-300 p-2">30</td><td className="border border-slate-300 p-2">30</td><td className="border border-slate-300 p-2">—</td></tr>
              <tr><td className="border border-slate-300 p-2">Separating a protected route</td><td className="border border-slate-300 p-2">30</td><td className="border border-slate-300 p-2">30 (2)</td><td className="border border-slate-300 p-2">—</td></tr>
              <tr><td className="border border-slate-300 p-2">Separating compartments</td><td className="border border-slate-300 p-2">60</td><td className="border border-slate-300 p-2">60</td><td className="border border-slate-300 p-2">—</td></tr>
              <tr><td className="border border-slate-300 p-2">In a corridor to sub-divide it</td><td className="border border-slate-300 p-2">30</td><td className="border border-slate-300 p-2">30</td><td className="border border-slate-300 p-2">—</td></tr>
              <tr><td className="border border-slate-300 p-2">In a stairway from ground floor to basement</td><td className="border border-slate-300 p-2">—</td><td className="border border-slate-300 p-2">2 x 30 or 1 x 60</td><td className="border border-slate-300 p-2">—</td></tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-sm space-y-1">
          <p>(1) Fire/smoke stopping cavity barriers and fire dampers in ductwork</p>
          <p>(2) Excluding incomplete floors e.g. a gallery floor</p>
          <p>(3) Except a door to a WC containing no fire risk</p>
          <p>(4) Except a lift well contained within a stairway enclosure</p>
        </div>
      </div>

      {/* Terms, Conditions and Limitations */}
      <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Fire Risk Assessment – Terms, Conditions and Limitations</h2>
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            This Fire Risk Assessment has been undertaken in accordance with the requirements of the
            Regulatory Reform (Fire Safety) Order 2005 and relevant supporting
            guidance.
          </p>
          <p>
            It is agreed that, in order to enable a thorough inspection and assessment, the Fire Risk Assessor was
            permitted open and free access to all areas of the premises reasonably accessible at the time of the
            assessment and review.
          </p>
          <p>
            It is the responsibility of the Responsible Person to ensure that all relevant personnel are aware of
            the Fire Risk Assessor&apos;s visit and that the assessor is not hindered in the carrying out of their duties.
          </p>

          <h3 className="font-semibold mt-4 mb-2">Scope of Assessment</h3>
          <p>
            This Fire Risk Assessment is based on:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>A visual inspection of the premises</li>
            <li>Review of fire safety arrangements in place at the time of the assessment</li>
            <li>Consideration of documented records made available, including fire alarm testing,
            emergency lighting tests and fire drill records</li>
            <li>Observations made during a Health & Safety and Fire Safety audit conducted on {data.assessmentDate || 'the assessment date'}</li>
          </ul>
          <p className="mt-4">
            No intrusive inspection, destructive testing, or specialist testing of fire systems, structural elements,
            luminance levels, alarm sound pressure levels or HVAC systems has been undertaken as part of this
            assessment.
          </p>

          <h3 className="font-semibold mt-4 mb-2">Limitations</h3>
          <p>
            Whilst all reasonable care has been taken to identify matters that may give rise to fire risk, this
            assessment cannot be regarded as a guarantee that all fire hazards or deficiencies have been
            identified.
          </p>
          <p>
            The assessment is based on a sample of conditions observed at the time of inspection. It is possible
            that this may not be fully representative of all conditions present at all times.
          </p>
          <p>
            The Fire Risk Assessor cannot be held responsible for:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Failure to implement recommendations</li>
            <li>Deterioration in standards following the assessment</li>
            <li>Changes in use, layout, occupancy or management practices after the date of assessment</li>
            <li>Acts or omissions of employees, contractors or third parties</li>
          </ul>

          <h3 className="font-semibold mt-4 mb-2">Enforcement and Insurers</h3>
          <p>
            The Fire Risk Assessor should be notified of any visit, or intended visit, by an enforcing authority or
            insurer relating to fire safety matters. Where requirements or recommendations are made by an enforcing
            authority, insurer or competent third party, it is the responsibility of the Responsible Person to ensure
            compliance within appropriate timescales.
          </p>

          <h3 className="font-semibold mt-4 mb-2">Specialist Advice</h3>
          <p>
            Where hazards are identified that, in the opinion of the Fire Risk Assessor, require specialist advice or
            further investigation, this will be highlighted. The decision to appoint specialist contractors or
            consultants, and any associated costs, remains the responsibility of the Responsible Person.
          </p>

          <h3 className="font-semibold mt-4 mb-2">Liability</h3>
          <p>
            KSS NW Ltd limits its liability for any loss, damage or injury (including consequential or indirect loss)
            arising from the performance of this Fire Risk Assessment to the extent permitted by law and as
            defined by the company&apos;s professional indemnity insurance.
          </p>
        </div>
      </div>

      {/* About the Property */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">About the Property:</h2>

        <div className="overflow-x-auto mb-6 fra-keep">
          <table className="fra-print-table w-full border border-slate-300 text-sm fra-property-summary">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold w-40 bg-slate-50">Property type</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? (
                    <input type="text" value={customData.propertyType} onChange={(e) => setCustomData({ ...customData, propertyType: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="e.g. Retail unit..." />
                  ) : (customData.propertyType || data.propertyType?.split('.')[0] || data.propertyType)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Floors</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.numberOfFloors} onChange={(e) => setCustomData({ ...customData, numberOfFloors: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" /> : (customData.numberOfFloors || data.numberOfFloors)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Number of fire exits</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.numberOfFireExits} onChange={(e) => setCustomData({ ...customData, numberOfFireExits: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="e.g. 2 or Other" /> : (customData.numberOfFireExits || data.numberOfFireExits || 'To be confirmed')}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Approx. build date</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.buildDate} onChange={(e) => setCustomData({ ...customData, buildDate: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" /> : (customData.buildDate || data.buildDate)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Adjacent occupancies</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.adjacentOccupancies} onChange={(e) => setCustomData({ ...customData, adjacentOccupancies: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="e.g. Yes – mid-unit" /> : (customData.adjacentOccupancies || data.adjacentOccupancies || (data.description?.includes('mid-unit') || data.description?.includes('adjoining') ? 'Yes – mid-unit' : 'See description'))}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Sleeping risk</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.sleepingRisk} onChange={(e) => setCustomData({ ...customData, sleepingRisk: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" /> : (customData.sleepingRisk || data.sleepingRisk)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Trading hours</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.operatingHours} onChange={(e) => setCustomData({ ...customData, operatingHours: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="e.g. Mon–Sat 9am–6pm" /> : (customData.operatingHours || data.storeOpeningTimes || data.operatingHours || 'To be confirmed')}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Total staff employed</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.totalStaffEmployed} onChange={(e) => setCustomData({ ...customData, totalStaffEmployed: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" /> : (customData.totalStaffEmployed || data.totalStaffEmployed || 'To be confirmed')}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Max staff on site</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.maxStaffOnSite} onChange={(e) => setCustomData({ ...customData, maxStaffOnSite: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" /> : (customData.maxStaffOnSite || data.maxStaffOnSite || 'To be confirmed')}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 font-semibold bg-slate-50">Young persons employed</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {editing ? <input type="text" value={customData.youngPersonsCount} onChange={(e) => setCustomData({ ...customData, youngPersonsCount: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" /> : (customData.youngPersonsCount || data.youngPersonsCount || 'None')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {!editing && (
          <div className="mb-4 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="text-xs"
            >
              Edit property details
            </Button>
          </div>
        )}
        
        <div className="space-y-4 text-sm">
          <div>
            <span className="font-semibold">Description of the Premises</span>
            {editing ? (
              <Textarea
                value={customData.description}
                onChange={(e) => setCustomData({ ...customData, description: e.target.value })}
                className="mt-2 min-h-[120px]"
                placeholder="Describe the premises..."
              />
            ) : (
              <p className="mt-2 whitespace-pre-line">{customData.description || data.description}</p>
            )}
            {!editing && <DebugBadge source={data._sources?.description} fieldName="Description" />}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">Approximate Floor Area:</span>
            </div>
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  value={customData.floorArea}
                  onChange={(e) => {
                    const next = { ...customData, floorArea: e.target.value }
                    const areaNum = parseFloorAreaSqFt(e.target.value)
                    const recalcFromArea = isOccupancyDerivedFromFloorArea(customData.occupancy)
                    if (recalcFromArea && areaNum != null) {
                      next.occupancy = occupancyFromFloorArea(areaNum)
                    }
                    setCustomData(next)
                  }}
                  className="min-h-[60px]"
                  placeholder="Enter floor area (e.g., 650 m² or 3000)"
                />
              </div>
            ) : (
              <p className="mt-2">{customData.floorArea}</p>
            )}
            {!editing && <DebugBadge source={data._sources?.floorArea} fieldName="Floor Area" />}
            {data.floorAreaComment && !editing && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <strong>Note:</strong> {data.floorAreaComment}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">Occupancy and Capacity:</span>
            </div>
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  value={customData.occupancy}
                  onChange={(e) => setCustomData({ ...customData, occupancy: e.target.value })}
                  className="min-h-[60px]"
                  placeholder="Enter occupancy information (e.g., Standard (60 sq ft/person): ... / Peak (30 sq ft/person): ...)"
                />
                {parseFloorAreaSqFt(customData.floorArea) != null && (
                  <p className="text-xs text-slate-500 whitespace-pre-line">
                    Calculated from floor area: {occupancyFromFloorArea(parseFloorAreaSqFt(customData.floorArea)!)}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-line">
                {(() => {
                  const areaNum = parseFloorAreaSqFt(customData.floorArea || data.floorArea)
                  const recalcFromArea = isOccupancyDerivedFromFloorArea(customData.occupancy)
                  if (recalcFromArea && areaNum != null) return occupancyFromFloorArea(areaNum)
                  return customData.occupancy
                })()}
              </p>
            )}
            {!editing && <DebugBadge source={data._sources?.occupancy} fieldName="Occupancy" />}
            {data.occupancyComment && !editing && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <strong>Note:</strong> {data.occupancyComment}
              </div>
            )}
          </div>
          {editing && (
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false)
                  setCustomData({
                    floorArea: data.floorArea,
                    occupancy: data.occupancy,
                    operatingHours: data.operatingHours,
                    buildDate: data.buildDate ?? '',
                    propertyType: data.propertyType ?? '',
                    numberOfFloors: data.numberOfFloors ?? '',
                    numberOfFireExits: data.numberOfFireExits ?? '',
                    adjacentOccupancies: data.adjacentOccupancies ?? '',
                    sleepingRisk: data.sleepingRisk ?? '',
                    totalStaffEmployed: data.totalStaffEmployed ?? '',
                    maxStaffOnSite: data.maxStaffOnSite ?? '',
                    youngPersonsCount: data.youngPersonsCount ?? '',
                    description: data.description ?? '',
                    intumescentStripsPresent: data.intumescentStripsPresent ?? true,
                  })
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              {saved && (
                <span className="text-sm text-green-600">Saved successfully!</span>
              )}
            </div>
          )}
          <div>
            <span className="font-semibold">Internal Fire Doors:</span>
            <p className="mt-2">{data.internalFireDoors}</p>
            <DebugBadge source={data._sources?.internalFireDoors} fieldName="Internal Fire Doors" />
            <p className="mt-4">
              It is the ongoing responsibility of store management to ensure that internal fire doors
              are maintained in good working order and kept closed when not in use, in accordance
              with fire safety procedures and routine management checks.
            </p>
          </div>
          <div>
            <span className="font-semibold">History of Fires or Fire-Related Incidents in the Previous 12 Months:</span>
            <p className="mt-2">{data.historyOfFires}</p>
            <DebugBadge source={data._sources?.historyOfFires} fieldName="History of Fires" />
          </div>
        </div>
      </div>

      {/* Fire Safety Equipment – Visual Record */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Fire Safety Equipment – Visual Record</h2>
        <div className="fra-keep grid grid-cols-2 gap-4 fra-visual-record-grid">
          <div>
            <PhotoPlaceholder placeholderId="fire-alarm-panel" label="Fire alarm control panel" maxPhotos={1} aspect="portrait" />
            <p className="text-xs mt-1 text-slate-600 print:block">Fire alarm control panel</p>
          </div>
          <div>
            <PhotoPlaceholder placeholderId="emergency-lighting-switch" label="Emergency lighting test switch" maxPhotos={1} aspect="portrait" />
            <p className="text-xs mt-1 text-slate-600 print:block">Emergency lighting test switch</p>
          </div>
          <div>
            <PhotoPlaceholder placeholderId="fire-doors" label="Typical fire door" maxPhotos={1} aspect="portrait" />
            <p className="text-xs mt-1 text-slate-600 print:block">Typical fire door</p>
          </div>
          <div>
            <PhotoPlaceholder placeholderId="fire-extinguisher" label="Portable fire extinguisher (rear stockroom)" maxPhotos={1} aspect="portrait" />
            <p className="text-xs mt-1 text-slate-600 print:block">Portable fire extinguisher (rear stockroom)</p>
          </div>
        </div>
      </div>

      {/* Fire Safety Systems & Equipment */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Fire Safety Systems & Equipment</h2>
        <p className="text-sm leading-relaxed mb-4">
          The following systems and equipment are assessed below: fire alarm and detection, emergency lighting, portable fire-fighting equipment, and fire doors and compartmentation.
        </p>
        <figure className="fra-figure fra-figure-equipment-icons mb-6">
          <div className="w-full max-w-[280px] mx-auto aspect-square overflow-hidden rounded border border-slate-200">
            <img
              src="/fire-equipment-systems-icons.png"
              alt="Fire equipment and systems: Fire extinguisher, Manual call point, Emergency light, Fire door"
              className="w-full h-full object-cover object-center"
            />
          </div>
        </figure>

        <h3 className="text-lg font-semibold mb-3">Fire alarm system</h3>
        <div className="space-y-4 text-sm leading-relaxed whitespace-pre-line">
          {data.fireAlarmDescription}
          <DebugBadge source={data._sources?.fireAlarmDescription} fieldName="Fire Alarm Description" />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div>
            <span className="font-semibold">Location of Fire Panel:</span>
            <p className="mt-1">{data.fireAlarmPanelLocation}</p>
            <DebugBadge source={data._sources?.fireAlarmPanelLocation} fieldName="Fire Panel Location" />
            {data.fireAlarmPanelLocationComment && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <strong>Note:</strong> {data.fireAlarmPanelLocationComment}
              </div>
            )}
          </div>
          <div>
            <span className="font-semibold">Is panel free of faults:</span>
            <p className="mt-1">{data.fireAlarmPanelFaults}</p>
            <DebugBadge source={data._sources?.fireAlarmPanelFaults} fieldName="Fire Panel Faults" />
            {data.fireAlarmPanelFaultsComment && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <strong>Note:</strong> {data.fireAlarmPanelFaultsComment}
              </div>
            )}
          </div>
          {consistencyNarratives.firePanelAccessStatement && (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <strong>Panel access:</strong> {consistencyNarratives.firePanelAccessStatement}
            </div>
          )}
          {data.callPointAccessibility && (
            <div>
              <span className="font-semibold">Call point accessibility:</span>
              <p className="mt-1">{data.callPointAccessibility}</p>
              <DebugBadge source={data._sources?.callPointAccessibility} fieldName="Call Point Accessibility" />
            </div>
          )}
          <div className="mt-4">
            <p>{data.fireAlarmMaintenance}</p>
            <DebugBadge source={data._sources?.fireAlarmMaintenance} fieldName="Fire Alarm Maintenance" />
            <p className="mt-2 italic">
              (NB: This assessment is based on visual inspection and review of available records. No physical testing
              of the fire alarm or emergency lighting systems was undertaken as part of this Fire Risk Assessment.)
            </p>
          </div>
        </div>
      </div>

      {/* Emergency Lighting */}
      <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h3 className="text-lg font-semibold mb-4">Emergency lighting</h3>
        <div className="space-y-4 text-sm leading-relaxed">
          <p className="whitespace-pre-line">{data.emergencyLightingDescription}</p>
          <DebugBadge source={data._sources?.emergencyLightingDescription} fieldName="Emergency Lighting Description" />
          <div className="mt-4">
            <p>{data.emergencyLightingMaintenance}</p>
            <DebugBadge source={data._sources?.emergencyLightingMaintenance} fieldName="Emergency Lighting Maintenance" />
          </div>
          <div className="mt-4">
            <span className="font-semibold">Location of Emergency Lighting Test Switch:</span>
            <p className="mt-1">{data.emergencyLightingTestSwitchLocation}</p>
            <DebugBadge source={data._sources?.emergencyLightingTestSwitchLocation} fieldName="Emergency Lighting Switch Location" />
            {data.emergencyLightingTestSwitchLocationComment && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <strong>Note:</strong> {data.emergencyLightingTestSwitchLocationComment}
              </div>
            )}
            <PhotoPlaceholder placeholderId="emergency-lighting-switch" label="Emergency lighting test switch photo" maxPhotos={1} fullHeight />
          </div>
          <p className="mt-2 italic">
            (NB: This assessment is based on visual inspection and review of available records only. No physical
            testing of the emergency lighting system was undertaken as part of this assessment.)
          </p>
        </div>
      </div>

      {/* Fire manual call points */}
      <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h3 className="text-lg font-semibold mb-4">Fire manual call points</h3>
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            Manual call points (break-glass units) are provided throughout the premises in accordance with BS 5839-1,
            positioned on escape routes and at fire exits to allow occupants to raise the alarm in the event of a fire.
          </p>
          {data.callPointAccessibility && (
            <p>
              <span className="font-semibold">Call point accessibility:</span> {data.callPointAccessibility}
              <DebugBadge source={data._sources?.callPointAccessibility} fieldName="Call Point Accessibility" />
            </p>
          )}
          <div className="mt-4">
            <p className="font-semibold text-slate-700 mb-2">Photos of manual call points</p>
            <PhotoPlaceholder placeholderId="manual-call-points" label="Manual call point photo" maxPhotos={6} aspect="portrait" />
          </div>
        </div>
      </div>

      {/* Intumescent strips on doors */}
      <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h3 className="text-lg font-semibold mb-4">Intumescent strips on doors</h3>
        <div className="space-y-4 text-sm leading-relaxed">
          <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
            <span className="font-medium text-slate-700">Intumescent strips present on fire doors:</span>
            <div className="flex rounded-md border border-slate-300 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => handleIntumescentStripsToggle(true)}
                className={`px-3 py-1.5 text-sm rounded ${(customData.intumescentStripsPresent !== false) ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => handleIntumescentStripsToggle(false)}
                className={`px-3 py-1.5 text-sm rounded ${customData.intumescentStripsPresent === false ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                No
              </button>
            </div>
          </div>
          {customData.intumescentStripsPresent !== false ? (
            <>
              <p>
                Intumescent strips (and where fitted, intumescent smoke seals) are present on fire-resisting doors within the premises. These strips expand when exposed to heat, sealing the gap between the door leaf and the frame and helping to prevent smoke and fire spread. This maintains the fire resistance of the door assembly and supports compartmentation, giving occupants time to evacuate.
              </p>
              <p>
                {consistencyNarratives.fireDoorsStatement}
              </p>
            </>
          ) : (
            <>
              <p>
                Intumescent strips are narrow strips (often combined with smoke seals) fitted around the edges of fire-resisting doors. In a fire they expand when heated, sealing the gap between the door and the frame to restrict smoke and fire spread and maintain the door&apos;s fire resistance. Without them, gaps can allow smoke and flames to pass through, reducing escape time and compartmentation.
              </p>
              <p>
                At the time of assessment, intumescent strips were not observed to be present (or were not intact) on all fire doors. This should be addressed so that fire doors can perform as designed. A recommendation has been added to the Action Plan.
              </p>
            </>
          )}
          <div className="mt-6">
            <p className="font-semibold text-slate-700 mb-2">Photos of intumescent strips on fire doors</p>
            <PhotoPlaceholder placeholderId="intumescent-strips" label="Intumescent strips photo" maxPhotos={6} aspect="portrait" />
          </div>
        </div>
      </div>

      {/* Electrical installations and testing – Fixed wire & PAT */}
      <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h3 className="text-lg font-semibold mb-4">Electrical installations and testing</h3>
        <div className="space-y-8 text-sm leading-relaxed">
          <div>
            <p className="font-semibold text-slate-700 mb-2">Fixed wire installation</p>
            <p>Fixed wire installation has been inspected and tested.</p>
            {data.fixedWireTestDate && (
              <p className="mt-1">
                <span className="font-medium">Date inspected/tested:</span> {data.fixedWireTestDate}
                <DebugBadge source={data._sources?.fixedWireTestDate} fieldName="Fixed wire test date" />
              </p>
            )}
            <div className="mt-4">
              <PhotoPlaceholder placeholderId="fixed-wire-installation" label="Fixed wire installation (certificate/photo)" maxPhotos={2} aspect="portrait" compact />
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-2">PAT testing</p>
            <p>Portable appliance testing has been carried out.</p>
            {data.patTestingStatus && (
              <p className="mt-1">
                <span className="font-medium">Status / date:</span> {data.patTestingStatus}
                <DebugBadge source={data._sources?.patTestingStatus} fieldName="PAT testing status" />
              </p>
            )}
            <div className="mt-4">
              <PhotoPlaceholder placeholderId="pat-testing" label="PAT testing (certificate/photo)" maxPhotos={2} aspect="portrait" compact />
            </div>
          </div>
        </div>
      </div>

      {/* Portable Fire-Fighting Equipment */}
      <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h3 className="text-lg font-semibold mb-4">Fire extinguishers</h3>
        <div className="space-y-4 text-sm leading-relaxed">
          <p className="whitespace-pre-line">{data.fireExtinguishersDescription}</p>
          <DebugBadge source={data._sources?.fireExtinguishersDescription} fieldName="Fire Extinguishers Description" />
          <p>{data.fireExtinguisherService}</p>
          <DebugBadge source={data._sources?.fireExtinguisherService} fieldName="Fire Extinguisher Service" />
          {data.extinguisherServiceDate && (
            <p className="mt-2">
              <span className="font-semibold">Last service date:</span> {data.extinguisherServiceDate}
              <DebugBadge source={data._sources?.extinguisherServiceDate} fieldName="Extinguisher Service Date" />
            </p>
          )}
          <p className="mt-4">
            Staff receive fire safety awareness training as part of their induction and
            refresher training, which includes instruction on the purpose of fire
            extinguishers. Company fire safety arrangements place emphasis on raising
            the alarm and evacuation, rather than firefighting.
          </p>
          <div className="mt-6 space-y-4">
            <p className="font-semibold text-slate-700">Photos of fire extinguisher locations</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <PhotoPlaceholder placeholderId="fire-extinguisher-store" label="Store locations (e.g. sales floor, exits)" maxPhotos={3} aspect="portrait" />
              </div>
              <div>
                <PhotoPlaceholder placeholderId="fire-extinguisher-stockroom" label="Stock room(s)" maxPhotos={2} aspect="portrait" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sprinkler & Smoke Extraction - only show if sprinklers exist */}
      {data.hasSprinklers && (
        <div className="fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
          <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
            {printHeaderContent}
          </div>
          <h2 className="text-xl font-semibold mb-4">Brief Description of Sprinkler & Smoke Extraction Strategy:</h2>
          <div className="space-y-4 text-sm leading-relaxed whitespace-pre-line">
            {data.sprinklerDescription}
            <DebugBadge source={data._sources?.sprinklerDescription} fieldName="Sprinkler Description" />
          </div>
          <div className="mt-4">
            <p>
              <span className="font-semibold">Sprinkler clearance:</span> {data.sprinklerClearance}
              <DebugBadge source={data._sources?.sprinklerClearance} fieldName="Sprinkler Clearance" />
            </p>
          </div>
        {/* Sprinkler Photo Placeholder */}
        <PhotoPlaceholder placeholderId="sprinkler-system" label="Sprinkler System Photo" maxPhotos={1} />
        </div>
      )}

      {/* Fire and Rescue Services Access */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Brief description of access for Fire and Rescue Services:</h2>
        <div className="space-y-4 text-sm leading-relaxed">
          {data.accessDescription ? (
            <>
              <p className="whitespace-pre-line">{data.accessDescription}</p>
              <DebugBadge source={data._sources?.accessDescription} fieldName="Access Description" />
            </>
          ) : (
            <>
              <p>
                Entry to the site can be gained via the main front entrance doors and via the rear service
                entry/loading bay, which is clearly signposted externally. There is suitable access for Fire and Rescue
                Services from the surrounding road network serving the shopping centre. No issues
                were identified at the time of assessment.
              </p>
              <DebugBadge source="DEFAULT" fieldName="Access Description" />
            </>
          )}
          {/* Store Location Map - constrained for print so it fits on one page */}
          <div className="mt-4 fra-map-print">
            <StoreMap
              storeName={data.premises}
              address={data.address}
              latitude={data.store?.latitude || null}
              longitude={data.store?.longitude || null}
            />
          </div>
          <div className="mt-4 p-4 border border-slate-300 rounded-lg bg-slate-50 text-sm fra-access-summary">
            <h3 className="font-semibold mb-2 text-slate-800">Fire & Rescue Access Summary</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li>Primary access via main entrance and rear service/loading bay</li>
              <li>Single internal retail unit access point</li>
              <li>No fire lift, risers or hydrants within unit</li>
              <li>Mall/centre management controls external access routes</li>
            </ul>
          </div>
          <p className="text-sm leading-relaxed mt-4">
            Fire and Rescue Service access arrangements are subject to the overarching fire strategy and evacuation procedures of the host centre or landlord.
          </p>
          <div className="space-y-2 mt-4">
            <div><span className="font-semibold">Fire lift:</span> – N/A</div>
            <div><span className="font-semibold">Dry / wet riser:</span> – N/A</div>
            <div><span className="font-semibold">Fire hydrant:</span> – N/A</div>
            <div><span className="font-semibold">Open water:</span> – N/A</div>
          </div>
        </div>
      </div>

      {/* Fire Risk Assessment Methodology */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Fire Risk Assessment Methodology</h2>
        <p className="text-sm leading-relaxed mb-6">
          The fire risk assessment has been carried out using a structured three-stage methodology in accordance with recognised best practice, ensuring hazards are identified, risks are evaluated and controlled, and findings are recorded and reviewed.
        </p>
        <div className="space-y-3 fra-methodology-stages">
          <img
            src="/fra-methodology-stage-1.png"
            alt="Stage 1: Initial assessment and hazard identification"
            className="w-full max-w-2xl mx-auto rounded border-0 print:max-w-full"
          />
          <img
            src="/fra-methodology-stage-2.png"
            alt="Stage 2: Evaluation and control measures"
            className="w-full max-w-2xl mx-auto rounded border-0 print:max-w-full"
          />
          <img
            src="/fra-methodology-stage-3.png"
            alt="Stage 3: Recording, review and ongoing management"
            className="w-full max-w-2xl mx-auto rounded border-0 print:max-w-full"
          />
        </div>
      </div>

      {/* Stage 1 - Fire Hazards */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-2">Stage 1 – Fire Hazards</h2>
        <div className="fra-hazards-table-wrapper overflow-x-auto">
          <table className="fra-print-table w-full border-collapse border border-slate-300 text-sm fra-hazards-table">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold w-40">Hazard category</th>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Details</th>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold w-48">Photo(s)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-2 align-top font-medium">Sources of ignition</td>
                <td className="border border-slate-300 px-3 py-2 align-top">
                  <DebugBadge source={data._sources?.sourcesOfIgnition} fieldName="Sources of Ignition" />
                  <ul className="list-disc list-inside space-y-1 mt-1">
                    {data.sourcesOfIgnition.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  {data.patTestingStatus && (
                    <p className="text-sm mt-2 text-slate-600">
                      <span className="font-medium">PAT / electrical testing status:</span> {data.patTestingStatus}
                    </p>
                  )}
                </td>
                <td className="border border-slate-300 px-3 py-2 align-top" rowSpan={3}>
                  <PhotoPlaceholder placeholderId="fire-hazards" label="Hazard photos" maxPhotos={5} stacked />
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 align-top font-medium">Sources of fuel</td>
                <td className="border border-slate-300 px-3 py-2 align-top">
                  <DebugBadge source={data._sources?.sourcesOfFuel} fieldName="Sources of Fuel" />
                  <ul className="list-disc list-inside space-y-1 mt-1">
                    {data.sourcesOfFuel.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  {data.sourcesOfFuelCoshhNote && (
                    <p className="text-sm mt-2 text-slate-600">{data.sourcesOfFuelCoshhNote}</p>
                  )}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 align-top font-medium">Sources of oxygen</td>
                <td className="border border-slate-300 px-3 py-2 align-top">
                  <DebugBadge source={data._sources?.sourcesOfOxygen} fieldName="Sources of Oxygen" />
                  <ul className="list-disc list-inside space-y-1 mt-1">
                    {data.sourcesOfOxygen.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="text-xl font-semibold mb-2 mt-3">Stage 2 – People at Risk</h2>
        <p className="text-sm mb-2">
          The following persons may be at risk in the event of a fire within the premises:
        </p>
        <DebugBadge source={data._sources?.peopleAtRisk} fieldName="People at Risk" />
        <ul className="list-disc list-inside space-y-1 text-sm">
          {data.peopleAtRisk.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
        {(data.totalStaffEmployed || data.maxStaffOnSite || data.youngPersonsCount) && (
          <p className="text-sm mt-2">
            <strong>Staffing levels:</strong> {data.totalStaffEmployed && `Total staff employed: ${data.totalStaffEmployed}`}{data.maxStaffOnSite && ` • Maximum on site at any time: ${data.maxStaffOnSite}`}{data.youngPersonsCount && data.youngPersonsCount !== '0' && ` • Young persons: ${data.youngPersonsCount}`}
          </p>
        )}
        <p className="text-sm mt-2">There are no sleeping occupants within the premises.</p>
      </div>

      {/* Stage 3 – Evaluate, remove, reduce and protect */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-2">Stage 3 – Evaluate, remove, reduce and protect from risk</h2>
        
        {/* Fire Safety Measures – static fire action posters (no upload) */}
        <div className="mt-4 fra-photo-block">
          <img
            src="/fire-safety-measures-posters.png"
            alt="Fire Action and Fire Alarm Call Point posters – fire safety measures"
            className="w-full max-w-3xl mx-auto rounded border border-slate-300 object-contain print:max-w-full"
          />
        </div>
        
        <div className="space-y-4 text-sm leading-snug">
          <div>
            <h3 className="font-semibold mb-1">Evaluate the risk of a fire occurring</h3>
            <p>
              Considering the nature of the premises, the activities undertaken, the fire load associated with retail stock, and the fire
              protection measures in place, the likelihood is assessed as {effectiveRiskLikelihood.toLowerCase()}.
              {effectiveRiskLikelihood === 'High'
                ? ' This rating is driven by observed deficiencies in management controls that materially increase the probability of fire spread and escalation if an ignition occurs.'
                : effectiveRiskLikelihood === 'Normal'
                  ? ' Ignition sources are typical of retail premises; however, day-to-day controls must be consistently maintained where findings have been identified.'
                  : ' Housekeeping and operational controls were observed as good, with no material indicators of elevated fire likelihood.'}
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Evaluate the risk to people from a fire starting in the premises</h3>
            <p>
              In the event of a fire, there is a potential risk to staff and members of the public. The potential consequence is assessed as{' '}
              {effectiveRiskConsequence.toLowerCase()}, taking account of escape route management, compartmentation performance and evacuation controls observed
              at the time of assessment. The resulting overall risk level is {effectiveOverallRisk.toLowerCase()}.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Remove and reduce the hazards that may cause a fire</h3>
            <p className="mb-1">Measures in place to remove or reduce fire hazards include:</p>
            <ul className="list-disc list-inside ml-4 space-y-0.5 mt-1">
              <li>Control and maintenance of electrical installations and equipment</li>
              <li>Good housekeeping practices to prevent the accumulation of combustible materials</li>
              <li>Appropriate storage and management of stock and packaging</li>
              <li>Control of ignition sources</li>
              <li>Staff training in fire safety awareness and procedures</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Remove and reduce the risk to people from a fire</h3>
            <p className="mb-1">Measures in place to reduce the risk to people include:</p>
            <ul className="list-disc list-inside ml-4 space-y-0.5 mt-1">
              <li>Automatic fire detection and alarm systems providing early warning</li>
              <li>{consistencyNarratives.stage3EscapeRoutesBullet}</li>
              <li>Emergency lighting to support evacuation during lighting failure</li>
              <li>{consistencyNarratives.stage3FireDoorsBullet}</li>
              <li>Regular testing, inspection and maintenance of fire safety systems and staff training and fire drills</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Outline how people will be protected from the risk of a fire:</h3>
            <p>
              People within the premises are protected from the risk of fire through a combination of physical fire protection
              measures, fire safety systems and management controls.
            </p>
            <p className="mt-1">
              The building is provided with fire-resisting construction, including compartmentation and internal fire doors,
              designed to restrict the spread of fire and smoke and to provide sufficient time for occupants to evacuate safely.
              {consistencyNarratives.fireDoorsStatement}
              {data.compartmentationStatus && (
                <span className="block mt-1">
                  <span className="font-medium">Compartmentation / ceiling tiles:</span> {data.compartmentationStatus}.
                </span>
              )}
            </p>
            <p className="mt-1">
              Automatic fire detection and alarm systems are installed throughout the premises to provide early warning of fire
              and to initiate evacuation. Emergency lighting is provided to illuminate escape routes and exits in the event of a
              failure of the normal lighting supply.
            </p>
            <p className="mt-1">
              {consistencyNarratives.escapeRoutesStatement}
            </p>
            <p className="mt-1">
              Fire safety management arrangements include staff fire safety training, regular testing and maintenance of fire
              safety systems, routine inspections and fire drills. These measures collectively ensure that persons within the
              premises are afforded an appropriate level of protection from the risk of fire.
            </p>
          </div>
        </div>
      </div>

      {/* Fire Plan */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Fire Plan</h2>

        <figure className="fra-figure w-full mb-6">
          <img
            src="/emergency-evacuation-flow.png"
            alt="Emergency evacuation flow: Discover fire, Raise alarm, Evacuate, Assembly point, Call fire service"
            className="w-full rounded border border-slate-200 print:max-w-full"
          />
          <figcaption className="text-xs text-slate-600 mt-2 text-center italic max-w-3xl mx-auto">
            Figure 2: Emergency evacuation flow to be followed in the event of a fire. This procedure is generic and must be read in conjunction with site-specific fire instructions and training.
          </figcaption>
        </figure>
        <p className="text-sm text-slate-700 mb-6 max-w-3xl mx-auto">
          This evacuation procedure reflects the current store layout and must be followed by all staff and contractors.
        </p>

        {/* Fire Plan Photo Placeholder – can hide when no fire plan for this site (excluded from PDF/print when hidden) */}
        {showFirePlanPhoto && (
          <div className="relative mb-6">
            <button
              type="button"
              onClick={() => setShowFirePlanPhoto(false)}
              className="absolute top-0 right-0 z-10 p-1.5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 hover:text-slate-800 print:hidden"
              title="Hide Fire Plan / Evacuation Route Photo from report and PDF"
            >
              <X className="h-4 w-4" />
            </button>
            <PhotoPlaceholder placeholderId="fire-plan" label="Fire Plan / Evacuation Route Photo" maxPhotos={1} />
          </div>
        )}
        {!showFirePlanPhoto && (
          <p className="text-sm text-slate-500 mb-6 print:hidden">
            Fire Plan photo hidden.{' '}
            <button type="button" onClick={() => setShowFirePlanPhoto(true)} className="text-indigo-600 hover:underline">
              Show again
            </button>
          </p>
        )}

        <div className="fra-section-with-figure mt-6">
          <h3 className="text-lg font-semibold mb-2">Fire Safety Management & Responsibilities</h3>
          <p className="text-sm leading-relaxed mb-4">
            Fire safety responsibilities within the premises are clearly defined and communicated to ensure compliance with legal duties and effective day-to-day management.
          </p>
          <figure className="fra-figure mb-4">
            <img
              src="/fire-safety-responsibilities-flow.png"
              alt="Fire safety responsibilities and accountability: Responsible Person, Store Management, Staff, Contractors"
              className="w-full max-w-2xl mx-auto rounded border border-slate-200 print:max-w-full"
            />
            <figcaption className="text-xs text-slate-600 mt-2 text-center italic">
              Figure 4: Fire safety responsibilities and accountability structure within the premises.
            </figcaption>
          </figure>
        </div>
        <p className="text-sm leading-relaxed mb-6">
          The Responsible Person retains overall accountability for fire safety compliance, with store management responsible for implementation and monitoring, supported by staff and contractors who are required to follow site-specific fire safety procedures.
        </p>

        <div className="space-y-6 text-sm leading-relaxed">
          <div>
            <h3 className="font-semibold mb-2">Roles and identity of employees with specific responsibilities in the event of a fire</h3>
            <p>
              Store management are designated as Fire Wardens and have overall responsibility for coordinating
              the emergency response within the premises. This includes ensuring that the alarm is raised,
              evacuation procedures are followed and that all persons are directed to leave the premises safely.
            </p>
            <p className="mt-2">
              Supervisory staff may act as Fire Marshals, assisting with the evacuation of designated areas and
              ensuring that escape routes are clear. All staff are responsible for following fire safety instructions
              and evacuating immediately on hearing the fire alarm.
            </p>
            <p className="mt-2">
              No person is permitted to re-enter the premises until authorised to do so by the Fire and Rescue
              Service or the appropriate responsible authority.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Arrangements for the safe evacuation of people identified at risk</h3>
            <p>
              {consistencyNarratives.evacuationStatement}
            </p>
            <p className="mt-2">
              Visitors and contractors will be accompanied or directed by staff to ensure their safe evacuation.
              Where persons require additional assistance to evacuate, suitable arrangements must be
              implemented and managed by store management, including the use of Personal Emergency
              Evacuation Plans where applicable.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">How the Fire and Rescue Service will be contacted</h3>
            <p>
              The Fire and Rescue Service will be contacted via the emergency services by dialling 999 or 112.
              Where applicable, the fire alarm system may also interface with external monitoring arrangements.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Procedures for liaising with the Fire and Rescue Service</h3>
            <p>
              On arrival of the Fire and Rescue Service, store management will liaise with the attending officers,
              providing relevant information regarding the premises, fire alarm activation and any known hazards.
              Store management will assist as required until the incident is formally handed over.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Arrangements for fire safety training and drills</h3>
            <p>
              {data.fireSafetyTrainingNarrative ?? 'All staff receive fire safety training as part of their induction and refresher training. Fire drills are conducted at appropriate intervals and records are maintained. Training and drills are designed to ensure staff are familiar with evacuation procedures and their responsibilities in the event of a fire.'}
            </p>
            {consistencyNarratives.trainingStatement && (
              <p className="mt-2">{consistencyNarratives.trainingStatement}</p>
            )}
            {data.fireDrillDate && (
              <p className="mt-2 text-sm">
                <span className="font-medium">Last fire drill:</span> {data.fireDrillDate}
                <DebugBadge source={data._sources?.fireDrillDate} fieldName="Fire Drill Date" />
              </p>
            )}
          </div>

          <div className="mt-8">
            <h3 className="font-semibold mb-4">Assessment review</h3>
            <table className="fra-print-table w-full border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-2 text-left">Assessment review date</th>
                  <th className="border border-slate-300 p-2 text-left">Completed by</th>
                  <th className="border border-slate-300 p-2 text-left">Signature</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 p-2">{data.assessmentDate || ''}</td>
                  <td className="border border-slate-300 p-2">{data.assessorName}</td>
                  <td className="border border-slate-300 p-2"></td>
                </tr>
                {data.assessmentReviewDate && (
                  <tr>
                    <td className="border border-slate-300 p-2">
                      {data.assessmentReviewDate}
                      <DebugBadge source={data._sources?.assessmentReviewDate} fieldName="Assessment Review Date" />
                    </td>
                    <td className="border border-slate-300 p-2"></td>
                    <td className="border border-slate-300 p-2"></td>
                  </tr>
                )}
              </tbody>
            </table>
            {data.managementReviewStatement && (
              <p className="text-sm leading-relaxed mt-4 italic">
                {data.managementReviewStatement}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Fire Risk Assessment Report */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">Fire Risk Assessment Report</h2>
        
        <div className="space-y-2 text-sm mb-6">
          <div><span className="font-semibold">Assessor:</span> {data.assessorName}</div>
          <div><span className="font-semibold">Company name:</span> KSS NW LTD</div>
          <div><span className="font-semibold">Date of assessment:</span> {data.assessmentDate || ''}</div>
        </div>
        
        {/* Assessment Overview Photo Placeholder */}
        <PhotoPlaceholder placeholderId="premises-overview" label="Premises Overview Photo" maxPhotos={1} fit="contain" />
        
        <div className="space-y-6 text-sm leading-relaxed">
          <div>
            <h3 className="font-semibold mb-2">Introduction</h3>
            <p>
              The client is Footasylum Ltd, a national branded fashion apparel and footwear retailer. This Fire
              Risk Assessment relates solely to their retail premises at {data.premises}. The premises is situated within an established managed shopping centre
              environment.
            </p>
            <p className="mt-2 whitespace-pre-line">
              {data.description.split('\n').slice(0, 1).join('\n') || defaultPremisesDescriptionLine(customData.numberOfFloors || data.numberOfFloors)}
            </p>
            <p className="mt-2">
              The premises is provided with designated fire exit routes serving the sales floor and back-of-house
              areas, which discharge to a place of relative safety via the shopping centre&apos;s managed evacuation
              routes. Escape routes and back-of-house circulation routes were observed
              to be available and in use at the time of assessment.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Overview of the workplace being assessed</h3>
            <p>
              The primary function of the premises is the retail sale of branded fashion apparel and footwear to
              members of the public. The store operates as a standard high-street retail environment with a
              public sales area and associated back-of-house accommodation, including stockroom, staff welfare
              facilities and a management office.
            </p>
            <p className="mt-2">
              The premises operates over {floorLayoutPhrase(effectiveFloorCount)}. Staffing levels vary depending on trading
              periods, with a mix of management, supervisory and sales staff present during opening hours. The
              premises is open to the public during scheduled trading hours, with staff also present outside
              these hours for opening, closing, deliveries, replenishment and general operational activities.
            </p>
            <p className="mt-2">
              Members of the public access the premises during trading hours, and contractors or third-party
              personnel may attend the site periodically for maintenance or servicing activities. There are no
              sleeping occupants within the premises.
            </p>
            <p className="mt-2">
              The activities undertaken within the premises are typical of a retail environment and do not
              involve any high-risk processes. Fire loads are primarily associated with retail stock, packaging
              materials and fixtures and fittings. Fire safety arrangements observed during the assessment
              indicate that the premises is managed in line with expected standards for this type of retail
              operation.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Overview of the significant findings related to fire hazards</h3>
            <p>
              A systematic and methodical assessment of the premises was undertaken, including a walkthrough
              of all accessible areas, a review of fire safety arrangements and consideration of available records.
              The following significant findings were identified:
            </p>
            <DebugBadge source={data._sources?.significantFindings} fieldName="Significant Findings" />
            <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
              {data.significantFindings.map((finding, idx) => (
                <li key={idx}>{finding}</li>
              ))}
            </ul>
            {data.hsAuditDate && (
              <p className="mt-4">
                The audit identified a small number of management-related matters requiring attention,
                including:
              </p>
            )}
            <ul className="list-disc list-inside ml-4 space-y-1 mt-2">
              {data.recommendedControls.filter(c => c.includes('training') || c.includes('contractor') || c.includes('COSHH') || c.includes('ladders')).map((control, idx) => (
                <li key={idx}>{control}</li>
              ))}
            </ul>
            <p className="mt-4">
              {hasHighRiskTriggers || effectiveOverallRisk === 'Substantial' || effectiveOverallRisk === 'Intolerable'
                ? 'These findings indicate elevated operational fire risk and require prompt management action to restore control and maintain compliance.'
                : 'These matters do not present an immediate risk to life but require continued management attention to ensure ongoing compliance and consistency.'}
            </p>
            <p className="mt-2">
              {hasHighRiskTriggers || effectiveOverallRisk === 'Substantial' || effectiveOverallRisk === 'Intolerable'
                ? 'Until corrective actions are completed, evacuation effectiveness may be adversely affected by the identified route and/or compartmentation management issues.'
                : 'No significant deficiencies were identified that would prevent the safe evacuation of occupants in the event of a fire, provided existing control measures are maintained, and management actions are completed.'}
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Outline of those who may be at risk</h3>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Staff</li>
              <li>Visitors</li>
              <li>Contractors</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Proposed Recommended Controls</h3>
            <p>
              To maintain and further improve fire safety standards within the premises, the following control
              measures are recommended:
            </p>
            <DebugBadge source={data._sources?.recommendedControls} fieldName="Recommended Controls" />
            <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
              {data.recommendedControls.map((control, idx) => (
                <li key={idx}>{control}</li>
              ))}
            </ul>
            <p className="mt-4">
              These measures are intended to support ongoing compliance and do not indicate a failure of
              existing fire safety arrangements. Continued active management and monitoring will ensure that
              fire risks remain controlled.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Summary</h3>
            <p>
              A systematic and methodical approach to assessing the risk of this site was undertaken.
              Walk through of external areas of the premises.
            </p>
            <ul className="list-disc list-inside ml-4 space-y-1 mt-2">
              <li>Internal walk through of all accessible areas.</li>
              <li>Collation of relevant data and available records.</li>
              <li>Calculation of capacity (where applicable).</li>
              <li>Consideration of compartmentation and fire separation features.</li>
              <li>Liaison with store management and relevant site representatives, and liaison with staff on
              site as required.</li>
              <li>Compliance with the legislation.</li>
              <li>HM Government Fire Risk Assessment guidance (Offices and Shops) (where applicable).</li>
              <li>Approved Document B – Fire Safety – Volume 2 (as a reference framework where
              relevant).</li>
            </ul>
            <p className="mt-4">
              {data.escapeRoutesEvidence
                ? `${data.escapeRoutesEvidence} ${consistencyNarratives.escapeRoutesStatement}`
                : consistencyNarratives.escapeRoutesStatement}
            </p>
            <p className="mt-2">
              Signage throughout was installed and clearly visible
              and exit route doors opened in the direction of travel
              and were secured by means of appropriate &quot;push bar
              to open&quot; door devices were fitted and could be
              opened easily. Fire doors are subject to routine
              management checks to ensure standards are
              maintained and any issues identified dynamically.
              {data.exitSignageCondition && (
                <span className="ml-1">
                  <span className="font-medium">Exit signage condition:</span> {data.exitSignageCondition}.
                </span>
              )}
            </p>
            <p className="mt-2">
              Emergency lighting (EEL), as previously detailed, was
              {fireFindings.emergency_lighting_tests_current === false
                ? ' installed, however monthly emergency lighting test evidence was not current and requires corrective follow-up in line with Article 14(2)(e–h) of the FSO 2005.'
                : ' installed and found suitable and sufficient in accordance with Article 14(2)(e–h) of the FSO 2005.'}
              {' '}
              {consistencyNarratives.fireDoorsStatement}
              {' '}
              Final exit doors were installed with &quot;push bar to open&quot; door devices where applicable and were expected to be maintained in good condition and appropriately signed in line with relevant standards (including BS EN 1125 and BS EN 179).
            </p>
            <p className="mt-2">
              Other than low level cleaning products which are sourced centrally and sent to the store, all
              COSHH-related products are expected to be low risk level and stored in a designated cupboard
              away from sources of ignition.
            </p>
            <p className="mt-2">
              <span className="font-semibold">Note:</span> There will be no dangerous or flammable substances or liquids used or stored on the
              premises.
            </p>
            <p className="mt-4 font-semibold">Overall:</p>
            <p className="mt-2">
              {consistencyNarratives.controlsOverallStatement} I would further recommend that under Article 9 of the FSO 2005, a review of the fire risk associated with this site be conducted at a suitable period or if there are any significant changes to the premises or processes within, or if this Fire Risk Assessment is no longer valid due to experiencing a fire, for example. In view of the fact that Footasylum Ltd employ more than 5 persons, under Article 9(6)(a) of the Regulatory Reform (Fire Safety) Order 2005, there is a requirement for the Responsible Person to record the findings in writing. {formattedAssessmentReviewDate ? `Review by ${formattedAssessmentReviewDate}, or sooner if significant change occurs.` : 'Review by the stated assessment review date, or sooner if significant change occurs.'}
            </p>
            <p className="mt-4">
              <span className="font-semibold">Submitted by:</span> {data.assessorName} – KSS NW LTD
            </p>
            <p className="mt-2">{data.assessmentDate || ''}</p>
            {formattedAssessmentReviewDate && (
              <p className="mt-2">
                Review by {formattedAssessmentReviewDate}, or sooner if significant change occurs.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Risk Rating */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">7. Risk Rating</h2>

        <h3 className="text-lg font-semibold mb-2">Overall Fire Risk Rating</h3>
        <p className="text-sm leading-relaxed mb-4">
          The overall fire risk rating has been determined by assessing the likelihood of fire occurring against the potential severity of consequences, taking into account existing fire precautions and management arrangements.
        </p>
        <figure className="fra-figure mb-4">
          <div className="overflow-x-auto">
            <table className="w-full max-w-3xl mx-auto border border-slate-300 text-xs sm:text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-left font-bold">
                    Likelihood \ Severity
                  </th>
                  {FRA_RISK_CONSEQUENCE_ORDER.map((consequence) => (
                    <th
                      key={consequence}
                      className="border border-slate-300 bg-slate-100 px-3 py-2 text-center font-bold"
                    >
                      {consequence}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FRA_RISK_LIKELIHOOD_ORDER.map((likelihood) => (
                  <tr key={likelihood}>
                    <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-left font-bold">
                      {likelihood}
                    </th>
                    {FRA_RISK_CONSEQUENCE_ORDER.map((consequence) => {
                      const overall = FRA_RISK_MATRIX[likelihood][consequence]
                      const selected =
                        likelihood === effectiveRiskLikelihood && consequence === effectiveRiskConsequence
                      return (
                        <td
                          key={`${likelihood}-${consequence}`}
                          className={`border border-slate-300 px-3 py-2 text-center ${getRiskMatrixCellClass(overall, selected)}`}
                        >
                          <div>{overall}</div>
                          {selected && (
                            <div className="text-[10px] mt-1 uppercase tracking-wide opacity-90">Current assessment</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <figcaption className="text-xs text-slate-600 mt-2 text-center italic">
            Figure 3: Fire Risk Rating Matrix used to determine the overall risk level for the premises.
          </figcaption>
          <p className="text-xs text-slate-500 mt-1 text-center">
            Risk levels determined using likelihood × consequence methodology.
          </p>
          <p className="text-xs text-slate-600 mt-2 text-center italic">
            This risk rating reflects conditions observed at the time of assessment and is subject to review if site conditions change.
          </p>
        </figure>
        <p className="text-sm leading-relaxed mb-6">
          Based on the findings of this assessment, the overall fire risk level for the premises is assessed as{' '}
          <span className={`inline-block px-2 py-0.5 font-bold text-sm rounded border align-middle ${getOverallRiskBadgeClass(effectiveOverallRisk)}`}>{effectiveOverallRisk}</span>,{' '}
          {overallRiskNarrative}
        </p>

        <div className="space-y-6 text-sm">
          <div>
            <h3 className="font-semibold mb-2">7.1.1 Likelihood of Fire</h3>
            <p className="mb-2">Taking into account the fire prevention measures observed at the time of this risk assessment, it is considered that the hazard from fire (likelihood of fire) at these premises is:</p>
            <p className="mt-2 mb-2">
              <span className={`inline-block px-3 py-1.5 font-bold text-base rounded border ${getLikelihoodBadgeClass(effectiveRiskLikelihood)}`}>
                {effectiveRiskLikelihood}
              </span>
            </p>
            <ul className="list-disc list-inside mt-2 text-slate-600 space-y-1">
              <li><strong>Low:</strong> Unusually low likelihood of fire as a result of negligible potential sources of ignition.</li>
              <li><strong>Normal:</strong> Normal fire hazards for this type of occupancy, with fire hazards generally subject to appropriate controls.</li>
              <li><strong>High:</strong> Lack of adequate controls applied to one or more significant fire hazards.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">7.1.2 Potential Consequences of Fire</h3>
            <p className="mt-2 mb-2">
              <span className={`inline-block px-3 py-1.5 font-bold text-base rounded border ${getConsequencesBadgeClass(effectiveRiskConsequence)}`}>
                {effectiveRiskConsequence}
              </span>
            </p>
            <ul className="list-disc list-inside mt-2 text-slate-600 space-y-1">
              <li><strong>Slight Harm:</strong> Outbreak of fire unlikely to result in serious injury or death.</li>
              <li><strong>Moderate Harm:</strong> Outbreak of fire could foreseeably result in injury but unlikely to involve multiple fatalities.</li>
              <li><strong>Extreme Harm:</strong> Significant potential for serious injury or death of one or more occupants.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">7.1.3 Summary of Risk Rating</h3>
            <p className="mb-2 whitespace-pre-line">{data.summaryOfRiskRating ?? 'Taking into account the nature of the building and the occupants, as well as the fire protection and procedural arrangements observed at the time of this fire risk assessment, it is considered that the consequences for life safety in the event of fire would be: Moderate Harm. Accordingly, it is considered that the risk from fire at these premises is: Tolerable.'}</p>
            {data.riskRatingRationale && data.riskRatingRationale.length > 0 && (
              <ul className="list-disc list-inside text-slate-700 space-y-1 mb-2">
                {data.riskRatingRationale.map((reason, idx) => (
                  <li key={`risk-rationale-${idx}`}>{reason}</li>
                ))}
              </ul>
            )}
            <p className="mt-2">
              <span className="text-slate-600 text-sm">Overall risk level: </span>
              <span className={`inline-block px-3 py-1.5 font-bold text-base rounded border mt-1 ${getOverallRiskBadgeClass(effectiveOverallRisk)}`}>
                {effectiveOverallRisk}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Action Plan */}
      <div className="fra-section fra-a4-page fra-print-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
          {printHeaderContent}
        </div>
        <h2 className="text-xl font-semibold mb-4">8. Action Plan</h2>
        <p className="text-sm mb-4">
          It is considered that the following recommendations should be implemented in order to reduce fire risk to a tolerable level:{' '}
          <span className={`inline-block px-3 py-1.5 font-bold text-base rounded border align-middle ${getOverallRiskBadgeClass('Tolerable')}`}>
            Tolerable
          </span>
          .
        </p>
        <p className="text-sm mb-4">The target risk level is contingent upon completion and ongoing maintenance of the actions listed below.</p>
        <p className="text-sm font-semibold mb-2">The priority given for each recommendation should be acted upon as follows:</p>
        <ul className="list-disc list-inside text-sm text-slate-700 mb-6 space-y-1">
          <li><strong>Low:</strong> Remedy when next refurbishing or next reviewing management policy.</li>
          <li><strong>Medium:</strong> Action required over next 1–6 months.</li>
          <li><strong>High:</strong> Act on immediately.</li>
        </ul>
        <h3 className="font-semibold mb-2">Recommended Actions:</h3>
        {data.actionPlanItems && data.actionPlanItems.length > 0 ? (
          <>
            <div className="fra-keep overflow-x-auto">
              <table className="fra-print-table w-full border border-slate-300 text-sm fra-action-plan-table">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold w-24">Priority</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.actionPlanItems.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td className="border border-slate-300 px-3 py-2">{item.priority}</td>
                      <td className="border border-slate-300 px-3 py-2">{item.recommendation}{item.dueNote ? ` — ${item.dueNote}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700 mb-4">
              No significant deficiencies requiring formal action were identified at the time of assessment. Existing fire safety arrangements are considered suitable and sufficient, subject to ongoing management and routine review.
            </p>
            <div className="fra-keep overflow-x-auto">
              <table className="fra-print-table w-full border border-slate-300 text-sm fra-action-plan-table">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold w-24">Priority</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-300 px-3 py-2">Low</td>
                    <td className="border border-slate-300 px-3 py-2">Continue routine checks and testing</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Additional Site Pictures / Appendices – last page: signature at bottom */}
      <div className="fra-section fra-a4-page fra-print-page fra-last-page page-break-after-always p-12 max-w-4xl mx-auto">
        <div className="fra-last-page-body flex flex-col min-h-[calc(100vh-120px)] print:min-h-[267mm]">
          <div>
            <div className="fra-print-page-header hidden print:flex print:items-center print:justify-between print:border-b print:border-slate-300 print:pb-2 print:mb-4 print:text-[11pt] print:font-semibold print:text-slate-900">
              {printHeaderContent}
            </div>
            <h2 className="text-xl font-semibold mb-4">Additional Site Pictures</h2>
            <p className="text-sm text-slate-600 italic mb-4">
              Add up to 6 additional site photos below. Photos from H&S audit may also be displayed here when available.
            </p>
            <PhotoPlaceholder placeholderId="additional-site-pictures" label="Additional site picture" maxPhotos={6} />
          </div>

          {/* Signature block – pushed to bottom of last page */}
          <hr className="mt-8 border-slate-200" aria-hidden="true" />
          <div className="fra-signature-block mt-6 pt-6 border-t border-slate-200">
            <p className="text-sm font-semibold text-slate-700 mb-3">Signed:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-slate-700">
              <div><span className="font-medium">Name:</span> {data.assessorName || '_________________________'}</div>
              <div><span className="font-medium">Role:</span> Fire Risk Assessor</div>
              <div><span className="font-medium">Date:</span> {data.assessmentDate ? new Date(data.assessmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '_________________________'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* On-screen preview: fixed footer (hidden in print; PDF uses Puppeteer footer) */}
      <footer
        className="fra-report-print-footer no-print"
        aria-hidden={!showHeaderFooter}
        style={footerStyle}
      >
        {printFooterContent}
      </footer>

      {/* Print Styles */}
      <style jsx>{`
        @media screen {
          .fra-print-page {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
          }
          .fra-report-print-content {
            padding-bottom: 48px;
          }
        }
        @media print {
          .page-break-after-always {
            page-break-after: always;
          }
          body {
            background: white;
          }
          .fra-print-page {
            border: none;
            border-radius: 0;
            box-shadow: none;
          }
          .fra-report-print-header,
          .fra-report-print-footer {
            display: none !important;
          }
        }
      `}</style>
      </div>
    </div>
  )
}
