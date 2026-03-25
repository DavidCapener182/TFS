import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const rawTextEntry = formData.get('rawText')
    const templateId = formData.get('templateId') as string | null
    const rawText = typeof rawTextEntry === 'string' ? rawTextEntry.trim() : ''
    const useRawText = rawText.length > 0

    if (!templateId || (!file && !useRawText)) {
      return NextResponse.json({ error: 'Missing templateId or input data' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const { data: template, error: templateError } = await supabase
      .from('tfs_audit_templates')
      .select(`
        id,
        title,
        tfs_audit_template_sections (
          id,
          title,
          tfs_audit_template_questions (
            id,
            question_text,
            question_type,
            options
          )
        )
      `)
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    let buffer: Buffer | null = null
    const resolveParser = (mod: any) => {
      if (typeof mod === 'function') return mod
      if (typeof mod?.default === 'function') return mod.default
      if (typeof mod?.default === 'object') {
        if (typeof mod.default.parse === 'function') return mod.default.parse
        if (typeof mod.default.PDFParse === 'function') return mod.default.PDFParse
      }
      if (typeof mod?.parse === 'function') return mod.parse
      if (typeof mod?.pdfParse === 'function') return mod.pdfParse
      if (typeof mod?.PDFParse === 'function') return mod.PDFParse
      return null
    }

    const runParser = async (parser: any, input: Buffer) => {
      if (typeof parser === 'function') {
        try {
          return await parser(input)
        } catch (error: any) {
          if (String(error?.message || '').includes('Class constructor')) {
            return await new parser(input).parse()
          }
          throw error
        }
      }
      if (parser && typeof parser.parse === 'function') {
        return await parser.parse(input)
      }
      if (parser && typeof parser.PDFParse === 'function') {
        return await new parser.PDFParse(input).parse()
      }
      throw new Error('No valid pdf parser function found')
    }

    let parsed
    let text = ''
    let totalPages: number | null = null
    let pagesParsed: number | null = null
    if (useRawText) {
      const lines = rawText.split('\n')
      const cleanedLines: string[] = []
      let skipMediaSummary = false
      lines.forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed) return
        if (/^media summary$/i.test(trimmed)) {
          skipMediaSummary = true
          return
        }
        if (skipMediaSummary) return
        if (/^photo\s*\d+/i.test(trimmed)) return
        cleanedLines.push(trimmed)
      })
      text = cleanedLines.join('\n')
    } else if (file) {
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
      try {
        const mod = await import('pdf-parse/node')
        const parser = resolveParser(mod)
        if (!parser) {
          throw new Error(`pdf-parse/node export not callable. Keys: ${Object.keys(mod || {}).join(', ')}`)
        }
        parsed = await runParser(parser, buffer)
        text = parsed?.text || ''
        totalPages = parsed?.numpages ?? null
        pagesParsed = parsed?.numpages ?? null
      } catch (error) {
        console.error('pdf-parse node load failed:', error)
        try {
          const mod = await import('pdf-parse')
          const parser = resolveParser(mod)
          if (!parser) {
            throw new Error(`pdf-parse export not callable. Keys: ${Object.keys(mod || {}).join(', ')}`)
          }
          parsed = await runParser(parser, buffer)
          text = parsed?.text || ''
          totalPages = parsed?.numpages ?? null
          pagesParsed = parsed?.numpages ?? null
        } catch (fallbackError) {
          console.error('pdf-parse fallback failed, using pdfjs-dist:', fallbackError)
          const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
          const loadingTask = (pdfjs as any).getDocument({ data: new Uint8Array(buffer), disableWorker: true })
          const pdf = await loadingTask.promise
          totalPages = pdf.numPages
          const maxPages = Number(formData.get('maxPages') || 10)
          const requestedPages = Number.isNaN(maxPages) ? 10 : maxPages
          const pageLimit = requestedPages <= 0 ? pdf.numPages : Math.min(pdf.numPages, requestedPages)
          const pages: string[] = []
          for (let i = 1; i <= pageLimit; i += 1) {
            const page = await pdf.getPage(i)
            const content = await page.getTextContent()
            const strings = content.items.map((item: any) => item.str)
            pages.push(strings.join(' '))
          }
          pagesParsed = pageLimit
          text = pages.join('\n\n')
        }
      }
    }

    const questions = template.tfs_audit_template_sections
      ?.flatMap((section: any) =>
        (section.tfs_audit_template_questions || []).map((q: any) => ({
          id: q.id,
          text: q.question_text,
          type: q.question_type,
          options: q.options || null,
          sectionTitle: section.title || '',
        }))
      ) || []

    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const stripQuestionFromText = (question: string, value: string) => {
      let cleaned = value.trim()
      if (!cleaned) return cleaned
      const lowerValue = cleaned.toLowerCase()
      const lowerQuestion = question.toLowerCase()
      if (lowerValue.startsWith(lowerQuestion)) {
        return cleaned.slice(question.length).trim()
      }
      const questionPrefix = question.split('?')[0].trim()
      if (questionPrefix && lowerValue.startsWith(questionPrefix.toLowerCase())) {
        return cleaned.slice(questionPrefix.length).replace(/^\?/, '').trim()
      }
      if (lowerValue.includes('?')) {
        const prefix = lowerValue.split('?')[0].trim() + '?'
        if (prefix && lowerQuestion.includes(prefix.replace('?', '').trim())) {
          cleaned = cleaned.slice(prefix.length).trim()
        }
      }
      const questionWords = normalize(question).split(' ').filter(Boolean)
      const valueWords = normalize(cleaned).split(' ').filter(Boolean)
      const suffixStart = Math.max(0, questionWords.length - 5)
      const suffixPhrase = questionWords.slice(suffixStart).join(' ')
      if (suffixPhrase && valueWords.join(' ').startsWith(suffixPhrase)) {
        const idx = cleaned.toLowerCase().indexOf(suffixPhrase)
        if (idx === 0) {
          cleaned = cleaned.slice(suffixPhrase.length).trim()
        }
      }
      return cleaned
    }

    const cleanCommentText = (question: string, value: string) => {
      let cleaned = stripQuestionFromText(question, value)
      cleaned = cleaned.replace(/^\(?\s*$/g, '').trim()
      if (!cleaned) return ''
      const questionLower = question.toLowerCase()
      if (questionLower.includes('(') && cleaned.startsWith('(')) {
        const questionParens = question.match(/\(([^)]+)\)/)
        if (questionParens?.[1] && cleaned.toLowerCase().includes(questionParens[1].toLowerCase().slice(0, 10))) {
          cleaned = cleaned.replace(/^\([^)]*\)\s*/, '').trim()
        }
      }
      // Drop comments that are just question fragments
      const cleanedWords = normalize(cleaned).split(' ').filter(Boolean)
      const questionWords = normalize(question).split(' ').filter(Boolean)
      if (cleanedWords.length > 0 && questionWords.length > 0) {
        const overlap = cleanedWords.filter((w) => questionWords.includes(w)).length
        const overlapRatio = overlap / Math.max(cleanedWords.length, 1)
        if (overlapRatio >= 0.6 || cleanedWords.length <= 3) {
          return ''
        }
      }
      return cleaned
    }

    const extractNumberFromText = (value: string) => {
      const match = value.match(/-?\d+(\.\d+)?/)
      return match ? match[0] : null
    }

    const extractDateFromText = (value: string) => {
      const isoMatch = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
      if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      const ukMatch = value.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/)
      if (ukMatch) {
        const year = ukMatch[3].length === 2 ? `20${ukMatch[3]}` : ukMatch[3]
        const month = ukMatch[2].padStart(2, '0')
        const day = ukMatch[1].padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      return null
    }

    const seedAnswers: Record<string, string> = {}
    const isAnswerToken = (value: string) => {
      const trimmed = value.trim().toLowerCase()
      if (trimmed === 'yes' || trimmed === 'no') return trimmed
      if (trimmed === 'n/a' || trimmed === 'na') return 'n/a'
      if (trimmed === 'none' || trimmed === 'none recorded' || trimmed === 'no issues') return 'no'
      return null
    }

    const computeMatchScore = (question: string, line: string) => {
      const qWords = question.split(' ').filter(Boolean)
      const lWords = line.split(' ').filter(Boolean)
      if (qWords.length === 0 || lWords.length === 0) return 0

      let overlap = 0
      const lineSet = new Set(lWords)
      qWords.forEach((word) => {
        if (lineSet.has(word)) overlap += 1
      })

      // Short questions like "PAT?" or "Lift?" need looser matching
      if (qWords.length <= 3) {
        return overlap === qWords.length ? 100 : overlap * 10
      }

      const ratio = overlap / qWords.length
      return Math.round(ratio * 100)
    }

    const lineEntries: {
      text: string
      norm: string
      answer: string | null
      hasQuestionMark: boolean
      y: number
      maxX: number
      threshold: number
    }[] = []
    const lineRows: { text: string; norm: string; items: { x: number; str: string }[]; y: number }[] = []

    if (buffer) {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        const loadingTask = (pdfjs as any).getDocument({ data: new Uint8Array(buffer), disableWorker: true })
        const pdf = await loadingTask.promise
        const maxPages = Number(formData.get('maxPages') || 10)
        const requestedPages = Number.isNaN(maxPages) ? 10 : maxPages
        const pageLimit = requestedPages <= 0 ? pdf.numPages : Math.min(pdf.numPages, requestedPages)
        totalPages = pdf.numPages
        pagesParsed = pageLimit

        for (let pageIndex = 1; pageIndex <= pageLimit; pageIndex += 1) {
          const page = await pdf.getPage(pageIndex)
          const content = await page.getTextContent()
          const items = content.items
            .map((item: any) => {
              const str = String(item.str || '').trim()
              const x = item.transform?.[4] ?? item.x ?? 0
              const y = item.transform?.[5] ?? item.y ?? 0
              return { str, x, y }
            })
            .filter((item: any) => item.str)

          const groupedLines: { y: number; items: { x: number; str: string }[] }[] = []
          const mergeThreshold = 2
          items.forEach((item: any) => {
            let line = groupedLines.find((entry) => Math.abs(entry.y - item.y) <= mergeThreshold)
            if (!line) {
              line = { y: item.y, items: [] }
              groupedLines.push(line)
            }
            line.items.push({ x: item.x, str: item.str })
          })

          const lines = groupedLines
            .sort((a, b) => b.y - a.y)
            .map((entry) => ({ y: entry.y, items: entry.items.sort((a, b) => a.x - b.x) }))

          const pageHasFailedOverview = lines.some((line) => {
            const lineText = line.items.map((i) => i.str).join(' ').toUpperCase()
            return lineText.includes('FAILED QUESTIONS OVERVIEW') || lineText.includes('FLAGGED ITEMS')
          })

          if (pageHasFailedOverview) {
            continue
          }

          const answerCandidates: { y: number; x: number; token: string }[] = []

          lines.forEach((line) => {
            const lineItems = line.items
            if (!lineItems.length) return
            const maxX = Math.max(...lineItems.map((i) => i.x))
            const threshold = maxX * 0.55
            const answerTokens = lineItems.filter((i) => i.x >= threshold)
            const answerFromTokens = answerTokens
              .map((i) => ({ token: isAnswerToken(i.str), x: i.x }))
              .filter((entry) => entry.token)
              .sort((a, b) => b.x - a.x)
              .map((entry) => entry.token)[0] || null

            const fallbackFromLine = lineItems
              .map((i) => ({ token: isAnswerToken(i.str), x: i.x }))
              .filter((entry) => entry.token)
              .sort((a, b) => b.x - a.x)
              .map((entry) => entry.token)[0] || null

            const answer = answerFromTokens || fallbackFromLine
            const questionText = lineItems
              .filter((i) => i.x < threshold)
              .map((i) => i.str)
              .join(' ')
              .trim()
            const lineText = lineItems.map((i) => i.str).join(' ').trim()
            if (!questionText) return
            lineEntries.push({
              text: questionText,
              norm: normalize(questionText),
              answer,
              hasQuestionMark: questionText.includes('?'),
              y: line.y,
              maxX,
              threshold,
            })
            if (lineText) {
              lineRows.push({
                text: lineText,
                norm: normalize(lineText),
                items: lineItems,
                y: line.y,
              })
            }
            const rightMost = answerTokens
              .map((i) => ({ token: isAnswerToken(i.str), x: i.x }))
              .filter((entry) => entry.token)
              .sort((a, b) => b.x - a.x)[0]
            if (rightMost?.token) {
              answerCandidates.push({
                y: line.y,
                x: rightMost.x,
                token: rightMost.token,
              })
            }
          })

          // Use nearby answer tokens for question rows with missing answers
          lineEntries.forEach((entry) => {
            if (entry.answer) return
            const nearby = answerCandidates
              .filter((candidate) => Math.abs(candidate.y - entry.y) <= 8 && candidate.x >= entry.threshold)
              .sort((a, b) => Math.abs(a.y - entry.y) - Math.abs(b.y - entry.y))[0]
            if (nearby?.token) {
              entry.answer = nearby.token
            }
          })
        }
      } catch (error) {
        console.error('pdfjs line extraction failed:', error)
      }
    }

    questions.forEach((q) => {
      if (q.type !== 'yesno') return
      const normQuestion = normalize(q.text)
      if (!normQuestion) return

      let bestMatchAnswer: string | null = null
      let bestMatchScore = -1
      lineEntries.forEach((entry) => {
        if (!entry.answer) return
        let score = computeMatchScore(normQuestion, entry.norm)
        if (q.text.includes('?') && !entry.hasQuestionMark) {
          score -= 20
        }
        const minScore = normQuestion.split(' ').length <= 3 ? 80 : 60
        if (score >= minScore && score > bestMatchScore) {
          bestMatchAnswer = entry.answer
          bestMatchScore = score
        }
      })

      if (bestMatchAnswer) {
        seedAnswers[q.id] = bestMatchAnswer
      }
    })

    // Fallback: use raw text heuristics for any missing yes/no answers
    const rawLines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    let skipFailedOverview = false
    let skipMediaSummary = false
    const lines = rawLines.filter((line) => {
      const upper = line.toUpperCase()
      if (upper.includes('MEDIA SUMMARY')) {
        skipMediaSummary = true
        return false
      }
      if (skipMediaSummary) {
        return false
      }
      if (/^PHOTO\s*\d+/i.test(line)) {
        return false
      }
      if (upper.includes('FAILED QUESTIONS OVERVIEW')) {
        skipFailedOverview = true
        return false
      }
      if (upper.includes('FLAGGED ITEMS')) {
        skipFailedOverview = true
        return false
      }
      if (skipFailedOverview) {
        if (
          upper.includes('GENERAL SITE INFORMATION') ||
          upper.includes('ACTION PLAN') ||
          upper.includes('DISCLAIMER') ||
          /^[A-Z0-9 &\-]{6,}$/.test(upper)
        ) {
          skipFailedOverview = false
        } else {
          return false
        }
      }
      return true
    })

    const findTokenAtEnd = (value: string) => {
      const match = value.match(/\b(yes|no|n\/a|na|none)\b\s*$/i)
      if (!match) return null
      const token = match[1].toLowerCase()
      if (token === 'na') return 'n/a'
      if (token === 'none') return 'no'
      return token
    }


    const findTokenOnlyLine = (value: string) => {
      const trimmed = value.trim().toLowerCase()
      if (trimmed === 'yes' || trimmed === 'no') return trimmed
      if (trimmed === 'n/a' || trimmed === 'na') return 'n/a'
      return null
    }

    const normalizedFull = normalize(text)

    const isAnswerOnlyLine = (value: string) => {
      const trimmed = value.trim().toLowerCase()
      return trimmed === 'yes' || trimmed === 'no' || trimmed === 'n/a' || trimmed === 'na'
    }

    const looksLikeSectionHeader = (value: string) => /^[A-Z0-9 &\-]{6,}$/.test(value.toUpperCase())
    const looksLikeQuestionLine = (value: string) => value.includes('?')

    questions.forEach((q) => {
      if (q.type !== 'yesno') return
      if (seedAnswers[q.id]) return
      const normalizedQuestion = normalize(q.text)
      const keyWords = normalizedQuestion.split(' ').slice(0, 6).join(' ')
      if (!keyWords) return

      let answer: string | null = null
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        const lineNorm = normalize(line)
        if (!lineNorm.includes(keyWords)) continue

        answer = findTokenAtEnd(line)
        if (!answer) {
          for (let j = 1; j <= 3; j += 1) {
            const nextLine = lines[i + j]
            if (!nextLine) break
            answer = findTokenOnlyLine(nextLine)
            if (answer) break
          }
        }
        if (answer) break
      }

      if (!answer && normalizedQuestion.length > 6) {
        const index = normalizedFull.indexOf(normalizedQuestion)
        if (index !== -1) {
          const window = normalizedFull.slice(index + normalizedQuestion.length, index + normalizedQuestion.length + 200)
          const match = window.match(/\b(yes|no|n\/a|na)\b/i)
          if (match) {
            const token = match[1].toLowerCase()
            answer = token === 'na' ? 'n/a' : token
          }
        }
      }

      if (answer) {
        seedAnswers[q.id] = answer
      }
    })

    const seedComments: Record<string, string> = {}
    questions.forEach((q) => {
      if (q.type !== 'yesno') return
      if (q.sectionTitle?.toLowerCase() === 'disclaimer') return
      const normalizedQuestion = normalize(q.text)
      const keyWords = normalizedQuestion.split(' ').slice(0, 6).join(' ')
      if (!keyWords) return
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        const lineNorm = normalize(line)
        if (!lineNorm.includes(keyWords)) continue
        const questionMarkIndex = line.indexOf('?')
        if (questionMarkIndex !== -1 && questionMarkIndex < line.length - 1) {
          const after = line.slice(questionMarkIndex + 1).trim()
          if (after && !isAnswerOnlyLine(after) && !/^photo\s*\d+/i.test(after)) {
            const cleaned = cleanCommentText(q.text, after)
            if (cleaned) {
              seedComments[q.id] = cleaned
            }
            break
          }
        }
        const nextLine = lines[i + 1]
        if (
          nextLine &&
          !isAnswerOnlyLine(nextLine) &&
          !/^photo\s*\d+/i.test(nextLine) &&
          !looksLikeSectionHeader(nextLine) &&
          !looksLikeQuestionLine(nextLine)
        ) {
          const cleaned = cleanCommentText(q.text, nextLine.trim())
          if (cleaned) {
            seedComments[q.id] = cleaned
          }
          break
        }
      }
    })

    const seedTextAnswers: Record<string, string> = {}
    const isLikelyQuestionRow = (row: { text: string }) => row.text.trim().includes('?')
    const extractRowValue = (row: { text: string; items: { x: number; str: string }[] }) => {
      if (!row.items.length) return null
      const maxX = Math.max(...row.items.map((i) => i.x))
      const threshold = maxX * 0.55
      const rightText = row.items
        .filter((i) => i.x >= threshold)
        .map((i) => i.str)
        .join(' ')
        .trim()
      if (rightText && !isAnswerToken(rightText)) return rightText
      const match = row.text.match(/[:?]\s*(.+)$/)
      if (match && match[1]) return match[1].trim()
      return null
    }

    const looksLikeQuestionBlock = (value: string) => {
      const lower = value.toLowerCase()
      if (lower.includes(' photo ')) return true
      if (lower.includes('is the ') && lower.includes('?')) return true
      const questionMarks = (value.match(/\?/g) || []).length
      if (questionMarks >= 2) return true
      const words = value.split(' ').filter(Boolean)
      if (words.length > 28) return true
      return false
    }

    const cleanExtractedValue = (value: string) => {
      const trimmed = value.trim()
      const stopTokens = [' Photo ', ' Is the ', ' Has the ', ' Are the ', ' Risk Assessments', ' Health and Safety Policy']
      let cleaned = trimmed
      stopTokens.forEach((token) => {
        const idx = cleaned.indexOf(token)
        if (idx > 0) {
          cleaned = cleaned.slice(0, idx).trim()
        }
      })
      return cleaned || trimmed
    }

    questions.forEach((q) => {
      if (q.type === 'yesno') return
      if (seedTextAnswers[q.id]) return
      const normQuestion = normalize(q.text)
      if (!normQuestion) return
      let bestMatchIndex = -1
      let bestMatchScore = -1
      lineRows.forEach((row, index) => {
        const score = computeMatchScore(normQuestion, row.norm)
        if (score >= 50 && score > bestMatchScore) {
          bestMatchIndex = index
          bestMatchScore = score
        }
      })
      if (bestMatchIndex === -1) return
      const row = lineRows[bestMatchIndex]
      let value = extractRowValue(row)
      if (value && looksLikeQuestionBlock(value)) {
        value = null
      }
      if (!value) {
        const nextRow = lineRows[bestMatchIndex + 1]
        if (nextRow && !isLikelyQuestionRow(nextRow)) {
          const candidate = nextRow.text.trim()
          if (candidate && !looksLikeQuestionBlock(candidate)) {
            value = candidate
          }
        }
      }
      if (value) {
        const cleaned = cleanExtractedValue(stripQuestionFromText(q.text, value))
        if (q.type === 'number') {
          const num = extractNumberFromText(cleaned)
          if (num) seedTextAnswers[q.id] = num
          return
        }
        if (q.type === 'date') {
          const date = extractDateFromText(cleaned)
          if (date) seedTextAnswers[q.id] = date
          return
        }
        seedTextAnswers[q.id] = cleaned
      }
    })

    // Line-based label extraction for stubborn text/date/number fields
    const normalizedLines = lines.map((line) => ({
      raw: line,
      norm: normalize(line),
    }))

    const labelOverrides = [
      { match: ['young persons'], type: 'number' },
      { match: ['pat'], type: 'yesno' },
      { match: ['lift'], type: 'yesno' },
      { match: ['working at height'], type: 'yesno' },
      { match: ['manual handling'], type: 'yesno' },
      { match: ['types of racking'], type: 'text' },
      { match: ['date of last accident'], type: 'date' },
      { match: ['location of light switch'], type: 'text' },
      { match: ['auditor name'], type: 'text' },
      { match: ['store manager'], type: 'text' },
      { match: ['manager name'], type: 'text' },
    ]

    const extractAfterLabel = (line: string, label: string) => {
      const index = line.toLowerCase().indexOf(label.toLowerCase())
      if (index === -1) return null
      const rest = line.slice(index + label.length).trim()
      if (!rest) return null
      const cleaned = rest.replace(/^[:\-]\s*/, '').trim()
      return cleaned || null
    }

    questions.forEach((q) => {
      if (seedAnswers[q.id] || seedTextAnswers[q.id]) return
      const normQuestion = normalize(q.text)
      if (!normQuestion) return

      const override = labelOverrides.find((entry) =>
        entry.match.some((label) => normQuestion.includes(normalize(label)))
      )
      const targetLabel = override?.match[0] || normQuestion.split(' ').slice(0, 5).join(' ')
      if (!targetLabel) return

      let foundIndex = -1
      for (let i = 0; i < normalizedLines.length; i += 1) {
        if (normalizedLines[i].norm.includes(normalize(targetLabel))) {
          foundIndex = i
          break
        }
      }
      if (foundIndex === -1) return

      if (q.type === 'yesno') {
        let token = findTokenAtEnd(normalizedLines[foundIndex].raw)
        if (!token) {
          for (let j = 1; j <= 3; j += 1) {
            const nextLine = normalizedLines[foundIndex + j]
            if (!nextLine) break
            token = findTokenOnlyLine(nextLine.raw)
            if (token) break
          }
        }
        if (token) {
          seedAnswers[q.id] = token
        }
        return
      }

      let candidate = extractAfterLabel(normalizedLines[foundIndex].raw, targetLabel)
      if (!candidate) {
        for (let j = 1; j <= 2; j += 1) {
          const nextLine = normalizedLines[foundIndex + j]
          if (!nextLine) break
          if (nextLine.norm.includes('?')) continue
          candidate = nextLine.raw.trim()
          if (candidate) break
        }
      }

      if (!candidate) return
      candidate = stripQuestionFromText(q.text, candidate)

      if (q.type === 'number') {
        const num = extractNumberFromText(candidate)
        if (num) seedTextAnswers[q.id] = num
        return
      }

      if (q.type === 'date') {
        const date = extractDateFromText(candidate)
        if (date) seedTextAnswers[q.id] = date
        return
      }

      seedTextAnswers[q.id] = candidate
    })

    const unmatched = questions.filter(
      (q) => !seedAnswers[q.id] && !seedTextAnswers[q.id] && q.type !== 'yesno'
    )

    const prompt = `
You are importing a legacy safety audit into our SafeHub system.

Extract answers from the audit text and map them to the template questions.
Return ONLY valid JSON with this shape:
{
  "answers": {
    "<questionId>": "<answer string>"
  }
}

Rules:
- Use the closest matching answer from the PDF.
- Do not guess. If unsure, return an empty string.
- For number questions, use a numeric string.
- For date questions, use "YYYY-MM-DD" if possible.
- If unsure, return an empty string.

Template questions (only fill missing answers):
${unmatched.map((q: any) => `- ${q.id} [${q.type}]: ${q.text}`).join('\n')}

Audit text:
${text.slice(0, 12000)}
`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a data extraction assistant. Return only strict JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', errorData)
      return NextResponse.json(
        { error: 'Failed to parse audit', details: errorData },
        { status: response.status }
      )
    }

    const data = await response.json()
    let content = data.choices?.[0]?.message?.content || '{}'
    content = content.replace(/```json/g, '').replace(/```/g, '').trim()

    let parsedJson: any = {}
    try {
      parsedJson = JSON.parse(content)
    } catch (error) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    return NextResponse.json({
      text,
      answers: { ...seedAnswers, ...seedTextAnswers, ...(parsedJson.answers || {}) },
      comments: seedComments,
      totalPages,
      pagesParsed,
    })
  } catch (error) {
    console.error('Error importing audit:', error)
    const message = error instanceof Error ? error.message : 'Failed to import audit'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
