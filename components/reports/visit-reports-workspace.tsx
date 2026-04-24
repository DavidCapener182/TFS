'use client'

import { type ReactNode, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react'

import { deleteDraftVisitReport, saveVisitReport } from '@/app/actions/visit-reports'
import { ActivityVisitReportBuilder } from '@/components/reports/activity-visit-report-builder'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  WorkspaceHeader,
  WorkspaceShell,
  WorkspaceStat,
  WorkspaceStatGrid,
} from '@/components/workspace/workspace-shell'
import { toast } from '@/hooks/use-toast'
import {
  buildVisitReportSummary,
  buildVisitReportTitle,
  getEmptyActivityVisitReportPayload,
  getEmptyTargetedTheftVisitPayload,
  getVisitReportTemplate,
  getVisitReportTypeLabel,
  isActivityVisitReportType,
  normalizeVisitReportPayload,
  VISIT_REPORT_TEMPLATES,
  VISIT_REPORT_TYPE_OPTIONS,
  type ActivityVisitReportType,
  type ActivityVisitReportPayload,
  type VisitReportIncidentPerson,
  type VisitReportIncidentPersonRole,
  type TargetedTheftVisitPayload,
  type VisitReportPayload,
  type VisitReportRecord,
  type VisitReportRiskLevel,
  type VisitReportStatus,
  type VisitReportStoreOption,
  type VisitReportType,
} from '@/lib/reports/visit-report-types'
import type { StoreVisitProductCatalogItem } from '@/lib/store-visit-product-catalog'
import { formatStoreName } from '@/lib/store-display'
import { cn, formatAppDate, getDisplayStoreCode } from '@/lib/utils'

interface VisitReportsWorkspaceProps {
  stores: VisitReportStoreOption[]
  reports: VisitReportRecord[]
  productCatalog: StoreVisitProductCatalogItem[]
  currentUserName: string | null
  canEdit: boolean
  reportsAvailable: boolean
  unavailableMessage: string | null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return 'Something went wrong. Please try again.'
}

type VisitReportDraft = {
  reportId?: string
  storeVisitId?: string | null
  reportType: VisitReportType
  status: VisitReportStatus
  title: string
  storeId: string
  payload: any
}

type PromptSection = {
  title: string
  prompts: string[]
}

type ChecklistFieldConfig<T extends string> = {
  key: T
  label: string
  description?: string
}

type BooleanFieldKey<T> = Extract<
  {
    [K in keyof T]: T[K] extends boolean ? K : never
  }[keyof T],
  string
>

const INCIDENT_OVERVIEW_PROMPTS: PromptSection = {
  title: 'Ask and confirm',
  prompts: [
    'Can the latest incident be clearly described step by step (entry, action, exit)?',
    'Is the incident timing (day/time) known and repeatable?',
    'Can the first targeted products or areas be identified?',
    'Can the entry-to-exit duration be confirmed?',
  ],
}

const STORE_LAYOUT_PROMPTS: PromptSection = {
  title: 'Observe and test',
  prompts: [
    'Is high-risk stock or are high-risk zones immediately accessible from the entrance?',
    'Can the counter or controlled areas be easily reached or bypassed?',
    'Are blind spots and easy exit paths clearly identified?',
  ],
}

const PRODUCT_CONTROL_PROMPTS: PromptSection = {
  title: 'Check controls',
  prompts: [
    'Are display controls in place (testers/empty boxes/limited live stock)?',
    'Are frequently targeted lines overstocked on the shop floor?',
    'Can vulnerable stock be moved or protected immediately?',
  ],
}

const STAFF_BEHAVIOUR_PROMPTS: PromptSection = {
  title: 'Observe team behaviour',
  prompts: [
    'Is ownership of front-of-store response clear when risk enters?',
    'Is there an immediate greeting and visible deterrent presence?',
    'Do staff keep clear visibility across floor and till areas?',
  ],
}

const STAFF_SAFETY_PROMPTS: PromptSection = {
  title: 'Test response',
  prompts: [
    'Is the team response for a high-risk group entry clearly understood?',
    'Are disengagement points and emergency escalation ownership clear?',
    'Is the no-physical-intervention policy understood and followed?',
  ],
}

const CCTV_PROMPTS: PromptSection = {
  title: 'Verify evidence quality',
  prompts: [
    'Can CCTV clearly identify individuals at entry, till, and high-risk zones?',
    'Do camera angles capture approach, action, and exit routes?',
    'Would footage be usable as evidence, not just general movement?',
  ],
}

const COMMUNICATION_PROMPTS: PromptSection = {
  title: 'Confirm communications',
  prompts: [
    'Are radios/tools working and used for early warning?',
    'Are nearby stores/security informed quickly when risk moves location?',
  ],
}

const ENVIRONMENT_PROMPTS: PromptSection = {
  title: 'Build context',
  prompts: [
    'Are nearby locations seeing similar incidents or behaviours?',
    'Has useful intelligence been shared with centre security or partners?',
    'Is there a repeat day/time/location pattern?',
  ],
}

const IMMEDIATE_ACTION_PROMPTS: PromptSection = {
  title: 'Record immediate fixes',
  prompts: [
    'Were immediate fixes completed before leaving the site?',
    'Were product, layout, staffing, or process actions completed immediately?',
  ],
}

const RECOMMENDATION_PROMPTS: PromptSection = {
  title: 'Set next actions',
  prompts: [
    'Are physical controls required next?',
    'Are staff/process changes required to reduce risk and repeat loss?',
    'Is intelligence-sharing or external escalation required now?',
  ],
}

const INCIDENT_OVERVIEW_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['incidentOverview']>>> = [
  { key: 'datesTimesRecorded', label: 'Were dates/times of incidents recorded?' },
  {
    key: 'sameOffendersSuspected',
    label: 'Is a repeat group or repeat pattern suspected?',
    description: 'If checked, summarise why in incident notes.',
  },
  {
    key: 'violenceInvolved',
    label: 'Was violence or a threat involved?',
    description: 'If checked, record exact behaviours and who was affected.',
  },
]

const STORE_LAYOUT_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['storeLayoutExposure']>>> = [
  { key: 'highValueVisibleFromEntrance', label: 'Is high-value stock visible from the entrance?' },
  { key: 'highValueReachableWithinFiveSeconds', label: 'Is high-value stock reachable within 3-5 seconds?' },
  { key: 'counterLeanOverAccess', label: 'Is the counter easily accessible by leaning over?' },
  { key: 'counterBypassPossible', label: 'Can the counter be physically bypassed or jumped?' },
  {
    key: 'clearEscapeRouteBehindCounter',
    label: 'Is there a clear escape route behind the counter?',
    description: 'If checked, note route and visibility gaps in observations.',
  },
]

const PRODUCT_CONTROL_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['productControlMeasures']>>> = [
  { key: 'testersUsedInsteadOfLiveStock', label: 'Are testers used instead of live stock?' },
  { key: 'emptyBoxesUsedForDisplay', label: 'Are empty boxes used for display?' },
  {
    key: 'highValueStockReducedOnShopFloor',
    label: 'Has high-value stock been reduced on the shop floor?',
    description: 'If unchecked, capture which lines remain overexposed.',
  },
  { key: 'fsduPositionedNearTill', label: 'Are FSDU/displays positioned near till or controlled zone?' },
  { key: 'excessStockRemovedFromDisplay', label: 'Has excess stock been removed from display?' },
]

const STAFF_POSITION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['staffPositioningBehaviour']>>> = [
  { key: 'staffFacingEntrance', label: 'Are staff positioned facing the entrance?' },
  { key: 'immediateGreetingInPlace', label: 'Is an immediate customer greeting in place?' },
  { key: 'staffAwareOfGroupEntryRisks', label: 'Do staff understand group-entry risk?' },
  {
    key: 'staffMaintainVisibility',
    label: 'Do staff maintain visibility across the floor?',
    description: 'If not consistent, note where visibility is lost.',
  },
]

const STAFF_SAFETY_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['staffSafetyResponse']>>> = [
  { key: 'staffUnderstandDoNotEngage', label: 'Do staff understand the DO NOT ENGAGE policy?' },
  { key: 'noPhysicalInterventionObserved', label: 'Was physical intervention avoided?' },
  { key: 'clearEscalationProcessInPlace', label: 'Is a clear escalation process in place?' },
  { key: 'policeReportingProcedureUnderstood', label: 'Is the police reporting procedure understood?' },
  {
    key: 'incidentLoggingProcedureFollowed',
    label: 'Is the incident logging procedure followed?',
    description: 'If not followed, record where the process breaks.',
  },
]

const CCTV_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['cctvSurveillance']>>> = [
  { key: 'entranceCoveredClearly', label: 'Is the entrance covered clearly?' },
  { key: 'tillAreaCovered', label: 'Is the till area covered?' },
  { key: 'highValueAreasCovered', label: 'Are high-value product areas covered?' },
  {
    key: 'facialIdentificationPossible',
    label: 'Is facial identification possible?',
    description: 'If no, record distance/angle/lighting issues.',
  },
  { key: 'cameraAnglesAppropriate', label: 'Are camera angles appropriate?' },
]

const RADIO_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['communicationRadioUse']>>> = [
  { key: 'radioPresentAndWorking', label: 'Is the store radio present and working?' },
  { key: 'staffTrainedOnRadioUsage', label: 'Are staff trained on radio usage?' },
  { key: 'nearbyStoreCommunicationActive', label: 'Is communication with nearby stores active?' },
  { key: 'earlyWarningSystemInPlace', label: 'Is an early warning system in place?' },
]

const ENVIRONMENT_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['environmentalExternalFactors']>>> = [
  { key: 'nearbyStoresAlsoTargeted', label: 'Are nearby stores also being targeted?' },
  { key: 'shoppingCentreSecurityEngaged', label: 'Is shopping centre security engaged?' },
  { key: 'offenderDescriptionsShared', label: 'Have known descriptions/intelligence been shared?' },
  { key: 'peakRiskTimesIdentified', label: 'Have peak risk times been identified?' },
]

const IMMEDIATE_ACTION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['immediateActionsTaken']>>> = [
  { key: 'highRiskStockRemoved', label: 'Was high-risk stock removed or reduced?' },
  { key: 'stockRepositionedBehindCounter', label: 'Was stock repositioned behind the counter?' },
  { key: 'staffBriefedOnSafetyProcedures', label: 'Were staff briefed on safety procedures?' },
  { key: 'entryAwarenessProtocolImplemented', label: 'Was an entry awareness protocol implemented?' },
  { key: 'storeLayoutAdjustedWherePossible', label: 'Was the store layout adjusted where possible?' },
]

const PHYSICAL_RECOMMENDATION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['recommendations']['physical']>>> = [
  { key: 'counterModificationsRequired', label: 'Are counter or barrier modifications required?' },
  { key: 'lockableStorageRequired', label: 'Is lockable storage required?' },
  { key: 'additionalSecurityPresenceRecommended', label: 'Is additional security presence recommended?' },
]

const OPERATIONAL_RECOMMENDATION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['recommendations']['operational']>>> = [
  { key: 'staffTrainingRequired', label: 'Is staff training required?' },
  { key: 'improvedIncidentLoggingRequired', label: 'Is improved incident logging required?' },
  { key: 'revisedProceduresRequired', label: 'Are revised procedures required?' },
]

const INTELLIGENCE_RECOMMENDATION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['recommendations']['intelligence']>>> = [
  { key: 'offenderInformationSharingRequired', label: 'Is offender information sharing required?' },
  { key: 'liaisonWithCentreSecurityRequired', label: 'Is liaison with centre security required?' },
  { key: 'policeEngagementRequired', label: 'Is police engagement required?' },
]

const DETERRENCE_RECOMMENDATION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['recommendations']['deterrence']>>> = [
  { key: 'highValueStockSignageRecommended', label: 'Is signage needed stating high-value stock is not kept on display?' },
  { key: 'strongStaffEngagementOnEntryRequired', label: 'Is stronger staff engagement on entry required?' },
]

const RISK_LEVEL_OPTIONS: Array<{ value: VisitReportRiskLevel; label: string; className: string }> = [
  { value: 'low', label: 'Low', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { value: 'medium', label: 'Medium', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  { value: 'high', label: 'High', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  { value: 'critical', label: 'Critical', className: 'border-critical/20 bg-critical-soft text-critical' },
]

const ACTIVE_SELECTION_CLASS = 'border-info/20 bg-info-soft text-info'

const INCIDENT_PERSON_ROLE_OPTIONS: Array<{
  value: VisitReportIncidentPersonRole
  label: string
}> = [
  { value: 'public', label: 'Public / offender' },
  { value: 'employee', label: 'Employee' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'other', label: 'Other' },
]

function createEmptyIncidentPerson(): VisitReportIncidentPerson {
  return {
    name: '',
    role: 'public',
    involvement: '',
    injured: false,
    injuryDetails: '',
  }
}

function createEmptyPayload(
  reportType: VisitReportType,
  currentUserName: string | null
): VisitReportPayload {
  if (reportType === 'targeted_theft_visit') {
    return getEmptyTargetedTheftVisitPayload(currentUserName)
  }

  return getEmptyActivityVisitReportPayload(reportType, currentUserName)
}

function isTargetedTheftPayload(payload: VisitReportPayload): payload is TargetedTheftVisitPayload {
  return 'incidentOverview' in payload
}

function getPayloadVisitDate(payload: VisitReportPayload): string {
  return payload.visitDate
}

function createEmptyDraft(currentUserName: string | null): VisitReportDraft {
  return {
    reportType: 'targeted_theft_visit',
    status: 'draft',
    title: '',
    storeId: '',
    storeVisitId: null,
    payload: createEmptyPayload('targeted_theft_visit', currentUserName),
  }
}

function StoreSearch({
  value,
  stores,
  selectedStoreId,
  onChange,
  onSelect,
  disabled,
}: {
  value: string
  stores: VisitReportStoreOption[]
  selectedStoreId: string
  onChange: (value: string) => void
  onSelect: (store: VisitReportStoreOption) => void
  disabled: boolean
}) {
  const normalizedValue = value.trim().toLowerCase()
  const selectedStore = stores.find((store) => store.id === selectedStoreId) || null
  const suggestions = useMemo(() => {
    if (!normalizedValue) return []

    return stores
      .filter((store) => {
        const haystack = [
          store.storeName,
          store.storeCode || '',
          store.city || '',
          store.region || '',
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(normalizedValue)
      })
      .slice(0, 8)
  }, [normalizedValue, stores])

  const exactMatch = selectedStore && value.trim().toLowerCase() === getStoreSearchLabel(selectedStore).toLowerCase()

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search store name, code, city, or region..."
          className="min-h-[44px] pl-11"
          disabled={disabled}
        />
      </div>

      {normalizedValue && !exactMatch && suggestions.length > 0 ? (
        <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/90 p-2">
          {suggestions.map((store) => (
            <button
              key={store.id}
              type="button"
              onClick={() => onSelect(store)}
              className="flex w-full flex-col rounded-xl border border-transparent bg-white px-3 py-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-100"
              disabled={disabled}
            >
              <span className="text-sm font-semibold text-slate-900">{store.storeName}</span>
              <span className="text-xs text-slate-500">
                {getDisplayStoreCode(store.storeCode) || 'No code'}
                {store.city ? ` • ${store.city}` : ''}
                {store.region ? ` • ${store.region}` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function getStoreSearchLabel(store: VisitReportStoreOption | null | undefined): string {
  if (!store) return ''
  return `${store.storeName}${store.storeCode ? ` (${store.storeCode})` : ''}`
}

function SectionCard({
  title,
  description,
  promptSection,
  className,
  children,
}: {
  title: string
  description: string
  promptSection?: PromptSection
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6', className)}>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      {promptSection ? (
        <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
            {promptSection.title}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            {promptSection.prompts.map((prompt) => (
              <li key={prompt} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span>{prompt}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children}
    </section>
  )
}

function ChecklistGrid<T extends string>({
  fields,
  values,
  onToggle,
  disabled,
}: {
  fields: Array<ChecklistFieldConfig<T>>
  values: Record<T, boolean>
  onToggle: (key: T) => void
  disabled: boolean
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.key}
          className={cn(
            'rounded-2xl border px-4 py-3',
            values[field.key]
              ? ACTIVE_SELECTION_CLASS
              : 'border-slate-200 bg-slate-50 text-slate-700',
            disabled ? 'opacity-60' : ''
          )}
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold">{field.label}</div>
            {field.description ? (
              <div className="mt-1 text-xs text-slate-500">{field.description}</div>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                if (!values[field.key]) onToggle(field.key)
              }}
              className={cn(
                'min-h-[38px] rounded-xl',
                values[field.key] ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''
              )}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                if (values[field.key]) onToggle(field.key)
              }}
              className={cn(
                'min-h-[38px] rounded-xl',
                !values[field.key] ? 'border-rose-300 bg-rose-50 text-rose-700' : ''
              )}
            >
              No
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ExportCard({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: string
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Download className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <form action={action} method="GET">
        <Button
          type="submit"
          className="min-h-[44px] w-full rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
        >
          <Download className="mr-2 h-4 w-4" />
          Download CSV
        </Button>
      </form>
    </div>
  )
}

const REPORT_BUILDER_STEPS = [
  'Report Setup',
  '1. Incident Overview',
  '2. Store Layout & Exposure',
  '3. Product Control Measures',
  '4. Staff Positioning & Behaviour',
  '5. Staff Safety & Response',
  '6. CCTV & Surveillance',
  '7. Communication & Radio Use',
  '8. Environmental & External Factors',
  '9. Immediate Actions Taken',
  '10. Recommendations',
  '11. Risk Rating',
  '12. Sign-Off',
] as const

const ACTIVITY_REPORT_BUILDER_STEPS = [
  'Report Setup',
  '1. What Was Checked',
  '2. Findings / Variance',
  '3. Action Taken / Escalation',
  '4. Sign-Off',
] as const

const VISIT_REPORT_DRAFT_STORAGE_KEY = 'tfs-visit-report-builder-draft-v1'

export function VisitReportsWorkspace({
  stores,
  reports,
  productCatalog,
  currentUserName,
  canEdit,
  reportsAvailable,
  unavailableMessage,
}: VisitReportsWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [draft, setDraft] = useState<VisitReportDraft>(() => createEmptyDraft(currentUserName))
  const [selectedTemplate, setSelectedTemplate] = useState<VisitReportType | null>(null)
  const [storeSearch, setStoreSearch] = useState('')
  const [recentReports, setRecentReports] = useState<VisitReportRecord[]>(reports)
  const [activeTab, setActiveTab] = useState<'builder' | 'export'>('builder')
  const [currentStep, setCurrentStep] = useState(0)
  const [mobileStepMenuOpen, setMobileStepMenuOpen] = useState(false)
  const [isSaving, startSave] = useTransition()
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)

  const canUseBuilder = canEdit && reportsAvailable
  const selectedStore = stores.find((store) => store.id === draft.storeId) || null
  const builderSteps = draft.reportType === 'targeted_theft_visit' ? REPORT_BUILDER_STEPS : ACTIVITY_REPORT_BUILDER_STEPS
  const summaryPreview = buildVisitReportSummary(draft.reportType, draft.payload)
  const isLinkedVisitFlow = Boolean(draft.storeVisitId && draft.storeId)
  const templateFromQuery = searchParams?.get('template') as VisitReportType | null
  const reportIdFromQuery = searchParams?.get('reportId')
  const visitIdFromQuery = searchParams?.get('visitId')
  const storeIdFromQuery = searchParams?.get('storeId')
  const visitedAtFromQuery = searchParams?.get('visitedAt')
  const hasBuilderIntent = Boolean(
    searchParams?.get('sheet') === '1' ||
    templateFromQuery ||
    reportIdFromQuery ||
    visitIdFromQuery
  )

  const completionStats = useMemo(() => {
    if (draft.reportType === 'targeted_theft_visit' && isTargetedTheftPayload(draft.payload)) {
      const completed = [
        Boolean(draft.storeId),
        Boolean(draft.payload.incidentOverview.summary.trim()),
        Boolean(draft.payload.incidentOverview.primaryProducts.trim()),
        Boolean(draft.payload.storeLayoutExposure.observations.trim()),
        Boolean(draft.payload.productControlMeasures.recommendations.trim()),
        Boolean(draft.payload.staffSafetyResponse.responseDescription.trim()),
        Boolean(draft.payload.cctvSurveillance.issuesIdentified.trim()),
        Boolean(draft.payload.immediateActionsTaken.actionsCompleted.trim()),
        Boolean(draft.payload.recommendations.details.trim()),
        Boolean(draft.payload.riskRating),
        Boolean(draft.payload.riskJustification.trim()),
      ].filter(Boolean).length

      return {
        completed,
        total: 11,
        percent: Math.round((completed / 11) * 100),
      }
    }

    const activityPayload = draft.payload as ActivityVisitReportPayload
    const completed = [
      Boolean(draft.storeId),
      Boolean(Object.keys(activityPayload.activityPayload?.fields || {}).length),
      Boolean(activityPayload.activityPayload?.itemsChecked?.length),
      Boolean(activityPayload.activityPayload?.amountChecks?.length),
      Boolean(activityPayload.findings.trim()),
      Boolean(activityPayload.actionsTaken.trim()),
      Boolean(activityPayload.signOff.visitedBy.trim()),
    ].filter(Boolean).length

    return {
      completed,
      total: 7,
      percent: Math.round((completed / 7) * 100),
    }
  }, [draft])

  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === builderSteps.length - 1
  const isSheetMode = searchParams?.get('sheet') === '1'
  const draftReportCount = recentReports.filter((report) => report.status === 'draft').length
  const finalReportCount = recentReports.length - draftReportCount

  useEffect(() => {
    if (!hasBuilderIntent) return
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(VISIT_REPORT_DRAFT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        draft?: VisitReportDraft
        storeSearch?: string
        currentStep?: number
      }
      const parsedReportType = parsed?.draft?.reportType || 'targeted_theft_visit'
      const stepList = parsedReportType === 'targeted_theft_visit' ? REPORT_BUILDER_STEPS : ACTIVITY_REPORT_BUILDER_STEPS
      if (parsed?.draft) {
        setDraft((current) => ({
          ...current,
          ...parsed.draft,
          payload: normalizeVisitReportPayload(
            parsedReportType,
            (parsed.draft as { payload?: unknown })?.payload,
            currentUserName
          ),
        }))
        setSelectedTemplate(parsedReportType)
      }
      if (typeof parsed?.storeSearch === 'string') {
        setStoreSearch(parsed.storeSearch)
      }
      if (typeof parsed?.currentStep === 'number') {
        setCurrentStep(
          Math.max(0, Math.min(parsed.currentStep, stepList.length - 1))
        )
      }
    } catch (error) {
      console.error('Failed to restore visit report draft:', error)
    }
  }, [currentUserName, hasBuilderIntent])

  useEffect(() => {
    if (!hasBuilderIntent) return

    if (reportIdFromQuery) {
      const report = reports.find((entry) => entry.id === reportIdFromQuery)
      if (report) {
        setDraft({
          reportId: report.id,
          storeVisitId: report.storeVisitId,
          reportType: report.reportType,
          status: report.status,
          title: report.title,
          storeId: report.storeId,
          payload: report.payload,
        })
        const matchingStore = stores.find((store) => store.id === report.storeId) || null
        setStoreSearch(getStoreSearchLabel(matchingStore))
        setSelectedTemplate(report.reportType)
        setActiveTab('builder')
      }
      return
    }

    if (templateFromQuery && getVisitReportTemplate(templateFromQuery)) {
      setSelectedTemplate(templateFromQuery)
      setActiveTab('builder')

      setDraft((current) => {
        const nextPayload = createEmptyPayload(templateFromQuery, currentUserName)

        const matchingStore = stores.find((store) => store.id === (storeIdFromQuery || current.storeId)) || null
        const nextVisitedAt = visitedAtFromQuery ? new Date(visitedAtFromQuery) : null
        const nextVisitDate =
          nextVisitedAt && !Number.isNaN(nextVisitedAt.getTime())
            ? nextVisitedAt.toISOString().slice(0, 10)
            : nextPayload.visitDate
        const nextTimeIn =
          nextVisitedAt && !Number.isNaN(nextVisitedAt.getTime())
            ? nextVisitedAt.toISOString().slice(11, 16)
            : nextPayload.timeIn

        return {
          ...current,
          reportType: templateFromQuery,
          storeVisitId: visitIdFromQuery || current.storeVisitId || null,
          storeId: storeIdFromQuery || current.storeId,
          title:
            buildVisitReportTitle(
              templateFromQuery,
              matchingStore?.storeName || 'Store',
              nextVisitDate
            ),
          payload: {
            ...nextPayload,
            visitDate: nextVisitDate,
            timeIn: nextTimeIn,
          },
        }
      })

      if (storeIdFromQuery) {
        const matchingStore = stores.find((store) => store.id === storeIdFromQuery) || null
        setStoreSearch(getStoreSearchLabel(matchingStore))
      }
    }
  }, [
    currentUserName,
    hasBuilderIntent,
    reportIdFromQuery,
    reports,
    stores,
    storeIdFromQuery,
    templateFromQuery,
    visitIdFromQuery,
    visitedAtFromQuery,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        VISIT_REPORT_DRAFT_STORAGE_KEY,
        JSON.stringify({
          draft,
          storeSearch,
          currentStep,
          savedAt: new Date().toISOString(),
        })
      )
    } catch (error) {
      console.error('Failed to persist visit report draft:', error)
    }
  }, [draft, storeSearch, currentStep])

  useEffect(() => {
    setMobileStepMenuOpen(false)
  }, [currentStep, selectedTemplate, activeTab])

  useEffect(() => {
    setCurrentStep((step) => Math.max(0, Math.min(step, builderSteps.length - 1)))
  }, [builderSteps.length])

  useEffect(() => {
    if (!selectedTemplate && isSheetMode) {
      router.replace('/reports')
    }
  }, [selectedTemplate, isSheetMode, router])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const isActiveSheet = Boolean(selectedTemplate)
    const root = document.documentElement
    const body = document.body

    if (isActiveSheet) {
      body.classList.add('reports-sheet-mode')
      root.style.setProperty('--mobile-header-height', '0px')
    } else {
      body.classList.remove('reports-sheet-mode')
    }

    return () => {
      body.classList.remove('reports-sheet-mode')
    }
  }, [selectedTemplate])

  const updateDraft = (updater: (current: VisitReportDraft) => VisitReportDraft) => {
    setDraft((current) => updater(current))
  }

  const updatePayload = (updater: (payload: any) => any) => {
    updateDraft((current) => ({
      ...current,
      payload: updater(current.payload),
    }))
  }

  const handleNewReport = () => {
    const nextReportType = selectedTemplate || 'targeted_theft_visit'
    const nextDraft: VisitReportDraft = {
      reportType: nextReportType,
      status: 'draft',
      title: '',
      storeId: '',
      storeVisitId: null,
      payload: createEmptyPayload(nextReportType, currentUserName),
    }
    setDraft(nextDraft)
    setStoreSearch('')
    setCurrentStep(0)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(VISIT_REPORT_DRAFT_STORAGE_KEY)
    }
  }

  const handleDeleteDraftReport = (report: VisitReportRecord) => {
    if (String(report.status || '').toLowerCase() !== 'draft') return
    const confirmed = window.confirm(`Delete draft report "${report.title}"? This cannot be undone.`)
    if (!confirmed) return

    setDeletingReportId(report.id)
    startSave(async () => {
      try {
        await deleteDraftVisitReport(report.id)
        setRecentReports((current) => current.filter((entry) => entry.id !== report.id))
        if (draft.reportId === report.id) {
          handleNewReport()
        }
        toast({
          title: 'Draft deleted',
          description: 'The draft report was removed.',
          variant: 'success',
        })
      } catch (error) {
        toast({
          title: 'Delete failed',
          description: toErrorMessage(error),
          variant: 'destructive',
        })
      } finally {
        setDeletingReportId(null)
      }
    })
  }

  const handleStartTemplate = (reportType: VisitReportType) => {
    setDraft((current) => ({
      ...current,
      reportType,
      storeVisitId: null,
      title: '',
      payload: createEmptyPayload(reportType, currentUserName),
    }))
    setSelectedTemplate(reportType)
    setActiveTab('builder')
    setCurrentStep(0)
    router.replace(`/reports?sheet=1&template=${reportType}`)
  }

  const handleBackToReportHome = () => {
    setSelectedTemplate(null)
    setActiveTab('builder')
    setCurrentStep(0)
    router.replace('/reports')
  }

  const handleSelectStore = (store: VisitReportStoreOption) => {
    updateDraft((current) => ({
      ...current,
      storeId: store.id,
      title:
        current.title.trim() ||
        buildVisitReportTitle(
          current.reportType,
          store.storeName,
          getPayloadVisitDate(current.payload)
        ),
    }))
    setStoreSearch(getStoreSearchLabel(store))
  }

  const handleLoadReport = (report: VisitReportRecord) => {
    if (report.status === 'final') {
      if (typeof window !== 'undefined') {
        window.location.assign(`/api/reports/visit-reports/${report.id}/pdf?mode=view`)
      }
      return
    }

    setDraft({
      reportId: report.id,
      storeVisitId: report.storeVisitId,
      reportType: report.reportType,
      status: report.status,
      title: report.title,
      storeId: report.storeId,
      payload: report.payload,
    })

    const matchingStore = stores.find((store) => store.id === report.storeId) || null
    setStoreSearch(getStoreSearchLabel(matchingStore))
    setSelectedTemplate(report.reportType)
    setActiveTab('builder')
    router.replace(`/reports?sheet=1&reportId=${report.id}`)
  }

  const persistReport = async (options?: {
    redirectToPdfOnFinal?: boolean
    refreshAfterSave?: boolean
    showDraftToast?: boolean
  }) => {
    const redirectToPdfOnFinal = options?.redirectToPdfOnFinal ?? true
    const refreshAfterSave = options?.refreshAfterSave ?? true
    const showDraftToast = options?.showDraftToast ?? true

    if (!draft.storeId) {
      throw new Error('Select the store for this report before saving.')
    }

    const store = stores.find((item) => item.id === draft.storeId)
    const result = await saveVisitReport({
      reportId: draft.reportId,
      storeVisitId: draft.storeVisitId || undefined,
      storeId: draft.storeId,
      reportType: draft.reportType,
      status: draft.status,
      title:
        draft.title.trim() ||
        buildVisitReportTitle(
          draft.reportType,
          store?.storeName || 'Store',
          getPayloadVisitDate(draft.payload)
        ),
      payload: draft.payload,
    })

    const nextStoreVisitId = result.storeVisitId || draft.storeVisitId || null
    const nextRecord: VisitReportRecord = {
      id: result.id,
      storeId: draft.storeId,
      storeVisitId: nextStoreVisitId,
      storeName: store?.storeName || 'Unknown Store',
      storeCode: store?.storeCode || null,
      reportType: draft.reportType,
      status: result.status,
      title: result.title,
      summary: result.summary,
      visitDate: result.visitDate,
      riskRating:
        draft.reportType === 'targeted_theft_visit' && isTargetedTheftPayload(draft.payload)
          ? draft.payload.riskRating
          : '',
      payload: draft.payload,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      createdByName: currentUserName,
    }

    setDraft((current) => ({
      ...current,
      reportId: result.id,
      storeVisitId: result.storeVisitId || current.storeVisitId || null,
      title: result.title,
    }))
    setRecentReports((current) => {
      const otherReports = current.filter((report) => report.id !== result.id)
      return [nextRecord, ...otherReports].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    })

    const savedDraft = {
      ...draft,
      reportId: result.id,
      storeVisitId: nextStoreVisitId,
      title: result.title,
    }

    if (result.warning) {
      toast({
        variant: 'destructive',
        title: 'Report saved with warning',
        description: result.warning,
      })
    } else if (showDraftToast && result.status !== 'final') {
      toast({
        title: draft.reportId ? 'Report updated' : 'Report saved',
        description: `${result.title} has been ${draft.reportId ? 'updated' : 'saved'}.`,
      })
    } else if (showDraftToast && result.status === 'final' && nextStoreVisitId) {
      toast({
        title: 'Report marked final',
        description: 'Return to the visit session to start another report or complete the visit.',
      })
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        VISIT_REPORT_DRAFT_STORAGE_KEY,
        JSON.stringify({
          draft: savedDraft,
          storeSearch,
          currentStep,
          savedAt: new Date().toISOString(),
        })
      )
    }

    if (result.status === 'final' && !result.warning && redirectToPdfOnFinal && !nextStoreVisitId) {
      if (typeof window !== 'undefined') {
        window.location.assign(`/api/reports/visit-reports/${result.id}/pdf?mode=view`)
      }
      return {
        redirectedToPdf: true,
        result,
      }
    }

    if (refreshAfterSave) {
      router.refresh()
    }

    return {
      redirectedToPdf: false,
      result,
    }
  }

  const handleSave = () => {
    if (!canUseBuilder) return

    startSave(async () => {
      try {
        const persisted = await persistReport({
          // In linked visit flow, return user to visit tracker session after final save
          // so they can add more templates or complete the visit.
          redirectToPdfOnFinal: !(isLinkedVisitFlow && draft.status === 'final'),
          refreshAfterSave: !(isLinkedVisitFlow && draft.status === 'final'),
        })

        if (isLinkedVisitFlow && draft.status === 'final') {
          const nextParams = new URLSearchParams({
            storeId: draft.storeId,
          })
          const nextVisitId = persisted?.result.storeVisitId || draft.storeVisitId
          if (nextVisitId) {
            nextParams.set('visitId', nextVisitId)
          }
          router.push(`/visit-tracker?${nextParams.toString()}`)
        }
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Save failed',
          description: error instanceof Error ? error.message : 'Failed to save report.',
        })
      }
    })
  }

  const handleReturnToVisitTracker = () => {
    if (!draft.storeVisitId || !draft.storeId) return

    startSave(async () => {
      try {
        const persisted = await persistReport({
          redirectToPdfOnFinal: false,
          refreshAfterSave: false,
          showDraftToast: false,
        })
        const nextParams = new URLSearchParams({
          storeId: draft.storeId,
        })
        const nextVisitId = persisted?.result.storeVisitId || draft.storeVisitId
        if (nextVisitId) {
          nextParams.set('visitId', nextVisitId)
        }
        router.push(`/visit-tracker?${nextParams.toString()}`)
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Unable to return to visit',
          description: error instanceof Error ? error.message : 'Save this report before leaving the builder.',
        })
      }
    })
  }

  const handleDownloadPdf = async () => {
    if (!draft.reportId) {
      toast({
        variant: 'destructive',
        title: 'Save report first',
        description: 'Save this report before downloading a PDF.',
      })
      return
    }

    if (isDownloadingPdf) return
    setIsDownloadingPdf(true)

    try {
      const endpoint = `/api/reports/visit-reports/${draft.reportId}/pdf?mode=download`
      const downloadLink = document.createElement('a')
      const sanitizedTitle = (draft.title || 'visit-report')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      downloadLink.href = endpoint
      downloadLink.download = `${sanitizedTitle || 'visit-report'}.pdf`
      downloadLink.rel = 'noopener'
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Could not download PDF.',
      })
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  return (
    <WorkspaceShell className="pb-24 md:pb-0">
      <WorkspaceHeader
        eyebrow="Reports"
        icon={FileText}
        title={selectedTemplate ? getVisitReportTypeLabel(draft.reportType) : 'Visit reports'}
        description={
          selectedTemplate
            ? 'Capture structured visit findings, manage drafts, and export final PDFs from one reporting workspace.'
            : 'Start the right LP report template, reopen drafts, and export final PDFs from one reporting workspace.'
        }
        className={cn(selectedTemplate && activeTab === 'builder' ? 'hidden md:block' : '')}
        actions={
          selectedTemplate ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBackToReportHome}
                className="rounded-full"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Report home
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadPdf}
                className="rounded-full"
              >
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleNewReport}
                className="rounded-full"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                New report
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!canUseBuilder || isSaving}
                className="rounded-full"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Saving...' : draft.status === 'final' ? 'Save Final Report' : 'Save Draft'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Badge variant={reportsAvailable ? 'success' : 'warning'}>
                {reportsAvailable ? 'Reports ready' : 'Reports unavailable'}
              </Badge>
              <Badge variant={canEdit ? 'success' : 'outline'}>
                {canEdit ? 'Editor access' : 'Read only'}
              </Badge>
            </div>
          )
        }
      />

      {!selectedTemplate ? (
        <WorkspaceStatGrid>
          <WorkspaceStat
            label="Templates"
            value={VISIT_REPORT_TEMPLATES.length}
            note="Active report templates"
            icon={FileText}
            tone="info"
          />
          <WorkspaceStat
            label="Draft Reports"
            value={draftReportCount}
            note="Reports still in progress"
            icon={ClipboardList}
            tone="warning"
          />
          <WorkspaceStat
            label="Final Reports"
            value={finalReportCount}
            note="Published report outputs"
            icon={ShieldAlert}
            tone="success"
          />
          <WorkspaceStat
            label="Builder Access"
            value={canEdit ? 'Editor' : 'Read only'}
            note={reportsAvailable ? 'Reporting tables available' : 'Awaiting reporting tables'}
            icon={Save}
            tone={canEdit ? 'success' : 'neutral'}
          />
        </WorkspaceStatGrid>
      ) : null}

      {!reportsAvailable && unavailableMessage ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 md:px-6">
          {unavailableMessage}
        </div>
      ) : null}

      {!canEdit ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:px-6">
          You have read-only access. Existing reports can be reviewed, but only `admin` and `ops` users can create or update them.
        </div>
      ) : null}

      {!selectedTemplate ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Report Templates</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Start the correct LP report template from one place. Navbar visits to `/reports` now stay on this home view unless a specific builder route is requested.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {VISIT_REPORT_TEMPLATES.length} templates
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {VISIT_REPORT_TEMPLATES.map((template) => (
                <div
                  key={template.value}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{template.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{template.description}</div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {template.specialist ? 'Specialist' : 'Visit'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleStartTemplate(template.value)}
                    disabled={!canUseBuilder || !reportsAvailable}
                    className="mt-4 w-full rounded-2xl"
                  >
                    Start template
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-ink-soft" />
              <h2 className="text-lg font-bold text-slate-900">Recent Reports</h2>
            </div>
            <div className="space-y-3">
              {recentReports.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No visit reports saved yet.
                </div>
              ) : (
                recentReports.slice(0, 6).map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => handleLoadReport(report)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{report.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatStoreName(report.storeName)}
                          {report.storeCode ? ` • ${report.storeCode}` : ''}
                        </div>
                      </div>
                      {report.status === 'draft' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleDeleteDraftReport(report)
                          }}
                          disabled={isSaving || deletingReportId === report.id}
                          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          {deletingReportId === report.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedTemplate ? (
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'builder' | 'export')}
        className="w-full"
      >
        <TabsList className="hidden h-auto w-full grid-cols-2 items-center rounded-[20px] bg-slate-100 p-1 text-slate-600 md:inline-flex md:w-auto md:justify-start md:rounded-md">
          <TabsTrigger value="builder" className="min-h-[46px] rounded-[16px] md:min-h-[40px]">
            Report Builder
          </TabsTrigger>
          <TabsTrigger value="export" className="min-h-[46px] rounded-[16px] md:min-h-[40px]">
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-4">
          <div className="grid gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-12">
              <div className="h-[112px] md:hidden" aria-hidden />
              <div className="fixed inset-x-3.5 top-[calc(var(--mobile-header-height,0px)+1rem)] z-20 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:inset-x-4 md:static md:inset-auto md:top-auto md:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Step {currentStep + 1} of {builderSteps.length}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{builderSteps[currentStep]}</h2>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary md:hidden"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download PDF
                    </button>
                    </div>
                    <div className="relative md:hidden">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMobileStepMenuOpen((prev) => !prev)}
                        className="min-h-[40px] rounded-xl px-3"
                      >
                        <Menu className="h-4 w-4" />
                      </Button>
                      {mobileStepMenuOpen ? (
                        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setMobileStepMenuOpen(false)
                              handleBackToReportHome()
                            }}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Report home
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileStepMenuOpen(false)
                              handleDownloadPdf()
                            }}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Download PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileStepMenuOpen(false)
                              handleReturnToVisitTracker()
                            }}
                            className={cn(
                              'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-slate-100',
                              draft.storeVisitId && draft.storeId
                                ? 'text-slate-700'
                                : 'cursor-not-allowed text-slate-400'
                            )}
                            disabled={!draft.storeVisitId || !draft.storeId || isSaving}
                          >
                            Return to visit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileStepMenuOpen(false)
                              handleNewReport()
                            }}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                          >
                            New report
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileStepMenuOpen(false)
                              handleSave()
                            }}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                          >
                            {draft.status === 'final' ? 'Save final report' : 'Save draft'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="hidden gap-2 md:flex">
                    {draft.storeVisitId && draft.storeId ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleReturnToVisitTracker}
                        disabled={isSaving}
                        className="min-h-[44px] rounded-xl"
                      >
                        Return to visit
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
                      disabled={isFirstStep}
                      className="min-h-[44px] rounded-xl"
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        setCurrentStep((step) => Math.min(step + 1, builderSteps.length - 1))
                      }
                      disabled={isLastStep}
                      className="min-h-[44px] rounded-xl"
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {isLinkedVisitFlow ? (
                <div className="rounded-3xl border border-info/20 bg-info-soft p-4 text-sm shadow-sm md:p-5">
                  <div className="font-semibold text-info">Linked visit session</div>
                  <div className="mt-2 text-slate-700">
                    This report belongs to an open store visit. Keep it as Draft while you are working, change it to Final when it is complete, then use Return to visit to add more reports or close the visit session.
                  </div>
                  <div className="mt-3 text-xs text-slate-600">
                    Store: {selectedStore ? formatStoreName(selectedStore.storeName) : 'Linked store'}
                    {selectedStore?.storeCode ? ` • ${selectedStore.storeCode}` : ''}
                  </div>
                </div>
              ) : null}

              <SectionCard
                title="Report Setup"
                description="Choose the report type, store, and core visit details before you start the structured assessment."
                className={cn(currentStep === 0 ? 'block' : 'hidden')}
              >
                <fieldset disabled={!reportsAvailable || isSaving} className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Report type</Label>
                      <Select
                        value={draft.reportType}
                        onValueChange={(value) => {
                          setSelectedTemplate(value as VisitReportType)
                          setCurrentStep(0)
                          updateDraft((current) => ({
                            ...current,
                            reportType: value as VisitReportType,
                            title: '',
                            payload: createEmptyPayload(value as VisitReportType, currentUserName),
                          }))
                        }}
                      >
                        <SelectTrigger className="min-h-[44px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VISIT_REPORT_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        {VISIT_REPORT_TYPE_OPTIONS.find((option) => option.value === draft.reportType)?.description}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Report status</Label>
                      <Select
                        value={draft.status}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            status: value as VisitReportStatus,
                          }))
                        }
                      >
                        <SelectTrigger className="min-h-[44px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="final">Final</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        {isLinkedVisitFlow
                          ? 'Draft keeps the visit open. Set this report to Final when it is finished so the visit can be completed.'
                          : 'Use Draft while working. Final reports are treated as complete records.'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Store</Label>
                    <StoreSearch
                      value={storeSearch}
                      stores={stores}
                      selectedStoreId={draft.storeId}
                      onChange={setStoreSearch}
                      onSelect={handleSelectStore}
                      disabled={!canUseBuilder}
                    />
                    {selectedStore ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <div className="font-semibold text-slate-900">{selectedStore.storeName}</div>
                        <div className="mt-1">
                          {getDisplayStoreCode(selectedStore.storeCode) || 'No code'}
                          {selectedStore.city ? ` • ${selectedStore.city}` : ''}
                          {selectedStore.region ? ` • ${selectedStore.region}` : ''}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Report title</Label>
                    <Input
                      value={draft.title}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder={
                        selectedStore
                          ? buildVisitReportTitle(
                              draft.reportType,
                              selectedStore.storeName,
                              getPayloadVisitDate(draft.payload)
                            )
                          : 'Title will be generated automatically'
                      }
                      className="min-h-[44px]"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-2 lg:col-span-2">
                      <Label title="Enter the name of the person preparing this report">Prepared by</Label>
                      <Input
                        value={draft.payload.preparedBy}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            preparedBy: event.target.value,
                          }))
                        }
                        className="min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date of visit</Label>
                      <Input
                        type="date"
                        value={draft.payload.visitDate}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            visitDate: event.target.value,
                          }))
                        }
                        className="min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Time in</Label>
                      <Input
                        type="time"
                        value={draft.payload.timeIn}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            timeIn: event.target.value,
                          }))
                        }
                        className="min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Time out</Label>
                      <Input
                        type="time"
                        value={draft.payload.timeOut}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            timeOut: event.target.value,
                          }))
                        }
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label title="Enter the store manager's name for this visit">Store manager</Label>
                    <Input
                      value={draft.payload.storeManager}
                      onChange={(event) =>
                        updatePayload((payload) => ({
                          ...payload,
                          storeManager: event.target.value,
                        }))
                      }
                      placeholder="Enter manager name"
                      className="min-h-[44px]"
                    />
                  </div>
                </fieldset>
              </SectionCard>

              {draft.reportType === 'targeted_theft_visit' ? (
              <fieldset disabled={!canUseBuilder || isSaving} className="space-y-6">
                <SectionCard
                  title="1. Incident Overview"
                  description="Capture the pattern, products targeted, speed of the event, and escalation to violence."
                  promptSection={INCIDENT_OVERVIEW_PROMPTS}
                  className={cn(currentStep === 1 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Number of recent incidents confirmed</Label>
                        <Input
                          value={draft.payload.incidentOverview.incidentCount}
                          onChange={(event) =>
                            updatePayload((payload) => ({
                              ...payload,
                              incidentOverview: {
                                ...payload.incidentOverview,
                                incidentCount: event.target.value,
                              },
                            }))
                          }
                          placeholder="Enter incident count"
                          className="min-h-[44px]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Time taken (entry to exit, seconds)</Label>
                        <Input
                          value={draft.payload.incidentOverview.durationSeconds}
                          onChange={(event) =>
                            updatePayload((payload) => ({
                              ...payload,
                              incidentOverview: {
                                ...payload.incidentOverview,
                                durationSeconds: event.target.value,
                              },
                            }))
                          }
                          placeholder="Enter time in seconds"
                          className="min-h-[44px]"
                        />
                      </div>
                    </div>

                    <ChecklistGrid
                      fields={INCIDENT_OVERVIEW_FIELDS}
                      values={{
                        datesTimesRecorded: draft.payload.incidentOverview.datesTimesRecorded,
                        sameOffendersSuspected: draft.payload.incidentOverview.sameOffendersSuspected,
                        violenceInvolved: draft.payload.incidentOverview.violenceInvolved,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          incidentOverview: {
                            ...payload.incidentOverview,
                            [key]: !payload.incidentOverview[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="space-y-2">
                      <Label>Summary of the most recent incident</Label>
                      <Textarea
                        value={draft.payload.incidentOverview.summary}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            incidentOverview: {
                              ...payload.incidentOverview,
                              summary: event.target.value,
                            },
                          }))
                        }
                        placeholder="Describe the last theft step-by-step, including the group behaviour and escalation."
                        className="min-h-[120px]"
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <Label>People involved and injury capture</Label>
                          <p className="mt-1 text-sm text-slate-500">
                            Track offenders, employees, contractors, and anyone injured so the incident record feeds the LP case view correctly.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            updatePayload((payload) => ({
                              ...payload,
                              incidentPeople: {
                                ...payload.incidentPeople,
                                people: [...payload.incidentPeople.people, createEmptyIncidentPerson()],
                              },
                            }))
                          }
                          disabled={!canUseBuilder}
                          className="min-h-[40px] rounded-xl"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add person
                        </Button>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div className="space-y-2">
                          <Label>Was anyone injured during the incident?</Label>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { value: true, label: 'Yes' },
                              { value: false, label: 'No' },
                            ].map((option) => {
                              const isActive = draft.payload.incidentPeople.someoneInjured === option.value
                              return (
                                <button
                                  key={option.label}
                                  type="button"
                                  onClick={() =>
                                    updatePayload((payload) => ({
                                      ...payload,
                                      incidentPeople: {
                                        ...payload.incidentPeople,
                                        someoneInjured: option.value,
                                      },
                                    }))
                                  }
                                  disabled={!canUseBuilder}
                                  className={cn(
                                    'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                                    isActive
                                      ? ACTIVE_SELECTION_CLASS
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  )}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {draft.payload.incidentPeople.someoneInjured ? (
                          <div className="space-y-2">
                            <Label>Injury summary</Label>
                            <Textarea
                              value={draft.payload.incidentPeople.injurySummary}
                              onChange={(event) =>
                                updatePayload((payload) => ({
                                  ...payload,
                                  incidentPeople: {
                                    ...payload.incidentPeople,
                                    injurySummary: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Record who was injured, what happened, and any immediate treatment or escalation."
                              className="min-h-[100px]"
                            />
                          </div>
                        ) : null}

                        {draft.payload.incidentPeople.people.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                            No people logged yet. Add the offender group, affected employee, or any other person involved.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {draft.payload.incidentPeople.people.map((person: VisitReportIncidentPerson, index: number) => (
                              <div key={`incident-person-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-slate-900">
                                    Person {index + 1}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                      updatePayload((payload) => ({
                                        ...payload,
                                        incidentPeople: {
                                          ...payload.incidentPeople,
                                          people: payload.incidentPeople.people.filter(
                                            (_: VisitReportIncidentPerson, personIndex: number) => personIndex !== index
                                          ),
                                        },
                                      }))
                                    }
                                    disabled={!canUseBuilder}
                                    className="h-8 px-2 text-slate-500 hover:text-rose-600"
                                  >
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    Remove
                                  </Button>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>Name</Label>
                                    <Input
                                      value={person.name}
                                      onChange={(event) =>
                                        updatePayload((payload) => ({
                                          ...payload,
                                        incidentPeople: {
                                          ...payload.incidentPeople,
                                          people: payload.incidentPeople.people.map((entry: VisitReportIncidentPerson, personIndex: number) =>
                                            personIndex === index
                                              ? { ...entry, name: event.target.value }
                                              : entry
                                            ),
                                          },
                                        }))
                                      }
                                      placeholder="Name or identifier"
                                      className="min-h-[44px]"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Select
                                      value={person.role}
                                      onValueChange={(value) =>
                                        updatePayload((payload) => ({
                                          ...payload,
                                        incidentPeople: {
                                          ...payload.incidentPeople,
                                          people: payload.incidentPeople.people.map((entry: VisitReportIncidentPerson, personIndex: number) =>
                                            personIndex === index
                                              ? { ...entry, role: value as VisitReportIncidentPersonRole }
                                              : entry
                                            ),
                                          },
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="min-h-[44px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {INCIDENT_PERSON_ROLE_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <div className="mt-4 space-y-2">
                                  <Label>Involvement</Label>
                                  <Textarea
                                    value={person.involvement}
                                    onChange={(event) =>
                                      updatePayload((payload) => ({
                                        ...payload,
                                        incidentPeople: {
                                          ...payload.incidentPeople,
                                          people: payload.incidentPeople.people.map((entry: VisitReportIncidentPerson, personIndex: number) =>
                                            personIndex === index
                                              ? { ...entry, involvement: event.target.value }
                                              : entry
                                          ),
                                        },
                                      }))
                                    }
                                    placeholder="Describe how this person was involved."
                                    className="min-h-[88px]"
                                  />
                                </div>

                                <div className="mt-4 space-y-3">
                                  <Label>Was this person injured?</Label>
                                  <div className="flex flex-wrap gap-2">
                                    {[
                                      { value: true, label: 'Yes' },
                                      { value: false, label: 'No' },
                                    ].map((option) => {
                                      const isActive = person.injured === option.value
                                      return (
                                        <button
                                          key={`${index}-${option.label}`}
                                          type="button"
                                          onClick={() =>
                                            updatePayload((payload) => ({
                                              ...payload,
                                              incidentPeople: {
                                                ...payload.incidentPeople,
                                                someoneInjured:
                                                  option.value || payload.incidentPeople.someoneInjured,
                                                people: payload.incidentPeople.people.map((entry: VisitReportIncidentPerson, personIndex: number) =>
                                                  personIndex === index
                                                    ? {
                                                        ...entry,
                                                        injured: option.value,
                                                        injuryDetails: option.value ? entry.injuryDetails : '',
                                                      }
                                                    : entry
                                                ),
                                              },
                                            }))
                                          }
                                          disabled={!canUseBuilder}
                                          className={cn(
                                            'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                                            isActive
                                              ? ACTIVE_SELECTION_CLASS
                                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                          )}
                                        >
                                          {option.label}
                                        </button>
                                      )
                                    })}
                                  </div>

                                  {person.injured ? (
                                    <div className="space-y-2">
                                      <Label>Injury details</Label>
                                      <Textarea
                                        value={person.injuryDetails}
                                        onChange={(event) =>
                                          updatePayload((payload) => ({
                                            ...payload,
                                            incidentPeople: {
                                              ...payload.incidentPeople,
                                              someoneInjured: true,
                                              people: payload.incidentPeople.people.map((entry: VisitReportIncidentPerson, personIndex: number) =>
                                                personIndex === index
                                                  ? { ...entry, injuryDetails: event.target.value }
                                                  : entry
                                              ),
                                            },
                                          }))
                                        }
                                        placeholder="Capture the injury, treatment, and escalation for this person."
                                        className="min-h-[88px]"
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Primary products targeted</Label>
                        <Textarea
                          value={draft.payload.incidentOverview.primaryProducts}
                          onChange={(event) =>
                            updatePayload((payload) => ({
                              ...payload,
                              incidentOverview: {
                                ...payload.incidentOverview,
                                primaryProducts: event.target.value,
                              },
                            }))
                          }
                          placeholder="List the products that were targeted"
                          className="min-h-[110px]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Entry point used by offenders</Label>
                        <Textarea
                          value={draft.payload.incidentOverview.entryPoint}
                          onChange={(event) =>
                            updatePayload((payload) => ({
                              ...payload,
                              incidentOverview: {
                                ...payload.incidentOverview,
                                entryPoint: event.target.value,
                              },
                            }))
                          }
                          placeholder="Describe where offenders entered and moved"
                          className="min-h-[110px]"
                        />
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="2. Store Layout & Exposure"
                  description="Challenge how quickly offenders can access high-value stock and whether the counter creates delay."
                  promptSection={STORE_LAYOUT_PROMPTS}
                  className={cn(currentStep === 2 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <ChecklistGrid
                      fields={STORE_LAYOUT_FIELDS}
                      values={{
                        highValueVisibleFromEntrance: draft.payload.storeLayoutExposure.highValueVisibleFromEntrance,
                        highValueReachableWithinFiveSeconds: draft.payload.storeLayoutExposure.highValueReachableWithinFiveSeconds,
                        counterLeanOverAccess: draft.payload.storeLayoutExposure.counterLeanOverAccess,
                        counterBypassPossible: draft.payload.storeLayoutExposure.counterBypassPossible,
                        clearEscapeRouteBehindCounter: draft.payload.storeLayoutExposure.clearEscapeRouteBehindCounter,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          storeLayoutExposure: {
                            ...payload.storeLayoutExposure,
                            [key]: !payload.storeLayoutExposure[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="space-y-2">
                      <Label>Observations</Label>
                      <Textarea
                        value={draft.payload.storeLayoutExposure.observations}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            storeLayoutExposure: {
                              ...payload.storeLayoutExposure,
                              observations: event.target.value,
                            },
                          }))
                        }
                        placeholder="Record blind spots, exposed stock, counter weaknesses, and escape route issues."
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="3. Product Control Measures"
                  description="Check whether product presentation has adapted to repeat targeting and whether the main SKUs are still exposed."
                  promptSection={PRODUCT_CONTROL_PROMPTS}
                  className={cn(currentStep === 3 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <ChecklistGrid
                      fields={PRODUCT_CONTROL_FIELDS}
                      values={{
                        testersUsedInsteadOfLiveStock: draft.payload.productControlMeasures.testersUsedInsteadOfLiveStock,
                        emptyBoxesUsedForDisplay: draft.payload.productControlMeasures.emptyBoxesUsedForDisplay,
                        highValueStockReducedOnShopFloor: draft.payload.productControlMeasures.highValueStockReducedOnShopFloor,
                        fsduPositionedNearTill: draft.payload.productControlMeasures.fsduPositionedNearTill,
                        excessStockRemovedFromDisplay: draft.payload.productControlMeasures.excessStockRemovedFromDisplay,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          productControlMeasures: {
                            ...payload.productControlMeasures,
                            [key]: !payload.productControlMeasures[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>At-risk SKUs identified</Label>
                        <Textarea
                          value={draft.payload.productControlMeasures.atRiskSkus}
                          onChange={(event) =>
                            updatePayload((payload) => ({
                              ...payload,
                              productControlMeasures: {
                                ...payload.productControlMeasures,
                                atRiskSkus: event.target.value,
                              },
                            }))
                          }
                          placeholder="List the high-value lines the offenders are targeting repeatedly."
                          className="min-h-[110px]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Recommendations</Label>
                        <Textarea
                          value={draft.payload.productControlMeasures.recommendations}
                          onChange={(event) =>
                            updatePayload((payload) => ({
                              ...payload,
                              productControlMeasures: {
                                ...payload.productControlMeasures,
                                recommendations: event.target.value,
                              },
                            }))
                          }
                          placeholder="Explain what product-control changes should happen immediately or next."
                          className="min-h-[110px]"
                        />
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="4. Staff Positioning & Behaviour"
                  description="Assess visible deterrence, greeting discipline, and how staff control the front of store."
                  promptSection={STAFF_BEHAVIOUR_PROMPTS}
                  className={cn(currentStep === 4 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <ChecklistGrid
                      fields={STAFF_POSITION_FIELDS}
                      values={{
                        staffFacingEntrance: draft.payload.staffPositioningBehaviour.staffFacingEntrance,
                        immediateGreetingInPlace: draft.payload.staffPositioningBehaviour.immediateGreetingInPlace,
                        staffAwareOfGroupEntryRisks: draft.payload.staffPositioningBehaviour.staffAwareOfGroupEntryRisks,
                        staffMaintainVisibility: draft.payload.staffPositioningBehaviour.staffMaintainVisibility,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          staffPositioningBehaviour: {
                            ...payload.staffPositioningBehaviour,
                            [key]: !payload.staffPositioningBehaviour[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="space-y-2">
                      <Label>Observed staff behaviour</Label>
                      <Textarea
                        value={draft.payload.staffPositioningBehaviour.observedBehaviour}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            staffPositioningBehaviour: {
                              ...payload.staffPositioningBehaviour,
                              observedBehaviour: event.target.value,
                            },
                          }))
                        }
                        placeholder="Describe positioning, greetings, awareness posture, and any gaps."
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="5. Staff Safety & Response"
                  description="Confirm the team can respond safely and consistently without physical engagement."
                  promptSection={STAFF_SAFETY_PROMPTS}
                  className={cn(currentStep === 5 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <ChecklistGrid
                      fields={STAFF_SAFETY_FIELDS}
                      values={{
                        staffUnderstandDoNotEngage: draft.payload.staffSafetyResponse.staffUnderstandDoNotEngage,
                        noPhysicalInterventionObserved: draft.payload.staffSafetyResponse.noPhysicalInterventionObserved,
                        clearEscalationProcessInPlace: draft.payload.staffSafetyResponse.clearEscalationProcessInPlace,
                        policeReportingProcedureUnderstood: draft.payload.staffSafetyResponse.policeReportingProcedureUnderstood,
                        incidentLoggingProcedureFollowed: draft.payload.staffSafetyResponse.incidentLoggingProcedureFollowed,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          staffSafetyResponse: {
                            ...payload.staffSafetyResponse,
                            [key]: !payload.staffSafetyResponse[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="space-y-2">
                      <Label>Staff response to incidents</Label>
                      <Textarea
                        value={draft.payload.staffSafetyResponse.responseDescription}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            staffSafetyResponse: {
                              ...payload.staffSafetyResponse,
                              responseDescription: event.target.value,
                            },
                          }))
                        }
                        placeholder="Describe what staff currently do, where they disengage, and any unsafe behaviour that needs correction."
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="6. CCTV & Surveillance"
                  description="Test whether the current CCTV setup actually supports identification and targeted investigation."
                  promptSection={CCTV_PROMPTS}
                  className={cn(currentStep === 6 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <ChecklistGrid
                      fields={CCTV_FIELDS}
                      values={{
                        entranceCoveredClearly: draft.payload.cctvSurveillance.entranceCoveredClearly,
                        tillAreaCovered: draft.payload.cctvSurveillance.tillAreaCovered,
                        highValueAreasCovered: draft.payload.cctvSurveillance.highValueAreasCovered,
                        facialIdentificationPossible: draft.payload.cctvSurveillance.facialIdentificationPossible,
                        cameraAnglesAppropriate: draft.payload.cctvSurveillance.cameraAnglesAppropriate,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          cctvSurveillance: {
                            ...payload.cctvSurveillance,
                            [key]: !payload.cctvSurveillance[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="space-y-2">
                      <Label>Issues identified</Label>
                      <Textarea
                        value={draft.payload.cctvSurveillance.issuesIdentified}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            cctvSurveillance: {
                              ...payload.cctvSurveillance,
                              issuesIdentified: event.target.value,
                            },
                          }))
                        }
                        placeholder="Note blind spots, unusable angles, camera faults, or evidential weaknesses."
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="7. Communication & Radio Use"
                  description="Review whether radios and nearby-store communication are supporting early warning rather than reactive response."
                  promptSection={COMMUNICATION_PROMPTS}
                  className={cn(currentStep === 7 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <ChecklistGrid
                      fields={RADIO_FIELDS}
                      values={{
                        radioPresentAndWorking: draft.payload.communicationRadioUse.radioPresentAndWorking,
                        staffTrainedOnRadioUsage: draft.payload.communicationRadioUse.staffTrainedOnRadioUsage,
                        nearbyStoreCommunicationActive: draft.payload.communicationRadioUse.nearbyStoreCommunicationActive,
                        earlyWarningSystemInPlace: draft.payload.communicationRadioUse.earlyWarningSystemInPlace,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          communicationRadioUse: {
                            ...payload.communicationRadioUse,
                            [key]: !payload.communicationRadioUse[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="space-y-2">
                      <Label>Effectiveness of the radio system</Label>
                      <Textarea
                        value={draft.payload.communicationRadioUse.effectiveness}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            communicationRadioUse: {
                              ...payload.communicationRadioUse,
                              effectiveness: event.target.value,
                            },
                          }))
                        }
                        placeholder="Describe what the radio currently achieves and where it fails."
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="8. Environmental & External Factors"
                  description="Capture the wider pattern around centre security, nearby stores, and timing of the offences."
                  promptSection={ENVIRONMENT_PROMPTS}
                  className={cn(currentStep === 8 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <ChecklistGrid
                      fields={ENVIRONMENT_FIELDS}
                      values={{
                        nearbyStoresAlsoTargeted: draft.payload.environmentalExternalFactors.nearbyStoresAlsoTargeted,
                        shoppingCentreSecurityEngaged: draft.payload.environmentalExternalFactors.shoppingCentreSecurityEngaged,
                        offenderDescriptionsShared: draft.payload.environmentalExternalFactors.offenderDescriptionsShared,
                        peakRiskTimesIdentified: draft.payload.environmentalExternalFactors.peakRiskTimesIdentified,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          environmentalExternalFactors: {
                            ...payload.environmentalExternalFactors,
                            [key]: !payload.environmentalExternalFactors[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="space-y-2">
                      <Label>External risks</Label>
                      <Textarea
                        value={draft.payload.environmentalExternalFactors.externalRisks}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            environmentalExternalFactors: {
                              ...payload.environmentalExternalFactors,
                              externalRisks: event.target.value,
                            },
                          }))
                        }
                        placeholder="Record nearby patterns, centre-security issues, and timing risks."
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="9. Immediate Actions Taken"
                  description="Record what the LPO changed on the visit so the store is safer before the next incident."
                  promptSection={IMMEDIATE_ACTION_PROMPTS}
                  className={cn(currentStep === 9 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <ChecklistGrid
                      fields={IMMEDIATE_ACTION_FIELDS}
                      values={{
                        highRiskStockRemoved: draft.payload.immediateActionsTaken.highRiskStockRemoved,
                        stockRepositionedBehindCounter: draft.payload.immediateActionsTaken.stockRepositionedBehindCounter,
                        staffBriefedOnSafetyProcedures: draft.payload.immediateActionsTaken.staffBriefedOnSafetyProcedures,
                        entryAwarenessProtocolImplemented: draft.payload.immediateActionsTaken.entryAwarenessProtocolImplemented,
                        storeLayoutAdjustedWherePossible: draft.payload.immediateActionsTaken.storeLayoutAdjustedWherePossible,
                      }}
                      onToggle={(key) =>
                        updatePayload((payload) => ({
                          ...payload,
                          immediateActionsTaken: {
                            ...payload.immediateActionsTaken,
                            [key]: !payload.immediateActionsTaken[key],
                          },
                        }))
                      }
                      disabled={!canUseBuilder}
                    />

                    <div className="space-y-2">
                      <Label>Actions completed on site</Label>
                      <Textarea
                        value={draft.payload.immediateActionsTaken.actionsCompleted}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            immediateActionsTaken: {
                              ...payload.immediateActionsTaken,
                              actionsCompleted: event.target.value,
                            },
                          }))
                        }
                        placeholder="List what was changed before leaving: product lockdown, repositioning, staff briefing, entry protocol..."
                        className="min-h-[140px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="10. Recommendations"
                  description="Translate the visit into clear post-visit actions across physical security, operations, intelligence, and deterrence."
                  promptSection={RECOMMENDATION_PROMPTS}
                  className={cn(currentStep === 10 ? 'block' : 'hidden')}
                >
                  <div className="space-y-6">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-900">Physical security</h3>
                        <ChecklistGrid
                          fields={PHYSICAL_RECOMMENDATION_FIELDS}
                          values={draft.payload.recommendations.physical}
                          onToggle={(key) =>
                            updatePayload((payload) => ({
                              ...payload,
                              recommendations: {
                                ...payload.recommendations,
                                physical: {
                                  ...payload.recommendations.physical,
                                  [key]: !payload.recommendations.physical[key],
                                },
                              },
                            }))
                          }
                          disabled={!canUseBuilder}
                        />
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-900">Operational</h3>
                        <ChecklistGrid
                          fields={OPERATIONAL_RECOMMENDATION_FIELDS}
                          values={draft.payload.recommendations.operational}
                          onToggle={(key) =>
                            updatePayload((payload) => ({
                              ...payload,
                              recommendations: {
                                ...payload.recommendations,
                                operational: {
                                  ...payload.recommendations.operational,
                                  [key]: !payload.recommendations.operational[key],
                                },
                              },
                            }))
                          }
                          disabled={!canUseBuilder}
                        />
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-900">Intelligence</h3>
                        <ChecklistGrid
                          fields={INTELLIGENCE_RECOMMENDATION_FIELDS}
                          values={draft.payload.recommendations.intelligence}
                          onToggle={(key) =>
                            updatePayload((payload) => ({
                              ...payload,
                              recommendations: {
                                ...payload.recommendations,
                                intelligence: {
                                  ...payload.recommendations.intelligence,
                                  [key]: !payload.recommendations.intelligence[key],
                                },
                              },
                            }))
                          }
                          disabled={!canUseBuilder}
                        />
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-900">Deterrence</h3>
                        <ChecklistGrid
                          fields={DETERRENCE_RECOMMENDATION_FIELDS}
                          values={draft.payload.recommendations.deterrence}
                          onToggle={(key) =>
                            updatePayload((payload) => ({
                              ...payload,
                              recommendations: {
                                ...payload.recommendations,
                                deterrence: {
                                  ...payload.recommendations.deterrence,
                                  [key]: !payload.recommendations.deterrence[key],
                                },
                              },
                            }))
                          }
                          disabled={!canUseBuilder}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Detailed recommendations</Label>
                      <Textarea
                        value={draft.payload.recommendations.details}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            recommendations: {
                              ...payload.recommendations,
                              details: event.target.value,
                            },
                          }))
                        }
                        placeholder="Write the post-visit recommendations you would send back to the business."
                        className="min-h-[160px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="11. Risk Rating"
                  description="Make the overall risk call based on repeat targeting, staff safety exposure, and how much vulnerability remains."
                  className={cn(currentStep === 11 ? 'block' : 'hidden')}
                >
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                      {RISK_LEVEL_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            updatePayload((payload) => ({
                              ...payload,
                              riskRating: option.value,
                            }))
                          }
                          disabled={!canUseBuilder}
                          className={cn(
                            'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                            draft.payload.riskRating === option.value
                              ? option.className
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Label>Justification</Label>
                      <Textarea
                        value={draft.payload.riskJustification}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            riskJustification: event.target.value,
                          }))
                        }
                        placeholder="Explain why the store is low, medium, high, or critical risk after this visit."
                        className="min-h-[140px]"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="12. Sign-Off"
                  description="Capture the names for the visit report record and store handover."
                  className={cn(currentStep === 12 ? 'block' : 'hidden')}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label title="Enter the person who carried out the visit">Visited by</Label>
                      <Input
                        value={draft.payload.signOff.visitedBy}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            signOff: {
                              ...payload.signOff,
                              visitedBy: event.target.value,
                            },
                          }))
                        }
                        className="min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label title="Enter the store representative for sign-off">Store representative</Label>
                      <Input
                        value={draft.payload.signOff.storeRepresentative}
                        onChange={(event) =>
                          updatePayload((payload) => ({
                            ...payload,
                            signOff: {
                              ...payload.signOff,
                              storeRepresentative: event.target.value,
                            },
                          }))
                        }
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>
                </SectionCard>
              </fieldset>
              ) : (
                <ActivityVisitReportBuilder
                  reportType={draft.reportType as ActivityVisitReportType}
                  payload={draft.payload as ActivityVisitReportPayload}
                  currentStep={currentStep}
                  disabled={!canUseBuilder || isSaving}
                  productCatalog={productCatalog}
                  onChange={(updater) =>
                    updateDraft((current) => ({
                      ...current,
                      payload: updater(current.payload as ActivityVisitReportPayload),
                    }))
                  }
                />
              )}

              <div className="hidden justify-between gap-2 md:flex">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
                  disabled={isFirstStep}
                  className="min-h-[44px] rounded-xl"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setCurrentStep((step) => Math.min(step + 1, builderSteps.length - 1))}
                  disabled={isLastStep}
                  className="min-h-[44px] rounded-xl"
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="hidden space-y-6 xl:col-span-4 xl:block">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:sticky md:top-6 md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-ink-soft" />
                  <h2 className="text-lg font-bold text-slate-900">Report Preview</h2>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Completion
                    </div>
                    <div className="mt-2 text-3xl font-bold text-slate-900">{completionStats.percent}%</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {completionStats.completed} of {completionStats.total} core sections covered
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Store
                    </div>
                    <div className="mt-2 text-lg font-bold text-slate-900">
                      {selectedStore ? selectedStore.storeName : 'No store selected'}
                    </div>
                    {selectedStore ? (
                      <div className="mt-1 text-sm text-slate-500">
                        {getDisplayStoreCode(selectedStore.storeCode) || 'No code'}
                        {selectedStore.city ? ` • ${selectedStore.city}` : ''}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Current summary
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {summaryPreview || 'Start answering the form and the structured report summary will build here.'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Report status
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {getVisitReportTypeLabel(draft.reportType)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {draft.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                      {draft.reportType === 'targeted_theft_visit' &&
                      isTargetedTheftPayload(draft.payload) &&
                      draft.payload.riskRating ? (
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                          Risk {draft.payload.riskRating.toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={!canUseBuilder || isSaving}
                    className="min-h-[46px] w-full rounded-2xl"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : draft.status === 'final' ? 'Save Final Report' : 'Save Draft'}
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-ink-soft" />
                  <h2 className="text-lg font-bold text-slate-900">Recent Reports</h2>
                </div>

                <div className="space-y-3">
                  {recentReports.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      No visit reports saved yet.
                    </div>
                  ) : (
                    recentReports.slice(0, 8).map((report) => (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => handleLoadReport(report)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{report.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatStoreName(report.storeName)}
                              {report.storeCode ? ` • ${report.storeCode}` : ''}
                            </div>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            {report.status === 'final' ? 'Final' : 'Draft'}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          <span>{formatAppDate(report.visitDate)}</span>
                          {report.riskRating ? <span>Risk {report.riskRating.toUpperCase()}</span> : null}
                          {report.createdByName ? <span>{report.createdByName}</span> : null}
                        </div>

                        {report.summary ? (
                          <p className="mt-2 text-xs leading-relaxed text-slate-600">{report.summary}</p>
                        ) : null}

                        <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          {report.status === 'final' ? 'Open PDF' : 'Load into editor'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                        {report.status === 'draft' ? (
                          <div className="mt-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                handleDeleteDraftReport(report)
                              }}
                              disabled={isSaving || deletingReportId === report.id}
                              className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              {deletingReportId === report.id ? 'Deleting...' : 'Delete Draft'}
                            </Button>
                          </div>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <ExportCard
              title="Incidents Data"
              description="Full export of incident records, status, severity, and resolution data."
              action="/api/reports/incidents"
            />
            <ExportCard
              title="Actions Log"
              description="Comprehensive export of corrective actions, due dates, and owners."
              action="/api/reports/actions"
            />
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Reporting Workflow</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Use the `Report Builder` tab for structured targeted-theft visit reports. The legacy newsletter and audit workflow has been removed from this page.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      ) : null}

      {selectedTemplate && activeTab === 'builder' ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
              disabled={isFirstStep}
              className="min-h-[46px] rounded-xl"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              type="button"
              onClick={isLastStep ? handleSave : () => setCurrentStep((step) => Math.min(step + 1, builderSteps.length - 1))}
              disabled={isLastStep ? !canUseBuilder || isSaving : isLastStep}
              className="min-h-[46px] rounded-xl"
            >
              {isLastStep
                ? isSaving
                  ? 'Saving...'
                  : draft.status === 'final'
                    ? 'Save Final Report'
                    : 'Save Draft'
                : 'Next'}
              {isLastStep ? <Save className="ml-2 h-4 w-4" /> : <ChevronRight className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  )
}
