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
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
} from 'lucide-react'

import { saveVisitReport } from '@/app/actions/visit-reports'
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
import { toast } from '@/hooks/use-toast'
import {
  buildTargetedTheftVisitSummary,
  buildVisitReportTitle,
  getEmptyTargetedTheftVisitPayload,
  getVisitReportTypeLabel,
  VISIT_REPORT_TYPE_OPTIONS,
  type TargetedTheftVisitPayload,
  type VisitReportRecord,
  type VisitReportRiskLevel,
  type VisitReportStatus,
  type VisitReportStoreOption,
  type VisitReportType,
} from '@/lib/reports/visit-report-types'
import { formatStoreName } from '@/lib/store-display'
import { cn, formatAppDate, getDisplayStoreCode } from '@/lib/utils'

interface VisitReportsWorkspaceProps {
  stores: VisitReportStoreOption[]
  reports: VisitReportRecord[]
  currentUserName: string | null
  canEdit: boolean
  reportsAvailable: boolean
  unavailableMessage: string | null
}

type VisitReportDraft = {
  reportId?: string
  reportType: VisitReportType
  status: VisitReportStatus
  title: string
  storeId: string
  payload: TargetedTheftVisitPayload
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
    'What happened in the latest incident, step by step (entry, action, exit)?',
    'What time/day did it happen, and is there a repeat pattern?',
    'Which products or areas were targeted first?',
    'How long did the incident take from entry to exit?',
  ],
}

const STORE_LAYOUT_PROMPTS: PromptSection = {
  title: 'Observe and test',
  prompts: [
    'From the entrance, what high-risk stock or zones are immediately accessible?',
    'Can the counter or controlled areas be easily reached or bypassed?',
    'Where are the blind spots and easiest exit paths?',
  ],
}

const PRODUCT_CONTROL_PROMPTS: PromptSection = {
  title: 'Check controls',
  prompts: [
    'Are display controls in place (testers/empty boxes/limited live stock)?',
    'Are frequently targeted lines overstocked on the shop floor?',
    'What stock can be moved or protected immediately?',
  ],
}

const STAFF_BEHAVIOUR_PROMPTS: PromptSection = {
  title: 'Observe team behaviour',
  prompts: [
    'Who owns the front-of-store response when risk enters?',
    'Is there an immediate greeting and visible deterrent presence?',
    'Do staff keep clear visibility across floor and till areas?',
  ],
}

const STAFF_SAFETY_PROMPTS: PromptSection = {
  title: 'Test response',
  prompts: [
    'What is the team response for a high-risk group entry?',
    'When do staff disengage, and who escalates to emergency services?',
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
    'What was changed before leaving the site?',
    'Which product, layout, staffing, or process actions were completed immediately?',
  ],
}

const RECOMMENDATION_PROMPTS: PromptSection = {
  title: 'Set next actions',
  prompts: [
    'What physical controls are required next?',
    'What staff/process changes reduce risk and repeat loss?',
    'What intelligence-sharing or external escalation is required now?',
  ],
}

const INCIDENT_OVERVIEW_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['incidentOverview']>>> = [
  { key: 'datesTimesRecorded', label: 'Dates/times of incidents recorded' },
  {
    key: 'sameOffendersSuspected',
    label: 'Repeat group or repeat pattern suspected',
    description: 'If checked, summarise why in incident notes.',
  },
  {
    key: 'violenceInvolved',
    label: 'Violence or threat involved',
    description: 'If checked, record exact behaviours and who was affected.',
  },
]

const STORE_LAYOUT_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['storeLayoutExposure']>>> = [
  { key: 'highValueVisibleFromEntrance', label: 'High-value stock visible from entrance' },
  { key: 'highValueReachableWithinFiveSeconds', label: 'High-value stock reachable within 3-5 seconds' },
  { key: 'counterLeanOverAccess', label: 'Counter easily accessible by leaning over' },
  { key: 'counterBypassPossible', label: 'Counter can be physically bypassed / jumped' },
  {
    key: 'clearEscapeRouteBehindCounter',
    label: 'Clear escape route exists behind counter',
    description: 'If checked, note route and visibility gaps in observations.',
  },
]

const PRODUCT_CONTROL_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['productControlMeasures']>>> = [
  { key: 'testersUsedInsteadOfLiveStock', label: 'Testers used instead of live stock' },
  { key: 'emptyBoxesUsedForDisplay', label: 'Empty boxes used for display' },
  {
    key: 'highValueStockReducedOnShopFloor',
    label: 'High-value stock reduced on shop floor',
    description: 'If unchecked, capture which lines remain overexposed.',
  },
  { key: 'fsduPositionedNearTill', label: 'FSDU / displays positioned near till or controlled zone' },
  { key: 'excessStockRemovedFromDisplay', label: 'Excess stock removed from display' },
]

const STAFF_POSITION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['staffPositioningBehaviour']>>> = [
  { key: 'staffFacingEntrance', label: 'Staff positioned facing the entrance' },
  { key: 'immediateGreetingInPlace', label: 'Immediate customer greeting is in place' },
  { key: 'staffAwareOfGroupEntryRisks', label: 'Staff understand group-entry risk' },
  {
    key: 'staffMaintainVisibility',
    label: 'Staff maintain visibility across the floor',
    description: 'If not consistent, note where visibility is lost.',
  },
]

const STAFF_SAFETY_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['staffSafetyResponse']>>> = [
  { key: 'staffUnderstandDoNotEngage', label: 'Staff understand the DO NOT ENGAGE policy' },
  { key: 'noPhysicalInterventionObserved', label: 'No physical intervention observed / encouraged' },
  { key: 'clearEscalationProcessInPlace', label: 'Clear escalation process is in place' },
  { key: 'policeReportingProcedureUnderstood', label: 'Police reporting procedure is understood' },
  {
    key: 'incidentLoggingProcedureFollowed',
    label: 'Incident logging procedure is followed',
    description: 'If not followed, record where the process breaks.',
  },
]

const CCTV_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['cctvSurveillance']>>> = [
  { key: 'entranceCoveredClearly', label: 'Entrance covered clearly' },
  { key: 'tillAreaCovered', label: 'Till area covered' },
  { key: 'highValueAreasCovered', label: 'High-value product areas covered' },
  {
    key: 'facialIdentificationPossible',
    label: 'Facial identification is possible',
    description: 'If no, record distance/angle/lighting issues.',
  },
  { key: 'cameraAnglesAppropriate', label: 'Camera angles are appropriate' },
]

const RADIO_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['communicationRadioUse']>>> = [
  { key: 'radioPresentAndWorking', label: 'Store radio is present and working' },
  { key: 'staffTrainedOnRadioUsage', label: 'Staff are trained on radio usage' },
  { key: 'nearbyStoreCommunicationActive', label: 'Communication with nearby stores is active' },
  { key: 'earlyWarningSystemInPlace', label: 'Early warning system is in place' },
]

const ENVIRONMENT_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['environmentalExternalFactors']>>> = [
  { key: 'nearbyStoresAlsoTargeted', label: 'Nearby stores also targeted' },
  { key: 'shoppingCentreSecurityEngaged', label: 'Shopping centre security engaged' },
  { key: 'offenderDescriptionsShared', label: 'Known descriptions/intelligence shared' },
  { key: 'peakRiskTimesIdentified', label: 'Peak risk times identified' },
]

const IMMEDIATE_ACTION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['immediateActionsTaken']>>> = [
  { key: 'highRiskStockRemoved', label: 'High-risk stock removed or reduced' },
  { key: 'stockRepositionedBehindCounter', label: 'Stock repositioned behind counter' },
  { key: 'staffBriefedOnSafetyProcedures', label: 'Staff briefed on safety procedures' },
  { key: 'entryAwarenessProtocolImplemented', label: 'Entry awareness protocol implemented' },
  { key: 'storeLayoutAdjustedWherePossible', label: 'Store layout adjusted where possible' },
]

const PHYSICAL_RECOMMENDATION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['recommendations']['physical']>>> = [
  { key: 'counterModificationsRequired', label: 'Counter or barrier modifications required' },
  { key: 'lockableStorageRequired', label: 'Lockable storage required' },
  { key: 'additionalSecurityPresenceRecommended', label: 'Additional security presence recommended' },
]

const OPERATIONAL_RECOMMENDATION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['recommendations']['operational']>>> = [
  { key: 'staffTrainingRequired', label: 'Staff training required' },
  { key: 'improvedIncidentLoggingRequired', label: 'Improved incident logging required' },
  { key: 'revisedProceduresRequired', label: 'Revised procedures required' },
]

const INTELLIGENCE_RECOMMENDATION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['recommendations']['intelligence']>>> = [
  { key: 'offenderInformationSharingRequired', label: 'Offender information sharing required' },
  { key: 'liaisonWithCentreSecurityRequired', label: 'Liaison with centre security required' },
  { key: 'policeEngagementRequired', label: 'Police engagement required' },
]

const DETERRENCE_RECOMMENDATION_FIELDS: Array<ChecklistFieldConfig<BooleanFieldKey<TargetedTheftVisitPayload['recommendations']['deterrence']>>> = [
  { key: 'highValueStockSignageRecommended', label: 'Signage that high-value stock is not kept on display' },
  { key: 'strongStaffEngagementOnEntryRequired', label: 'Stronger staff engagement on entry' },
]

const RISK_LEVEL_OPTIONS: Array<{ value: VisitReportRiskLevel; label: string; className: string }> = [
  { value: 'low', label: 'Low', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { value: 'medium', label: 'Medium', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  { value: 'high', label: 'High', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  { value: 'critical', label: 'Critical', className: 'border-[#232154] bg-[#f5f1fb] text-[#232154]' },
]

function createEmptyDraft(currentUserName: string | null): VisitReportDraft {
  return {
    reportType: 'targeted_theft_visit',
    status: 'draft',
    title: '',
    storeId: '',
    payload: getEmptyTargetedTheftVisitPayload(currentUserName),
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
        <button
          key={field.key}
          type="button"
          onClick={() => onToggle(field.key)}
          disabled={disabled}
          className={cn(
            'rounded-2xl border px-4 py-3 text-left transition-colors',
            values[field.key]
              ? 'border-[#232154] bg-[#f5f1fb] text-[#232154]'
              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
            disabled ? 'cursor-not-allowed opacity-60' : ''
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-bold',
                values[field.key]
                  ? 'border-[#232154] bg-[#232154] text-white'
                  : 'border-slate-300 bg-white text-transparent'
              )}
            >
              ✓
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{field.label}</div>
              {field.description ? (
                <div className="mt-1 text-xs text-slate-500">{field.description}</div>
              ) : null}
            </div>
          </div>
        </button>
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

const VISIT_REPORT_DRAFT_STORAGE_KEY = 'tfs-visit-report-builder-draft-v1'

export function VisitReportsWorkspace({
  stores,
  reports,
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

  const canUseBuilder = canEdit && reportsAvailable
  const selectedStore = stores.find((store) => store.id === draft.storeId) || null
  const summaryPreview = buildTargetedTheftVisitSummary(draft.payload)

  const completionStats = useMemo(() => {
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
  }, [draft])

  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === REPORT_BUILDER_STEPS.length - 1
  const isSheetMode = searchParams?.get('sheet') === '1'

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(VISIT_REPORT_DRAFT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        draft?: VisitReportDraft
        storeSearch?: string
        currentStep?: number
      }
      if (parsed?.draft) {
        setDraft((current) => ({
          ...current,
          ...parsed.draft,
        }))
        setSelectedTemplate(parsed.draft.reportType || 'targeted_theft_visit')
      }
      if (typeof parsed?.storeSearch === 'string') {
        setStoreSearch(parsed.storeSearch)
      }
      if (typeof parsed?.currentStep === 'number') {
        setCurrentStep(
          Math.max(0, Math.min(parsed.currentStep, REPORT_BUILDER_STEPS.length - 1))
        )
      }
    } catch (error) {
      console.error('Failed to restore visit report draft:', error)
    }
  }, [])

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

  const updatePayload = (updater: (payload: TargetedTheftVisitPayload) => TargetedTheftVisitPayload) => {
    updateDraft((current) => ({
      ...current,
      payload: updater(current.payload),
    }))
  }

  const handleNewReport = () => {
    const nextDraft = createEmptyDraft(currentUserName)
    setDraft(nextDraft)
    setStoreSearch('')
    setCurrentStep(0)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(VISIT_REPORT_DRAFT_STORAGE_KEY)
    }
  }

  const handleStartTemplate = (reportType: VisitReportType) => {
    updateDraft((current) => ({
      ...current,
      reportType,
    }))
    setSelectedTemplate(reportType)
    setActiveTab('builder')
    setCurrentStep(0)
    router.replace('/reports?sheet=1')
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
          current.payload.visitDate
        ),
    }))
    setStoreSearch(getStoreSearchLabel(store))
  }

  const handleLoadReport = (report: VisitReportRecord) => {
    setDraft({
      reportId: report.id,
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
    router.replace('/reports?sheet=1')
  }

  const handleSave = () => {
    if (!canUseBuilder) return

    if (!draft.storeId) {
      toast({
        variant: 'destructive',
        title: 'Store required',
        description: 'Select the store for this report before saving.',
      })
      return
    }

    startSave(async () => {
      try {
        const store = stores.find((item) => item.id === draft.storeId)
        const result = await saveVisitReport({
          reportId: draft.reportId,
          storeId: draft.storeId,
          reportType: draft.reportType,
          status: draft.status,
          title:
            draft.title.trim() ||
            buildVisitReportTitle(
              draft.reportType,
              store?.storeName || 'Store',
              draft.payload.visitDate
            ),
          payload: draft.payload,
        })

        const nextRecord: VisitReportRecord = {
          id: result.id,
          storeId: draft.storeId,
          storeName: store?.storeName || 'Unknown Store',
          storeCode: store?.storeCode || null,
          reportType: draft.reportType,
          status: result.status,
          title: result.title,
          summary: result.summary,
          visitDate: result.visitDate,
          riskRating: draft.payload.riskRating,
          payload: draft.payload,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          createdByName: currentUserName,
        }

        setDraft((current) => ({
          ...current,
          reportId: result.id,
          title: result.title,
        }))
        setRecentReports((current) => {
          const otherReports = current.filter((report) => report.id !== result.id)
          return [nextRecord, ...otherReports].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
        })

        toast({
          title: draft.reportId ? 'Report updated' : 'Report saved',
          description: `${result.title} has been ${draft.reportId ? 'updated' : 'saved'}.`,
        })
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            VISIT_REPORT_DRAFT_STORAGE_KEY,
            JSON.stringify({
              draft: {
                ...draft,
                reportId: result.id,
                title: result.title,
              },
              storeSearch,
              currentStep,
              savedAt: new Date().toISOString(),
            })
          )
        }
        router.refresh()
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Save failed',
          description: error instanceof Error ? error.message : 'Failed to save report.',
        })
      }
    })
  }

  const handleDownloadPdf = () => {
    if (!draft.reportId) {
      toast({
        variant: 'destructive',
        title: 'Save report first',
        description: 'Save this report before downloading a PDF.',
      })
      return
    }
    window.open(`/api/reports/visit-reports/${draft.reportId}/pdf?mode=download`, '_blank')
  }

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div
        className={cn(
          'relative overflow-hidden rounded-3xl bg-[linear-gradient(145deg,#1c0259_0%,#232154_52%,#2f2b72_100%)] p-5 text-white shadow-[0_20px_44px_rgba(28,2,89,0.18)] md:p-8',
          selectedTemplate && activeTab === 'builder' ? 'hidden md:block' : 'block'
        )}
      >
        <div className="absolute right-0 top-0 h-80 w-80 translate-x-1/3 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-56 w-56 -translate-x-1/3 translate-y-1/3 rounded-full bg-[#2A8742]/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#c9c2eb]">
              <FileText size={14} />
              TFS Reporting
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reports</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/75">
              Select a report template to start. This report home supports additional report types as they are added.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {selectedTemplate ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleBackToReportHome}
                className="min-h-[44px] w-full rounded-2xl border-white/20 bg-white/10 px-4 text-white hover:bg-white/20 sm:w-auto"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Report home
              </Button>
            ) : null}
            {selectedTemplate ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadPdf}
                  className="min-h-[44px] w-full rounded-2xl border-white/20 bg-white/10 px-4 text-white hover:bg-white/20 sm:w-auto"
                >
                  <Download className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleNewReport}
                  className="min-h-[44px] w-full rounded-2xl border-white/20 bg-white/10 px-4 text-white hover:bg-white/20 sm:w-auto"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  New report
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!canUseBuilder || isSaving}
                  className="min-h-[44px] w-full rounded-2xl bg-white px-4 text-slate-900 hover:bg-slate-100 sm:w-auto"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? 'Saving...' : draft.status === 'final' ? 'Save Final Report' : 'Save Draft'}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

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
                <h2 className="text-xl font-bold text-slate-900">Targeted Theft Visit Report</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Structured report for theft pattern review, controls, team response, and actions.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                Live
              </span>
            </div>
            <Button
              type="button"
              onClick={() => handleStartTemplate('targeted_theft_visit')}
              disabled={!canUseBuilder || !reportsAvailable}
              className="min-h-[46px] w-full rounded-2xl bg-[#232154] text-white hover:bg-[#1c0259]"
            >
              Start report
            </Button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#232154]" />
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
                    <div className="font-semibold text-slate-900">{report.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatStoreName(report.storeName)}
                      {report.storeCode ? ` • ${report.storeCode}` : ''}
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
              <div className="h-[72px] md:hidden" aria-hidden />
              <div className="fixed inset-x-3.5 top-[calc(var(--mobile-header-height,0px)+1rem)] z-20 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:inset-x-4 md:static md:inset-auto md:top-auto md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Step {currentStep + 1} of {REPORT_BUILDER_STEPS.length}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{REPORT_BUILDER_STEPS[currentStep]}</h2>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#232154] md:hidden"
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
                        setCurrentStep((step) => Math.min(step + 1, REPORT_BUILDER_STEPS.length - 1))
                      }
                      disabled={isLastStep}
                      className="min-h-[44px] rounded-xl bg-[#232154] text-white hover:bg-[#1c0259]"
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

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
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            reportType: value as VisitReportType,
                          }))
                        }
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
                              draft.payload.visitDate
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
                  onClick={() => setCurrentStep((step) => Math.min(step + 1, REPORT_BUILDER_STEPS.length - 1))}
                  disabled={isLastStep}
                  className="min-h-[44px] rounded-xl bg-[#232154] text-white hover:bg-[#1c0259]"
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="hidden space-y-6 xl:col-span-4 xl:block">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:sticky md:top-6 md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-[#232154]" />
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
                      {draft.payload.riskRating ? (
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
                    className="min-h-[46px] w-full rounded-2xl bg-[#232154] text-white hover:bg-[#1c0259]"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : draft.status === 'final' ? 'Save Final Report' : 'Save Draft'}
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-[#232154]" />
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

                        <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#232154]">
                          Load into editor
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
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
                  Use the `Report Builder` tab for structured targeted-theft visit reports. The old Footasylum newsletter/audit reporting flow has been removed from this page.
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
              onClick={isLastStep ? handleSave : () => setCurrentStep((step) => Math.min(step + 1, REPORT_BUILDER_STEPS.length - 1))}
              disabled={isLastStep ? !canUseBuilder || isSaving : isLastStep}
              className="min-h-[46px] rounded-xl bg-[#232154] text-white hover:bg-[#1c0259]"
            >
              {isLastStep
                ? isSaving
                  ? 'Saving...'
                  : draft.status === 'final'
                    ? 'Save & Create Follow-ups'
                    : 'Save Draft'
                : 'Next'}
              {isLastStep ? <Save className="ml-2 h-4 w-4" /> : <ChevronRight className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
