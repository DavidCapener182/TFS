import { describe, expect, it } from 'vitest'
import { getStoreRegionGroup } from '@/lib/store-region-groups'

describe('getStoreRegionGroup', () => {
  it('maps the requested town overrides to the expected groups', () => {
    expect(getStoreRegionGroup('Derbyshire', 'Chesterfield', 'Chesterfield', 'S40 1PA')).toBe('Yorkshire')
    expect(getStoreRegionGroup('Newcastle under Lyme', 'Newcastle under Lyme', 'Newcastle under Lyme', 'ST5 1AH')).toBe('Midlands')
    expect(getStoreRegionGroup('Cumbria', 'Carlisle', 'Carlisle', 'CA3 8NT')).toBe('Scotland')
    expect(getStoreRegionGroup('Hereford', 'Hereford', 'Hereford', 'HR1 2DA')).toBe('Midlands')
    expect(getStoreRegionGroup('Hampshire', 'Basingstoke', 'Basingstoke', 'RG21 7LJ')).toBe('South West')
    expect(getStoreRegionGroup('Shrewsbury', 'Shrewsbury', 'Shrewsbury', 'SY1 1BN')).toBe('Midlands')
    expect(getStoreRegionGroup('Salisbury', 'Salisbury', 'Salisbury', 'SP1 2AF')).toBe('South West')
  })

  it('collapses the stray manchester text bucket into north west', () => {
    expect(getStoreRegionGroup('Manchester', 'Sample Store', 'Watford', 'WD17 2UB')).toBe('North West')
    expect(getStoreRegionGroup('Greater Manchester', 'Oldham', 'Oldham', 'OL1 1HD')).toBe('North West')
    expect(getStoreRegionGroup('Liverpool Manchester', 'Liverpool One', 'Liverpool', 'L1 8JQ')).toBe('North West')
  })

  it('keeps birmingham city-core stores separate from the wider midlands bucket', () => {
    expect(getStoreRegionGroup('West Midlands', 'Bull Ring 2', 'Birmingham', 'B5 4BU')).toBe('Birmingham')
    expect(getStoreRegionGroup('West Midlands', 'Perry Barr', 'Perry Barr', 'B42 1AA')).toBe('Birmingham')
    expect(getStoreRegionGroup('West Midlands', 'Solihull', 'Solihull', 'B91 3GS')).toBe('Midlands')
    expect(getStoreRegionGroup('West Midlands', 'Sutton Coldfield', 'Sutton Coldfield', 'B72 1PD')).toBe('Midlands')
    expect(getStoreRegionGroup('West Midlands', 'Halesowen', 'Halesowen', 'B63 4AJ')).toBe('Midlands')
    expect(getStoreRegionGroup('Walsall', 'Walsall', 'Walsall', 'WS1 1YS')).toBe('Midlands')
  })

  it('combines the east and west midlands stores under one midlands bucket', () => {
    expect(getStoreRegionGroup('Coventry', 'Coventry', 'Coventry', 'CV1 1DS')).toBe('Midlands')
    expect(getStoreRegionGroup('Nuneaton', 'Nuneaton', 'Nuneaton', 'CV11 5TZ')).toBe('Midlands')
    expect(getStoreRegionGroup('Warwickshire', 'Rugby', 'Rugby', 'CV21 2JR')).toBe('Midlands')
    expect(getStoreRegionGroup('Leicestershire', 'Leicester 2', 'Leicester', 'LE1 4FT')).toBe('Midlands')
    expect(getStoreRegionGroup('Northamptonshire', 'Northampton', 'Northampton', 'NN1 2ED')).toBe('Midlands')
  })
})
