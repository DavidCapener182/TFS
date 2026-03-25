'use server'

import { createClient } from '@/lib/supabase/server'
import { summarizeHSAuditForFRA } from '@/lib/ai/fra-summarize'
import { getOpeningHoursFromSearch } from '@/lib/fra/opening-hours-search'
import { getBuildDateFromSearch } from '@/lib/fra/build-date-search'
import { getStoreDataFromGoogleSearch } from '@/lib/fra/google-store-data-search'
import {
  ensureLockedFraParserVariant,
  extractDateFromText as extractAuditDateFromText,
  extractFraPdfDataFromText,
  parseAuditDateString,
} from '@/lib/fra/pdf-parser'
import { buildFRARiskSummary, computeFRARiskRating, type FRARiskFindings } from '@/lib/fra/risk-rating'
import { getAuditInstance } from './safehub'

type ParsedYesNoQuestion = {
  answer: 'yes' | 'no' | 'na' | null
  comment: string | null
}

const NEXT_QUESTION_BOUNDARIES: RegExp[] = [
  /location\s+of\s+fire\s+panel/i,
  /is\s+panel\s+free\s+of\s+faults\?/i,
  /location\s+of\s+emergency\s+lighting\s+test\s+switch/i,
  /fire\s+panel\s+location/i,
  /fire\s+exit\s+routes\s+clear\s+and\s+unobstructed\?/i,
  /combustible\s+materials\s+are\s+stored\s+correctly\?/i,
  /fire\s+doors\s+in\s+a\s+good\s+condition\?/i,
  /are\s+fire\s+door\s+intumescent\s+strips\s+in\s+place\s+and\s+intact/i,
  /fire\s+doors\s+closed\s+and\s+not\s+held\s+open\?/i,
  /are\s+all\s+call\s+points\s+clear\s+and\s+easily\s+accessible/i,
  /records?\s+available\s+on\s+site\?/i,
  /are\s+all\s+fire\s+extinguishers?\s+clear\s+and\s+easily\s+accessible/i,
  /is\s+there\s+a\s+50mm\s+clearance\s+from\s+stock\s+to\s+sprinkler\s+head/i,
  /are\s+plugs\s+and\s+extension\s+leads\s+managed\s+and\s+not\s+overloaded/i,
  /fire\s+drill\s+has\s+been\s+carried\s+out\s+in\s+the\s+past\s+6\s+months/i,
  /weekly\s+fire\s+tests\s+carried\s+out\s+and\s+documented\?/i,
  /weekly\s+fire\s+alarm\s+testing\s+is\s+being\s+completed\s+and\s+recorded/i,
  /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test\s+being\s+conducted\?/i,
  /fire\s+extinguisher\s+service\?/i,
  /\bpat\s*\?/i,
  /fixed\s+electrical\s+wiring\?/i,
  /store\s+compliance/i,
  /action\s+plan\s+sign\s+off/i,
  /due\s+date\s+to\s+resolve\/complete/i,
  /actions?\s+by\s+the\s+set\s+due\s+date/i,
  /signature\s+of\s+person\s+in\s+charge/i,
]

function normalizeLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

function isPhotoOnlyLine(value: string): boolean {
  return /^\s*photo\s+\d+(?:\s+photo\s+\d+)*\s*$/i.test(value)
}

function isSectionHeadingLine(value: string): boolean {
  const line = normalizeWhitespace(value)
  if (!line) return false
  return [
    'General Site Information',
    'Statutory Testing',
    'Fire Safety',
    'Store Compliance',
    'COSHH',
    'Training',
  ].some((heading) => new RegExp(`^${heading}\\b`, 'i').test(line))
}

function isLikelyNewQuestionLine(value: string): boolean {
  const line = normalizeWhitespace(value)
  if (!line) return false
  if (/\?$/.test(line) && line.length > 12) return true
  if (/^(number of|location of|evidence of|is panel|are all|fire drill has|h&s)/i.test(line)) return true
  return false
}

function splitBeforeNextQuestionBoundary(value: string): { before: string; hitBoundary: boolean } {
  let cutIndex = -1
  for (const pattern of NEXT_QUESTION_BOUNDARIES) {
    const match = pattern.exec(value)
    if (!match || typeof match.index !== 'number') continue
    if (cutIndex < 0 || match.index < cutIndex) cutIndex = match.index
  }
  if (cutIndex < 0) {
    return { before: value, hitBoundary: false }
  }
  return { before: value.slice(0, cutIndex).trim(), hitBoundary: true }
}

const TRAILING_CONTAMINATION_PATTERNS: RegExp[] = [
  /records?\s+available\s+on\s+site\??/i,
  /recorded\s+on\s+zipline/i,
  /weekly\s+fire\s+(?:tests?|alarm\s+testing)/i,
  /fire\s+drill\s+has\s+been\s+carried\s+out/i,
  /evidence\s+of\s+monthly\s+emergency\s+lighting\s+test/i,
  /is\s+there\s+a\s+50mm\s+clearance\s+from\s+stock\s+to\s+sprinkler\s+head/i,
  /are\s+plugs?\s+and\s+extension\s+leads?\s+managed\s+and\s+not\s+overloaded/i,
  /location\s+of\s+fire\s+panel/i,
  /is\s+panel\s+free\s+of\s+faults/i,
  /location\s+of\s+emergency\s+lighting\s+test\s+switch/i,
  /store\s+compliance/i,
  /action\s+plan\s+sign\s+off/i,
  /due\s+date\s+to\s+resolve\/complete/i,
  /actions?\s+by\s+the\s+set\s+due\s+date/i,
  /signature\s+of\s+person\s+in\s+charge/i,
]

function cutAtEarliestPattern(value: string, patterns: RegExp[]): string {
  let cutIndex = -1
  for (const pattern of patterns) {
    const safePattern = new RegExp(pattern.source, pattern.flags.replace(/g/g, ''))
    const match = safePattern.exec(value)
    if (!match || typeof match.index !== 'number') continue
    if (cutIndex < 0 || match.index < cutIndex) {
      cutIndex = match.index
    }
  }
  return cutIndex >= 0 ? value.slice(0, cutIndex).trim() : value
}

function isInvalidLocationText(value: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(value || '')
  if (!normalized) return true
  if (/^(yes|no|n\/a|na)$/i.test(normalized)) return true
  if (/^photo\s+\d+(?:\s+photo\s+\d+)*$/i.test(normalized)) return true
  if (/(?:alarm\s+panel\s+photo|emergency\s+lighting\s+switch\s+photo)/i.test(normalized)) return true
  if (/^location\s+of\s+(?:fire\s+panel|emergency\s+lighting\s+test\s+switch)/i.test(normalized)) return true
  if (/(?:action\s+plan\s+sign\s+off|actions?\s+by\s+the\s+set\s+due\s+date|sign\s+off\s+and\s+acceptance|due\s+date\s+to\s+resolve\/complete|signature\s+of\s+person\s+in\s+charge)/i.test(normalized)) return true
  if (/(?:records?\s+available\s+on\s+site|recorded\s+on\s+zipline|weekly\s+fire\s+(?:tests?|alarm\s+testing)|fire\s+drill\s+has\s+been\s+carried\s+out|evidence\s+of\s+monthly\s+emergency\s+lighting\s+test)/i.test(normalized)) return true
  return false
}

function isLikelyLocationText(value: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(value || '')
  if (!normalized || isInvalidLocationText(normalized)) return false
  if (normalized.length < 3) return false
  if (normalized.length > 90) return false
  return /(?:rear|front|side|stock(?:room)?|fire\s+door|door|alarm\s*panel|panel|cupboard|electrical|entrance|exit|stair|corridor|office|room|wall|next to|beside|by\s+(?:alarm|panel|rear|fire|door|exit|stock|office|stairs?|corridor|electrical|cupboard))/i.test(normalized)
}

function sanitizeExtractedValue(
  value: string | null | undefined,
  options?: { asLocation?: boolean }
): string | null {
  if (!value) return null
  const boundaryTrimmed = splitBeforeNextQuestionBoundary(normalizeWhitespace(value)).before
  let cleaned = normalizeWhitespace(
    boundaryTrimmed
      .replace(/\bPhoto\s+\d+(?:\s+Photo\s+\d+)*/gi, ' ')
      .replace(/\b(?:Alarm Panel Photo|Emergency Lighting Switch Photo)\b/gi, ' ')
      .replace(/\([^)]*photograph[^)]*\)/gi, ' ')
      .replace(/\bphotograph\b/gi, ' ')
  )
  cleaned = cutAtEarliestPattern(cleaned, TRAILING_CONTAMINATION_PATTERNS)
  cleaned = normalizeWhitespace(cleaned.replace(/^[:\-–\s]+/, '').replace(/[.]+$/, ''))
  if (!cleaned) return null
  if (options?.asLocation) {
    cleaned = cutAtEarliestPattern(cleaned, [/\b(?:yes|no|n\/a|na)\b/i])
    cleaned = normalizeWhitespace(cleaned)
    if (!cleaned) return null
    if (!isLikelyLocationText(cleaned) || isInvalidLocationText(cleaned)) {
      return null
    }
  }
  return cleaned
}

function parseYesNoQuestionBlock(
  text: string,
  questionRegex: RegExp
): ParsedYesNoQuestion {
  const safeRegex = new RegExp(questionRegex.source, questionRegex.flags.replace(/g/g, ''))
  const questionMatch = safeRegex.exec(text)
  if (!questionMatch || questionMatch.index === undefined) {
    return { answer: null, comment: null }
  }

  const lines = normalizeLines(text)
  const anchorLineIndex = text.slice(0, questionMatch.index).split(/\r\n?|\n/).length - 1
  let answer: ParsedYesNoQuestion['answer'] = null
  const commentParts: string[] = []

  for (let i = anchorLineIndex + 1; i < lines.length && i <= anchorLineIndex + 18; i += 1) {
    const rawLine = normalizeWhitespace(lines[i])
    const { before, hitBoundary } = splitBeforeNextQuestionBoundary(rawLine)
    const line = before
    if (!line) continue
    if (isPhotoOnlyLine(line)) continue
    if (isSectionHeadingLine(line)) break
    if (i > anchorLineIndex + 1 && isLikelyNewQuestionLine(line)) break

    const standaloneAnswer = line.match(/^(yes|no|n\/a|na)$/i)
    if (standaloneAnswer) {
      const raw = standaloneAnswer[1].toLowerCase()
      answer = raw === 'yes' ? 'yes' : raw === 'no' ? 'no' : 'na'
      break
    }

    const leadingAnswer = line.match(/^(yes|no|n\/a|na)\b(?:\s*[:\-]\s*(.*))?$/i)
    if (leadingAnswer) {
      const raw = leadingAnswer[1].toLowerCase()
      answer = raw === 'yes' ? 'yes' : raw === 'no' ? 'no' : 'na'
      if (leadingAnswer[2]) commentParts.push(leadingAnswer[2])
      break
    }

    commentParts.push(line)
    if (hitBoundary) break
  }

  const comment = sanitizeExtractedValue(
    commentParts
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )

  return {
    answer,
    comment: comment || null,
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function extractDateFromText(value: string): string | null {
  return extractAuditDateFromText(value)
}

function isLikelyGeneralSiteLabel(value: string): boolean {
  const lower = normalizeWhitespace(value).toLowerCase()
  if (!lower) return false
  return [
    'general site information',
    'number of floors',
    'square footage',
    'number of fire exits',
    'number of staff',
    'maximum number of staff',
    'number of young persons',
    'any know enforcement action',
    'any known enforcement action',
    'health and safety policy',
    'risk assessments',
    'training',
    'statutory testing',
    'fire safety',
  ].some((label) => lower.startsWith(label))
}

function extractNumericAfterLabel(text: string, labelRegex: RegExp): string | null {
  const sameLineRegex = new RegExp(`${labelRegex.source}[^\\n\\r]*`, 'i')
  const sameLine = text.match(sameLineRegex)?.[0] || null
  if (sameLine) {
    const trailingNumber = sameLine.match(/(\d+)\s*$/)?.[1] || null
    if (trailingNumber) return trailingNumber
  }

  const blockRegex = new RegExp(`${labelRegex.source}[\\s\\S]{0,160}`, 'i')
  const block = text.match(blockRegex)?.[0] || null
  if (!block) return null

  const lines = block
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const labelIndex = lines.findIndex((line) => labelRegex.test(line))
  if (labelIndex < 0) return null

  for (let i = labelIndex + 1; i < lines.length && i <= labelIndex + 3; i += 1) {
    const line = lines[i]
    if (isLikelyGeneralSiteLabel(line)) break
    const numeric = line.match(/^(\d+)\b/)?.[1] || null
    if (numeric) return numeric
  }

  return null
}

function isValidSquareFootageValue(value: string): boolean {
  const cleaned = normalizeWhitespace(value).replace(/^[:\-–]\s*/, '')
  if (!cleaned) return false
  if (/^(n\/a|na|none|nil|not applicable|not provided|—|-)$/.test(cleaned.toLowerCase())) return false
  if (!/\d/.test(cleaned)) return false
  if (isLikelyGeneralSiteLabel(cleaned)) return false
  if (/number of fire exits|number of staff|maximum number of staff|young persons|enforcement action/i.test(cleaned)) return false

  return /^(\d[\d,]*(?:\.\d+)?)\s*(sq\s*ft|sq\s*m|m²|ft²|square\s*(feet|meters|metres))?$/i.test(cleaned)
}

function extractSquareFootageAfterLabel(text: string): string | null {
  const labelRegex = /square footage or square meterage of site/i
  const sameLine = text.match(/square footage or square meterage of site[^\n\r]*/i)?.[0] || null
  if (sameLine) {
    const candidate = normalizeWhitespace(sameLine.replace(labelRegex, ''))
    if (isValidSquareFootageValue(candidate)) {
      return candidate
    }
  }

  const block = text.match(/square footage or square meterage of site[\s\S]{0,200}/i)?.[0] || null
  if (!block) return null

  const lines = block
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const labelIndex = lines.findIndex((line) => labelRegex.test(line))
  if (labelIndex < 0) return null

  for (let i = labelIndex + 1; i < lines.length && i <= labelIndex + 4; i += 1) {
    const line = normalizeWhitespace(lines[i]).replace(/^[:\-–]\s*/, '')
    if (isLikelyGeneralSiteLabel(line)) break
    if (isValidSquareFootageValue(line)) return line
  }

  return null
}

/**
 * Get the most recent H&S audit for a store to use as source data for FRA
 * Also checks for uploaded H&S audit PDFs
 */
export async function getLatestHSAuditForStore(storeId: string, fraInstanceId?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // FRA uses ONLY uploaded PDF text - not database H&S audits
  // Get the parsed PDF text from the uploaded H&S audit PDF
  let pdfText: string | null = null
  if (fraInstanceId) {
    // Get the FRA instance to find its template_id
    const { data: fraInstance } = await supabase
      .from('tfs_audit_instances')
      .select('template_id')
      .eq('id', fraInstanceId)
      .single()

    if (fraInstance?.template_id) {
      // Try to get parsed PDF text from the FRA instance's response_json
      // First, try normal first section/question
      const { data: sections } = await supabase
        .from('tfs_audit_template_sections')
        .select('id, title')
        .eq('template_id', fraInstance.template_id)
        .order('order_index', { ascending: true })
      
      console.log('[FRA] Found sections for template:', sections?.length || 0)
      
      let pdfTextQuestionId: string | null = null
      
      // Try to find PDF text in any section/question
      if (sections && sections.length > 0) {
        for (const section of sections) {
          const { data: questions } = await supabase
            .from('tfs_audit_template_questions')
            .select('id')
            .eq('section_id', section.id)
            .order('order_index', { ascending: true })
          
          if (questions && questions.length > 0) {
            // Check each question for PDF text
            for (const question of questions) {
              const { data: response } = await supabase
                .from('tfs_audit_responses')
                .select('response_json')
                .eq('audit_instance_id', fraInstanceId)
                .eq('question_id', question.id)
                .maybeSingle()
              
              const fraPdfText = response?.response_json?.fra_pdf_text
              if (fraPdfText) {
                pdfText = fraPdfText
                console.log('[FRA] ✓ Found PDF text in question:', question.id, 'section:', section.title, 'length:', fraPdfText.length)
                break
              }
            }
            if (pdfText) break
          }
        }
      }
      
      // If not found, try the first section/question approach (for backward compatibility)
      if (!pdfText) {
        const firstSection = sections && sections.length > 0 ? sections[0] : null

        if (firstSection) {
          const { data: firstQuestion } = await supabase
            .from('tfs_audit_template_questions')
            .select('id')
            .eq('section_id', firstSection.id)
            .order('order_index', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (firstQuestion) {
          console.log('[FRA] Looking for PDF text in response for question:', firstQuestion.id, 'instance:', fraInstanceId)
          
          // First, check if ANY response exists for this instance/question
          const { data: allResponses, error: checkError } = await supabase
            .from('tfs_audit_responses')
            .select('id, question_id, response_json')
            .eq('audit_instance_id', fraInstanceId)
          
          console.log('[FRA] All responses for instance:', allResponses?.length || 0, 'error:', checkError?.message)
          if (allResponses && allResponses.length > 0) {
            console.log('[FRA] Response question IDs:', allResponses.map((r: any) => r.question_id))
          }
          
          const { data: response, error: responseError } = await supabase
            .from('tfs_audit_responses')
            .select('response_json')
            .eq('audit_instance_id', fraInstanceId)
            .eq('question_id', firstQuestion.id)
            .maybeSingle()

          if (responseError) {
            console.error('[FRA] Error retrieving PDF text:', responseError)
          } else if (response) {
            console.log('[FRA] Found response, checking for fra_pdf_text. Response keys:', Object.keys(response.response_json || {}))
            console.log('[FRA] Response JSON type:', typeof response.response_json)
            const fraPdfTextFromResponse = response?.response_json?.fra_pdf_text
            if (fraPdfTextFromResponse) {
              pdfText = fraPdfTextFromResponse
              console.log('[FRA] ✓ Retrieved parsed PDF text, length:', fraPdfTextFromResponse.length)
            } else {
              const responseJsonStr = JSON.stringify(response.response_json || {})
              console.log('[FRA] ✗ No fra_pdf_text in response_json. Response JSON (first 500 chars):', responseJsonStr.substring(0, 500))
              // Check if it's stored under a different key
              if (response.response_json) {
                const keys = Object.keys(response.response_json)
                console.log('[FRA] Available keys in response_json:', keys)
              }
            }
          } else {
            console.log('[FRA] ✗ No response found for question:', firstQuestion.id, 'instance:', fraInstanceId)
            // Try to find ANY response with fra_pdf_text - search all responses for this instance
            console.log('[FRA] Searching all responses for this instance to find fra_pdf_text...')
            const { data: allResponsesForInstance } = await supabase
              .from('tfs_audit_responses')
              .select('question_id, response_json')
              .eq('audit_instance_id', fraInstanceId)
            
            if (allResponsesForInstance && allResponsesForInstance.length > 0) {
              console.log('[FRA] Found', allResponsesForInstance.length, 'responses for this instance')
              // Check each response for fra_pdf_text
              for (const resp of allResponsesForInstance) {
                const text = resp.response_json?.fra_pdf_text
                if (text) {
                  pdfText = text
                  console.log('[FRA] ✓ Found PDF text in question:', resp.question_id, 'length:', text.length)
                  break
                }
              }
              if (!pdfText) {
                console.log('[FRA] ✗ Checked all', allResponsesForInstance.length, 'responses, none contain fra_pdf_text')
                // Log what keys are actually in the responses
                allResponsesForInstance.forEach((resp: any) => {
                  const keys = Object.keys(resp.response_json || {})
                  console.log('[FRA] Question', resp.question_id, 'has keys:', keys)
                })
              }
            } else {
              console.log('[FRA] ✗ No responses found for this instance at all')
            }
          }
          } else {
            console.log('[FRA] ✗ No first question found')
          }
        } else {
          console.log('[FRA] No first section found for template:', fraInstance?.template_id)
        }
      }
      
      // If still not found, search ALL responses for this instance
      if (!pdfText) {
        console.log('[FRA] Searching all responses for this instance to find fra_pdf_text...')
        const { data: allResponsesForInstance } = await supabase
          .from('tfs_audit_responses')
          .select('question_id, response_json')
          .eq('audit_instance_id', fraInstanceId)
        
        if (allResponsesForInstance && allResponsesForInstance.length > 0) {
          console.log('[FRA] Found', allResponsesForInstance.length, 'responses for this instance')
          // Check each response for fra_pdf_text
          for (const resp of allResponsesForInstance) {
            const text = resp.response_json?.fra_pdf_text
            if (text) {
              pdfText = text
              console.log('[FRA] ✓ Found PDF text in question:', resp.question_id, 'length:', text.length)
              break
            }
          }
          if (!pdfText) {
            console.log('[FRA] ✗ Checked all', allResponsesForInstance.length, 'responses, none contain fra_pdf_text')
            // Log what keys are actually in the responses
            allResponsesForInstance.forEach((resp: any) => {
              const keys = Object.keys(resp.response_json || {})
              console.log('[FRA] Question', resp.question_id, 'has keys:', keys)
            })
          }
        } else {
          console.log('[FRA] ✗ No responses found for this instance at all')
        }
      }
    } else {
      console.log('[FRA] No FRA instance or template_id found')
    }
  }

  // FRA doesn't use database H&S audits - only uploaded PDF
  // Return null for audit, only PDF text
  return {
    audit: null,
    pdfText
  }
}

/**
 * Map H&S audit data to FRA report structure
 */
export async function mapHSAuditToFRAData(fraInstanceId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Get the FRA audit instance
  const fraInstance = await getAuditInstance(fraInstanceId)
  
  if (!fraInstance || (fraInstance.tfs_audit_templates as any)?.category !== 'fire_risk_assessment') {
    throw new Error('Invalid FRA audit instance')
  }

  const store = fraInstance.tfs_stores as any
  const storeId = store.id

  // Check for saved custom data and edited extracted data (from review page)
  const { data: sections } = await supabase
    .from('tfs_audit_template_sections')
    .select('id')
    .eq('template_id', fraInstance.template_id)
    .order('order_index', { ascending: true })

  let customData: any = null
  let editedExtractedData: any = null

  if (sections && sections.length > 0) {
    const firstSection = sections[0]
    const { data: firstQuestion } = await supabase
      .from('tfs_audit_template_questions')
      .select('id')
      .eq('section_id', firstSection.id)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstQuestion) {
      const { data: customResponses } = await supabase
        .from('tfs_audit_responses')
        .select('response_json, created_at')
        .eq('audit_instance_id', fraInstanceId)
        .eq('question_id', firstQuestion.id)
        .order('created_at', { ascending: false })
        .limit(1)

      const customResponse = customResponses?.[0] ?? null

      if (customResponse?.response_json) {
        if (customResponse.response_json.fra_custom_data) {
          customData = customResponse.response_json.fra_custom_data
        }
        if (customResponse.response_json.fra_extracted_data) {
          editedExtractedData = customResponse.response_json.fra_extracted_data
        }
      }
    }
  }

  // Fallback scan for custom and extracted metadata across any response row.
  // This handles legacy/duplicate response rows where metadata may not be on the
  // template's first question.
  if (!customData || !editedExtractedData) {
    const { data: allResponses } = await supabase
      .from('tfs_audit_responses')
      .select('response_json, created_at')
      .eq('audit_instance_id', fraInstanceId)
      .order('created_at', { ascending: false })

    for (const row of allResponses || []) {
      if (!customData && row?.response_json?.fra_custom_data) {
        customData = row.response_json.fra_custom_data
      }
      if (!editedExtractedData && row?.response_json?.fra_extracted_data) {
        editedExtractedData = row.response_json.fra_extracted_data
      }
      if (customData && editedExtractedData) break
    }
  }

  // Get the most recent H&S audit for this store (check for uploaded PDFs too)
  const hsAuditResult = await getLatestHSAuditForStore(storeId, fraInstanceId)
  const hsAudit = hsAuditResult.audit
  const pdfText = hsAuditResult.pdfText
  
  // Extract data from PDF text if available
  let pdfExtractedData: Record<string, string | null> = {}
  if (pdfText) {
    const parserVariant = await ensureLockedFraParserVariant({
      supabase,
      instanceId: fraInstanceId,
      userId: user.id,
      pdfText,
    })
    console.log('[FRA] Extracting data from PDF text, length:', pdfText.length, 'variant:', parserVariant)
    pdfExtractedData = extractFraPdfDataFromText(pdfText, { variant: parserVariant }) as Record<string, string | null>
    console.log('[FRA] Final PDF Extracted Data:', pdfExtractedData)
  }

  // AI summarization of H&S audit PDF for FRA (when OpenAI is configured)
  let aiSummaries: Awaited<ReturnType<typeof summarizeHSAuditForFRA>> = null
  if (pdfText && pdfText.length > 200) {
    try {
      aiSummaries = await summarizeHSAuditForFRA(pdfText, { premisesName: store?.store_name })
      if (aiSummaries) {
        console.log('[FRA] ✓ AI summaries generated:', Object.keys(aiSummaries).filter(k => aiSummaries![k as keyof typeof aiSummaries]))
      }
    } catch (err) {
      console.error('[FRA] AI summarization failed:', err)
    }
  }

  // Debug logging - comprehensive
  console.log('[FRA] ===== H&S AUDIT DEBUG =====')
  console.log('[FRA] H&S Audit found:', !!hsAudit)
  console.log('[FRA] PDF Text found:', !!pdfText, pdfText ? `(${pdfText.length} chars)` : '')
  if (hsAudit) {
    console.log('[FRA] H&S Audit ID:', (hsAudit as any).id)
    console.log('[FRA] H&S Audit conducted_at:', (hsAudit as any).conducted_at)
    console.log('[FRA] H&S Audit template_id:', (hsAudit as any).template_id)
    console.log('[FRA] H&S Audit template (nested):', (hsAudit as any).tfs_audit_templates)
    console.log('[FRA] H&S Audit responses count:', (hsAudit as any)?.responses?.length ?? 0)
  } else {
    console.log('[FRA] No H&S audit found for store:', storeId)
  }
  console.log('[FRA] ==========================')

  // Helper to get answer from H&S audit responses
  const getHSAnswer = (questionText: string): any => {
    const audit = hsAudit as any
    if (!audit?.responses) return null
    
    // Find question by text match (case-insensitive, partial)
    const question = audit.responses.find((r: any) => {
      // We need to get the question text from the question_id
      // For now, we'll search by section and question patterns
      return false // Will be enhanced with question lookup
    })
    
    return null
  }

  // Helper to get answer by section/question pattern
  const getAnswerBySection = (sectionTitle: string, questionPattern: string): any => {
    if (!hsAudit) return null
    
    // This is a simplified version - in production, we'd need to fetch the template
    // and match questions properly. For now, we'll extract from responses.
    return null
  }

  // Extract data from H&S audit responses
  // We'll need to fetch the template to match questions properly
  // If we have an H&S audit, get its template
  let hsTemplateData = null
  if (hsAudit) {
    const templateId = (hsAudit as any).template_id || (hsAudit as any).tfs_audit_templates?.id
    if (templateId) {
      const { data: sections } = await supabase
        .from('tfs_audit_template_sections')
        .select(`
          *,
          tfs_audit_template_questions (*)
        `)
        .eq('template_id', templateId)
        .order('order_index', { ascending: true })

      if (sections) {
        hsTemplateData = { sections }
        console.log('[FRA] Template sections loaded:', sections.length)
        const totalQuestions = sections.reduce((sum, s) => sum + ((s as any).tfs_audit_template_questions?.length || 0), 0)
        console.log('[FRA] Total questions in template:', totalQuestions)
      } else {
        console.log('[FRA] No sections found for template:', templateId)
      }
    } else {
      console.log('[FRA] No template_id found in H&S audit. Audit structure:', Object.keys(hsAudit))
    }
  } else {
    console.log('[FRA] No H&S audit found for store:', storeId)
  }

  // Helper to find answer by question text pattern (from database responses)
  const findAnswer = (questionPattern: string): { value: any; comment?: string } | null => {
    const audit = hsAudit as any
    if (!audit?.responses || !hsTemplateData) {
      return null
    }

    // Normalize pattern for matching
    const normalizedPattern = questionPattern.toLowerCase().trim()
    let matchCount = 0
    
    // Find question matching pattern - try exact match first, then partial
    for (const section of hsTemplateData.sections) {
      const questions = (section as any).tfs_audit_template_questions || []
      for (const question of questions) {
        const questionText = question.question_text?.toLowerCase() || ''
        
        // For operating/trading hours, only match questions that are clearly about hours (avoid e.g. "door left open during trading hours" comment)
        const hoursPatterns = ['operating hours', 'trading hours', 'opening hours', 'store hours']
        const isHoursQuery = hoursPatterns.some(p => normalizedPattern === p || normalizedPattern.includes(p))
        const looksLikeHoursQuestion = /^(operating|trading|opening|store)\s+hours|^(when|what)\s+are\s+(?:the\s+)?(?:operating|trading|opening|store)\s+hours/i.test(questionText.slice(0, 120))
        if (isHoursQuery && !looksLikeHoursQuestion) {
          // Skip this question - it matched "hours" but isn't the actual hours question
          continue
        }

        // Try exact match first, then partial match (check if pattern is contained in question text)
        if (questionText === normalizedPattern || questionText.includes(normalizedPattern) || normalizedPattern.includes(questionText)) {
          matchCount++
          const response = audit.responses.find((r: any) => r.question_id === question.id)
          if (response) {
            const responseValue = response.response_value || response.response_json
            const responseComment = typeof response.response_json === 'object' && response.response_json?.comment
              ? response.response_json.comment
              : undefined
            
            console.log(`[FRA] findAnswer("${questionPattern}"): Found match!`, {
              questionText: question.question_text,
              questionId: question.id,
              responseValue,
              responseComment,
              hasValue: responseValue !== null && responseValue !== undefined && responseValue !== ''
            })
            
            // Only return if we have actual data
            if (responseValue !== null && responseValue !== undefined && responseValue !== '') {
              return {
                value: responseValue,
                comment: responseComment
              }
            } else if (responseComment) {
              return {
                value: null,
                comment: responseComment
              }
            }
          } else {
            console.log(`[FRA] findAnswer("${questionPattern}"): Question matched but no response found`, {
              questionText: question.question_text,
              questionId: question.id
            })
          }
        }
      }
    }
    
    if (matchCount === 0) {
      console.log(`[FRA] findAnswer("${questionPattern}"): No matching questions found`)
    }
    
    return null
  }

  // Extract specific data points - prioritize edited data, then PDF text, then database responses
  const generalSiteInfo = editedExtractedData?.numberOfFloors
    ? { value: editedExtractedData.numberOfFloors, comment: undefined }
    : pdfExtractedData.numberOfFloors 
      ? { value: pdfExtractedData.numberOfFloors, comment: undefined }
      : findAnswer('Number of floors')
        || findAnswer('floors')
        || findAnswer('number of floors')
  const fireExits = findAnswer('Number of Fire Exits')
  const staffCount = findAnswer('Number of Staff employed')
  const maxStaff = findAnswer('Maximum number of staff working')
  const youngPersons = findAnswer('Young persons')
  const buildDateAnswer = findAnswer('Approx. build date') || findAnswer('build date')
  const enforcementAction = findAnswer('enforcement action')
  const fireDrillAnswer = findAnswer('Fire drill has been carried out') || findAnswer('fire drill')
  const patTestingAnswer = findAnswer('PAT testing') || findAnswer('portable appliance testing')
  const fixedWireAnswer = findAnswer('Fixed wire') || findAnswer('Fixed wiring') || findAnswer('fixed wire installation')
  const exitSignageAnswer = findAnswer('Exit signage') || findAnswer('fire exit sign')
  const compartmentationAnswer = findAnswer('compartmentation') || findAnswer('ceiling tile')
  const callPointsAnswer = findAnswer('call points clear') || findAnswer('call point')
  const squareFootage = editedExtractedData?.squareFootage
    ? { value: editedExtractedData.squareFootage, comment: undefined }
    : pdfExtractedData.squareFootage
      ? { value: pdfExtractedData.squareFootage, comment: undefined }
      : findAnswer('Square Footage') || findAnswer('Square Meterage')
  
  // Store manager name from signature - prioritize edited data, then PDF, then database
  const storeManagerName = editedExtractedData?.storeManager
    ? { value: editedExtractedData.storeManager, comment: undefined }
    : pdfExtractedData.storeManager
      ? { value: pdfExtractedData.storeManager, comment: undefined }
      : findAnswer('Store Manager Name') 
        || findAnswer('Store Manager')
        || findAnswer('Manager Name')
  const storeManagerSignature = findAnswer('Signature of Person in Charge of store at time of assessment')
    || findAnswer('Signature of Person in Charge')
    || findAnswer('Person in Charge')
    || findAnswer('signature of person in charge')
    || findAnswer('person in charge')
  
  // Debug logging
  console.log('[FRA] ===== STORE MANAGER DEBUG =====')
  console.log('[FRA] Store Manager Name found:', !!storeManagerName)
  if (storeManagerName) {
    console.log('[FRA] Store Manager Name value:', storeManagerName.value)
    console.log('[FRA] Store Manager Name comment:', storeManagerName.comment)
  }
  console.log('[FRA] Store Manager Signature found:', !!storeManagerSignature)
  if (storeManagerSignature) {
    console.log('[FRA] Store Manager Signature value:', storeManagerSignature.value)
    console.log('[FRA] Store Manager Signature comment:', storeManagerSignature.comment)
    console.log('[FRA] Store Manager Signature value type:', typeof storeManagerSignature.value)
  }
  console.log('[FRA] ===============================')
  
  // Extract name from signature if it's a structured object
  let extractedManagerName: string | null = null
  if (storeManagerSignature) {
    const sigValue = storeManagerSignature.value
    const sigComment = storeManagerSignature.comment
    // Check if it's a JSON object with name field
    if (typeof sigValue === 'object' && sigValue !== null) {
      extractedManagerName = (sigValue as any).name || (sigValue as any).signature_name || null
    } else if (typeof sigValue === 'string' && sigValue.length > 0) {
      // Try to extract name from string (might be formatted as "Name - Date" or "Name **")
      const nameMatch = sigValue.match(/^([^*–-]+)/)
      if (nameMatch) {
        extractedManagerName = nameMatch[1].trim().replace(/\*\*/g, '').trim()
      }
    }
    // Also check comment field
    if (!extractedManagerName && sigComment) {
      const commentMatch = sigComment.match(/^([^*–-]+)/)
      if (commentMatch) {
        extractedManagerName = commentMatch[1].trim().replace(/\*\*/g, '').trim()
      }
    }
  }
  
  // Use PDF extracted manager name if available
  if (pdfExtractedData.storeManager && !extractedManagerName) {
    extractedManagerName = pdfExtractedData.storeManager
  }
  
  console.log('[FRA] Extracted Manager Name:', extractedManagerName)
  
  // Try to find occupancy calculation data
  const occupancyData = findAnswer('occupancy') || findAnswer('capacity')

  const SQFT_PER_M2 = 10.7639
  const STANDARD_SQFT_PER_PERSON = 60
  const PEAK_SQFT_PER_PERSON = 30

  /** Parse floor area string to sq ft. Supports "4,941 sq ft", "650 m²", and unitless values. */
  const parseFloorAreaSqFt = (s: string | null | undefined): number | null => {
    if (!s || typeof s !== 'string') return null

    const trimmed = s.trim()
    const numericToken = trimmed.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
    if (!numericToken) return null

    const numericValue = parseFloat(numericToken[1])
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null

    const hasSqFtUnit = /\b(?:sq\.?\s*ft|sqft|ft2|ft²|square\s*feet)\b/i.test(trimmed)
    const hasM2Unit = /\b(?:m²|m2|sq\.?\s*m|sqm|square\s*met(?:re|er)s?)\b/i.test(trimmed)

    if (hasSqFtUnit) return numericValue
    if (hasM2Unit) return numericValue * SQFT_PER_M2

    // Heuristic for unitless values: smaller values tend to be m², larger values tend to be sq ft.
    return numericValue <= 1000 ? numericValue * SQFT_PER_M2 : numericValue
  }

  const formatRetailOccupancyFromSqFt = (floorAreaSqFt: number): string => {
    const areaRounded = Math.round(floorAreaSqFt)
    const standardPeople = Math.round(floorAreaSqFt / STANDARD_SQFT_PER_PERSON)
    const peakPeople = Math.round(floorAreaSqFt / PEAK_SQFT_PER_PERSON)
    const areaLabel = areaRounded.toLocaleString('en-GB')

    return [
      `Standard (60 sq ft/person): ${areaLabel} sq ft ÷ 60 = ~${standardPeople} people`,
      `Peak (30 sq ft/person): ${areaLabel} sq ft ÷ 30 = ~${peakPeople} people`,
    ].join('\n')
  }

  const hasCustomOccupancy = !!customData?.occupancy?.trim()
  const defaultOccupancyText = 'To be calculated based on floor area'

  // Load persisted store metadata when available.
  const { data: persistedStoreData } = await supabase
    .from('tfs_stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle()

  const storedOpeningTimesRaw = typeof persistedStoreData?.opening_times === 'string'
    ? persistedStoreData.opening_times.trim()
    : null
  const storedBuildDateRaw = typeof persistedStoreData?.build_date === 'string'
    ? persistedStoreData.build_date.trim()
    : null
  const storedBuildDate = storedBuildDateRaw && storedBuildDateRaw !== '2009'
    ? storedBuildDateRaw
    : null

  const normalizeCustomText = (value: unknown, placeholders: RegExp[]): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (placeholders.some((pattern) => pattern.test(trimmed))) return null
    return trimmed
  }

  const OPENING_DAY_ORDER = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const

  const toDisplayDay = (day: string): string =>
    day.charAt(0).toUpperCase() + day.slice(1).toLowerCase()

  const normalizeHoursLabel = (value: string): string => {
    const cleaned = normalizeWhitespace(String(value || '').replace(/[–—]/g, '-'))
    if (!cleaned) return ''
    if (/^closed$/i.test(cleaned)) return 'Closed'
    if (/^open\s*24\s*hours$/i.test(cleaned)) return 'Open 24 hours'
    return cleaned.replace(/\s*-\s*/g, ' - ')
  }

  const formatOpeningTimesMap = (map: Record<string, unknown>): string | null => {
    type OpeningDay = typeof OPENING_DAY_ORDER[number]
    const entries: Array<{ day: OpeningDay; hours: string }> = []
    for (const day of OPENING_DAY_ORDER) {
      const value = map[day] ?? map[toDisplayDay(day)] ?? map[day.slice(0, 3)]
      if (typeof value !== 'string') continue
      const hours = normalizeHoursLabel(value)
      if (!hours) continue
      entries.push({ day, hours })
    }

    if (!entries.length) return null

    const groups: Array<{ start: string; end: string; hours: string }> = []
    for (const entry of entries) {
      const previous = groups[groups.length - 1]
      if (previous && previous.hours === entry.hours) {
        previous.end = entry.day
      } else {
        groups.push({ start: entry.day, end: entry.day, hours: entry.hours })
      }
    }

    return groups
      .map((group) => {
        const label = group.start === group.end
          ? toDisplayDay(group.start)
          : `${toDisplayDay(group.start)} to ${toDisplayDay(group.end)}`
        return `${label}: ${group.hours}`
      })
      .join('; ')
  }

  const normalizeOpeningTimesText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = normalizeWhitespace(value)
    if (!trimmed) return null
    if (/^\{[\s\S]*\}$/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const formatted = formatOpeningTimesMap(parsed as Record<string, unknown>)
          if (formatted) return formatted
        }
      } catch {
        // fall through
      }
    }
    return trimmed
  }

  const storedOpeningTimes = normalizeOpeningTimesText(storedOpeningTimesRaw)

  const scoreOpeningTimes = (value: string | null | undefined): number => {
    const normalized = normalizeWhitespace(value || '')
    if (!normalized) return -100
    if (!/\d/.test(normalized)) return -100
    if (!/(am|pm|\d{1,2}:\d{2})/i.test(normalized)) return -40

    let score = 0
    if (/(monday\s+to\s+saturday|mon(?:day)?\s*-\s*sat(?:urday)?)/i.test(normalized)) score += 45
    if (/sunday/i.test(normalized)) score += 20
    if (/\d{1,2}:\d{2}/.test(normalized)) score += 20
    if (/\d{1,2}\s*(am|pm)/i.test(normalized)) score += 10
    if (/[;|]/.test(normalized)) score += 10
    if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(normalized)) score += 12

    const dayEntries = normalized.match(
      /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b[^,;|]*/gi
    ) || []
    if (dayEntries.length >= 6) {
      const ranges = dayEntries
        .map((entry) => {
          const range = entry.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)
          return range ? normalizeWhitespace(range[1].toLowerCase()) : ''
        })
        .filter(Boolean)
      const uniqueRanges = new Set(ranges)
      if (ranges.length >= 6 && uniqueRanges.size <= 1) {
        score -= 35
      }
    }

    return score
  }

  const pickPreferredOpeningTimes = (
    ...candidates: Array<string | null | undefined>
  ): string | null => {
    const valid = candidates
      .map((candidate) => (typeof candidate === 'string' ? normalizeWhitespace(candidate) : ''))
      .filter(Boolean)
    if (!valid.length) return null

    const unique = Array.from(new Set(valid))
    const ranked = unique
      .map((value) => ({ value, score: scoreOpeningTimes(value) }))
      .sort((a, b) => b.score - a.score)

    const best = ranked[0]
    return best && best.score >= 20 ? best.value : null
  }

  const customBuildDate = normalizeCustomText(customData?.buildDate, [
    /^to\s+be\s+confirmed$/i,
    /^unknown$/i,
    /^n\/a$/i,
    /^na$/i,
  ])
  const customFloorArea = normalizeCustomText(customData?.floorArea, [
    /^to\s+be\s+confirmed$/i,
    /^unknown$/i,
    /^n\/a$/i,
    /^na$/i,
  ])
  const customOperatingHoursRaw = normalizeCustomText(customData?.operatingHours, [
    /^to\s+be\s+confirmed$/i,
    /^unknown$/i,
    /^n\/a$/i,
    /^na$/i,
  ])
  const customOperatingHours = normalizeOpeningTimesText(customOperatingHoursRaw) || customOperatingHoursRaw
  const customAdjacentOccupancies = normalizeCustomText(customData?.adjacentOccupancies, [
    /^see\s+description$/i,
    /^to\s+be\s+confirmed$/i,
    /^unknown$/i,
    /^n\/a$/i,
    /^na$/i,
  ])

  const extractedFloorAreaCandidate = squareFootage?.value || squareFootage?.comment || null
  const extractedFloorAreaSqFt = parseFloorAreaSqFt(extractedFloorAreaCandidate)
  const isWeakExtractedFloorArea =
    !!extractedFloorAreaCandidate
    && extractedFloorAreaSqFt != null
    && extractedFloorAreaSqFt < 500
  const isPossiblyOverstatedExtractedFloorArea =
    !!extractedFloorAreaCandidate
    && extractedFloorAreaSqFt != null
    && extractedFloorAreaSqFt > 13000

  const storedOpeningTimesScore = scoreOpeningTimes(storedOpeningTimes)
  const storedOpeningTimesIsLowConfidence = !!storedOpeningTimes && storedOpeningTimesScore < 35

  const needsOpeningSearch = !customOperatingHours
    && !editedExtractedData?.operatingHours
    && !pdfExtractedData.operatingHours
    && (!storedOpeningTimes || storedOpeningTimesIsLowConfidence)
  const needsBuildSearch = !customBuildDate && !storedBuildDate
  const needsFloorAreaSearch = !customFloorArea && (
    !extractedFloorAreaCandidate
    || isWeakExtractedFloorArea
    || isPossiblyOverstatedExtractedFloorArea
  )
  const needsAdjacentSearch = !customAdjacentOccupancies

  // Google-first search for store profile data when values are missing.
  let googleSearchData: { openingTimes: string | null; buildDate: string | null; adjacentOccupancies: string | null; squareFootage: string | null } = {
    openingTimes: null,
    buildDate: null,
    adjacentOccupancies: null,
    squareFootage: null,
  }
  const needsSearch = needsOpeningSearch || needsBuildSearch || needsFloorAreaSearch || needsAdjacentSearch
  if (needsSearch && store) {
    googleSearchData = await getStoreDataFromGoogleSearch({
      storeName: store.store_name,
      address: store.address_line_1,
      city: store.city,
    })
  }

  // OpenAI fallback when Google does not return a value.
  let openingHoursFromSearch: string | null = normalizeOpeningTimesText(googleSearchData.openingTimes) || googleSearchData.openingTimes || null
  const openingHoursSearchScore = scoreOpeningTimes(openingHoursFromSearch)
  if ((!openingHoursFromSearch || openingHoursSearchScore < 45) && needsOpeningSearch && store) {
    const fallbackOpeningHours = await getOpeningHoursFromSearch({
      storeName: store.store_name,
      address: store.address_line_1,
      city: store.city,
    })
    openingHoursFromSearch = pickPreferredOpeningTimes(
      normalizeOpeningTimesText(openingHoursFromSearch),
      normalizeOpeningTimesText(fallbackOpeningHours),
    )
  }

  let buildDateFromSearch: string | null = googleSearchData.buildDate || null
  if (!buildDateFromSearch && needsBuildSearch && store) {
    buildDateFromSearch = await getBuildDateFromSearch({
      storeName: store.store_name,
      address: store.address_line_1,
      city: store.city,
    })
  }

  const normalizeBuildDateText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const normalized = normalizeWhitespace(value)
    if (!normalized) return null
    if (/^(to be confirmed|unknown|n\/a|na|not available|not confirmed)$/i.test(normalized)) return null
    return normalized
  }

  const auditBuildDate = normalizeBuildDateText(
    editedExtractedData?.buildDate
    || buildDateAnswer?.value
    || buildDateAnswer?.comment
  )

  const resolvedBuildDate = customBuildDate
    || auditBuildDate
    || 'Unknown / not confirmed'

  const extractedFloorAreaSource = editedExtractedData?.squareFootage
    ? 'REVIEW'
    : pdfExtractedData.squareFootage
      ? 'PDF'
      : extractedFloorAreaCandidate
        ? 'H&S_AUDIT'
        : null
  const webFloorAreaCandidate = googleSearchData.squareFootage
  const webFloorAreaSqFt = parseFloorAreaSqFt(webFloorAreaCandidate)
  const hasLargeAreaMismatch =
    extractedFloorAreaSqFt != null
    && webFloorAreaSqFt != null
    && Math.max(extractedFloorAreaSqFt, webFloorAreaSqFt) / Math.max(1, Math.min(extractedFloorAreaSqFt, webFloorAreaSqFt)) >= 1.45
  const webAppearsMorePlausibleForBranch =
    extractedFloorAreaSqFt != null
    && webFloorAreaSqFt != null
    && webFloorAreaSqFt >= 1000
    && webFloorAreaSqFt <= 13000
    && extractedFloorAreaSqFt > webFloorAreaSqFt
  const shouldPreferWebFloorArea =
    !!webFloorAreaCandidate
    && (
      !extractedFloorAreaCandidate
      || (
        extractedFloorAreaSqFt != null
        && webFloorAreaSqFt != null
        && extractedFloorAreaSqFt < 500
        && webFloorAreaSqFt >= 1000
      )
      || (
        hasLargeAreaMismatch
        && webAppearsMorePlausibleForBranch
      )
    )

  let resolvedFloorArea: string
  let resolvedFloorAreaSource: string
  if (customFloorArea) {
    resolvedFloorArea = customFloorArea
    resolvedFloorAreaSource = 'CUSTOM'
  } else if (shouldPreferWebFloorArea) {
    resolvedFloorArea = webFloorAreaCandidate || 'To be confirmed'
    resolvedFloorAreaSource = webFloorAreaCandidate ? 'WEB_SEARCH' : 'DEFAULT'
  } else if (extractedFloorAreaCandidate) {
    resolvedFloorArea = extractedFloorAreaCandidate
    resolvedFloorAreaSource = extractedFloorAreaSource || 'H&S_AUDIT'
  } else if (webFloorAreaCandidate) {
    resolvedFloorArea = webFloorAreaCandidate
    resolvedFloorAreaSource = 'WEB_SEARCH'
  } else {
    resolvedFloorArea = 'To be confirmed'
    resolvedFloorAreaSource = 'DEFAULT'
  }

  const floorAreaSqFt = parseFloorAreaSqFt(resolvedFloorArea)
  const occupancyFromFloorArea =
    !hasCustomOccupancy && floorAreaSqFt != null
      ? formatRetailOccupancyFromSqFt(floorAreaSqFt)
      : null

  const resolvedAdjacentOccupancies = customAdjacentOccupancies
    || googleSearchData.adjacentOccupancies
    || null

  const preferredAutoOpeningTimes = pickPreferredOpeningTimes(storedOpeningTimes, openingHoursFromSearch)
  const preferredAutoOpeningTimesSource = preferredAutoOpeningTimes
    ? (preferredAutoOpeningTimes === openingHoursFromSearch ? 'WEB_SEARCH' : 'DATABASE')
    : null

  // Persist discovered values for later report loads.
  const discoveredStoreFields: Record<string, string> = {}
  if (
    openingHoursFromSearch
    && (
      !storedOpeningTimes
      || storedOpeningTimesIsLowConfidence
      || scoreOpeningTimes(openingHoursFromSearch) > scoreOpeningTimes(storedOpeningTimes) + 10
    )
  ) {
    discoveredStoreFields.opening_times = normalizeOpeningTimesText(openingHoursFromSearch) || openingHoursFromSearch
  }
  if (Object.keys(discoveredStoreFields).length > 0) {
    const { error: storeUpdateError } = await supabase
      .from('tfs_stores')
      .update(discoveredStoreFields)
      .eq('id', storeId)
    if (storeUpdateError) {
      console.warn('[FRA] Could not persist discovered store fields:', storeUpdateError.message)
    }
  }

  // Try to find operating hours - prioritize edited data, then PDF, then ChatGPT search, then database
  const operatingHoursData = customOperatingHours
    ? { value: customOperatingHours, comment: undefined }
    : editedExtractedData?.operatingHours
    ? { value: normalizeOpeningTimesText(editedExtractedData.operatingHours) || editedExtractedData.operatingHours, comment: undefined }
    : pdfExtractedData.operatingHours
      ? { value: normalizeOpeningTimesText(pdfExtractedData.operatingHours) || pdfExtractedData.operatingHours, comment: undefined }
      : preferredAutoOpeningTimes
        ? { value: preferredAutoOpeningTimes, comment: undefined }
        : findAnswer('operating hours')
          || findAnswer('trading hours')
          || findAnswer('opening hours')
          || findAnswer('store hours')

  // Debug logging
  console.log('[FRA] Operating Hours found:', !!operatingHoursData, operatingHoursData?.value || operatingHoursData?.comment)

  // Fire Safety section data
  const fraAvailable = findAnswer('FRA available')
  const combustibleMaterials = findAnswer('Combustible materials are stored correctly')
  const fireDoorsClosed = findAnswer('Fire doors closed and not held open')
  const fireDoorsCondition = findAnswer('Fire doors in a good condition')
  const intumescentStrips = findAnswer('intumescent strips')
  const structureCondition = findAnswer('Structure found to be in a good condition')
  const fireExitRoutes = findAnswer('Fire exit routes clear')
  const fireExtinguishers = findAnswer('Fire Extinguishers clear')
  const callPoints = findAnswer('call points clear')
  const weeklyFireTests = findAnswer('Weekly Fire Tests')
  const fireDrill = findAnswer('Fire drill has been carried out')
  const emergencyLighting = findAnswer('Emergency Lighting test')
  const sprinklerClearance = findAnswer('50mm clearance from stock to sprinkler head')
  const sprinklerSystemAnswer = findAnswer('Sprinkler System')
  const hasSprinklers = sprinklerSystemAnswer?.value === 'Yes' || sprinklerClearance?.value === 'Yes' || sprinklerSystemAnswer?.comment?.toLowerCase().includes('sprinkler')
  const plugsExtensionLeads = findAnswer('plugs and Extension leads')
  const cleanAsYouGo = findAnswer('clean as you go policy')
  const stockroomSafety = findAnswer('Stock rooms')
  const lightingCondition = findAnswer('lighting in a good condition and working correctly and deemed to be suitable and sufficient')
    || findAnswer('lighting in a good condition and working correctly')
    || findAnswer('lighting in a good condition')

  const normalizeNarrativeText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^(yes|no|n\/a|na)$/i.test(trimmed)) return null
    return trimmed
  }

  const sanitizeReportNarrative = (value: unknown): string | null => {
    const normalized = normalizeNarrativeText(value)
    if (!normalized) return null
    if (/^no explicit management review statement found/i.test(normalized)) return null
    if (/^management review statement .*not found/i.test(normalized)) return null
    return normalizeWhitespace(
      normalized
        .replace(/\bmetalworks\b/gi, 'metal stock cages and shopfitting')
        .replace(/([a-z])\.(?=[A-Z])/g, '$1. ')
        .replace(/\.{2,}/g, '.')
        .replace(/\b(Stage\s*1[^.]{0,200}?)(Stage\s*2\b)/gi, '$1. $2')
        .replace(/\b(Stage\s*2[^.]{0,200}?)(Stage\s*3\b)/gi, '$1. $2')
    )
  }

  const normalizeYesNo = (value: unknown): 'yes' | 'no' | 'na' | null => {
    const normalized = normalizeWhitespace(String(value ?? '')).toLowerCase()
    if (!normalized) return null
    if (normalized === 'yes' || normalized === 'y' || normalized === 'true') return 'yes'
    if (normalized === 'no' || normalized === 'n' || normalized === 'false') return 'no'
    if (normalized === 'n/a' || normalized === 'na') return 'na'
    return null
  }

  const normalizeBooleanAnswer = (value: unknown): boolean | null => {
    const normalized = normalizeYesNo(value)
    if (normalized === 'yes') return true
    if (normalized === 'no') return false
    return null
  }

  const reviewedEscapeRoutesNarrative = sanitizeReportNarrative(editedExtractedData?.escapeRoutesEvidence)
  const pdfEscapeRoutesNarrative = sanitizeReportNarrative((pdfExtractedData as any).escapeRoutesEvidence)
  const auditEscapeRoutesNarrative = sanitizeReportNarrative(fireExitRoutes?.comment)

  const isLikelyLegacyEscapeRoutesFallback = (value: string | null): boolean => {
    if (!value) return false
    return /\bdelivery doors?\b|\bpallets?\b|\bboxes?\b/i.test(value)
  }

  const hasEscapeRouteObstructionSignal = (value: string | null): boolean => {
    if (!value) return false
    const lower = value.toLowerCase()
    const hasNegatedNegativeSignal =
      /\b(no|not|without)\b[\s\S]{0,12}\b(obstructed|blocked|restricted|compromised|impeded)\b/.test(lower)
      || /\b(obstructed|blocked|restricted|compromised|impeded)\b[\s\S]{0,12}\b(?:was|were)?\s*(?:not|no longer)\b/.test(lower)
    const hasNegativeSignal = /\b(obstructed|blocked|partially blocked|restricted|compromised?|impeded|not clear)\b/.test(lower)
    const hasExplicitPositiveSignal =
      /\b(unobstructed|clear and unobstructed|clear and fully accessible|fully accessible|remain clear|remained clear|kept clear|routes remained clear|exit routes remained clear|clear paths?|without obstruction)\b/.test(lower)
    return hasNegativeSignal && !hasExplicitPositiveSignal && !hasNegatedNegativeSignal
  }

  const escapeRoutesNarrativeFromAudit =
    (reviewedEscapeRoutesNarrative && !isLikelyLegacyEscapeRoutesFallback(reviewedEscapeRoutesNarrative)
      ? reviewedEscapeRoutesNarrative
      : null)
    || pdfEscapeRoutesNarrative
    || auditEscapeRoutesNarrative
    || reviewedEscapeRoutesNarrative

  const escapeRoutesNarrativeSource = (() => {
    if (!escapeRoutesNarrativeFromAudit) return null
    if (
      reviewedEscapeRoutesNarrative
      && escapeRoutesNarrativeFromAudit === reviewedEscapeRoutesNarrative
      && !isLikelyLegacyEscapeRoutesFallback(reviewedEscapeRoutesNarrative)
    ) {
      return 'REVIEW'
    }
    if (pdfEscapeRoutesNarrative && escapeRoutesNarrativeFromAudit === pdfEscapeRoutesNarrative) {
      return 'PDF'
    }
    if (auditEscapeRoutesNarrative && escapeRoutesNarrativeFromAudit === auditEscapeRoutesNarrative) {
      return 'H&S_AUDIT'
    }
    if (reviewedEscapeRoutesNarrative && escapeRoutesNarrativeFromAudit === reviewedEscapeRoutesNarrative) {
      return 'REVIEW'
    }
    return 'H&S_AUDIT'
  })()

  type CompartmentationSource = 'REVIEW' | 'PDF' | 'H&S_AUDIT'
  const normalizeCompartmentationNarrative = (value: unknown): string | null => {
    const normalized = sanitizeExtractedValue(normalizeNarrativeText(value))
    if (!normalized) return null
    const looksLikeQuestionFragment =
      /(?:missing\s+ceiling\s+tiles?|c\s*wiling\s+tiles?|gaps?\s+from\s+area\s+to\s+area)/i.test(normalized)
      && !/(?:there are|overall|building|structure|no obvious damage|no evident breaches|no breaches|no evidence|compromise|compromising|identified|observed)/i.test(normalized)
    if (looksLikeQuestionFragment) return null
    return normalized
  }
  const hasCompartmentationIssueSignal = (value: string): boolean => {
    const normalized = normalizeWhitespace(value).toLowerCase()
    if (!normalized) return false
    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)

    const issuePattern = /(missing ceiling tiles?|ceiling tiles? missing|gaps? from area to area|compartmentation[\s\S]{0,40}?(?:damage|breach|issue|defect)|breaches?\s+(?:observed|identified|noted|present)|allow fire\/smoke spread)/i
    const explicitIssuePattern = /\b(missing|breach(?:es)?|gap(?:s)?|damage|defect|issue)\b[\s\S]{0,20}\b(identified|noted|observed|present|found)\b/i
    const negationPattern = /\b(no|not|none|without)\b[\s\S]{0,20}\b(missing|damage|breach|gap|issue|defect)\b|no\s+obvious\s+damage|no\s+evident\s+breaches?|no\s+evidence\s+of\s+damage|no\s+missing\s+ceiling\s+tiles?|no\s+gaps?\b/i

    for (const sentence of sentences) {
      if (!issuePattern.test(sentence) && !explicitIssuePattern.test(sentence)) continue
      if (negationPattern.test(sentence)) continue
      return true
    }
    return false
  }
  const hasCompartmentationCompliantSignal = (value: string): boolean => {
    const normalized = normalizeWhitespace(value).toLowerCase()
    if (!normalized) return false
    return /(no\s+obvious\s+damage|no\s+evidence\s+of\s+damage|no\s+evident\s+breaches?|no\s+breaches?\s+identified|good\s+condition|effective\s+containment)/i.test(normalized)
  }
  const compartmentationPriority = (text: string): number => {
    if (hasCompartmentationIssueSignal(text)) {
      return 3
    }
    if (
      hasCompartmentationCompliantSignal(text)
      || /^(no breaches identified|no breaches|none identified|no evidence of damage)\.?$/i.test(text)
    ) {
      return 1
    }
    return 2
  }

  const compartmentationCandidates = [
    { value: normalizeCompartmentationNarrative(editedExtractedData?.compartmentationStatus), source: 'REVIEW' as CompartmentationSource },
    { value: normalizeCompartmentationNarrative(pdfExtractedData.compartmentationStatus), source: 'PDF' as CompartmentationSource },
    { value: normalizeCompartmentationNarrative(compartmentationAnswer?.comment), source: 'H&S_AUDIT' as CompartmentationSource },
    { value: normalizeCompartmentationNarrative(compartmentationAnswer?.value), source: 'H&S_AUDIT' as CompartmentationSource },
    { value: normalizeCompartmentationNarrative(structureCondition?.comment), source: 'H&S_AUDIT' as CompartmentationSource },
    { value: normalizeCompartmentationNarrative(structureCondition?.value), source: 'H&S_AUDIT' as CompartmentationSource },
  ].filter((candidate): candidate is { value: string; source: CompartmentationSource } => !!candidate.value)

  const compartmentationSourceRank: Record<CompartmentationSource, number> = {
    REVIEW: 3,
    'H&S_AUDIT': 2,
    PDF: 1,
  }

  const selectedCompartmentation = compartmentationCandidates
    .map((candidate) => ({ ...candidate, priority: compartmentationPriority(candidate.value) }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return compartmentationSourceRank[b.source] - compartmentationSourceRank[a.source]
    })[0] || null

  const selectedCompartmentationStatus = selectedCompartmentation?.value || null
  const selectedCompartmentationSource = selectedCompartmentation?.source || 'NOT_FOUND'
  const hasCompartmentationDefect = (() => {
    const status = selectedCompartmentationStatus || ''
    if (!status) return false
    if (hasCompartmentationIssueSignal(status)) return true
    if (
      hasCompartmentationCompliantSignal(status)
      || /(no breaches identified|no breaches|none identified|no evidence of damage|no evident breaches)/i.test(status)
    ) {
      return false
    }
    return false
  })()
  const compartmentationActionRecommendation =
    selectedCompartmentationStatus && /ceiling|tile|gap/i.test(selectedCompartmentationStatus)
      ? 'Repair and reinstate missing or damaged ceiling tiles and any associated gaps in stock/staff areas to maintain effective compartmentation and fire/smoke resistance.'
      : 'Rectify identified compartmentation defects to restore effective fire and smoke containment between areas.'
  console.log('[FRA] Compartmentation selection:', {
    selectedCompartmentationStatus,
    selectedCompartmentationSource,
    hasCompartmentationDefect,
    candidates: compartmentationCandidates,
  })

  // Statutory Testing
  const fireAlarmMaintenance = findAnswer('Fire Alarm Maintenance')
  const emergencyLightingMaintenance = findAnswer('Emergency Lighting Maintenance')
  const fireExtinguisherService = findAnswer('Fire Extinguisher Service')

  // Training
  const trainingInduction = findAnswer('H&S induction training')
  const trainingToolbox = findAnswer('toolbox refresher training')

  // Contractor & Visitor Safety
  const contractorManagement = findAnswer('contractors managed')
  const visitorSigning = findAnswer('visitors signing in')

  // COSHH
  const coshhSheets = findAnswer('COSHH data sheets available')

  // Working at Height
  const laddersNumbered = findAnswer('ladders clearly numbered')

  // Evidence-led flags from PDF or H&S audit responses
  const escapeObstructedFromAnswers = pdfExtractedData.escapeRoutesObstructed === 'yes' ||
    (fireExitRoutes && String(fireExitRoutes.value).toLowerCase() === 'no')
  const escapeObstructedFromNarrative = hasEscapeRouteObstructionSignal(escapeRoutesNarrativeFromAudit)
  const escapeObstructed = escapeObstructedFromAnswers || escapeObstructedFromNarrative
  const hasEscapeRouteConcern = escapeObstructed
  const combustibleEscapeCompromise = (pdfExtractedData as any).combustibleStorageEscapeCompromiseFlag === 'yes' ||
    pdfExtractedData.combustibleStorageEscapeCompromise === 'yes' ||
    Boolean(combustibleMaterials && String(combustibleMaterials.value).toLowerCase() === 'no')
  const fireSafetyTrainingShortfall = pdfExtractedData.fireSafetyTrainingShortfall === 'yes' ||
    trainingInduction?.value === 'No' || trainingToolbox?.value === 'No'

  // Get auditor name
  let auditorName = 'Admin User'
  if (fraInstance.conducted_by_user_id) {
    const { data: auditorProfile } = await supabase
      .from('fa_profiles')
      .select('full_name')
      .eq('id', fraInstance.conducted_by_user_id)
      .single()
    if (auditorProfile?.full_name) {
      auditorName = auditorProfile.full_name
    }
  }

  // Extract premises description from H&S audit
  const premisesDescription = findAnswer('Number of floors') || findAnswer('floors')
  const floorsInfo = premisesDescription?.value || premisesDescription?.comment || generalSiteInfo?.value || generalSiteInfo?.comment || '1'

  // Fire Alarm System - extract location and panel status - prioritize edited data, then PDF, then database
  const reviewedFirePanelLocation = sanitizeExtractedValue(editedExtractedData?.firePanelLocation, { asLocation: true })
  const pdfFirePanelLocation = sanitizeExtractedValue(pdfExtractedData.firePanelLocation, { asLocation: true })
  const firePanelLocationAnswer =
    findAnswer('Location of Fire Panel')
    || findAnswer('Fire Panel Location')
    || findAnswer('Fire Alarm Panel Location')
    || findAnswer('Panel Location')
    || findAnswer('fire panel')
  const auditFirePanelLocation = sanitizeExtractedValue(
    typeof firePanelLocationAnswer?.value === 'string'
      ? firePanelLocationAnswer.value
      : typeof firePanelLocationAnswer?.comment === 'string'
        ? firePanelLocationAnswer.comment
        : null,
    { asLocation: true }
  )
  const firePanelLocation = reviewedFirePanelLocation
    ? { value: reviewedFirePanelLocation, comment: undefined }
    : pdfFirePanelLocation
      ? { value: pdfFirePanelLocation, comment: undefined }
      : auditFirePanelLocation
        ? { value: auditFirePanelLocation, comment: undefined }
        : null
  const firePanelFaults = editedExtractedData?.firePanelFaults
    ? { value: editedExtractedData.firePanelFaults, comment: undefined }
    : pdfExtractedData.firePanelFaults
      ? { value: pdfExtractedData.firePanelFaults, comment: undefined }
      : findAnswer('Is panel free of faults')
        || findAnswer('Panel free of faults')
        || findAnswer('Fire panel free of faults')
        || findAnswer('Panel faults')
        || findAnswer('panel free')
  
  // Debug logging
  console.log('[FRA] Fire Panel Location found:', !!firePanelLocation, firePanelLocation?.value || firePanelLocation?.comment)
  console.log('[FRA] Fire Panel Faults found:', !!firePanelFaults, firePanelFaults?.value || firePanelFaults?.comment)
  
  // Format panel faults answer
  let panelFaultsText = 'Panel status to be verified'
  if (firePanelFaults) {
    const rawValue = normalizeWhitespace(String(firePanelFaults.value || ''))
    const rawComment = normalizeWhitespace(String(firePanelFaults.comment || ''))
    const faultsValue = rawValue.toLowerCase()
    const combined = normalizeWhitespace(`${rawValue} ${rawComment}`).toLowerCase()

    const hasExplicitFaultPresent =
      /\b(fault(?:s)? (?:at|present|detected|indicated)|indicates? a fault|fault condition|panel fault)\b/i.test(combined)
      && !/\b(no faults?|fault[\s-]*free|free of faults)\b/i.test(combined)
    const hasExplicitNoFault =
      /\b(no faults?|fault[\s-]*free|free of faults|normal)\b/i.test(combined)

    if (hasExplicitFaultPresent) {
      panelFaultsText = rawComment || rawValue || 'Fault present at time of inspection'
    } else if (hasExplicitNoFault) {
      panelFaultsText = rawComment || rawValue || 'No faults'
    } else if (faultsValue === 'yes' || faultsValue === 'y') {
      panelFaultsText = rawComment || 'No faults'
    } else if (faultsValue === 'no' || faultsValue === 'n') {
      panelFaultsText = rawComment || 'Fault present at time of inspection'
    } else if (rawComment) {
      panelFaultsText = rawComment
    } else if (rawValue) {
      panelFaultsText = rawValue
    }
  }
  const hasPanelFaultCondition =
    /\b(fault(?:s)? (?:at|present|detected|indicated)|indicates? a fault|fault condition|panel fault)\b/i.test(panelFaultsText)
    && !/\b(no faults?|fault[\s-]*free|free of faults|normal)\b/i.test(panelFaultsText)

  // Emergency Lighting - extract test switch location - prioritize edited data, then PDF, then database
  const reviewedEmergencySwitchLocation = sanitizeExtractedValue(editedExtractedData?.emergencyLightingSwitch, { asLocation: true })
  const pdfEmergencySwitchLocation = sanitizeExtractedValue(pdfExtractedData.emergencyLightingSwitch, { asLocation: true })
  const emergencyLightingSwitchAnswer =
    findAnswer('Location of Emergency Lighting Test Switch')
    || findAnswer('Emergency Lighting Test Switch')
    || findAnswer('Emergency Lighting Switch')
    || findAnswer('emergency lighting test')
    || findAnswer('lighting test switch')
  const auditEmergencySwitchLocation = sanitizeExtractedValue(
    typeof emergencyLightingSwitchAnswer?.value === 'string'
      ? emergencyLightingSwitchAnswer.value
      : typeof emergencyLightingSwitchAnswer?.comment === 'string'
        ? emergencyLightingSwitchAnswer.comment
        : null,
    { asLocation: true }
  )
  const emergencyLightingSwitchLocation = reviewedEmergencySwitchLocation
    ? { value: reviewedEmergencySwitchLocation, comment: undefined }
    : pdfEmergencySwitchLocation
      ? { value: pdfEmergencySwitchLocation, comment: undefined }
      : auditEmergencySwitchLocation
        ? { value: auditEmergencySwitchLocation, comment: undefined }
        : null
  
  // Debug logging
  console.log('[FRA] Emergency Lighting Switch Location found:', !!emergencyLightingSwitchLocation, emergencyLightingSwitchLocation?.value || emergencyLightingSwitchLocation?.comment)

  const fireDoorPrimaryEvidenceText = normalizeWhitespace(
    [
      fireDoorsClosed?.value,
      fireDoorsClosed?.comment,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
  ).toLowerCase()

  const fireDoorEvidenceText = normalizeWhitespace(
    [
      fireDoorsClosed?.value,
      fireDoorsClosed?.comment,
      fireDoorsCondition?.value,
      fireDoorsCondition?.comment,
      editedExtractedData?.fireDoorsCondition,
      pdfExtractedData.fireDoorsCondition,
      pdfExtractedData.fireDoorsHeldOpenComment,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
  ).toLowerCase()

  const hasPositiveDoorSignal = (value: string, pattern: RegExp): boolean => {
    const sentenceMatches = value.match(new RegExp(`[^.!?\\n]*${pattern.source}[^.!?\\n]*`, 'gi')) || []
    return sentenceMatches.some((sentence) => !/\b(?:no|not|unobstructed|clear|free from obstruction)\b/i.test(sentence))
  }

  const hasNegativeDoorOpenSignal = (value: string): boolean =>
    /\b(closed and not held open|not held open|not wedged(?:\s+or\s+held\s+open)?|not propped open|in the close position)\b/.test(value)
    || /\bno\b[\s\S]{0,12}\b(held open|wedged open|propped open)\b/.test(value)
    || /\b(held open|wedged open|propped open)\b[\s\S]{0,12}\b(?:was|were)?\s*(?:not|no)\b/.test(value)

  const fireDoorsHeldOpen = (() => {
    const answer = normalizeYesNo(fireDoorsClosed?.value)
    const primaryPositiveSignal = hasPositiveDoorSignal(fireDoorPrimaryEvidenceText, /\b(held open|wedged open|propped open)\b/)
    const primaryNegativeSignal = hasNegativeDoorOpenSignal(fireDoorPrimaryEvidenceText)

    if (answer === 'yes' && !primaryPositiveSignal) return false
    if (answer === 'no') return true

    const evidence = fireDoorEvidenceText
    if (!evidence) return false

    const explicitNegativeSignal = hasNegativeDoorOpenSignal(evidence)
    const explicitPositiveSignal = hasPositiveDoorSignal(evidence, /\b(held open|wedged open|propped open)\b/)

    if ((primaryNegativeSignal || explicitNegativeSignal) && !explicitPositiveSignal) return false
    return explicitPositiveSignal
  })()

  const fireDoorsBlocked = (() => {
    const answer = normalizeYesNo(fireDoorsClosed?.value)
    const primaryEvidence = fireDoorPrimaryEvidenceText
    const primaryBlockedSignal = hasPositiveDoorSignal(
      primaryEvidence,
      /\b(fire door(?:s)?|door(?:s)?)\b[\s\S]{0,40}\b(blocked|obstructed|restricted|impeded|unable to close)\b|\b(blocked|obstructed|restricted|impeded|unable to close)\b[\s\S]{0,40}\b(fire door(?:s)?|door(?:s)?)\b/
    )

    if (answer === 'yes' && !primaryBlockedSignal) return false

    const combined = fireDoorEvidenceText
    if (!combined) return false

    const blockedSignal = hasPositiveDoorSignal(
      combined,
      /\b(fire door(?:s)?|door(?:s)?)\b[\s\S]{0,40}\b(blocked|obstructed|restricted|impeded|unable to close)\b|\b(blocked|obstructed|restricted|impeded|unable to close)\b[\s\S]{0,40}\b(fire door(?:s)?|door(?:s)?)\b/
    )
    const explicitlyNotBlocked = /\b(fire door(?:s)?|door(?:s)?)\b[\s\S]{0,40}\b(not blocked|clear|unobstructed|free from obstruction)\b/.test(combined)
    return blockedSignal && !explicitlyNotBlocked
  })()

  const fireDoorIntegrityIssues = (() => {
    const doorsCondition = normalizeYesNo(fireDoorsCondition?.value)
    const stripsCondition = normalizeYesNo(intumescentStrips?.value)
    return doorsCondition === 'no' || stripsCondition === 'no' || hasCompartmentationDefect
  })()

  const panelAccessObstructed = (() => {
    const combined = [
      firePanelLocation?.value,
      firePanelLocation?.comment,
      panelFaultsText,
      escapeRoutesNarrativeFromAudit,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase()

    if (!combined) return false

    return (
      /\b(panel|fire panel)\b[\s\S]{0,40}\b(blocked|obstructed|restricted|inaccessible)\b/.test(combined)
      || /\b(blocked|obstructed|restricted|inaccessible)\b[\s\S]{0,40}\b(panel|fire panel)\b/.test(combined)
      || /\bladder\b[\s\S]{0,50}\b(panel|fire panel)\b/.test(combined)
    )
  })()

  const escapeRoutesObstructed = (() => {
    const narrative = normalizeWhitespace(String(escapeRoutesNarrativeFromAudit ?? '')).toLowerCase()
    if (!narrative) return hasEscapeRouteConcern
    const obstructionSignal = /\b(escape routes?|evacuation routes?|egress routes?)\b[\s\S]{0,45}\b(obstructed|blocked|restricted|compromised|impeded)\b/.test(narrative)
      || /\b(obstructed|blocked|restricted|compromised|impeded)\b[\s\S]{0,45}\b(escape routes?|evacuation routes?|egress routes?)\b/.test(narrative)
    const explicitClearSignal =
      /\b(escape routes?|evacuation routes?)\b[\s\S]{0,45}\b(clear|unobstructed|fully accessible|remained clear|without obstruction)\b/.test(narrative)
      || /\b(no|not|without)\b[\s\S]{0,12}\b(obstructed|blocked|restricted|compromised|impeded)\b/.test(narrative)
    if (obstructionSignal && !explicitClearSignal) return true
    if (explicitClearSignal && !obstructionSignal) return false
    return hasEscapeRouteConcern
  })()

  const fireExitsObstructed = (() => {
    const combined = normalizeWhitespace(
      `${fireExitRoutes?.value ?? ''} ${fireExitRoutes?.comment ?? ''} ${escapeRoutesNarrativeFromAudit ?? ''}`
    ).toLowerCase()
    if (!combined) return hasEscapeRouteConcern
    const obstructionSignal = /\b(final exits?|fire exits?|exit doors?)\b[\s\S]{0,45}\b(obstructed|blocked|restricted|compromised|impeded)\b/.test(combined)
      || /\b(obstructed|blocked|restricted|compromised|impeded)\b[\s\S]{0,45}\b(final exits?|fire exits?|exit doors?)\b/.test(combined)
    const explicitClearSignal =
      /\b(final exits?|fire exits?|exit doors?)\b[\s\S]{0,45}\b(clear|unobstructed|fully accessible|remained clear|without obstruction)\b/.test(combined)
      || /\b(no|not|without)\b[\s\S]{0,12}\b(obstructed|blocked|restricted|compromised|impeded)\b/.test(combined)
    if (obstructionSignal && !explicitClearSignal) return true
    if (explicitClearSignal && !obstructionSignal) return false
    return hasEscapeRouteConcern
  })()

  const cleanAsYouGoAnswer = normalizeYesNo(cleanAsYouGo?.value)
  const stockroomSafetyAnswer = normalizeYesNo(stockroomSafety?.value)
  const combustiblesManagedAnswer = normalizeYesNo(combustibleMaterials?.value)
  const housekeepingNarrative = normalizeWhitespace(
    `${cleanAsYouGo?.comment ?? ''} ${stockroomSafety?.comment ?? ''} ${combustibleMaterials?.comment ?? ''}`
  ).toLowerCase()
  const housekeepingNegativeSignal =
    /\b(poor housekeeping|housekeeping (?:issues?|deficien|inconsistent|concern)|clutter|untidy|accumulation of combustible)\b/.test(housekeepingNarrative)

  const housekeepingGood = (() => {
    if (cleanAsYouGoAnswer === 'no' || stockroomSafetyAnswer === 'no') return false
    if (housekeepingNegativeSignal) return false
    return cleanAsYouGoAnswer === 'yes' || stockroomSafetyAnswer === 'yes' || combustiblesManagedAnswer === 'yes'
  })()

  const housekeepingPoorBackOfHouse = (() => {
    if (cleanAsYouGoAnswer === 'no' || stockroomSafetyAnswer === 'no') return true
    if (housekeepingNegativeSignal) return true
    return false
  })()

  const combustiblesPoorlyStored = (() => {
    if (normalizeYesNo(combustibleMaterials?.value) === 'no') return true
    const narrative = normalizeWhitespace(
      `${combustibleMaterials?.comment ?? ''} ${stockroomSafety?.comment ?? ''}`
    ).toLowerCase()
    if (!narrative) return false
    const poorStorageSignal = /\b(poor(?:ly)? stored|unsafe storage|stacked unsafely|combustible accumulation|stock piled|cluttered|tipping hazards?)\b/.test(narrative)
    const explicitGoodSignal = /\b(stored correctly|safe storage|neatly organised|well organised|no hazards)\b/.test(narrative)
    return poorStorageSignal && !explicitGoodSignal
  })()

  const lightingConditionAnswer = normalizeYesNo(lightingCondition?.value)
  const hasTillLightingDefect = (() => {
    if (lightingConditionAnswer === 'no') return true
    const narrative = normalizeWhitespace(
      `${lightingCondition?.value ?? ''} ${lightingCondition?.comment ?? ''}`
    ).toLowerCase()
    if (!narrative) return false
    const defectSignal =
      /\b(strip lighting|lighting)\b[\s\S]{0,40}\b(broken|not working|failed|faulty|dark|dim|insufficient|defect)\b/.test(narrative)
      || /\b(rather dark|poor illumination)\b/.test(narrative)
    const explicitGoodSignal =
      /\b(in good condition|working correctly|suitable and sufficient)\b/.test(narrative)
    return defectSignal && !explicitGoodSignal
  })()
  const tillLightingDefectObservation = hasTillLightingDefect
    ? sanitizeReportNarrative(lightingCondition?.comment)
      || 'Defective lighting was reported around the till areas; repairs/refit resolution should be tracked to ensure adequate illumination for safe circulation and effective evacuation management.'
    : null

  const trainingCompletionRate = (() => {
    if (typeof editedExtractedData?.trainingCompletionRate === 'number') {
      return Math.min(100, Math.max(0, editedExtractedData.trainingCompletionRate))
    }
    if (typeof editedExtractedData?.trainingCompletionRate === 'string') {
      const parsedEdited = Number.parseFloat(editedExtractedData.trainingCompletionRate)
      if (Number.isFinite(parsedEdited)) {
        return Math.min(100, Math.max(0, parsedEdited))
      }
    }
    if (typeof pdfExtractedData.trainingCompletionRate === 'string') {
      const parsedPdf = Number.parseFloat(pdfExtractedData.trainingCompletionRate)
      if (Number.isFinite(parsedPdf)) {
        return Math.min(100, Math.max(0, parsedPdf))
      }
    }

    const narrativeCandidates = [
      editedExtractedData?.fireSafetyTrainingNarrative,
      pdfExtractedData.fireSafetyTrainingNarrative,
      fireSafetyTrainingShortfall ? (trainingToolbox?.comment || trainingInduction?.comment || null) : null,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

    for (const candidate of narrativeCandidates) {
      const percentageMatch = normalizeWhitespace(candidate).match(/(\d{1,3}(?:\.\d+)?)\s*%/)
      if (!percentageMatch) continue
      const parsed = Number.parseFloat(percentageMatch[1])
      if (Number.isFinite(parsed)) {
        return Math.min(100, Math.max(0, parsed))
      }
    }

    const combined = normalizeWhitespace(
      `${trainingInduction?.comment ?? ''} ${trainingToolbox?.comment ?? ''}`
    )
    const percentageMatch = combined.match(/(\d{1,3}(?:\.\d+)?)\s*%/)
    if (percentageMatch) {
      const parsed = Number.parseFloat(percentageMatch[1])
      if (Number.isFinite(parsed)) {
        return Math.min(100, Math.max(0, parsed))
      }
    }
    if (normalizeYesNo(trainingInduction?.value) === 'yes' && normalizeYesNo(trainingToolbox?.value) === 'yes') {
      return 100
    }
    return null
  })()

  const recentFireDrillWithin6Months = normalizeBooleanAnswer(fireDrill?.value)
  const emergencyLightingTestsCurrent = normalizeBooleanAnswer(emergencyLighting?.value)
  const fireAlarmTestsCurrent = normalizeBooleanAnswer(weeklyFireTests?.value)
  const extinguishersServicedCurrent = normalizeBooleanAnswer(fireExtinguisherService?.value)
  const emergencyLightingMaintenanceNarrative = (() => {
    const explicitComment = sanitizeReportNarrative(emergencyLightingMaintenance?.comment)
    if (explicitComment) {
      const date = extractDateFromText(explicitComment)
      if (date) {
        return `Emergency lighting maintenance: last conducted ${date} (records evidenced).`
      }
      return explicitComment
    }
    const explicitValue = sanitizeReportNarrative(
      typeof emergencyLightingMaintenance?.value === 'string' ? emergencyLightingMaintenance.value : null
    )
    if (explicitValue) {
      const date = extractDateFromText(explicitValue)
      if (date) {
        return `Emergency lighting maintenance: last conducted ${date} (records evidenced).`
      }
      return explicitValue
    }
    return 'Monthly functional tests and annual full-duration tests are undertaken by competent persons, with records maintained as part of the store\'s health and safety compliance checks.'
  })()

  const fireFindings: FRARiskFindings = {
    escape_routes_obstructed: escapeRoutesObstructed,
    fire_exits_obstructed: fireExitsObstructed,
    fire_doors_held_open: fireDoorsHeldOpen,
    fire_doors_blocked: fireDoorsBlocked,
    combustibles_in_escape_routes: combustibleEscapeCompromise,
    combustibles_poorly_stored: combustiblesPoorlyStored,
    fire_panel_access_obstructed: panelAccessObstructed,
    fire_door_integrity_issues: fireDoorIntegrityIssues,
    housekeeping_poor_back_of_house: housekeepingPoorBackOfHouse,
    housekeeping_good: housekeepingGood,
    training_completion_rate: trainingCompletionRate,
    recent_fire_drill_within_6_months: recentFireDrillWithin6Months,
    emergency_lighting_tests_current: emergencyLightingTestsCurrent,
    fire_alarm_tests_current: fireAlarmTestsCurrent,
    extinguishers_serviced_current: extinguishersServicedCurrent,
  }
  const calculatedRiskRating = computeFRARiskRating(fireFindings)
  const calculatedRiskSummary = buildFRARiskSummary(fireFindings, calculatedRiskRating)
  const cleanedCompartmentationStatus = sanitizeExtractedValue(
    String(selectedCompartmentationStatus || '').replace(/\s+yes\.?$/i, '')
  )
  const cleanedCallPointAccessibility = sanitizeExtractedValue(
    String(
      editedExtractedData?.callPointAccessibility
      || pdfExtractedData.callPointAccessibility
      || callPointsAnswer?.value
      || callPointsAnswer?.comment
      || ''
    )
  )
  const obstructedRoutesEvidenceText = fireFindings.fire_exits_obstructed
    ? 'Observed during recent inspections: escape routes and/or fire exits were obstructed, reducing effective egress width.'
    : 'Observed during recent inspections: escape routes and/or back-of-house circulation routes were obstructed, reducing effective egress width.'
  const obstructedRoutesActionText = fireFindings.fire_exits_obstructed
    ? 'Address any obstruction to fire exits and escape routes; ensure fire exits and evacuation paths are kept clear and unobstructed.'
    : 'Address any obstruction to escape routes and back-of-house circulation routes; ensure evacuation paths are kept clear and unobstructed.'
  const maintainRoutesActionText = fireFindings.fire_exits_obstructed
    ? 'Continue to ensure escape routes and fire exits are always kept clear and unobstructed.'
    : 'Continue to ensure escape routes and back-of-house circulation routes are always kept clear and unobstructed.'
  const resolvedAccessDescription = (() => {
    const reviewed = normalizeWhitespace(String(editedExtractedData?.accessDescription || ''))
    if (reviewed) return reviewed

    const statements = [
      'Access for Fire and Rescue Services is available via the main customer entrance and the rear service/loading access point.',
      (fireFindings.escape_routes_obstructed || fireFindings.fire_exits_obstructed || fireFindings.combustibles_in_escape_routes)
        ? 'At the time of inspection, obstructions and/or combustible encroachment were identified in back-of-house circulation and escape routes and required immediate management action.'
        : 'No route obstructions affecting Fire and Rescue access were identified at the time of inspection.',
      fireFindings.fire_panel_access_obstructed
        ? 'Access to the fire alarm panel was impeded and should be kept clear at all times.'
        : null,
    ]

    return statements.filter(Boolean).join(' ')
  })()

  // Format dates
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  // Build FRA data structure with debug source tracking
  const appointedPersonValue = extractedManagerName 
    || storeManagerName?.value 
    || storeManagerName?.comment 
    || (typeof storeManagerSignature?.value === 'object' && storeManagerSignature.value !== null 
      ? (storeManagerSignature.value as any).name || (storeManagerSignature.value as any).signature_name
      : typeof storeManagerSignature?.value === 'string' 
        ? storeManagerSignature.value.split(/[–-]/)[0]?.trim()
        : storeManagerSignature?.comment?.split(/[–-]/)[0]?.trim())
    || 'Store Manager'
  console.log('[FRA] Final Appointed Person Value:', appointedPersonValue)
  
  // Assessment date should ALWAYS come from H&S audit conducted date if available
  // Check edited data first, then PDF, then database audit, then FRA instance
  const editedConductedDate = parseAuditDateString(editedExtractedData?.conductedDate)
  const parsedPdfConductedDate = parseAuditDateString(pdfExtractedData.conductedDate)
  const hsAuditConductedAt = editedConductedDate
    ? editedConductedDate.toISOString()
    : parsedPdfConductedDate
      ? parsedPdfConductedDate.toISOString()
      : (hsAudit as any)?.conducted_at
    
  const assessmentDateValue = hsAuditConductedAt 
    ? formatDate(hsAuditConductedAt)
    : formatDate(fraInstance.conducted_at || fraInstance.created_at)
  const assessmentStartTimeValue = editedExtractedData?.assessmentStartTime?.trim()
    ? editedExtractedData.assessmentStartTime.trim()
    : pdfExtractedData.assessmentStartTime?.trim()
      ? pdfExtractedData.assessmentStartTime.trim()
    : hsAuditConductedAt
      ? formatDateTime(hsAuditConductedAt)?.split(' ').slice(-3).join(' ') || null
      : formatDateTime(fraInstance.conducted_at || fraInstance.created_at)?.split(' ').slice(-3).join(' ') || null
  
  // Debug logging
  console.log('[FRA] ===== ASSESSMENT DATE DEBUG =====')
  console.log('[FRA] Has H&S Audit:', !!hsAudit)
  console.log('[FRA] PDF Conducted Date:', pdfExtractedData.conductedDate)
  console.log('[FRA] H&S Audit conducted_at (raw):', hsAuditConductedAt)
  console.log('[FRA] FRA Instance conducted_at:', fraInstance.conducted_at)
  console.log('[FRA] FRA Instance created_at:', fraInstance.created_at)
  console.log('[FRA] Final Assessment Date:', assessmentDateValue)
  console.log('[FRA] Final Assessment Start Time:', assessmentStartTimeValue)
  console.log('[FRA] =================================')
  
  const returnData = {
    // Cover page data
    clientName: 'Footasylum Ltd',
    _sources: {
      clientName: 'DEFAULT',
      premises: 'DATABASE',
      address: 'DATABASE',
      responsiblePerson: 'DEFAULT',
      ultimateResponsiblePerson: 'DEFAULT',
      appointedPerson: (extractedManagerName || storeManagerName?.value || storeManagerName?.comment || storeManagerSignature?.value) ? (pdfExtractedData.storeManager ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT',
      assessorName: 'DATABASE',
      assessmentDate: hsAuditConductedAt ? (pdfExtractedData.conductedDate ? 'PDF' : 'H&S_AUDIT') : 'FRA_INSTANCE',
      assessmentStartTime: editedExtractedData?.assessmentStartTime?.trim()
        ? 'REVIEW'
        : (hsAuditConductedAt ? (pdfExtractedData.conductedDate ? 'PDF' : 'H&S_AUDIT') : 'FRA_INSTANCE'),
      assessmentEndTime: 'N/A',
      assessmentReviewDate: hsAuditConductedAt ? (pdfExtractedData.conductedDate ? 'PDF_CALCULATED' : 'H&S_AUDIT_CALCULATED') : 'FRA_INSTANCE_CALCULATED',
      buildDate: customBuildDate
        ? 'CUSTOM'
        : auditBuildDate
          ? (editedExtractedData?.buildDate ? 'REVIEW' : 'H&S_AUDIT')
          : 'DEFAULT',
      propertyType: 'DEFAULT',
      numberOfFloors: generalSiteInfo?.value || generalSiteInfo?.comment ? (pdfExtractedData.numberOfFloors ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT',
      floorArea: resolvedFloorAreaSource,
      occupancy: customData?.occupancy ? 'CUSTOM' : (occupancyFromFloorArea ? 'FRA_INSTANCE_CALCULATED' : (occupancyData?.value || occupancyData?.comment ? 'H&S_AUDIT' : 'DEFAULT')),
      operatingHours: customOperatingHours
        ? 'CUSTOM'
        : pdfExtractedData.operatingHours
          ? 'PDF'
          : preferredAutoOpeningTimesSource
            ? preferredAutoOpeningTimesSource
            : (operatingHoursData?.value || operatingHoursData?.comment ? 'H&S_AUDIT' : 'WEB_SEARCH'),
      storeOpeningTimes: operatingHoursData?.value || operatingHoursData?.comment
        ? (pdfExtractedData.operatingHours
          ? 'PDF'
          : (preferredAutoOpeningTimesSource || 'H&S_AUDIT'))
        : 'WEB_SEARCH',
      adjacentOccupancies: customAdjacentOccupancies ? 'CUSTOM' : (resolvedAdjacentOccupancies ? 'WEB_SEARCH' : 'DEFAULT'),
      accessDescription: editedExtractedData?.accessDescription ? 'REVIEW' : 'CALCULATED',
      fireAlarmPanelLocation: firePanelLocation?.value || firePanelLocation?.comment ? (pdfExtractedData.firePanelLocation ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT',
      fireAlarmPanelFaults: firePanelFaults?.value || firePanelFaults?.comment ? (pdfExtractedData.firePanelFaults ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT',
      emergencyLightingTestSwitchLocation: emergencyLightingSwitchLocation?.value || emergencyLightingSwitchLocation?.comment ? (pdfExtractedData.emergencyLightingSwitch ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT',
      fireAlarmDescription: 'DEFAULT',
      fireAlarmMaintenance: fireAlarmMaintenance?.comment ? 'H&S_AUDIT' : 'DEFAULT',
      emergencyLightingDescription: 'DEFAULT',
      emergencyLightingMaintenance: emergencyLightingMaintenance?.comment ? 'H&S_AUDIT' : 'DEFAULT',
      fireExtinguishersDescription: 'DEFAULT',
      fireExtinguisherService: fireExtinguisherService?.comment ? 'H&S_AUDIT' : 'DEFAULT',
      sprinklerDescription: hasSprinklers ? 'H&S_AUDIT' : 'DEFAULT',
      sprinklerClearance: hasSprinklers ? (sprinklerClearance?.value === 'Yes' ? 'H&S_AUDIT' : 'DEFAULT') : 'N/A',
      internalFireDoors: (fireDoorsCondition?.value || fireDoorsCondition?.comment || intumescentStrips?.value || intumescentStrips?.comment) ? 'H&S_AUDIT' : 'DEFAULT',
      historyOfFires: enforcementAction?.value ? 'H&S_AUDIT' : 'DEFAULT',
      sourcesOfIgnition: 'DEFAULT',
      sourcesOfFuel: 'DEFAULT',
      sourcesOfOxygen: 'DEFAULT',
      peopleAtRisk: 'DEFAULT',
      recommendedControls: 'H&S_AUDIT_MIXED',
      escapeRoutesEvidence: escapeRoutesNarrativeSource || (aiSummaries?.escapeRoutesSummary ? 'AI' : (escapeObstructed ? 'H&S_AUDIT' : 'N/A')),
      fireSafetyTrainingNarrative: editedExtractedData?.fireSafetyTrainingNarrative ? 'REVIEW' : (aiSummaries?.fireSafetyTrainingSummary ? 'AI' : ((fireSafetyTrainingShortfall || (typeof trainingCompletionRate === 'number' && trainingCompletionRate < 100)) ? 'H&S_AUDIT' : 'DEFAULT')),
      managementReviewStatement: editedExtractedData?.managementReviewStatement ? 'REVIEW' : (aiSummaries?.managementReviewStatement ? 'AI' : ((pdfText || hsAudit) ? 'H&S_AUDIT' : 'N/A')),
      significantFindings: aiSummaries?.significantFindings?.length ? 'AI' : ((pdfText || hsAudit) ? 'H&S_AUDIT' : 'DEFAULT'),
      riskRatingLikelihood: 'CALCULATED',
      riskRatingConsequences: 'CALCULATED',
      summaryOfRiskRating: 'CALCULATED',
      actionPlanLevel: 'CALCULATED',
      description: customData?.description?.trim() ? 'CUSTOM' : (generalSiteInfo?.value || generalSiteInfo?.comment ? (pdfExtractedData.numberOfFloors ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT'),
      sourcesOfFuelCoshhNote: 'DEFAULT',
    } as Record<string, string>,
    premises: `Footasylum – ${store.store_name}`,
    address: [
      store.address_line_1,
      store.city,
      store.postcode,
      store.region
    ].filter(Boolean).join('\n'),
    responsiblePerson: 'Footasylum Ltd',
    ultimateResponsiblePerson: 'Chief Financial Officer Footasylum Ltd',
    appointedPerson: appointedPersonValue as string,
    assessorName: auditorName,
    assessmentDate: assessmentDateValue,
    assessmentStartTime: assessmentStartTimeValue,
    assessmentEndTime: null, // Not tracked in current system
    assessmentReviewDate: hsAuditConductedAt 
      ? formatDate(new Date(new Date(hsAuditConductedAt).setFullYear(new Date(hsAuditConductedAt).getFullYear() + 1)).toISOString())
      : formatDate(new Date(new Date(fraInstance.conducted_at || fraInstance.created_at).setFullYear(new Date(fraInstance.conducted_at || fraInstance.created_at).getFullYear() + 1)).toISOString()),

    // About the Property (customData overrides when set)
    buildDate: resolvedBuildDate,
    propertyType: customData?.propertyType ?? 'Retail unit used for the sale of branded fashion apparel and footwear to members of the public.',
    description: (() => {
      const normalizeAddressComparable = (value: string): string =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

      const storeAddressForDescription = [
        normalizeWhitespace(String(store.address_line_1 || '')),
        normalizeWhitespace(String(store.city || '')),
      ]
        .filter(Boolean)
        .join(', ')

      const customDescription = customData?.description?.trim()
      if (customDescription) {
        const normalizedDescription = normalizeAddressComparable(customDescription)
        const storePostcode = normalizeWhitespace(String(store.postcode || '')).toUpperCase().replace(/\s+/g, '')
        const normalizedStoreAddressLine = normalizeAddressComparable(String(store.address_line_1 || ''))
        const normalizedStoreCity = normalizeAddressComparable(String(store.city || ''))
        const mentionedPostcodes = customDescription.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi) || []
        const hasMismatchedPostcode = storePostcode.length > 0
          && mentionedPostcodes.some((postcode: string) => normalizeWhitespace(postcode).toUpperCase().replace(/\s+/g, '') !== storePostcode)
        const mentionsAddressLinePattern = /\b(unit|street|st\b|road|rd\b|avenue|ave\b|centre|center|court|ct\b|way|park)\b/i.test(customDescription)
        const hasStoreAddressLine = normalizedStoreAddressLine.length > 0 && normalizedDescription.includes(normalizedStoreAddressLine)
        const hasStoreCity = normalizedStoreCity.length > 0 && normalizedDescription.includes(normalizedStoreCity)
        const hasMismatchedAddressNarrative =
          mentionsAddressLinePattern
          && !hasStoreAddressLine

        if (!hasMismatchedPostcode && !hasMismatchedAddressNarrative) {
          return customDescription
        }
      }
      const numFloors = customData?.numberOfFloors || generalSiteInfo?.value || generalSiteInfo?.comment || '1'
      const floorsNum = parseInt(String(numFloors).replace(/\D/g, '')) || 1
      if (floorsNum === 1) {
        return `The premises is located at ${storeAddressForDescription || 'the recorded store address'} and operates over one level (Ground Floor) with a main sales floor to the front of the unit and associated back-of-house areas to the rear, including stockroom, office and staff welfare facilities.
The unit is of modern construction, consisting primarily of steel frame with blockwork, modern internal wall finishes and commercial-grade floor coverings.
The premises is a mid-unit with adjoining retail occupancies to either side.`
      }
      const floorNames = floorsNum === 2 ? 'Ground Floor and First Floor' : floorsNum === 3 ? 'Ground Floor, First Floor and Second Floor' : `Ground Floor and ${floorsNum - 1} upper level(s)`
      return `The premises is located at ${storeAddressForDescription || 'the recorded store address'} and is arranged over ${floorsNum} level(s) (${floorNames}), comprising:
• Main sales floor to the front of the unit
• Stockroom, staff welfare facilities and management office to the rear
• Rear service corridor providing access to fire exits
The unit is of modern construction, consisting primarily of steel frame with blockwork, modern internal wall finishes and commercial-grade floor coverings.
The premises is a mid-unit with adjoining retail occupancies to either side.`
    })(),
    adjacentOccupancies: resolvedAdjacentOccupancies,
    numberOfFloors: customData?.numberOfFloors ?? generalSiteInfo?.value ?? generalSiteInfo?.comment ?? '1',
    floorArea: resolvedFloorArea, // Custom > extracted > web-search > fallback
    floorAreaComment: resolvedFloorArea === 'To be confirmed' ? 'Please add floor area information' : null,
    occupancy:
      customData?.occupancy ||
      occupancyFromFloorArea ||
      occupancyData?.value ||
      occupancyData?.comment ||
      defaultOccupancyText,
    occupancyComment: occupancyFromFloorArea
      ? null
      : !customData?.occupancy && !occupancyData?.value && !occupancyData?.comment
        ? 'Please add floor area information to calculate both Standard (60 sq ft/person) and Peak (30 sq ft/person) occupancy.'
        : null,
    operatingHours: customOperatingHours || operatingHoursData?.value || operatingHoursData?.comment || 'To be confirmed',
    operatingHoursComment: !customOperatingHours && !operatingHoursData?.value && !operatingHoursData?.comment ? 'Please add operating hours information' : null,
    accessDescription: resolvedAccessDescription,
    sleepingRisk: customData?.sleepingRisk ?? 'No sleeping occupants',
    internalFireDoors: (() => {
      // Check if fire doors are in good condition and intumescent strips are present
      const doorsGood = fireDoorsCondition?.value === 'Yes' || fireDoorsCondition?.value === true || 
                       (typeof fireDoorsCondition?.value === 'string' && fireDoorsCondition.value.toLowerCase().includes('yes'))
      const stripsPresent = intumescentStrips?.value === 'Yes' || intumescentStrips?.value === true ||
                            (typeof intumescentStrips?.value === 'string' && intumescentStrips.value.toLowerCase().includes('yes'))
      
      if (fireFindings.fire_doors_held_open || fireFindings.fire_doors_blocked) {
        return 'Internal fire doors are present but were observed held open and/or obstructed. Corrective management controls are required to maintain effective compartmentation.'
      }
      if (doorsGood && stripsPresent) {
        return 'All internal fire doors within the premises are of an appropriate fire-resisting standard and form part of the building\'s passive fire protection measures. Intumescent strips are present and in good condition.'
      }
      if (doorsGood && !stripsPresent) {
        return 'Internal fire doors within the premises are of an appropriate fire-resisting standard and form part of the building\'s passive fire protection measures. However, intumescent strips require attention to ensure full compliance with fire safety standards.'
      }
      if (fireDoorsCondition?.comment) {
        return fireDoorsCondition.comment
      }
      return 'All internal fire doors within the premises are of an appropriate fire-resisting standard and form part of the building\'s passive fire protection measures. Fire door condition and intumescent strip presence should be verified during the assessment.'
    })(),
    historyOfFires: enforcementAction?.value === 'None' ? 'No reported fire-related incidents in the previous 12 months.' : 'No reported fire-related incidents in the previous 12 months.',

    // Fire Alarm System
    fireAlarmDescription: `The premises is protected by an electronic fire detection and alarm system installed in accordance with BS 5839-1:2017 and the Regulatory Reform (Fire Safety) Order 2005, Article 13(1)(a). The system is a Grade A, Category L1, plus Type M fire alarm system, which aligns with Footasylum Ltd's standard specification for retail premises.
The fire alarm system is fully operational and provides automatic fire detection coverage throughout all areas of the premises. Smoke detector units are positioned throughout the sales floor and back-of-house areas to provide early warning of fire and to maximise evacuation time in the event of an emergency.
Manual call points are provided throughout the premises and are positioned in accordance with BS 5839 requirements for a normal risk environment.`,
    fireAlarmPanelLocation: firePanelLocation?.value || firePanelLocation?.comment || 'To be confirmed',
    fireAlarmPanelLocationComment: !firePanelLocation?.value && !firePanelLocation?.comment ? 'Please add fire panel location' : null,
    fireAlarmPanelFaults: panelFaultsText,
    fireAlarmPanelFaultsComment: !firePanelFaults?.value && !firePanelFaults?.comment ? 'Please verify panel status' : null,
    fireAlarmMaintenance: fireAlarmMaintenance?.comment || 'Fire alarm servicing is completed at six-monthly intervals, in line with statutory and British Standard requirements.',

    // Emergency Lighting
    emergencyLightingDescription: `Emergency escape lighting is installed throughout the premises in accordance with BS 5266-1 to illuminate escape routes and exits in the event of a failure of the normal lighting supply.
The emergency lighting system was observed to be operational at the time of assessment.`,
    emergencyLightingTestSwitchLocation: emergencyLightingSwitchLocation?.value || emergencyLightingSwitchLocation?.comment || 'To be confirmed',
    emergencyLightingTestSwitchLocationComment: !emergencyLightingSwitchLocation?.value && !emergencyLightingSwitchLocation?.comment ? 'Please add emergency lighting test switch location' : null,
    emergencyLightingMaintenance: emergencyLightingMaintenanceNarrative,

    // Portable Fire-Fighting Equipment
    fireExtinguishersDescription: `Portable fire-fighting equipment is provided throughout the premises in appropriate locations, including near fire exits and areas of increased electrical risk. Fire extinguishers are suitable for the identified risks within the store environment and are mounted on brackets or stands with clear signage.
Fire extinguishers are subject to annual inspection and servicing by a suitably competent contractor in accordance with BS 5306.`,
    fireExtinguisherService: fireExtinguisherService?.comment || 'Fire extinguishers were observed to be in position, clearly visible and unobstructed.',

    // Sprinkler & Smoke Extraction - only if sprinklers exist
    hasSprinklers: hasSprinklers,
    sprinklerDescription: hasSprinklers 
      ? `The premises is protected by an automatic sprinkler system forming part of the overall fire safety strategy. The system is designed to control the spread of fire at an early stage, limit fire growth and reduce the volume of smoke generated, thereby improving life safety outcomes in the event of a fire.
Sprinkler heads are installed throughout the premises in accordance with the original system design and relevant standards. Adequate clearance must be always maintained between stored stock and sprinkler heads to ensure effective operation and to prevent impairment of the system.`
      : 'The premises is not protected by an automatic sprinkler system. Fire safety is managed through other means including fire detection and alarm systems, emergency lighting, and portable fire-fighting equipment.',
    sprinklerClearance: hasSprinklers 
      ? (sprinklerClearance?.value === 'Yes' ? 'Adequate clearance maintained' : 'Clearance to be verified')
      : 'N/A - No sprinkler system installed',

    // Fire Hazards (Stage 1)
    sourcesOfIgnition: [
      'Electrical installations and equipment',
      'Lighting and display lighting',
      'Portable electrical equipment',
      'Heat generated from electrical faults',
      'Deliberate ignition (arson)'
    ],
    sourcesOfFuel: [
      'Retail stock including clothing and footwear',
      'Cardboard and packaging materials',
      'Display fixtures and fittings',
      'Office furniture and furnishings',
      'Cleaning materials (low risk, non-flammable)'
    ],
    sourcesOfOxygen: [
      'Natural airflow within the premises',
      'Mechanical ventilation systems',
      'Open doors during trading hours'
    ],

    // People at Risk (Stage 2)
    peopleAtRisk: [
      'Employees – including full-time, part-time and temporary staff working within the store',
      'Members of the public – customers and visitors present during trading hours',
      'Contractors and visitors – including maintenance personnel and other third parties who may be unfamiliar with the premises',
      'Young persons – where employed, subject to appropriate risk assessment and controls'
    ],

    // Evidence-led narrative: escape routes (prefer reviewed/audit evidence first, then AI)
    escapeRoutesEvidence: escapeRoutesNarrativeFromAudit
      || sanitizeReportNarrative(aiSummaries?.escapeRoutesSummary?.trim())
      || ((fireFindings.escape_routes_obstructed || fireFindings.fire_exits_obstructed)
        ? obstructedRoutesEvidenceText
        : null),

    // Evidence-led narrative: fire safety training (prefer edited, then AI, then regex-derived)
    fireSafetyTrainingNarrative: (editedExtractedData?.fireSafetyTrainingNarrative?.trim())
      || (sanitizeReportNarrative(aiSummaries?.fireSafetyTrainingSummary)?.trim())
      || (() => {
        const inductionNarrative = sanitizeReportNarrative(
          trainingInduction?.comment
          || (typeof trainingInduction?.value === 'string' ? trainingInduction.value : null)
        )
        const toolboxNarrative = sanitizeReportNarrative(
          trainingToolbox?.comment
          || (typeof trainingToolbox?.value === 'string' ? trainingToolbox.value : null)
        )
        if (inductionNarrative && toolboxNarrative) return `${inductionNarrative} ${toolboxNarrative}`
        return inductionNarrative || toolboxNarrative || 'Fire safety training is delivered via induction and toolbox talks; records are maintained.'
      })(),

    // Management & Review: only use explicit statement supplied via extraction/review.
    managementReviewStatement: sanitizeReportNarrative(editedExtractedData?.managementReviewStatement?.trim())
      || sanitizeReportNarrative(pdfExtractedData.managementReviewStatement?.trim())
      || null,

    // COSHH reference for Sources of fuel (brief; detail in H&S only)
    sourcesOfFuelCoshhNote: 'Cleaning materials are low-risk and non-flammable. COSHH is managed under a separate assessment.',

    // Significant Findings: prefer AI summary, then remove contradictions when a compartmentation defect exists.
    significantFindings: (() => {
      const contradictionPattern = /(no evidence of damage|no evident breaches|no breaches identified|no significant deficiencies were identified)/i
      const defectPattern = /(missing ceiling tiles?|ceiling tiles? missing|compartmentation[\s\S]{0,30}?(?:defect|issue|damage|breach)|breaches?\s+(?:observed|identified|noted|present)|gaps?\s+from\s+area\s+to\s+area)/i
      const formatCompartmentationFinding = () =>
        selectedCompartmentationStatus
          ? `${selectedCompartmentationStatus}. This should be rectified to maintain fire and smoke containment.`
          : 'Compartmentation defects were identified and should be rectified to maintain fire and smoke containment.'

      const normalizeFindings = (input: string[]) => {
        if (!hasCompartmentationDefect) return input
        const filtered = input.filter((line) => !contradictionPattern.test(line) || defectPattern.test(line))
        if (filtered.some((line) => defectPattern.test(line))) {
          return filtered
        }
        return [...filtered, formatCompartmentationFinding()]
      }

      if (aiSummaries?.significantFindings?.length) {
        return normalizeFindings(
          (aiSummaries.significantFindings as string[])
            .map((line) => sanitizeReportNarrative(line) || line)
        )
      }
      const escapeSentence = escapeRoutesNarrativeFromAudit
        || ((fireFindings.escape_routes_obstructed || fireFindings.fire_exits_obstructed)
          ? obstructedRoutesEvidenceText
          : 'Escape routes were clearly identifiable and generally maintained free from obstruction.')
      const detectionFinding = 'The premises is provided with appropriate fire detection and alarm systems, emergency lighting, fire-fighting equipment and clearly defined escape routes. These systems were observed to be in place and operational, supporting safe evacuation in the event of a fire.'
      const fireDoorsFinding = (fireFindings.fire_doors_held_open || fireFindings.fire_doors_blocked)
        ? `Fire doors were observed held open and/or obstructed, which can compromise compartmentation performance during an emergency. ${escapeSentence}`
        : fireFindings.fire_door_integrity_issues
        ? `Fire door integrity issues were identified (including intumescent-strip and/or maintenance defects) and require corrective action to maintain effective compartmentation. ${escapeSentence}`
        : hasCompartmentationDefect
        ? `${formatCompartmentationFinding()} ${escapeSentence}`
        : 'Fire doors and compartmentation arrangements were observed to be in satisfactory condition, with doors not wedged open and fitted with intact intumescent protection. ' + escapeSentence
      const managementFinding = (() => {
        const findings: string[] = []
        if (fireFindings.fire_alarm_tests_current === false) findings.push('weekly fire alarm testing was not evidenced as current')
        if (fireFindings.emergency_lighting_tests_current === false) findings.push('monthly emergency lighting testing was not evidenced as current')
        if (fireFindings.extinguishers_serviced_current === false) findings.push('fire extinguisher servicing was not evidenced as current')
        if (fireFindings.recent_fire_drill_within_6_months === false) findings.push('a compliant fire drill within the last 6 months was not evidenced')
        if (findings.length === 0) {
          return 'Routine fire safety management arrangements are in place, including weekly fire alarm testing, monthly emergency lighting checks and scheduled servicing of fire safety systems by competent contractors. Fire drills have been conducted, and records are maintained.'
        }
        return `Fire safety management records indicate that ${findings.join(', ')}. Management action is required to restore compliance assurance.`
      })()
      return normalizeFindings([
        detectionFinding,
        fireDoorsFinding,
        managementFinding,
        ...(tillLightingDefectObservation ? [tillLightingDefectObservation] : []),
      ])
    })(),

    // Recommended Controls (obstruction when edited text or PDF/findAnswer)
    recommendedControls: [
      contractorManagement?.value === 'No' ? 'Reinforce contractor and visitor management procedures, including signing-in arrangements and briefing on emergency procedures.' : null,
      coshhSheets?.value === 'No' ? 'Ensure fire safety documentation relevant to the premises is available on site and maintained in an accessible format, including COSHH safety data sheets.' : null,
      laddersNumbered?.value === 'No' ? 'Ensure all ladders and steps are clearly numbered for identification purposes.' : null,
      hasCompartmentationDefect ? compartmentationActionRecommendation : null,
      hasPanelFaultCondition ? 'Fire alarm panel fault condition identified: arrange immediate inspection/repair by a competent fire alarm engineer, record remedial works, and confirm system reset to normal operation.' : null,
      fireFindings.escape_routes_obstructed || fireFindings.fire_exits_obstructed ? obstructedRoutesActionText : maintainRoutesActionText,
      fireFindings.combustibles_in_escape_routes ? 'Remove combustible materials from escape routes immediately and reinforce stock control/housekeeping checks to prevent recurrence.' : (fireFindings.combustibles_poorly_stored || fireFindings.housekeeping_poor_back_of_house ? 'Improve housekeeping and storage controls in back-of-house areas to prevent combustible build-up and maintain safe access.' : 'Maintain existing housekeeping and combustible storage standards; no excessive fire loading was observed in escape routes at the time of inspection.'),
      tillLightingDefectObservation ? 'Defective lighting reported around till areas should be repaired and tracked to maintain adequate illumination for safe circulation and effective evacuation management.' : null,
      fireFindings.fire_doors_held_open || fireFindings.fire_doors_blocked
        ? 'Stop fire doors from being held open or blocked; enforce local checks to maintain effective compartmentation at all times.'
        : fireFindings.fire_door_integrity_issues
          ? 'Rectify fire door integrity issues (including missing or damaged intumescent strips/seals) and verify all fire doors meet required fire-resisting standards.'
          : 'Ensure internal fire doors are maintained in effective working order and are not wedged or held open.',
      fireFindings.fire_alarm_tests_current === false || fireFindings.emergency_lighting_tests_current === false || fireFindings.extinguishers_serviced_current === false ? 'Bring routine testing and servicing records up to date for fire alarm systems, emergency lighting and fire-fighting equipment in accordance with statutory requirements and British Standards.' : 'Continue routine testing, inspection and servicing of fire alarm systems, emergency lighting and fire-fighting equipment in accordance with statutory requirements and British Standards.',
      'Continue to conduct and record fire drills at appropriate intervals to ensure staff familiarity with evacuation procedures.'
    ].filter(Boolean) as string[],

    // Store data for reference
    store: store,
    hsAuditDate: hsAudit ? formatDate((hsAudit as any).conducted_at || (hsAudit as any).created_at) : null,
    fraInstance: fraInstance,
    // Photos from H&S audit
    photos: (hsAudit as any)?.media || null,
    // Risk Rating (deterministic from observed findings; do not use legacy extracted overrides)
    riskRatingLikelihood: calculatedRiskRating.likelihood,
    riskRatingConsequences: calculatedRiskRating.consequence,
    summaryOfRiskRating: calculatedRiskSummary,
    actionPlanLevel: calculatedRiskRating.overall,
    riskRatingRationale: calculatedRiskRating.rationale,
    fireFindings: fireFindings,
    // Recommended Actions: use edited action plan if set; otherwise derive from PDF/H&S findings
    actionPlanItems: (() => {
      const edited = (editedExtractedData as any)?.actionPlanItems
      if (edited && Array.isArray(edited) && edited.length > 0) {
        const keepDoorOpenActions = fireFindings.fire_doors_held_open || fireFindings.fire_doors_blocked
        const doorOpenActionPattern = /\bfire doors?\b.*\b(held open|blocked|obstruct|compartmentation)\b|\b(held open|blocked|obstruct)\b.*\bfire doors?\b/
        const trainingActionPattern = /\b(training|toolbox refresher|100%\s*completion|completion rate)\b/
        const normalized = [...edited].filter((item: any) => {
          const recommendation = String(item?.recommendation || '').toLowerCase()
          if (!recommendation) return true
          if (trainingActionPattern.test(recommendation)) return false
          if (keepDoorOpenActions) return true
          return !doorOpenActionPattern.test(recommendation)
        })
        const hasAction = (pattern: RegExp) =>
          normalized.some((item: any) => pattern.test(String(item?.recommendation || '').toLowerCase()))

        if (hasPanelFaultCondition && !hasAction(/\b(panel|fire alarm).*\bfault\b|\bfault\b.*\b(panel|fire alarm)\b/)) {
          normalized.unshift({
            priority: 'High',
            recommendation: 'Fire alarm panel fault condition identified: arrange immediate attendance by a competent fire alarm engineer, rectify the fault, and record corrective action and confirmation testing in the fire logbook.',
          })
        }
        if ((fireFindings.escape_routes_obstructed || fireFindings.fire_exits_obstructed) && !hasAction(/\b(escape route|final exit|fire exit).*\b(obstruct|clear)\b|\bobstruct.*\b(escape route|final exit|fire exit)\b/)) {
          normalized.unshift({
            priority: 'High',
            recommendation: obstructedRoutesActionText,
          })
        }
        if ((fireFindings.fire_doors_held_open || fireFindings.fire_doors_blocked) && !hasAction(/\bfire doors?\b.*\b(held open|blocked|obstruct|compartmentation)\b/)) {
          normalized.unshift({
            priority: 'High',
            recommendation: 'Fire doors were observed held open and/or blocked. Reinstate effective door management immediately to maintain compartmentation and smoke control.',
          })
        } else if (fireFindings.fire_door_integrity_issues && !hasAction(/\bfire door\b.*\b(intumescent|integrity|seal|strip|compartmentation)\b/)) {
          normalized.push({
            priority: 'Medium',
            recommendation: 'Rectify fire door integrity defects (including missing or damaged intumescent strips/seals) and record completion checks.',
          })
        }
        if (fireFindings.combustibles_in_escape_routes && !hasAction(/\bcombustible\b.*\b(escape route|final exit)\b|\bescape route\b.*\bcombustible\b/)) {
          normalized.push({
            priority: 'High',
            recommendation: 'Remove combustible materials from escape routes immediately and implement controls to prevent route encroachment.',
          })
        } else if ((fireFindings.combustibles_poorly_stored || fireFindings.housekeeping_poor_back_of_house) && !hasAction(/\b(housekeeping|storage|combustible)\b/)) {
          normalized.push({
            priority: 'Medium',
            recommendation: 'Improve housekeeping and stock storage standards in back-of-house areas to prevent combustible accumulation.',
          })
        }
        if (hasTillLightingDefect && !hasAction(/\b(lighting|illuminat)\b.*\b(till|evacuat|circulation)\b|\b(till|lighting)\b.*\b(repair|defect)\b/)) {
          normalized.push({
            priority: 'Medium',
            recommendation: 'Track and complete repairs to defective till-area lighting to ensure adequate illumination for safe circulation and evacuation management.',
          })
        }
        return normalized
      }
      type ActionItem = { recommendation: string; priority: 'Low' | 'Medium' | 'High'; dueNote?: string }
      const derived: ActionItem[] = []
      if (hasPanelFaultCondition) {
        derived.push({
          priority: 'High',
          recommendation: 'Fire alarm panel fault condition identified: arrange immediate attendance by a competent fire alarm engineer, rectify the fault, and record corrective action and confirmation testing in the fire logbook.',
        })
      }
      const hasEscapeIssue = fireFindings.escape_routes_obstructed || fireFindings.fire_exits_obstructed
      if (hasEscapeIssue) {
        derived.push({
          priority: 'High',
          recommendation: obstructedRoutesActionText,
        })
      }
      if (fireFindings.fire_doors_held_open || fireFindings.fire_doors_blocked) {
        derived.push({
          priority: 'High',
          recommendation: 'Fire doors were observed held open and/or blocked. Reinstate effective door management immediately to maintain compartmentation and smoke control.',
        })
      } else if (fireFindings.fire_door_integrity_issues) {
        derived.push({
          priority: 'Medium',
          recommendation: 'Rectify fire door integrity defects (including missing or damaged intumescent strips/seals) and record completion checks.',
        })
      }
      if (fireFindings.combustibles_in_escape_routes) {
        derived.push({
          priority: 'High',
          recommendation: 'Remove combustible materials from escape routes immediately and implement controls to prevent route encroachment.',
        })
      } else if (fireFindings.combustibles_poorly_stored || fireFindings.housekeeping_poor_back_of_house) {
        derived.push({
          priority: 'Medium',
          recommendation: 'Improve housekeeping and stock storage standards in back-of-house areas to prevent combustible accumulation.',
        })
      }
      if (hasTillLightingDefect) {
        derived.push({
          priority: 'Medium',
          recommendation: 'Track and complete repairs to defective till-area lighting to ensure adequate illumination for safe circulation and evacuation management.',
        })
      }
      if (coshhSheets?.value === 'No') {
        derived.push({
          priority: 'Low',
          recommendation: 'Ensure fire safety documentation including COSHH safety data sheets is available on site and maintained.',
        })
      }
      if (laddersNumbered?.value === 'No') {
        derived.push({
          priority: 'Low',
          recommendation: 'Ensure all ladders and steps are clearly numbered for identification purposes.',
        })
      }
      if (hasCompartmentationDefect) {
        derived.push({
          priority: 'Medium',
          recommendation: compartmentationActionRecommendation,
        })
      }
      if (customData?.intumescentStripsPresent === false) {
        derived.push({
          priority: 'Medium',
          recommendation: 'Ensure intumescent strips are fitted to all fire doors and are intact, to maintain fire resistance and compartmentation in the event of fire.',
        })
      }
      const priorityOrder = { High: 0, Medium: 1, Low: 2 }
      derived.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      if (
        fireFindings.fire_alarm_tests_current !== false
        && fireFindings.emergency_lighting_tests_current !== false
        && fireFindings.extinguishers_serviced_current !== false
      ) {
        derived.push({
          priority: 'Low',
          recommendation: 'Continue routine checks and testing of fire alarm, emergency lighting and fire-fighting equipment.',
        })
      }
      return derived
    })(),
    sitePremisesPhotos: (editedExtractedData as any)?.sitePremisesPhotos || null,

    // HIGH PRIORITY: New H&S audit fields (customData overrides when set)
    numberOfFireExits: customData?.numberOfFireExits ?? editedExtractedData?.numberOfFireExits ?? pdfExtractedData.numberOfFireExits ?? fireExits?.value ?? fireExits?.comment ?? null,
    totalStaffEmployed: customData?.totalStaffEmployed ?? editedExtractedData?.totalStaffEmployed ?? pdfExtractedData.totalStaffEmployed ?? staffCount?.value ?? staffCount?.comment ?? null,
    maxStaffOnSite: customData?.maxStaffOnSite ?? editedExtractedData?.maxStaffOnSite ?? pdfExtractedData.maxStaffOnSite ?? maxStaff?.value ?? maxStaff?.comment ?? null,
    youngPersonsCount: customData?.youngPersonsCount ?? editedExtractedData?.youngPersonsCount ?? pdfExtractedData.youngPersonsCount ?? youngPersons?.value ?? youngPersons?.comment ?? null,
    fireDrillDate: editedExtractedData?.fireDrillDate || pdfExtractedData.fireDrillDate || fireDrillAnswer?.comment || null,
    patTestingStatus: editedExtractedData?.patTestingStatus || pdfExtractedData.patTestingStatus || patTestingAnswer?.value || patTestingAnswer?.comment || null,
    fixedWireTestDate: editedExtractedData?.fixedWireTestDate || pdfExtractedData.fixedWireTestDate || fixedWireAnswer?.comment || fixedWireAnswer?.value || null,

    // MEDIUM PRIORITY: New H&S audit fields
    exitSignageCondition: editedExtractedData?.exitSignageCondition || pdfExtractedData.exitSignageCondition || exitSignageAnswer?.value || exitSignageAnswer?.comment || null,
    compartmentationStatus: cleanedCompartmentationStatus,
    extinguisherServiceDate: editedExtractedData?.extinguisherServiceDate || pdfExtractedData.extinguisherServiceDate || fireExtinguisherService?.comment || null,
    callPointAccessibility: cleanedCallPointAccessibility,

    // Intumescent strips on doors: use audit question Yes/No when no custom override; custom toggle can override
    intumescentStripsPresent: (() => {
      if (customData?.intumescentStripsPresent !== undefined && customData?.intumescentStripsPresent !== null) {
        return !!customData.intumescentStripsPresent
      }
      const v = intumescentStrips?.value
      const c = intumescentStrips?.comment
      const auditSaysYes = v === 'Yes' || v === true ||
        (typeof v === 'string' && v.toLowerCase().includes('yes')) ||
        (typeof c === 'string' && c.toLowerCase().includes('yes'))
      const auditSaysNo = v === 'No' || v === false ||
        (typeof v === 'string' && v.toLowerCase().trim() === 'no') ||
        (typeof c === 'string' && c.toLowerCase().includes('no'))
      if (auditSaysYes) return true
      if (auditSaysNo) return false
      return true
    })(),
  }

  // Update sources for arrays (significantFindings already set evidence-led when pdfText/hsAudit)
  returnData._sources = {
    ...returnData._sources,
    sourcesOfIgnition: 'DEFAULT',
    sourcesOfFuel: 'DEFAULT',
    sourcesOfOxygen: 'DEFAULT',
    peopleAtRisk: 'DEFAULT',
    recommendedControls: trainingInduction?.value === 'No' || trainingToolbox?.value === 'No' || contractorManagement?.value === 'No' || coshhSheets?.value === 'No' || laddersNumbered?.value === 'No' || hasCompartmentationDefect ? 'H&S_AUDIT_MIXED' : 'DEFAULT',
    // High priority fields
    numberOfFireExits: editedExtractedData?.numberOfFireExits ? 'REVIEW' : pdfExtractedData.numberOfFireExits ? 'PDF' : (fireExits?.value || fireExits?.comment) ? 'H&S_AUDIT' : 'NOT_FOUND',
    totalStaffEmployed: editedExtractedData?.totalStaffEmployed ? 'REVIEW' : pdfExtractedData.totalStaffEmployed ? 'PDF' : (staffCount?.value || staffCount?.comment) ? 'H&S_AUDIT' : 'NOT_FOUND',
    maxStaffOnSite: editedExtractedData?.maxStaffOnSite ? 'REVIEW' : pdfExtractedData.maxStaffOnSite ? 'PDF' : (maxStaff?.value || maxStaff?.comment) ? 'H&S_AUDIT' : 'NOT_FOUND',
    youngPersonsCount: editedExtractedData?.youngPersonsCount ? 'REVIEW' : pdfExtractedData.youngPersonsCount ? 'PDF' : (youngPersons?.value || youngPersons?.comment) ? 'H&S_AUDIT' : 'NOT_FOUND',
    fireDrillDate: editedExtractedData?.fireDrillDate ? 'REVIEW' : pdfExtractedData.fireDrillDate ? 'PDF' : fireDrillAnswer?.comment ? 'H&S_AUDIT' : 'NOT_FOUND',
    patTestingStatus: editedExtractedData?.patTestingStatus ? 'REVIEW' : pdfExtractedData.patTestingStatus ? 'PDF' : (patTestingAnswer?.value || patTestingAnswer?.comment) ? 'H&S_AUDIT' : 'NOT_FOUND',
    fixedWireTestDate: editedExtractedData?.fixedWireTestDate ? 'REVIEW' : pdfExtractedData.fixedWireTestDate ? 'PDF' : (fixedWireAnswer?.value || fixedWireAnswer?.comment) ? 'H&S_AUDIT' : 'NOT_FOUND',
    // Medium priority fields
    exitSignageCondition: editedExtractedData?.exitSignageCondition ? 'REVIEW' : pdfExtractedData.exitSignageCondition ? 'PDF' : (exitSignageAnswer?.value || exitSignageAnswer?.comment) ? 'H&S_AUDIT' : 'NOT_FOUND',
    compartmentationStatus: selectedCompartmentationSource,
    extinguisherServiceDate: editedExtractedData?.extinguisherServiceDate ? 'REVIEW' : pdfExtractedData.extinguisherServiceDate ? 'PDF' : fireExtinguisherService?.comment ? 'H&S_AUDIT' : 'NOT_FOUND',
    callPointAccessibility: editedExtractedData?.callPointAccessibility ? 'REVIEW' : pdfExtractedData.callPointAccessibility ? 'PDF' : (callPointsAnswer?.value || callPointsAnswer?.comment) ? 'H&S_AUDIT' : 'NOT_FOUND',
    fireFindings: 'CALCULATED',
    riskRatingRationale: 'CALCULATED',
  }
  
  // Return the data with sources
  return returnData
}
