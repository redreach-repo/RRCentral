import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Contact, Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import StatusPill from '../components/StatusPill'
import AccountFormModal from '../components/accounts/AccountFormModal'
import {
  ACCOUNT_TYPES,
  accountStatusLabel,
  accountTypeInfo,
  accountTypeLabel,
  visibleAccounts,
} from '../lib/accounts'
import {
  type AccountInput,
  type ContactInput,
  createAccount,
  listAccounts,
  listContacts,
  listTeam,
  logAccountEvent,
  saveContact,
} from '../lib/accountsStore'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import type { Account, AccountContact, AccountType, AppUser } from '../lib/types'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  inputStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
} from '../lib/uiStyles'

type TypeFilter = 'all' | AccountType

export default function AccountsPage() {
  const { user, userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const typeParam = searchParams.get('type')
  const typeFilter: TypeFilter = ACCOUNT_TYPES.some((t) => t.value === typeParam)
    ? (typeParam as AccountType)
    : 'all'

  const canWrite = can(userRole, 'accounts.write')
  const isStaff = userRole === 'staff'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ rows, missingTable: missing }, people, allContacts] = await Promise.all([
        listAccounts(),
        listTeam(),
        listContacts(),
      ])
      setAccounts(rows)
      setMissingTable(missing)
      setTeam(people)
      setContacts(allContacts)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load accounts'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const teamById = useMemo(() => new Map(team.map((u) => [u.id, u])), [team])
  const primaryByAccount = useMemo(() => {
    const map = new Map<string, AccountContact>()
    for (const c of contacts) {
      if (c.is_primary || !map.has(c.account_id)) map.set(c.account_id, c)
    }
    return map
  }, [contacts])

  const mine = useMemo(
    () => visibleAccounts(accounts, userRole, appUserId),
    [accounts, userRole, appUserId],
  )

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: mine.length }
    for (const t of ACCOUNT_TYPES) out[t.value] = mine.filter((a) => a.type === t.value).length
    return out
  }, [mine])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return mine.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false
      if (ownerFilter === 'none' && a.owner_user_id) return false
      if (ownerFilter !== 'all' && ownerFilter !== 'none' && a.owner_user_id !== ownerFilter) return false
      if (!q) return true
      const contact = primaryByAccount.get(a.id)
      return [a.name, a.reference, a.city, a.industry, a.status, contact?.name, contact?.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [mine, typeFilter, ownerFilter, search, primaryByAccount])

  function setType(next: TypeFilter) {
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('type')
    else params.set('type', next)
    setSearchParams(params, { replace: true })
  }

  async function handleCreate(input: AccountInput, primary: ContactInput | null) {
    if (!input.name) {
      showToast('Give the account a name', 'error')
      return
    }
    setSaving(true)
    try {
      const author = { appUserId, email: user?.email || '' }
      const account = await createAccount(
        input,
        user?.email || '',
        accounts.map((a) => a.reference),
      )
      await logAccountEvent(account.id, `Account created as ${accountTypeLabel(account.type)}`, author)
      if (primary) await saveContact(account.id, primary)
      showToast(`${account.name} added as ${account.reference}`, 'success')
      setModalOpen(false)
      navigate(`/accounts/${account.id}`)
    } catch (e) {
      showToast(errorMessage(e, 'Could not create the account'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const ownerName = (id: string | null) => {
    if (!id) return 'Nobody yet'
    const u = teamById.get(id)
    return u ? u.name || u.email : 'Former team member'
  }

  const newLabel =
    typeFilter === 'all' ? 'New account' : `New ${accountTypeInfo(typeFilter).label}`

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Accounts</h1>
          <p style={pageSubtitleStyle}>
            {isStaff
              ? 'The clients, churches and prospects assigned to you.'
              : 'Every AI CRM client, WorshipHub church and CTRM Next prospect in one list.'}
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            style={buttonPrimaryStyle}
            onClick={() => setModalOpen(true)}
            disabled={missingTable}
          >
            <Plus size={16} /> {newLabel}
          </button>
        ) : null}
      </div>

      {missingTable ? (
        <div style={{ ...cardStyle, color: colors.muted, lineHeight: 1.55, marginBottom: 16 }}>
          The accounts tables are not on this database yet. Run{' '}
          <code>supabase/migrations/20261023090000_accounts_foundation.sql</code> in the Supabase SQL
          editor, then refresh.
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {(['all', ...ACCOUNT_TYPES.map((t) => t.value)] as TypeFilter[]).map((t) => {
          const active = t === typeFilter
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                fontSize: 13,
                cursor: 'pointer',
                border: `1px solid ${active ? colors.accent : colors.border}`,
                background: active ? 'rgba(232,93,4,0.16)' : 'rgba(255,255,255,0.04)',
                color: active ? colors.text : colors.muted,
              }}
            >
              {t === 'all' ? 'All' : accountTypeInfo(t).plural} ({counts[t] ?? 0})
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, maxWidth: 320 }}
          placeholder="Search name, reference, contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!isStaff ? (
          <select
            style={{ ...selectStyle, maxWidth: 220 }}
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            aria-label="Owner"
          >
            <option value="all">Any owner</option>
            <option value="none">No owner yet</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading accounts…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Contact size={22} />}
          title={mine.length === 0 ? 'No accounts yet' : 'Nothing matches'}
          subtitle={
            mine.length === 0
              ? isStaff
                ? 'Nothing has been assigned to you yet. Ask Alfred to assign an account, or add a prospect you are working on.'
                : 'Add your first AI CRM client, WorshipHub church or CTRM Next prospect.'
              : 'Try another type, owner or search.'
          }
          actionLabel={canWrite && mine.length === 0 && !missingTable ? 'Add account' : undefined}
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Account</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Main contact</th>
                  <th style={thStyle}>Owner</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const contact = primaryByAccount.get(a.id)
                  return (
                    <tr
                      key={a.id}
                      onClick={() => navigate(`/accounts/${a.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: colors.muted2 }}>
                          {[a.reference, a.city].filter(Boolean).join(', ')}
                        </div>
                      </td>
                      <td style={tdStyle}>{accountTypeLabel(a.type)}</td>
                      <td style={tdStyle}>
                        <StatusPill status={accountStatusLabel(a.status)} />
                      </td>
                      <td style={tdStyle}>
                        {contact ? (
                          <>
                            <div>{contact.name}</div>
                            <div style={{ fontSize: 11, color: colors.muted2 }}>
                              {contact.email || contact.phone}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: colors.muted2 }}>None yet</span>
                        )}
                      </td>
                      <td style={tdStyle}>{ownerName(a.owner_user_id)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AccountFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        account={null}
        defaultType={typeFilter === 'all' ? 'ai_crm_client' : typeFilter}
        team={team}
        lockedOwnerId={isStaff ? appUserId : undefined}
        canReassign={can(userRole, 'accounts.reassign')}
        defaultOwnerId={appUserId}
        saving={saving}
        onSave={(input, contact) => void handleCreate(input, contact)}
      />
    </div>
  )
}
