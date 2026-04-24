import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(__dirname, '..')
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])

const RAW_HEX_GUARDRAIL_PATHS = [
  'components/layout',
  'components/dashboard',
  'components/cases',
  'components/ui',
  'components/auth',
  'components/workspace',
  'components/reports/monthly-report-workspace.tsx',
  'components/reports/visit-reports-workspace.tsx',
  'components/stores/store-directory.tsx',
  'components/stores/store-mobile-card.tsx',
  'components/visit-tracker/visit-tracker-client.tsx',
  'components/route-planning/route-planning-client.tsx',
  'components/calendar/calendar-client.tsx',
  'components/shared/status-badge.tsx',
  'app/(auth)/login',
  'app/(protected)/layout.tsx',
  'app/(protected)/activity/page.tsx',
  'app/(protected)/actions/page.tsx',
  'app/(protected)/admin/page.tsx',
  'app/(protected)/help/page.tsx',
  'app/(protected)/incidents/page.tsx',
  'app/(protected)/inbound-emails/page.tsx',
  'app/(protected)/queue/page.tsx',
  'app/(protected)/stores/page.tsx',
  'app/(protected)/theft-tracker/page.tsx',
]

const LEGACY_COPY_GUARDRAIL_PATHS = [...RAW_HEX_GUARDRAIL_PATHS]

const RAW_HEX_PATTERN = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g
const LEGACY_BRAND_PATTERN = /\b(KSS|Footasylum|Assurance)\b/gi

function collectSourceFiles(relativeTarget: string): string[] {
  const absoluteTarget = path.join(REPO_ROOT, relativeTarget)
  if (!fs.existsSync(absoluteTarget)) return []

  const stats = fs.statSync(absoluteTarget)
  if (stats.isFile()) return SOURCE_EXTENSIONS.has(path.extname(absoluteTarget)) ? [absoluteTarget] : []

  return fs
    .readdirSync(absoluteTarget, { withFileTypes: true })
    .flatMap((entry) => collectSourceFiles(path.join(relativeTarget, entry.name)))
}

function getRelativeMatches(targets: string[], pattern: RegExp) {
  return targets
    .flatMap((target) => collectSourceFiles(target))
    .sort()
    .flatMap((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8')
      const matches = Array.from(new Set(content.match(pattern) || []))
      if (matches.length === 0) return []
      return [`${path.relative(REPO_ROOT, filePath)}: ${matches.join(', ')}`]
    })
}

describe('phase 1 UI guardrails', () => {
  it('blocks raw hex colours in the phase 1 app shell and dashboard surface area', () => {
    expect(getRelativeMatches(RAW_HEX_GUARDRAIL_PATHS, RAW_HEX_PATTERN)).toEqual([])
  })

  it('blocks legacy KSS and Footasylum copy in TFS-facing phase 1 UI paths', () => {
    expect(getRelativeMatches(LEGACY_COPY_GUARDRAIL_PATHS, LEGACY_BRAND_PATTERN)).toEqual([])
  })
})
