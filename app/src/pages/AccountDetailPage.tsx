import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import FirefliesCallModal from '../components/accounts/FirefliesCallModal'
import { canAttachCalls, meetingNotesForAi } from '../lib/fireflies'
import { ArrowLeft, ExternalLink, Link2, Pencil, Plus, Star, Trash2, Unlink } from 'lucide-react'
import SimpleRowActions from '../components/SimpleRowActions'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import StatusPill from '../components/StatusPill'
import AccountFormModal from '../components/accounts/AccountFormModal'
import DeliveryPanel from '../components/accounts/DeliveryPanel'
import AccountCustomFieldsCard from '../components/accounts/AccountCustomFieldsCard'
import CallBriefButton from '../components/accounts/CallBriefButton'
import ClientExportButton from '../components/accounts/ClientExportButton'
import PortalLinksCard from '../components/accounts/PortalLinksCard'
import PortalUploadsCard from '../components/accounts/PortalUploadsCard'
import AccountTicketsCard from '../components/support/AccountTicketsCard'
import AccountDealsCard from '../components/ctrm/AccountDealsCard'
import FitSheetCard from '../components/ctrm/FitSheetCard'
import SessionsCard from '../components/ctrm/SessionsCard'
import CtrmTermsCard from '../components/ctrm/CtrmTermsCard'
import AccountSalesDealCard from '../components/sales/AccountSalesDealCard'
import AccountCrmCard from '../components/crm/AccountCrmCard'
import { syncAccountContactsToCrm } from '../lib/crmAccountLink'
import ChurchProductCard from '../components/worshiphub/ChurchProductCard'
import { db } from '../lib/db'
import {
  ACTIVITY_KINDS,
  accountStatusLabel,
  accountTypeLabel,
  activityKindLabel,
  canEditAccount,
  documentsForAccount,
  sortContacts,
  sortTimeline,
} from '../lib/accounts'
import {
  type AccountInput,
  type ContactInput,
  addActivity,
  deleteAccount,
  deleteContact,
  getAccount,
  listActivities,
  listContacts,
  listTeam,
  logAccountEvent,
  saveContact,
  setDocumentAccount,
  updateAccount,
} from '../lib/accountsStore'
import { canViewField } from '../lib/fieldPermissions'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import { parseAccountContactForm, parseAccountNoteForm } from '../lib/schemas/accountContact'
import { formatAED } from '../lib/money'
import type {
  Account,
  AccountActivity,
  AccountActivityKind,
  AccountContact,
  AppUser,
} from '../lib/types'
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  dualPanelGridStyle,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  sectionTitleStyle,
  selectStyle,
} from '../lib/uiStyles'

type MoneyDoc = {
  id: string
  client: string
  reference_number: string
  date: string | null
  amount: number
  status: string
  payment_status?: string
  account_id?: string | null
}

const emptyContact = (): ContactInput => ({
  name: '',
  role: '',
  email: '',
  phone: '',
  whatsapp: '',
  is_primary: false,
})

function when(value: string): string {
  try {
    return format(parseISO(value), 'd MMM yyyy, HH:mm')
  } catch {
    return value
  }
}

function day(value: string | null): string {
  if (!value) return ''
  try {
    return format(parseISO(String(value).slice(0, 10)), 'd MMM yyyy')
  } catch {
    return String(value)
  }
}

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }

type AccountTab = 'overview' | 'sales' | 'delivery' | 'modules' | 'files' | 'money'

const ACCOUNT_TABS: { id: AccountTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'modules', label: 'Modules' },
  { id: 'files', label: 'Files' },
  { id: 'money', label: 'Money' },
]

const tabBarStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: 4,
  marginBottom: 16,
  borderRadius: 14,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  overflowX: 'auto',
  maxWidth: '100%',
}

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    appearance: 'none',
    border: 'none',
    background: active ? 'rgba(232,93,4,0.2)' : 'transparent',
    color: active ? '#ffb56a' : 'rgba(242,244,247,0.62)',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 10,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
  }
}

export default function AccountDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const [account, setAccount] = useState<Account | null>(null)
  // Bumped when Make contract adds a contract, so the delivery panel reloads.
  const [deliveryKey, setDeliveryKey] = useState(0)
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [timeline, setTimeline] = useState<AccountActivity[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [invoices, setInvoices] = useState<MoneyDoc[]>([])
  const [quotations, setQuotations] = useState<MoneyDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [contactModal, setContactModal] = useState<{ id?: string; form: ContactInput } | null>(null)
  const [noteKind, setNoteKind] = useState<AccountActivityKind>('note')
  const [noteBody, setNoteBody] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [contactActionsId, setContactActionsId] = useState<string | null>(null)
  const [firefliesOpen, setFirefliesOpen] = useState(false)
  const [callNotesSeed, setCallNotesSeed] = useState<{ notes: string } | null>(null)

  const seesMoney = can(userRole, 'legacy.access')
  const author = useMemo(() => ({ appUserId, email: user?.email || '' }), [appUserId, user?.email])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const acc = await getAccount(id)
      setAccount(acc)
      if (!acc) return
      const [c, t, people] = await Promise.all([listContacts(id), listActivities(id), listTeam()])
      setContacts(c)
      setTimeline(t)
      setTeam(people)
      if (seesMoney) {
        const [inv, quo] = await Promise.all([
          db.from('invoices').select('*').order('date', { ascending: false }),
          db.from('quotations').select('*').order('date', { ascending: false }),
        ])
        setInvoices(((inv.data || []) as MoneyDoc[]).filter(Boolean))
        setQuotations(((quo.data || []) as MoneyDoc[]).filter(Boolean))
      }
    } catch (e) {
      showToast(errorMessage(e, 'Could not load this account'), 'error')
    } finally {
      setLoading(false)
    }
  }, [id, seesMoney, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const editable = account ? canEditAccount(account, userRole, appUserId) : false
  const teamName = (uid: string | null, email?: string) => {
    const u = uid ? team.find((p) => p.id === uid) : team.find((p) => p.email === email)
    return u ? u.name || u.email : email || 'Someone'
  }

  const invoiceDocs = useMemo(
    () => (account ? documentsForAccount(account, invoices) : { linked: [], suggested: [] }),
    [account, invoices],
  )
  const quoteDocs = useMemo(
    () => (account ? documentsForAccount(account, quotations) : { linked: [], suggested: [] }),
    [account, quotations],
  )

  async function handleEdit(input: AccountInput) {
    if (!account) return
    setSaving(true)
    try {
      const changes: string[] = []
      if (input.status !== account.status) {
        changes.push(`Status changed to ${accountStatusLabel(input.status)}`)
      }
      if (input.owner_user_id !== account.owner_user_id) {
        changes.push(`Owner changed to ${teamName(input.owner_user_id)}`)
      }
      if (input.name !== account.name) changes.push(`Renamed to ${input.name}`)
      const patch: Partial<AccountInput> = { ...input }
      if (!can(userRole, 'accounts.reassign')) delete patch.owner_user_id
      await updateAccount(account.id, patch)
      for (const line of changes) await logAccountEvent(account.id, line, author)
      showToast('Account saved', 'success')
      setEditOpen(false)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the account'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote() {
    if (!account) return
    const parsed = parseAccountNoteForm({ kind: noteKind, body: noteBody })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      await addActivity(account.id, parsed.data.kind, parsed.data.body, author)
      setNoteBody('')
      setTimeline(await listActivities(account.id))
    } catch (e) {
      showToast(errorMessage(e, 'Could not add to the timeline'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveContact() {
    if (!account || !contactModal) return
    const parsed = parseAccountContactForm(contactModal.form)
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      await saveContact(
        account.id,
        parsed.data,
        contactModal.id,
      )
      if (!contactModal.id) await logAccountEvent(account.id, `Contact added: ${parsed.data.name}`, author)
      const [c, t] = await Promise.all([listContacts(account.id), listActivities(account.id)])
      try {
        await syncAccountContactsToCrm(account, c)
      } catch {
        // CRM sync is best-effort after the account contact save.
      }
      setContactModal(null)
      setContacts(c)
      setTimeline(t)
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the contact'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteContact(c: AccountContact) {
    if (!account || !window.confirm(`Remove ${c.name} from this account?`)) return
    try {
      await deleteContact(c.id)
      await logAccountEvent(account.id, `Contact removed: ${c.name}`, author)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not remove the contact'), 'error')
    }
  }

  async function handleLink(table: 'invoices' | 'quotations', doc: MoneyDoc, link: boolean) {
    if (!account) return
    try {
      await setDocumentAccount(table, doc.id, link ? account.id : null)
      const what = table === 'invoices' ? 'Invoice' : 'Quotation'
      await logAccountEvent(
        account.id,
        `${what} ${doc.reference_number} ${link ? 'linked to' : 'unlinked from'} this account`,
        author,
      )
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not update the link'), 'error')
    }
  }

  async function handleDelete() {
    if (!account) return
    setSaving(true)
    try {
      await deleteAccount(account.id)
      showToast(`${account.name} deleted`, 'success')
      navigate('/accounts')
    } catch (e) {
      showToast(errorMessage(e, 'Could not delete the account'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !account) {
    return <div style={{ ...cardStyle, color: colors.muted }}>Loading account…</div>
  }

  if (!account) {
    return (
      <div style={{ ...cardStyle, color: colors.muted, lineHeight: 1.6 }}>
        This account does not exist, or it is not assigned to you.{' '}
        <Link to="/accounts" style={{ color: colors.accent }}>
          Back to accounts
        </Link>
      </div>
    )
  }

  const sortedContacts = sortContacts(contacts)
  const items = sortTimeline(timeline)

  const isAi = account.type === 'ai_crm_client'
  const isCtrm = account.type === 'ctrm_prospect'
  const isWorship = account.type === 'worship_church'

  const visibleTabs = ACCOUNT_TABS.filter((t) => {
    if (t.id === 'overview' || t.id === 'modules') return true
    if (t.id === 'sales') return isAi || isCtrm
    if (t.id === 'delivery') return isAi
    if (t.id === 'files') return isAi
    if (t.id === 'money') return seesMoney
    return false
  })

  const tabParam = searchParams.get('tab') as AccountTab | null
  const tab: AccountTab = visibleTabs.some((t) => t.id === tabParam)
    ? (tabParam as AccountTab)
    : 'overview'

  function setTab(next: AccountTab) {
    const params = new URLSearchParams(searchParams)
    if (next === 'overview') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div style={pageStyle}>
      <Link
        to="/accounts"
        style={{ color: colors.muted, fontSize: 13, display: 'inline-flex', gap: 6, marginBottom: 12 }}
      >
        <ArrowLeft size={14} /> Accounts
      </Link>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: colors.muted2, marginBottom: 4 }}>
              {accountTypeLabel(account.type)}
              {account.reference ? `, ${account.reference}` : ''}
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', overflowWrap: 'anywhere' }}>
              {account.name}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 13 }}>
              <StatusPill status={accountStatusLabel(account.status)} />
              <span style={{ color: colors.muted }}>Owner: {teamName(account.owner_user_id)}</span>
              {[account.city, account.country].filter(Boolean).length ? (
                <span style={{ color: colors.muted }}>
                  {[account.city, account.country].filter(Boolean).join(', ')}
                </span>
              ) : null}
              {account.website ? (
                <a
                  href={/^https?:\/\//i.test(account.website) ? account.website : `https://${account.website}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: colors.accent }}
                >
                  Website <ExternalLink size={11} style={{ verticalAlign: -1 }} />
                </a>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CallBriefButton
              account={account}
              accountKind={accountTypeLabel(account.type)}
              editable={editable}
              author={author}
              onSaved={() => void load()}
            />
            {editable ? (
              <ClientExportButton account={account} canFull={can(userRole, 'delivery.packages')} author={author} />
            ) : null}
            {editable ? (
              <button type="button" style={buttonSecondaryStyle} onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> Edit
              </button>
            ) : null}
            {can(userRole, 'accounts.delete') ? (
              <button type="button" style={buttonDangerStyle} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete
              </button>
            ) : null}
          </div>
        </div>
        {account.industry || account.source || account.notes ? (
          <div style={{ marginTop: 14, fontSize: 13, color: colors.muted, lineHeight: 1.6 }}>
            {account.industry ? <div>Industry: {account.industry}</div> : null}
            {account.source ? <div>Source: {account.source}</div> : null}
            {account.notes ? <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{account.notes}</div> : null}
          </div>
        ) : null}
      </div>

      <AccountCustomFieldsCard
        accountId={account.id}
        editable={editable && userRole !== 'viewer'}
        onToast={showToast}
      />

      <div style={tabBarStyle} role="tablist" aria-label="Account sections">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            style={tabBtnStyle(tab === t.id)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
      <>
      <div style={dualPanelGridStyle}>
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Contacts</h2>
            {editable ? (
              <button
                type="button"
                style={smallBtn}
                onClick={() =>
                  setContactModal({ form: { ...emptyContact(), is_primary: contacts.length === 0 } })
                }
              >
                <Plus size={13} /> Add
              </button>
            ) : null}
          </div>
          {sortedContacts.length === 0 ? (
            <p style={{ color: colors.muted, fontSize: 13, marginBottom: 0 }}>
              No contacts yet. Add the person you speak to most so the team knows who to call.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
              {sortedContacts.map((c) => (
                <li
                  key={c.id}
                  style={{
                    padding: '10px 0',
                    borderTop: `1px solid rgba(255,255,255,0.06)`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 600 }}>
                      {c.name}
                      {c.is_primary ? (
                        <Star size={12} style={{ marginLeft: 6, color: colors.warn, verticalAlign: -1 }} />
                      ) : null}
                      {c.role ? <span style={{ color: colors.muted2, fontWeight: 400 }}>, {c.role}</span> : null}
                    </div>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} style={{ color: colors.muted, overflowWrap: 'anywhere' }}>
                        {c.email}
                      </a>
                    ) : null}
                    {c.phone ? <div style={{ color: colors.muted }}>{c.phone}</div> : null}
                    {c.whatsapp ? (
                      <a
                        href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: colors.success }}
                      >
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                  {editable ? (
                    <SimpleRowActions
                      expanded={contactActionsId === c.id}
                      onToggle={() => setContactActionsId((id) => (id === c.id ? null : c.id))}
                      onEdit={() =>
                        setContactModal({
                          id: c.id,
                          form: {
                            name: c.name,
                            role: c.role,
                            email: c.email,
                            phone: c.phone,
                            whatsapp: c.whatsapp,
                            is_primary: c.is_primary,
                          },
                        })
                      }
                      onDelete={() => void handleDeleteContact(c)}
                      deleteLabel="Remove"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Timeline</h2>
          {editable ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select
                  style={{ ...selectStyle, maxWidth: 130 }}
                  value={noteKind}
                  aria-label="Kind"
                  onChange={(e) => setNoteKind(e.target.value as AccountActivityKind)}
                >
                  {ACTIVITY_KINDS.filter((k) => k.value !== 'system').map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  style={buttonPrimaryStyle}
                  disabled={saving || !noteBody.trim()}
                  onClick={() => void handleAddNote()}
                >
                  Add
                </button>
                {canAttachCalls(userRole) ? (
                  <button type="button" style={buttonSecondaryStyle} onClick={() => setFirefliesOpen(true)}>
                    Fireflies call
                  </button>
                ) : null}
              </div>
              <FirefliesCallModal
                open={firefliesOpen}
                accountId={account.id}
                isBuildClient={account.type === 'ai_crm_client'}
                author={author}
                onClose={() => setFirefliesOpen(false)}
                onSaved={(m) => {
                  void listActivities(account.id).then(setTimeline)
                  showToast('Meeting added to the timeline', 'success')
                  if (account.type === 'ai_crm_client') setCallNotesSeed({ notes: meetingNotesForAi(m) })
                }}
              />
              <textarea
                style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
                placeholder="What happened? Who said what, and what is next?"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
            </div>
          ) : null}
          {items.length === 0 ? (
            <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
              Nothing logged yet. Add a note after your next call or meeting.
            </p>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {items.map((a) => (
                <li
                  key={a.id}
                  style={{ padding: '10px 0', borderTop: `1px solid rgba(255,255,255,0.06)`, fontSize: 13 }}
                >
                  <div style={{ color: colors.muted2, fontSize: 11, marginBottom: 3 }}>
                    {activityKindLabel(a.kind)} by {teamName(a.user_id, a.user_email)}, {when(a.created_at)}
                  </div>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      color: a.kind === 'system' ? colors.muted : colors.text,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {a.body}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <AccountCrmCard account={account} />
      </>
      ) : null}

      {tab === 'sales' ? (
        <>
          {isAi ? (
            <AccountSalesDealCard
              account={account}
              team={team}
              editable={editable}
              canContract={can(userRole, 'delivery.contracts')}
              author={author}
              onChanged={() => {
                void load()
                setDeliveryKey((k) => k + 1)
              }}
            />
          ) : null}
          {isCtrm ? (
            <>
              <FitSheetCard account={account} contacts={sortedContacts} editable={editable} author={author} />
              <AccountDealsCard
                account={account}
                contacts={contacts}
                team={team}
                editable={editable}
                showCommission={canViewField(userRole, 'ctrm.commission')}
                author={author}
                onChanged={() => void load()}
              />
            </>
          ) : null}
        </>
      ) : null}

      {tab === 'delivery' && isAi ? (
        <DeliveryPanel
          key={deliveryKey}
          account={account}
          editable={editable}
          userRole={userRole}
          team={team}
          author={author}
          callNotesSeed={callNotesSeed}
        />
      ) : null}

      {tab === 'files' && isAi ? (
        <>
          <PortalLinksCard account={account} contacts={sortedContacts} editable={editable} author={author} />
          <PortalUploadsCard account={account} editable={editable} />
        </>
      ) : null}

      {tab === 'modules' ? (
        <>
          {isWorship ? (
            <ChurchProductCard account={account} editable={editable} author={author} onChanged={() => void load()} />
          ) : null}
          {isCtrm ? (
            <>
              <CtrmTermsCard account={account} editable={editable} author={author} />
              <SessionsCard account={account} editable={editable} author={author} />
            </>
          ) : null}
          <AccountTicketsCard account={account} contacts={contacts} team={team} editable={editable} author={author} />
        </>
      ) : null}

      {tab === 'money' && seesMoney ? (
        <section style={{ ...cardStyle, marginTop: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={sectionTitleStyle}>Quotations and invoices</h2>
            <Link to={`/invoices?account=${account.id}`} style={{ color: colors.muted, fontSize: 12 }}>
              See them in Invoices
            </Link>
          </div>
          <MoneyList
            title="Invoices"
            kind="invoice"
            docs={invoiceDocs}
            canLink={editable && userRole !== 'viewer'}
            onLink={(d, link) => void handleLink('invoices', d, link)}
          />
          <MoneyList
            title="Quotations"
            kind="quote"
            docs={quoteDocs}
            canLink={editable && userRole !== 'viewer'}
            onLink={(d, link) => void handleLink('quotations', d, link)}
          />
        </section>
      ) : null}

      <AccountFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        account={account}
        team={team}
        canReassign={can(userRole, 'accounts.reassign')}
        defaultOwnerId={appUserId}
        saving={saving}
        onSave={(input) => void handleEdit(input)}
      />

      <Modal
        open={Boolean(contactModal)}
        onClose={() => setContactModal(null)}
        title={contactModal?.id ? 'Edit contact' : 'Add contact'}
        width={520}
      >
        {contactModal ? (
          <>
            <div style={formGridStyle}>
              {(
                [
                  ['name', 'Name'],
                  ['role', 'Role'],
                  ['email', 'Email'],
                  ['phone', 'Phone'],
                  ['whatsapp', 'WhatsApp'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} style={fieldStyle}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    style={inputStyle}
                    value={contactModal.form[key]}
                    onChange={(e) =>
                      setContactModal((m) => (m ? { ...m, form: { ...m.form, [key]: e.target.value } } : m))
                    }
                  />
                </div>
              ))}
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={contactModal.form.is_primary}
                onChange={(e) =>
                  setContactModal((m) => (m ? { ...m, form: { ...m.form, is_primary: e.target.checked } } : m))
                }
              />
              Main contact for this account
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" style={buttonSecondaryStyle} onClick={() => setContactModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                style={buttonPrimaryStyle}
                disabled={saving}
                onClick={() => void handleSaveContact()}
              >
                {saving ? 'Saving…' : 'Save contact'}
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete account" width={440}>
        <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.55, marginTop: 0 }}>
          This removes {account.name}, its contacts and its timeline. Linked invoices and quotations stay
          as they are and simply lose the link.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
          <button type="button" style={buttonDangerStyle} disabled={saving} onClick={() => void handleDelete()}>
            Delete account
          </button>
        </div>
      </Modal>
    </div>
  )
}

function MoneyList({
  title,
  kind,
  docs,
  canLink,
  onLink,
}: {
  title: string
  kind: 'invoice' | 'quote'
  docs: { linked: MoneyDoc[]; suggested: MoneyDoc[] }
  canLink: boolean
  onLink: (doc: MoneyDoc, link: boolean) => void
}) {
  const rows = [
    ...docs.linked.map((d) => ({ d, linked: true })),
    ...docs.suggested.map((d) => ({ d, linked: false })),
  ]
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {rows.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
          None linked yet. New {title.toLowerCase()} with this exact client name will show up here to link.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map(({ d, linked }) => (
            <li
              key={d.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 0',
                borderTop: `1px solid rgba(255,255,255,0.06)`,
                fontSize: 13,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Link to={`/document/${kind}/${d.id}`} style={{ color: colors.text, fontWeight: 600 }}>
                  {d.reference_number || 'No reference'}
                </Link>{' '}
                <span style={{ color: colors.muted }}>
                  {[day(d.date), formatAED(Number(d.amount) || 0), d.payment_status || d.status]
                    .filter(Boolean)
                    .join(', ')}
                </span>
                {!linked ? (
                  <div style={{ fontSize: 11, color: colors.warn }}>
                    Not linked yet. Client name on file: {d.client}
                  </div>
                ) : null}
              </div>
              {canLink ? (
                <button type="button" style={smallBtn} onClick={() => onLink(d, !linked)}>
                  {linked ? <Unlink size={12} /> : <Link2 size={12} />} {linked ? 'Unlink' : 'Link'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
