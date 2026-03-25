import { AlertTriangle, ChevronDown, ShieldCheck } from 'lucide-react'
import { requireAuth } from '@/lib/auth'

type PolicyRow = {
  dataPoint: string
  fields: string
  pages: string
  purpose: string
  lawfulBasis: string
  access: string
  retention: string
  controls: string
}

type PolicySection = {
  title: string
  paragraphs: string[]
  bullets?: string[]
}

const POLICY_ROWS: PolicyRow[] = [
  {
    dataPoint: 'User identity',
    fields: 'fa_profiles.id, full_name, auth email',
    pages: 'All protected pages',
    purpose: 'Authenticate users and attribute actions to named users.',
    lawfulBasis: 'Legitimate interests (security and operational governance).',
    access: 'Admin/Ops/Readonly/Client by role scope; admin for full user management.',
    retention: 'For active account lifecycle; removed/anonymized per account closure policy.',
    controls: 'Role-based access and authenticated-only routes.',
  },
  {
    dataPoint: 'User role and permissions',
    fields: 'fa_profiles.role, admin approvals',
    pages: 'Admin, global authorization checks',
    purpose: 'Enforce least-privilege access to data and functions.',
    lawfulBasis: 'Legal obligation + legitimate interests (security and compliance).',
    access: 'Admin only for role changes; applied platform-wide for all users.',
    retention: 'Retained with user account history for auditability.',
    controls: 'Server-side role checks and restricted admin tooling.',
  },
  {
    dataPoint: 'User activity/audit trail',
    fields: 'tfs_activity_log.performed_by_user_id, timestamps, action metadata',
    pages: 'Dashboard/Activity/Admin oversight',
    purpose: 'Operational audit trail, traceability, and incident review.',
    lawfulBasis: 'Legitimate interests (accountability and security).',
    access: 'Admin/Ops/Readonly by policy; client scope restricted.',
    retention: 'Retained per audit-log retention schedule.',
    controls: 'Append-only operational logging and role-limited visibility.',
  },
  {
    dataPoint: 'Incident personal indicators',
    fields: 'persons_involved.person_type, child_involved, lost_time_days',
    pages: 'Incidents, reporting',
    purpose: 'Safety/legal classification and compliance reporting requirements.',
    lawfulBasis: 'Legal obligation + legitimate interests (health and safety management).',
    access: 'Ops/Admin primarily; client view restricted to approved scope.',
    retention: 'Retained for statutory/contractual incident record periods.',
    controls: 'Data-minimization guidance in forms and role-based visibility.',
  },
  {
    dataPoint: 'Incident narrative text',
    fields: 'summary, description, root_cause, recommendations',
    pages: 'Incidents, actions, reports',
    purpose: 'Investigation, remediation tracking, and governance reporting.',
    lawfulBasis: 'Legitimate interests + legal obligation where reportable.',
    access: 'Ops/Admin/Readonly by scope; client access constrained by policy.',
    retention: 'Retained with incident record lifecycle.',
    controls: 'Policy requires factual and relevant text only (no unnecessary personal detail).',
  },
  {
    dataPoint: 'Incident/claim evidence files',
    fields: 'attachments, cctv/photo/statement flags, claim evidence refs',
    pages: 'Incidents, claims workflow, reports',
    purpose: 'Evidence support for investigations, claims, and compliance response.',
    lawfulBasis: 'Legal obligation + legitimate interests.',
    access: 'Role-limited; operational users and authorized reviewers only.',
    retention: 'Held per incident/claim retention policy and legal hold rules.',
    controls: 'Controlled upload access, role-limited retrieval, auditable case linkage.',
  },
  {
    dataPoint: 'Store contacts and CRM records',
    fields: 'store contact names/roles/details, CRM notes, follow-up logs',
    pages: 'Stores / CRM, route follow-up context',
    purpose: 'Operational communication and compliance follow-up with stores.',
    lawfulBasis: 'Legitimate interests (service delivery and compliance operations).',
    access: 'Admin/Ops/Readonly by scope; client access constrained to approved view.',
    retention: 'Retained while operationally current; stale records removed per policy.',
    controls: 'Minimization standard for notes and periodic data-quality review.',
  },
  {
    dataPoint: 'Manager home address and coordinates',
    fields: 'fa_profiles.home_address, home_latitude, home_longitude',
    pages: 'Route Planning only',
    purpose: 'Route optimization and travel-feasibility planning.',
    lawfulBasis: 'Legitimate interests (operational planning efficiency).',
    access: 'Admin/Ops only; not visible to client portal users.',
    retention: 'Stored only while required for manager route-planning duties.',
    controls: 'Excluded from client-facing scope and removed from dashboard planned-route payloads.',
  },
  {
    dataPoint: 'Action ownership data',
    fields: 'assigned_to, due_date, completion metadata',
    pages: 'Actions, incidents, dashboard',
    purpose: 'Track accountability and closure of corrective actions.',
    lawfulBasis: 'Legitimate interests (compliance task governance).',
    access: 'Ops/Admin/Readonly by role; client restricted by scope.',
    retention: 'Retained with action lifecycle and audit requirements.',
    controls: 'Role-scoped visibility and status/audit history tracking.',
  },
  {
    dataPoint: 'Exports and generated reports',
    fields: 'CSV/PDF exports, AI summary outputs',
    pages: 'Reports, Dashboard report generation',
    purpose: 'Internal/client reporting and management communication.',
    lawfulBasis: 'Legitimate interests + contractual reporting obligations.',
    access: 'Role-limited; generated by authorized users only.',
    retention: 'Export files retained in approved storage per reporting policy.',
    controls: 'Need-to-know filtering required before sharing; AI outputs require human review.',
  },
  {
    dataPoint: 'Store compliance metrics (non-personal)',
    fields: 'visit status, planned dates, completion dates',
    pages: 'Dashboard, Visit Tracker, Route Planning, Reports',
    purpose: 'Operational compliance monitoring and planning.',
    lawfulBasis: 'Not personal data in most cases; operational processing basis applies.',
    access: 'Role-scoped by page and policy.',
    retention: 'Retained per business reporting and audit timelines.',
    controls: 'Controlled export scope and integrity checks.',
  },
]

const FULL_POLICY: PolicySection[] = [
  {
    title: '1. Purpose and Scope',
    paragraphs: [
      'This GDPR Policy defines how personal data is processed within The Fragrance Shop platform used for safety, visits, incidents, route-planning, and governance operations.',
      'This policy applies to all protected platform areas, all user roles, all personal data processed through the platform, and all exports/reports generated from platform data.',
      'The data-point matrix above forms the operational schedule of processing and should be read as part of this policy.',
    ],
  },
  {
    title: '2. Roles and Responsibilities',
    paragraphs: [
      'The party determining the purposes and means of processing acts as Data Controller. Platform operators and authorized administrators act as Processor staff for operational handling under agreed instructions.',
      'Administrative users are responsible for access governance, account lifecycle management, and escalation of privacy requests.',
      'All users are responsible for data minimization, accuracy, and lawful use within their role scope.',
    ],
  },
  {
    title: '3. Data Protection Principles',
    paragraphs: [
      'Processing is performed in line with GDPR principles: lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity/confidentiality, and accountability.',
      'Personal data must not be processed for unrelated personal or informal purposes.',
    ],
  },
  {
    title: '4. Lawful Bases for Processing',
    paragraphs: [
      'Processing is primarily based on legitimate interests (operational safety/compliance management), legal obligation (where statutory safety reporting applies), and contractual necessity where reporting duties exist.',
      'Special category or sensitive incident context should only be processed where required for safety/legal compliance and within strict role controls.',
    ],
  },
  {
    title: '5. Access Control and Confidentiality',
    paragraphs: [
      'Access is role-based and restricted to authorized users with a business need.',
      'Client-facing access is policy-limited and must exclude internal-only personal data fields not required for client use.',
      'Manager home address and coordinate data are internal route-planning inputs and are not to be disclosed in client portal scope.',
    ],
    bullets: [
      'Admin: full governance and user-access control.',
      'Ops: operational processing for incidents, actions, visits, and routes.',
      'Readonly: restricted operational visibility per role policy.',
      'Client: limited view scope under approved policy and RLS constraints.',
    ],
  },
  {
    title: '6. Data Quality, Minimization, and Content Standards',
    paragraphs: [
      'Only data necessary for the defined operational purpose may be collected or stored.',
      'Free-text fields must remain factual, relevant, and proportionate; unnecessary personal commentary is prohibited.',
      'Records should be kept up to date, with corrections made promptly when inaccuracies are identified.',
    ],
  },
  {
    title: '7. Retention and Deletion',
    paragraphs: [
      'Retention periods must follow agreed statutory, contractual, and governance requirements for each record type.',
      'Data no longer required for purpose or retention obligations must be deleted or anonymized according to approved deletion workflow.',
      'Deletion and correction outcomes must be auditable.',
    ],
  },
  {
    title: '8. Data Subject Rights',
    paragraphs: [
      'Data subjects may exercise rights including access, rectification, erasure, restriction, and objection (subject to legal/operational limits).',
      'All rights requests must be routed through the designated admin/privacy process for verification, assessment, and tracked response.',
      'No informal disclosure, export, or deletion should occur outside the formal request workflow.',
    ],
  },
  {
    title: '9. Security and Incident Response',
    paragraphs: [
      'Technical and organizational controls include authenticated access, role checks, restricted admin tooling, and auditable activity logs.',
      'Any suspected personal-data breach or unauthorized disclosure must be escalated immediately through incident and admin governance channels.',
      'Containment, investigation, remediation, and notification actions must be documented with timestamps and ownership.',
    ],
  },
  {
    title: '10. Exports, Reporting, and AI-Generated Content',
    paragraphs: [
      'Before sharing reports or exports, users must confirm that only required fields are included for the intended recipient.',
      'AI-generated summaries are assistive outputs and require human review before use in operational or external communications.',
      'Distribution outside authorized audiences is prohibited.',
    ],
  },
  {
    title: '11. Policy Governance and Review',
    paragraphs: [
      'This policy should be reviewed periodically and whenever major processing changes are introduced.',
      'Controller/Processor legal wording, responsibilities, and retention schedules should be formally approved by privacy/legal ownership before client publication.',
      'Effective date for this version: 5 March 2026.',
    ],
  },
]

export default async function GdprPage() {
  await requireAuth()

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-200">
          <ShieldCheck className="h-3.5 w-3.5" /> GDPR Policy
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">GDPR Data-Point Policy</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-300 sm:text-base">
          This policy defines GDPR handling for each core data point used in the platform, including purpose,
          lawful basis, access scope, retention expectation, and control requirements.
        </p>
        <p className="mt-3 text-xs text-slate-400">Last updated: 5 March 2026</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:hidden">
        <div className="space-y-3">
          {POLICY_ROWS.map((row) => (
            <details key={row.dataPoint} className="group rounded-[22px] border border-slate-200 bg-slate-50/70">
              <summary className="flex cursor-pointer list-none items-start gap-3 p-4 text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Data Point
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-slate-900">{row.dataPoint}</h2>
                  <p className="mt-2 text-xs text-slate-500">{row.pages}</p>
                </div>
                <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-slate-200 px-4 py-4 text-sm text-slate-700">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fields</p>
                  <p className="mt-1">{row.fields}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Purpose</p>
                  <p className="mt-1">{row.purpose}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lawful Basis</p>
                  <p className="mt-1">{row.lawfulBasis}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Access Scope</p>
                  <p className="mt-1">{row.access}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Retention</p>
                  <p className="mt-1">{row.retention}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Controls</p>
                  <p className="mt-1">{row.controls}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[1380px] w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Data Point</th>
                <th className="px-4 py-3 font-semibold">Fields</th>
                <th className="px-4 py-3 font-semibold">Pages/Features</th>
                <th className="px-4 py-3 font-semibold">Purpose</th>
                <th className="px-4 py-3 font-semibold">Lawful Basis</th>
                <th className="px-4 py-3 font-semibold">Access Scope</th>
                <th className="px-4 py-3 font-semibold">Retention</th>
                <th className="px-4 py-3 font-semibold">Controls</th>
              </tr>
            </thead>
            <tbody>
              {POLICY_ROWS.map((row) => (
                <tr key={row.dataPoint} className="align-top border-b border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.dataPoint}</td>
                  <td className="px-4 py-3 text-slate-700">{row.fields}</td>
                  <td className="px-4 py-3 text-slate-700">{row.pages}</td>
                  <td className="px-4 py-3 text-slate-700">{row.purpose}</td>
                  <td className="px-4 py-3 text-slate-700">{row.lawfulBasis}</td>
                  <td className="px-4 py-3 text-slate-700">{row.access}</td>
                  <td className="px-4 py-3 text-slate-700">{row.retention}</td>
                  <td className="px-4 py-3 text-slate-700">{row.controls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Client Review Note</p>
            <p className="mt-1">
              This is the operational GDPR policy draft for platform behavior. Final legal wording and controller/
              processor responsibilities should be approved by your privacy/legal owner before formal client publication.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:hidden">
        <h2 className="text-lg font-semibold text-slate-900">Full Written GDPR Policy</h2>
        <p className="mt-2 text-sm text-slate-600">
          The following clauses set out the full policy text to accompany the matrix and support client/legal review.
        </p>
        <div className="mt-4 space-y-3">
          {FULL_POLICY.map((section, index) => (
            <details
              key={section.title}
              className="group rounded-[22px] border border-slate-200 bg-slate-50/60"
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none items-start gap-3 p-4 text-left">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {section.paragraphs.length} clause{section.paragraphs.length === 1 ? '' : 's'}
                    {section.bullets ? ` plus ${section.bullets.length} controls` : ''}
                  </p>
                </div>
                <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t border-slate-200 px-4 py-4 text-sm text-slate-700">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="hidden rounded-2xl border border-slate-200 bg-white p-5 md:block">
        <h2 className="text-lg font-semibold text-slate-900">Full Written GDPR Policy</h2>
        <p className="mt-2 text-sm text-slate-600">
          The following clauses set out the full policy text to accompany the matrix and support client/legal review.
        </p>
        <div className="mt-4 space-y-4">
          {FULL_POLICY.map((section) => (
            <div key={section.title} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.bullets ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
