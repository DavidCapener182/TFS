import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUser = { id: 'user-1', email: 'test@example.com' }
const mockParsed = {
  conductedDate: '18 February 2026',
  assessmentStartTime: '14:49 GMT',
  firePanelLocation: 'Ground floor fire exit',
  numberOfFireExits: '4',
}

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
  },
  from: vi.fn((table: string) => {
    if (table === 'tfs_audit_responses') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [{ response_json: { fra_pdf_text: 'stored pdf text' } }],
            error: null,
          }),
        })),
      }
    }
    throw new Error(`Unexpected table ${table}`)
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase),
}))

vi.mock('@/app/actions/fra-reports', () => ({
  getLatestHSAuditForStore: vi.fn().mockResolvedValue({
    audit: null,
    pdfText: 'stored pdf text',
  }),
}))

vi.mock('@/app/actions/audits', () => ({
  getAuditInstance: vi.fn().mockResolvedValue({
    tfs_audit_templates: { category: 'fire_risk_assessment' },
    tfs_stores: {
      id: 'store-1',
      store_name: 'Bullring Mega',
      address_line_1: 'St Martins Market',
      city: 'Birmingham',
    },
  }),
}))

vi.mock('@/lib/fra/google-store-data-search', () => ({
  getStoreDataFromGoogleSearch: vi.fn().mockResolvedValue({
    openingTimes: null,
    squareFootage: null,
  }),
}))

vi.mock('@/lib/fra/opening-hours-search', () => ({
  getOpeningHoursFromSearch: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/fra/pdf-parser', () => ({
  ensureLockedFraParserVariant: vi.fn().mockResolvedValue('andy_duplicate'),
  extractFraPdfDataFromText: vi.fn().mockReturnValue(mockParsed),
}))

describe('FRA extract-data route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
  })

  it('returns the shared parser output for the stored FRA PDF text', async () => {
    const { GET } = await import('./route')
    const request = new NextRequest('http://localhost/api/fra-reports/extract-data?instanceId=fra-123')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.conductedDate).toBe('18 February 2026')
    expect(data.assessmentStartTime).toBe('14:49 GMT')
    expect(data.firePanelLocation).toBe('Ground floor fire exit')
    expect(data.numberOfFireExits).toBe('4')
  })
})
