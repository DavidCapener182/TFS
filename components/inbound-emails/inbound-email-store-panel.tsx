import Link from 'next/link'
import { Mail, Paperclip } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatInboundEmailDateTime,
  getInboundEmailDisplaySummary,
  getInboundEmailTemplateLabel,
  getInboundEmailWorkflowClass,
  getInboundEmailWorkflowLabel,
  isInboundEmailSeed,
  type InboundEmailRow,
} from '@/lib/inbound-emails'

interface InboundEmailStorePanelProps {
  emails: InboundEmailRow[]
  onOpenEmail: (email: InboundEmailRow) => void
  variant?: 'default' | 'compact'
  maxItems?: number
}

export function InboundEmailStorePanel({
  emails,
  onOpenEmail,
  variant = 'default',
  maxItems,
}: InboundEmailStorePanelProps) {
  const isCompact = variant === 'compact'
  const visibleEmails = typeof maxItems === 'number' ? emails.slice(0, maxItems) : emails

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-900">{isCompact ? 'Latest Emails' : 'Inbound Emails'}</h3>
          <p className="text-sm text-slate-500">
            {isCompact
              ? 'Most recent linked mailbox items for this store.'
              : 'Raw mailbox items already linked to this store, including parser recommendations.'}
          </p>
        </div>
        <Button asChild type="button" variant="outline" size="sm" className="h-9">
          <Link href="/inbound-emails">{isCompact ? 'View inbox' : 'Open inbox'}</Link>
        </Button>
      </div>

      <div className="divide-y divide-slate-100">
        {visibleEmails.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No inbound emails are currently matched to this store.
          </div>
        ) : (
          visibleEmails.map((email) => {
            const templateLabel = getInboundEmailTemplateLabel(email.analysis_template_key)

            return (
              <div key={email.id} className={isCompact ? 'space-y-3 p-4' : 'space-y-3 p-5'}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {formatInboundEmailDateTime(email.received_at)}
                      </span>
                      <Badge className={getInboundEmailWorkflowClass(email)}>
                        {getInboundEmailWorkflowLabel(email)}
                      </Badge>
                      {templateLabel ? (
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                          {templateLabel}
                        </Badge>
                      ) : null}
                      {email.analysis_needs_incident ? (
                        <Badge className="bg-red-50 text-red-700">Incident</Badge>
                      ) : null}
                      {email.analysis_needs_action ? (
                        <Badge className="bg-amber-50 text-amber-700">Action</Badge>
                      ) : null}
                      {email.analysis_needs_visit ? (
                        <Badge className="bg-sky-50 text-sky-700">Visit</Badge>
                      ) : null}
                      {isInboundEmailSeed(email) ? (
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                          Demo
                        </Badge>
                      ) : null}
                    </div>

                    <div>
                      <p className={`${isCompact ? 'text-sm' : 'text-base'} font-semibold text-slate-900`}>
                        {email.subject || '(No subject)'}
                      </p>
                      <p className={`mt-1 ${isCompact ? 'text-xs' : 'text-sm'} text-slate-500`}>
                        <Mail className="mr-1 inline h-3.5 w-3.5" />
                        {email.sender_name || 'Unknown sender'}
                        {email.sender_email ? ` <${email.sender_email}>` : ''}
                        {email.has_attachments ? <Paperclip className="ml-2 inline h-3.5 w-3.5 text-slate-400" /> : null}
                      </p>
                    </div>

                    <p className={`${isCompact ? 'text-xs' : 'text-sm'} leading-relaxed text-slate-600`}>
                      {getInboundEmailDisplaySummary(email)}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`${isCompact ? 'h-8 text-xs' : 'h-9'} xl:self-start`}
                    onClick={() => onOpenEmail(email)}
                  >
                    Open email
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
