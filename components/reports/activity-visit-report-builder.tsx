'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { Check, Plus, Search } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import type { StoreVisitProductCatalogItem } from '@/lib/store-visit-product-catalog'
import {
  buildStoreVisitCountedItemVarianceNote,
  formatStoreVisitCurrency,
  getStoreVisitActivityFieldDefinitions,
  getStoreVisitActivityFieldSection,
  getStoreVisitActivityOption,
  getStoreVisitCountedItemDelta,
  getStoreVisitCountedItemVarianceValue,
  type StoreVisitActivityFieldDefinition,
  type StoreVisitActivityFieldSection,
  type StoreVisitActivityPayload,
  type StoreVisitAmountCheck,
  type StoreVisitCountedItem,
} from '@/lib/visit-needs'
import { cn } from '@/lib/utils'
import type { ActivityVisitReportPayload, ActivityVisitReportType } from '@/lib/reports/visit-report-types'

interface ActivityVisitReportBuilderProps {
  reportType: ActivityVisitReportType
  payload: ActivityVisitReportPayload
  currentStep: number
  disabled: boolean
  productCatalog: StoreVisitProductCatalogItem[]
  onChange: (updater: (payload: ActivityVisitReportPayload) => ActivityVisitReportPayload) => void
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  )
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

function updateObjectValue<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined
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

function FragranceProductField({
  activityKey,
  index,
  value,
  productCatalog,
  onSelect,
}: {
  activityKey: ActivityVisitReportType
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
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
          className="min-h-[44px] pl-11"
        />
      </div>

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

function renderStructuredFields(params: {
  fields: readonly StoreVisitActivityFieldDefinition[]
  payload: StoreVisitActivityPayload
  section: StoreVisitActivityFieldSection
  activityKey: ActivityVisitReportType
  disabled: boolean
  onFieldChange: (fieldKey: string, value: string) => void
}) {
  const scopedFields = params.fields.filter(
    (field) => getStoreVisitActivityFieldSection(params.activityKey, field) === params.section
  )

  if (scopedFields.length === 0) {
    return null
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {scopedFields.map((field) => {
        const fieldId = `${params.activityKey}-${field.key}`
        const value = params.payload.fields?.[field.key] || ''
        const isTextarea = field.input === 'textarea'

        return (
          <div key={field.key} className={cn('space-y-2', isTextarea ? 'xl:col-span-2' : '')}>
            <Label htmlFor={fieldId}>{field.label}</Label>
            {isTextarea ? (
              <Textarea
                id={fieldId}
                value={value}
                onChange={(event) => params.onFieldChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                className="min-h-[96px] bg-white"
                disabled={params.disabled}
              />
            ) : (
              <Input
                id={fieldId}
                value={value}
                onChange={(event) => params.onFieldChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                className="min-h-[44px] bg-white"
                disabled={params.disabled}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ActivityVisitReportBuilder({
  reportType,
  payload,
  currentStep,
  disabled,
  productCatalog,
  onChange,
}: ActivityVisitReportBuilderProps) {
  const option = getStoreVisitActivityOption(reportType)
  const formVariant = option?.formVariant || 'structured'
  const fieldDefinitions = getStoreVisitActivityFieldDefinitions(reportType)
  const activityPayload = payload.activityPayload || {}

  const updateActivityPayload = (
    updater: (current: StoreVisitActivityPayload) => StoreVisitActivityPayload | undefined
  ) => {
    onChange((current) => ({
      ...current,
      activityPayload: updater(current.activityPayload || {}) || {},
    }))
  }

  const updateStructuredField = (fieldKey: string, value: string) => {
    updateActivityPayload((current) => {
      const next: StoreVisitActivityPayload = { ...current }
      const fields = { ...(current.fields || {}) }
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

  const updateAmountConfirmed = (value: boolean | null) => {
    updateActivityPayload((current) => {
      const next: StoreVisitActivityPayload = { ...current }
      if (value === null) {
        delete next.amountConfirmed
      } else {
        next.amountConfirmed = value
      }
      return updateObjectValue(next)
    })
  }

  const addCountedItem = () => {
    updateActivityPayload((current) => ({
      ...current,
      itemsChecked: [...(current.itemsChecked || []), {}],
    }))
  }

  const updateCountedItem = (index: number, patch: Partial<StoreVisitCountedItem>) => {
    updateActivityPayload((current) => {
      const itemsChecked = [...(current.itemsChecked || [])]
      itemsChecked[index] = syncCountedItemNotes({
        ...(itemsChecked[index] || {}),
        ...patch,
      })
      return {
        ...current,
        itemsChecked,
      }
    })
  }

  const removeCountedItem = (index: number) => {
    updateActivityPayload((current) => {
      const itemsChecked = (current.itemsChecked || []).filter((_, itemIndex) => itemIndex !== index)
      const next: StoreVisitActivityPayload = { ...current }
      if (itemsChecked.length > 0) {
        next.itemsChecked = itemsChecked
      } else {
        delete next.itemsChecked
      }
      return updateObjectValue(next)
    })
  }

  const addAmountCheck = () => {
    updateActivityPayload((current) => ({
      ...current,
      amountChecks: [...(current.amountChecks || []), {}],
    }))
  }

  const updateAmountCheck = (index: number, patch: Partial<StoreVisitAmountCheck>) => {
    updateActivityPayload((current) => {
      const amountChecks = [...(current.amountChecks || [])]
      amountChecks[index] = {
        ...(amountChecks[index] || {}),
        ...patch,
      }
      return {
        ...current,
        amountChecks,
      }
    })
  }

  const removeAmountCheck = (index: number) => {
    updateActivityPayload((current) => {
      const amountChecks = (current.amountChecks || []).filter((_, itemIndex) => itemIndex !== index)
      const next: StoreVisitActivityPayload = { ...current }
      if (amountChecks.length > 0) {
        next.amountChecks = amountChecks
      } else {
        delete next.amountChecks
      }
      return updateObjectValue(next)
    })
  }

  if (currentStep === 1) {
    return (
      <SectionCard
        title="What Was Checked"
        description={`Capture the structured details for ${option?.label || 'this report'} using the same LP workflow as the visit tracker.`}
      >
        <fieldset disabled={disabled} className="space-y-5">
          {renderStructuredFields({
            fields: fieldDefinitions,
            payload: activityPayload,
            section: 'what_checked',
            activityKey: reportType,
            disabled,
            onFieldChange: updateStructuredField,
          })}

          {formVariant === 'line-check' ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Items checked</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Add each fragrance checked in store, the quantity in the system, and the quantity counted.
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={addCountedItem} className="min-h-[40px]">
                  <Plus className="mr-2 h-4 w-4" />
                  Add fragrance
                </Button>
              </div>

              <div className="space-y-3">
                {(activityPayload.itemsChecked || []).map((item, index) => {
                  const varianceDelta = getStoreVisitCountedItemDelta(item)
                  const varianceValue = getStoreVisitCountedItemVarianceValue(item)
                  return (
                    <div key={`${reportType}-item-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2.4fr)_140px_110px_110px]">
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label>Fragrance</Label>
                            <FragranceProductField
                              activityKey={reportType}
                              index={index}
                              value={String(item.productLabel || '')}
                              productCatalog={productCatalog}
                              onSelect={(patch) => updateCountedItem(index, patch)}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`${reportType}-variant-${index}`}>Variant</Label>
                            <Input
                              id={`${reportType}-variant-${index}`}
                              value={item.variantLabel || ''}
                              onChange={(event) =>
                                updateCountedItem(index, { variantLabel: event.target.value })
                              }
                              className="min-h-[44px]"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`${reportType}-size-${index}`}>Size</Label>
                          <Input
                            id={`${reportType}-size-${index}`}
                            value={item.sizeLabel || ''}
                            onChange={(event) =>
                              updateCountedItem(index, { sizeLabel: event.target.value })
                            }
                            className="min-h-[44px]"
                          />
                          {typeof item.unitPrice === 'number' ? (
                            <div className="text-xs font-medium text-slate-500">
                              Website price: {formatStoreVisitCurrency(item.unitPrice)}
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`${reportType}-system-${index}`}>In system</Label>
                          <Input
                            id={`${reportType}-system-${index}`}
                            type="number"
                            inputMode="numeric"
                            value={formatNullableNumber(item.systemQuantity)}
                            onChange={(event) =>
                              updateCountedItem(index, {
                                systemQuantity: parseIntegerInput(event.target.value),
                              })
                            }
                            className="min-h-[44px]"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`${reportType}-counted-${index}`}>Counted</Label>
                          <Input
                            id={`${reportType}-counted-${index}`}
                            type="number"
                            inputMode="numeric"
                            value={formatNullableNumber(item.countedQuantity)}
                            onChange={(event) =>
                              updateCountedItem(index, {
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
                          <Label htmlFor={`${reportType}-item-notes-${index}`}>Notes</Label>
                          <Textarea
                            id={`${reportType}-item-notes-${index}`}
                            value={item.notes || ''}
                            onChange={(event) =>
                              updateCountedItem(index, { notes: event.target.value })
                            }
                            className="min-h-[88px]"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeCountedItem(index)}
                          className="min-h-[44px] border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {formVariant === 'cash-check' ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="space-y-2">
                <Label>Correct amount present?</Label>
                <BooleanChoice
                  value={activityPayload.amountConfirmed}
                  onChange={updateAmountConfirmed}
                  trueLabel="Correct amount present"
                  falseLabel="Discrepancy found"
                  idPrefix={`${reportType}-amount-confirmed`}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Amount checks</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Add each till, banking bag, or cash item reviewed during the visit.
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={addAmountCheck} className="min-h-[40px]">
                  <Plus className="mr-2 h-4 w-4" />
                  Add row
                </Button>
              </div>

              <div className="space-y-3">
                {(activityPayload.amountChecks || []).map((item, index) => (
                  <div key={`${reportType}-amount-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_120px_120px_170px]">
                      <div className="space-y-2">
                        <Label htmlFor={`${reportType}-amount-label-${index}`}>Label</Label>
                        <Input
                          id={`${reportType}-amount-label-${index}`}
                          value={item.label || ''}
                          onChange={(event) =>
                            updateAmountCheck(index, { label: event.target.value })
                          }
                          className="min-h-[44px]"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`${reportType}-system-amount-${index}`}>In system</Label>
                        <Input
                          id={`${reportType}-system-amount-${index}`}
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={formatNullableAmount(item.systemAmount)}
                          onChange={(event) =>
                            updateAmountCheck(index, {
                              systemAmount: parseAmountInput(event.target.value),
                            })
                          }
                          className="min-h-[44px]"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`${reportType}-counted-amount-${index}`}>Counted</Label>
                        <Input
                          id={`${reportType}-counted-amount-${index}`}
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={formatNullableAmount(item.countedAmount)}
                          onChange={(event) =>
                            updateAmountCheck(index, {
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
                            updateAmountCheck(index, {
                              amountMatches: value === 'unset' ? null : value === 'matched',
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
                        <Label htmlFor={`${reportType}-amount-notes-${index}`}>Notes</Label>
                        <Input
                          id={`${reportType}-amount-notes-${index}`}
                          value={item.notes || ''}
                          onChange={(event) =>
                            updateAmountCheck(index, { notes: event.target.value })
                          }
                          className="min-h-[44px]"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeAmountCheck(index)}
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
        </fieldset>
      </SectionCard>
    )
  }

  if (currentStep === 2) {
    return (
      <SectionCard
        title="Findings / Variance"
        description="Capture the main gaps, variances, or issues identified during the visit."
      >
        <fieldset disabled={disabled} className="space-y-5">
          {renderStructuredFields({
            fields: fieldDefinitions,
            payload: activityPayload,
            section: 'findings',
            activityKey: reportType,
            disabled,
            onFieldChange: updateStructuredField,
          })}
          <div className="space-y-2">
            <Label htmlFor={`${reportType}-findings`}>Summary of findings</Label>
            <Textarea
              id={`${reportType}-findings`}
              value={payload.findings}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  findings: event.target.value,
                }))
              }
              placeholder="Summarise the key variance, weakness, compliance gap, or issue found."
              className="min-h-[140px]"
            />
          </div>
        </fieldset>
      </SectionCard>
    )
  }

  if (currentStep === 3) {
    return (
      <SectionCard
        title="Action Taken / Escalation"
        description="Record what was corrected on site, what still needs follow-up, and any escalation."
      >
        <fieldset disabled={disabled} className="space-y-5">
          {renderStructuredFields({
            fields: fieldDefinitions,
            payload: activityPayload,
            section: 'actions',
            activityKey: reportType,
            disabled,
            onFieldChange: updateStructuredField,
          })}
          <div className="space-y-2">
            <Label htmlFor={`${reportType}-actions-taken`}>Actions / escalation</Label>
            <Textarea
              id={`${reportType}-actions-taken`}
              value={payload.actionsTaken}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  actionsTaken: event.target.value,
                }))
              }
              placeholder="What was actioned immediately, what remains outstanding, and who it was escalated to."
              className="min-h-[140px]"
            />
          </div>
        </fieldset>
      </SectionCard>
    )
  }

  if (currentStep === 4) {
    return (
      <SectionCard
        title="Sign-Off"
        description="Capture who completed the visit and who received the handover in store."
      >
        <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${reportType}-signoff-visited-by`}>Visited by</Label>
            <Input
              id={`${reportType}-signoff-visited-by`}
              value={payload.signOff.visitedBy}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  signOff: {
                    ...current.signOff,
                    visitedBy: event.target.value,
                  },
                }))
              }
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${reportType}-signoff-store-rep`}>Store representative</Label>
            <Input
              id={`${reportType}-signoff-store-rep`}
              value={payload.signOff.storeRepresentative}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  signOff: {
                    ...current.signOff,
                    storeRepresentative: event.target.value,
                  },
                }))
              }
              className="min-h-[44px]"
            />
          </div>
        </fieldset>
      </SectionCard>
    )
  }

  return null
}
