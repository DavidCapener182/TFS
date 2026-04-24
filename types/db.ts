// Placeholder for generated Supabase types
// Run: npx supabase gen types typescript --project-id fwnzpafwfaiynrclwtnh > types/db.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type FaUserRole = 'admin' | 'ops' | 'readonly' | 'client' | 'pending'
export type FaIncidentCategory =
  | 'accident'
  | 'near_miss'
  | 'security'
  | 'theft'
  | 'fire'
  | 'health_safety'
  | 'other'
export type FaSeverity = 'low' | 'medium' | 'high' | 'critical'
export type FaIncidentStatus = 'open' | 'under_investigation' | 'actions_in_progress' | 'closed' | 'cancelled'
export type FaInvestigationType = 'light_touch' | 'formal'
export type FaInvestigationStatus = 'not_started' | 'in_progress' | 'awaiting_actions' | 'complete'
export type FaActionPriority = 'low' | 'medium' | 'high' | 'urgent'
export type FaActionStatus = 'open' | 'in_progress' | 'blocked' | 'complete' | 'cancelled'
export type FaEntityType = 'incident' | 'investigation' | 'action' | 'store'
export type FaStoreContactPreferredMethod = 'phone' | 'email' | 'either'
export type FaStoreNoteType = 'general' | 'contact' | 'audit' | 'fra' | 'other'
export type FaStoreInteractionType =
  | 'phone_call'
  | 'email'
  | 'meeting'
  | 'visit'
  | 'audit_update'
  | 'fra_update'
  | 'other'

export type TfsCaseStage =
  | 'new_submission'
  | 'under_review'
  | 'action_agreed'
  | 'visit_required'
  | 'awaiting_follow_up'
  | 'ready_to_close'
  | 'closed'

export type TfsIntakeSource =
  | 'store_portal'
  | 'legacy_incident'
  | 'legacy_store_action'
  | 'manual_internal'
  | 'visit_follow_up'
  | 'report_workflow'

export type TfsReviewOutcome =
  | 'acknowledged_only'
  | 'store_action_created'
  | 'visit_required'
  | 'incident_escalated'
  | 'closed_no_further_action'

export type TfsVisitOutcome =
  | 'no_further_action'
  | 'follow_up_visit_required'
  | 'store_action_created'
  | 'incident_task_created'
  | 'escalated_to_manager'
  | 'report_required'

export type TfsCaseLinkRole = 'origin' | 'result' | 'blocking' | 'evidence'

export interface TfsCaseRow {
  id: string
  store_id: string
  case_type: string
  intake_source: TfsIntakeSource
  origin_reference: string | null
  severity: FaSeverity
  owner_user_id: string | null
  due_at: string | null
  stage: TfsCaseStage
  next_action_code: string | null
  next_action_label: string | null
  last_update_summary: string | null
  review_outcome: TfsReviewOutcome | null
  closure_outcome: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface TfsCaseEventRow {
  id: string
  case_id: string
  store_id: string
  event_type: string
  stage: TfsCaseStage | null
  summary: string
  detail: string | null
  actor_user_id: string | null
  event_at: string
  metadata: Json | null
  created_at: string
}

export interface TfsCaseLinkRow {
  id: string
  case_id: string
  link_role: TfsCaseLinkRole
  target_table: string
  target_id: string
  label: string | null
  metadata: Json | null
  created_at: string
}

export interface TfsVisitRow {
  id: string
  case_id: string
  store_id: string
  visit_type: string
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  scheduled_for: string | null
  assigned_user_id: string | null
  started_at: string | null
  completed_at: string | null
  visit_outcome: TfsVisitOutcome | null
  outcome_summary: string | null
  linked_store_visit_id: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      fa_profiles: {
        Row: {
          id: string
          full_name: string | null
          role: FaUserRole
          created_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          role?: FaUserRole
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: FaUserRole
          created_at?: string
        }
      }
      fa_stores: {
        Row: {
          id: string
          store_code: string | null
          store_name: string
          address_line_1: string | null
          city: string | null
          postcode: string | null
          region: string | null
          reporting_area: string | null
          reporting_area_manager_name: string | null
          reporting_area_manager_email: string | null
          is_active: boolean
          compliance_audit_1_date: string | null
          compliance_audit_1_overall_pct: number | null
          action_plan_1_sent: boolean | null
          compliance_audit_1_pdf_path: string | null
          compliance_audit_2_date: string | null
          compliance_audit_2_overall_pct: number | null
          action_plan_2_sent: boolean | null
          compliance_audit_2_pdf_path: string | null
          compliance_audit_2_assigned_manager_user_id: string | null
          compliance_audit_2_planned_date: string | null
          compliance_audit_3_date: string | null
          compliance_audit_3_overall_pct: number | null
          action_plan_3_sent: boolean | null
          area_average_pct: number | null
          total_audits_to_date: number | null
          fire_risk_assessment_date: string | null
          fire_risk_assessment_pdf_path: string | null
          fire_risk_assessment_notes: string | null
          fire_risk_assessment_pct: number | null
        }
        Insert: {
          id?: string
          store_code?: string | null
          store_name: string
          address_line_1?: string | null
          city?: string | null
          postcode?: string | null
          region?: string | null
          reporting_area?: string | null
          reporting_area_manager_name?: string | null
          reporting_area_manager_email?: string | null
          is_active?: boolean
          compliance_audit_1_date?: string | null
          compliance_audit_1_overall_pct?: number | null
          action_plan_1_sent?: boolean | null
          compliance_audit_1_pdf_path?: string | null
          compliance_audit_2_date?: string | null
          compliance_audit_2_overall_pct?: number | null
          action_plan_2_sent?: boolean | null
          compliance_audit_2_pdf_path?: string | null
          compliance_audit_2_assigned_manager_user_id?: string | null
          compliance_audit_2_planned_date?: string | null
          compliance_audit_3_date?: string | null
          compliance_audit_3_overall_pct?: number | null
          action_plan_3_sent?: boolean | null
          area_average_pct?: number | null
          total_audits_to_date?: number | null
          fire_risk_assessment_date?: string | null
          fire_risk_assessment_pdf_path?: string | null
          fire_risk_assessment_notes?: string | null
          fire_risk_assessment_pct?: number | null
        }
        Update: {
          id?: string
          store_code?: string | null
          store_name?: string
          address_line_1?: string | null
          city?: string | null
          postcode?: string | null
          region?: string | null
          reporting_area?: string | null
          reporting_area_manager_name?: string | null
          reporting_area_manager_email?: string | null
          is_active?: boolean
          compliance_audit_1_date?: string | null
          compliance_audit_1_overall_pct?: number | null
          action_plan_1_sent?: boolean | null
          compliance_audit_1_pdf_path?: string | null
          compliance_audit_2_date?: string | null
          compliance_audit_2_overall_pct?: number | null
          action_plan_2_sent?: boolean | null
          compliance_audit_2_pdf_path?: string | null
          compliance_audit_2_assigned_manager_user_id?: string | null
          compliance_audit_2_planned_date?: string | null
          compliance_audit_3_date?: string | null
          compliance_audit_3_overall_pct?: number | null
          action_plan_3_sent?: boolean | null
          area_average_pct?: number | null
          total_audits_to_date?: number | null
          fire_risk_assessment_date?: string | null
          fire_risk_assessment_pdf_path?: string | null
          fire_risk_assessment_notes?: string | null
          fire_risk_assessment_pct?: number | null
        }
      }
      fa_incidents: {
        Row: {
          id: string
          reference_no: string
          store_id: string
          reported_by_user_id: string
          incident_category: FaIncidentCategory
          severity: FaSeverity
          summary: string
          description: string | null
          occurred_at: string
          reported_at: string
          persons_involved: Json | null
          injury_details: Json | null
          witnesses: Json | null
          riddor_reportable: boolean
          status: FaIncidentStatus
          assigned_investigator_user_id: string | null
          target_close_date: string | null
          closed_at: string | null
          closure_summary: string | null
        }
        Insert: {
          id?: string
          reference_no: string
          store_id: string
          reported_by_user_id: string
          incident_category: FaIncidentCategory
          severity: FaSeverity
          summary: string
          description?: string | null
          occurred_at: string
          reported_at: string
          persons_involved?: Json | null
          injury_details?: Json | null
          witnesses?: Json | null
          riddor_reportable?: boolean
          status?: FaIncidentStatus
          assigned_investigator_user_id?: string | null
          target_close_date?: string | null
          closed_at?: string | null
          closure_summary?: string | null
        }
        Update: {
          id?: string
          reference_no?: string
          store_id?: string
          reported_by_user_id?: string
          incident_category?: FaIncidentCategory
          severity?: FaSeverity
          summary?: string
          description?: string | null
          occurred_at?: string
          reported_at?: string
          persons_involved?: Json | null
          injury_details?: Json | null
          witnesses?: Json | null
          riddor_reportable?: boolean
          status?: FaIncidentStatus
          assigned_investigator_user_id?: string | null
          target_close_date?: string | null
          closed_at?: string | null
          closure_summary?: string | null
        }
      }
      fa_investigations: {
        Row: {
          id: string
          incident_id: string
          investigation_type: FaInvestigationType
          status: FaInvestigationStatus
          lead_investigator_user_id: string
          root_cause: string | null
          contributing_factors: string | null
          findings: string | null
          recommendations: string | null
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          incident_id: string
          investigation_type: FaInvestigationType
          status?: FaInvestigationStatus
          lead_investigator_user_id: string
          root_cause?: string | null
          contributing_factors?: string | null
          findings?: string | null
          recommendations?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          incident_id?: string
          investigation_type?: FaInvestigationType
          status?: FaInvestigationStatus
          lead_investigator_user_id?: string
          root_cause?: string | null
          contributing_factors?: string | null
          findings?: string | null
          recommendations?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
      }
      fa_actions: {
        Row: {
          id: string
          incident_id: string
          investigation_id: string | null
          title: string
          description: string | null
          priority: FaActionPriority
          assigned_to_user_id: string
          due_date: string
          status: FaActionStatus
          evidence_required: boolean
          completed_at: string | null
          completion_notes: string | null
        }
        Insert: {
          id?: string
          incident_id: string
          investigation_id?: string | null
          title: string
          description?: string | null
          priority: FaActionPriority
          assigned_to_user_id: string
          due_date: string
          status?: FaActionStatus
          evidence_required?: boolean
          completed_at?: string | null
          completion_notes?: string | null
        }
        Update: {
          id?: string
          incident_id?: string
          investigation_id?: string | null
          title?: string
          description?: string | null
          priority?: FaActionPriority
          assigned_to_user_id?: string
          due_date?: string
          status?: FaActionStatus
          evidence_required?: boolean
          completed_at?: string | null
          completion_notes?: string | null
        }
      }
      fa_attachments: {
        Row: {
          id: string
          entity_type: FaEntityType
          entity_id: string
          file_name: string
          file_path: string
          file_type: string
          file_size: number
          uploaded_by_user_id: string
        }
        Insert: {
          id?: string
          entity_type: FaEntityType
          entity_id: string
          file_name: string
          file_path: string
          file_type: string
          file_size: number
          uploaded_by_user_id: string
        }
        Update: {
          id?: string
          entity_type?: FaEntityType
          entity_id?: string
          file_name?: string
          file_path?: string
          file_type?: string
          file_size?: number
          uploaded_by_user_id?: string
        }
      }
      fa_activity_log: {
        Row: {
          id: string
          entity_type: FaEntityType
          entity_id: string
          action: string
          performed_by_user_id: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          entity_type: FaEntityType
          entity_id: string
          action: string
          performed_by_user_id: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          entity_type?: FaEntityType
          entity_id?: string
          action?: string
          performed_by_user_id?: string
          details?: Json | null
          created_at?: string
        }
      }
      fa_store_contacts: {
        Row: {
          id: string
          store_id: string
          contact_name: string
          job_title: string | null
          email: string | null
          phone: string | null
          preferred_method: FaStoreContactPreferredMethod | null
          is_primary: boolean
          notes: string | null
          created_by_user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          contact_name: string
          job_title?: string | null
          email?: string | null
          phone?: string | null
          preferred_method?: FaStoreContactPreferredMethod | null
          is_primary?: boolean
          notes?: string | null
          created_by_user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          contact_name?: string
          job_title?: string | null
          email?: string | null
          phone?: string | null
          preferred_method?: FaStoreContactPreferredMethod | null
          is_primary?: boolean
          notes?: string | null
          created_by_user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      fa_store_notes: {
        Row: {
          id: string
          store_id: string
          note_type: FaStoreNoteType
          title: string | null
          body: string
          created_by_user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          note_type?: FaStoreNoteType
          title?: string | null
          body: string
          created_by_user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          note_type?: FaStoreNoteType
          title?: string | null
          body?: string
          created_by_user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      fa_store_contact_tracker: {
        Row: {
          id: string
          store_id: string
          contact_id: string | null
          interaction_type: FaStoreInteractionType
          subject: string
          details: string | null
          outcome: string | null
          interaction_at: string
          follow_up_date: string | null
          created_by_user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          contact_id?: string | null
          interaction_type: FaStoreInteractionType
          subject: string
          details?: string | null
          outcome?: string | null
          interaction_at?: string
          follow_up_date?: string | null
          created_by_user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          contact_id?: string | null
          interaction_type?: FaStoreInteractionType
          subject?: string
          details?: string | null
          outcome?: string | null
          interaction_at?: string
          follow_up_date?: string | null
          created_by_user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
