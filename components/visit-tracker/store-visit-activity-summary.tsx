'use client'

import { FileText, ShieldCheck } from 'lucide-react'

import type { StoreVisitEvidenceFile } from '@/components/visit-tracker/types'
import {
  formatStoreVisitCurrency,
  getStoreVisitCountedItemDelta,
  getStoreVisitCountedItemVarianceValue,
  getStoreVisitActivityOption,
  getStoreVisitActivityLabel,
  type StoreVisitActivityKey,
  type StoreVisitActivityPayload,
} from '@/lib/visit-needs'

function formatQuantity(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return String(value)
}

function renderBooleanLabel(value: boolean | null | undefined, trueLabel: string, falseLabel: string): string | null {
  if (value === true) return trueLabel
  if (value === false) return falseLabel
  return null
}

interface StoreVisitActivitySummaryProps {
  activityKey: StoreVisitActivityKey
  detailText?: string | null
  payload?: StoreVisitActivityPayload | null
  evidenceFiles?: StoreVisitEvidenceFile[]
}

export function StoreVisitActivitySummary({
  activityKey,
  detailText,
  payload,
  evidenceFiles = [],
}: StoreVisitActivitySummaryProps) {
  const activityOption = getStoreVisitActivityOption(activityKey)
  const amountConfirmedLabel = renderBooleanLabel(
    payload?.amountConfirmed,
    'Correct amount confirmed',
    'Amount discrepancy found'
  )

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
        <ShieldCheck className="h-3 w-3" />
        {getStoreVisitActivityLabel(activityKey)}
      </div>

      {detailText ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{detailText}</p> : null}

      {payload?.itemsChecked?.length ? (
        <div className="mt-3 space-y-2 rounded-lg border border-emerald-100 bg-white/80 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Items Checked</div>
          {payload.itemsChecked.map((item, index) => {
            const delta = getStoreVisitCountedItemDelta(item)
            const varianceValue = getStoreVisitCountedItemVarianceValue(item)

            return (
              <div key={`${item.productId || item.productLabel || 'item'}-${index}`} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                <div className="text-sm font-semibold text-slate-900">
                  {item.productLabel || 'Unnamed item'}
                  {item.variantLabel ? ` • ${item.variantLabel}` : ''}
                  {item.sizeLabel ? ` • ${item.sizeLabel}` : ''}
                </div>
                <div className="mt-1 grid gap-2 text-xs text-slate-600 sm:grid-cols-3 lg:grid-cols-5">
                  <div>System: {formatQuantity(item.systemQuantity)}</div>
                  <div>Counted: {formatQuantity(item.countedQuantity)}</div>
                  <div>
                    Delta:{' '}
                    {delta === null ? '—' : delta > 0 ? `+${delta}` : String(delta)}
                  </div>
                  <div>Price: {formatStoreVisitCurrency(item.unitPrice)}</div>
                  <div>Value: {formatStoreVisitCurrency(varianceValue)}</div>
                </div>
                {item.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{item.notes}</p> : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {payload?.amountChecks?.length ? (
        <div className="mt-3 space-y-2 rounded-lg border border-emerald-100 bg-white/80 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Amount Checks</div>
          {payload.amountChecks.map((item, index) => (
            <div key={`${item.label || 'amount'}-${index}`} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
              <div className="text-sm font-semibold text-slate-900">{item.label || 'Check item'}</div>
              <div className="mt-1 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                <div>System: {formatStoreVisitCurrency(item.systemAmount)}</div>
                <div>Counted: {formatStoreVisitCurrency(item.countedAmount)}</div>
                <div>
                  Status:{' '}
                  {item.amountMatches === null
                    ? '—'
                    : item.amountMatches
                      ? 'Matched'
                      : 'Mismatch'}
                </div>
              </div>
              {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {payload ? (
        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
          {activityOption?.fields?.map((field) => {
            const value = payload.fields?.[field.key]
            if (!value) return null

            return (
              <div key={field.key} className="rounded-lg bg-white/75 px-3 py-2">
                <span className="font-semibold text-slate-700">{field.label}:</span> {value}
              </div>
            )
          })}
          {amountConfirmedLabel ? <div className="rounded-lg bg-white/75 px-3 py-2"><span className="font-semibold text-slate-700">Amount check:</span> {amountConfirmedLabel}</div> : null}
        </div>
      ) : null}

      {evidenceFiles.length > 0 ? (
        <div className="mt-3 space-y-2 rounded-lg border border-emerald-100 bg-white/80 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Evidence</div>
          <div className="space-y-2">
            {evidenceFiles.map((file) => (
              file.downloadUrl ? (
                <a
                  key={file.id}
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  <span className="truncate">{file.fileName}</span>
                </a>
              ) : (
                <div
                  key={file.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500"
                >
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate">{file.fileName}</span>
                </div>
              )
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
