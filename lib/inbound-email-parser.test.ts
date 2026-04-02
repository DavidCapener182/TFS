import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getStoreVisitProductCatalogMock, searchStoreVisitProductsMock } = vi.hoisted(() => ({
  getStoreVisitProductCatalogMock: vi.fn(),
  searchStoreVisitProductsMock: vi.fn(),
}))

vi.mock('@/lib/store-visit-product-catalog', () => ({
  getStoreVisitProductCatalog: getStoreVisitProductCatalogMock,
  searchStoreVisitProducts: searchStoreVisitProductsMock,
}))

import { analyzeInboundEmail } from './inbound-email-parser'

describe('inbound email theft parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.OPENAI_API_KEY
    getStoreVisitProductCatalogMock.mockResolvedValue([])
  })

  it('parses theft review emails from internal non-store mailboxes and enriches line values by stock id', async () => {
    searchStoreVisitProductsMock.mockImplementation(async (query: string) => {
      if (query === '71859') {
        return [{
          productId: '71859',
          title: 'Prada Paradigm 50ml Eau de Parfum',
          brand: 'Prada',
          productBaseName: 'Paradigm 50ml',
          price: 76,
          url: null,
          imageUrl: null,
          variantMasterRecordId: null,
          variantSkuIds: [],
        }]
      }

      if (query === 'Carolina Herrera Good Girl 30ml') {
        return [{
          productId: 'prd-2',
          title: 'Carolina Herrera Good Girl 30ml Eau de Parfum',
          brand: 'Carolina Herrera',
          productBaseName: 'Good Girl 30ml',
          price: 59,
          url: null,
          imageUrl: null,
          variantMasterRecordId: null,
          variantSkuIds: [],
        }]
      }

      if (query === 'Prada Paradoxe edp 30ml') {
        return [{
          productId: 'prd-3',
          title: 'Prada Paradoxe EDP 30ml',
          brand: 'Prada',
          productBaseName: 'Paradoxe EDP 30ml',
          price: 72,
          url: null,
          imageUrl: null,
          variantMasterRecordId: null,
          variantSkuIds: [],
        }]
      }

      return []
    })

    const result = await analyzeInboundEmail({
      subject: 'Theft, Review - Oldham',
      sender_name: 'Stock Counts @ tfs.com',
      sender_email: 'counts@tfs.com',
      body_preview: 'Theft review raised for Oldham.',
      body_text: [
        'This morning around half 9, we had a theft of a full cube from our countertop.',
        '',
        'This cube include:',
        '',
        '1x Prada Paradigm 50ml - 71859',
        '1x Carolina Herrera Good Girl 30ml - 40313',
        '1x Prada Paradoxe edp 30ml - 59570',
      ].join('\n'),
      body_html: null,
      has_attachments: false,
      folder_name: 'Stock Control Inbox',
      mailbox_name: 'TFS Shared Mailbox',
    })

    expect(result.templateKey).toBe('store_theft')
    expect(result.primaryStore?.storeName).toBe('Oldham')
    expect(result.extractedFields.catalogTotalValueGbp).toBe(207)

    const lineItems = Array.isArray(result.extractedFields.lineItems)
      ? result.extractedFields.lineItems
      : []

    expect(lineItems).toHaveLength(3)
    expect(lineItems[0]).toMatchObject({
      stockId: '71859',
      description: 'Prada Paradigm 50ml',
      catalogUnitPriceGbp: 76,
      catalogLineValueGbp: 76,
      catalogMatchType: 'stock_id',
    })
  })

  it('captures quantity-only theft lines and enriches value from the catalog by description', async () => {
    searchStoreVisitProductsMock.mockImplementation(async (query: string) => {
      if (query === 'Ghost Mini Moons Giftset') {
        return [{
          productId: 'prd-4',
          title: 'Ghost Mini Moons Giftset',
          brand: 'Ghost',
          productBaseName: 'Mini Moons Giftset',
          price: 24,
          url: null,
          imageUrl: null,
          variantMasterRecordId: null,
          variantSkuIds: ['72213'],
        }]
      }

      return []
    })

    const result = await analyzeInboundEmail({
      subject: 'Theft in Eastbourne',
      sender_name: 'The Fragrance Shop Eastbourne',
      sender_email: '261.eastbourne@tfsstores.com',
      body_preview: 'We have had a theft in store.',
      body_text: [
        'We had a theft in store today.',
        '',
        'Items taken:',
        '1x Ghost Mini Moons Giftset',
      ].join('\n'),
      body_html: null,
      has_attachments: false,
      folder_name: 'Loss Prevention Inbox',
      mailbox_name: 'TFS Shared Mailbox',
    })

    expect(result.templateKey).toBe('store_theft')

    const lineItems = Array.isArray(result.extractedFields.lineItems)
      ? result.extractedFields.lineItems
      : []

    expect(lineItems).toHaveLength(1)
    expect(lineItems[0]).toMatchObject({
      description: 'Ghost Mini Moons Giftset',
      catalogUnitPriceGbp: 24,
      catalogLineValueGbp: 24,
      catalogMatchType: 'description',
    })
    expect(result.extractedFields.totalValueGbp).toBe(24)
  })

  it('parses outlook-paste theft emails with stock-id-only lines and falls back to live line search results', async () => {
    searchStoreVisitProductsMock.mockImplementation(async (query: string) => {
      if (query === '64173') {
        return [{
          productId: '64172',
          title: 'Jean Paul Gaultier GAULTIER DIVINE Eau De Parfum 50ml',
          brand: 'Jean Paul Gaultier',
          productBaseName: 'Eau De Parfum 50ml',
          price: 178,
          url: null,
          imageUrl: null,
          variantMasterRecordId: null,
          variantSkuIds: [],
        }]
      }

      if (query === '73517') {
        return [{
          productId: '73517',
          title: 'Jean Paul Gaultier SCANDAL POUR HOMME Elixir Parfum 50ml',
          brand: 'Jean Paul Gaultier',
          productBaseName: 'Elixir Parfum 50ml',
          price: 140,
          url: null,
          imageUrl: null,
          variantMasterRecordId: null,
          variantSkuIds: [],
        }]
      }

      return []
    })

    const result = await analyzeInboundEmail({
      subject: '(No subject)',
      sender_name: '\u200bTFSLossPrevention;\u200bTFS Stock Adjustments',
      sender_email: 'stock@tfs.com',
      body_preview: 'Unfortunately, we have had a store theft yesterday.',
      body_text: [
        '\u200bSummarise',
        'The Fragrance Shop Canary Wharf',
        '',
        'Good afternoon,',
        '',
        'Unfortunately, we have had a store theft yesterday 01/04/26 at 7:20pm.',
        'The man stole 3 items as we were busy serving other customer.',
        '',
        'STOCK ID: 64173',
        'STOCK ID; 73517',
        'STOCKID: 520',
        '',
        'Crime Reference number is SP-46534--26-010100',
      ].join('\n'),
      body_html: null,
      has_attachments: false,
      folder_name: 'Stock Control Inbox',
      mailbox_name: 'TFS Shared Mailbox',
    })

    expect(result.templateKey).toBe('store_theft')
    expect(result.needsAction).toBe(true)
    expect(result.needsIncident).toBe(true)
    expect(result.primaryStore?.storeName?.toLowerCase()).toContain('canary wharf')

    const lineItems = Array.isArray(result.extractedFields.lineItems)
      ? result.extractedFields.lineItems
      : []

    expect(lineItems).toHaveLength(2)
    expect(lineItems[0]).toMatchObject({
      stockId: '64173',
      description: 'Jean Paul Gaultier GAULTIER DIVINE Eau De Parfum 50ml',
      catalogLineValueGbp: 178,
    })
    expect(lineItems[1]).toMatchObject({
      stockId: '73517',
      description: 'Jean Paul Gaultier SCANDAL POUR HOMME Elixir Parfum 50ml',
      catalogLineValueGbp: 140,
    })
    expect(result.extractedFields.catalogTotalValueGbp).toBe(318)
  })
})
