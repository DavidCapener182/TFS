'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Check, Clock, ExternalLink, Plus, Upload, X } from 'lucide-react'

import {
  completeStoreVisitSession,
  logStoreVisit,
  saveDraftStoreVisitSession,
} from '@/app/actions/store-visits'
import { saveVisitReport } from '@/app/actions/visit-reports'
import { StoreVisitActivitySummary } from '@/components/visit-tracker/store-visit-activity-summary'
import type { VisitTrackerRow } from '@/components/visit-tracker/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import type { StoreVisitProductCatalogItem } from '@/lib/store-visit-product-catalog'
import {
  getEmptyActivityVisitReportPayload,
  getEmptyTargetedTheftVisitPayload,
  getVisitReportTypeLabel,
  VISIT_REPORT_TEMPLATES,
  type VisitReportType,
} from '@/lib/reports/visit-report-types'
import {
  buildStoreVisitActivityDetailText,
  buildStoreVisitCountedItemVarianceNote,
  formatStoreVisitCurrency,
  getStoreVisitNeedLevelLabel,
  getStoreVisitTypeLabel,
  getStoreVisitCountedItemDelta,
  getStoreVisitCountedItemVarianceValue,
  STORE_VISIT_ACTIVITY_OPTIONS,
  STORE_VISIT_TYPE_OPTIONS,
  type StoreVisitActivityFieldDefinition,
  type StoreVisitActivityKey,
  type StoreVisitActivityPayload,
  type StoreVisitActivityPayloads,
  type StoreVisitAmountCheck,
  type StoreVisitCountedItem,
  type StoreVisitType,
} from '@/lib/visit-needs'
import { formatStoreName } from '@/lib/store-display'
import { cn } from '@/lib/utils'

interface StoreVisitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: VisitTrackerRow | null
  productCatalog: StoreVisitProductCatalogItem[]
  canEdit: boolean
  currentUserName: string | null
  visitsAvailable: boolean
  visitsUnavailableMessage: string | null
}

type ActivityFilesState = Partial<Record<StoreVisitActivityKey, File[]>>

function getLocalDateTimeInputValue() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

function getDefaultVisitType(row: VisitTrackerRow): StoreVisitType {
  if (row.nextPlannedVisitDate) return 'planned'
  if (row.visitNeeded) return 'action_led'
  return 'random_area'
}

function getNeedLevelClasses(level: VisitTrackerRow['visitNeedLevel']): string {
  if (level === 'urgent') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (level === 'needed') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (level === 'monitor') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Failed to log visit. Please try again.'
}

function parseIntegerInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed)
}

function parseAmountInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

function formatNullableNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function formatNullableAmount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function createDraftVisitReportPayload(reportType: VisitReportType, preparedBy: string | null) {
  if (reportType === 'targeted_theft_visit') {
    return getEmptyTargetedTheftVisitPayload(preparedBy)
  }

  return getEmptyActivityVisitReportPayload(reportType, preparedBy)
}

function stripAutoVarianceNote(notes: string | null | undefined): string {
  const normalizedNotes = String(notes || '').trim()
  if (!normalizedNotes) return ''

  const lines = normalizedNotes.split('\n')
  if (lines[0]?.startsWith('Variance: ')) {
    return lines.slice(1).join('\n').trim()
  }

  return normalizedNotes
}

function syncCountedItemNotes(item: StoreVisitCountedItem): StoreVisitCountedItem {
  const manualNotes = stripAutoVarianceNote(item.notes)
  const autoNote = buildStoreVisitCountedItemVarianceNote(item)
  const mergedNotes = [autoNote, manualNotes].filter(Boolean).join(autoNote && manualNotes ? '\n' : '')

  if (mergedNotes) {
    return {
      ...item,
      notes: mergedNotes,
    }
  }

  const nextItem = { ...item }
  delete nextItem.notes
  return nextItem
}

function getMatchingProducts(
  productCatalog: StoreVisitProductCatalogItem[],
  query: string,
  limit = 8
): StoreVisitProductCatalogItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  return productCatalog
    .filter((product) => {
      const fields = [product.title, product.brand, product.productBaseName]
      return fields.some((field) => String(field || '').toLowerCase().includes(normalizedQuery))
    })
    .slice(0, limit)
}

function getDefaultPayloadForActivity(key: StoreVisitActivityKey): StoreVisitActivityPayload {
  const option = STORE_VISIT_ACTIVITY_OPTIONS.find((item) => item.key === key)
  if (option?.formVariant === 'line-check') {
    return { itemsChecked: [{}] }
  }
  if (option?.formVariant === 'cash-check') {
    return { amountChecks: [{}] }
  }
  return {}
}

function updateObjectValue<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

function BooleanChoice({
  value,
  onChange,
  trueLabel,
  falseLabel,
  idPrefix,
}: {
  value: boolean | null | undefined
  onChange: (value: boolean | null) => void
  trueLabel: string
  falseLabel: string
  idPrefix: string
}) {
  const options = [
    { value: 'unset', label: 'Not set' },
    { value: 'true', label: trueLabel },
    { value: 'false', label: falseLabel },
  ] as const

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected =
          (option.value === 'unset' && value === null) ||
          (option.value === 'true' && value === true) ||
          (option.value === 'false' && value === false)

        return (
          <button
            key={`${idPrefix}-${option.value}`}
            type="button"
            onClick={() =>
              onChange(option.value === 'unset' ? null : option.value === 'true')
            }
            className={cn(
              'inline-flex min-h-[38px] items-center rounded-full border px-3 py-2 text-xs font-semibold transition-colors',
              selected
                ? 'border-[#232154] bg-[#232154] text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ActivitySelectionCard({
  activityKey,
  label,
  description,
  selected,
  onToggle,
}: {
  activityKey: StoreVisitActivityKey
  label: string
  description: string
  selected: boolean
  onToggle: (key: StoreVisitActivityKey) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(activityKey)}
      className={cn(
        'rounded-2xl border px-4 py-4 text-left transition-colors',
        selected
          ? 'border-[#232154] bg-[#f5f1fb] shadow-[0_12px_24px_rgba(35,33,84,0.08)]'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
            selected
              ? 'border-[#232154] bg-[#232154] text-white'
              : 'border-slate-300 bg-white text-transparent'
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">{label}</div>
          <div className="mt-1 text-xs leading-relaxed text-slate-500">{description}</div>
        </div>
      </div>
    </button>
  )
}

function mergeProductMatches(
  localMatches: StoreVisitProductCatalogItem[],
  remoteMatches: StoreVisitProductCatalogItem[]
): StoreVisitProductCatalogItem[] {
  return Array.from(
    new Map(
      [...localMatches, ...remoteMatches].map((product) => [product.productId, product])
    ).values()
  )
}

function getProductVariantLabel(product: StoreVisitProductCatalogItem | undefined): string {
  return getProductVariantParts(product).variantLabel
}

function getProductSizeLabel(product: StoreVisitProductCatalogItem | undefined): string {
  return getProductVariantParts(product).sizeLabel
}

function trimTrailingTitleSegment(title: string, trailingSegment: string): string {
  const normalizedTitle = title.trim()
  const normalizedSegment = trailingSegment.trim()

  if (!normalizedTitle || !normalizedSegment) {
    return normalizedTitle
  }

  if (!normalizedTitle.toLowerCase().endsWith(normalizedSegment.toLowerCase())) {
    return normalizedTitle
  }

  return normalizedTitle
    .slice(0, normalizedTitle.length - normalizedSegment.length)
    .replace(/[\s\-–—,:/]+$/g, '')
    .trim()
}

function getProductFragranceLabel(product: StoreVisitProductCatalogItem | undefined): string {
  if (!product) return ''

  const normalizedTitle = product.title.trim()
  const productBaseName = String(product.productBaseName || '').trim()
  const strippedByBaseName = trimTrailingTitleSegment(normalizedTitle, productBaseName)

  if (strippedByBaseName && strippedByBaseName !== normalizedTitle) {
    return strippedByBaseName
  }

  const { variantLabel, sizeLabel } = getProductVariantParts(product)
  const combinedSuffix = [variantLabel, sizeLabel].filter(Boolean).join(' ').trim()
  const strippedByVariant = trimTrailingTitleSegment(normalizedTitle, combinedSuffix)

  return strippedByVariant || normalizedTitle
}

function getProductVariantParts(product: StoreVisitProductCatalogItem | undefined): {
  variantLabel: string
  sizeLabel: string
} {
  if (!product) {
    return { variantLabel: '', sizeLabel: '' }
  }

  const sourceText = String(product.productBaseName || '').trim() || (() => {
    const normalizedTitle = product.title.trim()
    const normalizedBrand = String(product.brand || '').trim()

    if (normalizedBrand && normalizedTitle.toLowerCase().startsWith(normalizedBrand.toLowerCase())) {
      return normalizedTitle.slice(normalizedBrand.length).trim()
    }

    return normalizedTitle
  })()

  const sizeMatch = sourceText.match(
    /(.*?)(\b\d+(?:\.\d+)?\s?(?:ml|g|kg|cl|l|oz)\b(?:\s*(?:spray|gift set|refill|bottle|jar|stick|tester))?)$/i
  )

  if (!sizeMatch) {
    return {
      variantLabel: sourceText,
      sizeLabel: '',
    }
  }

  return {
    variantLabel: String(sizeMatch[1] || '').trim(),
    sizeLabel: String(sizeMatch[2] || '').trim(),
  }
}

function FragranceProductField({
  activityKey,
  index,
  value,
  productCatalog,
  onSelect,
}: {
  activityKey: StoreVisitActivityKey
  index: number
  value: string
  productCatalog: StoreVisitProductCatalogItem[]
  onSelect: (patch: Partial<StoreVisitCountedItem>) => void
}) {
  const [remoteMatches, setRemoteMatches] = useState<StoreVisitProductCatalogItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearchResults, setHasSearchResults] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    const query = value.trim()
    const normalizedQuery = query.toLowerCase()

    if (query.length < 2) {
      setRemoteMatches([])
      setIsSearching(false)
      setHasSearchResults(false)
      setSearchError(null)
      return
    }

    if (productCatalog.some((product) => product.title.toLowerCase() === normalizedQuery)) {
      setRemoteMatches([])
      setIsSearching(false)
      setHasSearchResults(false)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    setIsSearching(true)
    setHasSearchResults(false)
    setSearchError(null)
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/store-visits/products/search?q=${encodeURIComponent(query)}&limit=8`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          throw new Error(`Search failed with status ${response.status}`)
        }

        const payload = (await response.json()) as {
          items?: StoreVisitProductCatalogItem[]
        }
        setRemoteMatches(Array.isArray(payload.items) ? payload.items : [])
        setHasSearchResults(true)
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to search fragrance products:', error)
          setRemoteMatches([])
          setHasSearchResults(true)
          setSearchError('Could not load website products right now.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [productCatalog, value])

  const normalizedValue = value.trim().toLowerCase()
  const localMatches = getMatchingProducts(productCatalog, value)
  const productMatches = mergeProductMatches(localMatches, remoteMatches)
  const hasExactProductMatch =
    normalizedValue.length > 0 &&
    productMatches.some((catalogItem) => {
      const titleMatch = catalogItem.title.toLowerCase() === normalizedValue
      const fragranceMatch = getProductFragranceLabel(catalogItem).toLowerCase() === normalizedValue
      return titleMatch || fragranceMatch
    })
  const showSuggestions = normalizedValue.length >= 2 && !hasExactProductMatch

  return (
    <div className="space-y-2">
      <Input
        id={`${activityKey}-product-${index}`}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          const matchedProduct = productMatches.find(
            (catalogItem) =>
              catalogItem.title.toLowerCase() === nextValue.trim().toLowerCase() ||
              getProductFragranceLabel(catalogItem).toLowerCase() === nextValue.trim().toLowerCase()
          )

          onSelect({
            productId: matchedProduct?.productId,
            productLabel: matchedProduct ? getProductFragranceLabel(matchedProduct) : nextValue,
            variantLabel: matchedProduct ? getProductVariantLabel(matchedProduct) : '',
            sizeLabel: matchedProduct ? getProductSizeLabel(matchedProduct) : '',
            unitPrice: matchedProduct?.price ?? null,
          })
        }}
        placeholder="Search fragrance title..."
        className="min-h-[44px]"
      />

      {showSuggestions ? (
        isSearching ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">
            Searching website products...
          </div>
        ) : productMatches.length > 0 ? (
          <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/90 p-2">
            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Matching products
            </div>
            <div className="space-y-1">
              {productMatches.map((product) => (
                <button
                  key={product.productId}
                  type="button"
                  onClick={() =>
                    onSelect({
                      productId: product.productId,
                      productLabel: getProductFragranceLabel(product),
                      variantLabel: getProductVariantLabel(product),
                      sizeLabel: getProductSizeLabel(product),
                      unitPrice: product.price,
                    })
                  }
                  className="flex w-full flex-col rounded-xl border border-transparent bg-white px-3 py-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-100"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900">{product.title}</span>
                    {typeof product.price === 'number' ? (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {formatStoreVisitCurrency(product.price)}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 text-xs text-slate-500">
                    {product.brand || 'Fragrance'}
                    {product.productBaseName ? ` • ${product.productBaseName}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : searchError ? (
          <div className="rounded-2xl border border-dashed border-rose-300 bg-rose-50 px-3 py-3 text-xs text-rose-700">
            {searchError} You can still type the item manually.
          </div>
        ) : hasSearchResults ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">
            No products found for that search. You can still type the name manually.
          </div>
        ) : null
      ) : null}
    </div>
  )
}

function EvidenceUploader({
  activityKey,
  evidenceLabel,
  files,
  onAddFiles,
  onRemoveFile,
}: {
  activityKey: StoreVisitActivityKey
  evidenceLabel: string
  files: File[]
  onAddFiles: (activityKey: StoreVisitActivityKey, files: FileList | null) => void
  onRemoveFile: (activityKey: StoreVisitActivityKey, index: number) => void
}) {
  const inputId = `visit-evidence-${activityKey}`

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">{evidenceLabel}</div>
        <div className="mt-1 text-xs text-slate-500">
          Upload PDFs or photos. Files are attached when the visit is saved.
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Upload className="h-3.5 w-3.5" />
          Add file
        </label>
        <input
          id={inputId}
          type="file"
          accept=".pdf,image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            onAddFiles(activityKey, event.target.files)
            event.currentTarget.value = ''
          }}
        />
      </div>

      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-800">{file.name}</div>
                <div>{Math.max(1, Math.round(file.size / 1024))} KB</div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(activityKey, index)}
                className="rounded-full border border-slate-200 p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ActivityFormSection({
  activityKey,
  title,
  description,
  formVariant,
  evidenceLabel,
  fields,
  payload,
  files,
  productCatalog,
  onFieldChange,
  onAmountConfirmedChange,
  onAddCountedItem,
  onUpdateCountedItem,
  onRemoveCountedItem,
  onAddAmountCheck,
  onUpdateAmountCheck,
  onRemoveAmountCheck,
  onAddFiles,
  onRemoveFile,
}: {
  activityKey: StoreVisitActivityKey
  title: string
  description: string
  formVariant: 'structured' | 'line-check' | 'cash-check'
  evidenceLabel: string
  fields: readonly StoreVisitActivityFieldDefinition[]
  payload: StoreVisitActivityPayload
  files: File[]
  productCatalog: StoreVisitProductCatalogItem[]
  onFieldChange: (activityKey: StoreVisitActivityKey, fieldKey: string, value: string) => void
  onAmountConfirmedChange: (activityKey: StoreVisitActivityKey, value: boolean | null) => void
  onAddCountedItem: (activityKey: StoreVisitActivityKey) => void
  onUpdateCountedItem: (
    activityKey: StoreVisitActivityKey,
    index: number,
    patch: Partial<StoreVisitCountedItem>
  ) => void
  onRemoveCountedItem: (activityKey: StoreVisitActivityKey, index: number) => void
  onAddAmountCheck: (activityKey: StoreVisitActivityKey) => void
  onUpdateAmountCheck: (
    activityKey: StoreVisitActivityKey,
    index: number,
    patch: Partial<StoreVisitAmountCheck>
  ) => void
  onRemoveAmountCheck: (activityKey: StoreVisitActivityKey, index: number) => void
  onAddFiles: (activityKey: StoreVisitActivityKey, files: FileList | null) => void
  onRemoveFile: (activityKey: StoreVisitActivityKey, index: number) => void
}) {
  return (
    <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <span className="inline-flex rounded-full border border-[#dcd6ef] bg-[#f6f2fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#4b3a78]">
          Selected
        </span>
      </div>

      {(formVariant === 'line-check' || formVariant === 'cash-check') ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
          {formVariant === 'line-check'
            ? 'Fragrance list is pulled from the live website catalog and revalidated automatically. If a variant or size is missing, enter it manually in the fields below.'
            : 'Use the amount rows for each bag, till, or banking item checked, then confirm whether the correct amount was present overall.'}
        </div>
      ) : null}

      {fields.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {fields.map((field) => {
            const fieldId = `${activityKey}-${field.key}`
            const value = payload.fields?.[field.key] || ''
            const isTextarea = field.input === 'textarea'

            return (
              <div
                key={field.key}
                className={cn('space-y-2', isTextarea ? 'xl:col-span-2' : '')}
              >
                <Label htmlFor={fieldId}>{field.label}</Label>
                {isTextarea ? (
                  <Textarea
                    id={fieldId}
                    value={value}
                    onChange={(event) => onFieldChange(activityKey, field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="min-h-[96px] bg-white"
                  />
                ) : (
                  <Input
                    id={fieldId}
                    value={value}
                    onChange={(event) => onFieldChange(activityKey, field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="min-h-[44px] bg-white"
                  />
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {formVariant === 'line-check' ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Items checked</div>
              <div className="mt-1 text-xs text-slate-500">
                Add each fragrance checked in store, the quantity in the system, and the quantity counted.
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => onAddCountedItem(activityKey)} className="min-h-[40px]">
              <Plus className="mr-2 h-4 w-4" />
              Add fragrance
            </Button>
          </div>

          <div className="space-y-3">
            {(payload.itemsChecked || []).map((item, index) => {
              const productValue = String(item.productLabel || '')
              const varianceDelta = getStoreVisitCountedItemDelta(item)
              const varianceValue = getStoreVisitCountedItemVarianceValue(item)
              return (
              <div key={`${activityKey}-item-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2.4fr)_140px_110px_110px]">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor={`${activityKey}-product-${index}`}>Fragrance</Label>
                      <FragranceProductField
                        activityKey={activityKey}
                        index={index}
                        value={productValue}
                        productCatalog={productCatalog}
                        onSelect={(patch) => onUpdateCountedItem(activityKey, index, patch)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`${activityKey}-variant-${index}`}>Variant</Label>
                      <Input
                        id={`${activityKey}-variant-${index}`}
                        value={item.variantLabel || ''}
                        onChange={(event) =>
                          onUpdateCountedItem(activityKey, index, { variantLabel: event.target.value })
                        }
                        placeholder="Intensely Eau De Parfum"
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${activityKey}-size-${index}`}>Size</Label>
                    <Input
                      id={`${activityKey}-size-${index}`}
                      value={item.sizeLabel || ''}
                      onChange={(event) =>
                        onUpdateCountedItem(activityKey, index, { sizeLabel: event.target.value })
                      }
                      placeholder="50ml"
                      className="min-h-[44px]"
                    />
                    {typeof item.unitPrice === 'number' ? (
                      <div className="text-xs font-medium text-slate-500">
                        Website price: {formatStoreVisitCurrency(item.unitPrice)}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${activityKey}-system-${index}`}>In system</Label>
                    <Input
                      id={`${activityKey}-system-${index}`}
                      type="number"
                      inputMode="numeric"
                      value={formatNullableNumber(item.systemQuantity)}
                      onChange={(event) =>
                        onUpdateCountedItem(activityKey, index, {
                          systemQuantity: parseIntegerInput(event.target.value),
                        })
                      }
                      className="min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${activityKey}-counted-${index}`}>Counted</Label>
                    <Input
                      id={`${activityKey}-counted-${index}`}
                      type="number"
                      inputMode="numeric"
                      value={formatNullableNumber(item.countedQuantity)}
                      onChange={(event) =>
                        onUpdateCountedItem(activityKey, index, {
                          countedQuantity: parseIntegerInput(event.target.value),
                        })
                      }
                      className="min-h-[44px]"
                    />
                  </div>
                </div>

                {(varianceDelta !== null && varianceDelta !== 0) || varianceValue !== null ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    {varianceDelta !== null && varianceDelta !== 0 ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                        {varianceDelta < 0 ? `${Math.abs(varianceDelta)} missing` : `${varianceDelta} extra`}
                      </span>
                    ) : null}
                    {varianceValue !== null ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700">
                        Value {formatStoreVisitCurrency(varianceValue)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor={`${activityKey}-item-notes-${index}`}>Notes</Label>
                    <Textarea
                      id={`${activityKey}-item-notes-${index}`}
                      value={item.notes || ''}
                      onChange={(event) =>
                        onUpdateCountedItem(activityKey, index, { notes: event.target.value })
                      }
                      placeholder="Variance notes, display issue, stockroom location..."
                      className="min-h-[88px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onRemoveCountedItem(activityKey, index)}
                    className="min-h-[44px] border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )})}
          </div>
        </div>
      ) : null}

      {formVariant === 'cash-check' ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="space-y-2">
            <Label>Correct amount present?</Label>
            <BooleanChoice
              value={payload.amountConfirmed}
              onChange={(value) => onAmountConfirmedChange(activityKey, value)}
              trueLabel="Correct amount present"
              falseLabel="Discrepancy found"
              idPrefix={`${activityKey}-amount-confirmed`}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Amount checks</div>
              <div className="mt-1 text-xs text-slate-500">
                Add each till, banking bag, or cash item reviewed during the visit.
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => onAddAmountCheck(activityKey)} className="min-h-[40px]">
              <Plus className="mr-2 h-4 w-4" />
              Add row
            </Button>
          </div>

          <div className="space-y-3">
            {(payload.amountChecks || []).map((item, index) => (
              <div key={`${activityKey}-amount-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_120px_120px_170px]">
                  <div className="space-y-2">
                    <Label htmlFor={`${activityKey}-amount-label-${index}`}>Label</Label>
                    <Input
                      id={`${activityKey}-amount-label-${index}`}
                      value={item.label || ''}
                      onChange={(event) =>
                        onUpdateAmountCheck(activityKey, index, { label: event.target.value })
                      }
                      placeholder="Till 1, safe bag, banking envelope..."
                      className="min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${activityKey}-system-amount-${index}`}>In system</Label>
                    <Input
                      id={`${activityKey}-system-amount-${index}`}
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={formatNullableAmount(item.systemAmount)}
                      onChange={(event) =>
                        onUpdateAmountCheck(activityKey, index, {
                          systemAmount: parseAmountInput(event.target.value),
                        })
                      }
                      className="min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${activityKey}-counted-amount-${index}`}>Counted</Label>
                    <Input
                      id={`${activityKey}-counted-amount-${index}`}
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={formatNullableAmount(item.countedAmount)}
                      onChange={(event) =>
                        onUpdateAmountCheck(activityKey, index, {
                          countedAmount: parseAmountInput(event.target.value),
                        })
                      }
                      className="min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={
                        item.amountMatches === null || item.amountMatches === undefined
                          ? 'unset'
                          : item.amountMatches
                            ? 'matched'
                            : 'mismatch'
                      }
                      onValueChange={(value) =>
                        onUpdateAmountCheck(activityKey, index, {
                          amountMatches:
                            value === 'unset' ? null : value === 'matched',
                        })
                      }
                    >
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Not set</SelectItem>
                        <SelectItem value="matched">Matched</SelectItem>
                        <SelectItem value="mismatch">Mismatch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor={`${activityKey}-amount-notes-${index}`}>Notes</Label>
                    <Input
                      id={`${activityKey}-amount-notes-${index}`}
                      value={item.notes || ''}
                      onChange={(event) =>
                        onUpdateAmountCheck(activityKey, index, { notes: event.target.value })
                      }
                      placeholder="Variance reason, missing slip, re-count required..."
                      className="min-h-[44px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onRemoveAmountCheck(activityKey, index)}
                    className="min-h-[44px] border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <EvidenceUploader
        activityKey={activityKey}
        evidenceLabel={evidenceLabel}
        files={files}
        onAddFiles={onAddFiles}
        onRemoveFile={onRemoveFile}
      />
    </section>
  )
}

function VisitHistoryList({ row }: { row: VisitTrackerRow }) {
  return (
    <div className="space-y-3">
      {row.recentVisits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
          No visit logs recorded for this store yet.
        </div>
      ) : (
        row.recentVisits.map((visit) => (
          <div key={visit.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                {visit.visitType === 'route_completion'
                  ? 'Planned route visit'
                  : getStoreVisitTypeLabel(visit.visitType)}
              </span>
              {visit.needLevelSnapshot ? (
                <span
                  className={cn(
                    'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                    getNeedLevelClasses(visit.needLevelSnapshot)
                  )}
                >
                  {getStoreVisitNeedLevelLabel(visit.needLevelSnapshot)}
                  {typeof visit.needScoreSnapshot === 'number' ? ` (${visit.needScoreSnapshot})` : ''}
                </span>
              ) : null}
            </div>

            <div className="mt-3 text-sm font-semibold text-slate-900">
              {format(new Date(visit.visitedAt), 'dd MMM yyyy HH:mm')}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {visit.createdByName || 'Unknown officer'}
            </div>

            {visit.linkedReports.length > 0 ? (
              <div className="mt-3 space-y-2">
                {visit.linkedReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{report.title}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{getVisitReportTypeLabel(report.reportType)}</span>
                        <span>{report.status === 'final' ? 'Final' : 'Draft'}</span>
                        <span>{format(new Date(report.updatedAt), 'dd MMM yyyy HH:mm')}</span>
                      </div>
                      {report.summary ? (
                        <p className="mt-2 text-xs leading-relaxed text-slate-600">{report.summary}</p>
                      ) : null}
                    </div>
                    <Button asChild size="sm" variant="outline" className="border-slate-200 bg-white">
                      <Link
                        href={
                          report.status === 'final'
                            ? `/api/reports/visit-reports/${report.id}/pdf?mode=view`
                            : `/reports?sheet=1&reportId=${report.id}`
                        }
                        target={report.status === 'final' ? '_blank' : undefined}
                      >
                        Open report
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            {visit.completedActivityKeys.length > 0 ? (
              <div className="mt-3 space-y-2">
                {visit.completedActivityKeys.map((activityKey) => (
                  <StoreVisitActivitySummary
                    key={`${visit.id}-${activityKey}`}
                    activityKey={activityKey}
                    detailText={visit.completedActivityDetails[activityKey]}
                    payload={visit.completedActivityPayloads[activityKey]}
                    evidenceFiles={visit.evidenceFiles.filter((file) => file.activityKey === activityKey)}
                  />
                ))}
              </div>
            ) : null}

            {visit.notes ? (
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {visit.notes}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  )
}

export function StoreVisitModal({
  open,
  onOpenChange,
  row,
  productCatalog,
  canEdit,
  currentUserName,
  visitsAvailable,
  visitsUnavailableMessage,
}: StoreVisitModalProps) {
  const router = useRouter()
  const [visitSessionId, setVisitSessionId] = useState<string | null>(null)
  const [visitType, setVisitType] = useState<StoreVisitType>('action_led')
  const [visitedAt, setVisitedAt] = useState(getLocalDateTimeInputValue())
  const [selectedActivityKeys, setSelectedActivityKeys] = useState<StoreVisitActivityKey[]>([])
  const [activityPayloads, setActivityPayloads] = useState<StoreVisitActivityPayloads>({})
  const [activityFiles, setActivityFiles] = useState<ActivityFilesState>({})
  const [notes, setNotes] = useState('')
  const [followUpRequired, setFollowUpRequired] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()
  const [isLaunchingReport, startLaunchReport] = useTransition()
  const [isCompletingVisit, startCompleteVisit] = useTransition()

  useEffect(() => {
    if (!row || !open) return
    setVisitSessionId(row.activeDraftVisit?.id || null)
    setVisitType(
      row.activeDraftVisit?.visitType && row.activeDraftVisit.visitType !== 'route_completion'
        ? row.activeDraftVisit.visitType
        : getDefaultVisitType(row)
    )
    setVisitedAt(
      row.activeDraftVisit?.visitedAt
        ? format(new Date(row.activeDraftVisit.visitedAt), "yyyy-MM-dd'T'HH:mm")
        : getLocalDateTimeInputValue()
    )
    setSelectedActivityKeys([])
    setActivityPayloads({})
    setActivityFiles({})
    setNotes(row.activeDraftVisit?.notes || '')
    setFollowUpRequired(Boolean(row.activeDraftVisit?.followUpRequired))
    setIsHistoryOpen(false)
    setError(null)
  }, [open, row])

  if (!row) return null

  const canSave = canEdit && visitsAvailable
  const linkedReports = row.activeDraftVisit?.linkedReports || []
  const outstandingLinkedReports =
    linkedReports.filter((report) => report.status !== 'final')

  const selectedOptions = STORE_VISIT_ACTIVITY_OPTIONS.filter((option) =>
    selectedActivityKeys.includes(option.key)
  )

  const updateActivityPayload = (
    key: StoreVisitActivityKey,
    updater: (payload: StoreVisitActivityPayload) => StoreVisitActivityPayload | undefined
  ) => {
    setActivityPayloads((current) => {
      const next = { ...current }
      const updatedPayload = updater(next[key] || {})
      if (updatedPayload && Object.keys(updatedPayload).length > 0) {
        next[key] = updatedPayload
      } else {
        delete next[key]
      }
      return next
    })
  }

  const toggleActivity = (key: StoreVisitActivityKey) => {
    setSelectedActivityKeys((current) => {
      if (current.includes(key)) {
        return current.filter((value) => value !== key)
      }
      return [...current, key]
    })

    setActivityPayloads((current) => {
      if (selectedActivityKeys.includes(key)) {
        if (!(key in current)) return current
        const next = { ...current }
        delete next[key]
        return next
      }

      if (current[key]) return current
      return {
        ...current,
        [key]: getDefaultPayloadForActivity(key),
      }
    })

    setActivityFiles((current) => {
      if (!selectedActivityKeys.includes(key)) return current
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const updateStructuredField = (
    activityKey: StoreVisitActivityKey,
    fieldKey: string,
    value: string
  ) => {
    updateActivityPayload(activityKey, (payload) => {
      const next: StoreVisitActivityPayload = { ...payload }
      const fields = { ...(payload.fields || {}) }
      const trimmedValue = value.trim()
      if (trimmedValue) {
        fields[fieldKey] = value
      } else {
        delete fields[fieldKey]
      }

      if (Object.keys(fields).length > 0) {
        next.fields = fields
      } else {
        delete next.fields
      }

      return updateObjectValue(next)
    })
  }

  const updateAmountConfirmed = (
    activityKey: StoreVisitActivityKey,
    value: boolean | null
  ) => {
    updateActivityPayload(activityKey, (payload) => {
      const next: StoreVisitActivityPayload = { ...payload }
      if (value === null) {
        delete next.amountConfirmed
      } else {
        next.amountConfirmed = value
      }
      return updateObjectValue(next)
    })
  }

  const addCountedItem = (activityKey: StoreVisitActivityKey) => {
    updateActivityPayload(activityKey, (payload) => ({
      ...payload,
      itemsChecked: [...(payload.itemsChecked || []), {}],
    }))
  }

  const updateCountedItem = (
    activityKey: StoreVisitActivityKey,
    index: number,
    patch: Partial<StoreVisitCountedItem>
  ) => {
    updateActivityPayload(activityKey, (payload) => {
      const itemsChecked = [...(payload.itemsChecked || [])]
      itemsChecked[index] = syncCountedItemNotes({
        ...(itemsChecked[index] || {}),
        ...patch,
      })
      return {
        ...payload,
        itemsChecked,
      }
    })
  }

  const removeCountedItem = (activityKey: StoreVisitActivityKey, index: number) => {
    updateActivityPayload(activityKey, (payload) => {
      const itemsChecked = (payload.itemsChecked || []).filter((_, itemIndex) => itemIndex !== index)
      const next: StoreVisitActivityPayload = { ...payload }
      if (itemsChecked.length > 0) {
        next.itemsChecked = itemsChecked
      } else {
        delete next.itemsChecked
      }
      return updateObjectValue(next)
    })
  }

  const addAmountCheck = (activityKey: StoreVisitActivityKey) => {
    updateActivityPayload(activityKey, (payload) => ({
      ...payload,
      amountChecks: [...(payload.amountChecks || []), {}],
    }))
  }

  const updateAmountCheck = (
    activityKey: StoreVisitActivityKey,
    index: number,
    patch: Partial<StoreVisitAmountCheck>
  ) => {
    updateActivityPayload(activityKey, (payload) => {
      const amountChecks = [...(payload.amountChecks || [])]
      amountChecks[index] = {
        ...(amountChecks[index] || {}),
        ...patch,
      }
      return {
        ...payload,
        amountChecks,
      }
    })
  }

  const removeAmountCheck = (activityKey: StoreVisitActivityKey, index: number) => {
    updateActivityPayload(activityKey, (payload) => {
      const amountChecks = (payload.amountChecks || []).filter((_, itemIndex) => itemIndex !== index)
      const next: StoreVisitActivityPayload = { ...payload }
      if (amountChecks.length > 0) {
        next.amountChecks = amountChecks
      } else {
        delete next.amountChecks
      }
      return updateObjectValue(next)
    })
  }

  const addActivityFiles = (activityKey: StoreVisitActivityKey, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    setActivityFiles((current) => ({
      ...current,
      [activityKey]: [...(current[activityKey] || []), ...Array.from(fileList)],
    }))
  }

  const removeActivityFile = (activityKey: StoreVisitActivityKey, index: number) => {
    setActivityFiles((current) => {
      const files = (current[activityKey] || []).filter((_, fileIndex) => fileIndex !== index)
      if (files.length === 0) {
        const next = { ...current }
        delete next[activityKey]
        return next
      }
      return {
        ...current,
        [activityKey]: files,
      }
    })
  }

  const uploadEvidenceFiles = async (visitId: string): Promise<string[]> => {
    const uploadErrors: string[] = []

    for (const activityKey of selectedActivityKeys) {
      const files = activityFiles[activityKey] || []
      if (files.length === 0) continue

      const formData = new FormData()
      formData.append('visitId', visitId)
      formData.append('activityKey', activityKey)
      files.forEach((file) => formData.append('files', file))

      const response = await fetch('/api/store-visits/evidence/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        uploadErrors.push(
          payload?.error ||
            `Failed to upload evidence for ${
              STORE_VISIT_ACTIVITY_OPTIONS.find((option) => option.key === activityKey)?.label || activityKey
            }.`
        )
      }
    }

    return uploadErrors
  }

  const handleStartReport = (reportType: VisitReportType) => {
    if (!canSave) return

    setError(null)
    startLaunchReport(async () => {
      try {
        const existingDraftReport =
          row.activeDraftVisit?.linkedReports.find(
            (report) => report.reportType === reportType && report.status === 'draft'
          ) || null

        const session = await saveDraftStoreVisitSession({
          visitId: visitSessionId || undefined,
          storeId: row.storeId,
          visitType,
          visitedAt,
          notes,
          followUpRequired,
          needScoreSnapshot: row.visitNeedScore,
          needLevelSnapshot: row.visitNeedLevel,
          needReasonsSnapshot: row.visitNeedReasons,
        })

        let reportId = existingDraftReport?.id || null

        if (!reportId) {
          const report = await saveVisitReport({
            storeVisitId: session.id,
            storeId: row.storeId,
            reportType,
            status: 'draft',
            payload: createDraftVisitReportPayload(reportType, currentUserName),
          })
          reportId = report.id
        }

        setVisitSessionId(session.id)
        onOpenChange(false)

        const params = new URLSearchParams({
          sheet: '1',
          visitId: session.id,
          storeId: row.storeId,
          visitedAt: session.visitedAt,
        })
        if (reportId) {
          params.set('reportId', reportId)
        } else {
          params.set('template', reportType)
        }
        router.push(`/reports?${params.toString()}`)
      } catch (launchError) {
        setError(toErrorMessage(launchError))
      }
    })
  }

  const handleCompleteVisit = () => {
    if (!canSave || !visitSessionId) return

    setError(null)
    startCompleteVisit(async () => {
      try {
        await completeStoreVisitSession({
          visitId: visitSessionId,
          storeId: row.storeId,
          visitType,
          visitedAt,
          notes,
          followUpRequired,
          needScoreSnapshot: row.visitNeedScore,
          needLevelSnapshot: row.visitNeedLevel,
          needReasonsSnapshot: row.visitNeedReasons,
        })

        toast({
          title: 'Visit completed',
          description: `${formatStoreName(row.storeName)} has been logged in the visit tracker.`,
          variant: 'success',
        })

        setVisitSessionId(null)
        onOpenChange(false)
        router.refresh()
      } catch (completeError) {
        setError(toErrorMessage(completeError))
      }
    })
  }

  const handleSubmit = () => {
    if (!canSave) return

    if (notes.trim().length === 0) {
      setError('Add visit notes before saving a note-only visit.')
      return
    }

    setError(null)
    startSave(async () => {
      try {
        const visit = await logStoreVisit({
          storeId: row.storeId,
          visitType,
          visitedAt,
          completedActivityKeys: [],
          completedActivityDetails: {},
          completedActivityPayloads: {},
          notes,
          followUpRequired,
          needScoreSnapshot: row.visitNeedScore,
          needLevelSnapshot: row.visitNeedLevel,
          needReasonsSnapshot: row.visitNeedReasons,
        })

        toast({
          title: 'Visit logged',
          description: `${formatStoreName(row.storeName)} has been updated in the visit tracker.`,
          variant: 'success',
        })

        onOpenChange(false)
        router.refresh()
      } catch (saveError) {
        setError(toErrorMessage(saveError))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 md:top-4 md:h-[calc(100vh-2rem)] md:max-h-[calc(100vh-2rem)] md:w-[calc(100vw-2rem)] md:max-w-none md:rounded-[2rem] md:p-0">
        <div className="flex h-full min-h-0 flex-col bg-white">
          <DialogHeader className="border-b border-slate-200 bg-[linear-gradient(145deg,#f8fafc_0%,#ffffff_55%,#f6f2fe_100%)] px-6 py-5 md:px-8 md:py-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold text-slate-900">
                  {formatStoreName(row.storeName)}
                </DialogTitle>
                <DialogDescription className="mt-2 max-w-3xl text-sm text-slate-600">
                  Log what the LP officer completed on site, capture structured evidence for checks like line counts and banking, and keep the visit tracker aligned with current actions.
                </DialogDescription>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setIsHistoryOpen(true)}
                className="min-h-[44px] self-start border-slate-200 bg-white/80"
              >
                <Clock className="mr-2 h-4 w-4" />
                Recent Visit History
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {row.recentVisits.length}
                </span>
              </Button>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.95fr)]">
              <div className="min-h-0 overflow-y-auto px-6 py-6 md:px-8">
                <div className="space-y-6">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Visit Need</div>
                      <div className="mt-3 flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                            getNeedLevelClasses(row.visitNeedLevel)
                          )}
                        >
                          {getStoreVisitNeedLevelLabel(row.visitNeedLevel)}
                        </span>
                        <span className="text-sm font-semibold text-slate-700">Score {row.visitNeedScore}</span>
                      </div>
                      <div className="mt-3 text-xs leading-relaxed text-slate-500">
                        {row.visitNeedReasons.length > 0
                          ? row.visitNeedReasons.join(' • ')
                          : 'No active LP or security drivers are currently pushing a visit.'}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Tracker State</div>
                      <div className="mt-3 text-sm font-semibold text-slate-900">
                        {row.nextPlannedVisitDate
                          ? `Planned for ${format(new Date(row.nextPlannedVisitDate), 'dd MMM yyyy')}`
                          : row.lastVisitDate
                            ? `Last visit ${format(new Date(row.lastVisitDate), 'dd MMM yyyy')}`
                            : 'No current plan or visit logged'}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {row.openStoreActionCount} open actions • {row.openIncidentCount} open incidents
                      </div>
                    </div>
                  </div>

                  {!canSave && visitsUnavailableMessage ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {visitsUnavailableMessage}
                    </div>
                  ) : null}

                  {!canEdit ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      You have read-only access. An admin or ops user needs to log visits.
                    </div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="visit-type">Visit type</Label>
                      <Select value={visitType} onValueChange={(value) => setVisitType(value as StoreVisitType)}>
                        <SelectTrigger id="visit-type" className="min-h-[46px]">
                          <SelectValue placeholder="Select visit type" />
                        </SelectTrigger>
                        <SelectContent>
                          {STORE_VISIT_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        {STORE_VISIT_TYPE_OPTIONS.find((option) => option.value === visitType)?.description}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="visited-at">Visited at</Label>
                      <Input
                        id="visited-at"
                        type="datetime-local"
                        value={visitedAt}
                        onChange={(event) => setVisitedAt(event.target.value)}
                        className="min-h-[46px]"
                      />
                    </div>
                  </div>

                  {visitSessionId ? (
                    <div className="rounded-3xl border border-[#dcd6ef] bg-[#f6f2fe] p-5 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-[#4b3a78]">
                            Draft visit session in progress
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            This visit is still open. Launch more report templates below or finish the visit once all linked reports are complete.
                          </div>
                          {outstandingLinkedReports.length > 0 ? (
                            <div className="mt-2 text-xs font-medium text-[#4b3a78]">
                              {outstandingLinkedReports.length} linked report{outstandingLinkedReports.length === 1 ? '' : 's'} still need to be marked final before this visit can be closed.
                            </div>
                          ) : null}
                          <div className="mt-3 text-xs leading-relaxed text-slate-600">
                            1. Start or continue each report needed for this visit.
                            <br />
                            2. Mark each linked report as Final when it is finished.
                            <br />
                            3. Use Complete Visit once every linked report shows Final.
                          </div>
                        </div>
                        <span className="rounded-full border border-[#dcd6ef] bg-white px-3 py-1 text-xs font-semibold text-[#4b3a78]">
                          {row.activeDraftVisit?.linkedReports.length || 0} linked report{row.activeDraftVisit?.linkedReports.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                    <Label htmlFor="visit-notes">
                      {visitType === 'action_led' ? 'Actions agreed / completed' : 'Visit notes'}
                    </Label>
                    <Textarea
                      id="visit-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder={
                        visitType === 'action_led'
                          ? 'List the actions agreed or completed on site. Keep it short and actionable (one per line is ideal).'
                          : 'Add overall visit context, outcomes, escalation points, or anything else the officer found on site.'
                      }
                      className="min-h-[160px]"
                    />
                  </div>

                  <label className="flex items-start gap-3 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                    <input
                      type="checkbox"
                      checked={followUpRequired}
                      onChange={(event) => setFollowUpRequired(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <div>
                      <div className="font-semibold text-slate-900">Follow-up visit required</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Use this when the officer has attended but the store still needs another return visit.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-50 px-6 py-6 md:border-l md:border-t-0 md:px-8">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Report Templates</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Start a structured report on the reports page and link it back to this visit session. If a draft already exists for a template, the card will reopen that draft instead of creating a duplicate.
                    </p>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {VISIT_REPORT_TEMPLATES.map((template) => {
                      const existingDraft = linkedReports.find(
                        (report) => report.reportType === template.value && report.status === 'draft'
                      )
                      const existingFinalCount = linkedReports.filter(
                        (report) => report.reportType === template.value && report.status === 'final'
                      ).length
                      const cardStateLabel = existingDraft
                        ? 'Draft started'
                        : existingFinalCount > 0
                          ? `${existingFinalCount} final saved`
                          : 'Not started'
                      const actionLabel = existingDraft ? 'Continue draft' : 'Start report'

                      return (
                        <button
                          key={template.value}
                          type="button"
                          onClick={() => handleStartReport(template.value)}
                          disabled={!canSave || isLaunchingReport || isCompletingVisit}
                          className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{template.label}</div>
                              <div className="mt-1 text-xs leading-relaxed text-slate-500">
                                {template.description}
                              </div>
                            </div>
                            <ExternalLink className="h-4 w-4 text-slate-400" />
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <span
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                                existingDraft
                                  ? 'border-[#dcd6ef] bg-[#f6f2fe] text-[#4b3a78]'
                                  : existingFinalCount > 0
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-600'
                              )}
                            >
                              {cardStateLabel}
                            </span>
                            <span className="text-xs font-semibold text-[#232154]">{actionLabel}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {row.activeDraftVisit?.linkedReports.length ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-slate-900">Linked Reports</h4>
                          <p className="mt-1 text-sm text-slate-500">
                            Reports already attached to this open visit session.
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {row.activeDraftVisit.linkedReports.length}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {row.activeDraftVisit.linkedReports.map((report) => (
                          <div key={report.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="font-semibold text-slate-900">{report.title}</div>
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                                  <span>{getVisitReportTypeLabel(report.reportType)}</span>
                                  <span>{report.status === 'final' ? 'Final' : 'Draft'}</span>
                                  <span>{format(new Date(report.updatedAt), 'dd MMM yyyy HH:mm')}</span>
                                </div>
                                {report.summary ? (
                                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{report.summary}</p>
                                ) : null}
                              </div>
                              <Button asChild size="sm" variant="outline" className="border-slate-200 bg-white">
                                <Link
                                  href={
                                    report.status === 'final'
                                      ? `/api/reports/visit-reports/${report.id}/pdf?mode=view`
                                      : `/reports?sheet=1&reportId=${report.id}`
                                  }
                                  target={report.status === 'final' ? '_blank' : undefined}
                                >
                                  {report.status === 'final' ? 'View PDF' : 'Continue draft'}
                                </Link>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-500">
                      No structured reports linked yet. Start a report template above, or use the note-only save below for a lightweight visit log.
                    </div>
                  )}

                  {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-6 py-4 md:px-8">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="text-sm text-slate-500">
                  Logging as {currentUserName || 'current user'}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
                    Cancel
                  </Button>
                  {visitSessionId ? (
                    <Button
                      onClick={handleCompleteVisit}
                      disabled={
                        !canSave ||
                        isCompletingVisit ||
                        isLaunchingReport ||
                        outstandingLinkedReports.length > 0
                      }
                      variant="outline"
                      className="min-h-[44px] border-[#232154] text-[#232154] hover:bg-[#f5f1fb]"
                    >
                      {isCompletingVisit ? 'Completing...' : 'Complete Visit'}
                    </Button>
                  ) : null}
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSave || isSaving || isLaunchingReport || isCompletingVisit}
                    className="min-h-[44px] bg-[#232154] text-white hover:bg-[#1c0259]"
                  >
                    {isSaving ? 'Saving...' : 'Log Note-Only Visit'}
                  </Button>
                </div>
                {visitSessionId && outstandingLinkedReports.length > 0 ? (
                  <div className="text-xs text-slate-500">
                    Complete Visit unlocks once every linked report above has been marked Final.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 md:top-10 md:max-h-[calc(100vh-5rem)] md:w-[min(960px,calc(100vw-3rem))] md:max-w-none md:rounded-[2rem] md:p-0">
          <div className="flex min-h-0 flex-col bg-white">
            <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 md:px-8">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
                <Clock className="h-5 w-5 text-slate-500" />
                Recent Visit History
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-slate-600">
                Review the most recent LP visit logs for {formatStoreName(row.storeName)} without leaving the visit form.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto px-6 py-6 md:px-8">
              <VisitHistoryList row={row} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
