import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const root = process.cwd()
const sourceFile = path.join(root, 'lib', 'visit-needs.ts')
const compileDir = path.join(root, 'tmp', 'pdfs', 'visit-needs-live')
const compileOut = path.join(compileDir, 'visit-needs.js')
const outputJson = path.join(root, 'tmp', 'pdfs', 'store-visit-template-guide.json')

fs.mkdirSync(compileDir, { recursive: true })

execFileSync(
  path.join(root, 'node_modules', '.bin', 'tsc'),
  [
    sourceFile,
    '--target',
    'ES2020',
    '--module',
    'commonjs',
    '--skipLibCheck',
    '--outDir',
    compileDir,
  ],
  { stdio: 'inherit' }
)

const visitNeeds = await import(`file://${compileOut}?ts=${Date.now()}`)

const sectionOrder = ['what_checked', 'findings', 'actions']

const templates = visitNeeds.STORE_VISIT_ACTIVITY_OPTIONS.map((option) => ({
  key: option.key,
  label: option.label,
  description: option.description,
  formVariant: option.formVariant,
  evidenceLabel: option.evidenceLabel,
  detailPlaceholder: option.detailPlaceholder,
  specialist: Boolean(option.specialist),
  sectionGuides: Object.fromEntries(
    sectionOrder
      .map((section) => [section, visitNeeds.getStoreVisitActivitySectionGuide(option.key, section)])
      .filter(([, guide]) => Boolean(guide))
  ),
  countedItemsGuide: visitNeeds.getStoreVisitActivityCountedItemsGuide(option.key) || null,
  amountChecksGuide: visitNeeds.getStoreVisitActivityAmountChecksGuide(option.key) || null,
  fields: visitNeeds.getStoreVisitActivityFieldDefinitions(option.key).map((field) => ({
    key: field.key,
    label: field.label,
    input: field.input,
    section: visitNeeds.getStoreVisitActivityFieldSection(option.key, field),
    placeholder: field.placeholder,
    helperText: field.helperText || null,
    scriptLines: field.scriptLines || [],
    captureHint: field.captureHint || '',
    required: Boolean(field.required),
    options: field.options || null,
  })),
}))

fs.writeFileSync(outputJson, JSON.stringify(templates, null, 2))
console.log(outputJson)
