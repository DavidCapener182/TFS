import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLatestHSAuditForStore } from '@/app/actions/fra-reports'
import { getAuditInstance } from '@/app/actions/safehub'

export const dynamic = 'force-dynamic'

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

/**
 * Preview extracted data from H&S audit (PDF or database) for FRA generation
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
    
    if (!fraInstance || (fraInstance.tfs_audit_templates as any)?.category !== 'fire_risk_assessment') {
      return NextResponse.json({ error: 'Invalid FRA audit instance' }, { status: 400 })
    }

    const store = fraInstance.tfs_stores as any
    const storeId = store.id

    // Get the most recent H&S audit for this store (check for uploaded PDFs too)
    const hsAuditResult = await getLatestHSAuditForStore(storeId, instanceId)
    const hsAudit = hsAuditResult.audit
    const pdfText = hsAuditResult.pdfText
    
    // Extract data from PDF text if available
    let pdfExtractedData: Record<string, string | null> = {}
    if (pdfText) {
      pdfExtractedData = extractFromPDFText(pdfText, [
        // Store Manager / Person in Charge
        {
          key: 'storeManager',
          regex: /(?:signature of person in charge|person in charge|store manager name|manager name)[\s:]*([^\n\r]+?)(?:\n|$|\*\*|22|jan|2026)/i,
          extract: (match) => {
            const text = match[1] || match[0]
            return text.replace(/\*\*/g, '').replace(/\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}/gi, '').trim()
          }
        },
        // Fire Panel Location
        {
          key: 'firePanelLocation',
          regex: /(?:location of fire panel|fire panel location)[\s:]*([^\n\r]+?)(?:\n|$)/i
        },
        // Fire Panel Faults
        {
          key: 'firePanelFaults',
          regex: /(?:is panel free of faults|panel free of faults|panel faults)[\s:]*([^\n\r]+?)(?:\n|$)/i
        },
        // Emergency Lighting Switch Location
        {
          key: 'emergencyLightingSwitch',
          regex: /(?:location of emergency lighting test switch|emergency lighting test switch|emergency lighting switch)[\s:]*([^\n\r]+?)(?:\n|$)/i
        },
        // Number of Floors
        {
          key: 'numberOfFloors',
          regex: /(?:number of floors|floors?)[\s:]*(\d+)/i
        },
        // Operating Hours
        {
          key: 'operatingHours',
          regex: /(?:operating hours|trading hours|opening hours|store hours)[\s:]*([^\n\r]+?)(?:\n|$)/i
        },
        // Conducted Date
        {
          key: 'conductedDate',
          regex: /(?:conducted on|conducted at|assessment date)[\s:]*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i
        },
        // Square Footage
        {
          key: 'squareFootage',
          regex: /(?:square footage|square meterage|floor area)[\s:]*([^\n\r\d]+?\d+[^\n\r]*?)(?:\n|$)/i
        }
      ])
    }

    // Get template data for database extraction
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
        }
      }
    }

    // Helper to find answer from database responses
    const findAnswer = (questionPattern: string): { value: any; comment?: string } | null => {
      const audit = hsAudit as any
      if (!audit?.responses || !hsTemplateData) return null

      const normalizedPattern = questionPattern.toLowerCase().trim()
      
      for (const section of hsTemplateData.sections) {
        const questions = (section as any).tfs_audit_template_questions || []
        for (const question of questions) {
          const questionText = question.question_text?.toLowerCase() || ''
          
          if (questionText === normalizedPattern || questionText.includes(normalizedPattern) || normalizedPattern.includes(questionText)) {
            const response = audit.responses.find((r: any) => r.question_id === question.id)
            if (response) {
              const responseValue = response.response_value || response.response_json
              const responseComment = typeof response.response_json === 'object' && response.response_json?.comment
                ? response.response_json.comment
                : undefined
              
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
            }
          }
        }
      }
      
      return null
    }

    // Extract all relevant data
    const extractedData = {
      // Store Manager
      storeManager: pdfExtractedData.storeManager 
        || findAnswer('Store Manager Name')?.value 
        || findAnswer('Signature of Person in Charge of store at time of assessment')?.value
        || findAnswer('Signature of Person in Charge')?.value
        || null,
      storeManagerSource: pdfExtractedData.storeManager ? 'PDF' : (findAnswer('Store Manager Name') || findAnswer('Signature of Person in Charge') ? 'H&S_AUDIT' : 'NOT_FOUND'),

      // Assessment Date
      assessmentDate: pdfExtractedData.conductedDate 
        || (hsAudit as any)?.conducted_at 
        || fraInstance.conducted_at 
        || null,
      assessmentDateSource: pdfExtractedData.conductedDate ? 'PDF' : ((hsAudit as any)?.conducted_at ? 'H&S_AUDIT' : 'FRA_INSTANCE'),

      // Fire Panel Location
      firePanelLocation: pdfExtractedData.firePanelLocation 
        || findAnswer('Location of Fire Panel')?.value 
        || findAnswer('Fire Panel Location')?.value
        || null,
      firePanelLocationSource: pdfExtractedData.firePanelLocation ? 'PDF' : (findAnswer('Location of Fire Panel') ? 'H&S_AUDIT' : 'NOT_FOUND'),

      // Fire Panel Faults
      firePanelFaults: pdfExtractedData.firePanelFaults 
        || findAnswer('Is panel free of faults')?.value
        || null,
      firePanelFaultsSource: pdfExtractedData.firePanelFaults ? 'PDF' : (findAnswer('Is panel free of faults') ? 'H&S_AUDIT' : 'NOT_FOUND'),

      // Emergency Lighting Switch
      emergencyLightingSwitch: pdfExtractedData.emergencyLightingSwitch 
        || findAnswer('Location of Emergency Lighting Test Switch')?.value
        || findAnswer('Emergency Lighting Test Switch')?.value
        || null,
      emergencyLightingSwitchSource: pdfExtractedData.emergencyLightingSwitch ? 'PDF' : (findAnswer('Location of Emergency Lighting Test Switch') ? 'H&S_AUDIT' : 'NOT_FOUND'),

      // Number of Floors
      numberOfFloors: pdfExtractedData.numberOfFloors 
        || findAnswer('Number of floors')?.value
        || findAnswer('floors')?.value
        || null,
      numberOfFloorsSource: pdfExtractedData.numberOfFloors ? 'PDF' : (findAnswer('Number of floors') ? 'H&S_AUDIT' : 'NOT_FOUND'),

      // Operating Hours
      operatingHours: pdfExtractedData.operatingHours 
        || findAnswer('operating hours')?.value
        || findAnswer('trading hours')?.value
        || null,
      operatingHoursSource: pdfExtractedData.operatingHours ? 'PDF' : (findAnswer('operating hours') ? 'H&S_AUDIT' : 'NOT_FOUND'),

      // Square Footage
      squareFootage: pdfExtractedData.squareFootage 
        || findAnswer('Square Footage')?.value
        || findAnswer('Square Meterage')?.value
        || null,
      squareFootageSource: pdfExtractedData.squareFootage ? 'PDF' : (findAnswer('Square Footage') ? 'H&S_AUDIT' : 'NOT_FOUND'),

      // Metadata
      hasPDF: !!pdfText,
      hasHSAudit: !!hsAudit,
      pdfTextLength: pdfText?.length || 0,
      storeName: store.store_name,
      storeAddress: [
        store.address_line_1,
        store.city,
        store.postcode,
        store.region
      ].filter(Boolean).join(', ')
    }

    return NextResponse.json(extractedData)
  } catch (error: any) {
    console.error('Error previewing FRA data:', error)
    return NextResponse.json(
      { error: 'Failed to preview FRA data', details: error.message },
      { status: 500 }
    )
  }
}
