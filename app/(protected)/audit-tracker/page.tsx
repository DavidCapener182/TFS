import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AuditRow } from '@/components/audit/audit-table'
import { AuditTrackerClient } from '@/components/audit/audit-tracker-client'

async function getStoreAudits() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fa_stores')
    .select(
      'id, store_code, store_name, region, city, is_active, compliance_audit_1_date, compliance_audit_1_overall_pct, action_plan_1_sent, compliance_audit_1_pdf_path, compliance_audit_2_date, compliance_audit_2_overall_pct, action_plan_2_sent, compliance_audit_2_pdf_path, compliance_audit_3_date, compliance_audit_3_overall_pct, action_plan_3_sent, area_average_pct, total_audits_to_date, fire_risk_assessment_date, fire_risk_assessment_pdf_path, fire_risk_assessment_notes, fire_risk_assessment_pct'
    )
    .order('region', { ascending: true })
    .order('store_name', { ascending: true })

  if (error) {
    console.error('Error fetching store audits:', error)
    return []
  }

  return data || []
}

export default async function AuditTrackerPage() {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])
  const stores = await getStoreAudits()

  return (
    <AuditTrackerClient stores={stores as AuditRow[]} userRole={profile.role} />
  )
}
