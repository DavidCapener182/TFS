'use server'

import { createClient } from '@/lib/supabase/server'
import { summarizeHSAuditForFRA } from '@/lib/ai/fra-summarize'
import { getOpeningHoursFromSearch } from '@/lib/fra/opening-hours-search'
import { getAuditInstance } from './safehub'

/**
 * Extract information from PDF text using pattern matching
 */
function extractFromPDFText(pdfText: string, patterns: { key: string; regex: RegExp; extract?: (match: RegExpMatchArray) => string }[]): Record<string, string | null> {
  const results: Record<string, string | null> = {}
  const normalizedText = pdfText.replace(/\s+/g, ' ').toLowerCase()
  
  for (const { key, regex, extract } of patterns) {
    const match = normalizedText.match(regex)
    if (match) {
      if (extract) {
        results[key] = extract(match)
      } else {
        results[key] = match[1]?.trim() || match[0]?.trim() || null
      }
    } else {
      results[key] = null
    }
  }
  
  return results
}

type ParsedYesNoQuestion = {
  answer: 'yes' | 'no' | 'na' | null
  comment: string | null
}

function parseYesNoQuestionBlock(
  text: string,
  questionRegex: RegExp
): ParsedYesNoQuestion {
  const questionMatch = text.match(questionRegex)
  if (!questionMatch || questionMatch.index === undefined) {
    return { answer: null, comment: null }
  }

  const start = questionMatch.index + questionMatch[0].length
  const afterQuestion = text.slice(start, start + 2000)
  const answerMatch = afterQuestion.match(/(?:^|\n)\s*(Yes|No|N\/A|NA)\s*(?:\n|$)/im)
  const rawAnswer = answerMatch?.[1]?.toLowerCase() || ''
  const answer: ParsedYesNoQuestion['answer'] =
    rawAnswer === 'yes' ? 'yes' :
    rawAnswer === 'no' ? 'no' :
    rawAnswer === 'n/a' || rawAnswer === 'na' ? 'na' :
    null

  let commentRaw = ''
  if (answerMatch && answerMatch.index !== undefined) {
    commentRaw = afterQuestion.slice(0, answerMatch.index)
  } else {
    commentRaw = afterQuestion
  }

  const comment = commentRaw
    .replace(/\bPhoto\s+\d+(?:\s+Photo\s+\d+)*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    answer,
    comment: comment || null,
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function extractDateFromText(value: string): string | null {
  const normalized = normalizeWhitespace(value)
  if (!normalized) return null
  const dated =
    normalized.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/)?.[1]
    || normalized.match(/\b(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})\b/i)?.[1]
    || null
  return dated ? normalizeWhitespace(dated) : null
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
      .from('fa_audit_instances')
      .select('template_id')
      .eq('id', fraInstanceId)
      .single()

    if (fraInstance?.template_id) {
      // Try to get parsed PDF text from the FRA instance's response_json
      // First, try normal first section/question
      const { data: sections } = await supabase
        .from('fa_audit_template_sections')
        .select('id, title')
        .eq('template_id', fraInstance.template_id)
        .order('order_index', { ascending: true })
      
      console.log('[FRA] Found sections for template:', sections?.length || 0)
      
      let pdfTextQuestionId: string | null = null
      
      // Try to find PDF text in any section/question
      if (sections && sections.length > 0) {
        for (const section of sections) {
          const { data: questions } = await supabase
            .from('fa_audit_template_questions')
            .select('id')
            .eq('section_id', section.id)
            .order('order_index', { ascending: true })
          
          if (questions && questions.length > 0) {
            // Check each question for PDF text
            for (const question of questions) {
              const { data: response } = await supabase
                .from('fa_audit_responses')
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
            .from('fa_audit_template_questions')
            .select('id')
            .eq('section_id', firstSection.id)
            .order('order_index', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (firstQuestion) {
          console.log('[FRA] Looking for PDF text in response for question:', firstQuestion.id, 'instance:', fraInstanceId)
          
          // First, check if ANY response exists for this instance/question
          const { data: allResponses, error: checkError } = await supabase
            .from('fa_audit_responses')
            .select('id, question_id, response_json')
            .eq('audit_instance_id', fraInstanceId)
          
          console.log('[FRA] All responses for instance:', allResponses?.length || 0, 'error:', checkError?.message)
          if (allResponses && allResponses.length > 0) {
            console.log('[FRA] Response question IDs:', allResponses.map((r: any) => r.question_id))
          }
          
          const { data: response, error: responseError } = await supabase
            .from('fa_audit_responses')
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
              .from('fa_audit_responses')
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
          .from('fa_audit_responses')
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
  
  if (!fraInstance || (fraInstance.fa_audit_templates as any)?.category !== 'fire_risk_assessment') {
    throw new Error('Invalid FRA audit instance')
  }

  const store = fraInstance.fa_stores as any
  const storeId = store.id

  // Check for saved custom data and edited extracted data (from review page)
  const { data: sections } = await supabase
    .from('fa_audit_template_sections')
    .select('id')
    .eq('template_id', fraInstance.template_id)
    .order('order_index', { ascending: true })

  let customData: any = null
  let editedExtractedData: any = null

  if (sections && sections.length > 0) {
    const firstSection = sections[0]
    const { data: firstQuestion } = await supabase
      .from('fa_audit_template_questions')
      .select('id')
      .eq('section_id', firstSection.id)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstQuestion) {
      const { data: customResponse } = await supabase
        .from('fa_audit_responses')
        .select('response_json')
        .eq('audit_instance_id', fraInstanceId)
        .eq('question_id', firstQuestion.id)
        .maybeSingle()

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

  // If no edited data from first question, check any response for fra_extracted_data
  if (!editedExtractedData) {
    const { data: allResponses } = await supabase
      .from('fa_audit_responses')
      .select('response_json')
      .eq('audit_instance_id', fraInstanceId)
    for (const row of allResponses || []) {
      if (row?.response_json?.fra_extracted_data) {
        editedExtractedData = row.response_json.fra_extracted_data
        break
      }
    }
  }

  // Get the most recent H&S audit for this store (check for uploaded PDFs too)
  const hsAuditResult = await getLatestHSAuditForStore(storeId, fraInstanceId)
  const hsAudit = hsAuditResult.audit
  const pdfText = hsAuditResult.pdfText
  
  // Extract data from PDF text if available
  let pdfExtractedData: Record<string, string | null> = {}
  if (pdfText) {
    console.log('[FRA] Extracting data from PDF text, length:', pdfText.length)
    console.log('[FRA] PDF text sample (first 1000 chars):', pdfText.substring(0, 1000))
    
    // Use original text (not normalized) for better matching
    const originalText = pdfText

    // Store Manager - try multiple patterns
    let storeManagerMatch = originalText.match(/(?:signature of person in charge of store at time of assessment|signature of person in charge|person in charge)[\s:]*([^\n\r]+?)(?:\*\*|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}|pm|gmt)/i)
    if (!storeManagerMatch) {
      storeManagerMatch = originalText.match(/(?:store manager name|manager name)[\s:]*([^\n\r]+?)(?:\n|$)/i)
    }
    if (storeManagerMatch) {
      let managerName = storeManagerMatch[1]?.trim() || ''
      managerName = managerName.replace(/\*\*/g, '')
        .replace(/\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}/gi, '')
        .replace(/\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)/gi, '')
        .replace(/\d{1,2}\s+(?:am|pm|AM|PM)\s+gmt/gi, '')
        .trim()
      if (managerName.length > 0) {
        pdfExtractedData.storeManager = managerName
        console.log('[FRA] Found store manager from PDF:', managerName)
      }
    }

    // Fire Panel Location
    const firePanelMatch = originalText.match(/(?:location of fire panel|fire panel location)[\s:]*([^\n\r]+?)(?:\n|$|is panel|panel free)/i)
    if (firePanelMatch) {
      pdfExtractedData.firePanelLocation = firePanelMatch[1]?.trim() || null
      console.log('[FRA] Found fire panel location from PDF:', pdfExtractedData.firePanelLocation)
    }

    // Fire Panel Faults
    const firePanelFaultsMatch = originalText.match(/(?:is panel free of faults|panel free of faults|panel faults)[\s:]*([^\n\r]+?)(?:\n|$|location of emergency)/i)
    if (firePanelFaultsMatch) {
      pdfExtractedData.firePanelFaults = firePanelFaultsMatch[1]?.trim() || null
      console.log('[FRA] Found fire panel faults from PDF:', pdfExtractedData.firePanelFaults)
    }

    // Emergency Lighting Switch
    const emergencyLightingMatch = originalText.match(/(?:location of emergency lighting test switch|emergency lighting test switch|emergency lighting switch)[\s:]*([^\n\r]+?)(?:\n|$|photo|photograph)/i)
    if (emergencyLightingMatch) {
      pdfExtractedData.emergencyLightingSwitch = emergencyLightingMatch[1]?.trim() || null
      console.log('[FRA] Found emergency lighting switch from PDF:', pdfExtractedData.emergencyLightingSwitch)
    }

    // Number of floors: strict extraction from the matching General Site Information label.
    const extractedFloors = extractNumericAfterLabel(originalText, /number of floors/i)
    if (extractedFloors) {
      pdfExtractedData.numberOfFloors = extractedFloors
      console.log('[FRA] Found number of floors from PDF:', extractedFloors)
    }

    // Operating Hours
    let operatingHoursMatch = originalText.match(/(?:operating hours|trading hours|opening hours|store hours)[\s:]*([^\n\r]+?)(?:\n|$|sleeping|number of)/i)
    if (!operatingHoursMatch) {
      const siteInfoSection = originalText.match(/(?:general|site)[\s\S]{0,300}(?:operating|trading|opening|store)[\s:]*hours?[\s:]*([^\n\r]+?)(?:\n|$)/i)
      if (siteInfoSection) {
        operatingHoursMatch = siteInfoSection
      }
    }
    if (operatingHoursMatch) {
      pdfExtractedData.operatingHours = operatingHoursMatch[1]?.trim() || null
      console.log('[FRA] Found operating hours from PDF:', pdfExtractedData.operatingHours)
    }

    // Conducted Date
    let conductedDateMatch = originalText.match(/(?:conducted on|conducted at|assessment date)[\s:]*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i)
    if (!conductedDateMatch) {
      const conductedSection = originalText.match(/conducted[\s\S]{0,100}(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i)
      if (conductedSection) {
        conductedDateMatch = conductedSection
      }
    }
    if (conductedDateMatch) {
      pdfExtractedData.conductedDate = conductedDateMatch[1] || null
      console.log('[FRA] Found conducted date from PDF:', pdfExtractedData.conductedDate)
    }

    // Square footage: strict extraction from its own label only.
    const extractedSquareFootage = extractSquareFootageAfterLabel(originalText)
    if (extractedSquareFootage) {
      pdfExtractedData.squareFootage = extractedSquareFootage
      console.log('[FRA] Found square footage from PDF:', extractedSquareFootage)
    }

    // H&S audit evidence for FRA: parse exact question blocks before fallback inference.
    const fireExitRoutesQuestion = parseYesNoQuestionBlock(
      originalText,
      /fire exit routes clear and unobstructed\?/i
    )
    if (fireExitRoutesQuestion.comment) {
      pdfExtractedData.escapeRoutesEvidence = fireExitRoutesQuestion.comment
    }
    if (fireExitRoutesQuestion.answer === 'no') {
      pdfExtractedData.escapeRoutesObstructed = 'yes'
      console.log('[FRA] Found fire exit routes question = NO')
    }

    // Conservative fallback: only treat as obstruction when clearly negative (not "unobstructed").
    if (!pdfExtractedData.escapeRoutesObstructed) {
      const explicitObstruction = originalText.match(/\b(?:fire\s+exit|escape\s+route|delivery\s+door)s?\b[\s\S]{0,80}\b(?:blocked|partially\s+blocked|restricted)\b/i)
      if (explicitObstruction && !/\bunobstructed\b/i.test(explicitObstruction[0])) {
        pdfExtractedData.escapeRoutesObstructed = 'yes'
        console.log('[FRA] Found explicit escape obstruction from PDF text')
      }
    }

    // Combustible storage / escape route compromise: use exact question answer.
    const combustibleStorageQuestion = parseYesNoQuestionBlock(
      originalText,
      /combustible materials are stored correctly\?/i
    )
    if (combustibleStorageQuestion.answer === 'no') {
      pdfExtractedData.combustibleStorageEscapeCompromise = 'yes'
      console.log('[FRA] Found combustible materials question = NO')
    } else if (combustibleStorageQuestion.answer === 'yes') {
      pdfExtractedData.combustibleStorageEscapeCompromise = 'no'
    }

    // Fire safety training shortfall (toolbox not 100%, induction incomplete)
    const trainingShortfallMatch = originalText.match(/(?:toolbox|fire\s+safety\s+training).*?(?:not\s+100%|incomplete)/i)
      || originalText.match(/(?:induction\s+training).*?incomplete/i)
      || originalText.match(/training\s+not\s+at\s+100%|incomplete\s+for\s+(?:two\s+)?staff/i)
    if (trainingShortfallMatch) {
      pdfExtractedData.fireSafetyTrainingShortfall = 'yes'
      console.log('[FRA] Found fire safety training shortfall from PDF')
    }

    // Number of fire exits: strict extraction from the General Site Information label.
    const extractedFireExits = extractNumericAfterLabel(originalText, /number of fire exits/i)
    if (extractedFireExits) {
      pdfExtractedData.numberOfFireExits = extractedFireExits
      console.log('[FRA] Found number of fire exits from PDF:', extractedFireExits)
    }

    // HIGH PRIORITY: Staff numbers - multiple patterns for different formats
    const totalStaffPatterns = [
      /(?:number of staff employed|staff employed)[\s:]*(\d+)/i,
      /(?:total staff|total employees)[\s:]*(\d+)/i,
      /(?:staff|employees)[\s:]+(\d+)(?!\s*(?:working|on site|at any))/i,
      /general site information[\s\S]{0,300}(?:staff employed|number of staff)[\s:]*(\d+)/i,
    ]
    for (const pattern of totalStaffPatterns) {
      const match = originalText.match(pattern)
      if (match) {
        pdfExtractedData.totalStaffEmployed = match[1]
        console.log('[FRA] Found total staff employed from PDF:', pdfExtractedData.totalStaffEmployed)
        break
      }
    }

    // Maximum staff on site - multiple patterns
    const maxStaffPatterns = [
      /(?:maximum number of staff working|maximum staff working|max staff working)[\s\S]{0,30}?(\d+)/i,
      /(?:maximum.*staff.*at any.*time)[\s:]*(\d+)/i,
      /(?:max staff|maximum staff)[\s:]*(\d+)/i,
      /(?:staff working at any one time)[\s:]*(\d+)/i,
      /general site information[\s\S]{0,400}(?:maximum.*staff|max.*staff)[\s\S]{0,30}?(\d+)/i,
    ]
    for (const pattern of maxStaffPatterns) {
      const match = originalText.match(pattern)
      if (match) {
        pdfExtractedData.maxStaffOnSite = match[1]
        console.log('[FRA] Found max staff on site from PDF:', pdfExtractedData.maxStaffOnSite)
        break
      }
    }

    // HIGH PRIORITY: Young persons - multiple patterns
    // NOTE: Do NOT match "under 18" as it captures the 18 from the phrase itself
    const youngPersonsPatterns = [
      /(?:young persons employed|young persons)[\s:]*(\d+)/i,
      /(?:young person)[\s:]+(\d+)/i,
      /(?:number of young persons)[\s:]*(\d+)/i,
      /general site information[\s\S]{0,400}(?:young person)[\s:]+(\d+)/i,
    ]
    for (const pattern of youngPersonsPatterns) {
      const match = originalText.match(pattern)
      if (match) {
        pdfExtractedData.youngPersonsCount = match[1]
        console.log('[FRA] Found young persons count from PDF:', pdfExtractedData.youngPersonsCount)
        break
      }
    }

    // Fire drill date: use exact question comment first, then fallback patterns.
    const fireDrillQuestion = parseYesNoQuestionBlock(
      originalText,
      /fire drill has been carried out in the past 6 months and records available on site\?/i
    )
    const fireDrillDateFromQuestion = extractDateFromText(fireDrillQuestion.comment || '')
    if (fireDrillDateFromQuestion) {
      pdfExtractedData.fireDrillDate = fireDrillDateFromQuestion
    } else if (
      fireDrillQuestion.answer === 'yes'
      && fireDrillQuestion.comment
      && /no date|not been recorded|not recorded/i.test(fireDrillQuestion.comment)
    ) {
      pdfExtractedData.fireDrillDate = 'Not recorded (drill marked complete)'
    }
    if (!pdfExtractedData.fireDrillDate) {
      const fireDrillPatterns = [
        /(?:fire drill|last drill|drill.*carried out|evacuation drill)[\s\S]{0,50}?(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
        /(?:fire drill|last drill|drill.*carried out)[\s\S]{0,50}?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /(?:drill|evacuation).*?(?:date|carried out|conducted)[\s\S]{0,30}?(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
        /(?:fire drill has been carried out)[\s\S]{0,100}?(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
        /(?:when was.*drill|last fire drill)[\s\S]{0,50}?(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      ]
      for (const pattern of fireDrillPatterns) {
        const match = originalText.match(pattern)
        if (match) {
          pdfExtractedData.fireDrillDate = match[1]
          break
        }
      }
    }
    if (pdfExtractedData.fireDrillDate) {
      console.log('[FRA] Found fire drill date from PDF:', pdfExtractedData.fireDrillDate)
    }

    // PAT/electrical testing status: exact PAT question first.
    const patQuestion = parseYesNoQuestionBlock(originalText, /\bPAT\?/i)
    const patDateFromQuestion = extractDateFromText(patQuestion.comment || '')
    if (patQuestion.answer === 'yes') {
      pdfExtractedData.patTestingStatus = patDateFromQuestion
        ? `Satisfactory, last conducted ${patDateFromQuestion}`
        : (patQuestion.comment || 'Satisfactory')
    } else if (patQuestion.answer === 'no') {
      pdfExtractedData.patTestingStatus = patQuestion.comment || 'Unsatisfactory'
    }
    if (!pdfExtractedData.patTestingStatus) {
      if (originalText.match(/(?:pat|portable appliance|electrical.*test).*?(?:passed|satisfactory|up to date|completed|yes)/i)
        || originalText.match(/(?:fixed wiring|electrical installation).*?(?:satisfactory|passed|completed)/i)
        || originalText.match(/(?:pat testing|pat test)[\s\S]{0,30}?(?:yes|ok|satisfactory|passed)/i)) {
        pdfExtractedData.patTestingStatus = 'Satisfactory'
      }
    }
    if (pdfExtractedData.patTestingStatus) {
      console.log('[FRA] Found PAT testing status from PDF:', pdfExtractedData.patTestingStatus)
    }

    // Fixed wire date: exact "Fixed Electrical Wiring?" question first.
    const fixedWiringQuestion = parseYesNoQuestionBlock(
      originalText,
      /fixed electrical wiring\?/i
    )
    const fixedWiringDateFromQuestion = extractDateFromText(fixedWiringQuestion.comment || '')
    if (fixedWiringDateFromQuestion) {
      pdfExtractedData.fixedWireTestDate = fixedWiringDateFromQuestion
    }
    if (!pdfExtractedData.fixedWireTestDate) {
      const fixedWireDatePatterns = [
        /(?:fixed electrical wiring|fixed wire|fixed wiring|fixed wire installation)[\s\S]{0,100}?(?:last tested|inspected and tested|tested|last conducted|conducted)[\s\S]{0,50}?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /(?:fixed electrical wiring|fixed wire|fixed wiring)[\s\S]{0,80}?(?:yes|satisfactory)[\s\S]{0,80}?last (?:tested|conducted)[\s\S]{0,30}?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /(?:electrical installation|fixed wiring)[\s\S]{0,60}?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
      ]
      for (const pattern of fixedWireDatePatterns) {
        const match = originalText.match(pattern)
        if (match) {
          pdfExtractedData.fixedWireTestDate = match[1]
          break
        }
      }
    }
    if (pdfExtractedData.fixedWireTestDate) {
      console.log('[FRA] Found fixed wire test date from PDF:', pdfExtractedData.fixedWireTestDate)
    }

    // MEDIUM PRIORITY: Exit signage condition - more flexible patterns
    if (originalText.match(/(?:exit sign|signage|fire exit sign).*?(?:good|satisfactory|clear|visible|yes|ok)/i)
      || originalText.match(/(?:signage).*?(?:installed|visible|clearly|in place)/i)
      || originalText.match(/(?:fire exit.*sign|emergency.*sign).*?(?:good|satisfactory|visible|yes)/i)
      || originalText.match(/(?:signs.*visible|signage.*adequate|signage.*good)/i)) {
      pdfExtractedData.exitSignageCondition = 'Good condition'
      console.log('[FRA] Found exit signage condition from PDF: Good')
    }

    // MEDIUM PRIORITY: Ceiling tiles / compartmentation
    const extractCompartmentationStatusFromText = (text: string): string | null => {
      const sentences = text
        .replace(/\r/g, '\n')
        .split(/[\n.?!]+/)
        .map((s) => s.trim())
        .filter(Boolean)

      // Prefer explicit defect statements over generic "no issues" wording from question text.
      const issueSentence = sentences.find((sentence) => {
        const lower = sentence.toLowerCase()
        const hasIssueSignal = /missing ceiling tiles?|ceiling tiles? missing|breach(?:es)?|gaps? from area to area|compartmentation[\s\S]{0,40}?(?:damage|breach|issue)/i.test(sentence)
        if (!hasIssueSignal) return false
        if (lower.includes('e.g. missing') || lower.includes('eg missing')) return false
        if (/\bno missing\b|\bno breaches\b|\bno evidence of damage\b|\bno evident breaches\b/.test(lower)) return false
        return true
      })

      if (issueSentence) {
        return issueSentence.replace(/\s+/g, ' ').replace(/[.]+$/, '')
      }

      const noBreachDetected = /(?:ceiling tile|compartmentation|fire stopping|structure|structural)[\s\S]{0,120}?(?:no missing|no breaches|no evidence of damage|intact|satisfactory|good condition|no evident breaches)/i.test(text)
      return noBreachDetected ? 'No breaches identified' : null
    }

    const compartmentationStatusFromText = extractCompartmentationStatusFromText(originalText)
    if (compartmentationStatusFromText) {
      pdfExtractedData.compartmentationStatus = compartmentationStatusFromText
      console.log('[FRA] Found compartmentation status from PDF:', compartmentationStatusFromText)
    }

    // MEDIUM PRIORITY: Fire extinguisher service date - more patterns
    const extinguisherServicePatterns = [
      /(?:extinguisher.*service|fire extinguisher.*service|last service.*extinguisher)[\s\S]{0,50}?(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      /(?:extinguisher)[\s\S]{0,50}?serviced[\s\S]{0,30}?(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
      /(?:extinguisher.*service|fire extinguisher.*service)[\s\S]{0,50}?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
      /(?:fire extinguisher service)[\s\S]{0,100}?(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i,
    ]
    for (const pattern of extinguisherServicePatterns) {
      const match = originalText.match(pattern)
      if (match) {
        pdfExtractedData.extinguisherServiceDate = match[1]
        console.log('[FRA] Found extinguisher service date from PDF:', pdfExtractedData.extinguisherServiceDate)
        break
      }
    }

    // MEDIUM PRIORITY: Call point accessibility
    if (originalText.match(/(?:call point|manual call point).*?(?:accessible|unobstructed|clear|yes)/i)
      || originalText.match(/(?:call points clear|call points.*accessible)/i)
      || originalText.match(/(?:mcp|manual call).*?(?:clear|accessible|unobstructed)/i)) {
      pdfExtractedData.callPointAccessibility = 'Accessible and unobstructed'
      console.log('[FRA] Found call point accessibility from PDF: Accessible')
    }

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
    console.log('[FRA] H&S Audit template (nested):', (hsAudit as any).fa_audit_templates)
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
    const templateId = (hsAudit as any).template_id || (hsAudit as any).fa_audit_templates?.id
    if (templateId) {
      const { data: sections } = await supabase
        .from('fa_audit_template_sections')
        .select(`
          *,
          fa_audit_template_questions (*)
        `)
        .eq('template_id', templateId)
        .order('order_index', { ascending: true })

      if (sections) {
        hsTemplateData = { sections }
        console.log('[FRA] Template sections loaded:', sections.length)
        const totalQuestions = sections.reduce((sum, s) => sum + ((s as any).fa_audit_template_questions?.length || 0), 0)
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
      const questions = (section as any).fa_audit_template_questions || []
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

  const floorAreaStr = customData?.floorArea || squareFootage?.value || squareFootage?.comment || ''
  const floorAreaSqFt = parseFloorAreaSqFt(floorAreaStr)
  const hasCustomOccupancy = !!customData?.occupancy?.trim()
  const defaultOccupancyText = 'To be calculated based on floor area'
  const occupancyFromFloorArea =
    !hasCustomOccupancy && floorAreaSqFt != null
      ? formatRetailOccupancyFromSqFt(floorAreaSqFt)
      : null

  // Try to get opening hours from ChatGPT search when we don't have edited or PDF value
  let openingHoursFromSearch: string | null = null
  if (!editedExtractedData?.operatingHours && !pdfExtractedData.operatingHours && store) {
    openingHoursFromSearch = await getOpeningHoursFromSearch({
      storeName: store.store_name,
      address: store.address_line_1,
      city: store.city,
    })
  }

  // Try to find operating hours - prioritize edited data, then PDF, then ChatGPT search, then database
  const operatingHoursData = editedExtractedData?.operatingHours
    ? { value: editedExtractedData.operatingHours, comment: undefined }
    : pdfExtractedData.operatingHours
      ? { value: pdfExtractedData.operatingHours, comment: undefined }
      : openingHoursFromSearch
        ? { value: openingHoursFromSearch, comment: undefined }
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

  const normalizeNarrativeText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^(yes|no|n\/a|na)$/i.test(trimmed)) return null
    return trimmed
  }

  const reviewedEscapeRoutesNarrative = normalizeNarrativeText(editedExtractedData?.escapeRoutesEvidence)
  const pdfEscapeRoutesNarrative = normalizeNarrativeText((pdfExtractedData as any).escapeRoutesEvidence)
  const auditEscapeRoutesNarrative = normalizeNarrativeText(fireExitRoutes?.comment)

  const isLikelyLegacyEscapeRoutesFallback = (value: string | null): boolean => {
    if (!value) return false
    return /\bdelivery doors?\b|\bpallets?\b|\bboxes?\b/i.test(value)
  }

  const hasEscapeRouteObstructionSignal = (value: string | null): boolean => {
    if (!value) return false
    const lower = value.toLowerCase()
    const hasNegativeSignal = /\b(obstructed|blocked|partially blocked|restricted|compromised?|impeded|not clear)\b/.test(lower)
    const hasExplicitPositiveSignal = /\b(unobstructed|clear and unobstructed|clear and fully accessible|fully accessible|remain clear|kept clear|clear paths?)\b/.test(lower)
    return hasNegativeSignal && !hasExplicitPositiveSignal
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
    return normalizeNarrativeText(value)
  }
  const compartmentationPriority = (text: string): number => {
    if (/^(no breaches identified|no breaches|none identified|no evidence of damage)\.?$/i.test(text)) {
      return 1
    }
    if (/(missing ceiling tiles?|ceiling tiles? missing|gaps? from area to area|ceiling[\s\S]{0,30}?(?:damage|gap|hole)|compartmentation[\s\S]{0,40}?(?:damage|breach|issue)|breaches?\s+(?:observed|identified|noted|present))/i.test(text)) {
      return 3
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
    const lower = status.toLowerCase()
    if (!lower) return false
    if (/(missing ceiling tiles?|ceiling tiles? missing|breaches?\s+(?:observed|identified|noted|present)|gaps?\s+from\s+area\s+to\s+area|ceiling[\s\S]{0,30}?(?:damage|gap|hole)|compartmentation[\s\S]{0,40}?(?:issue|damage|breach))/i.test(status)) {
      return true
    }
    if (/(no breaches identified|no breaches|none identified|no evidence of damage|no evident breaches)/i.test(status)) {
      return false
    }
    return /(breach|gap|damage|hole|missing)/i.test(status)
  })()
  const compartmentationActionRecommendation = 'Repair and reinstate missing or damaged ceiling tiles and any associated gaps in stock/staff areas to maintain effective compartmentation and fire/smoke resistance.'
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
  const combustibleEscapeCompromise = pdfExtractedData.combustibleStorageEscapeCompromise === 'yes' ||
    (combustibleMaterials && String(combustibleMaterials.value).toLowerCase() === 'no')
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
  const firePanelLocation = editedExtractedData?.firePanelLocation
    ? { value: editedExtractedData.firePanelLocation, comment: undefined }
    : pdfExtractedData.firePanelLocation
      ? { value: pdfExtractedData.firePanelLocation, comment: undefined }
      : findAnswer('Location of Fire Panel')
        || findAnswer('Fire Panel Location')
        || findAnswer('Fire Alarm Panel Location')
        || findAnswer('Panel Location')
        || findAnswer('fire panel')
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
    const faultsValue = String(firePanelFaults.value || '').toLowerCase()
    if (faultsValue === 'yes' || faultsValue === 'y') {
      panelFaultsText = firePanelFaults.comment || 'No faults'
    } else if (faultsValue === 'no' || faultsValue === 'n') {
      panelFaultsText = firePanelFaults.comment || 'Faults present - to be verified'
    } else if (firePanelFaults.comment) {
      panelFaultsText = firePanelFaults.comment
    }
  }

  // Emergency Lighting - extract test switch location - prioritize edited data, then PDF, then database
  const emergencyLightingSwitchLocation = editedExtractedData?.emergencyLightingSwitch
    ? { value: editedExtractedData.emergencyLightingSwitch, comment: undefined }
    : pdfExtractedData.emergencyLightingSwitch
      ? { value: pdfExtractedData.emergencyLightingSwitch, comment: undefined }
      : findAnswer('Location of Emergency Lighting Test Switch') 
        || findAnswer('Emergency Lighting Test Switch')
        || findAnswer('Emergency Lighting Switch')
        || findAnswer('emergency lighting test')
        || findAnswer('lighting test switch')
  
  // Debug logging
  console.log('[FRA] Emergency Lighting Switch Location found:', !!emergencyLightingSwitchLocation, emergencyLightingSwitchLocation?.value || emergencyLightingSwitchLocation?.comment)

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
  const hsAuditConductedAt = editedExtractedData?.conductedDate
    ? (() => {
        // Try to parse the date from edited data
        const dateStr = editedExtractedData.conductedDate
        const dateMatch = dateStr.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})/i)
        if (dateMatch) {
          const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
          const day = parseInt(dateMatch[1])
          const month = months[dateMatch[2].toLowerCase().substring(0, 3)]
          const year = parseInt(dateMatch[3])
          return new Date(year, month, day).toISOString()
        }
        // Try parsing as ISO string
        try {
          return new Date(dateStr).toISOString()
        } catch {
          return null
        }
      })()
    : pdfExtractedData.conductedDate
      ? (() => {
          // Try to parse the date from PDF text
          const dateMatch = pdfExtractedData.conductedDate.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})/i)
          if (dateMatch) {
            const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
            const day = parseInt(dateMatch[1])
            const month = months[dateMatch[2].toLowerCase().substring(0, 3)]
            const year = parseInt(dateMatch[3])
            return new Date(year, month, day).toISOString()
          }
          return null
        })()
      : (hsAudit as any)?.conducted_at
    
  const assessmentDateValue = hsAuditConductedAt 
    ? formatDate(hsAuditConductedAt)
    : formatDate(fraInstance.conducted_at || fraInstance.created_at)
  const assessmentStartTimeValue = editedExtractedData?.assessmentStartTime?.trim()
    ? editedExtractedData.assessmentStartTime.trim()
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
      buildDate: customData?.buildDate ? 'CUSTOM' : 'WEB_SEARCH', // Will be searched, fallback to default if not found
      propertyType: 'DEFAULT',
      numberOfFloors: generalSiteInfo?.value || generalSiteInfo?.comment ? (pdfExtractedData.numberOfFloors ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT',
      floorArea: customData?.floorArea ? 'CUSTOM' : (squareFootage?.value || squareFootage?.comment ? (pdfExtractedData.squareFootage ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT'),
      occupancy: customData?.occupancy ? 'CUSTOM' : (occupancyFromFloorArea ? 'FRA_INSTANCE_CALCULATED' : (occupancyData?.value || occupancyData?.comment ? 'H&S_AUDIT' : 'DEFAULT')),
      operatingHours: customData?.operatingHours ? 'CUSTOM' : (operatingHoursData?.value || operatingHoursData?.comment ? (pdfExtractedData.operatingHours ? 'PDF' : openingHoursFromSearch ? 'WEB_SEARCH' : 'H&S_AUDIT') : 'WEB_SEARCH'),
      storeOpeningTimes: operatingHoursData?.value || operatingHoursData?.comment ? (pdfExtractedData.operatingHours ? 'PDF' : openingHoursFromSearch ? 'WEB_SEARCH' : 'H&S_AUDIT') : 'WEB_SEARCH',
      accessDescription: 'CHATGPT',
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
      fireSafetyTrainingNarrative: editedExtractedData?.fireSafetyTrainingNarrative ? 'REVIEW' : (aiSummaries?.fireSafetyTrainingSummary ? 'AI' : (fireSafetyTrainingShortfall ? 'H&S_AUDIT' : 'DEFAULT')),
      managementReviewStatement: editedExtractedData?.managementReviewStatement ? 'REVIEW' : (aiSummaries?.managementReviewStatement ? 'AI' : ((pdfText || hsAudit) ? 'H&S_AUDIT' : 'N/A')),
      significantFindings: aiSummaries?.significantFindings?.length ? 'AI' : ((pdfText || hsAudit) ? 'H&S_AUDIT' : 'DEFAULT'),
      summaryOfRiskRating: editedExtractedData?.summaryOfRiskRating ? 'REVIEW' : (aiSummaries?.riskRatingJustification ? 'AI' : 'DEFAULT'),
      description: aiSummaries?.premisesDescription ? 'AI' : (generalSiteInfo?.value || generalSiteInfo?.comment ? (pdfExtractedData.numberOfFloors ? 'PDF' : 'H&S_AUDIT') : 'DEFAULT'),
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
    buildDate: customData?.buildDate || '2009',
    propertyType: customData?.propertyType ?? 'Retail unit used for the sale of branded fashion apparel and footwear to members of the public.',
    description: (() => {
      if (customData?.description?.trim()) return customData.description.trim()
      if (aiSummaries?.premisesDescription?.trim()) return aiSummaries.premisesDescription.trim()
      const numFloors = customData?.numberOfFloors || generalSiteInfo?.value || generalSiteInfo?.comment || '1'
      const floorsNum = parseInt(String(numFloors).replace(/\D/g, '')) || 1
      if (floorsNum === 1) {
        return `The premises operates over one level (Ground Floor) and comprises a main sales floor to the front of the unit with associated back-of-house areas to the rear, including stockroom, office and staff welfare facilities.
The unit is of modern construction, consisting primarily of steel frame with blockwork, modern internal wall finishes and commercial-grade floor coverings.
The premises is a mid-unit with adjoining retail occupancies to either side.`
      }
      const floorNames = floorsNum === 2 ? 'Ground Floor and First Floor' : floorsNum === 3 ? 'Ground Floor, First Floor and Second Floor' : `Ground Floor and ${floorsNum - 1} upper level(s)`
      return `The premises is arranged over ${floorsNum} level(s) (${floorNames}) and comprises:
• Main sales floor to the front of the unit
• Stockroom, staff welfare facilities and management office to the rear
• Rear service corridor providing access to final exits
The unit is of modern construction, consisting primarily of steel frame with blockwork, modern internal wall finishes and commercial-grade floor coverings.
The premises is a mid-unit with adjoining retail occupancies to either side.`
    })(),
    adjacentOccupancies: customData?.adjacentOccupancies ?? null,
    numberOfFloors: customData?.numberOfFloors ?? generalSiteInfo?.value ?? generalSiteInfo?.comment ?? '1',
    floorArea: customData?.floorArea || squareFootage?.value || squareFootage?.comment || 'To be confirmed', // Use custom data if available
    floorAreaComment: !customData?.floorArea && !squareFootage?.value && !squareFootage?.comment ? 'Please add floor area information' : null,
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
    operatingHours: customData?.operatingHours || operatingHoursData?.value || operatingHoursData?.comment || 'To be confirmed',
    operatingHoursComment: !customData?.operatingHours && !operatingHoursData?.value && !operatingHoursData?.comment ? 'Please add operating hours information' : null,
    sleepingRisk: customData?.sleepingRisk ?? 'No sleeping occupants',
    internalFireDoors: (() => {
      // Check if fire doors are in good condition and intumescent strips are present
      const doorsGood = fireDoorsCondition?.value === 'Yes' || fireDoorsCondition?.value === true || 
                       (typeof fireDoorsCondition?.value === 'string' && fireDoorsCondition.value.toLowerCase().includes('yes'))
      const stripsPresent = intumescentStrips?.value === 'Yes' || intumescentStrips?.value === true ||
                            (typeof intumescentStrips?.value === 'string' && intumescentStrips.value.toLowerCase().includes('yes'))
      
      if (doorsGood && stripsPresent) {
        return 'All internal fire doors within the premises are of an appropriate fire-resisting standard and form part of the building\'s passive fire protection measures. Intumescent strips are present and in good condition.'
      } else if (doorsGood && !stripsPresent) {
        return 'Internal fire doors within the premises are of an appropriate fire-resisting standard and form part of the building\'s passive fire protection measures. However, intumescent strips require attention to ensure full compliance with fire safety standards.'
      } else if (fireDoorsCondition?.comment) {
        return fireDoorsCondition.comment
      } else {
        return 'All internal fire doors within the premises are of an appropriate fire-resisting standard and form part of the building\'s passive fire protection measures. Fire door condition and intumescent strip presence should be verified during the assessment.'
      }
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
    emergencyLightingMaintenance: emergencyLightingMaintenance?.comment || 'Monthly functional tests and annual full-duration tests are undertaken by competent persons, with records maintained as part of the store\'s health and safety compliance checks.',

    // Portable Fire-Fighting Equipment
    fireExtinguishersDescription: `Portable fire-fighting equipment is provided throughout the premises in appropriate locations, including near final exits and areas of increased electrical risk. Fire extinguishers are suitable for the identified risks within the store environment and are mounted on brackets or stands with clear signage.
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
      || (aiSummaries?.escapeRoutesSummary?.trim())
      || (escapeObstructed
        ? 'Observed during recent inspections: escape routes and/or final exits were obstructed, reducing effective egress width.'
        : null),

    // Evidence-led narrative: fire safety training (prefer edited, then AI, then regex-derived)
    fireSafetyTrainingNarrative: (editedExtractedData?.fireSafetyTrainingNarrative?.trim())
      || (aiSummaries?.fireSafetyTrainingSummary?.trim())
      || (fireSafetyTrainingShortfall
        ? 'Fire safety training is delivered via induction and toolbox talks; refresher completion is monitored, with improvements currently underway.'
        : 'Fire safety training is delivered via induction and toolbox talks; records are maintained.'),

    // Management & Review: prefer edited, then AI, then default
    managementReviewStatement: (editedExtractedData?.managementReviewStatement?.trim())
      || (aiSummaries?.managementReviewStatement?.trim())
      || ((pdfText || hsAudit)
        ? 'This assessment has been informed by recent health and safety inspections and site observations.'
        : null),

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
        return normalizeFindings(aiSummaries.significantFindings as string[])
      }
      const escapeSentence = escapeRoutesNarrativeFromAudit
        || (hasEscapeRouteConcern
          ? 'Observed during recent inspections: escape routes and/or final exits were obstructed, reducing effective egress width.'
          : 'Escape routes were clearly identifiable and generally maintained free from obstruction.')
      const detectionFinding = 'The premises is provided with appropriate fire detection and alarm systems, emergency lighting, fire-fighting equipment and clearly defined escape routes. These systems were observed to be in place and operational, supporting safe evacuation in the event of a fire.'
      const fireDoorsFinding = hasCompartmentationDefect
        ? `${formatCompartmentationFinding()} ${escapeSentence}`
        : 'Fire doors and compartmentation arrangements were observed to be in satisfactory condition, with doors not wedged open and fitted with intact intumescent protection. ' + escapeSentence
      const managementFinding = 'Routine fire safety management arrangements are in place, including weekly fire alarm testing, monthly emergency lighting checks and scheduled servicing of fire safety systems by competent contractors. Fire drills have been conducted, and records are maintained.'
      return normalizeFindings([detectionFinding, fireDoorsFinding, managementFinding])
    })(),

    // Recommended Controls (obstruction when edited text or PDF/findAnswer)
    recommendedControls: [
      trainingInduction?.value === 'No' ? 'Ensure all staff fire safety training is completed, recorded and kept up to date, including induction training for new starters and periodic refresher training.' : null,
      trainingToolbox?.value === 'No' ? 'Reinforce toolbox refresher training completion to meet the 100% target for the last 12 months.' : null,
      contractorManagement?.value === 'No' ? 'Reinforce contractor and visitor management procedures, including signing-in arrangements and briefing on emergency procedures.' : null,
      coshhSheets?.value === 'No' ? 'Ensure fire safety documentation relevant to the premises is available on site and maintained in an accessible format, including COSHH safety data sheets.' : null,
      laddersNumbered?.value === 'No' ? 'Ensure all ladders and steps are clearly numbered for identification purposes.' : null,
      hasCompartmentationDefect ? compartmentationActionRecommendation : null,
      hasEscapeRouteConcern ? 'Address any obstruction to fire exits and escape routes; ensure final exits and evacuation paths remain clear and unobstructed.' : 'Continue to ensure escape routes and final exits are always kept clear and unobstructed.',
      combustibleEscapeCompromise ? 'Maintain good housekeeping standards; ensure combustible materials and packaging do not compromise escape routes.' : 'Maintain good housekeeping standards, particularly in relation to the control and storage of combustible materials and packaging.',
      'Continue routine testing, inspection and servicing of fire alarm systems, emergency lighting and fire-fighting equipment in accordance with statutory requirements and British Standards.',
      'Ensure internal fire doors are maintained in effective working order and are not wedged or held open.',
      'Continue to conduct and record fire drills at appropriate intervals to ensure staff familiarity with evacuation procedures.'
    ].filter(Boolean) as string[],

    // Store data for reference
    store: store,
    hsAuditDate: hsAudit ? formatDate((hsAudit as any).conducted_at || (hsAudit as any).created_at) : null,
    fraInstance: fraInstance,
    // Photos from H&S audit
    photos: (hsAudit as any)?.media || null,
    // Risk Rating (Middlesbrough FRA alignment)
    riskRatingLikelihood: (editedExtractedData as any)?.riskRatingLikelihood || 'Normal',
    riskRatingConsequences: (editedExtractedData as any)?.riskRatingConsequences || 'Moderate Harm',
    summaryOfRiskRating: (editedExtractedData as any)?.summaryOfRiskRating || (aiSummaries?.riskRatingJustification?.trim()) || 'Taking into account the nature of the building and the occupants, as well as the fire protection and procedural arrangements observed at the time of this fire risk assessment, it is considered that the consequences for life safety in the event of fire would be: Moderate Harm. Accordingly, it is considered that the risk from fire at these premises is: Tolerable.',
    actionPlanLevel: (editedExtractedData as any)?.actionPlanLevel || 'Tolerable',
    // Recommended Actions: use edited action plan if set; otherwise derive from PDF/H&S findings
    actionPlanItems: (() => {
      const edited = (editedExtractedData as any)?.actionPlanItems
      if (edited && Array.isArray(edited) && edited.length > 0) {
        return edited
      }
      type ActionItem = { recommendation: string; priority: 'Low' | 'Medium' | 'High'; dueNote?: string }
      const derived: ActionItem[] = []
      const hasEscapeIssue = hasEscapeRouteConcern
      if (hasEscapeIssue) {
        derived.push({
          priority: 'High',
          recommendation: 'Address any obstruction to fire exits and escape routes; ensure final exits and evacuation paths are kept clear and unobstructed.',
        })
      }
      if (trainingInduction?.value === 'No') {
        derived.push({
          priority: 'Medium',
          recommendation: 'Ensure all staff fire safety training is completed, including induction training for new starters and periodic refresher training.',
        })
      }
      if (trainingToolbox?.value === 'No') {
        derived.push({
          priority: 'Medium',
          recommendation: 'Reinforce toolbox refresher training completion to meet the 100% target for the last 12 months.',
        })
      }
      if (combustibleEscapeCompromise) {
        derived.push({
          priority: 'Medium',
          recommendation: 'Maintain good housekeeping; ensure combustible materials and packaging do not compromise escape routes.',
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
      derived.push({
        priority: 'Low',
        recommendation: 'Continue routine checks and testing of fire alarm, emergency lighting and fire-fighting equipment.',
      })
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
    compartmentationStatus: selectedCompartmentationStatus,
    extinguisherServiceDate: editedExtractedData?.extinguisherServiceDate || pdfExtractedData.extinguisherServiceDate || fireExtinguisherService?.comment || null,
    callPointAccessibility: editedExtractedData?.callPointAccessibility || pdfExtractedData.callPointAccessibility || callPointsAnswer?.value || callPointsAnswer?.comment || null,

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
  }
  
  // Return the data with sources
  return returnData
}
