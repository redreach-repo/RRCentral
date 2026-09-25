import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  ExternalLink,
  Loader2,
  Mail,
  UserPlus,
  MessageCircle,
  FileText,
  FolderOpen,
  MessageSquarePlus,
  LayoutGrid,
  List,
  Phone,
} from 'lucide-react'
import { db } from '../lib/db'
import { CRM_OUTCOME_REASONS, NEXT_ACTIONS, PIPELINE_STAGES } from '../lib/config'
import type { ActivityLogEntry, AppUser, CrmContact, CrmEntry, CustomerDocument } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { logActivity } from '../lib/activity'
import {
  communicationKindLabel,
  loadCustomerDocuments,
} from '../lib/customerFiles'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import { displayDocumentReference } from '../lib/documents'
import {
  applyMessageTemplate,
  DEFAULT_EMAIL_CRM_BODY,
  DEFAULT_EMAIL_CRM_SUBJECT,
  DEFAULT_WHATSAPP_CRM,
} from '../lib/templates'
import {
  buildFollowUpWhatsAppMessage,
  DEFAULT_WHATSAPP_FOLLOWUP_INVOICE,
  DEFAULT_WHATSAPP_FOLLOWUP_QUOTE,
  loadFollowUpDocument,
} from '../lib/followUpMessage'
import {
  CONTACT_ROLES,
  contactDisplay,
  flatFieldsFromContacts,
  hydrateContacts,
  newContact,
  normalizeContacts,
  primaryContact,
} from '../lib/contacts'
import {
  deleteZohoCalendarEvent,
  isZohoCalendarEnabled,
  isZohoMailEnabled,
  syncFollowUpToZohoCalendar,
} from '../lib/zoho'
import EmailComposeModal from '../components/EmailComposeModal'
import LinkWorkDriveModal from '../components/LinkWorkDriveModal'
import SaveToFolderPrompt from '../components/SaveToFolderPrompt'
import WebsiteInquiriesPanel from '../site/components/WebsiteInquiriesPanel'
import PageHeader from '../components/PageHeader'
import CrmLogTouchModal, { type LogTouchPayload } from '../components/CrmLogTouchModal'
import CrmPipelineBoard from '../components/CrmPipelineBoard'
import { useCompactCrm } from '../hooks/useMediaQuery'
import resp from '../styles/crmResponsive.module.css'
import {
  computeDueCounts,
  crmSearchHaystack,
  matchesFollowFilter,
  resolveSalesOwnerName,
  sortByFollowUpUrgency,
  type CrmViewMode,
  type FollowBucket,
} from '../lib/crmWorkQueue'
import {
  page,
  btn,
  btnPrimary,
  btnDanger,
  btnGhost,
  input,
  label,
  tableWrap,
  table,
  th,
  td,
  overlay,
  modal,
  modalHeader,
  modalBody,
  modalFooter,
  formGrid,
  emptyState,
  errorBanner,
  colors,
} from '../lib/pageStyles'

type CrmForm = {
  company_name: string
  contacts: CrmContact[]
  company_owner: string
  address: string
  website: string
  trn: string
  notes: string
  follow_up_date: string
  next_action: string
  owner: string
  pipeline_stage: string
  quote_ref: string
  outcome_reason: string
}

type FollowFilter = FollowBucket

type SheetTab = 'overview' | 'contacts' | 'activity'

const emptyForm = (): CrmForm => ({
  company_name: '',
  contacts: [newContact({ role: 'Primary' })],
  company_owner: '',
  address: '',
  website: '',
  trn: '',
  notes: '',
  follow_up_date: '',
  next_action: '',
  owner: '',
  pipeline_stage: 'Lead',
  quote_ref: '',
  outcome_reason: '',
})

const chip = (active: boolean): CSSProperties => ({
  ...btnGhost,
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 8,
  border: `1px solid ${active ? colors.accent : colors.border}`,
  background: active ? `${colors.accent}22` : 'transparent',
  color: active ? colors.text : colors.muted,
  fontWeight: active ? 700 : 500,
})

const compactSelect: CSSProperties = {
  ...input,
  padding: '4px 8px',
  fontSize: 12,
  minWidth: 0,
  width: '100%',
  maxWidth: 160,
}

function followUpColor(dateStr: string | null): string {
  if (!dateStr) return colors.muted2
  try {
    const d = startOfDay(parseISO(dateStr.slice(0, 10)))
    if (isToday(d)) return colors.warn
    if (isBefore(d, startOfDay(new Date()))) return colors.danger
    return colors.success
  } catch {
    return colors.muted2
  }
}

export default function CrmPage() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [entries, setEntries] = useState<CrmEntry[]>([])
  const [owners, setOwners] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('All')
  const [ownerFilter, setOwnerFilter] = useState<string>('All')
  const [followFilter, setFollowFilter] = useState<FollowFilter>('All')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CrmEntry | null>(null)
  const [form, setForm] = useState<CrmForm>(() => emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<CrmEntry | null>(null)
  const [emailTarget, setEmailTarget] = useState<CrmEntry | null>(null)
  const [activity, setActivity] = useState<ActivityLogEntry[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [quickBusyId, setQuickBusyId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<CrmViewMode>('list')
  const [logTouchTarget, setLogTouchTarget] = useState<CrmEntry | null>(null)
  const [savePromptTarget, setSavePromptTarget] = useState<{ entry: CrmEntry; channel: 'email' | 'whatsapp' } | null>(null)
  const [linkFileTarget, setLinkFileTarget] = useState<{ entry: CrmEntry; channel: 'email' | 'whatsapp' } | null>(null)
  const [folderDocs, setFolderDocs] = useState<CustomerDocument[]>([])
  const [outcomeTarget, setOutcomeTarget] = useState<CrmEntry | null>(null)
  const [outcomeStage, setOutcomeStage] = useState<'Won' | 'Lost'>('Won')
  const [outcomeReason, setOutcomeReason] = useState('')
  const [sheetTab, setSheetTab] = useState<SheetTab>('overview')
  const [defaultsReady, setDefaultsReady] = useState(false)
  const compact = useCompactCrm()

  const myOwnerName = useMemo(
    () => resolveSalesOwnerName(user?.email, owners),
    [user?.email, owners],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [crmRes, usersRes] = await Promise.all([
        db.from('crm').select('*').order('updated_at', { ascending: false }),
        db.from('app_users').select('*').eq('active', true).order('name'),
      ])
      if (crmRes.error) throw crmRes.error
      if (usersRes.error) throw usersRes.error
      setEntries(
        ((crmRes.data || []) as CrmEntry[]).map((row) => ({
          ...row,
          pipeline_stage: row.pipeline_stage || 'Lead',
          company_owner: row.company_owner || '',
          address: row.address || '',
          website: row.website || '',
          trn: row.trn || '',
          outcome_reason: row.outcome_reason || '',
        })),
      )
      setOwners((usersRes.data || []) as AppUser[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CRM')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openEdit = useCallback((entry: CrmEntry) => {
    setEditing(entry)
    const contacts = hydrateContacts(entry)
    setForm({
      company_name: entry.company_name || '',
      contacts: contacts.length ? contacts : [newContact({ role: 'Primary' })],
      company_owner: entry.company_owner || '',
      address: entry.address || '',
      website: entry.website || '',
      trn: entry.trn || '',
      notes: entry.notes || '',
      follow_up_date: entry.follow_up_date ? entry.follow_up_date.slice(0, 10) : '',
      next_action: entry.next_action || '',
      owner: entry.owner || '',
      pipeline_stage: entry.pipeline_stage || 'Lead',
      quote_ref: entry.quote_ref || '',
      outcome_reason: entry.outcome_reason || '',
    })
    setSheetTab('overview')
    setModalOpen(true)
    setActivityLoading(true)
    void (async () => {
      try {
        const company = entry.company_name
        const [actRes, actByCrmRes, fuRes, quoteRes, folderDocsList] = await Promise.all([
          db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(120),
          db.from('activity_log').select('*').eq('crm_id', entry.id).order('created_at', { ascending: false }).limit(40),
          db.from('follow_up_updates').select('*').eq('crm_id', entry.id).order('created_at', { ascending: false }),
          db.from('quotations').select('*').ilike('client', company).order('created_at', { ascending: false }).limit(10),
          loadCustomerDocuments(company).catch(() => [] as CustomerDocument[]),
        ])
        setFolderDocs(folderDocsList)
        const byCrm = (actByCrmRes.data || []) as ActivityLogEntry[]
        const byCrmIds = new Set(byCrm.map((a) => a.id))
        const legacy = ((actRes.data || []) as ActivityLogEntry[]).filter(
          (a) =>
            !byCrmIds.has(a.id) &&
            (a.reference === company ||
              a.details?.includes(company) ||
              (a.entity === 'crm' && a.reference === company)),
        )
        const logs = [...byCrm, ...legacy]
        const updates = ((fuRes.data || []) as { update_text?: string; user_email?: string; created_at?: string }[]).map(
          (u, i) =>
            ({
              id: `fu-${i}`,
              action: 'followup_note',
              entity: 'crm',
              reference: company,
              details: u.update_text || '',
              user_email: u.user_email || '',
              created_at: u.created_at || '',
            }) satisfies ActivityLogEntry,
        )
        const quotes = ((quoteRes.data || []) as { reference_number?: string; quote_id?: string; status?: string; amount?: number; created_at?: string }[]).map(
          (q, i) =>
            ({
              id: `q-${i}`,
              action: 'quotation',
              entity: 'quotation',
              reference: displayDocumentReference({
                referenceNumber: q.reference_number,
                fallbackId: q.quote_id,
                status: q.status,
              }),
              details: `${q.status || ''} · AED ${Number(q.amount || 0).toFixed(2)}`,
              user_email: '',
              created_at: q.created_at || '',
            }) satisfies ActivityLogEntry,
        )
        const fileEvents = folderDocsList.map(
          (d, i) =>
            ({
              id: `wd-${d.id || i}`,
              action: d.category.startsWith('signed_')
                ? 'workdrive_signed'
                : d.category === 'supplier_invoice'
                  ? 'workdrive_supplier'
                  : 'workdrive_communication',
              entity: 'customer_document',
              reference: d.title || d.file_name || 'WorkDrive file',
              details: [
                ['email', 'whatsapp', 'call_notes', 'communication'].includes(d.category)
                  ? communicationKindLabel(d.category)
                  : d.category.replace(/_/g, ' '),
                d.related_ref ? `Ref ${d.related_ref}` : '',
                d.drive_url ? 'WorkDrive link' : '',
              ]
                .filter(Boolean)
                .join(' · '),
              user_email: d.uploaded_by || '',
              created_at: d.uploaded_at || '',
              crm_id: entry.id,
            }) satisfies ActivityLogEntry,
        )
        const merged = [...logs, ...updates, ...quotes, ...fileEvents].sort((a, b) =>
          String(b.created_at).localeCompare(String(a.created_at)),
        )
        setActivity(merged.slice(0, 40))
      } catch {
        setActivity([])
        setFolderDocs([])
      } finally {
        setActivityLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    const editId = searchParams.get('edit')
    const stage = searchParams.get('stage')
    const follow = searchParams.get('follow')
    const owner = searchParams.get('owner')
    const view = searchParams.get('view')
    const hasFilterParams = Boolean(stage || follow || owner || view)

    if (stage) setStageFilter(stage)
    if (
      follow === 'Due' ||
      follow === 'Overdue' ||
      follow === 'Today' ||
      follow === 'Upcoming' ||
      follow === 'None' ||
      follow === 'All'
    ) {
      setFollowFilter(follow)
    }
    if (owner === 'me' && myOwnerName) setOwnerFilter(myOwnerName)
    else if (owner === 'Unassigned' || owner === '') setOwnerFilter('Unassigned')
    else if (owner && owner !== 'me') setOwnerFilter(owner)
    if (view === 'board' || view === 'list') setViewMode(view)

    if (!defaultsReady && !loading && !hasFilterParams) {
      if (myOwnerName) setOwnerFilter(myOwnerName)
      setFollowFilter('Due')
      setDefaultsReady(true)
    } else if (!defaultsReady && !loading && hasFilterParams) {
      setDefaultsReady(true)
    }

    if (!editId || loading || !entries.length) return
    const found = entries.find((e) => e.id === editId)
    if (found) {
      openEdit(found)
      setSearchParams({}, { replace: true })
    }
  }, [
    searchParams,
    entries,
    loading,
    openEdit,
    setSearchParams,
    myOwnerName,
    defaultsReady,
  ])

  const ownerOptions = useMemo(() => {
    const names = new Set<string>()
    for (const o of owners) {
      const n = o.name || o.email
      if (n) names.add(n)
    }
    for (const e of entries) {
      if (e.owner) names.add(e.owner)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [owners, entries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = entries.filter((e) => {
      if (stageFilter !== 'All' && (e.pipeline_stage || 'Lead') !== stageFilter) return false
      if (ownerFilter === 'Unassigned') {
        if (e.owner) return false
      } else if (ownerFilter !== 'All' && (e.owner || '') !== ownerFilter) {
        return false
      }
      if (!matchesFollowFilter(e, followFilter)) return false
      if (!q) return true
      return crmSearchHaystack(e).includes(q)
    })
    return [...rows].sort(sortByFollowUpUrgency)
  }, [entries, search, stageFilter, ownerFilter, followFilter])

  const dueCounts = useMemo(
    () => computeDueCounts(entries, myOwnerName),
    [entries, myOwnerName],
  )

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { All: entries.length }
    for (const s of PIPELINE_STAGES) counts[s] = 0
    for (const e of entries) {
      const s = e.pipeline_stage || 'Lead'
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [entries])

  async function quickPatch(
    entry: CrmEntry,
    patch: Partial<Pick<CrmEntry, 'pipeline_stage' | 'follow_up_date' | 'next_action' | 'outcome_reason'>>,
  ) {
    if (patch.pipeline_stage === 'Won' || patch.pipeline_stage === 'Lost') {
      setOutcomeTarget(entry)
      setOutcomeStage(patch.pipeline_stage)
      setOutcomeReason(entry.outcome_reason || '')
      return
    }

    setQuickBusyId(entry.id)
    setError('')
    try {
      const nextFollow = patch.follow_up_date !== undefined ? patch.follow_up_date : entry.follow_up_date
      const payload: Record<string, unknown> = {
        ...patch,
        updated_by: user?.email || '',
        updated_at: new Date().toISOString(),
      }
      if (isZohoCalendarEnabled(settings) && patch.follow_up_date !== undefined) {
        try {
          const contacts = hydrateContacts(entry)
          const p = primaryContact(contacts)
          if (nextFollow) {
            const eventId = await syncFollowUpToZohoCalendar(settings, {
              company: entry.company_name,
              nextAction: patch.next_action ?? entry.next_action,
              owner: entry.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              followUpDate: String(nextFollow).slice(0, 10),
              existingEventId: entry.calendar_event_id || undefined,
            })
            if (eventId) payload.calendar_event_id = eventId
          } else if (entry.calendar_event_id) {
            await deleteZohoCalendarEvent(settings, entry.calendar_event_id)
            payload.calendar_event_id = ''
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error ? `Updated locally; Zoho: ${calErr.message}` : 'Updated; calendar sync failed',
            'error',
          )
        }
      }
      const { error: err } = await db.from('crm').update(payload).eq('id', entry.id)
      if (err) throw err
      await logActivity(
        'quick_update_crm',
        'crm',
        entry.company_name,
        Object.entries(patch)
          .map(([k, v]) => `${k}=${v ?? '—'}`)
          .join(' · '),
        user?.email || '',
        entry.id,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quick update failed')
    } finally {
      setQuickBusyId(null)
    }
  }

  async function confirmOutcome() {
    if (!outcomeTarget || !outcomeReason.trim()) {
      showToast('Outcome reason is required', 'error')
      return
    }
    const entry = outcomeTarget
    setQuickBusyId(entry.id)
    try {
      const { error: err } = await db
        .from('crm')
        .update({
          pipeline_stage: outcomeStage,
          outcome_reason: outcomeReason.trim(),
          updated_by: user?.email || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)
      if (err) throw err
      await logActivity(
        'close_crm',
        'crm',
        entry.company_name,
        `${outcomeStage}: ${outcomeReason.trim()}`,
        user?.email || '',
        entry.id,
      )
      showToast(`Marked ${outcomeStage}`, 'success')
      setOutcomeTarget(null)
      setOutcomeReason('')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not close deal', 'error')
    } finally {
      setQuickBusyId(null)
    }
  }

  async function saveLogTouch(payload: LogTouchPayload) {
    if (!logTouchTarget) return
    const entry = logTouchTarget
    setQuickBusyId(entry.id)
    try {
      const { error: err } = await db.from('follow_up_updates').insert({
        crm_id: entry.id,
        company: entry.company_name,
        update_text: payload.text,
        user_email: user?.email || '',
      })
      if (err) throw err

      const patch: Record<string, unknown> = {
        updated_by: user?.email || '',
        updated_at: new Date().toISOString(),
      }
      if (payload.pipeline_stage) patch.pipeline_stage = payload.pipeline_stage
      if (payload.next_action) patch.next_action = payload.next_action
      if (payload.clearDate) patch.follow_up_date = null
      else if (payload.follow_up_date) patch.follow_up_date = payload.follow_up_date

      if (isZohoCalendarEnabled(settings) && (payload.clearDate || payload.follow_up_date)) {
        try {
          const contacts = hydrateContacts(entry)
          const p = primaryContact(contacts)
          if (payload.clearDate) {
            if (entry.calendar_event_id) {
              await deleteZohoCalendarEvent(settings, entry.calendar_event_id)
              patch.calendar_event_id = ''
            }
          } else if (payload.follow_up_date) {
            const eventId = await syncFollowUpToZohoCalendar(settings, {
              company: entry.company_name,
              nextAction: payload.next_action || entry.next_action,
              owner: entry.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              followUpDate: payload.follow_up_date,
              existingEventId: entry.calendar_event_id || undefined,
            })
            if (eventId) patch.calendar_event_id = eventId
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error
              ? `Saved locally; Zoho Calendar: ${calErr.message}`
              : 'Saved locally; calendar sync failed',
            'error',
          )
        }
      }

      const { error: crmErr } = await db.from('crm').update(patch).eq('id', entry.id)
      if (crmErr) throw crmErr

      await logActivity(
        'followup_update',
        'crm',
        entry.company_name,
        payload.text.slice(0, 120),
        user?.email || '',
        entry.id,
      )
      showToast('Touch logged', 'success')
      setLogTouchTarget(null)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save touch', 'error')
    } finally {
      setQuickBusyId(null)
    }
  }

  function openCreate() {
    setEditing(null)
    const defaultOwner =
      owners.find((o) => o.email === user?.email)?.name || user?.email || ''
    setForm({ ...emptyForm(), owner: defaultOwner })
    setActivity([])
    setSheetTab('overview')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
    setActivity([])
  }

  function updateContact(id: string, patch: Partial<CrmContact>) {
    setForm((f) => ({
      ...f,
      contacts: f.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }

  function addContact() {
    setForm((f) => ({
      ...f,
      contacts: [...f.contacts, newContact({ role: f.contacts.length ? 'Other' : 'Primary' })],
    }))
  }

  async function openWhatsAppFollowUp(row: CrmEntry) {
    const p = primaryContact(hydrateContacts(row))
    const phone = p?.phone || row.mobile_number || ''
    if (!phone) {
      showToast('No phone number on this company', 'error')
      return
    }
    setQuickBusyId(row.id)
    try {
      const doc = await loadFollowUpDocument(row)
      const text = buildFollowUpWhatsAppMessage({
        entry: row,
        contactName: p?.name,
        companyName: settings.companyName || 'Red Reach Middle East FZE',
        doc,
        quoteTemplate: settings.whatsappFollowUpQuoteMessage || DEFAULT_WHATSAPP_FOLLOWUP_QUOTE,
        invoiceTemplate:
          settings.whatsappFollowUpInvoiceMessage || DEFAULT_WHATSAPP_FOLLOWUP_INVOICE,
        genericTemplate: settings.whatsappCrmMessage || DEFAULT_WHATSAPP_CRM,
      })
      window.open(
        buildWhatsAppUrl(phone, text, settings.whatsappCountryCode || '971'),
        '_blank',
        'noopener,noreferrer',
      )
      await logActivity(
        'whatsapp_crm',
        'crm',
        row.company_name,
        doc ? `${doc.kind} ${doc.ref}` : 'Follow-up WhatsApp',
        user?.email || '',
        row.id,
      )
      if (doc) {
        showToast(
          `WhatsApp ready · ${doc.kind === 'quote' ? 'Quotation' : 'Invoice'} ${doc.ref}`,
          'success',
        )
      } else {
        showToast('WhatsApp opened', 'success')
      }
      setSavePromptTarget({ entry: row, channel: 'whatsapp' })
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not prepare WhatsApp message', 'error')
    } finally {
      setQuickBusyId(null)
    }
  }

  function renderCrmRowActions(row: CrmEntry) {
    const phone = primaryContact(hydrateContacts(row))?.phone || row.mobile_number || row.office_number || ''
    return (
      <>
        <button
          type="button"
          style={btnGhost}
          title="Log touch"
          onClick={() => setLogTouchTarget(row)}
        >
          <MessageSquarePlus size={14} />
        </button>
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s+/g, '')}`}
            style={{ ...btnGhost, display: 'inline-flex', textDecoration: 'none' }}
            title="Call"
            onClick={() => {
              void logActivity('call_crm', 'crm', row.company_name, phone, user?.email || '', row.id)
            }}
          >
            <Phone size={14} />
          </a>
        ) : null}
        <Link
          to={`/quotations?client=${encodeURIComponent(row.company_name)}&new=1`}
          style={{ ...btnGhost, display: 'inline-flex', textDecoration: 'none' }}
          title="Create quote"
        >
          <FileText size={14} />
        </Link>
        <button type="button" style={btnGhost} onClick={() => setEmailTarget(row)} title="Email">
          <Mail size={14} />
        </button>
        <button
          type="button"
          style={btnGhost}
          title="WhatsApp follow-up"
          disabled={quickBusyId === row.id}
          onClick={() => void openWhatsAppFollowUp(row)}
        >
          <MessageCircle size={14} />
        </button>
        <button type="button" style={btnGhost} onClick={() => openEdit(row)} title="Edit">
          <Pencil size={14} />
        </button>
        <button type="button" style={btnGhost} onClick={() => setDeleteTarget(row)} title="Delete">
          <Trash2 size={14} />
        </button>
      </>
    )
  }

  function removeContact(id: string) {
    setForm((f) => {
      const next = f.contacts.filter((c) => c.id !== id)
      return { ...f, contacts: next.length ? next : [newContact({ role: 'Primary' })] }
    })
  }

  async function upsertClient(formData: CrmForm, contacts: CrmContact[]) {
    if (!formData.company_name.trim()) return
    const flat = flatFieldsFromContacts(contacts)
    const { data: existing } = await db
      .from('clients')
      .select('id')
      .ilike('company_name', formData.company_name.trim())
      .maybeSingle()

    const clientRow = {
      company_name: formData.company_name.trim(),
      primary_contact: flat.primary_contact,
      email: flat.email_phone,
      mobile: flat.mobile_number,
      office: flat.office_number,
      address: formData.address.trim(),
      trn: formData.trn.trim(),
      website: formData.website.trim(),
      company_owner: formData.company_owner.trim(),
      notes: formData.notes.trim(),
      contacts: normalizeContacts(contacts),
    }

    if (existing?.id) {
      await db.from('clients').update(clientRow).eq('id', existing.id)
    } else {
      await db.from('clients').insert(clientRow)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form.company_name.trim()) {
      setError('Company name is required')
      return
    }
    const stage = form.pipeline_stage || 'Lead'
    const closed = stage === 'Won' || stage === 'Lost'
    if (!closed) {
      if (!form.follow_up_date) {
        setError('Follow-up date is required for open deals')
        return
      }
      if (!form.next_action.trim()) {
        setError('Next action is required for open deals')
        return
      }
    }
    if (closed && !form.outcome_reason.trim()) {
      setError(`${stage} reason is required`)
      return
    }
    setSaving(true)
    setError('')
    const who = user?.email || ''
    const contacts = normalizeContacts(form.contacts)
    const flat = flatFieldsFromContacts(contacts)
    const followUpDate = form.follow_up_date || null
    const prevEventId = editing?.calendar_event_id || ''

    const payload: Record<string, unknown> = {
      company_name: form.company_name.trim(),
      ...flat,
      contacts,
      company_owner: form.company_owner.trim(),
      address: form.address.trim(),
      website: form.website.trim(),
      trn: form.trn.trim(),
      notes: form.notes.trim(),
      follow_up_date: followUpDate,
      next_action: form.next_action,
      owner: form.owner,
      pipeline_stage: stage,
      quote_ref: form.quote_ref.trim(),
      outcome_reason: form.outcome_reason.trim(),
      updated_by: who,
      updated_at: new Date().toISOString(),
    }

    try {
      let savedId = editing?.id || ''
      if (editing) {
        const { error: err } = await db.from('crm').update(payload).eq('id', editing.id)
        if (err) throw err
        savedId = editing.id
      } else {
        const newId = crypto.randomUUID()
        const { error: err } = await db.from('crm').insert({
          ...payload,
          id: newId,
          created_by: who,
          calendar_event_id: '',
        })
        if (err) throw err
        savedId = newId
      }

      await upsertClient(form, contacts)
      await logActivity(
        editing ? 'update_crm' : 'create_crm',
        'crm',
        form.company_name.trim(),
        `${form.pipeline_stage || 'Lead'} · ${form.next_action || 'no action'}`,
        who,
        savedId,
      )

      // Best-effort Zoho Calendar sync
      if (isZohoCalendarEnabled(settings)) {
        try {
          const p = primaryContact(contacts)
          if (followUpDate) {
            const eventId = await syncFollowUpToZohoCalendar(settings, {
              company: form.company_name.trim(),
              nextAction: form.next_action,
              owner: form.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              followUpDate,
              existingEventId: prevEventId || undefined,
            })
            if (savedId && eventId && eventId !== prevEventId) {
              await db
                .from('crm')
                .update({ calendar_event_id: eventId })
                .eq('id', savedId)
            }
          } else if (prevEventId) {
            await deleteZohoCalendarEvent(settings, prevEventId)
            if (savedId) {
              await db.from('crm').update({ calendar_event_id: '' }).eq('id', savedId)
            }
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error ? `Saved, but Zoho Calendar: ${calErr.message}` : 'Saved, but calendar sync failed',
            'error',
          )
        }
      }

      closeModal()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    setError('')
    try {
      if (isZohoCalendarEnabled(settings) && deleteTarget.calendar_event_id) {
        try {
          await deleteZohoCalendarEvent(settings, deleteTarget.calendar_event_id)
        } catch {
          /* ignore calendar delete errors on CRM delete */
        }
      }
      const { error: err } = await db.from('crm').delete().eq('id', deleteTarget.id)
      if (err) throw err
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={page}>
      <PageHeader
        title="Pipeline"
        subtitle="My Day opens overdue & today by default. Log every touch. Switch to board when you need the full funnel."
        actions={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div className={resp.viewToggle} role="group" aria-label="CRM view">
              <button
                type="button"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
              >
                <List size={14} /> List
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'board'}
                onClick={() => setViewMode('board')}
              >
                <LayoutGrid size={14} /> Board
              </button>
            </div>
            <button type="button" style={btnPrimary} onClick={openCreate}>
              <Plus size={16} /> Add company
            </button>
          </div>
        }
      />

      <WebsiteInquiriesPanel
        onConverted={(crmId) => {
          void (async () => {
            await load()
            if (crmId) setSearchParams({ edit: crmId })
          })()
        }}
      />

      {error && <div style={errorBanner}>{error}</div>}

      <div className={resp.dueStrip}>
        <button
          type="button"
          className={`${resp.dueTile} ${ownerFilter === myOwnerName && followFilter === 'Due' ? resp.dueTileActive : ''}`}
          onClick={() => {
            if (myOwnerName) setOwnerFilter(myOwnerName)
            setFollowFilter('Due')
            setStageFilter('All')
          }}
        >
          <span className={resp.dueTileValue} style={{ color: colors.warn }}>
            {dueCounts.overdue + dueCounts.today}
          </span>
          <span className={resp.dueTileLabel}>My Day</span>
        </button>
        <button
          type="button"
          className={`${resp.dueTile} ${followFilter === 'Overdue' ? resp.dueTileActive : ''}`}
          onClick={() => setFollowFilter('Overdue')}
        >
          <span className={resp.dueTileValue} style={{ color: colors.danger }}>
            {dueCounts.overdue}
          </span>
          <span className={resp.dueTileLabel}>Overdue</span>
        </button>
        <button
          type="button"
          className={`${resp.dueTile} ${followFilter === 'Today' ? resp.dueTileActive : ''}`}
          onClick={() => setFollowFilter('Today')}
        >
          <span className={resp.dueTileValue} style={{ color: colors.warn }}>
            {dueCounts.today}
          </span>
          <span className={resp.dueTileLabel}>Today</span>
        </button>
        <button
          type="button"
          className={`${resp.dueTile} ${followFilter === 'Upcoming' ? resp.dueTileActive : ''}`}
          onClick={() => setFollowFilter('Upcoming')}
        >
          <span className={resp.dueTileValue} style={{ color: colors.success }}>
            {dueCounts.upcoming}
          </span>
          <span className={resp.dueTileLabel}>Upcoming</span>
        </button>
        <button
          type="button"
          className={`${resp.dueTile} ${ownerFilter === 'All' && followFilter === 'All' && stageFilter === 'All' ? resp.dueTileActive : ''}`}
          onClick={() => {
            setOwnerFilter('All')
            setFollowFilter('All')
            setStageFilter('All')
          }}
        >
          <span className={resp.dueTileValue}>{entries.length}</span>
          <span className={resp.dueTileLabel}>All deals</span>
        </button>
      </div>

      <div className={resp.toolbar}>
        <div className={resp.toolbarSearch}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: colors.muted2,
            }}
          />
          <input
            style={{ ...input, paddingLeft: 36 }}
            placeholder="Search company, contact, owner, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          style={{ ...input, flex: '0 1 180px', maxWidth: compact ? '100%' : 180 }}
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          title="Sales owner"
        >
          <option value="All">All sales owners</option>
          {myOwnerName ? <option value={myOwnerName}>Me ({myOwnerName})</option> : null}
          <option value="Unassigned">Unassigned</option>
          {ownerOptions
            .filter((o) => o !== myOwnerName)
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
      </div>

      <div className={resp.chipRow}>
        <button type="button" style={chip(stageFilter === 'All')} onClick={() => setStageFilter('All')}>
          All stages ({stageCounts.All || 0})
        </button>
        {PIPELINE_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            style={chip(stageFilter === s)}
            onClick={() => setStageFilter(s)}
          >
            {s} ({stageCounts[s] || 0})
          </button>
        ))}
      </div>

      <div className={resp.chipRow}>
        {(['All', 'Due', 'Overdue', 'Today', 'Upcoming', 'None'] as FollowFilter[]).map((f) => (
          <button key={f} type="button" style={chip(followFilter === f)} onClick={() => setFollowFilter(f)}>
            {f === 'All' ? 'Any follow-up' : f === 'Due' ? 'Due (overdue + today)' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={emptyState}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            ...emptyState,
            background: colors.card,
            borderRadius: 12,
            border: `1px solid ${colors.border}`,
          }}
        >
          {search || stageFilter !== 'All' || ownerFilter !== 'All' || followFilter !== 'All'
            ? 'No companies match your filters. Try My Day or All deals above.'
            : 'No CRM entries yet. Add your first company.'}
        </div>
      ) : viewMode === 'board' ? (
        <CrmPipelineBoard
          entries={filtered}
          busyId={quickBusyId}
          onOpen={openEdit}
          onMoveStage={(row, stage) => void quickPatch(row, { pipeline_stage: stage })}
          onLogTouch={setLogTouchTarget}
          renderActions={renderCrmRowActions}
        />
      ) : compact ? (
        <div className={resp.listStack}>
          {filtered.map((row) => {
            const contacts = hydrateContacts(row)
            const display = contactDisplay(contacts)
            const p = primaryContact(contacts)
            const busy = quickBusyId === row.id
            return (
              <article key={row.id} className={resp.card}>
                <div className={resp.cardTop}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <button type="button" className={resp.cardTitle} onClick={() => openEdit(row)}>
                      {row.company_name}
                    </button>
                    <div className={resp.cardMeta}>
                      {display.label}
                      {display.extra > 0 ? ` · +${display.extra}` : ''}
                      {row.company_owner ? ` · Client owner: ${row.company_owner}` : ''}
                    </div>
                  </div>
                  {row.quote_ref ? (
                    <Link
                      to={`/quotations?ref=${encodeURIComponent(row.quote_ref)}`}
                      style={{
                        color: colors.accent,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {row.quote_ref} <ExternalLink size={12} />
                    </Link>
                  ) : null}
                </div>
                <div className={resp.cardGrid}>
                  <div className={resp.cardField}>
                    <label>Stage</label>
                    <select
                      style={compactSelect}
                      disabled={busy}
                      value={row.pipeline_stage || 'Lead'}
                      onChange={(e) => void quickPatch(row, { pipeline_stage: e.target.value })}
                    >
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={resp.cardField}>
                    <label>Follow-up</label>
                    <input
                      type="date"
                      style={{
                        ...compactSelect,
                        color: followUpColor(row.follow_up_date),
                        fontWeight: 600,
                      }}
                      disabled={busy}
                      value={row.follow_up_date ? row.follow_up_date.slice(0, 10) : ''}
                      onChange={(e) =>
                        void quickPatch(row, { follow_up_date: e.target.value || null })
                      }
                    />
                  </div>
                  <div className={resp.cardField}>
                    <label>Next action</label>
                    <select
                      style={compactSelect}
                      disabled={busy}
                      value={row.next_action || ''}
                      onChange={(e) => void quickPatch(row, { next_action: e.target.value })}
                    >
                      <option value="">—</option>
                      {NEXT_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={resp.cardField}>
                    <label>Phone</label>
                    <div style={{ fontSize: 13, color: colors.text, paddingTop: 6 }}>
                      {p?.phone || row.mobile_number || row.office_number ? (
                        <a
                          href={`tel:${(p?.phone || row.mobile_number || row.office_number || '').replace(/\s+/g, '')}`}
                          style={{ color: colors.accent, textDecoration: 'none' }}
                        >
                          {p?.phone || row.mobile_number || row.office_number}
                        </a>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </div>
                <div className={resp.cardMeta}>Sales owner: {row.owner || 'Unassigned'}</div>
                <div className={resp.cardActions}>{renderCrmRowActions(row)}</div>
              </article>
            )
          })}
        </div>
      ) : (
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Company</th>
                <th style={th}>Contacts</th>
                <th style={th}>Company owner</th>
                <th style={th}>Stage</th>
                <th style={th}>Phone</th>
                <th style={th}>Follow-up</th>
                <th style={th}>Next action</th>
                <th style={th}>Sales owner</th>
                <th style={th}>Quote</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const contacts = hydrateContacts(row)
                const display = contactDisplay(contacts)
                const p = primaryContact(contacts)
                const busy = quickBusyId === row.id
                return (
                  <tr key={row.id}>
                    <td style={td}>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: colors.text,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          textAlign: 'left',
                        }}
                      >
                        {row.company_name}
                      </button>
                    </td>
                    <td style={td}>
                      {display.label}
                      {display.extra > 0 ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            color: colors.accent,
                            fontWeight: 600,
                          }}
                        >
                          +{display.extra}
                        </span>
                      ) : null}
                    </td>
                    <td style={td}>{row.company_owner || '—'}</td>
                    <td style={td}>
                      <select
                        style={compactSelect}
                        disabled={busy}
                        value={row.pipeline_stage || 'Lead'}
                        onChange={(e) => void quickPatch(row, { pipeline_stage: e.target.value })}
                      >
                        {PIPELINE_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>{p?.phone || row.mobile_number || row.office_number || '—'}</td>
                    <td style={{ ...td, color: followUpColor(row.follow_up_date), fontWeight: 600 }}>
                      <input
                        type="date"
                        style={{ ...compactSelect, maxWidth: 150, color: 'inherit', fontWeight: 600 }}
                        disabled={busy}
                        value={row.follow_up_date ? row.follow_up_date.slice(0, 10) : ''}
                        onChange={(e) =>
                          void quickPatch(row, { follow_up_date: e.target.value || null })
                        }
                      />
                    </td>
                    <td style={td}>
                      <select
                        style={compactSelect}
                        disabled={busy}
                        value={row.next_action || ''}
                        onChange={(e) => void quickPatch(row, { next_action: e.target.value })}
                      >
                        <option value="">—</option>
                        {NEXT_ACTIONS.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>{row.owner || '—'}</td>
                    <td style={td}>
                      {row.quote_ref ? (
                        <Link
                          to={`/quotations?ref=${encodeURIComponent(row.quote_ref)}`}
                          style={{
                            color: colors.accent,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {row.quote_ref} <ExternalLink size={12} />
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{renderCrmRowActions(row)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div
          style={{
            ...overlay,
            alignItems: compact ? 'stretch' : 'center',
            padding: compact
              ? 'max(0px, env(safe-area-inset-top)) 0 max(0px, env(safe-area-inset-bottom)) 0'
              : overlay.padding,
          }}
          onClick={closeModal}
        >
          <div
            style={{
              ...modal,
              maxWidth: compact ? '100%' : 720,
              maxHeight: compact ? '100dvh' : '90vh',
              minHeight: compact ? '100dvh' : undefined,
              borderRadius: compact ? 0 : 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16, minWidth: 0, wordBreak: 'break-word' }}>
                {editing ? editing.company_name : 'Add company'}
              </h3>
              <button type="button" style={btnGhost} onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)}>
              <div style={modalBody}>
                {editing ? (
                  <div className={resp.sheetTabs} role="tablist">
                    {(
                      [
                        ['overview', 'Overview'],
                        ['contacts', 'Contacts'],
                        ['activity', 'Activity'],
                      ] as const
                    ).map(([id, tabLabel]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={sheetTab === id}
                        className={`${resp.sheetTab} ${sheetTab === id ? resp.sheetTabActive : ''}`}
                        onClick={() => setSheetTab(id)}
                      >
                        {tabLabel}
                      </button>
                    ))}
                  </div>
                ) : null}

                {editing ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                    <button type="button" style={btn} onClick={() => setLogTouchTarget(editing)}>
                      <MessageSquarePlus size={14} /> Log touch
                    </button>
                    <Link
                      to={`/quotations?client=${encodeURIComponent(editing.company_name)}&new=1`}
                      style={{ ...btn, textDecoration: 'none' }}
                    >
                      <FileText size={14} /> New quote
                    </Link>
                    <Link
                      to={`/customer-files?company=${encodeURIComponent(editing.company_name)}`}
                      style={{ ...btn, textDecoration: 'none' }}
                    >
                      <FolderOpen size={14} /> Files
                      {folderDocs.length ? ` (${folderDocs.length})` : ''}
                    </Link>
                    {editing.drive_folder_url ? (
                      <a
                        href={editing.drive_folder_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...btn, textDecoration: 'none' }}
                      >
                        <ExternalLink size={14} /> WorkDrive
                      </a>
                    ) : (
                      <Link
                        to={`/customer-files?company=${encodeURIComponent(editing.company_name)}`}
                        style={{ ...btn, textDecoration: 'none', opacity: 0.85 }}
                        title="Link a Zoho WorkDrive folder"
                      >
                        <FolderOpen size={14} /> Link folder
                      </Link>
                    )}
                    <button
                      type="button"
                      style={btn}
                      onClick={() => setLinkFileTarget({ entry: editing, channel: 'email' })}
                    >
                      <MessageCircle size={14} /> File chat
                    </button>
                  </div>
                ) : null}

                <div
                  style={{
                    ...formGrid,
                    display: sheetTab === 'overview' || !editing ? 'grid' : 'none',
                  }}
                >
                  <Field label="Company *">
                    <input
                      style={input}
                      required={sheetTab === 'overview' || !editing}
                      value={form.company_name}
                      onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Client business owner">
                    <input
                      style={input}
                      value={form.company_owner}
                      onChange={(e) => setForm((f) => ({ ...f, company_owner: e.target.value }))}
                      placeholder="Proprietor / business owner name"
                    />
                  </Field>
                  <Field label="Address">
                    <input
                      style={input}
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </Field>
                  <Field label="Website">
                    <input
                      style={input}
                      value={form.website}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                      placeholder="www.example.com"
                    />
                  </Field>
                  <Field label="TRN">
                    <input
                      style={input}
                      value={form.trn}
                      onChange={(e) => setForm((f) => ({ ...f, trn: e.target.value }))}
                    />
                  </Field>
                  <Field label="Follow-up date *">
                    <input
                      type="date"
                      style={input}
                      value={form.follow_up_date}
                      required={form.pipeline_stage !== 'Won' && form.pipeline_stage !== 'Lost'}
                      onChange={(e) => setForm((f) => ({ ...f, follow_up_date: e.target.value }))}
                    />
                  </Field>
                  <Field label="Next action *">
                    <select
                      style={input}
                      value={form.next_action}
                      required={form.pipeline_stage !== 'Won' && form.pipeline_stage !== 'Lost'}
                      onChange={(e) => setForm((f) => ({ ...f, next_action: e.target.value }))}
                    >
                      <option value="">Select next action…</option>
                      {NEXT_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sales owner (Red Reach)">
                    <select
                      style={input}
                      value={form.owner}
                      onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                    >
                      <option value="">—</option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.name || o.email}>
                          {o.name || o.email}
                        </option>
                      ))}
                      {form.owner &&
                        !owners.some((o) => (o.name || o.email) === form.owner) && (
                          <option value={form.owner}>{form.owner}</option>
                        )}
                    </select>
                  </Field>
                  <Field label="Pipeline stage">
                    <select
                      style={input}
                      value={form.pipeline_stage}
                      onChange={(e) => setForm((f) => ({ ...f, pipeline_stage: e.target.value }))}
                    >
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quote ref">
                    <input
                      style={input}
                      value={form.quote_ref}
                      onChange={(e) => setForm((f) => ({ ...f, quote_ref: e.target.value }))}
                      placeholder="RR-01-26001"
                    />
                  </Field>
                  {(form.pipeline_stage === 'Won' || form.pipeline_stage === 'Lost') && (
                    <Field label={`${form.pipeline_stage} reason`}>
                      <select
                        style={input}
                        value={form.outcome_reason}
                        onChange={(e) => setForm((f) => ({ ...f, outcome_reason: e.target.value }))}
                      >
                        <option value="">—</option>
                        {CRM_OUTCOME_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {form.outcome_reason &&
                          !CRM_OUTCOME_REASONS.includes(
                            form.outcome_reason as (typeof CRM_OUTCOME_REASONS)[number],
                          ) && (
                            <option value={form.outcome_reason}>{form.outcome_reason}</option>
                          )}
                      </select>
                      <input
                        style={{ ...input, marginTop: 8 }}
                        placeholder="Or type a custom reason"
                        value={
                          CRM_OUTCOME_REASONS.includes(
                            form.outcome_reason as (typeof CRM_OUTCOME_REASONS)[number],
                          )
                            ? ''
                            : form.outcome_reason
                        }
                        onChange={(e) => setForm((f) => ({ ...f, outcome_reason: e.target.value }))}
                      />
                    </Field>
                  )}
                </div>

                <div
                  style={{
                    display: sheetTab === 'contacts' || !editing ? 'block' : 'none',
                    marginTop: 8,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <label style={{ ...label, margin: 0 }}>Contacts</label>
                    <button type="button" style={btnGhost} onClick={addContact}>
                      <UserPlus size={14} /> Add contact
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {form.contacts.map((c, idx) => (
                      <div
                        key={c.id}
                        style={{
                          border: `1px solid ${colors.border}`,
                          borderRadius: 10,
                          padding: 12,
                          background: 'rgba(0,0,0,0.2)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                            fontSize: 12,
                            color: colors.muted2,
                          }}
                        >
                          <span>Contact {idx + 1}</span>
                          {form.contacts.length > 1 ? (
                            <button type="button" style={btnGhost} onClick={() => removeContact(c.id)}>
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                            gap: 10,
                          }}
                        >
                          <Field label="Name">
                            <input
                              style={input}
                              value={c.name}
                              onChange={(e) => updateContact(c.id, { name: e.target.value })}
                            />
                          </Field>
                          <Field label="Email">
                            <input
                              style={input}
                              type="email"
                              value={c.email}
                              onChange={(e) => updateContact(c.id, { email: e.target.value })}
                            />
                          </Field>
                          <Field label="Phone">
                            <input
                              style={input}
                              value={c.phone}
                              onChange={(e) => updateContact(c.id, { phone: e.target.value })}
                            />
                          </Field>
                          <Field label="Role">
                            <select
                              style={input}
                              value={c.role}
                              onChange={(e) => updateContact(c.id, { role: e.target.value })}
                            >
                              {CONTACT_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                  {isZohoCalendarEnabled(settings) ? (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.muted2 }}>
                      Follow-up date syncs to Zoho Calendar when enabled in Settings.
                    </p>
                  ) : null}
                </div>

                <div style={{ display: sheetTab === 'overview' || !editing ? 'block' : 'none' }}>
                  <Field label="Notes">
                    <textarea
                      style={{ ...input, minHeight: 80, resize: 'vertical' }}
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </Field>
                </div>

                {editing ? (
                  <div style={{ marginTop: 16, display: sheetTab === 'activity' ? 'block' : 'none' }}>
                    <label style={{ ...label, marginBottom: 8 }}>Activity timeline</label>
                    {activityLoading ? (
                      <p style={{ color: colors.muted, fontSize: 13 }}>Loading activity…</p>
                    ) : activity.length === 0 ? (
                      <p style={{ color: colors.muted2, fontSize: 13 }}>
                        No activity yet. Log a touch, send WhatsApp/email, or save changes to build the timeline.
                      </p>
                    ) : (
                      <div
                        style={{
                          maxHeight: 320,
                          overflowY: 'auto',
                          border: `1px solid ${colors.border}`,
                          borderRadius: 10,
                          padding: 10,
                          display: 'grid',
                          gap: 8,
                        }}
                      >
                        {activity.map((a) => (
                          <div
                            key={a.id}
                            style={{
                              fontSize: 12,
                              borderBottom: `1px solid ${colors.border}`,
                              paddingBottom: 8,
                            }}
                          >
                            <div style={{ color: colors.muted2 }}>
                              {a.created_at
                                ? format(parseISO(String(a.created_at).slice(0, 19)), 'dd MMM yyyy HH:mm')
                                : '—'}
                              {a.user_email ? ` · ${a.user_email}` : ''}
                              {` · ${a.action}`}
                            </div>
                            <div style={{ color: colors.text, marginTop: 2 }}>
                              {a.reference ? <strong>{a.reference}</strong> : null}
                              {a.reference && a.details ? ' — ' : ''}
                              {a.details}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div style={modalFooter}>
                <button type="button" style={btn} onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" style={btnPrimary} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CrmLogTouchModal
        open={!!logTouchTarget}
        entry={logTouchTarget}
        busy={!!logTouchTarget && quickBusyId === logTouchTarget.id}
        onClose={() => setLogTouchTarget(null)}
        onSave={saveLogTouch}
      />

      {outcomeTarget && (
        <div style={overlay} onClick={() => setOutcomeTarget(null)}>
          <div style={{ ...modal, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                Mark {outcomeStage} — {outcomeTarget.company_name}
              </h3>
              <button type="button" style={btnGhost} onClick={() => setOutcomeTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={modalBody}>
              <Field label={`${outcomeStage} reason *`}>
                <select
                  style={input}
                  value={
                    CRM_OUTCOME_REASONS.includes(outcomeReason as (typeof CRM_OUTCOME_REASONS)[number])
                      ? outcomeReason
                      : ''
                  }
                  onChange={(e) => setOutcomeReason(e.target.value)}
                >
                  <option value="">Select reason…</option>
                  {CRM_OUTCOME_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  style={{ ...input, marginTop: 8 }}
                  placeholder="Or type a custom reason"
                  value={
                    CRM_OUTCOME_REASONS.includes(outcomeReason as (typeof CRM_OUTCOME_REASONS)[number])
                      ? ''
                      : outcomeReason
                  }
                  onChange={(e) => setOutcomeReason(e.target.value)}
                />
              </Field>
            </div>
            <div style={modalFooter}>
              <button type="button" style={btn} onClick={() => setOutcomeTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                style={btnPrimary}
                disabled={quickBusyId === outcomeTarget.id}
                onClick={() => void confirmOutcome()}
              >
                Confirm {outcomeStage}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div style={overlay} onClick={() => setDeleteTarget(null)}>
          <div style={{ ...modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Delete company?</h3>
            </div>
            <div style={modalBody}>
              <p style={{ margin: 0, color: colors.muted, fontSize: 14 }}>
                Delete <strong style={{ color: colors.text }}>{deleteTarget.company_name}</strong>? This
                cannot be undone.
              </p>
            </div>
            <div style={modalFooter}>
              <button type="button" style={btn} onClick={() => setDeleteTarget(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" style={btnDanger} onClick={() => void handleDelete()} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <EmailComposeModal
        open={!!emailTarget}
        companyName={emailTarget?.company_name || ''}
        contacts={emailTarget ? hydrateContacts(emailTarget) : []}
        defaultSubject={applyMessageTemplate(settings.emailCrmSubject || DEFAULT_EMAIL_CRM_SUBJECT, {
          client: emailTarget?.company_name || '',
          company: settings.companyName || 'Red Reach Middle East FZE',
          contact: emailTarget ? primaryContact(hydrateContacts(emailTarget))?.name || 'team' : 'team',
        })}
        defaultBody={applyMessageTemplate(settings.emailCrmBody || DEFAULT_EMAIL_CRM_BODY, {
          client: emailTarget?.company_name || '',
          company: settings.companyName || 'Red Reach Middle East FZE',
          contact: emailTarget ? primaryContact(hydrateContacts(emailTarget))?.name || 'team' : 'team',
        })}
        zohoEnabled={isZohoMailEnabled(settings)}
        onClose={() => setEmailTarget(null)}
        onSent={async () => {
          if (!emailTarget) return
          await logActivity(
            'email_crm',
            'crm',
            emailTarget.company_name,
            'Email sent from CRM',
            user?.email || '',
            emailTarget.id,
          )
          const target = emailTarget
          setEmailTarget(null)
          setSavePromptTarget({ entry: target, channel: 'email' })
        }}
      />

      <SaveToFolderPrompt
        open={!!savePromptTarget}
        company={savePromptTarget?.entry.company_name || ''}
        channel={savePromptTarget?.channel || 'email'}
        onClose={() => setSavePromptTarget(null)}
        onFileNow={() => {
          if (!savePromptTarget) return
          setLinkFileTarget(savePromptTarget)
          setSavePromptTarget(null)
        }}
      />

      <LinkWorkDriveModal
        open={!!linkFileTarget}
        onClose={() => setLinkFileTarget(null)}
        onSaved={async () => {
          if (!linkFileTarget) return
          const docs = await loadCustomerDocuments(linkFileTarget.entry.company_name).catch(() => [])
          setFolderDocs(docs)
          if (editing?.id === linkFileTarget.entry.id) {
            openEdit({ ...linkFileTarget.entry })
          }
        }}
        company={linkFileTarget?.entry.company_name || ''}
        crmId={linkFileTarget?.entry.id || null}
        uploadedBy={user?.email || ''}
        mode="communication"
        defaultCategory={linkFileTarget?.channel === 'whatsapp' ? 'whatsapp' : 'email'}
      />
    </div>
  )
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={label as CSSProperties}>{text}</label>
      {children}
    </div>
  )
}
