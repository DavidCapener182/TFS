'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MailPlus } from 'lucide-react'

import { createInboundEmailFromPaste } from '@/app/actions/inbound-emails'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

export function InboundEmailImporter() {
  const router = useRouter()
  const [isSaving, startSaving] = useTransition()
  const [mailboxName, setMailboxName] = useState('TFS Shared Mailbox')
  const [folderName, setFolderName] = useState('Stock Control Inbox')
  const [subject, setSubject] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [hasAttachments, setHasAttachments] = useState(false)
  const [rawPayloadJson, setRawPayloadJson] = useState('')
  const [pastedEmail, setPastedEmail] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailPlus className="h-5 w-5" />
          Paste Email Into Inbound Queue
        </CardTitle>
        <CardDescription>
          Paste raw Outlook email text and save. The parser runs automatically and fills analysis/matching from the email content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pastedEmail">Raw email paste</Label>
          <Textarea
            id="pastedEmail"
            className="min-h-[280px]"
            placeholder={'From: Name <email@domain.com>\nDate: Tue, 1 Apr 2026 09:12:00 +0000\nSubject: ...\n\nEmail body...'}
            value={pastedEmail}
            onChange={(e) => setPastedEmail(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            {showAdvanced ? 'Hide advanced overrides' : 'Show advanced overrides'}
          </button>

          {showAdvanced ? (
            <div className="mt-3 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mailboxName">Mailbox</Label>
                  <Input id="mailboxName" value={mailboxName} onChange={(e) => setMailboxName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="folderName">Folder</Label>
                  <Input id="folderName" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject override (optional)</Label>
                  <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senderEmail">Sender email override (optional)</Label>
                  <Input id="senderEmail" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senderName">Sender name override (optional)</Label>
                  <Input id="senderName" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receivedAt">Received at override (optional)</Label>
                  <Input
                    id="receivedAt"
                    placeholder="2026-04-01T10:00:00+00:00"
                    value={receivedAt}
                    onChange={(e) => setReceivedAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="hasAttachments"
                  type="checkbox"
                  checked={hasAttachments}
                  onChange={(e) => setHasAttachments(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="hasAttachments">Has attachments</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rawPayload">Raw payload JSON override (optional)</Label>
                <Textarea
                  id="rawPayload"
                  className="min-h-[120px] font-mono text-xs"
                  placeholder={'{"message_kind":"stocktake_result","store_code_hint":"037"}'}
                  value={rawPayloadJson}
                  onChange={(e) => setRawPayloadJson(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          disabled={isSaving || !pastedEmail.trim()}
          onClick={() => {
            startSaving(async () => {
              try {
                const result = await createInboundEmailFromPaste({
                  mailboxName,
                  folderName,
                  subject,
                  senderName,
                  senderEmail,
                  receivedAt,
                  hasAttachments,
                  rawPayloadJson,
                  pastedEmail,
                })

                toast({
                  title: 'Email saved',
                  description: result.needsReview
                    ? `Added "${result.subject}" and parser flagged it for review.`
                    : `Added "${result.subject}" and parser handled it automatically.`,
                  variant: 'success',
                })

                setSubject('')
                setSenderName('')
                setSenderEmail('')
                setReceivedAt('')
                setHasAttachments(false)
                setRawPayloadJson('')
                setPastedEmail('')

                router.push(`/inbound-emails?email=${result.id}`)
                router.refresh()
              } catch (error) {
                toast({
                  title: 'Could not save email',
                  description: error instanceof Error ? error.message : 'Unknown error',
                  variant: 'destructive',
                })
              }
            })
          }}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Email
        </Button>
      </CardContent>
    </Card>
  )
}
