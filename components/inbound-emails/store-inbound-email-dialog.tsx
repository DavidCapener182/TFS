'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Calendar, FileText, Loader2, Mail, Paperclip } from 'lucide-react'

import {
  acceptInboundEmailActionSuggestion,
  acceptInboundEmailVisitSuggestion,
} from '@/app/actions/inbound-emails'
import { createStoreNote } from '@/app/actions/store-crm'
import { InboundEmailReviewActions } from '@/components/inbound-emails/inbound-email-review-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import {
  getInboundEmailDetailedSummary,
  formatInboundEmailDateTime,
  getInboundEmailAnalysisPayloadObject,
  getInboundEmailTemplateLabel,
  getInboundEmailWorkflowClass,
  getInboundEmailWorkflowLabel,
  type InboundEmailRow,
} from '@/lib/inbound-emails'
import {
  getInboundEmailActionSuggestion,
  getInboundEmailVisitSuggestion,
} from '@/lib/inbound-email-followups'

const PLANNED_VISIT_PURPOSE_OPTIONS = [
  { value: 'general_follow_up', label: 'General follow-up visit' },
  { value: 'targeted_theft_visit', label: 'Targeted theft visit' },
  { value: 'reviewed_stock_loss_or_counts', label: 'Stock loss / count review' },
  { value: 'reviewed_loss_controls', label: 'Loss controls review' },
  { value: 'provided_store_support_or_training', label: 'Store support / training' },
] as const

const NOTE_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'contact', label: 'Contact' },
  { value: 'audit', label: 'Audit' },
  { value: 'fra', label: 'Urgent' },
  { value: 'other', label: 'Other' },
] as const

interface StoreInboundEmailDialogProps {
  email: InboundEmailRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  store: {
    id: string
    store_name: string
    compliance_audit_2_assigned_manager_user_id?: string | null
  }
}

function getDefaultVisitDate() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function buildDefaultNoteTitle(email: InboundEmailRow | null) {
  return email?.subject || 'Inbound email review'
}

function buildDefaultNoteBody(email: InboundEmailRow | null) {
  if (!email) return ''
  const bodyParts = [
    getInboundEmailDetailedSummary(email),
    `Received ${formatInboundEmailDateTime(email.received_at)} from ${email.sender_name || email.sender_email || 'Unknown sender'}.`,
  ].filter(Boolean)

  return bodyParts.join('\n\n')
}

export function StoreInboundEmailDialog({
  email,
  open,
  onOpenChange,
  store,
}: StoreInboundEmailDialogProps) {
  const router = useRouter()
  const actionSuggestion = useMemo(() => (email ? getInboundEmailActionSuggestion(email) : null), [email])
  const visitSuggestion = useMemo(() => (email ? getInboundEmailVisitSuggestion(email) : null), [email])
  const analysisPayload = useMemo(
    () => getInboundEmailAnalysisPayloadObject(email?.analysis_payload),
    [email]
  )
  const suggestedNextSteps = useMemo(() => {
    const steps = analysisPayload?.suggestedNextSteps
    if (!Array.isArray(steps)) return []
    return steps.filter((step): step is string => typeof step === 'string' && step.trim().length > 0)
  }, [analysisPayload])

  const [actionTitle, setActionTitle] = useState(actionSuggestion?.title || '')
  const [actionDescription, setActionDescription] = useState(actionSuggestion?.description || '')
  const [actionPriority, setActionPriority] = useState(actionSuggestion?.priority || 'medium')
  const [actionDueDate, setActionDueDate] = useState(actionSuggestion?.dueDate || '')
  const [visitDate, setVisitDate] = useState(visitSuggestion?.plannedDate || getDefaultVisitDate())
  const [visitPurpose, setVisitPurpose] = useState(visitSuggestion?.plannedPurpose || 'general_follow_up')
  const [visitNote, setVisitNote] = useState(visitSuggestion?.plannedPurposeNote || buildDefaultNoteBody(email))
  const [showVisitComposer, setShowVisitComposer] = useState(false)
  const [showNoteComposer, setShowNoteComposer] = useState(false)
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPE_OPTIONS)[number]['value']>('general')
  const [noteTitle, setNoteTitle] = useState(buildDefaultNoteTitle(email))
  const [noteBody, setNoteBody] = useState(buildDefaultNoteBody(email))
  const [isSavingAction, startSaveAction] = useTransition()
  const [isSavingVisit, startSaveVisit] = useTransition()
  const [isSavingNote, startSaveNote] = useTransition()
  const visitSectionRef = useRef<HTMLDivElement | null>(null)
  const noteSectionRef = useRef<HTMLDivElement | null>(null)

  const emailId = email?.id || ''
  const confidence = Number(email?.analysis_confidence ?? Number.NaN)

  function resetDrafts(nextEmail: InboundEmailRow | null) {
    const nextActionSuggestion = nextEmail ? getInboundEmailActionSuggestion(nextEmail) : null
    const nextVisitSuggestion = nextEmail ? getInboundEmailVisitSuggestion(nextEmail) : null
    setActionTitle(nextActionSuggestion?.title || '')
    setActionDescription(nextActionSuggestion?.description || '')
    setActionPriority(nextActionSuggestion?.priority || 'medium')
    setActionDueDate(nextActionSuggestion?.dueDate || '')
    setVisitDate(nextVisitSuggestion?.plannedDate || getDefaultVisitDate())
    setVisitPurpose(nextVisitSuggestion?.plannedPurpose || 'general_follow_up')
    setVisitNote(nextVisitSuggestion?.plannedPurposeNote || buildDefaultNoteBody(nextEmail))
    setShowVisitComposer(false)
    setShowNoteComposer(false)
    setNoteType('general')
    setNoteTitle(buildDefaultNoteTitle(nextEmail))
    setNoteBody(buildDefaultNoteBody(nextEmail))
  }

  useEffect(() => {
    if (open) {
      resetDrafts(email)
    }
  }, [email, open])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetDrafts(email)
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="md:max-w-6xl">
        {email ? (
          <>
            <DialogHeader>
              <DialogTitle>{email.subject || '(No subject)'}</DialogTitle>
              <DialogDescription>
                Review the parser output and accept the suggested follow-up without leaving the store CRM page.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getInboundEmailWorkflowClass(email)}>
                      {getInboundEmailWorkflowLabel(email)}
                    </Badge>
                    {email.analysis_template_key ? (
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        {getInboundEmailTemplateLabel(email.analysis_template_key) || email.analysis_template_key}
                      </Badge>
                    ) : null}
                    {email.analysis_needs_incident ? <Badge className="bg-red-50 text-red-700">Needs incident</Badge> : null}
                    {email.analysis_needs_action ? <Badge className="bg-amber-50 text-amber-700">Needs action</Badge> : null}
                    {email.analysis_needs_visit ? <Badge className="bg-sky-50 text-sky-700">Needs visit</Badge> : null}
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">
                      <Mail className="mr-1 inline h-4 w-4" />
                      {email.sender_name || 'Unknown sender'}
                      {email.sender_email ? ` <${email.sender_email}>` : ''}
                      {email.has_attachments ? <Paperclip className="ml-2 inline h-4 w-4 text-slate-400" /> : null}
                    </div>
                    <div className="mt-1 text-slate-500">
                      Received {formatInboundEmailDateTime(email.received_at)} in {email.folder_name || 'Unknown folder'}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Parser Summary</p>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {getInboundEmailDetailedSummary(email)}
                  </div>
                  {Number.isFinite(confidence) ? (
                    <p className="mt-2 text-xs text-slate-500">Confidence {Math.round(confidence * 100)}%</p>
                  ) : null}
                </div>

                {suggestedNextSteps.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Suggested Next Steps</p>
                    <ul className="mt-3 space-y-2">
                      {suggestedNextSteps.map((step) => (
                        <li key={step} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email Body</p>
                  <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    {email.body_text || email.body_preview || 'No body text available.'}
                  </pre>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Review Outcome</p>
                  <div className="mt-3">
                    <InboundEmailReviewActions
                      emailId={emailId}
                      onCompleted={() => onOpenChange(false)}
                      includeNoFurtherAction
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowVisitComposer(true)
                        requestAnimationFrame(() => {
                          visitSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        })
                      }}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      Schedule Visit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowNoteComposer(true)
                        requestAnimationFrame(() => {
                          noteSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        })
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Add Note
                    </Button>
                  </div>
                </div>

                {showNoteComposer ? (
                  <div ref={noteSectionRef} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Add Store Note</p>
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <Select
                          value={noteType}
                          onValueChange={(value) => setNoteType(value as (typeof NOTE_TYPE_OPTIONS)[number]['value'])}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Note type" />
                          </SelectTrigger>
                          <SelectContent>
                            {NOTE_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={noteTitle}
                          onChange={(event) => setNoteTitle(event.target.value)}
                          placeholder="Note title"
                        />
                      </div>
                      <Textarea
                        value={noteBody}
                        onChange={(event) => setNoteBody(event.target.value)}
                        placeholder="Add a note for this store"
                        className="min-h-[180px] resize-y"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSavingNote || !noteBody.trim()}
                          onClick={() => {
                            startSaveNote(async () => {
                              try {
                                await createStoreNote({
                                  storeId: store.id,
                                  noteType,
                                  title: noteTitle,
                                  body: noteBody,
                                })
                                toast({
                                  title: 'Store note added',
                                  description: 'The note was added to this store CRM record.',
                                  variant: 'success',
                                })
                                setShowNoteComposer(false)
                                setNoteType('general')
                                setNoteTitle(buildDefaultNoteTitle(email))
                                setNoteBody(buildDefaultNoteBody(email))
                                router.refresh()
                              } catch (error) {
                                toast({
                                  title: 'Failed to add note',
                                  description: error instanceof Error ? error.message : 'Unable to save the store note.',
                                  variant: 'destructive',
                                })
                              }
                            })
                          }}
                        >
                          {isSavingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Save Note
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={isSavingNote}
                          onClick={() => {
                            setShowNoteComposer(false)
                            setNoteType('general')
                            setNoteTitle(buildDefaultNoteTitle(email))
                            setNoteBody(buildDefaultNoteBody(email))
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {actionSuggestion ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Suggested Store Action</p>
                    <div className="mt-3 space-y-3">
                      <Input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} placeholder="Action title" />
                      <Textarea
                        value={actionDescription}
                        onChange={(event) => setActionDescription(event.target.value)}
                        placeholder="Action description"
                        className="min-h-[240px] resize-y"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select value={actionPriority} onValueChange={(value) => setActionPriority(value as typeof actionPriority)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input type="date" value={actionDueDate} onChange={(event) => setActionDueDate(event.target.value)} />
                      </div>
                      <Button
                        type="button"
                        className="w-full"
                        disabled={isSavingAction || !actionTitle.trim()}
                        onClick={() => {
                          startSaveAction(async () => {
                            try {
                              await acceptInboundEmailActionSuggestion({
                                emailId,
                                storeId: store.id,
                                title: actionTitle,
                                description: actionDescription,
                                priority: actionPriority,
                                dueDate: actionDueDate,
                                sourceFlaggedItem: email.subject || 'Inbound email',
                              })
                              toast({
                                title: 'Store action created',
                                description: 'The suggested store action was created and the email was marked reviewed.',
                                variant: 'success',
                              })
                              router.refresh()
                              onOpenChange(false)
                            } catch (error) {
                              toast({
                                title: 'Failed to create action',
                                description: error instanceof Error ? error.message : 'Unable to create the suggested store action.',
                                variant: 'destructive',
                              })
                            }
                          })
                        }}
                      >
                        {isSavingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Accept Action
                      </Button>
                    </div>
                  </div>
                ) : null}

                {showVisitComposer ? (
                  <div ref={visitSectionRef} className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                      {visitSuggestion ? 'Suggested Planned Visit' : 'Schedule Visit'}
                    </p>
                    <div className="mt-3 space-y-3">
                      <Input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
                      <Select value={visitPurpose} onValueChange={setVisitPurpose}>
                        <SelectTrigger>
                          <SelectValue placeholder="Planned purpose" />
                        </SelectTrigger>
                        <SelectContent>
                          {PLANNED_VISIT_PURPOSE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={visitNote}
                        onChange={(event) => setVisitNote(event.target.value)}
                        placeholder="Why is this visit being planned?"
                        className="min-h-[180px] resize-y"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSavingVisit || !visitDate.trim()}
                          onClick={() => {
                            startSaveVisit(async () => {
                              try {
                                await acceptInboundEmailVisitSuggestion({
                                  emailId,
                                  storeId: store.id,
                                  assignedManagerUserId: store.compliance_audit_2_assigned_manager_user_id || null,
                                  plannedDate: visitDate,
                                  plannedPurpose: visitPurpose,
                                  plannedPurposeNote: visitNote,
                                })
                                toast({
                                  title: 'Visit planned',
                                  description: 'The planned visit was saved and the email was marked reviewed.',
                                  variant: 'success',
                                })
                                router.refresh()
                                onOpenChange(false)
                              } catch (error) {
                                toast({
                                  title: 'Failed to plan visit',
                                  description: error instanceof Error ? error.message : 'Unable to create the suggested visit.',
                                  variant: 'destructive',
                                })
                              }
                            })
                          }}
                        >
                          {isSavingVisit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Schedule Visit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={isSavingVisit}
                          onClick={() => {
                            setShowVisitComposer(false)
                            setVisitDate(visitSuggestion?.plannedDate || getDefaultVisitDate())
                            setVisitPurpose(visitSuggestion?.plannedPurpose || 'general_follow_up')
                            setVisitNote(visitSuggestion?.plannedPurposeNote || buildDefaultNoteBody(email))
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
