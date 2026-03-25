import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUser = { id: 'user-1', email: 'test@example.com' }
const mockParsed = {
  conductedDate: '18 February 2026',
  assessmentStartTime: '14:49 GMT',
  firePanelLocation: 'Ground floor fire exit',
  emergencyLightingSwitch: 'Ground floor stockroom',
  numberOfFireExits: '4',
  totalStaffEmployed: '39',
  maxStaffOnSite: '22',
  patTestingStatus: 'Satisfactory, last conducted 3 October 2025',
}

function makeResponsesChain(selectArg: string) {
  if (selectArg.includes('question_id, response_json')) {
    return {
      eq: vi.fn().mockResolvedValue({
        data: [{ question_id: 'q-1', response_json: { fra_pdf_text: 'stored pdf text' } }],
        error: null,
      }),
    }
  }

  return {
    eq: vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [{ response_json: { fra_pdf_text: 'stored pdf text' }, created_at: '2026-02-18T00:00:00Z' }],
        error: null,
      }),
    })),
  }
}

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
  },
  from: vi.fn((table: string) => {
    if (table === 'tfs_audit_instances') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { template_id: 'template-1' },
              error: null,
            }),
          })),
        })),
      }
    }

    if (table === 'tfs_audit_template_sections') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          })),
        })),
      }
    }

    if (table === 'tfs_audit_responses') {
      return {
        select: vi.fn((selectArg: string) => makeResponsesChain(selectArg)),
      }
    }

    if (table === 'tfs_stores') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      }
    }

    throw new Error(`Unexpected table ${table}`)
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase),
}))

vi.mock('@/app/actions/safehub', () => ({
  getAuditInstance: vi.fn().mockResolvedValue({
    id: 'fra-123',
    template_id: 'template-1',
    conducted_by_user_id: null,
    conducted_at: '2026-02-18T00:00:00.000Z',
    created_at: '2026-02-18T00:00:00.000Z',
    tfs_audit_templates: { category: 'fire_risk_assessment' },
    tfs_stores: {
      id: 'store-1',
      store_name: 'Bullring Mega',
      address_line_1: 'St Martins Market',
      city: 'Birmingham',
      postcode: 'B5 4BH',
      region: 'Midlands',
    },
  }),
}))

vi.mock('@/lib/fra/google-store-data-search', () => ({
  getStoreDataFromGoogleSearch: vi.fn().mockResolvedValue({
    openingTimes: null,
    buildDate: null,
    adjacentOccupancies: null,
    squareFootage: null,
  }),
}))

vi.mock('@/lib/fra/opening-hours-search', () => ({
  getOpeningHoursFromSearch: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/fra/build-date-search', () => ({
  getBuildDateFromSearch: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/ai/fra-summarize', () => ({
  summarizeHSAuditForFRA: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/fra/risk-rating', () => ({
  buildFRARiskSummary: vi.fn().mockReturnValue('Low'),
  computeFRARiskRating: vi.fn().mockReturnValue({
    likelihood: 'Low',
    consequences: 'Moderate Harm',
    summary: 'Low',
  }),
}))

vi.mock('@/lib/fra/pdf-parser', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fra/pdf-parser')>('@/lib/fra/pdf-parser')
  return {
    ...actual,
    ensureLockedFraParserVariant: vi.fn().mockResolvedValue('andy_duplicate'),
    extractFraPdfDataFromText: vi.fn().mockReturnValue(mockParsed),
  }
})

describe('mapHSAuditToFRAData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
  })

  it('uses the shared parser output for the stored FRA PDF text', async () => {
    const { mapHSAuditToFRAData } = await import('./fra-reports')
    const data = await mapHSAuditToFRAData('fra-123')

    expect(data.assessmentDate).toBe('18 February 2026')
    expect(data.assessmentStartTime).toBe('14:49 GMT')
    expect(data.fireAlarmPanelLocation).toBe('Ground floor fire exit')
    expect(data.emergencyLightingTestSwitchLocation).toBe('Ground floor stockroom')
    expect(data.numberOfFireExits).toBe('4')
    expect(data.totalStaffEmployed).toBe('39')
    expect(data.maxStaffOnSite).toBe('22')
    expect(data.patTestingStatus).toBe('Satisfactory, last conducted 3 October 2025')
  })
})
