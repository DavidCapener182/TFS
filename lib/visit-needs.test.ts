import { describe, expect, it } from 'vitest'
import {
  STORE_VISIT_ACTIVITY_OPTIONS,
  buildStoreVisitCountedItemVarianceNote,
  buildStoreVisitActivityDetailText,
  computeStoreVisitNeed,
  getStoreVisitActivityAmountChecksGuide,
  getStoreVisitActivityCountedItemsGuide,
  getStoreVisitActivityFieldDefinitions,
  getStoreVisitActivityFieldSection,
  getStoreVisitActivitySectionGuide,
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
  it('provides section guides and field scripts for every activity template', () => {
    for (const option of STORE_VISIT_ACTIVITY_OPTIONS) {
      const fields = getStoreVisitActivityFieldDefinitions(option.key)
      const sections = new Set(
        fields.map((field) => getStoreVisitActivityFieldSection(option.key, field))
      )

      expect(fields.length).toBeGreaterThan(0)

      for (const field of fields) {
        expect(field.scriptLines?.length || 0).toBeGreaterThan(0)
        expect(field.captureHint?.trim()).toBeTruthy()
      }

      for (const section of sections) {
        expect(getStoreVisitActivitySectionGuide(option.key, section)).toBeDefined()
      }

      if (option.formVariant === 'line-check' || option.formVariant === 'internal-theft') {
        expect(getStoreVisitActivityCountedItemsGuide(option.key)).toBeDefined()
      }

      if (option.formVariant === 'cash-check' || option.formVariant === 'internal-theft') {
        expect(getStoreVisitActivityAmountChecksGuide(option.key)).toBeDefined()
      }
    }
  })

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

  it('normalizes internal theft interview payloads with both cash and stock evidence', () => {
    const payloads = normalizeStoreVisitActivityPayloads(
      {
        internal_theft_interview: {
          fields: {
            interviewSubject: 'Store manager',
            allegationSummary: 'Suspected stock and cash theft linked to till access and fragrance variances.',
            interviewAccountSummary: 'Denied taking stock but accepted weak till handovers.',
          },
          amountConfirmed: 'false',
          amountChecks: [
            {
              label: 'Till 2 cash-up',
              systemAmount: '420.10',
              countedAmount: '370.10',
              amountMatches: 'false',
            },
          ],
          itemsChecked: [
            {
              productLabel: 'Tom Ford Black Orchid',
              unitPrice: '112',
              systemQuantity: '3',
              countedQuantity: '2',
            },
          ],
        },
      },
      ['internal_theft_interview']
    )

    expect(payloads.internal_theft_interview?.amountConfirmed).toBe(false)
    expect(payloads.internal_theft_interview?.amountChecks).toEqual([
      expect.objectContaining({
        label: 'Till 2 cash-up',
        systemAmount: 420.1,
        countedAmount: 370.1,
        amountMatches: false,
      }),
    ])
    expect(payloads.internal_theft_interview?.itemsChecked).toEqual([
      expect.objectContaining({
        productLabel: 'Tom Ford Black Orchid',
        unitPrice: 112,
        systemQuantity: 3,
        countedQuantity: 2,
      }),
    ])
  })

  it('builds a compact detail for internal theft interviews', () => {
    const detail = buildStoreVisitActivityDetailText('internal_theft_interview', '', {
      fields: {
        interviewSubject: 'Assistant manager',
        allegationSummary: 'Suspected fragrance theft and till shortage across two shifts.',
        interviewAccountSummary: 'Admitted poor stock control but denied taking cash.',
      },
      amountConfirmed: false,
      amountChecks: [
        {
          label: 'Safe count',
          amountMatches: false,
        },
      ],
      itemsChecked: [
        {
          productLabel: 'YSL Libre',
          unitPrice: 98,
          systemQuantity: 4,
          countedQuantity: 3,
        },
      ],
    })

    expect(detail).toContain('Assistant manager')
    expect(detail).toContain('Suspected fragrance theft and till shortage across two shifts.')
    expect(detail).toContain('1 item check recorded, 1 variance found')
    expect(detail).toContain('1 cash check recorded, 1 mismatch found')
    expect(detail).toContain('Amount discrepancy found')
  })

  it('normalizes CCTV-confirmed internal theft payloads with both cash and stock evidence', () => {
    const payloads = normalizeStoreVisitActivityPayloads(
      {
        internal_theft_cctv_confirmed: {
          fields: {
            subjectIdentified: 'Sales advisor',
            cctvSummary: 'CCTV shows the subject concealing two fragrance units before leaving the stockroom.',
            theftMethodObserved: 'Concealed stock inside a personal bag while off the shop floor.',
            supportingEvidence: 'Stock count and rota timing aligned with the footage.',
          },
          amountConfirmed: 'false',
          amountChecks: [
            {
              label: 'Till 1 refund movement',
              systemAmount: '95.00',
              countedAmount: '0',
              amountMatches: 'false',
            },
          ],
          itemsChecked: [
            {
              productLabel: 'Dior Sauvage',
              unitPrice: '109',
              systemQuantity: '4',
              countedQuantity: '2',
            },
          ],
        },
      },
      ['internal_theft_cctv_confirmed']
    )

    expect(payloads.internal_theft_cctv_confirmed?.amountConfirmed).toBe(false)
    expect(payloads.internal_theft_cctv_confirmed?.amountChecks).toEqual([
      expect.objectContaining({
        label: 'Till 1 refund movement',
        systemAmount: 95,
        countedAmount: 0,
        amountMatches: false,
      }),
    ])
    expect(payloads.internal_theft_cctv_confirmed?.itemsChecked).toEqual([
      expect.objectContaining({
        productLabel: 'Dior Sauvage',
        unitPrice: 109,
        systemQuantity: 4,
        countedQuantity: 2,
      }),
    ])
  })

  it('builds a compact detail for CCTV-confirmed internal theft reports', () => {
    const detail = buildStoreVisitActivityDetailText('internal_theft_cctv_confirmed', '', {
      fields: {
        subjectIdentified: 'Assistant manager',
        cctvSummary: 'CCTV shows the subject removing fragrance stock from the stockroom and concealing it before exit.',
        theftMethodObserved: 'Concealed stock in a personal bag during close-down.',
      },
      amountConfirmed: false,
      amountChecks: [
        {
          label: 'Safe bag review',
          amountMatches: false,
        },
      ],
      itemsChecked: [
        {
          productLabel: 'Paco Rabanne 1 Million',
          unitPrice: 86,
          systemQuantity: 3,
          countedQuantity: 1,
        },
      ],
    })

    expect(detail).toContain('Assistant manager')
    expect(detail).toContain('CCTV shows the subject removing fragrance stock from the stockroom and concealing it before exit.')
    expect(detail).toContain('1 item check recorded, 1 variance found')
    expect(detail).toContain('1 cash check recorded, 1 mismatch found')
    expect(detail).toContain('Amount discrepancy found')
  })
})
