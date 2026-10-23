import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Church, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import ChurchFacts from '../components/worshiphub/ChurchFacts'
import { visibleAccounts } from '../lib/accounts'
import { createAccount, listAccounts } from '../lib/accountsStore'
import { churchView, hasBillingIssue, renewalSoon } from '../lib/worshiphub'
import { fetchLiveTenants, listChurchProfiles, saveChurchProfile, type LiveResult } from '../lib/worshiphubStore'
import { errorMessage } from '../lib/errors'
import type { Account, WorshipChurchProfile, WorshipTenant } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
  toolbarStyle,
} from '../lib/uiStyles'

/** Products Red Reach runs and supports. Today that is WorshipHub. */
export default function ProductsPage() {
  const { user, userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [profiles, setProfiles] = useState<WorshipChurchProfile[]>([])
  const [live, setLive] = useState<LiveResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState('')
  const author = useMemo(() => ({ appUserId, email: user?.email || '' }), [appUserId, user?.email])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ rows }, p] = await Promise.all([listAccounts(), listChurchProfiles()])
      setAccounts(rows)
      setProfiles(p)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the churches'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const refreshLive = useCallback(async () => {
    setLive(null)
    setLive(await fetchLiveTenants())
  }, [])

  useEffect(() => {
    void load()
    void refreshLive()
  }, [load, refreshLive])

  const churches = useMemo(
    () =>
      visibleAccounts(accounts, userRole, appUserId)
        .filter((a) => a.type === 'worship_church')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [accounts, userRole, appUserId],
  )
  const profileByAccount = useMemo(() => new Map(profiles.map((p) => [p.account_id, p])), [profiles])
  const tenantBySlug = useMemo(
    () => new Map((live?.connected ? live.tenants : []).map((t) => [t.slug, t])),
    [live],
  )
  const linkedSlugs = useMemo(() => new Set(profiles.map((p) => p.tenant_slug).filter(Boolean)), [profiles])
  const canAdd = userRole === 'admin' || userRole === 'manager'
  const unlinked = live?.connected && canAdd ? live.tenants.filter((t) => !linkedSlugs.has(t.slug)) : []

  async function addTenant(t: WorshipTenant) {
    setAdding(t.slug)
    try {
      const account = await createAccount(
        {
          type: 'worship_church',
          name: t.name || t.slug,
          industry: '',
          country: '',
          city: '',
          website: '',
          status: t.billing_status === 'trial' ? 'trial' : 'active',
          owner_user_id: null,
          source: 'WorshipHub',
          notes: '',
        },
        author.email,
        accounts.map((a) => a.reference),
      )
      await saveChurchProfile(
        account.id,
        {
          tenant_slug: t.slug,
          plan: '',
          modules: [],
          whatsapp_month: '',
          whatsapp_conversations: null,
          billing_status: '',
          renewal_date: null,
          admin_url: '',
          notes: '',
        },
        null,
        author,
      )
      showToast(`${account.name} added as a church account`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not add the church'), 'error')
    } finally {
      setAdding('')
    }
  }

  let connection: { text: string; tone: string }
  if (!live) connection = { text: 'Checking the WorshipHub connection…', tone: colors.muted }
  else if (live.connected) {
    connection = {
      text: `Connected to WorshipHub. Plan, usage and billing below are live, read only.`,
      tone: colors.success,
    }
  } else {
    connection = {
      text: `WorshipHub is not connected. ${live.message} The page shows the details entered by hand on each church.`,
      tone: colors.warn,
    }
  }

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Products</h1>
          <p style={pageSubtitleStyle}>
            WorshipHub churches that Red Reach runs and supports. Member and visitor data stays in WorshipHub.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => void refreshLive()} disabled={!live}>
            <RefreshCw size={15} /> Refresh
          </button>
          <Link to="/accounts?type=worship_church" style={{ ...buttonPrimaryStyle, textDecoration: 'none' }}>
            <Plus size={16} /> Add a church
          </Link>
        </div>
      </div>

      <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="WorshipHub connection">
        <p style={{ margin: 0, fontSize: 13, color: connection.tone }}>{connection.text}</p>
        {live && !live.connected && userRole === 'admin' ? (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted2 }}>
            To connect, follow docs/worshiphub-integration.md in the repo.
          </p>
        ) : null}
      </section>

      {unlinked.length ? (
        <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="Churches not in RR Central">
          <h2 style={sectionTitleStyle}>In WorshipHub, not in RR Central yet ({unlinked.length})</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {unlinked.map((t) => (
              <div key={t.slug} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>
                  <strong>{t.name || t.slug}</strong> <span style={{ color: colors.muted2, fontSize: 12 }}>{t.slug}</span>
                </span>
                <button
                  type="button"
                  style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
                  disabled={adding === t.slug}
                  onClick={() => void addTenant(t)}
                >
                  {adding === t.slug ? 'Adding…' : 'Add as church account'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading churches…</div>
      ) : churches.length === 0 ? (
        <EmptyState
          icon={<Church size={22} />}
          title="No WorshipHub churches yet"
          subtitle="Add each church as an account, then add its WorshipHub slug so its plan and usage show here."
        />
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {churches.map((a) => {
            const profile = profileByAccount.get(a.id) ?? null
            const tenant = profile?.tenant_slug ? (tenantBySlug.get(profile.tenant_slug) ?? null) : null
            const view = churchView(profile, tenant)
            const flagged = hasBillingIssue(view.billingStatus) || renewalSoon(view.renewalDate)
            return (
              <article
                key={a.id}
                style={{ ...cardStyle, borderColor: flagged ? colors.warn : undefined }}
                aria-label={a.name}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <Link to={`/accounts/${a.id}`} style={{ fontWeight: 650, color: colors.text }}>
                    {a.name}
                  </Link>
                  <span style={{ fontSize: 11, color: view.source === 'live' ? colors.success : colors.muted2, whiteSpace: 'nowrap' }}>
                    {view.source === 'live' ? 'Live' : 'Entered by hand'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: colors.muted2, margin: '2px 0 8px' }}>
                  {profile?.tenant_slug || 'No WorshipHub slug yet'}
                </div>
                <ChurchFacts view={view} />
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
