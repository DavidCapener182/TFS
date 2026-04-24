import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

import {
  buildDeterministicMonthlyVisitSummary,
  isMetaSummaryLine,
  isUsableSummaryLine,
  sanitizeSummaryLine,
  truncateSmart,
  uniqueLines,
  type MonthlyVisitSummaryInput,
} from '@/lib/ai/monthly-report-deterministic-summary'

export type { MonthlyVisitSummaryInput } from '@/lib/ai/monthly-report-deterministic-summary'

export type MonthlySummaryProviderType = 'openai' | 'gemini' | 'none'

export interface MonthlyVisitSummaryResult {
  summary: string
  provider: MonthlySummaryProviderType
  usedAi: boolean
  errorMessage: string | null
}

const summaryCache = new Map<string, string>()
const SUMMARY_CACHE_VERSION = '2026-04-02-v2'
const OPENAI_QUOTA_COOLDOWN_MS = 10 * 60 * 1000
let openAiQuotaBlockedUntil = 0

function parseEnvLocal() {
  const envFilePath = path.join(process.cwd(), '.env.local')
  const parsed: Record<string, string> = {}

  if (existsSync(envFilePath)) {
    const content = readFileSync(envFilePath, 'utf8')

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const separatorIndex = line.indexOf('=')
      if (separatorIndex <= 0) continue

      const key = line.slice(0, separatorIndex).trim()
      let value = line.slice(separatorIndex + 1).trim()

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      parsed[key] = value
    }
  }

  return parsed
}

function getConfiguredKey(name: 'OPENAI_API_KEY' | 'GEMINI_API_KEY') {
  const runtimeValue = String(process.env[name] || '').trim()
  if (runtimeValue) return runtimeValue

  return String(parseEnvLocal()[name] || '').trim()
}

function getSummaryProviderPreference() {
  const runtimeValue = String(process.env.MONTHLY_REPORT_SUMMARY_PROVIDER || '').trim().toLowerCase()
  if (runtimeValue === 'openai' || runtimeValue === 'gemini' || runtimeValue === 'auto') {
    return runtimeValue
  }

  const envLocalValue = String(parseEnvLocal().MONTHLY_REPORT_SUMMARY_PROVIDER || '').trim().toLowerCase()
  if (envLocalValue === 'openai' || envLocalValue === 'gemini' || envLocalValue === 'auto') {
    return envLocalValue
  }

  return 'auto' as const
}

function getSummaryProvider(name: 'openai' | 'gemini') {
  if (name === 'openai') {
    const openAiApiKey = getConfiguredKey('OPENAI_API_KEY')
    if (!openAiApiKey) return null
    return {
      type: 'openai' as const,
      apiKey: openAiApiKey,
    }
  }

  const geminiApiKey = getConfiguredKey('GEMINI_API_KEY')
  if (!geminiApiKey) return null
  return {
    type: 'gemini' as const,
    apiKey: geminiApiKey,
  }
}

function getPreferredSummaryProviders() {
  const preference = getSummaryProviderPreference()
  if (preference === 'openai') {
    const openAiOnly = getSummaryProvider('openai')
    return openAiOnly ? [openAiOnly] : []
  }
  if (preference === 'gemini') {
    const geminiOnly = getSummaryProvider('gemini')
    return geminiOnly ? [geminiOnly] : []
  }

  const now = Date.now()
  const openAiProvider = now >= openAiQuotaBlockedUntil ? getSummaryProvider('openai') : null

  const providers = [
    openAiProvider,
    getSummaryProvider('gemini'),
  ].filter((provider): provider is { type: 'openai' | 'gemini'; apiKey: string } => Boolean(provider))

  return providers
}

function getLegacySingleSummaryProvider() {
  const openAiApiKey = getConfiguredKey('OPENAI_API_KEY')
  if (openAiApiKey) {
    return {
      type: 'openai' as const,
      apiKey: openAiApiKey,
    }
  }

  const geminiApiKey = getConfiguredKey('GEMINI_API_KEY')
  if (geminiApiKey) {
    return {
      type: 'gemini' as const,
      apiKey: geminiApiKey,
    }
  }

  return null
}

function buildSummaryPrompt(input: MonthlyVisitSummaryInput) {
  return `You are preparing a concise UK retail loss prevention monthly report row.

Summarise ONLY the main actions taken and follow-up actions into short management-ready bullet points.

Rules:
- Return plain text only.
- Return 2 to 4 bullet points.
- Every line must start with "- ".
- Keep each bullet to roughly 8 to 20 words.
- Focus on what was done and what follow-up completed/remains.
- Exclude broad narrative/risk context unless needed to explain an action.
- Do not invent details.

Store: ${input.storeName}
Visit labels: ${input.reportLabels.length > 0 ? input.reportLabels.join(', ') : 'Completed visit'}

Source details:
${input.detailText}`
}

function buildFallbackExpansionPrompt(input: MonthlyVisitSummaryInput, fallback: string) {
  return `Rewrite the monthly visit summary bullets below to be clearer and slightly richer for management reporting.

Rules:
- Return plain text only.
- Return 4 to 5 bullet points.
- Every line must start with "- ".
- Keep wording factual and grounded in the source details.
- Do not invent details.
- Keep each bullet concise but complete.

Store: ${input.storeName}
Visit labels: ${input.reportLabels.length > 0 ? input.reportLabels.join(', ') : 'Completed visit'}

Source details:
${input.detailText}

Current fallback bullets:
${fallback}`
}

function normalizeAiSummary(value: string, fallback: string) {
  const normalizedLines = uniqueLines(
    String(value || '')
      .split(/\r?\n+/)
      .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
      .filter(Boolean)
  )
    .map((line) => `- ${truncateSmart(line, 720)}`)
    .slice(0, 5)

  if (normalizedLines.length === 0) return fallback

  const summaryText = normalizedLines.join('\n')
  const visibleChars = summaryText.replace(/[\s\-•]/g, '').length
  const hasEnoughDetail =
    (normalizedLines.length >= 2 && visibleChars >= 110) ||
    (normalizedLines.length >= 1 && visibleChars >= 170)

  // Guard against low-quality AI outputs (e.g., single short bullet).
  return hasEnoughDetail ? summaryText : fallback
}

function normalizeAiSummaryBasic(value: string, fallback: string) {
  const aiLines = uniqueLines(
    String(value || '')
      .split(/\r?\n+/)
      .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
      .filter(Boolean)
  )
    .map((line) => sanitizeSummaryLine(truncateSmart(line, 760)))
    .filter((line) => isUsableSummaryLine(line) && !isMetaSummaryLine(line))

  const fallbackLines = uniqueLines(
    String(fallback || '')
      .split(/\r?\n+/)
      .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
      .filter(Boolean)
  )
    .map((line) => sanitizeSummaryLine(truncateSmart(line, 760)))
    .filter(Boolean)

  // Keep AI wording first, then top up with deterministic bullets so we never collapse to a thin one-liner.
  const mergedLines = uniqueLines([...aiLines, ...fallbackLines]).slice(0, 5)

  return mergedLines.length > 0 ? mergedLines.map((line) => `- ${line}`).join('\n') : fallback
}

async function summarizeWithOpenAI(input: MonthlyVisitSummaryInput, apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content: 'You write concise loss prevention management summaries. Return plain text bullet points only.',
        },
        {
          role: 'user',
          content: buildSummaryPrompt(input),
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => '')
    throw new Error(`OpenAI summarisation failed (${response.status}): ${errorPayload}`)
  }

  const data = await response.json()
  return String(data.choices?.[0]?.message?.content || '').trim()
}

async function summarizeWithGemini(input: MonthlyVisitSummaryInput, apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: buildSummaryPrompt(input) }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 220,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => '')
    throw new Error(`Gemini summarisation failed (${response.status}): ${errorPayload}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => String(part?.text || ''))
    .join('\n')

  return String(text || '').trim()
}

async function expandFallbackWithGemini(
  input: MonthlyVisitSummaryInput,
  fallback: string,
  apiKey: string
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: buildFallbackExpansionPrompt(input, fallback) }],
          },
        ],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 280,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => '')
    throw new Error(`Gemini fallback expansion failed (${response.status}): ${errorPayload}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => String(part?.text || ''))
    .join('\n')

  return String(text || '').trim()
}

export async function summarizeMonthlyVisitDetailsWithAI(input: MonthlyVisitSummaryInput) {
  const result = await summarizeMonthlyVisitDetails(input)
  return result.summary
}

export async function summarizeMonthlyVisitDetails(
  input: MonthlyVisitSummaryInput,
  options?: { forceRefresh?: boolean }
): Promise<MonthlyVisitSummaryResult> {
  const fallback = buildDeterministicMonthlyVisitSummary(input)
  const preferredProviders = getPreferredSummaryProviders()
  const provider = preferredProviders[0] || getLegacySingleSummaryProvider()

  if (!provider) {
    return {
      summary: fallback,
      provider: 'none',
      usedAi: false,
      errorMessage: 'No AI provider key is configured.',
    }
  }

  const cacheKey = createHash('sha256')
    .update(SUMMARY_CACHE_VERSION)
    .update('\n')
    .update(provider.type)
    .update('\n')
    .update(input.storeName)
    .update('\n')
    .update(input.reportLabels.join('|'))
    .update('\n')
    .update(input.detailText)
    .digest('hex')

  const shouldUseCache = options?.forceRefresh !== true
  const cached = shouldUseCache ? summaryCache.get(cacheKey) : null
  if (typeof cached === 'string') {
    return {
      summary: cached,
      provider: provider.type,
      usedAi: true,
      errorMessage: null,
    }
  }

  const providersToTry = preferredProviders.length > 0 ? preferredProviders : [provider]
  const providerErrors: string[] = []

  for (const candidateProvider of providersToTry) {
    try {
      const rawSummary = candidateProvider.type === 'openai'
        ? await summarizeWithOpenAI(input, candidateProvider.apiKey)
        : await summarizeWithGemini(input, candidateProvider.apiKey)

      let normalized =
        candidateProvider.type === 'openai'
          ? normalizeAiSummary(rawSummary, fallback)
          : normalizeAiSummaryBasic(rawSummary, fallback)

      if (normalized.trim() === fallback.trim() && candidateProvider.type === 'gemini') {
        const expansionSummary = await expandFallbackWithGemini(input, fallback, candidateProvider.apiKey)
        normalized = normalizeAiSummaryBasic(expansionSummary, fallback)
      }
      const aiAccepted = normalized.trim() !== fallback.trim()
      summaryCache.set(cacheKey, normalized)
      return {
        summary: normalized,
        provider: candidateProvider.type,
        usedAi: aiAccepted,
        errorMessage: aiAccepted ? null : `${candidateProvider.type} returned low-detail output; deterministic fallback used.`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI summary generation failed.'
      if (candidateProvider.type === 'openai' && /insufficient_quota/i.test(message)) {
        openAiQuotaBlockedUntil = Date.now() + OPENAI_QUOTA_COOLDOWN_MS
      }
      providerErrors.push(`${candidateProvider.type}: ${message}`)
      console.error('[MONTHLY-REPORT-SUMMARIZE] Failed AI summary generation:', error)
    }
  }

  return {
    summary: fallback,
    provider: provider.type,
    usedAi: false,
    errorMessage: providerErrors.join(' | ') || 'AI summary generation failed.',
  }
}
