import Link from 'next/link'
import { AlertCircle, CalendarClock, Database, Mail, Paperclip, Store } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  formatInboundEmailDateTime,
  getInboundEmailAnalysisPayloadObject,
  getInboundEmailAttachmentCount,
  getInboundEmailPayloadString,
  getInboundEmailTemplateLabel,
  getInboundEmailWorkflowClass,
  getInboundEmailWorkflowLabel,
  isInboundEmailSeed,
  type InboundEmailRow,
  type InboundEmailStoreRow,
} from '@/lib/inbound-emails'
import { getInboundEmailsUnavailableMessage, isMissingInboundEmailsTableError } from '@/lib/inbound-emails-schema'
import { formatStoreName } from '@/lib/store-display'
import { InboundEmailAnalysisActions } from '@/components/inbound-emails/inbound-email-analysis-actions'
import { InboundEmailReviewActions } from '@/components/inbound-emails/inbound-email-review-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  WorkspaceHeader,
  WorkspaceSectionCard,
  WorkspaceShell,
  WorkspaceStat,
  WorkspaceStatGrid,
} from '@/components/workspace/workspace-shell'

async function getInboundEmails() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tfs_inbound_emails')
    .select('*')
    .in('processing_status', ['pending', 'error'])
    .order('received_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)

  return { data: (data || []) as InboundEmailRow[], error }
}

async function getMatchedStoreMap(storeIds: string[]) {
  if (storeIds.length === 0) return new Map<string, InboundEmailStoreRow>()

  const supabase = createClient()
  const { data, error } = await supabase
    .from('tfs_stores')
    .select('id, store_code, store_name')
    .in('id', storeIds)

  if (error) {
    console.error('Error fetching matched stores for inbound emails:', error)
    return new Map<string, InboundEmailStoreRow>()
  }

  return new Map<string, InboundEmailStoreRow>((data || []).map((store: any) => [String(store.id), store as InboundEmailStoreRow]))
}

export default async function InboundEmailsPage({
  searchParams,
}: {
  searchParams?: { email?: string }
}) {
  await requireRole(['admin', 'ops'])

  const { data: emails, error } = await getInboundEmails()

  if (error) {
    const unavailableMessage = isMissingInboundEmailsTableError(error)
      ? getInboundEmailsUnavailableMessage()
      : `Failed to load inbound emails: ${error.message}`

    return (
      <WorkspaceShell className="p-4 md:p-6">
        <Card className="border border-amber-100 bg-amber-50">
          <CardHeader>
            <CardTitle>Inbound Emails Unavailable</CardTitle>
            <CardDescription className="text-amber-900/80">{unavailableMessage}</CardDescription>
          </CardHeader>
        </Card>
      </WorkspaceShell>
    )
  }

  const matchedStoreIds = Array.from(new Set(emails.map((email) => email.matched_store_id).filter(Boolean))) as string[]
  const storeMap = await getMatchedStoreMap(matchedStoreIds)

  const selectedEmail =
    emails.find((email) => email.id === searchParams?.email) ||
    emails[0] ||
    null

  const selectedStore = selectedEmail?.matched_store_id
    ? storeMap.get(selectedEmail.matched_store_id) || null
    : null

  const totalMatched = emails.filter((email) => email.matched_store_id).length
  const totalPending = emails.filter((email) => !email.analysis_last_ran_at).length
  const totalFollowUp = emails.filter(
    (email) => email.analysis_needs_action || email.analysis_needs_visit || email.analysis_needs_incident
  ).length
  const pendingUnanalysedCount = emails.filter(
    (email) => email.processing_status === 'pending' && !email.analysis_last_ran_at
  ).length
  const selectedAnalysisPayload = getInboundEmailAnalysisPayloadObject(selectedEmail?.analysis_payload)
  const selectedSuggestedNextSteps = Array.isArray(selectedAnalysisPayload?.suggestedNextSteps)
    ? selectedAnalysisPayload.suggestedNextSteps.filter((step): step is string => typeof step === 'string' && step.trim().length > 0)
    : []
  const selectedReasoning = typeof selectedAnalysisPayload?.reasoning === 'string'
    ? selectedAnalysisPayload.reasoning
    : null
  const selectedExtractedFields = getInboundEmailPayloadString(selectedAnalysisPayload?.extractedFields || {})
  const selectedConfidence = Number(selectedEmail?.analysis_confidence ?? Number.NaN)

  return (
    <WorkspaceShell className="p-4 md:p-6">
      <WorkspaceHeader
        eyebrow="Email Review"
        icon={Mail}
        title="Inbound email queue"
        description="Review new and failed inbound emails, inspect parser output, and action the next operational step without leaving the queue."
      />

      <WorkspaceStatGrid>
        <WorkspaceStat label="Emails" value={emails.length} note="Rows currently in the review queue" icon={Mail} tone="info" />
        <WorkspaceStat label="New" value={totalPending} note="Emails still awaiting first parser run" icon={CalendarClock} tone="warning" />
        <WorkspaceStat label="Matched" value={totalMatched} note="Emails already linked to a store" icon={Store} tone="success" />
        <WorkspaceStat label="Follow-up" value={totalFollowUp} note="Emails flagged for action, visit, or incident work" icon={AlertCircle} tone="critical" />
      </WorkspaceStatGrid>

      <WorkspaceSectionCard>
        <CardHeader className="pb-4">
          <CardTitle>Parser Workflow</CardTitle>
          <CardDescription>
            Deterministic templates classify known email formats first. AI is only used as a fallback when no rule matches.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {pendingUnanalysedCount > 0
              ? `${pendingUnanalysedCount} new email${pendingUnanalysedCount === 1 ? '' : 's'} still need parser output.`
              : 'All new emails have parser output saved.'}
          </div>
          <InboundEmailAnalysisActions
            emailId={selectedEmail?.id || null}
            pendingUnanalysedCount={pendingUnanalysedCount}
          />
        </CardContent>
      </WorkspaceSectionCard>

      {emails.length === 0 ? (
        <WorkspaceSectionCard>
          <CardHeader>
            <CardTitle>No Emails Yet</CardTitle>
            <CardDescription>
              No rows were found in <code>tfs_inbound_emails</code>. Run the seed SQL or connect Make.com first.
            </CardDescription>
          </CardHeader>
        </WorkspaceSectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <WorkspaceSectionCard className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle>Latest Emails</CardTitle>
              <CardDescription>Showing the most recent 100 emails still in the review queue.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Parser</TableHead>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Store</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emails.map((email) => {
                    const matchedStore = email.matched_store_id ? storeMap.get(email.matched_store_id) || null : null
                    const isActive = selectedEmail?.id === email.id
                    const templateLabel = getInboundEmailTemplateLabel(email.analysis_template_key)

                    return (
                      <TableRow key={email.id} className={isActive ? 'bg-slate-50' : undefined}>
                        <TableCell className="whitespace-nowrap text-xs text-slate-500">
                          {formatInboundEmailDateTime(email.received_at)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/inbound-emails?email=${email.id}`}
                            prefetch={false}
                            className="block"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">
                                {email.subject || '(No subject)'}
                              </span>
                              {email.has_attachments ? <Paperclip className="h-3.5 w-3.5 text-slate-400" /> : null}
                              {isInboundEmailSeed(email) ? (
                                <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
                                  Demo
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                              {email.body_preview || email.folder_name || 'No preview available'}
                            </p>
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium text-slate-900">{email.sender_name || 'Unknown sender'}</div>
                          <div className="text-slate-500">{email.sender_email || '—'}</div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {templateLabel ? (
                              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                {templateLabel}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                                Not analysed
                              </Badge>
                            )}
                            {email.analysis_needs_incident ? (
                              <Badge className="bg-red-50 text-red-700">Incident</Badge>
                            ) : null}
                            {email.analysis_needs_action ? (
                              <Badge className="bg-amber-50 text-amber-700">Action</Badge>
                            ) : null}
                            {email.analysis_needs_visit ? (
                              <Badge className="bg-sky-50 text-sky-700">Visit</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getInboundEmailWorkflowClass(email)}>
                            {getInboundEmailWorkflowLabel(email)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {matchedStore ? (
                            <div>
                              <div className="font-medium text-slate-900">
                                {formatStoreName(matchedStore.store_name)}
                              </div>
                              <div>{matchedStore.store_code || '—'}</div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </WorkspaceSectionCard>

          <WorkspaceSectionCard className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle>Email Detail</CardTitle>
              <CardDescription>
                {selectedEmail ? 'Inspect the stored email fields, parser output, and raw payload.' : 'Select an email to inspect it.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {selectedEmail ? (
                <>
                  <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">
                          {selectedEmail.subject || '(No subject)'}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {selectedEmail.sender_name || 'Unknown sender'}
                          {selectedEmail.sender_email ? ` <${selectedEmail.sender_email}>` : ''}
                        </p>
                      </div>
                      <Badge className={getInboundEmailWorkflowClass(selectedEmail)}>
                        {getInboundEmailWorkflowLabel(selectedEmail)}
                      </Badge>
                    </div>
                    <InboundEmailReviewActions emailId={selectedEmail.id} />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Received</p>
                        <p className="mt-1 text-sm text-slate-900">{formatInboundEmailDateTime(selectedEmail.received_at)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Folder</p>
                        <p className="mt-1 text-sm text-slate-900">{selectedEmail.folder_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Mailbox</p>
                        <p className="mt-1 text-sm text-slate-900">{selectedEmail.mailbox_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Attachments</p>
                        <p className="mt-1 text-sm text-slate-900">{getInboundEmailAttachmentCount(selectedEmail)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <Store className="h-4 w-4 text-slate-500" />
                        Matched store
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        {selectedStore
                          ? `${selectedStore.store_code || '—'} · ${formatStoreName(selectedStore.store_name)}`
                          : 'No matched store yet'}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <AlertCircle className="h-4 w-4 text-slate-500" />
                        Parser outcome
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedEmail.analysis_template_key ? (
                          <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                            {getInboundEmailTemplateLabel(selectedEmail.analysis_template_key) || selectedEmail.analysis_template_key}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                            Not analysed
                          </Badge>
                        )}
                        {selectedEmail.analysis_source ? (
                          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                            {selectedEmail.analysis_source === 'rule' ? 'Rule parser' : 'AI fallback'}
                          </Badge>
                        ) : null}
                        {selectedEmail.analysis_needs_incident ? (
                          <Badge className="bg-red-50 text-red-700">Needs incident</Badge>
                        ) : null}
                        {selectedEmail.analysis_needs_action ? (
                          <Badge className="bg-amber-50 text-amber-700">Needs action</Badge>
                        ) : null}
                        {selectedEmail.analysis_needs_visit ? (
                          <Badge className="bg-sky-50 text-sky-700">Needs visit</Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Summary</p>
                          <p className="mt-1 text-sm text-slate-900">
                            {selectedEmail.analysis_summary || 'No parser summary yet.'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Last run</p>
                          <p className="mt-1 text-sm text-slate-900">
                            {selectedEmail.analysis_last_ran_at ? formatInboundEmailDateTime(selectedEmail.analysis_last_ran_at) : 'Never'}
                          </p>
                          {Number.isFinite(selectedConfidence) ? (
                            <p className="mt-1 text-xs text-slate-500">Confidence {Math.round(selectedConfidence * 100)}%</p>
                          ) : null}
                        </div>
                      </div>
                      {selectedReasoning ? (
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                          {selectedReasoning}
                        </div>
                      ) : null}
                      {selectedSuggestedNextSteps.length > 0 ? (
                        <div className="mt-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                            <CalendarClock className="h-4 w-4 text-slate-500" />
                            Suggested next steps
                          </div>
                          <ul className="mt-2 space-y-1 text-sm text-slate-700">
                            {selectedSuggestedNextSteps.map((step) => (
                              <li key={step} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    {selectedEmail.last_error ? (
                      <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                        {selectedEmail.last_error}
                      </div>
                    ) : null}
                    {selectedEmail.analysis_error ? (
                      <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                        {selectedEmail.analysis_error}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <section>
                      <h2 className="text-sm font-semibold text-slate-900">Body Preview</h2>
                      <p className="mt-2 rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-6 text-slate-700">
                        {selectedEmail.body_preview || '—'}
                      </p>
                    </section>

                    <section>
                      <h2 className="text-sm font-semibold text-slate-900">Body Text</h2>
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-6 text-slate-700">
                        {selectedEmail.body_text || '—'}
                      </pre>
                    </section>

                    <section>
                      <h2 className="text-sm font-semibold text-slate-900">Body HTML</h2>
                      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                        {selectedEmail.body_html || '—'}
                      </pre>
                    </section>

                    <section>
                      <h2 className="text-sm font-semibold text-slate-900">Extracted Fields</h2>
                      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-100 bg-white p-4 text-xs leading-5 text-slate-700">
                        {selectedExtractedFields}
                      </pre>
                    </section>

                    <section>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-900">Raw Payload</h2>
                      </div>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                        {getInboundEmailPayloadString(selectedEmail.raw_payload)}
                      </pre>
                    </section>
                  </div>
                </>
              ) : null}
            </CardContent>
          </WorkspaceSectionCard>
        </div>
      )}
    </WorkspaceShell>
  )
}
