import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { NewsletterAIPromptPack } from '@/lib/reports/monthly-newsletter-types'

interface PromptRequestBody {
  selectedArea?: string
  metrics?: {
    avg?: number | string | null
  }
  topStore?: string
  bottomStore?: string
  leaderboard?: Array<{
    storeName?: string
    score?: number | null
  }>
  scores?: number[]
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toAreaLabel(value: string | undefined): string {
  const normalized = (value || '').trim().toUpperCase()
  if (!normalized) return 'UNASSIGNED'
  return normalized
}

function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').trim()
}

function stripMarkdownStyling(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`/g, '')
    .trim()
}

function buildLeaderboardText(
  leaderboard: PromptRequestBody['leaderboard'],
  fallbackScores: number[]
): string {
  if (Array.isArray(leaderboard) && leaderboard.length > 0) {
    const formatted = leaderboard
      .map((row) => {
        const name = (row.storeName || '').trim() || 'Unknown store'
        const score = typeof row.score === 'number' && Number.isFinite(row.score) ? `${row.score.toFixed(1)}%` : 'N/A'
        return `${name}: ${score}`
      })
      .filter((line) => line.length > 0)

    if (formatted.length > 0) {
      return formatted.join(', ')
    }
  }

  if (fallbackScores.length === 0) return 'No scored stores available.'
  return fallbackScores.map((score, index) => `Store ${index + 1}: ${score.toFixed(1)}%`).join(', ')
}

async function generateCompletion(
  apiKey: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a KSS NW Health & Safety consultant writing concise monthly briefings for Footasylum area managers. Return plain text only with no markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('OpenAI monthly newsletter AI prompt error:', errorData)
    throw new Error('Failed to generate AI monthly newsletter content')
  }

  const data = await response.json()
  return stripMarkdownStyling(sanitizeText(data.choices?.[0]?.message?.content))
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const body = ((await request.json().catch(() => ({}))) || {}) as PromptRequestBody

    const selectedArea = toAreaLabel(body.selectedArea)
    const avgValue = toNumber(body.metrics?.avg)
    const avgLabel = avgValue !== null ? avgValue.toFixed(1) : 'N/A'
    const scoreDistribution = Array.isArray(body.scores)
      ? body.scores.filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
      : []

    const topStore = sanitizeText(body.topStore) || 'N/A'
    const bottomStore = sanitizeText(body.bottomStore) || 'N/A'
    const leaderboardText = buildLeaderboardText(body.leaderboard, scoreDistribution)

    const generateBriefingPrompt = `Act as a KSS NW Health & Safety consultant. Summarize Area ${selectedArea} performance (Avg: ${avgLabel}%). Tactical tone. 40 words max.`

    const composeNewsletterPrompt = `Write a professional internal newsletter email from KSS NW (Footasylum's Health & Safety Consultants) to Footasylum Area Managers regarding their store audit scores. Use this context: Area: ${selectedArea}, Avg: ${avgLabel}%, Top: ${topStore}, Bottom: ${bottomStore}, Leaderboard: ${leaderboardText}. Include an upbeat greeting, 'Regional Highlights', 'Focus Required', and a professional closing. Use retail terminology such as high standards and visual excellence. Plain text only. No markdown, no asterisks, no hashtags. Keep the full email between 140 and 180 words.`

    const analyzeRegionalRiskPrompt = `Analyze this score distribution for retail store audits from a KSS NW consultant perspective: [${scoreDistribution.join(', ')}]. The average is ${avgLabel}%. Identify whether it is Top-Heavy, Consistent but low, or Inconsistent, and provide a 2-sentence operational risk warning. Plain text only, max 45 words.`

    const [generateBriefing, composeNewsletter, analyzeRegionalRisk] = await Promise.all([
      generateCompletion(apiKey, generateBriefingPrompt, 140),
      generateCompletion(apiKey, composeNewsletterPrompt, 280),
      generateCompletion(apiKey, analyzeRegionalRiskPrompt, 120),
    ])

    const payload: NewsletterAIPromptPack = {
      generateBriefing,
      composeNewsletter,
      analyzeRegionalRisk,
    }

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error('Error generating monthly newsletter consultant briefing:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate monthly newsletter consultant briefing' },
      { status: 500 }
    )
  }
}
