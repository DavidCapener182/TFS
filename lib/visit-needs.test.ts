import { describe, expect, it } from 'vitest'
import { computeStoreVisitNeed } from '@/lib/visit-needs'

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
