import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLatestHSAuditForStore } from '@/app/actions/fra-reports'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Polyfill DOMMatrix for Node (pdf-parse/pdf.js can reference it; avoids "DOMMatrix is not defined" in prod)
    if (typeof (globalThis as any).DOMMatrix === 'undefined') {
      try {
        const dommatrix = await import('@thednp/dommatrix')
        const DOMMatrixClass = (dommatrix as any).default ?? (dommatrix as any).DOMMatrix
        if (DOMMatrixClass) (globalThis as any).DOMMatrix = DOMMatrixClass
      } catch (_) {
        // ignore polyfill failure
      }
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const fraInstanceId = formData.get('fraInstanceId') as string | null
    const storeId = formData.get('storeId') as string | null

    if (!file || !fraInstanceId || !storeId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    // Parse PDF to extract text on the server.
    // Use the Node parser path first; browser-style worker bootstrapping is brittle on Vercel.
    let pdfText = ''
    let parseError: string | null = null
    
    try {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      const resolveParser = (mod: any) => {
        // Match EXACTLY the audit-import route which works
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
        // If parser is a function, try calling it (for default export that's a function)
        if (typeof parser === 'function') {
          try {
            return await parser(input)
          } catch (error: any) {
            // "Class constructor PDFParse cannot be invoked without 'new'"
            // PDFParse is a class: use new parser({ data: input }) then instance.getText()
            if (String(error?.message || '').includes('cannot be invoked without') || 
                String(error?.message || '').includes('Class constructor')) {
              const instance = new parser({ data: input })
              if (typeof instance.getText === 'function') {
                const result = await instance.getText()
                await instance.destroy?.()
                return result // { text: string, ... }
              }
            }
            throw error
          }
        }
        if (parser && typeof parser.parse === 'function') {
          return await parser.parse(input)
        }
        if (parser && typeof parser.PDFParse === 'function') {
          const instance = new parser.PDFParse({ data: input })
          if (typeof instance.getText === 'function') {
            const result = await instance.getText()
            await instance.destroy?.()
            return result
          }
          throw new Error('PDFParse instance has no getText method')
        }
        throw new Error('No valid pdf parser function found')
      }

      const extractWithPdfJs = async (input: Buffer): Promise<string> => {
        const { createRequire } = await import('module')
        const requireMod = createRequire(process.cwd() + '/package.json')
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        try {
          const workerSrc = requireMod.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
          if ((pdfjs as any).GlobalWorkerOptions) {
            (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc
          }
        } catch (workerResolveError: any) {
          console.warn('[PARSE] Could not resolve pdf.worker.mjs for pdfjs-dist:', workerResolveError?.message)
        }
        const loadingTask = (pdfjs as any).getDocument({
          data: new Uint8Array(input),
          disableWorker: true,
        })
        const pdf = await loadingTask.promise
        const numPages = pdf.numPages
        const pageLimit = Math.min(numPages, 50)
        const pages: string[] = []
        for (let i = 1; i <= pageLimit; i += 1) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const strings = (content.items as { str?: string }[]).map((item) => item.str ?? '')
          pages.push(strings.join(' '))
        }
        return pages.join('\n\n')
      }

      let parser: any = null

      try {
        const { createRequire } = await import('module')
        const requireMod = createRequire(process.cwd() + '/package.json')
        const mod = requireMod('pdf-parse')
        parser = resolveParser(mod)
        if (!parser) {
          throw new Error(`pdf-parse export not callable. Keys: ${Object.keys(mod || {}).join(', ')}`)
        }
        console.log('[PARSE] pdf-parse loaded via require')
      } catch (requireError: any) {
        console.warn('[PARSE] require(\"pdf-parse\") failed:', requireError?.message)
        try {
          const mod = await import('pdf-parse/node')
          parser = resolveParser(mod)
          if (!parser) {
            throw new Error(`pdf-parse/node export not callable. Keys: ${Object.keys(mod || {}).join(', ')}`)
          }
        } catch (error: any) {
          console.error('[PARSE] pdf-parse/node load failed:', error)
          try {
            const mod = await import('pdf-parse')
            parser = resolveParser(mod)
            if (!parser) {
              throw new Error(`pdf-parse export not callable. Keys: ${Object.keys(mod || {}).join(', ')}`)
            }
          } catch (fallbackError: any) {
            console.error('[PARSE] pdf-parse fallback failed, will try pdfjs-dist:', fallbackError)
            parseError = `pdf-parse failed: ${fallbackError.message}`
            parser = null
          }
        }
      }

      if ((!pdfText || pdfText.trim().length === 0) && parser) {
        console.log('[PARSE] Calling runParser with buffer length:', buffer.length)
        try {
          const parsed = await runParser(parser, buffer)
          console.log('[PARSE] runParser completed, result type:', typeof parsed, 'has text:', !!parsed?.text)
          pdfText = parsed?.text || parsed || ''
          console.log('[PARSE] Extracted text length:', pdfText.length)
        } catch (runError: any) {
          console.error('[PARSE] runParser failed:', runError.message, runError.stack)
          parseError = `Parser execution failed: ${runError.message}`
          parser = null
        }
      }

      if (!pdfText || pdfText.trim().length === 0) {
        try {
          console.log('[PARSE] Trying pdfjs-dist fallback...')
          pdfText = await extractWithPdfJs(buffer)
          if (pdfText.trim().length > 0) {
            console.log('[PARSE] ✓ pdfjs-dist extracted text length:', pdfText.length)
            parseError = null
          }
        } catch (pdfjsError: any) {
          console.error('[PARSE] pdfjs-dist fallback extraction failed:', pdfjsError?.message)
          parseError = pdfjsError?.message || parseError || 'PDF text extraction failed'
        }
      }
    } catch (error: any) {
      console.error('[PARSE] Error parsing PDF (will continue anyway):', error.message, error.stack)
      parseError = error.message || 'Unknown parsing error'
      // Don't return error - continue to upload the PDF anyway
    }

    console.log('[PARSE] PDF parsing result:', {
      pdfTextLength: pdfText?.length || 0,
      hasText: !!(pdfText && pdfText.trim().length > 0),
      parseError: parseError || null,
      firstChars: pdfText ? pdfText.substring(0, 100) : null
    })
    
    if (!pdfText || pdfText.trim().length === 0) {
      // Don't fail if no text - the PDF might be image-based
      console.warn('[PARSE] No text extracted from PDF - may be image-based')
      if (parseError) {
        console.error('[PARSE] Parse error details:', parseError)
      }
    }

    // Store the parsed text temporarily - we'll use it when generating the FRA
    // For now, we can create or update a record to store this parsed data
    // Option 1: Store in the FRA instance as metadata
    // Option 2: Create a temporary H&S audit instance from the PDF
    // Option 3: Store the parsed text and use it when generating FRA
    
    // For simplicity, we'll store the parsed text in the FRA instance's metadata
    // and use the existing H&S audit parsing logic when generating the FRA report
    
    // Upload the PDF to storage for reference
    const fileExt = 'pdf'
    const timestamp = Date.now()
    const fileName = `hs-audit-${fraInstanceId}-${timestamp}.${fileExt}`
    const filePath = `fra/${fraInstanceId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('fa-attachments')
      .upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError)
      // Continue even if upload fails - we still have the parsed text
    }

    // Store parsed text in the FRA instance's first question response_json for later retrieval
    // Get the FRA instance first to get template_id
    const { data: fraInstance } = await supabase
      .from('fa_audit_instances')
      .select('template_id')
      .eq('id', fraInstanceId)
      .single()

    if (fraInstance?.template_id && pdfText) {
      console.log('[PARSE] Storing PDF text for FRA instance:', fraInstanceId, 'template:', fraInstance.template_id)
      
      // Get the first question of the FRA template
      // First check if ANY sections exist
      const { data: allSectionsCheck, error: sectionsCheckError } = await supabase
        .from('fa_audit_template_sections')
        .select('id, title, order_index')
        .eq('template_id', fraInstance.template_id)
        .order('order_index', { ascending: true })
      
      console.log('[PARSE] Template sections query result:', {
        error: sectionsCheckError?.message || null,
        count: allSectionsCheck?.length || 0,
        sections: allSectionsCheck?.map(s => ({ id: s.id, title: s.title, order: s.order_index })) || []
      })
      
      // If no sections exist, create fallback storage section/question
      if (!allSectionsCheck || allSectionsCheck.length === 0) {
        console.log('[PARSE] No sections found - creating PDF Storage section/question...')
        
        // Create a section for PDF storage
        const { data: storageSection, error: sectionError } = await supabase
          .from('fa_audit_template_sections')
          .insert({
            template_id: fraInstance.template_id,
            title: 'PDF Storage',
            order_index: 0
          })
          .select()
          .single()
        
        if (sectionError || !storageSection) {
          console.error('[PARSE] Failed to create storage section:', sectionError)
          parseError = `Template has no sections and failed to create storage: ${sectionError?.message || 'Unknown error'}`
        } else {
          console.log('[PARSE] ✓ Created storage section:', storageSection.id)
          
          // Create a question for PDF storage
          const { data: storageQuestion, error: questionError } = await supabase
            .from('fa_audit_template_questions')
            .insert({
              section_id: storageSection.id,
              question_text: 'H&S Audit PDF Text Storage',
              question_type: 'text',
              order_index: 0,
              is_required: false
            })
            .select()
            .single()
          
          if (questionError || !storageQuestion) {
            console.error('[PARSE] Failed to create storage question:', questionError)
            parseError = `Created section but failed to create question: ${questionError?.message || 'Unknown error'}`
          } else {
            console.log('[PARSE] ✓ Created storage question:', storageQuestion.id)
            
            // Now store the PDF text in this question
            // Check if response exists first
            const { data: existingFallbackResponse } = await supabase
              .from('fa_audit_responses')
              .select('id')
              .eq('audit_instance_id', fraInstanceId)
              .eq('question_id', storageQuestion.id)
              .maybeSingle()
            
            let storageError: any = null
            const storageData = {
              fra_pdf_text: pdfText,
              fra_pdf_path: uploadError ? null : filePath,
              parsed_at: new Date().toISOString()
            }
            
            if (existingFallbackResponse) {
              // Update existing response
              const { error: updateError } = await supabase
                .from('fa_audit_responses')
                .update({
                  response_json: storageData
                })
                .eq('id', existingFallbackResponse.id)
              
              storageError = updateError
            } else {
              // Insert new response
              const { error: insertError } = await supabase
                .from('fa_audit_responses')
                .insert({
                  audit_instance_id: fraInstanceId,
                  question_id: storageQuestion.id,
                  response_json: storageData
                })
              
              storageError = insertError
            }
            
            if (storageError) {
              console.error('[PARSE] Failed to store PDF text in fallback question:', storageError)
              parseError = `Created storage question but failed to store PDF: ${storageError.message}`
            } else {
              console.log('[PARSE] ✓ Successfully stored PDF text in fallback question:', storageQuestion.id, 'length:', pdfText.length)
            }
          }
        }
      }
      
      // Now try normal path with first section (either existing or newly created)
      const { data: sections } = await supabase
        .from('fa_audit_template_sections')
        .select('id, title, order_index')
        .eq('template_id', fraInstance.template_id)
        .order('order_index', { ascending: true })
      
      const firstSection = sections && sections.length > 0 ? sections[0] : null

      if (firstSection) {
        console.log('[PARSE] First section found:', firstSection.id, 'title:', firstSection.title)
        const { data: firstQuestion } = await supabase
          .from('fa_audit_template_questions')
          .select('id')
          .eq('section_id', firstSection.id)
          .order('order_index', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (firstQuestion) {
          console.log('[PARSE] First question found:', firstQuestion.id)
          console.log('[PARSE] Preparing to store PDF text in question:', firstQuestion.id)
          
          // Get existing response to preserve other data
          const { data: existingResponse, error: existingError } = await supabase
            .from('fa_audit_responses')
            .select('response_json, id')
            .eq('audit_instance_id', fraInstanceId)
            .eq('question_id', firstQuestion.id)
            .maybeSingle()

          if (existingError) {
            console.error('[PARSE] Error checking existing response:', existingError)
          }
          
          console.log('[PARSE] Existing response:', existingResponse ? 'found' : 'not found', 'existing keys:', existingResponse ? Object.keys(existingResponse.response_json || {}) : 'none')
          
          const existingJson = existingResponse?.response_json || {}
          
          // Build the response_json object with PDF text
          // Ensure we're creating a proper JSONB object
          const responseJsonData: any = {
            ...(existingJson && typeof existingJson === 'object' ? existingJson : {}),
            fra_pdf_text: pdfText,
            fra_pdf_path: uploadError ? null : filePath,
            parsed_at: new Date().toISOString()
          }
          
          console.log('[PARSE] Storing response_json with keys:', Object.keys(responseJsonData), 'pdfText length:', pdfText.length)
          console.log('[PARSE] Response JSON data type check:', {
            isObject: typeof responseJsonData === 'object',
            hasPdfText: !!responseJsonData.fra_pdf_text,
            pdfTextType: typeof responseJsonData.fra_pdf_text,
            pdfTextLength: responseJsonData.fra_pdf_text?.length
          })
          
          // Store the parsed PDF text in the response_json
          // Check if response exists first (no unique constraint on audit_instance_id,question_id)
          const { data: existingResponseForUpdate } = await supabase
            .from('fa_audit_responses')
            .select('id')
            .eq('audit_instance_id', fraInstanceId)
            .eq('question_id', firstQuestion.id)
            .maybeSingle()
          
          let upsertError: any = null
          let upsertData: any[] | null = null
          
          if (existingResponseForUpdate) {
            // Update existing response
            const { error: updateError, data: updateData } = await supabase
              .from('fa_audit_responses')
              .update({
                response_json: responseJsonData
              })
              .eq('id', existingResponseForUpdate.id)
              .select('id, response_json')
            
            upsertError = updateError
            upsertData = updateData ? [updateData] : null
          } else {
            // Insert new response
            const { error: insertError, data: insertData } = await supabase
              .from('fa_audit_responses')
              .insert({
                audit_instance_id: fraInstanceId,
                question_id: firstQuestion.id,
                response_json: responseJsonData
              })
              .select('id, response_json')
            
            upsertError = insertError
            upsertData = insertData
          }
          
          console.log('[PARSE] Upsert result:', {
            error: upsertError ? upsertError.message : null,
            success: !upsertError,
            returnedRows: upsertData?.length || 0,
            firstRowId: upsertData?.[0]?.id || null,
            firstRowHasPdfText: !!upsertData?.[0]?.response_json?.fra_pdf_text
          })
          
          if (upsertData && upsertData.length > 0) {
            console.log('[PARSE] Upsert returned data keys:', Object.keys(upsertData[0].response_json || {}))
          }

          if (upsertError) {
            console.error('[PARSE] ✗ Error storing parsed PDF text:', upsertError)
            console.error('[PARSE] Upsert details:', {
              audit_instance_id: fraInstanceId,
              question_id: firstQuestion.id,
              pdfTextLength: pdfText.length,
              errorCode: upsertError.code,
              errorMessage: upsertError.message,
              errorDetails: upsertError.details
            })
            // Don't throw - log the error but continue (we'll still have the PDF uploaded)
            parseError = `PDF parsed but storage failed: ${upsertError.message}`
          } else {
            console.log('[PARSE] ✓ Successfully stored parsed PDF text in question:', firstQuestion.id, 'length:', pdfText.length)
            // Verify it was stored - wait a moment for database consistency
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // Try multiple times to verify storage (database replication delay)
            let verified = false
            for (let attempt = 0; attempt < 3; attempt++) {
              const { data: verifyResponse, error: verifyError } = await supabase
                .from('fa_audit_responses')
                .select('response_json')
                .eq('audit_instance_id', fraInstanceId)
                .eq('question_id', firstQuestion.id)
                .maybeSingle()
              
              if (verifyError) {
                console.error(`[PARSE] ✗ Error verifying storage (attempt ${attempt + 1}):`, verifyError)
              } else if (verifyResponse?.response_json?.fra_pdf_text) {
                console.log(`[PARSE] ✓ Verified: PDF text is stored, length: ${verifyResponse.response_json.fra_pdf_text.length} (attempt ${attempt + 1})`)
                verified = true
                break
              } else {
                console.log(`[PARSE] Verification attempt ${attempt + 1} failed: PDF text not found. Response:`, verifyResponse ? Object.keys(verifyResponse.response_json || {}) : 'no response')
                if (attempt < 2) {
                  await new Promise(resolve => setTimeout(resolve, 500))
                }
              }
            }
            
            if (!verified) {
              console.error('[PARSE] ✗ Verification failed after 3 attempts. PDF text may not be stored correctly.')
              // Even if verification fails, log what we tried to store
              console.error('[PARSE] Attempted to store in instance:', fraInstanceId, 'question:', firstQuestion.id)
            }
          }
        } else {
          console.warn('[PARSE] No first question found for template section:', firstSection.id)
          // Check if ANY questions exist for this section
          const { data: allQuestions } = await supabase
            .from('fa_audit_template_questions')
            .select('id, question_text, order_index')
            .eq('section_id', firstSection.id)
            .order('order_index', { ascending: true })
          console.log('[PARSE] Questions in section:', allQuestions?.length || 0, allQuestions?.map(q => ({ id: q.id, text: q.question_text?.substring(0, 50) })) || [])
        }
      } else {
        console.warn('[PARSE] No first section found for template:', fraInstance.template_id)
        // Check if ANY sections exist for this template
        const { data: allSections } = await supabase
          .from('fa_audit_template_sections')
          .select('id, title, order_index')
          .eq('template_id', fraInstance.template_id)
          .order('order_index', { ascending: true })
        console.warn('[PARSE] Total sections for template:', allSections?.length || 0, allSections?.map(s => ({ id: s.id, title: s.title })) || [])
        
        // If no sections exist, we can't store in response_json using the normal method
        // FALLBACK: Store it in a special metadata response or create a dummy section/question
        // For now, let's try to find ANY question in ANY section, or create a storage mechanism
        if (!allSections || allSections.length === 0) {
          console.error('[PARSE] CRITICAL: Template has no sections - using fallback storage')
          
          // FALLBACK: Store PDF text in instance metadata by creating a special response
          // We'll need to create a temporary section/question or use a different storage method
          // For now, let's try to store it in the first available question from ANY template
          // OR we can store it in a special way that doesn't require a question
          
          // Actually, let's check if we can just store it without a question_id
          // But that won't work because question_id is required in fa_audit_responses
          
          // Better approach: Create a minimal section and question for PDF storage if they don't exist
          console.log('[PARSE] Attempting to create storage section/question for PDF text...')
          
          // Create a section for PDF storage
          const { data: storageSection, error: sectionError } = await supabase
            .from('fa_audit_template_sections')
            .insert({
              template_id: fraInstance.template_id,
              title: 'PDF Storage',
              order_index: 0
            })
            .select()
            .single()
          
          if (sectionError || !storageSection) {
            console.error('[PARSE] Failed to create storage section:', sectionError)
          } else {
            console.log('[PARSE] Created storage section:', storageSection.id)
            
            // Create a question for PDF storage
            const { data: storageQuestion, error: questionError } = await supabase
              .from('fa_audit_template_questions')
              .insert({
                section_id: storageSection.id,
                question_text: 'H&S Audit PDF Text Storage',
                question_type: 'text',
                order_index: 0,
                is_required: false
              })
              .select()
              .single()
            
            if (questionError || !storageQuestion) {
              console.error('[PARSE] Failed to create storage question:', questionError)
            } else {
              console.log('[PARSE] Created storage question:', storageQuestion.id)
              
              // Now store the PDF text
              // Check if response exists first (no unique constraint)
              const { data: existingStorageResponse } = await supabase
                .from('fa_audit_responses')
                .select('id')
                .eq('audit_instance_id', fraInstanceId)
                .eq('question_id', storageQuestion.id)
                .maybeSingle()
              
              const storageData = {
                fra_pdf_text: pdfText,
                fra_pdf_path: uploadError ? null : filePath,
                parsed_at: new Date().toISOString()
              }
              
              let storageError: any = null
              
              if (existingStorageResponse) {
                // Update existing response
                const { error: updateError } = await supabase
                  .from('fa_audit_responses')
                  .update({
                    response_json: storageData
                  })
                  .eq('id', existingStorageResponse.id)
                
                storageError = updateError
              } else {
                // Insert new response
                const { error: insertError } = await supabase
                  .from('fa_audit_responses')
                  .insert({
                    audit_instance_id: fraInstanceId,
                    question_id: storageQuestion.id,
                    response_json: storageData
                  })
                
                storageError = insertError
              }
              
              if (storageError) {
                console.error('[PARSE] Failed to store PDF text in fallback question:', storageError)
              } else {
                console.log('[PARSE] ✓ Successfully stored PDF text in fallback question:', storageQuestion.id)
              }
            }
          }
        }
      }
    } else {
      if (!fraInstance?.template_id) {
        console.warn('[PARSE] No template_id found for FRA instance:', fraInstanceId)
      }
      if (!pdfText) {
        console.warn('[PARSE] No PDF text to store')
      }
    }
    
    // Check if storage was successful by doing a final verification
    let storageVerified = false
    let storageError = null
    if (fraInstance?.template_id && pdfText.length > 0) {
      // Do one final check to see if storage worked
      try {
        const { data: finalCheck } = await supabase
          .from('fa_audit_template_sections')
          .select('id')
          .eq('template_id', fraInstance.template_id)
          .order('order_index', { ascending: true })
          .limit(1)
          .maybeSingle()
        
        if (finalCheck) {
          const { data: finalQuestion } = await supabase
            .from('fa_audit_template_questions')
            .select('id')
            .eq('section_id', finalCheck.id)
            .order('order_index', { ascending: true })
            .limit(1)
            .maybeSingle()
          
          if (finalQuestion) {
            const { data: finalResponse } = await supabase
              .from('fa_audit_responses')
              .select('response_json')
              .eq('audit_instance_id', fraInstanceId)
              .eq('question_id', finalQuestion.id)
              .maybeSingle()
            
            if (finalResponse?.response_json?.fra_pdf_text) {
              storageVerified = true
              console.log('[PARSE] ✓ Final verification: PDF text is stored')
            } else {
              storageError = 'PDF text not found in final verification'
              console.error('[PARSE] ✗ Final verification failed:', storageError)
            }
          }
        }
      } catch (verifyErr: any) {
        storageError = verifyErr.message
        console.error('[PARSE] ✗ Final verification error:', storageError)
      }
    }
    
    // Log final status with storage details
    console.log('[PARSE] Final status:', {
      pdfTextLength: pdfText.length,
      hasText: pdfText.length > 0,
      stored: storageVerified,
      storageError: storageError || null,
      parseError: parseError || null,
      instanceId: fraInstanceId,
      templateId: fraInstance?.template_id || null
    })
    
    // Return success - the FRA generation will use this parsed data
    // Even if parsing failed, we still uploaded the PDF
    return NextResponse.json({
      success: true,
      message: pdfText 
        ? 'H&S audit PDF parsed successfully' 
        : parseError 
          ? `H&S audit PDF uploaded (parsing failed: ${parseError})`
          : 'H&S audit PDF uploaded (text extraction not available)',
      filePath: uploadError ? null : filePath,
      textLength: pdfText.length,
      hasText: pdfText.length > 0,
      parseError: parseError || null,
      stored: storageVerified,
      storageError: storageError || null,
      instanceId: fraInstanceId,
      templateId: fraInstance?.template_id || null
    })
  } catch (error: any) {
    console.error('Error parsing H&S audit:', error)
    return NextResponse.json(
      { error: 'Failed to parse H&S audit', details: error.message },
      { status: 500 }
    )
  }
}
