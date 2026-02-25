import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { StoreDetailWorkspace } from '@/components/stores/store-detail-workspace'

async function getStore(storeId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fa_stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching store:', error)
    return null
  }

  return data
}

async function getStoreIncidents(storeId: string) {
  const supabase = createClient()

  const [openResult, closedResult] = await Promise.all([
    supabase
      .from('fa_incidents')
      .select('id, reference_no, summary, status, closed_at, occurred_at, severity')
      .eq('store_id', storeId),
    supabase
      .from('fa_closed_incidents')
      .select('id, reference_no, summary, status, closed_at, occurred_at, severity')
      .eq('store_id', storeId),
  ])

  if (openResult.error) {
    console.error('Error fetching open store incidents:', openResult.error)
  }
  if (closedResult.error) {
    console.error('Error fetching closed store incidents:', closedResult.error)
  }

  const openIncidents = openResult.data || []
  const closedIncidents = (closedResult.data || []).map((incident) => ({
    ...incident,
    status: incident.status || 'closed',
  }))

  return [...openIncidents, ...closedIncidents].sort((a, b) => {
    const aTime = a?.occurred_at ? new Date(a.occurred_at).getTime() : 0
    const bTime = b?.occurred_at ? new Date(b.occurred_at).getTime() : 0
    return bTime - aTime
  })
}

async function getStoreActions(storeId: string) {
  const supabase = createClient()

  const { data: incidents, error: incidentsError } = await supabase
    .from('fa_incidents')
    .select('id')
    .eq('store_id', storeId)

  if (incidentsError) {
    console.error('Error fetching store incidents for actions:', incidentsError)
  }

  const incidentIds = (incidents || []).map((incident: { id: string }) => incident.id)

  const { data: storeActions, error: storeActionsError } = await supabase
    .from('fa_store_actions')
    .select('id, title, source_flagged_item, description, priority, status, due_date, completed_at, created_at')
    .eq('store_id', storeId)
    .order('due_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (storeActionsError) {
    console.error('Error fetching direct store actions:', storeActionsError)
  }

  let incidentActions: any[] = []
  if (incidentIds.length > 0) {
    const { data, error } = await supabase
      .from('fa_actions')
      .select(`
        id,
        title,
        status,
        due_date,
        completed_at,
        incident_id,
        incident:fa_incidents!fa_actions_incident_id_fkey(reference_no)
      `)
      .in('incident_id', incidentIds)
      .order('due_date', { ascending: false })

    if (error) {
      console.error('Error fetching incident-linked store actions:', error)
    } else {
      incidentActions = data || []
    }
  }

  const mappedIncidentActions = incidentActions.map((action: any) => ({
    ...action,
    source_type: 'incident' as const,
  }))

  const mappedStoreActions = (storeActions || []).map((action: any) => ({
    ...action,
    incident_id: null,
    incident: null,
    source_type: 'store' as const,
  }))

  return [...mappedIncidentActions, ...mappedStoreActions].sort((a, b) => {
    const aTime = a?.due_date ? new Date(a.due_date).getTime() : 0
    const bTime = b?.due_date ? new Date(b.due_date).getTime() : 0
    return bTime - aTime
  })
}

async function getStoreCrmData(storeId: string) {
  const supabase = createClient()
  const [contactsResult, notesResult, trackerResult] = await Promise.all([
    supabase
      .from('fa_store_contacts')
      .select('id, contact_name, job_title, email, phone, preferred_method, is_primary, notes, created_by_user_id, created_at')
      .eq('store_id', storeId)
      .order('is_primary', { ascending: false })
      .order('contact_name', { ascending: true }),
    supabase
      .from('fa_store_notes')
      .select('id, note_type, title, body, created_by_user_id, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false }),
    supabase
      .from('fa_store_contact_tracker')
      .select('id, contact_id, interaction_type, subject, details, outcome, interaction_at, follow_up_date, created_by_user_id, created_at')
      .eq('store_id', storeId)
      .order('interaction_at', { ascending: false }),
  ])

  if (contactsResult.error) {
    console.error('Error fetching store contacts:', contactsResult.error)
  }
  if (notesResult.error) {
    console.error('Error fetching store notes:', notesResult.error)
  }
  if (trackerResult.error) {
    console.error('Error fetching store contact tracker:', trackerResult.error)
  }

  const contacts = contactsResult.data || []
  const notes = notesResult.data || []
  const trackerEntries = trackerResult.data || []

  const userIds = new Set<string>()
  contacts.forEach((contact) => {
    if (contact.created_by_user_id) userIds.add(contact.created_by_user_id)
  })
  notes.forEach((note) => {
    if (note.created_by_user_id) userIds.add(note.created_by_user_id)
  })
  trackerEntries.forEach((entry) => {
    if (entry.created_by_user_id) userIds.add(entry.created_by_user_id)
  })

  let profileRows: Array<{ id: string; full_name: string | null }> = []
  if (userIds.size > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('fa_profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds))

    if (profilesError) {
      console.error('Error fetching CRM profile names:', profilesError)
    } else {
      profileRows = profiles || []
    }
  }

  const userMap = profileRows.reduce<Record<string, string | null>>((accumulator, profile) => {
    accumulator[profile.id] = profile.full_name
    return accumulator
  }, {})

  return { contacts, notes, trackerEntries, userMap }
}

export default async function StoreCrmPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile } = await requireRole(['admin', 'ops', 'readonly'])

  const store = await getStore(params.id)
  if (!store) {
    notFound()
  }

  const [incidents, actions, crmData] = await Promise.all([
    getStoreIncidents(params.id),
    getStoreActions(params.id),
    getStoreCrmData(params.id),
  ])

  const canEdit = profile.role === 'admin' || profile.role === 'ops'

  return (
    <StoreDetailWorkspace
      store={store}
      incidents={incidents}
      actions={actions}
      crmData={crmData}
      canEdit={canEdit}
    />
  )
}
