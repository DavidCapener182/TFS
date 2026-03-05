'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  createStoreContact,
  createStoreContactTrackerEntry,
  createStoreNote,
  deleteStoreContact,
  deleteStoreContactTrackerEntry,
  deleteStoreNote,
} from '@/app/actions/store-crm'
import {
  ChevronRight,
  ClipboardList,
  History,
  Loader2,
  Mail,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react'

type ContactMethod = 'phone' | 'email' | 'either'
type NoteType = 'general' | 'contact' | 'audit' | 'fra' | 'other'
type InteractionType =
  | 'phone_call'
  | 'email'
  | 'meeting'
  | 'visit'
  | 'audit_update'
  | 'fra_update'
  | 'other'

export interface StoreCrmContact {
  id: string
  contact_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  preferred_method: ContactMethod | null
  is_primary: boolean
  notes: string | null
  created_by_user_id: string
  created_at: string
}

export interface StoreCrmNote {
  id: string
  note_type: NoteType
  title: string | null
  body: string
  created_by_user_id: string
  created_at: string
}

export interface StoreCrmTrackerEntry {
  id: string
  contact_id: string | null
  interaction_type: InteractionType
  subject: string
  details: string | null
  outcome: string | null
  interaction_at: string
  follow_up_date: string | null
  created_by_user_id: string
  created_at: string
}

interface StoreCrmPanelProps {
  storeId: string
  canEdit: boolean
  contacts: StoreCrmContact[]
  notes: StoreCrmNote[]
  trackerEntries: StoreCrmTrackerEntry[]
  userMap: Record<string, string | null>
  safetyCompliancePct?: number
  actionResolutionPct?: number
}

function getLocalDateTimeInputValue() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

function friendlyInteractionType(type: InteractionType) {
  switch (type) {
    case 'phone_call':
      return 'Phone Call'
    case 'email':
      return 'Email'
    case 'meeting':
      return 'Meeting'
    case 'visit':
      return 'Site Visit'
    case 'audit_update':
      return 'Audit Update'
    case 'fra_update':
      return 'FRA Update'
    default:
      return 'Other'
  }
}

function friendlyNoteType(type: NoteType) {
  switch (type) {
    case 'general':
      return 'General'
    case 'contact':
      return 'Contact'
    case 'audit':
      return 'Audit'
    case 'fra':
      return 'Urgent'
    default:
      return 'Other'
  }
}

function preferredMethodLabel(method: ContactMethod | null) {
  if (!method) return 'No preference'
  if (method === 'phone') return 'Phone preferred'
  if (method === 'email') return 'Email preferred'
  return 'Either phone or email'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

function clampPercent(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

export function StoreCrmPanel({
  storeId,
  canEdit,
  contacts,
  notes,
  trackerEntries,
  userMap,
  safetyCompliancePct,
  actionResolutionPct,
}: StoreCrmPanelProps) {
  const router = useRouter()
  const [activeSubTab, setActiveSubTab] = useState<'contacts' | 'notes' | 'tracker'>('contacts')
  const [showContactForm, setShowContactForm] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [showTrackerForm, setShowTrackerForm] = useState(false)

  const contactsById = useMemo(() => {
    const map = new Map<string, StoreCrmContact>()
    contacts.forEach((contact) => map.set(contact.id, contact))
    return map
  }, [contacts])

  const [contactForm, setContactForm] = useState({
    contactName: '',
    jobTitle: '',
    email: '',
    phone: '',
    preferredMethod: '' as '' | ContactMethod,
    notes: '',
    isPrimary: false,
  })

  const [noteForm, setNoteForm] = useState({
    noteType: 'general' as NoteType,
    title: '',
    body: '',
  })

  const [trackerForm, setTrackerForm] = useState({
    contactId: '',
    interactionType: 'phone_call' as InteractionType,
    subject: '',
    details: '',
    outcome: '',
    interactionAt: getLocalDateTimeInputValue(),
    followUpDate: '',
  })

  const [contactError, setContactError] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [trackerError, setTrackerError] = useState<string | null>(null)

  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
  const [deletingTrackerId, setDeletingTrackerId] = useState<string | null>(null)

  const [isSavingContact, startSaveContact] = useTransition()
  const [isSavingNote, startSaveNote] = useTransition()
  const [isSavingTracker, startSaveTracker] = useTransition()
  const [isDeletingContact, startDeleteContact] = useTransition()
  const [isDeletingNote, startDeleteNote] = useTransition()
  const [isDeletingTracker, startDeleteTracker] = useTransition()

  const handleCreateContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEdit) return

    setContactError(null)
    startSaveContact(async () => {
      try {
        await createStoreContact({
          storeId,
          contactName: contactForm.contactName,
          jobTitle: contactForm.jobTitle || undefined,
          email: contactForm.email || undefined,
          phone: contactForm.phone || undefined,
          preferredMethod: contactForm.preferredMethod || undefined,
          notes: contactForm.notes || undefined,
          isPrimary: contactForm.isPrimary,
        })

        setContactForm({
          contactName: '',
          jobTitle: '',
          email: '',
          phone: '',
          preferredMethod: '',
          notes: '',
          isPrimary: false,
        })
        setShowContactForm(false)
        router.refresh()
      } catch (error) {
        setContactError(toErrorMessage(error))
      }
    })
  }

  const handleCreateNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEdit) return

    setNoteError(null)
    startSaveNote(async () => {
      try {
        await createStoreNote({
          storeId,
          noteType: noteForm.noteType,
          title: noteForm.title || undefined,
          body: noteForm.body,
        })

        setNoteForm({
          noteType: 'general',
          title: '',
          body: '',
        })
        setShowNoteForm(false)
        router.refresh()
      } catch (error) {
        setNoteError(toErrorMessage(error))
      }
    })
  }

  const handleCreateTrackerEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEdit) return

    setTrackerError(null)
    startSaveTracker(async () => {
      try {
        await createStoreContactTrackerEntry({
          storeId,
          contactId: trackerForm.contactId || null,
          interactionType: trackerForm.interactionType,
          subject: trackerForm.subject,
          details: trackerForm.details || undefined,
          outcome: trackerForm.outcome || undefined,
          interactionAt: trackerForm.interactionAt || undefined,
          followUpDate: trackerForm.followUpDate || undefined,
        })

        setTrackerForm({
          contactId: '',
          interactionType: 'phone_call',
          subject: '',
          details: '',
          outcome: '',
          interactionAt: getLocalDateTimeInputValue(),
          followUpDate: '',
        })
        setShowTrackerForm(false)
        router.refresh()
      } catch (error) {
        setTrackerError(toErrorMessage(error))
      }
    })
  }

  const handleDeleteContact = (contact: StoreCrmContact) => {
    if (!canEdit) return
    if (!confirm(`Delete contact "${contact.contact_name}"?`)) return

    setDeletingContactId(contact.id)
    startDeleteContact(async () => {
      try {
        await deleteStoreContact(storeId, contact.id)
        router.refresh()
      } catch (error) {
        setContactError(toErrorMessage(error))
      } finally {
        setDeletingContactId(null)
      }
    })
  }

  const handleDeleteNote = (note: StoreCrmNote) => {
    if (!canEdit) return
    if (!confirm('Delete this note?')) return

    setDeletingNoteId(note.id)
    startDeleteNote(async () => {
      try {
        await deleteStoreNote(storeId, note.id)
        router.refresh()
      } catch (error) {
        setNoteError(toErrorMessage(error))
      } finally {
        setDeletingNoteId(null)
      }
    })
  }

  const handleDeleteTrackerEntry = (entry: StoreCrmTrackerEntry) => {
    if (!canEdit) return
    if (!confirm('Delete this tracker entry?')) return

    setDeletingTrackerId(entry.id)
    startDeleteTracker(async () => {
      try {
        await deleteStoreContactTrackerEntry(storeId, entry.id)
        router.refresh()
      } catch (error) {
        setTrackerError(toErrorMessage(error))
      } finally {
        setDeletingTrackerId(null)
      }
    })
  }

  const safetyPct = clampPercent(safetyCompliancePct)
  const resolutionPct = clampPercent(actionResolutionPct)

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
      <div className="space-y-6 md:col-span-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/50">
            <button
              onClick={() => setActiveSubTab('contacts')}
              className={`whitespace-nowrap px-6 py-4 text-sm font-medium ${
                activeSubTab === 'contacts'
                  ? 'border-b-2 border-blue-600 bg-white text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Contacts{' '}
              <span className="ml-1 rounded-full bg-slate-200 px-2 text-[10px] text-slate-600">{contacts.length}</span>
            </button>
            <button
              onClick={() => setActiveSubTab('notes')}
              className={`whitespace-nowrap px-6 py-4 text-sm font-medium ${
                activeSubTab === 'notes'
                  ? 'border-b-2 border-blue-600 bg-white text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Store Notes{' '}
              <span className="ml-1 rounded-full bg-slate-200 px-2 text-[10px] text-slate-600">{notes.length}</span>
            </button>
            <button
              onClick={() => setActiveSubTab('tracker')}
              className={`whitespace-nowrap px-6 py-4 text-sm font-medium ${
                activeSubTab === 'tracker'
                  ? 'border-b-2 border-blue-600 bg-white text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Contact Tracker{' '}
              <span className="ml-1 rounded-full bg-slate-200 px-2 text-[10px] text-slate-600">{trackerEntries.length}</span>
            </button>
          </div>

          <div className="p-6">
            {activeSubTab === 'contacts' && (
              <div className="space-y-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold">Primary Contacts</h3>
                  {canEdit ? (
                    <button
                      onClick={() => setShowContactForm((prev) => !prev)}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                    >
                      <Plus size={16} /> {showContactForm ? 'Cancel' : 'Add Contact'}
                    </button>
                  ) : null}
                </div>

                {showContactForm && canEdit && (
                  <form onSubmit={handleCreateContact} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="Contact name"
                        value={contactForm.contactName}
                        onChange={(event) =>
                          setContactForm((prev) => ({ ...prev, contactName: event.target.value }))
                        }
                        required
                      />
                      <Input
                        placeholder="Job title"
                        value={contactForm.jobTitle}
                        onChange={(event) =>
                          setContactForm((prev) => ({ ...prev, jobTitle: event.target.value }))
                        }
                      />
                      <Input
                        type="email"
                        placeholder="Email"
                        value={contactForm.email}
                        onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))}
                      />
                      <Input
                        placeholder="Phone"
                        value={contactForm.phone}
                        onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <select
                        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={contactForm.preferredMethod}
                        onChange={(event) =>
                          setContactForm((prev) => ({
                            ...prev,
                            preferredMethod: event.target.value as '' | ContactMethod,
                          }))
                        }
                      >
                        <option value="">Preferred method</option>
                        <option value="phone">Phone</option>
                        <option value="email">Email</option>
                        <option value="either">Either</option>
                      </select>
                      <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={contactForm.isPrimary}
                          onChange={(event) =>
                            setContactForm((prev) => ({ ...prev, isPrimary: event.target.checked }))
                          }
                        />
                        Primary
                      </label>
                    </div>
                    <Textarea
                      placeholder="Contact notes"
                      value={contactForm.notes}
                      onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                    {contactError && <p className="text-xs text-red-600">{contactError}</p>}
                    <Button type="submit" className="w-fit" disabled={isSavingContact}>
                      {isSavingContact ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        'Save Contact'
                      )}
                    </Button>
                  </form>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {contacts.length === 0 ? (
                    <div className="rounded-xl border border-slate-100 p-4 text-sm text-slate-500 sm:col-span-2">
                      No contacts recorded for this store yet.
                    </div>
                  ) : (
                    contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="group relative rounded-xl border border-slate-100 p-4 transition-all hover:border-blue-200 hover:bg-blue-50/30"
                      >
                        <div className="mb-3 flex justify-between gap-3">
                          <div>
                            <p className="flex items-center gap-2 font-bold text-slate-900">
                              {contact.contact_name}
                              {contact.is_primary ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight text-amber-700">
                                  Primary
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs font-medium text-slate-500">{contact.job_title || 'No title set'}</p>
                          </div>
                          {canEdit ? (
                            <button
                              className="text-slate-300 transition-colors hover:text-red-600"
                              onClick={() => handleDeleteContact(contact)}
                              disabled={isDeletingContact && deletingContactId === contact.id}
                            >
                              {isDeletingContact && deletingContactId === contact.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          ) : null}
                        </div>
                        <div className="space-y-2 text-xs text-slate-600">
                          <div className="flex items-center gap-2">
                            <Mail size={12} className="text-slate-400" /> {contact.email || 'No email'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone size={12} className="text-slate-400" /> {contact.phone || 'No phone'}
                          </div>
                          <div className="text-slate-500">{preferredMethodLabel(contact.preferred_method)}</div>
                          {contact.notes ? <p className="italic text-slate-500">&quot;{contact.notes}&quot;</p> : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeSubTab === 'notes' && (
              <div className="space-y-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold">Recent Store Notes</h3>
                  {canEdit ? (
                    <button
                      onClick={() => setShowNoteForm((prev) => !prev)}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                    >
                      <Plus size={16} /> {showNoteForm ? 'Cancel' : 'New Note'}
                    </button>
                  ) : null}
                </div>

                {showNoteForm && canEdit && (
                  <form onSubmit={handleCreateNote} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={noteForm.noteType}
                        onChange={(event) =>
                          setNoteForm((prev) => ({ ...prev, noteType: event.target.value as NoteType }))
                        }
                      >
                        <option value="general">General</option>
                        <option value="contact">Contact</option>
                        <option value="audit">Audit</option>
                        <option value="fra">FRA</option>
                        <option value="other">Other</option>
                      </select>
                      <Input
                        placeholder="Note title"
                        value={noteForm.title}
                        onChange={(event) => setNoteForm((prev) => ({ ...prev, title: event.target.value }))}
                      />
                    </div>
                    <Textarea
                      placeholder="Note details"
                      value={noteForm.body}
                      onChange={(event) => setNoteForm((prev) => ({ ...prev, body: event.target.value }))}
                      required
                    />
                    {noteError && <p className="text-xs text-red-600">{noteError}</p>}
                    <Button type="submit" className="w-fit" disabled={isSavingNote}>
                      {isSavingNote ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        'Save Note'
                      )}
                    </Button>
                  </form>
                )}

                <div className="space-y-3">
                  {notes.length === 0 ? (
                    <div className="rounded-xl border border-slate-100 p-4 text-sm text-slate-500">
                      No notes logged for this store.
                    </div>
                  ) : (
                    notes.map((note) => {
                      const noteLabel = friendlyNoteType(note.note_type)
                      const urgent = noteLabel === 'Urgent'

                      return (
                        <div
                          key={note.id}
                          className="flex gap-4 rounded-xl border border-slate-100 p-4 transition-all hover:shadow-sm"
                        >
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                              urgent ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-600'
                            }`}
                          >
                            <ClipboardList size={18} />
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 flex items-start justify-between gap-3">
                              <h4 className="font-bold text-slate-900">{note.title || 'Store Note'}</h4>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-slate-400">
                                  {format(new Date(note.created_at), 'dd MMM yyyy')}
                                </span>
                                {canEdit ? (
                                  <button
                                    className="text-slate-300 transition-colors hover:text-red-600"
                                    onClick={() => handleDeleteNote(note)}
                                    disabled={isDeletingNote && deletingNoteId === note.id}
                                  >
                                    {isDeletingNote && deletingNoteId === note.id ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <Trash2 size={14} />
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <p className="text-sm leading-relaxed text-slate-600">{note.body}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  urgent ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {noteLabel}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {userMap[note.created_by_user_id] || 'Unknown'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {activeSubTab === 'tracker' && (
              <div className="space-y-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold">Communication Log</h3>
                  {canEdit ? (
                    <button
                      onClick={() => setShowTrackerForm((prev) => !prev)}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                    >
                      <Plus size={16} /> {showTrackerForm ? 'Cancel' : 'Track Activity'}
                    </button>
                  ) : null}
                </div>

                {showTrackerForm && canEdit && (
                  <form
                    onSubmit={handleCreateTrackerEntry}
                    className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={trackerForm.interactionType}
                        onChange={(event) =>
                          setTrackerForm((prev) => ({
                            ...prev,
                            interactionType: event.target.value as InteractionType,
                          }))
                        }
                      >
                        <option value="phone_call">Phone Call</option>
                        <option value="email">Email</option>
                        <option value="meeting">Meeting</option>
                        <option value="visit">Site Visit</option>
                        <option value="audit_update">Audit Update</option>
                        <option value="fra_update">FRA Update</option>
                        <option value="other">Other</option>
                      </select>
                      <select
                        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={trackerForm.contactId}
                        onChange={(event) =>
                          setTrackerForm((prev) => ({ ...prev, contactId: event.target.value }))
                        }
                      >
                        <option value="">No linked contact</option>
                        {contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.contact_name}
                          </option>
                        ))}
                      </select>
                      <Input
                        placeholder="Subject"
                        value={trackerForm.subject}
                        onChange={(event) =>
                          setTrackerForm((prev) => ({ ...prev, subject: event.target.value }))
                        }
                        required
                      />
                      <Input
                        type="datetime-local"
                        value={trackerForm.interactionAt}
                        onChange={(event) =>
                          setTrackerForm((prev) => ({ ...prev, interactionAt: event.target.value }))
                        }
                      />
                      <Input
                        type="date"
                        value={trackerForm.followUpDate}
                        onChange={(event) =>
                          setTrackerForm((prev) => ({ ...prev, followUpDate: event.target.value }))
                        }
                      />
                    </div>
                    <Textarea
                      placeholder="Details"
                      value={trackerForm.details}
                      onChange={(event) =>
                        setTrackerForm((prev) => ({ ...prev, details: event.target.value }))
                      }
                    />
                    <Textarea
                      placeholder="Outcome"
                      value={trackerForm.outcome}
                      onChange={(event) =>
                        setTrackerForm((prev) => ({ ...prev, outcome: event.target.value }))
                      }
                    />
                    {trackerError && <p className="text-xs text-red-600">{trackerError}</p>}
                    <Button type="submit" className="w-fit" disabled={isSavingTracker}>
                      {isSavingTracker ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        'Save Activity'
                      )}
                    </Button>
                  </form>
                )}

                <div className="space-y-3">
                  {trackerEntries.length === 0 ? (
                    <div className="rounded-xl border border-slate-100 p-4 text-sm text-slate-500">
                      No communication log entries yet.
                    </div>
                  ) : (
                    trackerEntries.map((entry) => {
                      const linkedContact = entry.contact_id ? contactsById.get(entry.contact_id) : null
                      const interactionDate = new Date(entry.interaction_at)

                      return (
                        <div
                          key={entry.id}
                          className="group flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:border-blue-100 hover:bg-white"
                        >
                          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white">
                            <span className="text-[10px] font-bold text-slate-400">{format(interactionDate, 'MMM').toUpperCase()}</span>
                            <span className="text-lg font-bold leading-none text-blue-600">{format(interactionDate, 'd')}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between gap-3">
                              <h4 className="font-bold text-slate-900">{entry.subject}</h4>
                              <span className="rounded bg-slate-200 px-2 text-xs font-semibold text-slate-600">
                                {friendlyInteractionType(entry.interaction_type)}
                              </span>
                            </div>
                            <p className="mb-2 text-xs text-slate-500">
                              With{' '}
                              <span className="font-medium text-blue-600">
                                {linkedContact?.contact_name || 'No linked contact'}
                              </span>{' '}
                              • {format(interactionDate, 'HH:mm')}
                            </p>
                            <p className="rounded border border-slate-100 bg-white p-2 text-sm italic text-slate-600">
                              &quot;{entry.outcome || entry.details || 'No outcome recorded.'}&quot;
                            </p>
                          </div>
                          {canEdit ? (
                            <button
                              className="text-slate-300 transition-colors hover:text-red-600"
                              onClick={() => handleDeleteTrackerEntry(entry)}
                              disabled={isDeletingTracker && deletingTrackerId === entry.id}
                            >
                              {isDeletingTracker && deletingTrackerId === entry.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 md:col-span-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <History size={18} className="text-blue-500" />
            Quick Actions
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Generate Store Report', href: '/reports' },
              { label: 'Schedule Inspection', href: '/calendar' },
              { label: 'Audit Questionnaire', href: '/audit-tracker' },
              { label: 'Fire Risk Assessment', href: '/fire-risk-assessment' },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="group flex w-full items-center justify-between rounded-xl p-3 text-left text-sm font-medium text-slate-700 transition-all hover:bg-blue-50"
              >
                {action.label}
                <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500" />
              </Link>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-[#0f172a] p-4 text-white shadow-xl shadow-slate-200 md:rounded-2xl md:p-6">
          <div className="relative z-10">
            <h3 className="mb-1 text-base font-bold md:text-lg">Operational Health</h3>
            <p className="mb-4 text-[11px] text-slate-400 md:mb-6 md:text-xs">Real-time status tracking</p>

            <div className="space-y-3 md:space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-300">Safety Compliance</span>
                  <span className="font-bold text-blue-400">{safetyPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-blue-500" style={{ width: `${safetyPct}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-300">Action Resolution</span>
                  <span className="font-bold text-green-400">{resolutionPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-green-500" style={{ width: `${resolutionPct}%` }} />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />
        </div>
      </div>
    </div>
  )
}
