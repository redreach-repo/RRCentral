import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { BellRing, Church, ExternalLink, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import ChurchActionButtons from '../components/worshiphub/ChurchActionButtons'
import ChurchFacts from '../components/worshiphub/ChurchFacts'
import { visibleAccounts } from '../lib/accounts'
import { createAccount, listAccounts } from '../lib/accountsStore'
import { billingLabel, churchView, hasBillingIssue, joinRequests, renewalSoon } from '../lib/worshiphub'
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
  const requests = live?.connected && canAdd ? joinRequests(live.tenants) : []
  const allTenants = live?.connected ? [...live.tenants].sort((a, b) => (a.name || a.slug).localeCompare(b.name || b.slug)) : []
  const accountBySlug = useMemo(
    () => new Map(profiles.filter((p) => p.tenant_slug).map((p) => [p.tenant_slug, p.account_id])),
    [profiles],
  )

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
          notes: [
            t.registered_at ? `Signed up on WorshipHub ${format(parseISO(t.registered_at), 'd MMM yyyy')}.` : '',
            t.contact_name || t.contact_email ? `Contact: ${[t.contact_name, t.contact_email].filter(Boolean).join(', ')}.` : '',
          ]
            .filter(Boolean)
            .join(' '),
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
          <h1 style={pageTitleStyle}>WorshipHub</h1>
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

      {requests.length ? (
        <section style={{ ...cardStyle, marginBottom: 16, borderColor: colors.warn }} aria-label="Churches asking to join WorshipHub">
          <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BellRing size={16} /> Asking to join WorshipHub ({requests.length})
          </h2>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.muted2 }}>
            These churches signed up and are waiting for Red Reach to review them.{' '}
            {userRole === 'admin'
              ? 'Accept, verify, reject or delete them here. Each change is made on WorshipHub and kept in the audit log.'
              : 'An RR Central admin can accept or reject them here, or in WorshipHub app admin.'}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {requests.map((t) => (
              <div key={t.slug} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>
                  <strong>{t.name || t.slug}</strong>
                  <span style={{ display: 'block', fontSize: 12, color: colors.muted2 }}>
                    {[
                      t.registered_at ? `signed up ${format(parseISO(t.registered_at), 'd MMM yyyy')}` : '',
                      t.contact_name,
                      t.contact_email,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <ChurchActionButtons tenant={t} onDone={() => void refreshLive()} />
                  {t.admin_url ? (
                    <a
                      href={t.admin_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}
                    >
                      Review in WorshipHub <ExternalLink size={12} />
                    </a>
                  ) : null}
                  {!linkedSlugs.has(t.slug) ? (
                    <button
                      type="button"
                      style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
                      disabled={adding === t.slug}
                      onClick={() => void addTenant(t)}
                    >
                      {adding === t.slug ? 'Adding…' : 'Add as church account'}
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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

      {allTenants.length ? (
        <section style={{ ...cardStyle, marginTop: 16, overflowX: 'auto' }} aria-label="All churches on WorshipHub">
          <h2 style={sectionTitleStyle}>All churches on WorshipHub ({allTenants.length})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: colors.muted }}>
                {['Church', 'Plan', 'Billing', 'Renewal', 'Users', 'Contact', 'RR Central', ...(userRole === 'admin' ? ['On WorshipHub'] : [])].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allTenants.map((t) => {
                const accountId = accountBySlug.get(t.slug)
                return (
                  <tr key={t.slug} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '6px 8px' }}>
                      <strong>{t.name || t.slug}</strong>
                      {t.review_status === 'pending' ? (
                        <span style={{ marginLeft: 6, fontSize: 11, color: colors.warn }}>waiting for review</span>
                      ) : t.review_status === 'rejected' ? (
                        <span style={{ marginLeft: 6, fontSize: 11, color: colors.danger }}>rejected</span>
                      ) : t.verification_status === 'verified' ? (
                        <span style={{ marginLeft: 6, fontSize: 11, color: colors.success }}>verified</span>
                      ) : null}
                      <span style={{ display: 'block', fontSize: 11, color: colors.muted2 }}>{t.slug}</span>
                    </td>
                    <td style={{ padding: '6px 8px' }}>{t.plan || 'Not set'}</td>
                    <td style={{ padding: '6px 8px', color: hasBillingIssue(t.billing_status) ? colors.danger : undefined }}>
                      {billingLabel(t.billing_status)}
                    </td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                      {t.renewal_date ? format(parseISO(t.renewal_date), 'd MMM yyyy') : 'Not set'}
                    </td>
                    <td style={{ padding: '6px 8px' }}>{t.user_count ?? ''}</td>
                    <td style={{ padding: '6px 8px' }}>
                      {t.contact_name}
                      {t.contact_email ? <span style={{ display: 'block', fontSize: 11, color: colors.muted2 }}>{t.contact_email}</span> : null}
                    </td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                      {accountId ? <Link to={`/accounts/${accountId}`}>Open account</Link> : <span style={{ color: colors.muted2 }}>Not added</span>}
                    </td>
                    {userRole === 'admin' ? (
                      <td style={{ padding: '6px 8px' }}>
                        <ChurchActionButtons tenant={t} onDone={() => void refreshLive()} />
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  )
}
