import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import {
  Plus,
  Trash2,
  Search,
  X,
  ExternalLink,
  Loader2,
  UserPlus,
  MessageCircle,
  FileText,
  FolderOpen,
  Receipt,
  MessageSquarePlus,
  LayoutGrid,
  List,
  Settings,
  ChevronDown,
} from 'lucide-react'
import CrmRowActions from '../components/crm/CrmRowActions'
import { db } from '../lib/db'
import { CRM_OUTCOME_REASONS, NEXT_ACTIONS, PIPELINE_STAGES } from '../lib/config'
import { loadCrmStageKeys } from '../lib/pipelines'
import { crmMoveProblem } from '../lib/dealRules'
import { parseCrmForm } from '../lib/schemas/crm'
import { parseCrmOutcomeForm } from '../lib/schemas/crmOutcome'
import LostReasonFields from '../components/deals/LostReasonFields'
import type { ActivityLogEntry, AppUser, CrmContact, CrmEntry, CustomerDocument, Invoice, Quotation } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { logActivity } from '../lib/activity'
import { can } from '../lib/permissions'
import { buildDealProgress } from '../lib/dealProgress'
import DealProgressStrip from '../components/DealProgressStrip'
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
import { getCalendarProvider, getMailProvider } from '../lib/mailCalendar'
import { resolveOwnerEmails } from '../lib/calendarAttendees'
import EmailComposeModal from '../components/EmailComposeModal'
import LinkDriveFileModal from '../components/LinkDriveFileModal'
import SaveToFolderPrompt from '../components/SaveToFolderPrompt'
import WebsiteInquiriesPanel from '../site/components/WebsiteInquiriesPanel'
import CrmLogTouchModal, { type LogTouchPayload } from '../components/CrmLogTouchModal'
import CrmPipelineBoard from '../components/CrmPipelineBoard'
import CustomFieldsCard from '../components/CustomFieldsCard'
import SavedViewsBar from '../components/SavedViewsBar'
import {
  crmFiltersEqual,
  normalizeCrmFilters,
  type CrmViewFilters,
} from '../lib/savedViews'
import { triggerStageEnterWorkflows } from '../lib/workflowRunner'
import CalendarSettingsModal from '../components/CalendarSettingsModal'
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
import docsStyles from '../styles/docsList.module.css'
import { errorMessage } from '../lib/errors'
import QuoteNudgesCard from '../components/quotes/QuoteNudgesCard'
import SessionFollowUpsCard from '../components/ctrm/SessionFollowUpsCard'
import ContractsVaultPanel from '../components/crm/ContractsVaultPanel'
import {
  createAccountFromCrm,
  findAccountForCrm,
  syncCrmContactsToAccount,
  type CrmAccountLink,
} from '../lib/crmAccountLink'

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
  lost_note: string
}

type FollowFilter = FollowBucket

type SheetTab = 'overview' | 'contacts' | 'money' | 'files' | 'activity'

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
  lost_note: '',
})

const compactSelect: CSSProperties = {
  ...input,
  padding: '8px 10px',
  fontSize: 13,
  minWidth: 0,
  width: '100%',
  maxWidth: '100%',
  minHeight: 40,
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
  const { user, userRole, appUserId } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const canViewAll = can(userRole, 'crm.viewAll')
  const canReassign = can(userRole, 'crm.reassignOwner')
  const canDeleteCrm = can(userRole, 'crm.deleteAny')
  const canLinkAccounts = can(userRole, 'accounts.viewAll') || can(userRole, 'accounts.write')
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
  const [dealQuotes, setDealQuotes] = useState<Quotation[]>([])
  const [dealInvoices, setDealInvoices] = useState<Invoice[]>([])
  const [outcomeTarget, setOutcomeTarget] = useState<CrmEntry | null>(null)
  const [outcomeStage, setOutcomeStage] = useState<'Won' | 'Lost'>('Won')
  const [outcomeNote, setOutcomeNote] = useState('')
  const [outcomeReason, setOutcomeReason] = useState('')
  const [sheetTab, setSheetTab] = useState<SheetTab>('overview')
  const [companyDetailsOpen, setCompanyDetailsOpen] = useState(false)
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null)
  const [defaultsReady, setDefaultsReady] = useState(false)
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false)
  const [accountLink, setAccountLink] = useState<CrmAccountLink | null>(null)
  const [accountLinkBusy, setAccountLinkBusy] = useState(false)
  const [crmStages, setCrmStages] = useState<string[]>(() => [...PIPELINE_STAGES])
  const compact = useCompactCrm()

  useEffect(() => {
    void loadCrmStageKeys().then(setCrmStages)
  }, [])

  const myOwnerName = useMemo(
    () => resolveSalesOwnerName(user?.email, owners),
    [user?.email, owners],
  )

  const currentCrmViewFilters = useMemo(
    () =>
      normalizeCrmFilters({
        q: search,
        stage: stageFilter,
        owner: ownerFilter,
        follow: followFilter,
        view: viewMode,
      }),
    [search, stageFilter, ownerFilter, followFilter, viewMode],
  )

  const applyCrmViewFilters = useCallback(
    (raw: Record<string, unknown>) => {
      const f = raw as CrmViewFilters
      const nextStage = String(f.stage || 'All')
      const nextOwner = String(f.owner || 'All')
      const nextFollow = String(f.follow || 'All')
      const nextView = f.view === 'board' ? 'board' : 'list'
      const nextQ = String(f.q || '')
      setStageFilter(nextStage)
      setOwnerFilter(
        !canViewAll && myOwnerName && (nextOwner === 'All' || !nextOwner)
          ? myOwnerName
          : nextOwner,
      )
      setFollowFilter(
        nextFollow === 'Due' ||
          nextFollow === 'Overdue' ||
          nextFollow === 'Today' ||
          nextFollow === 'Upcoming' ||
          nextFollow === 'None' ||
          nextFollow === 'All'
          ? nextFollow
          : 'All',
      )
      setViewMode(nextView)
      setSearch(nextQ)
      setDefaultsReady(true)
      const params = new URLSearchParams()
      if (nextStage !== 'All') params.set('stage', nextStage)
      if (nextOwner !== 'All') {
        params.set('owner', nextOwner === myOwnerName ? 'me' : nextOwner)
      }
      if (nextFollow !== 'All') params.set('follow', nextFollow)
      if (nextView !== 'list') params.set('view', nextView)
      setSearchParams(params, { replace: true })
    },
    [canViewAll, myOwnerName, setSearchParams],
  )

  const teamForCalendar = useMemo(
    () => owners.map((o) => ({ email: o.email, name: o.name, active: o.active })),
    [owners],
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
      setError(errorMessage(e, 'Failed to load CRM'))
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
      lost_note: entry.lost_note || '',
    })
    setSheetTab('overview')
    setCompanyDetailsOpen(false)
    setAccountLink(null)
    setModalOpen(true)
    setActivityLoading(true)
    void (async () => {
      try {
        const company = entry.company_name
        const [actRes, actByCrmRes, fuRes, quoteRes, invRes, folderDocsList, link] = await Promise.all([
          db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(120),
          db.from('activity_log').select('*').eq('crm_id', entry.id).order('created_at', { ascending: false }).limit(40),
          db.from('follow_up_updates').select('*').eq('crm_id', entry.id).order('created_at', { ascending: false }),
          db.from('quotations').select('*').ilike('client', company).order('created_at', { ascending: false }).limit(20),
          db.from('invoices').select('*').ilike('client', company).order('created_at', { ascending: false }).limit(20),
          loadCustomerDocuments(company).catch(() => [] as CustomerDocument[]),
          canLinkAccounts
            ? findAccountForCrm(entry).catch((): CrmAccountLink => ({ status: 'none' }))
            : Promise.resolve({ status: 'none' } as CrmAccountLink),
        ])
        setFolderDocs(folderDocsList)
        setAccountLink(link)
        setDealQuotes((quoteRes.data || []) as Quotation[])
        setDealInvoices((invRes.data || []) as Invoice[])
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
                ? 'drive_signed'
                : d.category === 'supplier_invoice'
                  ? 'drive_supplier'
                  : 'drive_communication',
              entity: 'customer_document',
              reference: d.title || d.file_name || 'Google Drive file',
              details: [
                ['email', 'whatsapp', 'call_notes', 'communication'].includes(d.category)
                  ? communicationKindLabel(d.category)
                  : d.category.replace(/_/g, ' '),
                d.related_ref ? `Ref ${d.related_ref}` : '',
                d.drive_url ? 'Google Drive link' : '',
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
        setAccountLink({ status: 'none' })
      } finally {
        setActivityLoading(false)
      }
    })()
  }, [canLinkAccounts])

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
      // My Day–first: land on overdue + today for the signed-in owner.
      if (myOwnerName) setOwnerFilter(myOwnerName)
      setFollowFilter('Due')
      setDefaultsReady(true)
    } else if (!defaultsReady && !loading && hasFilterParams) {
      if (!canViewAll && myOwnerName) setOwnerFilter(myOwnerName)
      setDefaultsReady(true)
    }

    // Sales cannot view all deals — pin filter to self
    if (!loading && !canViewAll && myOwnerName && ownerFilter === 'All') {
      setOwnerFilter(myOwnerName)
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
    canViewAll,
    ownerFilter,
  ])

  const dealProgress = useMemo(() => {
    if (!editing) return []
    return buildDealProgress({
      crm: { ...editing, ...form, company_name: form.company_name || editing.company_name },
      quotations: dealQuotes,
      invoices: dealInvoices,
    })
  }, [editing, form, dealQuotes, dealInvoices])

  const unlinkedCrmCount = useMemo(
    () => entries.reduce((n, e) => (e.account_id ? n : n + 1), 0),
    [entries],
  )

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
    for (const s of crmStages) counts[s] = 0
    for (const e of entries) {
      const s = e.pipeline_stage || 'Lead'
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [entries, crmStages])

  async function maybeTriggerStageWorkflows(
    entry: Pick<CrmEntry, 'id' | 'company_name' | 'pipeline_stage'>,
    nextStage: string | undefined,
  ) {
    if (!nextStage || nextStage === (entry.pipeline_stage || 'Lead')) return
    try {
      const runs = await triggerStageEnterWorkflows({
        pipelineKey: 'crm',
        stageKey: nextStage,
        objectType: 'crm',
        recordId: String(entry.id),
        recordLabel: entry.company_name,
        actorEmail: user?.email || '',
      })
      const waiting = runs.filter((r) => r.status === 'awaiting_approval')
      if (waiting.length) {
        showToast(
          `${waiting.length} workflow${waiting.length === 1 ? '' : 's'} waiting for approval (Settings → Workflow runs)`,
          'success',
        )
      } else if (runs.length) {
        showToast(`Started ${runs.length} workflow${runs.length === 1 ? '' : 's'}`, 'success')
      }
    } catch (e) {
      showToast(errorMessage(e, 'Workflow trigger failed'), 'error')
    }
  }

  async function quickPatch(
    entry: CrmEntry,
    patch: Partial<Pick<CrmEntry, 'pipeline_stage' | 'follow_up_date' | 'next_action' | 'outcome_reason'>>,
  ) {
    if (patch.pipeline_stage === 'Won' || patch.pipeline_stage === 'Lost') {
      setOutcomeTarget(entry)
      setOutcomeStage(patch.pipeline_stage)
      setOutcomeReason(entry.outcome_reason || '')
      setOutcomeNote(entry.lost_note || '')
      return
    }
    const moveProblem = crmMoveProblem(entry, {
      pipeline_stage: patch.pipeline_stage ?? entry.pipeline_stage,
      next_action: patch.next_action ?? entry.next_action,
      follow_up_date: patch.follow_up_date !== undefined ? patch.follow_up_date : entry.follow_up_date,
    })
    if (moveProblem) {
      showToast(`${entry.company_name}: ${moveProblem}. Add it here, then move the stage.`, 'error')
      openEdit(entry)
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
      if (getCalendarProvider(settings).isEnabled(settings) && patch.follow_up_date !== undefined) {
        try {
          const contacts = hydrateContacts(entry)
          const p = primaryContact(contacts)
          if (nextFollow) {
            const eventId = await getCalendarProvider(settings).syncFollowUp(settings, {
              company: entry.company_name,
              nextAction: patch.next_action ?? entry.next_action,
              owner: entry.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              teamAttendeeEmails: resolveOwnerEmails(entry.owner, teamForCalendar),
              followUpDate: String(nextFollow).slice(0, 10),
              existingEventId: entry.calendar_event_id || undefined,
            })
            if (eventId) payload.calendar_event_id = eventId
          } else if (entry.calendar_event_id) {
            await getCalendarProvider(settings).deleteEvent(settings, entry.calendar_event_id)
            payload.calendar_event_id = ''
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error ? `Updated locally; calendar: ${calErr.message}` : 'Updated; calendar sync failed',
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
      await maybeTriggerStageWorkflows(entry, patch.pipeline_stage)
      await load()
    } catch (e) {
      setError(errorMessage(e, 'Quick update failed'))
    } finally {
      setQuickBusyId(null)
    }
  }

  async function confirmOutcome() {
    if (!outcomeTarget) return
    const parsed = parseCrmOutcomeForm({
      stage: outcomeStage,
      outcome_reason: outcomeReason,
      lost_note: outcomeNote,
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    if (parsed.data.stage === 'Lost') {
      const problem = crmMoveProblem(outcomeTarget, {
        pipeline_stage: 'Lost',
        next_action: outcomeTarget.next_action,
        follow_up_date: outcomeTarget.follow_up_date,
        outcome_reason: parsed.data.outcome_reason,
        lost_note: parsed.data.lost_note,
      })
      if (problem) {
        showToast(problem, 'error')
        return
      }
    }
    const entry = outcomeTarget
    setQuickBusyId(entry.id)
    try {
      const { error: err } = await db
        .from('crm')
        .update({
          pipeline_stage: parsed.data.stage,
          outcome_reason: parsed.data.outcome_reason,
          ...(parsed.data.stage === 'Lost' ? { lost_note: parsed.data.lost_note } : {}),
          updated_by: user?.email || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)
      if (err) throw err
      await logActivity(
        'close_crm',
        'crm',
        entry.company_name,
        `${outcomeStage}: ${outcomeReason.trim()}${outcomeStage === 'Lost' && outcomeNote.trim() ? ` (${outcomeNote.trim()})` : ''}`,
        user?.email || '',
        entry.id,
      )
      showToast(`Marked ${outcomeStage}`, 'success')
      setOutcomeTarget(null)
      setOutcomeReason('')
      await maybeTriggerStageWorkflows(entry, outcomeStage)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not close deal'), 'error')
    } finally {
      setQuickBusyId(null)
    }
  }

  async function saveLogTouch(payload: LogTouchPayload) {
    if (!logTouchTarget) return
    const entry = logTouchTarget
    const moveProblem = crmMoveProblem(
      entry,
      {
        pipeline_stage: payload.pipeline_stage || entry.pipeline_stage,
        next_action: payload.next_action || entry.next_action,
        follow_up_date: payload.clearDate ? null : payload.follow_up_date || entry.follow_up_date,
      },
      { askedForReason: false },
    )
    if (moveProblem) {
      showToast(moveProblem, 'error')
      return
    }
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

      if (getCalendarProvider(settings).isEnabled(settings) && (payload.clearDate || payload.follow_up_date)) {
        try {
          const contacts = hydrateContacts(entry)
          const p = primaryContact(contacts)
          if (payload.clearDate) {
            if (entry.calendar_event_id) {
              await getCalendarProvider(settings).deleteEvent(settings, entry.calendar_event_id)
              patch.calendar_event_id = ''
            }
          } else if (payload.follow_up_date) {
            const eventId = await getCalendarProvider(settings).syncFollowUp(settings, {
              company: entry.company_name,
              nextAction: payload.next_action || entry.next_action,
              owner: entry.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              teamAttendeeEmails: resolveOwnerEmails(entry.owner, teamForCalendar),
              followUpDate: payload.follow_up_date,
              existingEventId: entry.calendar_event_id || undefined,
            })
            if (eventId) patch.calendar_event_id = eventId
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error
              ? `Saved locally; calendar: ${calErr.message}`
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
      if (payload.pipeline_stage) {
        await maybeTriggerStageWorkflows(entry, payload.pipeline_stage)
      }
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Failed to save touch'), 'error')
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
    setCompanyDetailsOpen(true)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
    setActivity([])
    setCompanyDetailsOpen(false)
    setAccountLink(null)
  }

  async function handleCreateAccountFromCrm() {
    if (!editing || accountLinkBusy) return
    setAccountLinkBusy(true)
    try {
      const ownerMatch = owners.find((o) => (o.name || o.email) === (editing.owner || '').trim())
      const account = await createAccountFromCrm(editing, {
        createdBy: user?.email || '',
        ownerUserId: ownerMatch?.id || appUserId || null,
      })
      setEditing((prev) => (prev ? { ...prev, account_id: account.id } : prev))
      setEntries((rows) =>
        rows.map((r) => (r.id === editing.id ? { ...r, account_id: account.id } : r)),
      )
      setAccountLink({ status: 'linked', account })
      showToast(`Account ${account.reference} ready`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not create account'), 'error')
    } finally {
      setAccountLinkBusy(false)
    }
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
          `WhatsApp ready · ${doc.title} ${doc.ref}`,
          'success',
        )
      } else {
        showToast('WhatsApp opened', 'success')
      }
      setSavePromptTarget({ entry: row, channel: 'whatsapp' })
    } catch (e) {
      showToast(errorMessage(e, 'Could not prepare WhatsApp message'), 'error')
    } finally {
      setQuickBusyId(null)
    }
  }

  function renderCrmRowActions(row: CrmEntry, opts?: { flush?: boolean }) {
    const phone =
      primaryContact(hydrateContacts(row))?.phone || row.mobile_number || row.office_number || ''
    return (
      <CrmRowActions
        entry={row}
        expanded={actionsOpenId === row.id}
        onToggle={() => setActionsOpenId((id) => (id === row.id ? null : row.id))}
        busy={quickBusyId === row.id}
        canDelete={canDeleteCrm}
        phone={phone}
        flush={opts?.flush}
        onLog={(r) => setLogTouchTarget(r)}
        onCall={(r) => {
          const p =
            primaryContact(hydrateContacts(r))?.phone || r.mobile_number || r.office_number || ''
          void logActivity('call_crm', 'crm', r.company_name, p, user?.email || '', r.id)
        }}
        onOpen={(r) => openEdit(r)}
        onEmail={(r) => setEmailTarget(r)}
        onWhatsApp={(r) => void openWhatsAppFollowUp(r)}
        onDelete={(r) => setDeleteTarget(r)}
      />
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
    const parsed = parseCrmForm({
      company_name: form.company_name,
      company_owner: form.company_owner,
      address: form.address,
      website: form.website,
      trn: form.trn,
      notes: form.notes,
      follow_up_date: form.follow_up_date,
      next_action: form.next_action,
      owner: form.owner,
      pipeline_stage: form.pipeline_stage || 'Lead',
      quote_ref: form.quote_ref,
      outcome_reason: form.outcome_reason,
      lost_note: form.lost_note,
      previous_stage: editing?.pipeline_stage || '',
    })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const f = parsed.data
    const stage = f.pipeline_stage || 'Lead'
    setSaving(true)
    setError('')
    const who = user?.email || ''
    const contacts = normalizeContacts(form.contacts)
    const flat = flatFieldsFromContacts(contacts)
    const followUpDate = f.follow_up_date || null
    const prevEventId = editing?.calendar_event_id || ''

    const payload: Record<string, unknown> = {
      company_name: f.company_name,
      ...flat,
      contacts,
      company_owner: f.company_owner,
      address: f.address,
      website: f.website,
      trn: f.trn,
      notes: f.notes.trim(),
      follow_up_date: followUpDate,
      next_action: f.next_action,
      owner: f.owner,
      pipeline_stage: stage,
      quote_ref: f.quote_ref,
      outcome_reason: f.outcome_reason,
      // Only sent with Lost, so saving works before the Wave 3 SQL is run.
      ...(stage === 'Lost' ? { lost_note: f.lost_note } : {}),
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

      // Keep account_contacts in sync when this CRM row is linked to an Account.
      const linkedAccountId = editing?.account_id || null
      if (linkedAccountId) {
        try {
          await syncCrmContactsToAccount(linkedAccountId, contacts)
        } catch {
          // Contact sync is best-effort; the CRM save already succeeded.
        }
      }

      await logActivity(
        editing ? 'update_crm' : 'create_crm',
        'crm',
        f.company_name,
        `${stage} · ${f.next_action || 'no action'}`,
        who,
        savedId,
      )

      await maybeTriggerStageWorkflows(
        {
          id: savedId,
          company_name: f.company_name,
          pipeline_stage: editing?.pipeline_stage || 'Lead',
        },
        stage,
      )

      // Best-effort calendar sync via mailCalendar façade
      if (getCalendarProvider(settings).isEnabled(settings)) {
        try {
          const p = primaryContact(contacts)
          if (followUpDate) {
            const eventId = await getCalendarProvider(settings).syncFollowUp(settings, {
              company: f.company_name,
              nextAction: f.next_action,
              owner: f.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              teamAttendeeEmails: resolveOwnerEmails(f.owner, teamForCalendar),
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
            await getCalendarProvider(settings).deleteEvent(settings, prevEventId)
            if (savedId) {
              await db.from('crm').update({ calendar_event_id: '' }).eq('id', savedId)
            }
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error ? `Saved, but calendar: ${calErr.message}` : 'Saved, but calendar sync failed',
            'error',
          )
        }
      }

      closeModal()
      await load()
    } catch (err) {
      setError(errorMessage(err, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    if (!can(userRole, 'crm.deleteAny')) {
      setError('Only managers and admins can delete CRM records')
      setDeleteTarget(null)
      return
    }
    setSaving(true)
    setError('')
    try {
      if (getCalendarProvider(settings).isEnabled(settings) && deleteTarget.calendar_event_id) {
        try {
          await getCalendarProvider(settings).deleteEvent(settings, deleteTarget.calendar_event_id)
        } catch {
          /* ignore calendar delete errors on CRM delete */
        }
      }
      const { error: err } = await db.from('crm').delete().eq('id', deleteTarget.id)
      if (err) throw err
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(errorMessage(err, 'Delete failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Sales · Work</p>
          <h1 className={docsStyles.title}>My Day</h1>
          <p className={docsStyles.subtitle}>
            {compact
              ? 'Overdue + today. Log the next touch, then move on.'
              : 'Start with what is due. Full funnel across CRM, AI CRM, and CTRM is on '}
            {!compact ? (
              <Link to="/deals" style={{ color: colors.accent }}>
                Pipeline
              </Link>
            ) : null}
            {!compact ? '.' : null}
          </p>
        </div>
        <button
          type="button"
          className={docsStyles.newBtn}
          style={{ minHeight: compact ? 44 : undefined }}
          onClick={openCreate}
        >
          <Plus size={16} /> Add company
        </button>
      </header>

      <WebsiteInquiriesPanel
        onConverted={(crmId) => {
          void (async () => {
            await load()
            if (crmId) setSearchParams({ edit: crmId })
          })()
        }}
      />

      {!loading && unlinkedCrmCount > 0 ? (
        <div
          role="status"
          style={{
            ...errorBanner,
            color: colors.muted,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${colors.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <span style={{ flex: '1 1 200px', fontSize: 13, lineHeight: 1.45 }}>
            {unlinkedCrmCount} CRM deal{unlinkedCrmCount === 1 ? '' : 's'} not linked to Accounts yet.
            Unique name matches can be linked from Pipeline.
          </span>
          <Link
            to="/deals?pipeline=crm"
            style={{ ...btn, fontSize: 12, padding: '6px 10px', textDecoration: 'none' }}
          >
            Open Pipeline
          </Link>
        </div>
      ) : null}

      {error && <div style={errorBanner}>{error}</div>}

      <div className={resp.stickyFilters}>
        <SavedViewsBar
          moduleId="crm"
          filters={currentCrmViewFilters}
          ownerUserId={appUserId}
          canWrite={userRole !== 'viewer'}
          applyDefaultOnLoad={false}
          onApply={applyCrmViewFilters}
          onToast={showToast}
          filtersEqual={(a, b) => crmFiltersEqual(a as CrmViewFilters, b as CrmViewFilters)}
        />
        <div className={resp.dueStripCompact}>
          <button
            type="button"
            className={`${resp.dueTile} ${ownerFilter === myOwnerName && followFilter === 'Due' ? resp.dueTileActive : ''}`}
            onClick={() => {
              if (myOwnerName) setOwnerFilter(myOwnerName)
              setFollowFilter('Due')
              setStageFilter('All')
              setSearch('')
            }}
          >
            <span className={resp.dueTileValue} style={{ color: colors.warn }}>
              {dueCounts.overdue + dueCounts.today}
            </span>
            <span className={resp.dueTileLabel}>My Day</span>
          </button>
          <button
            type="button"
            className={`${resp.dueTile} ${
              followFilter === 'All' &&
              stageFilter === 'All' &&
              (canViewAll ? ownerFilter === 'All' : Boolean(myOwnerName) && ownerFilter === myOwnerName)
                ? resp.dueTileActive
                : ''
            }`}
            onClick={() => {
              if (!canViewAll) {
                if (myOwnerName) setOwnerFilter(myOwnerName)
                setFollowFilter('All')
                setStageFilter('All')
                return
              }
              setOwnerFilter('All')
              setFollowFilter('All')
              setStageFilter('All')
            }}
          >
            <span className={resp.dueTileValue}>{entries.length}</span>
            <span className={resp.dueTileLabel}>{canViewAll ? 'All deals' : 'My deals'}</span>
          </button>
        </div>

        {followFilter === 'Due' ? <QuoteNudgesCard /> : null}
        {followFilter === 'Due' ? <SessionFollowUpsCard /> : null}

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
            style={{ ...input, flex: '0 1 160px', maxWidth: compact ? '100%' : 160 }}
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            title="Sales owner"
          >
            {canViewAll ? <option value="All">All owners</option> : null}
            {myOwnerName ? <option value={myOwnerName}>Me ({myOwnerName})</option> : null}
            {canViewAll ? <option value="Unassigned">Unassigned</option> : null}
            {canViewAll
              ? ownerOptions
                  .filter((o) => o !== myOwnerName)
                  .map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))
              : null}
          </select>
          <select
            style={{ ...input, flex: '0 1 150px', maxWidth: compact ? '100%' : 150 }}
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            title="Pipeline stage"
          >
            <option value="All">All stages</option>
            {crmStages.map((s) => (
              <option key={s} value={s}>
                {s}
                {stageCounts[s] ? ` (${stageCounts[s]})` : ''}
              </option>
            ))}
          </select>
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
          <button
            type="button"
            style={btn}
            onClick={() => setCalendarSettingsOpen(true)}
            title="Calendar settings"
          >
            <Settings size={16} />
            {compact ? null : ' Calendar'}
          </button>
        </div>
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
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {entries.length === 0 ? (
            <>
              <div>No CRM entries yet.</div>
              <button type="button" style={btnPrimary} onClick={openCreate}>
                <Plus size={16} /> Add your first company
              </button>
            </>
          ) : followFilter === 'Due' && !search && stageFilter === 'All' ? (
            <>
              <div>Nothing due right now. Nice work.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <button
                  type="button"
                  style={btnPrimary}
                  onClick={() => {
                    if (!canViewAll && myOwnerName) setOwnerFilter(myOwnerName)
                    else setOwnerFilter('All')
                    setFollowFilter('All')
                    setStageFilter('All')
                  }}
                >
                  Show all deals
                </button>
                <button type="button" style={btn} onClick={openCreate}>
                  <Plus size={16} /> Add company
                </button>
              </div>
            </>
          ) : (
            <>
              <div>No companies match your filters.</div>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  if (myOwnerName) setOwnerFilter(canViewAll ? 'All' : myOwnerName)
                  else setOwnerFilter('All')
                  setFollowFilter('All')
                  setStageFilter('All')
                  setSearch('')
                }}
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : viewMode === 'board' ? (
        <CrmPipelineBoard
          entries={filtered}
          busyId={quickBusyId}
          compact={compact}
          stages={crmStages}
          onOpen={openEdit}
          onMoveStage={(row, stage) => void quickPatch(row, { pipeline_stage: stage })}
          renderActions={(row) => renderCrmRowActions(row, { flush: true })}
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
                      {crmStages.map((s) => (
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
                <div className={resp.cardActions}>{renderCrmRowActions(row, { flush: true })}</div>
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
                        {crmStages.map((s) => (
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
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 16, wordBreak: 'break-word' }}>
                  {editing ? form.company_name || editing.company_name : 'Add company'}
                </h3>
                {editing ? (
                  <p className={resp.sheetMeta} style={{ marginTop: 4, marginBottom: 0 }}>
                    {[
                      form.pipeline_stage || 'Lead',
                      form.owner?.trim() || 'Unassigned',
                      form.follow_up_date
                        ? `Follow-up ${format(parseISO(form.follow_up_date), 'dd MMM yyyy')}`
                        : 'No follow-up',
                      form.next_action?.trim() || null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              {editing ? (
                <button
                  type="button"
                  style={btnPrimary}
                  onClick={() => setLogTouchTarget(editing)}
                >
                  <MessageSquarePlus size={14} /> Log touch
                </button>
              ) : null}
              <button type="button" style={btnGhost} onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)}>
              <div style={modalBody}>
                {editing ? <DealProgressStrip steps={dealProgress} /> : null}
                {editing && canLinkAccounts ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 12,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: `1px solid ${colors.border}`,
                      background: 'rgba(255,255,255,0.03)',
                      fontSize: 12,
                      color: colors.muted,
                    }}
                  >
                    {!accountLink || accountLink.status === 'none' ? (
                      <>
                        <span style={{ flex: '1 1 160px' }}>No Accounts record yet for this company.</span>
                        {can(userRole, 'accounts.write') ? (
                          <button
                            type="button"
                            style={{ ...btn, fontSize: 12, padding: '6px 10px' }}
                            disabled={accountLinkBusy}
                            onClick={() => void handleCreateAccountFromCrm()}
                          >
                            {accountLinkBusy ? 'Creating…' : 'Create account'}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {accountLink?.status === 'linked' ? (
                      <>
                        <span style={{ flex: '1 1 160px' }}>
                          Account{' '}
                          <strong style={{ color: colors.text }}>{accountLink.account.reference}</strong>
                        </span>
                        <Link
                          to={`/accounts/${accountLink.account.id}`}
                          style={{ ...btn, fontSize: 12, padding: '6px 10px', textDecoration: 'none' }}
                        >
                          <ExternalLink size={14} /> Open account
                        </Link>
                      </>
                    ) : null}
                    {accountLink?.status === 'ambiguous' ? (
                      <>
                        <span style={{ flex: '1 1 160px' }}>
                          Several accounts match this name — pick one in Clients → Accounts.
                        </span>
                        <Link
                          to={`/accounts?q=${encodeURIComponent(editing.company_name)}`}
                          style={{ ...btn, fontSize: 12, padding: '6px 10px', textDecoration: 'none' }}
                        >
                          View matches
                        </Link>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {editing ? (
                  <div className={resp.sheetTabs} role="tablist">
                    {(
                      [
                        ['overview', 'Deal'],
                        ['contacts', 'People'],
                        ['money', 'Money'],
                        ['files', 'Files'],
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

                <div style={{ display: sheetTab === 'overview' || !editing ? 'block' : 'none' }}>
                  <div className={resp.sheetSection}>
                    <h4 className={resp.sheetSectionTitle}>This deal</h4>
                    <div style={formGrid}>
                      {!editing ? (
                        <Field label="Company *">
                          <input
                            style={input}
                            required
                            value={form.company_name}
                            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                          />
                        </Field>
                      ) : null}
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
                      <Field label="Sales owner">
                        <select
                          style={input}
                          value={form.owner}
                          disabled={!canReassign && Boolean(editing)}
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
                      <Field label="Stage">
                        <select
                          style={input}
                          value={form.pipeline_stage}
                          onChange={(e) => setForm((f) => ({ ...f, pipeline_stage: e.target.value }))}
                        >
                          {crmStages.map((s) => (
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
                      {form.pipeline_stage === 'Lost' ? (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <LostReasonFields
                            idPrefix="crm-form-lost"
                            code={form.outcome_reason}
                            note={form.lost_note}
                            onChange={({ code, note }) =>
                              setForm((f) => ({ ...f, outcome_reason: code, lost_note: note }))
                            }
                          />
                        </div>
                      ) : null}
                      {form.pipeline_stage === 'Won' && (
                        <Field label="Won reason">
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
                    <p style={{ margin: '10px 0 0', fontSize: 12, color: colors.muted2 }}>
                      {getCalendarProvider(settings).isEnabled(settings)
                        ? `Follow-up date syncs to ${getCalendarProvider(settings).label} Calendar.`
                        : 'Calendar sync is off.'}{' '}
                      <button
                        type="button"
                        onClick={() => setCalendarSettingsOpen(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: colors.accent,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Calendar settings
                      </button>
                    </p>
                  </div>

                  <div className={resp.sheetSection}>
                    <h4 className={resp.sheetSectionTitle}>Notes</h4>
                    <textarea
                      style={{ ...input, minHeight: 72, resize: 'vertical' }}
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      aria-label="Notes"
                    />
                  </div>

                  {editing ? (
                    <div className={resp.sheetSection}>
                      <CustomFieldsCard
                        objectType="crm"
                        recordId={String(editing.id)}
                        editable={userRole !== 'viewer'}
                        onToast={showToast}
                        framed={false}
                        style={{ marginTop: 0 }}
                      />
                    </div>
                  ) : null}

                  <div className={resp.sheetSection}>
                    <button
                      type="button"
                      className={resp.sheetDetailsToggle}
                      aria-expanded={companyDetailsOpen}
                      onClick={() => setCompanyDetailsOpen((o) => !o)}
                    >
                      <span>Company details</span>
                      <ChevronDown
                        size={14}
                        style={{
                          transform: companyDetailsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                          transition: 'transform 0.15s ease',
                        }}
                      />
                    </button>
                    {companyDetailsOpen ? (
                      <div style={formGrid}>
                        {editing ? (
                          <Field label="Company *">
                            <input
                              style={input}
                              required={sheetTab === 'overview'}
                              value={form.company_name}
                              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                            />
                          </Field>
                        ) : null}
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
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  style={{
                    display: sheetTab === 'contacts' || !editing ? 'block' : 'none',
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
                    <h4 className={resp.sheetSectionTitle} style={{ margin: 0 }}>
                      People
                    </h4>
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
                </div>

                {editing && sheetTab === 'money' ? (
                  <div>
                    <div className={resp.sheetActions}>
                      <Link
                        to={`/quotations?client=${encodeURIComponent(editing.company_name)}&new=1`}
                        style={{ ...btnPrimary, textDecoration: 'none' }}
                      >
                        <FileText size={14} /> New quote
                      </Link>
                      <Link
                        to={`/invoices?client=${encodeURIComponent(editing.company_name)}`}
                        style={{ ...btn, textDecoration: 'none' }}
                      >
                        <Receipt size={14} /> Invoices
                      </Link>
                    </div>
                    <h4 className={resp.sheetSectionTitle}>Quotations</h4>
                    {!dealQuotes.length ? (
                      <p style={{ color: colors.muted2, fontSize: 13, marginTop: 0 }}>No quotations yet.</p>
                    ) : (
                      <div className={resp.sheetMoneyList}>
                        {dealQuotes.slice(0, 12).map((q) => (
                          <Link
                            key={q.id}
                            to={`/quotations?ref=${encodeURIComponent(q.reference_number || q.quote_id || q.id)}`}
                            className={resp.sheetMoneyRow}
                          >
                            <div>
                              <strong>
                                {displayDocumentReference({
                                  referenceNumber: q.reference_number,
                                  fallbackId: q.quote_id || q.id,
                                  status: q.status,
                                })}
                              </strong>
                              <div className={resp.sheetMoneyMeta}>
                                {(q.status || 'draft') +
                                  ` · ${q.currency || 'AED'} ${Number(q.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                              </div>
                            </div>
                            <ExternalLink size={14} style={{ opacity: 0.55 }} />
                          </Link>
                        ))}
                      </div>
                    )}
                    <h4 className={resp.sheetSectionTitle} style={{ marginTop: 18 }}>
                      Invoices
                    </h4>
                    {!dealInvoices.length ? (
                      <p style={{ color: colors.muted2, fontSize: 13, marginTop: 0 }}>No invoices yet.</p>
                    ) : (
                      <div className={resp.sheetMoneyList}>
                        {dealInvoices.slice(0, 12).map((inv) => (
                          <Link
                            key={inv.id}
                            to={`/invoices`}
                            className={resp.sheetMoneyRow}
                            title={inv.reference_number || inv.id}
                          >
                            <div>
                              <strong>
                                {displayDocumentReference({
                                  referenceNumber: inv.reference_number,
                                  fallbackId: inv.id,
                                  status: inv.status,
                                })}
                              </strong>
                              <div className={resp.sheetMoneyMeta}>
                                {(inv.status || 'draft') +
                                  ` · ${inv.currency || 'AED'} ${Number(inv.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                              </div>
                            </div>
                            <ExternalLink size={14} style={{ opacity: 0.55 }} />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {editing && sheetTab === 'files' ? (
                  <div>
                    <div className={resp.sheetActions}>
                      <Link
                        to={`/customer-files?company=${encodeURIComponent(editing.company_name)}`}
                        style={{ ...btn, textDecoration: 'none' }}
                      >
                        <FolderOpen size={14} /> Customer files
                        {folderDocs.length ? ` (${folderDocs.length})` : ''}
                      </Link>
                      {editing.drive_folder_url ? (
                        <a
                          href={editing.drive_folder_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ ...btn, textDecoration: 'none' }}
                        >
                          <ExternalLink size={14} /> Drive
                        </a>
                      ) : (
                        <Link
                          to={`/customer-files?company=${encodeURIComponent(editing.company_name)}`}
                          style={{ ...btn, textDecoration: 'none' }}
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
                    <h4 className={resp.sheetSectionTitle}>Contracts & NDAs</h4>
                    <ContractsVaultPanel entry={editing} contacts={form.contacts || []} />
                  </div>
                ) : null}

                {editing && sheetTab === 'activity' ? (
                  <div>
                    <div className={resp.sheetActions}>
                      <button
                        type="button"
                        style={btnPrimary}
                        onClick={() => setLogTouchTarget(editing)}
                      >
                        <MessageSquarePlus size={14} /> Log touch
                      </button>
                    </div>
                    <h4 className={resp.sheetSectionTitle}>Timeline</h4>
                    {activityLoading ? (
                      <p style={{ color: colors.muted, fontSize: 13 }}>Loading activity…</p>
                    ) : activity.length === 0 ? (
                      <p style={{ color: colors.muted2, fontSize: 13 }}>
                        No activity yet. Log a touch, send WhatsApp/email, or save changes to build the timeline.
                      </p>
                    ) : (
                      <div
                        style={{
                          maxHeight: 360,
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
        stages={crmStages}
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
              {outcomeStage === 'Lost' ? (
                <LostReasonFields
                  idPrefix="crm-lost"
                  code={outcomeReason}
                  note={outcomeNote}
                  onChange={({ code, note }) => {
                    setOutcomeReason(code)
                    setOutcomeNote(note)
                  }}
                />
              ) : (
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
              )}
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
        zohoEnabled={getMailProvider(settings).isEnabled(settings)}
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

      <LinkDriveFileModal
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

      <CalendarSettingsModal
        open={calendarSettingsOpen}
        onClose={() => setCalendarSettingsOpen(false)}
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
