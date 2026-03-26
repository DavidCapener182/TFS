import { describe, expect, it } from 'vitest'
import {
  buildStoreVisitCountedItemVarianceNote,
  buildStoreVisitActivityDetailText,
  computeStoreVisitNeed,
  normalizeStoreVisitActivityPayloads,
} from '@/lib/visit-needs'

describe('computeStoreVisitNeed', () => {
  it('flags a store when theft and banking actions are open', () => {
    const result = computeStoreVisitNeed({
      now: '2026-03-25T10:00:00Z',
      actions: [
        {
          title: 'High theft trend in cosmetics bay',
          priority: 'high',
          status: 'open',
          dueDate: '2026-03-20',
        },
        {
          title: 'Banking discrepancy to investigate',
          priority: 'urgent',
          status: 'open',
          dueDate: '2026-03-22',
        },
      ],
      incidents: [],
    })

    expect(result.needsVisit).toBe(true)
    expect(result.level).toMatch(/needed|urgent/)
    expect(result.score).toBeGreaterThanOrEqual(40)
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'High theft or shrink concern is open',
        'Banking discrepancy or cash control issue is open',
      ])
    )
  })

  it('reduces the score when the store was visited recently and another visit is already planned', () => {
    const result = computeStoreVisitNeed({
      now: '2026-03-25T10:00:00Z',
      lastVisitAt: '2026-03-22T15:30:00Z',
      nextPlannedVisitDate: '2026-03-29',
      actions: [
        {
          title: 'Till check follow-up',
          priority: 'medium',
          status: 'open',
          dueDate: '2026-03-28',
        },
      ],
      incidents: [],
    })

    expect(result.score).toBeLessThan(40)
    expect(result.level).toBe('none')
    expect(result.drivers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Store was visited in the last 7 days', points: -20 }),
        expect.objectContaining({ label: 'A visit is already planned within 7 days', points: -14 }),
      ])
    )
  })

  it('stays clear when there are no active visit drivers', () => {
    const result = computeStoreVisitNeed({
      now: '2026-03-25T10:00:00Z',
      actions: [
        {
          title: 'Completed till review',
          priority: 'low',
          status: 'complete',
        },
      ],
      incidents: [
        {
          summary: 'Closed security issue',
          category: 'security',
          severity: 'low',
          status: 'closed',
        },
      ],
    })

    expect(result.score).toBe(0)
    expect(result.level).toBe('none')
    expect(result.needsVisit).toBe(false)
    expect(result.reasons).toEqual([])
  })
})

describe('store visit activity payloads', () => {
  it('normalizes structured line-check and banking payloads', () => {
    const payloads = normalizeStoreVisitActivityPayloads(
      {
        completed_line_checks: {
          itemsChecked: [
            {
              productLabel: 'Dior Sauvage Eau De Toilette',
              variantLabel: 'Eau De Toilette',
              sizeLabel: '60ml',
              unitPrice: '88',
              systemQuantity: '4',
              countedQuantity: '3',
              notes: 'One missing from display.',
            },
          ],
        },
        checked_banking: {
          fields: {
            bankingItemsChecked: 'Checked bag 4 and main safe deposit.',
            discrepancyAction: 'Bag 4 was short and escalated to the store manager.',
          },
          amountConfirmed: 'false',
          amountChecks: [
            {
              label: 'Banking bag',
              systemAmount: '250.40',
              countedAmount: '240.40',
              amountMatches: 'false',
            },
          ],
        },
      },
      ['completed_line_checks', 'checked_banking']
    )

    expect(payloads.completed_line_checks?.itemsChecked).toEqual([
      expect.objectContaining({
        productLabel: 'Dior Sauvage Eau De Toilette',
        variantLabel: 'Eau De Toilette',
        sizeLabel: '60ml',
        unitPrice: 88,
        systemQuantity: 4,
        countedQuantity: 3,
      }),
    ])

    expect(payloads.checked_banking?.fields).toEqual(
      expect.objectContaining({
        bankingItemsChecked: 'Checked bag 4 and main safe deposit.',
        discrepancyAction: 'Bag 4 was short and escalated to the store manager.',
      })
    )
    expect(payloads.checked_banking?.amountConfirmed).toBe(false)
    expect(payloads.checked_banking?.amountChecks).toEqual([
      expect.objectContaining({
        label: 'Banking bag',
        systemAmount: 250.4,
        countedAmount: 240.4,
        amountMatches: false,
      }),
    ])
  })

  it('maps legacy generic fields into the new task-specific activity fields', () => {
    const payloads = normalizeStoreVisitActivityPayloads(
      {
        supported_investigation: {
          summary: 'Refund abuse allegation reviewed.',
          findings: 'Checked CCTV and refund log.',
          actionsTaken: 'Escalated to regional manager.',
          reference: 'INV-204',
        },
      },
      ['supported_investigation']
    )

    expect(payloads.supported_investigation?.fields).toEqual(
      expect.objectContaining({
        investigationFocus: 'Refund abuse allegation reviewed.',
        evidenceReviewed: 'Checked CCTV and refund log.',
        workCompleted: 'Escalated to regional manager.',
        caseReference: 'INV-204',
      })
    )
  })

  it('builds a compact history detail from structured payloads', () => {
    const detail = buildStoreVisitActivityDetailText('completed_line_checks', '', {
      itemsChecked: [
        {
          productLabel: 'Dior Sauvage Eau De Toilette',
          unitPrice: 88,
          systemQuantity: 4,
          countedQuantity: 3,
        },
        {
          productLabel: 'YSL Libre Eau De Parfum',
          systemQuantity: 2,
          countedQuantity: 2,
        },
      ],
    })

    expect(detail).toContain('2 item checks recorded')
    expect(detail).toContain('1 variance found')
    expect(detail).toContain('variance value £88.00')
  })

  it('builds an automatic variance note for missing line-check items', () => {
    expect(
      buildStoreVisitCountedItemVarianceNote({
        productLabel: 'CHANEL Bleu de Chanel',
        unitPrice: 215,
        systemQuantity: 20,
        countedQuantity: 18,
      })
    ).toBe('Variance: 2 missing totalling £430.00 at £215.00 each.')
  })

  it('builds a compact detail from task-specific structured fields', () => {
    const detail = buildStoreVisitActivityDetailText('supported_investigation', '', {
      fields: {
        investigationFocus: 'Refund abuse allegation reviewed.',
        workCompleted: 'Interviewed manager and checked the refund log.',
        caseReference: 'INV-204',
      },
    })

    expect(detail).toContain('Refund abuse allegation reviewed.')
    expect(detail).toContain('Interviewed manager and checked the refund log.')
  })
})
