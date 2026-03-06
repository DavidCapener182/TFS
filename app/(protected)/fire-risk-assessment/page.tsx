import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { FRARow } from '@/components/fra/fra-table'
import { FRATrackerClient } from '@/components/fra/fra-tracker-client'
import { extractFraRiskRatingFromResponses } from '@/lib/fra/risk-rating-from-responses'

async function getStoreFRAs() {
  const supabase = createClient()
  
  // Use same base query as audit tracker to ensure we get all stores
  // Don't select fire_risk_assessment_pct here - fetch it separately if it exists
  const { data, error } = await supabase
    .from('fa_stores')
    .select('id, store_code, store_name, region, city, is_active, compliance_audit_1_date, compliance_audit_2_date')
    .order('region', { ascending: true })
    .order('store_name', { ascending: true })

  if (error) {
    console.error('Error fetching store FRAs:', error)
    return []
  }

  // Add FRA columns (will be null if columns don't exist yet - migration not run)
  const storesWithFRA = (data || []).map(store => ({
    ...store,
    fire_risk_assessment_date: null as string | null,
    fire_risk_assessment_pdf_path: null as string | null,
    fire_risk_assessment_notes: null as string | null,
    fire_risk_assessment_pct: null as number | null,
    fire_risk_assessment_rating: null as string | null,
  }))

  // Try to fetch FRA data if columns exist
  if (storesWithFRA.length > 0) {
    try {
      const storeIds = storesWithFRA.map(s => s.id)
      // Try to fetch with percentage first, fallback to without if column doesn't exist
      let { data: fraData, error: fraError } = await supabase
        .from('fa_stores')
        .select('id, fire_risk_assessment_date, fire_risk_assessment_pdf_path, fire_risk_assessment_notes, fire_risk_assessment_pct')
        .in('id', storeIds)
      
      // If error is about missing column, try without percentage
      if (fraError && fraError.message?.includes('fire_risk_assessment_pct')) {
        const { data: fraDataWithoutPct, error: fraError2 } = await supabase
          .from('fa_stores')
          .select('id, fire_risk_assessment_date, fire_risk_assessment_pdf_path, fire_risk_assessment_notes')
          .in('id', storeIds)
        
        if (!fraError2 && fraDataWithoutPct) {
          // Add missing percentage field for type safety and downstream usage
          fraData = fraDataWithoutPct.map(f => ({
            ...f,
            fire_risk_assessment_pct: null,
          }))
          fraError = null
        }
      }
      
      if (fraData && !fraError) {
        const fraMap = new Map(fraData.map(f => [f.id, f]))
        storesWithFRA.forEach(store => {
          const fra = fraMap.get(store.id)
          if (fra) {
            store.fire_risk_assessment_date = fra.fire_risk_assessment_date
            store.fire_risk_assessment_pdf_path = fra.fire_risk_assessment_pdf_path
            store.fire_risk_assessment_notes = fra.fire_risk_assessment_notes
            // Only set percentage if it exists in the data
            if ('fire_risk_assessment_pct' in fra) {
              store.fire_risk_assessment_pct = (fra as any).fire_risk_assessment_pct || null
            }
          }
        })
      }
    } catch (e) {
      // FRA columns don't exist yet - that's okay, they'll all be null
      console.log('FRA columns not available yet (migration may not be run):', e)
    }
  }

  if (storesWithFRA.length > 0) {
    try {
      const storeIds = storesWithFRA.map((store) => store.id)
      let completedFraAudits: any[] | null = null
      let completedFraAuditsError: any = null

      const primary = await supabase
        .from('fa_audit_instances')
        .select(`
          store_id,
          fra_overall_risk_rating,
          conducted_at,
          created_at,
          fa_audit_templates!inner ( category ),
          fa_audit_responses (
            response_value,
            response_json,
            fa_audit_template_questions ( question_text )
          )
        `)
        .in('store_id', storeIds)
        .eq('status', 'completed')
        .order('conducted_at', { ascending: false })
        .order('created_at', { ascending: false })

      completedFraAudits = primary.data
      completedFraAuditsError = primary.error

      if (completedFraAuditsError?.message?.includes('fra_overall_risk_rating')) {
        const fallback = await supabase
          .from('fa_audit_instances')
          .select(`
            store_id,
            conducted_at,
            created_at,
            fa_audit_templates!inner ( category ),
            fa_audit_responses (
              response_value,
              response_json,
              fa_audit_template_questions ( question_text )
            )
          `)
          .in('store_id', storeIds)
          .eq('status', 'completed')
          .order('conducted_at', { ascending: false })
          .order('created_at', { ascending: false })

        completedFraAudits = fallback.data
        completedFraAuditsError = fallback.error
      }

      if (completedFraAuditsError) {
        console.error('Error fetching FRA risk ratings:', completedFraAuditsError)
      } else {
        const ratingByStoreId = new Map<string, string | null>()

        for (const audit of (completedFraAudits || []) as any[]) {
          if ((audit.fa_audit_templates as any)?.category !== 'fire_risk_assessment') continue
          if (!audit.store_id || ratingByStoreId.has(audit.store_id)) continue

          const rating =
            (typeof audit.fra_overall_risk_rating === 'string' && audit.fra_overall_risk_rating.trim())
              ? audit.fra_overall_risk_rating
              : extractFraRiskRatingFromResponses(
                  Array.isArray(audit.fa_audit_responses) ? audit.fa_audit_responses : []
                )

          ratingByStoreId.set(audit.store_id, rating)
        }

        storesWithFRA.forEach((store) => {
          if (ratingByStoreId.has(store.id)) {
            store.fire_risk_assessment_rating = ratingByStoreId.get(store.id) || null
          }
        })
      }
    } catch (error) {
      console.error('Error enriching FRA ratings:', error)
    }
  }

  return storesWithFRA || []
}

export default async function FireRiskAssessmentPage() {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])
  const stores = await getStoreFRAs()

  return <FRATrackerClient stores={stores as FRARow[]} userRole={profile.role} />
}
