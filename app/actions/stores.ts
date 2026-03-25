'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateComplianceAudit2Tracking(
  storeId: string,
  assignedManagerUserId: string | null,
  plannedDate: string | null
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('tfs_stores')
    .update({
      compliance_audit_2_assigned_manager_user_id: assignedManagerUserId || null,
      compliance_audit_2_planned_date: plannedDate || null,
    })
    .eq('id', storeId)

  if (error) {
    console.error('Error updating compliance audit tracking:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateFRA(
  storeId: string,
  date: string,
  notes: string | null,
  percentage: number | null,
  pdfPath?: string | null
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const updateData: any = {
    fire_risk_assessment_date: date,
    fire_risk_assessment_notes: notes || null,
    fire_risk_assessment_pct: percentage !== null && percentage !== undefined ? percentage : null,
  }

  if (pdfPath !== undefined) {
    updateData.fire_risk_assessment_pdf_path = pdfPath
  }

  const { error } = await supabase
    .from('tfs_stores')
    .update(updateData)
    .eq('id', storeId)

  if (error) {
    throw new Error(`Failed to update FRA: ${error.message}`)
  }

  revalidatePath('/stores')
  return { success: true }
}

