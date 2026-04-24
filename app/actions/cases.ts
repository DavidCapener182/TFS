'use server'

import { revalidatePath } from 'next/cache'
import {
  advanceCase as advanceCaseService,
  closeCase as closeCaseService,
  completeVisitOutcome as completeVisitOutcomeService,
  importLegacyCases as importLegacyCasesService,
  planVisit as planVisitService,
  refreshLinkedCasesForRecord,
  reviewCase as reviewCaseService,
} from '@/lib/cases/service'

function revalidateCasePaths(storeId: string | null | undefined) {
  revalidatePath('/queue')
  revalidatePath('/dashboard')
  revalidatePath('/stores')
  revalidatePath('/visit-tracker')
  if (storeId) {
    revalidatePath(`/stores/${storeId}`)
  }
}

export async function importLegacyCasesAction() {
  const result = await importLegacyCasesService()
  revalidateCasePaths(undefined)
  return result
}

export async function reviewCaseAction(input: Parameters<typeof reviewCaseService>[0]) {
  const result = await reviewCaseService(input)
  revalidateCasePaths(result.store_id)
  return result
}

export async function advanceCaseAction(input: Parameters<typeof advanceCaseService>[0]) {
  const result = await advanceCaseService(input)
  revalidateCasePaths(result.store_id)
  return result
}

export async function planVisitAction(input: Parameters<typeof planVisitService>[0]) {
  const result = await planVisitService(input)
  revalidateCasePaths(result.store_id)
  return result
}

export async function completeVisitOutcomeAction(input: Parameters<typeof completeVisitOutcomeService>[0]) {
  const result = await completeVisitOutcomeService(input)
  revalidateCasePaths(result.store_id)
  return result
}

export async function closeCaseAction(input: Parameters<typeof closeCaseService>[0]) {
  const result = await closeCaseService(input)
  revalidateCasePaths(result.store_id)
  return result
}

export async function refreshLinkedCasesForRecordAction(targetTable: string, targetId: string, summary?: string) {
  await refreshLinkedCasesForRecord(targetTable, targetId, summary)
  revalidateCasePaths(undefined)
}
