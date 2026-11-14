import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Contact, Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import StatusPill from '../components/StatusPill'
import AccountFormModal from '../components/accounts/AccountFormModal'
import SavedViewsBar from '../components/SavedViewsBar'
import {
  ACCOUNT_TYPES,
  accountStatusLabel,
  accountTypeInfo,
  accountTypeLabel,
  visibleAccounts,
} from '../lib/accounts'
import {
  accountsFiltersEqual,
  normalizeAccountsFilters,
  type AccountsViewFilters,
} from '../lib/savedViews'
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
  cardStyle,
  colors,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

type TypeFilter = 'all' | AccountType

export default function AccountsPage() {
  const { t } = useI18n()
  const { user, userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [ownerFilter, setOwnerFilter] = useState(() => searchParams.get('owner') || 'all')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const typeParam = searchParams.get('type')
  const typeFilter: TypeFilter = ACCOUNT_TYPES.some((t) => t.value === typeParam)
    ? (typeParam as AccountType)
    : 'all'

  const hasUrlFilters = Boolean(
    searchParams.get('q') || searchParams.get('type') || searchParams.get('owner'),
  )

  const currentViewFilters = useMemo(
    () =>
      normalizeAccountsFilters({
        q: search,
        type: typeFilter,
        owner: ownerFilter,
      }),
    [search, typeFilter, ownerFilter],
  )

  const applyViewFilters = useCallback(
    (raw: Record<string, unknown>) => {
      const f = raw as AccountsViewFilters
      const params = new URLSearchParams()
      const nextType = String(f.type || 'all')
      const nextOwner = String(f.owner || 'all')
      const nextQ = String(f.q || '')
      if (nextType !== 'all') params.set('type', nextType)
      if (nextOwner !== 'all') params.set('owner', nextOwner)
      if (nextQ) params.set('q', nextQ)
      setSearch(nextQ)
      setOwnerFilter(nextOwner)
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  useEffect(() => {
    const q = searchParams.get('q')
    if (q != null) setSearch(q)
  }, [searchParams])

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
    if (ownerFilter !== 'all') params.set('owner', ownerFilter)
    else params.delete('owner')
    if (search.trim()) params.set('q', search.trim())
    else params.delete('q')
    setSearchParams(params, { replace: true })
  }

  function setOwner(next: string) {
    setOwnerFilter(next)
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('owner')
    else params.set('owner', next)
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
    typeFilter === 'all'
      ? t('page.accounts.new')
      : t('page.accounts.newTyped').replace('{type}', accountTypeInfo(typeFilter).label)

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.clients.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.accounts.title')}</h1>
          <p className={docsStyles.subtitle}>
            {isStaff ? t('page.accounts.subtitleStaff') : t('page.accounts.subtitleAll')}
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            className={docsStyles.newBtn}
            onClick={() => setModalOpen(true)}
            disabled={missingTable}
          >
            <Plus size={16} /> {newLabel}
          </button>
        ) : null}
      </header>

      {missingTable ? (
        <div style={{ ...cardStyle, color: colors.muted, lineHeight: 1.55, marginBottom: 16 }}>
          The accounts tables are not on this database yet. Run{' '}
          <code>supabase/migrations/20261023090000_accounts_foundation.sql</code> in the Supabase SQL
          editor, then refresh.
        </div>
      ) : null}

      <SavedViewsBar
        moduleId="accounts"
        filters={currentViewFilters}
        ownerUserId={appUserId}
        canWrite={canWrite}
        applyDefaultOnLoad={!hasUrlFilters}
        onApply={applyViewFilters}
        onToast={showToast}
        filtersEqual={(a, b) =>
          accountsFiltersEqual(a as AccountsViewFilters, b as AccountsViewFilters)
        }
      />

      <div className={docsStyles.controls}>
        <div className={docsStyles.tabs} role="tablist" aria-label="Account type">
          {(['all', ...ACCOUNT_TYPES.map((t) => t.value)] as TypeFilter[]).map((t) => {
            const active = t === typeFilter
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? docsStyles.tabActive : docsStyles.tab}
                onClick={() => setType(t)}
              >
                {t === 'all' ? 'All' : accountTypeInfo(t).plural} ({counts[t] ?? 0})
              </button>
            )
          })}
        </div>
        <input
          className={docsStyles.search}
          placeholder="Search name, reference, contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!isStaff ? (
          <select
            style={{ ...selectStyle, maxWidth: 200, height: 40 }}
            value={ownerFilter}
            onChange={(e) => setOwner(e.target.value)}
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
        <div className={docsStyles.loading}>Loading accounts…</div>
      ) : filtered.length === 0 ? (
        <div className={docsStyles.empty}>
          <EmptyState
            icon={<Contact size={22} />}
            title={mine.length === 0 ? 'No accounts yet' : 'Nothing matches'}
            subtitle={
              mine.length === 0
                ? isStaff
                  ? 'Nothing has been assigned to you yet. Ask Alfred to assign an account, or add a prospect you are working on.'
                  : 'Add your first RR Threads client, AI CRM company, WorshipHub church or CTRM Next prospect.'
                : 'Try another type, owner or search.'
            }
            actionLabel={canWrite && mine.length === 0 && !missingTable ? 'Add account' : undefined}
            onAction={() => setModalOpen(true)}
          />
        </div>
      ) : (
        <div className={docsStyles.tableShell}>
          <div className={docsStyles.tableWrap}>
            <table className={docsStyles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Main contact</th>
                  <th>Owner</th>
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
                      <td className={docsStyles.clientCell}>
                        <div className={docsStyles.ref}>{a.name}</div>
                        <div className={docsStyles.meta}>
                          {[a.reference, a.city].filter(Boolean).join(', ')}
                        </div>
                      </td>
                      <td>{accountTypeLabel(a.type)}</td>
                      <td>
                        <StatusPill status={accountStatusLabel(a.status)} />
                      </td>
                      <td>
                        {contact ? (
                          <>
                            <div>{contact.name}</div>
                            <div className={docsStyles.meta}>
                              {contact.email || contact.phone}
                            </div>
                          </>
                        ) : (
                          <span className={docsStyles.meta}>None yet</span>
                        )}
                      </td>
                      <td>{ownerName(a.owner_user_id)}</td>
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
        defaultType={typeFilter === 'all' ? 'rr_threads_client' : typeFilter}
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
