import { describe, expect, it } from 'vitest'

import {
  buildContinueWorkResolution,
  deriveCaseStageFromIncident,
  deriveCaseStageFromStoreAction,
  groupQueueCases,
  sortQueueCases,
  type QueueCaseRecord,
} from '@/lib/cases/workflow'

function buildCase(overrides: Partial<QueueCaseRecord> = {}): QueueCaseRecord {
  return {
    id: overrides.id || 'case-1',
    storeId: overrides.storeId || 'store-1',
    storeName: overrides.storeName || 'Huddersfield',
    storeCode: overrides.storeCode || '11',
    caseType: overrides.caseType || 'portal_theft',
    intakeSource: overrides.intakeSource || 'store_portal',
    originReference: overrides.originReference || '11-Huddersfield-20260422-001',
    severity: overrides.severity || 'medium',
    ownerUserId: overrides.ownerUserId || null,
    ownerName: overrides.ownerName || null,
    dueAt: overrides.dueAt || null,
    stage: overrides.stage || 'new_submission',
    nextActionCode: overrides.nextActionCode || 'review_submission',
    nextActionLabel: overrides.nextActionLabel || 'Review portal submission',
    lastUpdateSummary: overrides.lastUpdateSummary || 'Store portal theft logged.',
    reviewOutcome: overrides.reviewOutcome || null,
    closureOutcome: overrides.closureOutcome || null,
    closedAt: overrides.closedAt || null,
    openBlockerCount: overrides.openBlockerCount ?? 0,
    createdAt: overrides.createdAt || '2026-04-22T08:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-04-22T08:00:00.000Z',
  }
}

describe('case workflow helpers', () => {
  it('prioritises new critical submissions ahead of lower-priority work', () => {
    const ordered = sortQueueCases([
      buildCase({
        id: 'ready-close',
        stage: 'ready_to_close',
        severity: 'low',
      }),
      buildCase({
        id: 'visit-case',
        stage: 'visit_required',
        severity: 'high',
      }),
      buildCase({
        id: 'new-critical',
        stage: 'new_submission',
        severity: 'critical',
      }),
    ])

    expect(ordered.map((record) => record.id)).toEqual([
      'new-critical',
      'visit-case',
      'ready-close',
    ])
  })

  it('resolves review-stage work back to the queue drawer', () => {
    const resolution = buildContinueWorkResolution(
      buildCase({
        id: 'review-case',
        stage: 'under_review',
      })
    )

    expect(resolution).toMatchObject({
      caseId: 'review-case',
      mode: 'review',
      href: '/queue?case=review-case&review=1',
      label: 'Continue review',
    })
  })

  it('routes visit-required work into the visit tracker with the case context selected', () => {
    const resolution = buildContinueWorkResolution(
      buildCase({
        id: 'visit-case',
        storeId: 'store-17',
        stage: 'visit_required',
      })
    )

    expect(resolution).toMatchObject({
      caseId: 'visit-case',
      mode: 'visit',
      href: '/visit-tracker?storeId=store-17&caseId=visit-case',
      label: 'Continue visit',
    })
  })

  it('groups queue cases by stage in the published section order', () => {
    const grouped = groupQueueCases([
      buildCase({ id: 'closed', stage: 'closed' }),
      buildCase({ id: 'new', stage: 'new_submission' }),
      buildCase({ id: 'visit', stage: 'visit_required' }),
    ])

    expect(grouped.get('new_submission')?.map((record) => record.id)).toEqual(['new'])
    expect(grouped.get('visit_required')?.map((record) => record.id)).toEqual(['visit'])
    expect(grouped.get('closed')?.map((record) => record.id)).toEqual(['closed'])
  })

  it('maps store portal incidents into new submissions and active store actions into follow-up stages', () => {
    expect(
      deriveCaseStageFromIncident({
        status: 'open',
        intakeSource: 'store_portal',
      })
    ).toBe('new_submission')

    expect(
      deriveCaseStageFromStoreAction({
        status: 'open',
        dueAt: '2000-01-01T00:00:00.000Z',
      })
    ).toBe('awaiting_follow_up')
  })
})
