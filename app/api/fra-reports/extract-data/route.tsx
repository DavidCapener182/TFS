import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLatestHSAuditForStore } from '@/app/actions/fra-reports'
import { getAuditInstance } from '@/app/actions/safehub'
import { POST as searchStoreData } from '../search-store-data/route'

export const dynamic = 'force-dynamic'

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

  const afterQuestion = text.slice(questionMatch.index + questionMatch[0].length, questionMatch.index + questionMatch[0].length + 2000)
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

function toDisplayAnswer(answer: ParsedYesNoQuestion['answer']): string | null {
  if (answer === 'yes') return 'Yes'
  if (answer === 'no') return 'No'
  if (answer === 'na') return 'N/A'
  return null
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
 * Extract data from H&S audit (PDF or database) without generating full FRA
 * Returns raw extracted data for review
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const instanceId = searchParams.get('instanceId')

    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    // Get the FRA audit instance
    const fraInstance = await getAuditInstance(instanceId)
    
    if (!fraInstance || (fraInstance.fa_audit_templates as any)?.category !== 'fire_risk_assessment') {
      return NextResponse.json({ error: 'Invalid FRA audit instance' }, { status: 400 })
    }

    const store = fraInstance.fa_stores as any
    const storeId = store.id

    // Get PDF text from uploaded H&S audit PDF (NOT from database audits)
    // The FRA uses ONLY the uploaded PDF, not database H&S audits
    console.log('[EXTRACT] Getting PDF text from uploaded H&S audit PDF for FRA instance:', instanceId)
    
    // First, try direct query to see if PDF text is stored
    const { data: fraInstanceForQuery } = await supabase
      .from('fa_audit_instances')
      .select('template_id')
      .eq('id', instanceId)
      .single()
    
    let directPdfText: string | null = null
    
    if (fraInstanceForQuery?.template_id) {
      console.log('[EXTRACT] Template ID found:', fraInstanceForQuery.template_id)
      
      const { data: firstSection } = await supabase
        .from('fa_audit_template_sections')
        .select('id')
        .eq('template_id', fraInstanceForQuery.template_id)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle()
      
      if (firstSection) {
        console.log('[EXTRACT] First section found:', firstSection.id)
        
        const { data: firstQuestion } = await supabase
          .from('fa_audit_template_questions')
          .select('id')
          .eq('section_id', firstSection.id)
          .order('order_index', { ascending: true })
          .limit(1)
          .maybeSingle()
        
        if (firstQuestion) {
          console.log('[EXTRACT] Direct query: checking for PDF text in question:', firstQuestion.id)
          
          const { data: directResponse, error: directError } = await supabase
            .from('fa_audit_responses')
            .select('response_json, id')
            .eq('audit_instance_id', instanceId)
            .eq('question_id', firstQuestion.id)
            .maybeSingle()
          
          if (directError) {
            console.error('[EXTRACT] Direct query error:', directError)
          } else if (directResponse) {
            console.log('[EXTRACT] Direct query found response ID:', directResponse.id)
            console.log('[EXTRACT] Response JSON keys:', Object.keys(directResponse.response_json || {}))
            
            const text = directResponse.response_json?.fra_pdf_text
            if (text) {
              directPdfText = text
              console.log('[EXTRACT] ✓ Found PDF text via direct query, length:', text.length)
            } else {
              console.log('[EXTRACT] ✗ Direct query: no fra_pdf_text found in first question')
            }
          } else {
            console.log('[EXTRACT] ✗ Direct query: no response found for question:', firstQuestion.id)
          }
        } else {
          console.log('[EXTRACT] ✗ No first question found in section')
        }
      } else {
        console.log('[EXTRACT] ✗ No first section found - template may have no sections')
      }
      
      // If not found in first question, search ALL responses for this instance
      if (!directPdfText) {
        console.log('[EXTRACT] Searching all responses for PDF text...')
        const { data: allResponses } = await supabase
          .from('fa_audit_responses')
          .select('id, question_id, response_json')
          .eq('audit_instance_id', instanceId)
        
        if (allResponses && allResponses.length > 0) {
          console.log('[EXTRACT] Found', allResponses.length, 'responses, checking each for fra_pdf_text...')
          for (const resp of allResponses) {
            const text = resp.response_json?.fra_pdf_text
            if (text) {
              directPdfText = text
              console.log('[EXTRACT] ✓ Found PDF text in response ID:', resp.id, 'question:', resp.question_id, 'length:', text.length)
              break
            }
          }
          if (!directPdfText) {
            console.log('[EXTRACT] ✗ Checked all responses, none contain fra_pdf_text')
            allResponses.forEach((resp: any) => {
              const keys = Object.keys(resp.response_json || {})
              console.log('[EXTRACT] Response', resp.id, 'question', resp.question_id, 'has keys:', keys)
            })
          }
        } else {
          console.log('[EXTRACT] ✗ No responses found for this instance at all')
        }
      }
    } else {
      console.log('[EXTRACT] ✗ No template_id found for instance')
    }
    
    // Try getLatestHSAuditForStore as fallback
    const hsAuditResult = await getLatestHSAuditForStore(storeId, instanceId)
    const pdfText = directPdfText || hsAuditResult.pdfText  // Prefer direct query result
    
    console.log('[EXTRACT] Final results:', {
      hasPdfText: !!pdfText,
      pdfTextLength: pdfText?.length || 0,
      source: directPdfText ? 'direct_query' : (hsAuditResult.pdfText ? 'getLatestHSAuditForStore' : 'none'),
      note: 'FRA uses ONLY uploaded PDF, not database audits'
    })

    // Extract data from PDF text if available
    let pdfExtractedData: Record<string, string | null> = {}
    if (pdfText) {
      console.log('[EXTRACT] PDF text length:', pdfText.length)
      console.log('[EXTRACT] PDF text sample (first 500 chars):', pdfText.substring(0, 500))
      
      // Debug: Show sections that might contain our data
      const debugSections = [
        { name: 'Store Manager', search: /(?:signature|manager|person in charge)/i },
        { name: 'Floors', search: /(?:number of floors|level|floor)/i },
        { name: 'Operating Hours', search: /(?:operating|trading|opening|hours)/i },
        { name: 'Square Footage', search: /(?:square footage|meterage|floor area)/i },
      ]
      
      for (const section of debugSections) {
        const match = pdfText.match(section.search)
        if (match) {
          const index = match.index || 0
          const context = pdfText.substring(Math.max(0, index - 100), Math.min(pdfText.length, index + 200))
          console.log(`[EXTRACT] Debug - ${section.name} context:`, context.replace(/\n/g, '\\n'))
        }
      }
      
      // Don't normalize to lowercase - keep original case for better matching
      const originalText = pdfText
      const normalizedText = pdfText.replace(/\s+/g, ' ')
      
      // Store Manager - look for "Signature of Person in Charge of store at time of assessment"
      let storeManagerMatch = null
      const storeManagerPatterns = [
        // Pattern 1: "Signature of Person in Charge of store at time of assessment." followed by name
        /signature of person in charge of store at time of assessment[.\s]*([A-Z][a-z]+(?:\s+[a-z]+)?)\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}/i,
        // Pattern 2: "Signature of Person in Charge" followed by name and date
        /signature of person in charge[.\s]*([A-Z][a-z]+(?:\s+[a-z]+)?)\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}/i,
        // Pattern 3: Look for name right before date/time at end of signature section
        /signature of person in charge of store at time of assessment[.\s]*([^\n\r]+?)\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s+gmt/i,
      ]
      
      for (const pattern of storeManagerPatterns) {
        storeManagerMatch = originalText.match(pattern)
        if (storeManagerMatch) {
          console.log('[EXTRACT] Store manager pattern matched:', pattern.toString())
          break
        }
      }
      
      if (storeManagerMatch) {
        let managerName = storeManagerMatch[1]?.trim() || ''
        // Remove any trailing punctuation or extra text
        managerName = managerName
          .replace(/\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*$/i, '')
          .replace(/\s+\d{1,2}:\d{2}.*$/i, '')
          .replace(/\s+gmt.*$/i, '')
          .replace(/[.\s]+$/, '')
          .trim()
        
        // Capitalize first letter of each word
        if (managerName) {
          managerName = managerName.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ')
          
          pdfExtractedData.storeManager = managerName
          console.log('[EXTRACT] ✓ Found store manager:', managerName)
        } else {
          console.log('[EXTRACT] Store manager match rejected (empty after cleaning):', storeManagerMatch[1])
        }
      } else {
        console.log('[EXTRACT] ✗ No store manager pattern matched')
      }

      // Fire Panel Location - more flexible pattern
      const firePanelMatch = originalText.match(/(?:location of fire panel|fire panel location)[\s:]*([^\n\r]+?)(?:\n|$|is panel|panel free)/i)
      if (firePanelMatch) {
        pdfExtractedData.firePanelLocation = firePanelMatch[1]?.trim() || null
        console.log('[EXTRACT] Found fire panel location:', pdfExtractedData.firePanelLocation)
      }

      // Fire Panel Faults - look for Yes/No or status
      const firePanelFaultsMatch = originalText.match(/(?:is panel free of faults|panel free of faults|panel faults)[\s:]*([^\n\r]+?)(?:\n|$|location of emergency)/i)
      if (firePanelFaultsMatch) {
        pdfExtractedData.firePanelFaults = firePanelFaultsMatch[1]?.trim() || null
        console.log('[EXTRACT] Found fire panel faults:', pdfExtractedData.firePanelFaults)
      }

      // Emergency Lighting Switch - look for "Location of Emergency Lighting Test Switch (Photograph)"
      // Pattern: "Location of Emergency Lighting Test Switch (Photograph) Electrical cupboard by the rear fire doors"
      let emergencyLightingMatch = null
      const emergencyLightingPatterns = [
        // Pattern 1: "Location of Emergency Lighting Test Switch (Photograph)" followed by location
        /location of emergency lighting test switch\s*\([^)]*photograph[^)]*\)\s*([^\n\r]+?)(?:\n|$|emergency lighting switch photo|photo \d+)/i,
        // Pattern 2: "Location of Emergency Lighting Test Switch" followed by location (without photograph)
        /location of emergency lighting test switch[:\s]*([^\n\r]+?)(?:\n|$|emergency lighting switch photo|photo \d+)/i,
        // Pattern 3: Just "emergency lighting" with location on next line
        /emergency lighting test switch[:\s]*([^\n\r]+?)(?:\n|$|photo)/i,
        // Pattern 4: "Electrical cupboard" pattern (common location)
        /(?:emergency lighting|test switch)[\s\S]{0,200}(electrical cupboard[^\n\r]+?)(?:\n|$|photo|photograph)/i,
      ]
      
      for (const pattern of emergencyLightingPatterns) {
        emergencyLightingMatch = originalText.match(pattern)
        if (emergencyLightingMatch) {
          console.log('[EXTRACT] Emergency lighting pattern matched:', pattern.toString())
          let location = emergencyLightingMatch[1]?.trim() || null
          // Clean up common artifacts
          if (location) {
            // Remove "(Photograph)" or "Photograph" if it got captured
            location = location.replace(/\([^)]*photograph[^)]*\)/gi, '')
            location = location.replace(/photograph/gi, '')
            location = location.replace(/^[(\s]+/, '').replace(/[\s)]+$/, '').trim()
            // Reject if it's just punctuation or too short
            if (location.length > 3 && !/^[^\w]+$/.test(location)) {
              pdfExtractedData.emergencyLightingSwitch = location
              console.log('[EXTRACT] ✓ Found emergency lighting switch:', pdfExtractedData.emergencyLightingSwitch)
              break
            } else {
              console.log('[EXTRACT] Emergency lighting match rejected (too short or invalid):', location)
            }
          }
        }
      }
      
      if (!emergencyLightingMatch || !pdfExtractedData.emergencyLightingSwitch) {
        console.log('[EXTRACT] ✗ No emergency lighting switch found')
      }

      // Number of floors: strict extraction from the matching General Site Information label.
      const extractedFloors = extractNumericAfterLabel(originalText, /number of floors/i)
      if (extractedFloors) {
        pdfExtractedData.numberOfFloors = extractedFloors
        console.log('[EXTRACT] ✓ Found number of floors:', extractedFloors)
      } else {
        console.log('[EXTRACT] ✗ No number of floors found')
      }

      // Operating Hours - search via web search instead of extracting from PDF
      // Get store information for web search
      let operatingHoursFromWeb: string | null = null
      try {
        const { data: fraInstanceForStore } = await supabase
          .from('fa_audit_instances')
          .select(`
            fa_stores (
              store_name,
              city,
              address_line_1
            )
          `)
          .eq('id', instanceId)
          .single()
        
        if (fraInstanceForStore?.fa_stores) {
          const store = fraInstanceForStore.fa_stores as any
          const storeName = store.store_name
          const city = store.city || ''
          const address = store.address_line_1 || ''
          
          if (storeName) {
            console.log('[EXTRACT] Searching web for opening hours:', storeName, city)
            
            // Call the web search API endpoint (server-side)
            try {
              // Create a request object for the search API
              const searchRequest = new NextRequest(new URL('http://localhost/api/fra-reports/search-store-data'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  storeName,
                  address,
                  city,
                }),
              })
              
              // Call the search function directly
              const searchResponse = await searchStoreData(searchRequest)
              
              if (searchResponse.ok) {
                const searchData = await searchResponse.json()
                if (searchData.openingTimes) {
                  operatingHoursFromWeb = searchData.openingTimes
                  console.log('[EXTRACT] ✓ Found opening hours from web search:', operatingHoursFromWeb)
                } else {
                  console.log('[EXTRACT] Opening hours not found via web search, will need manual entry')
                }
              } else {
                console.log('[EXTRACT] Web search API returned error, opening hours will need manual entry')
              }
            } catch (webSearchError) {
              console.error('[EXTRACT] Web search error:', webSearchError)
              console.log('[EXTRACT] Opening hours will need manual entry')
            }
          }
        }
      } catch (storeError) {
        console.error('[EXTRACT] Error getting store info for web search:', storeError)
      }
      
      // Don't try to extract from PDF - always use web search
      pdfExtractedData.operatingHours = operatingHoursFromWeb
      if (!operatingHoursFromWeb) {
        console.log('[EXTRACT] Opening hours will be searched via web (not extracted from PDF)')
      }

      // Conducted Date - look for date patterns near "conducted"
      const conductedDateMatch = originalText.match(/(?:conducted on|conducted at|assessment date)[\s:]*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i)
      if (conductedDateMatch) {
        pdfExtractedData.conductedDate = conductedDateMatch[1] || null
        console.log('[EXTRACT] Found conducted date:', pdfExtractedData.conductedDate)
      } else {
        // Try to find any date near "conducted"
        const conductedSection = originalText.match(/conducted[\s\S]{0,100}(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i)
        if (conductedSection) {
          pdfExtractedData.conductedDate = conductedSection[1] || null
          console.log('[EXTRACT] Found conducted date (alternative):', pdfExtractedData.conductedDate)
        }
      }

      // Square footage: strict extraction from its own label only.
      const extractedSquareFootage = extractSquareFootageAfterLabel(originalText)
      if (extractedSquareFootage) {
        pdfExtractedData.squareFootage = extractedSquareFootage
        console.log('[EXTRACT] ✓ Found square footage:', extractedSquareFootage)
      } else {
        console.log('[EXTRACT] ✗ No square footage found')
      }

      // Evidence-led FRA fields from exact audit questions.
      const fireExitRoutesQuestion = parseYesNoQuestionBlock(
        originalText,
        /fire exit routes clear and unobstructed\?/i
      )
      if (fireExitRoutesQuestion.comment) {
        pdfExtractedData.escapeRoutesEvidence = fireExitRoutesQuestion.comment
      }
      if (fireExitRoutesQuestion.answer === 'no') {
        console.log('[EXTRACT] ✓ Fire exit routes question answered NO')
      } else if (fireExitRoutesQuestion.answer === 'yes') {
        console.log('[EXTRACT] ✓ Fire exit routes question answered YES')
      }

      const combustibleStorageQuestion = parseYesNoQuestionBlock(
        originalText,
        /combustible materials are stored correctly\?/i
      )
      if (combustibleStorageQuestion.answer === 'no') {
        pdfExtractedData.combustibleStorageEscapeCompromise = 'Escape routes compromised'
      } else if (combustibleStorageQuestion.answer === 'yes') {
        pdfExtractedData.combustibleStorageEscapeCompromise = 'OK'
      }

      const trainingShortfallMatch = originalText.match(/(?:toolbox|fire\s+safety\s+training).*?(?:not\s+100%|incomplete)/i)
        || originalText.match(/(?:induction\s+training).*?incomplete/i)
        || originalText.match(/training\s+not\s+at\s+100%|incomplete\s+for\s+(?:two\s+)?staff/i)
      if (trainingShortfallMatch) {
        pdfExtractedData.fireSafetyTrainingNarrative = 'Fire safety training is delivered via induction and toolbox talks; refresher completion is monitored, with improvements currently underway.'
      } else if (
        originalText.match(/(?:toolbox|fire\s+safety\s+training).*?100%|100%\s+completion/i)
        || originalText.match(/(?:h&s\s+induction\s+training|induction\s+training)\s+onboarding\s+up to date at 100%/i)
        || originalText.match(/(?:induction\s+training|onboarding).*?(?:up to date at 100%|100%)/i)
        || originalText.match(/onboarding\s+up to date at 100%/i)
      ) {
        pdfExtractedData.fireSafetyTrainingNarrative = 'Fire safety training is delivered via induction and toolbox talks; H&S Induction Training / Onboarding up to date at 100%.'
        console.log('[EXTRACT] ✓ Found fire safety training (induction/onboarding 100%)')
      }

      // Fire doors and compartmentation: use the matching fire-door questions.
      const fireDoorsClosedQuestion = parseYesNoQuestionBlock(
        originalText,
        /fire doors closed and not held open\?/i
      )
      const fireDoorsConditionQuestion = parseYesNoQuestionBlock(
        originalText,
        /fire doors in a good condition\?/i
      )
      const intumescentQuestion = parseYesNoQuestionBlock(
        originalText,
        /are fire door intumescent strips in place and intact/i
      )
      const fireDoorNarrative =
        fireDoorsConditionQuestion.comment
        || intumescentQuestion.comment
        || fireDoorsClosedQuestion.comment
        || [toDisplayAnswer(fireDoorsConditionQuestion.answer), toDisplayAnswer(intumescentQuestion.answer), toDisplayAnswer(fireDoorsClosedQuestion.answer)].filter(Boolean).join(' / ')
      if (fireDoorNarrative) {
        pdfExtractedData.fireDoorsCondition = fireDoorNarrative
      }

      // Weekly fire tests: exact question mapping.
      const weeklyFireTestsQuestion = parseYesNoQuestionBlock(
        originalText,
        /weekly fire tests carried out and documented\?/i
      )
      if (weeklyFireTestsQuestion.comment) {
        pdfExtractedData.weeklyFireTests = weeklyFireTestsQuestion.comment
      } else {
        const weeklyAnswer = toDisplayAnswer(weeklyFireTestsQuestion.answer)
        if (weeklyAnswer) pdfExtractedData.weeklyFireTests = weeklyAnswer
      }

      // Monthly emergency lighting tests: exact question mapping.
      const monthlyEmergencyLightingQuestion = parseYesNoQuestionBlock(
        originalText,
        /evidence of monthly emergency lighting test being conducted\?/i
      )
      if (monthlyEmergencyLightingQuestion.comment) {
        pdfExtractedData.emergencyLightingMonthlyTest = monthlyEmergencyLightingQuestion.comment
      } else {
        const monthlyLightingAnswer = toDisplayAnswer(monthlyEmergencyLightingQuestion.answer)
        if (monthlyLightingAnswer) pdfExtractedData.emergencyLightingMonthlyTest = monthlyLightingAnswer
      }

      // Fire extinguisher service: exact question mapping.
      const fireExtinguisherServiceQuestion = parseYesNoQuestionBlock(
        originalText,
        /fire extinguisher service\?/i
      )
      if (fireExtinguisherServiceQuestion.comment) {
        pdfExtractedData.fireExtinguisherService = fireExtinguisherServiceQuestion.comment
      } else {
        const extinguisherAnswer = toDisplayAnswer(fireExtinguisherServiceQuestion.answer)
        if (extinguisherAnswer) pdfExtractedData.fireExtinguisherService = extinguisherAnswer
      }
      const extinguisherDateFromQuestion = extractDateFromText(fireExtinguisherServiceQuestion.comment || '')
      if (extinguisherDateFromQuestion) {
        pdfExtractedData.extinguisherServiceDate = extinguisherDateFromQuestion
      }

      if (pdfText) {
        pdfExtractedData.managementReviewStatement = 'This assessment has been informed by recent health and safety inspections and site observations.'
      }

      // Number of fire exits: strict extraction from the General Site Information label.
      const extractedFireExits = extractNumericAfterLabel(originalText, /number of fire exits/i)
      if (extractedFireExits) {
        pdfExtractedData.numberOfFireExits = extractedFireExits
        console.log('[EXTRACT] ✓ Found number of fire exits:', extractedFireExits)
      }

      // HIGH PRIORITY: Staff numbers - multiple patterns for different formats
      // e.g. "Number of Staff employed at the site" 18, "Staff employed: 9"
      const totalStaffPatterns = [
        /(?:number of staff employed at the site|staff employed at the site)[\s:]*(\d+)/i,
        /(?:number of staff employed|staff employed)[\s:]*(\d+)/i,
        /(?:total staff|total employees)[\s:]*(\d+)/i,
        /(?:staff|employees)[\s:]+(\d+)(?!\s*(?:working|on site|at any))/i,
        /general site information[\s\S]{0,400}(?:staff employed|number of staff)[\s:]*(\d+)/i,
      ]
      for (const pattern of totalStaffPatterns) {
        const match = originalText.match(pattern)
        if (match) {
          pdfExtractedData.totalStaffEmployed = match[1]
          console.log('[EXTRACT] ✓ Found total staff employed:', pdfExtractedData.totalStaffEmployed)
          break
        }
      }

      // Maximum staff on site - "Maximum number of staff working on site at any one time" 8
      const maxStaffPatterns = [
        /(?:maximum number of staff working on site at any one time|maximum number of staff working at any one time)[\s:]*(\d+)/i,
        /(?:maximum number of staff working|maximum staff working|max staff working)[\s\S]{0,30}?(\d+)/i,
        /(?:maximum.*staff.*at any.*time)[\s:]*(\d+)/i,
        /(?:max staff|maximum staff)[\s:]*(\d+)/i,
        /(?:staff working at any one time)[\s:]*(\d+)/i,
        /general site information[\s\S]{0,500}(?:maximum.*staff|max.*staff)[\s\S]{0,30}?(\d+)/i,
      ]
      for (const pattern of maxStaffPatterns) {
        const match = originalText.match(pattern)
        if (match) {
          pdfExtractedData.maxStaffOnSite = match[1]
          console.log('[EXTRACT] ✓ Found max staff on site:', pdfExtractedData.maxStaffOnSite)
          break
        }
      }

      // HIGH PRIORITY: Young persons - "Number of Young persons (under the age of 18 yrs) employed at the site" 0
      const youngPersonsPatterns = [
        /(?:number of young persons?\s*\(under the age of 18[^)]*\)\s*employed[^\n\r]*)[\s:]*(\d+)/i,
        /(?:young persons?\s*\(under[^)]*\)[^\n\r]*employed[^\n\r]*)[\s:]*(\d+)/i,
        /(?:young persons employed|young persons)[\s:]*(\d+)/i,
        /(?:young person)[\s:]+(\d+)/i,
        /(?:number of young persons)[\s:]*(\d+)/i,
        /under the age of 18\s*yrs?[^\n\r]*employed[^\n\r]*[\s:]*(\d+)/i,
        /general site information[\s\S]{0,500}(?:young person)[\s:]+(\d+)/i,
      ]
      for (const pattern of youngPersonsPatterns) {
        const match = originalText.match(pattern)
        if (match) {
          pdfExtractedData.youngPersonsCount = match[1]
          console.log('[EXTRACT] ✓ Found young persons count:', pdfExtractedData.youngPersonsCount)
          break
        }
      }

      // Fire drill date: use exact question comment first, then fallback date patterns.
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
        console.log('[EXTRACT] ✓ Found fire drill date:', pdfExtractedData.fireDrillDate)
      }

      // PAT testing status: exact PAT question first.
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
        const patYesMatch = originalText.match(/\bPAT\??[\s\S]{0,60}?(?:yes|satisfactory|passed|ok)/i)
          || originalText.match(/(?:pat|portable appliance|electrical.*test).*?(?:passed|satisfactory|up to date|completed|yes)/i)
          || originalText.match(/(?:fixed wiring|electrical installation).*?(?:satisfactory|passed|completed)/i)
          || originalText.match(/(?:pat testing|pat test)[\s\S]{0,30}?(?:yes|ok|satisfactory|passed)/i)
        const patDateMatch = originalText.match(/\bPAT\??[\s\S]{0,100}?last conducted[\s\S]{0,30}?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i)
        if (patYesMatch) {
          pdfExtractedData.patTestingStatus = patDateMatch?.[1] ? `Satisfactory, last conducted ${patDateMatch[1]}` : 'Satisfactory'
        }
      }
      if (pdfExtractedData.patTestingStatus) {
        console.log('[EXTRACT] ✓ Found PAT testing status:', pdfExtractedData.patTestingStatus)
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
        console.log('[EXTRACT] ✓ Found fixed wire test date:', pdfExtractedData.fixedWireTestDate)
      }

      // MEDIUM PRIORITY: Exit signage condition - more flexible patterns
      if (originalText.match(/(?:exit sign|signage|fire exit sign).*?(?:good|satisfactory|clear|visible|yes|ok)/i)
        || originalText.match(/(?:signage).*?(?:installed|visible|clearly|in place)/i)
        || originalText.match(/(?:fire exit.*sign|emergency.*sign).*?(?:good|satisfactory|visible|yes)/i)
        || originalText.match(/(?:signs.*visible|signage.*adequate|signage.*good)/i)) {
        pdfExtractedData.exitSignageCondition = 'Good condition'
        console.log('[EXTRACT] ✓ Found exit signage condition: Good')
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
        console.log('[EXTRACT] ✓ Found compartmentation status:', compartmentationStatusFromText)
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
          console.log('[EXTRACT] ✓ Found extinguisher service date:', pdfExtractedData.extinguisherServiceDate)
          break
        }
      }

      // MEDIUM PRIORITY: Call point accessibility
      if (originalText.match(/(?:call point|manual call point).*?(?:accessible|unobstructed|clear|yes)/i)
        || originalText.match(/(?:call points clear|call points.*accessible)/i)
        || originalText.match(/(?:mcp|manual call).*?(?:clear|accessible|unobstructed)/i)) {
        pdfExtractedData.callPointAccessibility = 'Accessible and unobstructed'
        console.log('[EXTRACT] ✓ Found call point accessibility: Accessible')
      }
      
      console.log('[EXTRACT] Final extracted data:', pdfExtractedData)
    }

    // FRA uses ONLY the uploaded PDF text - no database audit fallback
    // All data comes from PDF text extraction
    const sourceQuestions: Record<string, string> = {
      storeManager: 'Signature of Person in Charge of store at time of assessment.',
      conductedDate: 'Conducted on',
      assessmentStartTime: 'Conducted on (time portion, if present)',
      numberOfFloors: 'Number of floors (list ie Basement; Ground; 1st, 2nd in comments section)',
      squareFootage: 'Square Footage or Square Meterage of site',
      operatingHours: 'Web search from store details (not from H&S audit PDF)',
      firePanelLocation: 'Location of Fire Panel',
      firePanelFaults: 'Is panel free of faults',
      emergencyLightingSwitch: 'Location of Emergency Lighting Test Switch (Photograph)',
      escapeRoutesEvidence: 'Fire exit routes clear and unobstructed?',
      combustibleStorageEscapeCompromise: 'Combustible materials are stored correctly?',
      fireSafetyTrainingNarrative: 'H&S induction training onboarding... / H&S toolbox refresher training...',
      fireDoorsCondition: 'Fire doors in a good condition? / Are fire door intumescent strips in place and intact? / Fire doors closed and not held open?',
      weeklyFireTests: 'Weekly Fire Tests carried out and documented?',
      emergencyLightingMonthlyTest: 'Evidence of Monthly Emergency Lighting test being conducted?',
      fireExtinguisherService: 'Fire Extinguisher Service?',
      managementReviewStatement: 'Derived from full uploaded H&S audit content',
      numberOfFireExits: 'Number of Fire Exits',
      totalStaffEmployed: 'Number of Staff employed at the site',
      maxStaffOnSite: 'Maximum number of staff working on site at any one time',
      youngPersonsCount: 'Number of Young persons (under the age of 18 yrs) employed at the site',
      fireDrillDate: 'Fire drill has been carried out in the past 6 months and records available on site?',
      patTestingStatus: 'PAT?',
      fixedWireTestDate: 'Fixed Electrical Wiring?',
      exitSignageCondition: 'Fire exit signage / exit sign condition statements in the audit PDF',
      compartmentationStatus: 'Structure found to be in a good condition... (missing ceiling tiles / gaps from area to area?)',
      extinguisherServiceDate: 'Fire Extinguisher Service?',
      callPointAccessibility: 'Are all call points clear and easily accessible',
    }

    const extractedData = {
      storeManager: pdfExtractedData.storeManager || null,
      firePanelLocation: pdfExtractedData.firePanelLocation || null,
      firePanelFaults: pdfExtractedData.firePanelFaults || null,
      emergencyLightingSwitch: pdfExtractedData.emergencyLightingSwitch || null,
      numberOfFloors: pdfExtractedData.numberOfFloors || null,
      operatingHours: pdfExtractedData.operatingHours || null,
      conductedDate: pdfExtractedData.conductedDate || null,
      squareFootage: pdfExtractedData.squareFootage || null,
      escapeRoutesEvidence: pdfExtractedData.escapeRoutesEvidence || null,
      combustibleStorageEscapeCompromise: pdfExtractedData.combustibleStorageEscapeCompromise || null,
      fireSafetyTrainingNarrative: pdfExtractedData.fireSafetyTrainingNarrative || null,
      fireDoorsCondition: pdfExtractedData.fireDoorsCondition || null,
      weeklyFireTests: pdfExtractedData.weeklyFireTests || null,
      emergencyLightingMonthlyTest: pdfExtractedData.emergencyLightingMonthlyTest || null,
      fireExtinguisherService: pdfExtractedData.fireExtinguisherService || null,
      managementReviewStatement: pdfExtractedData.managementReviewStatement || null,
      // High priority fields
      numberOfFireExits: pdfExtractedData.numberOfFireExits || null,
      totalStaffEmployed: pdfExtractedData.totalStaffEmployed || null,
      maxStaffOnSite: pdfExtractedData.maxStaffOnSite || null,
      youngPersonsCount: pdfExtractedData.youngPersonsCount || null,
      fireDrillDate: pdfExtractedData.fireDrillDate || null,
      patTestingStatus: pdfExtractedData.patTestingStatus || null,
      fixedWireTestDate: pdfExtractedData.fixedWireTestDate || null,
      // Medium priority fields
      exitSignageCondition: pdfExtractedData.exitSignageCondition || null,
      compartmentationStatus: pdfExtractedData.compartmentationStatus || null,
      extinguisherServiceDate: pdfExtractedData.extinguisherServiceDate || null,
      callPointAccessibility: pdfExtractedData.callPointAccessibility || null,
      sources: {
        storeManager: pdfExtractedData.storeManager ? 'PDF' : 'NOT_FOUND',
        firePanelLocation: pdfExtractedData.firePanelLocation ? 'PDF' : 'NOT_FOUND',
        firePanelFaults: pdfExtractedData.firePanelFaults ? 'PDF' : 'NOT_FOUND',
        emergencyLightingSwitch: pdfExtractedData.emergencyLightingSwitch ? 'PDF' : 'NOT_FOUND',
        numberOfFloors: pdfExtractedData.numberOfFloors ? 'PDF' : 'NOT_FOUND',
        operatingHours: pdfExtractedData.operatingHours ? 'PDF' : 'NOT_FOUND',
        conductedDate: pdfExtractedData.conductedDate ? 'PDF' : 'NOT_FOUND',
        squareFootage: pdfExtractedData.squareFootage ? 'PDF' : 'NOT_FOUND',
        escapeRoutesEvidence: pdfExtractedData.escapeRoutesEvidence ? 'PDF' : 'NOT_FOUND',
        combustibleStorageEscapeCompromise: pdfExtractedData.combustibleStorageEscapeCompromise ? 'PDF' : 'NOT_FOUND',
        fireSafetyTrainingNarrative: pdfExtractedData.fireSafetyTrainingNarrative ? 'PDF' : 'NOT_FOUND',
        fireDoorsCondition: pdfExtractedData.fireDoorsCondition ? 'PDF' : 'NOT_FOUND',
        weeklyFireTests: pdfExtractedData.weeklyFireTests ? 'PDF' : 'NOT_FOUND',
        emergencyLightingMonthlyTest: pdfExtractedData.emergencyLightingMonthlyTest ? 'PDF' : 'NOT_FOUND',
        fireExtinguisherService: pdfExtractedData.fireExtinguisherService ? 'PDF' : 'NOT_FOUND',
        managementReviewStatement: pdfExtractedData.managementReviewStatement ? 'PDF' : 'NOT_FOUND',
        // High priority fields
        numberOfFireExits: pdfExtractedData.numberOfFireExits ? 'PDF' : 'NOT_FOUND',
        totalStaffEmployed: pdfExtractedData.totalStaffEmployed ? 'PDF' : 'NOT_FOUND',
        maxStaffOnSite: pdfExtractedData.maxStaffOnSite ? 'PDF' : 'NOT_FOUND',
        youngPersonsCount: pdfExtractedData.youngPersonsCount ? 'PDF' : 'NOT_FOUND',
        fireDrillDate: pdfExtractedData.fireDrillDate ? 'PDF' : 'NOT_FOUND',
        patTestingStatus: pdfExtractedData.patTestingStatus ? 'PDF' : 'NOT_FOUND',
        fixedWireTestDate: pdfExtractedData.fixedWireTestDate ? 'PDF' : 'NOT_FOUND',
        // Medium priority fields
        exitSignageCondition: pdfExtractedData.exitSignageCondition ? 'PDF' : 'NOT_FOUND',
        compartmentationStatus: pdfExtractedData.compartmentationStatus ? 'PDF' : 'NOT_FOUND',
        extinguisherServiceDate: pdfExtractedData.extinguisherServiceDate ? 'PDF' : 'NOT_FOUND',
        callPointAccessibility: pdfExtractedData.callPointAccessibility ? 'PDF' : 'NOT_FOUND',
      },
      sourceQuestions,
      hasPdfText: !!pdfText,
      hasDatabaseAudit: false, // FRA doesn't use database audits
      pdfTextLength: pdfText?.length || 0,
      // Debug info
      pdfExtractedCount: Object.keys(pdfExtractedData).filter(k => pdfExtractedData[k] !== null).length,
      dbExtractedCount: 0, // Not used for FRA
    }
    
    console.log('[EXTRACT] Summary:', {
      pdfExtracted: extractedData.pdfExtractedCount,
      dbExtracted: extractedData.dbExtractedCount,
      totalFields: 8,
    })

    // Include raw PDF text for debugging (first 5000 chars)
    const responseData = {
      ...extractedData,
      rawPdfText: pdfText ? pdfText.substring(0, 5000) + (pdfText.length > 5000 ? '...' : '') : null,
    }

    console.log('[EXTRACT] Returning response with:', {
      hasPdfText: responseData.hasPdfText,
      hasDatabaseAudit: responseData.hasDatabaseAudit,
      pdfTextLength: responseData.pdfTextLength,
      fieldCount: Object.keys(extractedData).filter(k => !k.startsWith('_') && k !== 'sources' && k !== 'sourceQuestions' && k !== 'hasPdfText' && k !== 'hasDatabaseAudit' && k !== 'pdfTextLength' && k !== 'rawPdfText' && k !== 'pdfExtractedCount' && k !== 'dbExtractedCount').length,
      extractedFields: Object.keys(extractedData).filter(k => (extractedData as Record<string, unknown>)[k] !== null && !k.startsWith('_') && k !== 'sources' && k !== 'sourceQuestions' && k !== 'hasPdfText' && k !== 'hasDatabaseAudit' && k !== 'pdfTextLength' && k !== 'rawPdfText' && k !== 'pdfExtractedCount' && k !== 'dbExtractedCount')
    })

    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error('Error extracting FRA data:', error)
    return NextResponse.json(
      { error: 'Failed to extract FRA data', details: error.message },
      { status: 500 }
    )
  }
}
