import { describe, expect, it } from 'vitest'

import {
  getInboundEmailDetailedSummary,
  getInboundEmailDisplaySummary,
  type InboundEmailRow,
} from './inbound-emails'

function buildEmail(overrides: Partial<InboundEmailRow> = {}): InboundEmailRow {
  return {
    id: 'email-1',
    outlook_message_id: 'msg-1',
    mailbox_name: 'TFS Shared Mailbox',
    folder_name: 'Stock Control Inbox',
    subject: 'Theft',
    sender_name: 'Stock Counts',
    sender_email: 'counts@tfs.com',
    received_at: '2026-04-02T11:13:00.000Z',
    has_attachments: false,
    body_preview: 'Preview text',
    body_text: 'Body text',
    body_html: null,
    raw_payload: {},
    matched_store_id: 'store-1',
    processing_status: 'pending',
    last_error: null,
    created_at: '2026-04-02T11:13:00.000Z',
    analysis_source: 'rule',
    analysis_template_key: 'store_theft',
    analysis_summary: 'Store theft reported.',
    analysis_confidence: 0.94,
    analysis_needs_action: true,
    analysis_needs_visit: false,
    analysis_needs_incident: true,
    analysis_payload: {
      extractedFields: {
        lineItems: [
          {
            quantity: 1,
            stockId: '64173',
            description: 'STOCK ID',
            catalogProductTitle: 'Jean Paul Gaultier GAULTIER DIVINE Eau De Parfum 50ml',
            catalogLineValueGbp: 178,
          },
          {
            quantity: 1,
            stockId: '73517',
            description: 'Jean Paul Gaultier SCANDAL POUR HOMME Elixir Parfum 50ml',
            catalogLineValueGbp: 140,
          },
        ],
        catalogTotalValueGbp: 318,
      },
    },
    analysis_last_ran_at: '2026-04-02T11:14:00.000Z',
    analysis_error: null,
    ...overrides,
  }
}

describe('inbound email theft formatting', () => {
  it('builds a compact theft summary for store email cards', () => {
    const email = buildEmail()

    expect(getInboundEmailDisplaySummary(email)).toBe(
      'Theft reported by email. 2 lines identified. Total reported £318.00.'
    )
  })

  it('builds a detailed theft summary with line items and totals', () => {
    const email = buildEmail()

    expect(getInboundEmailDetailedSummary(email)).toContain('Theft reported by email.')
    expect(getInboundEmailDetailedSummary(email)).toContain('1 x Jean Paul Gaultier GAULTIER DIVINE Eau De Parfum 50ml (Stock ID 64173) - Website value £178.00')
    expect(getInboundEmailDetailedSummary(email)).toContain('Total reported: £318.00')
  })
})
