import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ExternalLink, Globe, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import type { OwnedDomain, OwnedDomainBillingCycle, OwnedDomainStatus } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { logActivity } from '../lib/activity'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import { formatAED } from '../lib/money'
import { domainAlertLabel, domainRenewalAlerts } from '../lib/domainAlerts'
import {
  DOMAIN_BILLING_CYCLES,
  DOMAIN_STATUSES,
  domainStatusLabel,
  listOwnedDomainsResult,
  normalizeDomainName,
} from '../lib/domains'
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
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

type DomainForm = {
  domain_name: string
  registrar: string
  registrar_account: string
  status: OwnedDomainStatus
  registered_on: string
  expires_on: string
  auto_renew: boolean
  dns_provider: string
  nameservers: string
  hosting_provider: string
  website_url: string
  managed_by: string
  cost_aed: string
  billing_cycle: OwnedDomainBillingCycle
  notes: string
}

const emptyForm = (): DomainForm => ({
  domain_name: '',
  registrar: '',
  registrar_account: '',
  status: 'active',
  registered_on: '',
  expires_on: '',
  auto_renew: false,
  dns_provider: '',
  nameservers: '',
  hosting_provider: '',
  website_url: '',
  managed_by: '',
  cost_aed: '',
  billing_cycle: '',
  notes: '',
})

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(String(url || '').trim())
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return format(parseISO(String(value).slice(0, 10)), 'dd MMM yyyy')
  } catch {
    return String(value).slice(0, 10)
  }
}

export default function DomainsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [domains, setDomains] = useState<OwnedDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<OwnedDomain | null>(null)
  const [form, setForm] = useState<DomainForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<OwnedDomain | null>(null)
  const [missingTable, setMissingTable] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { rows, missingTable: missing } = await listOwnedDomainsResult()
      setDomains(rows)
      setMissingTable(missing)
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load domains'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const renewalAlerts = useMemo(() => domainRenewalAlerts(domains, 90), [domains])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return domains
    return domains.filter(
      (d) =>
        d.domain_name.toLowerCase().includes(q) ||
        d.registrar.toLowerCase().includes(q) ||
        d.dns_provider.toLowerCase().includes(q) ||
        d.hosting_provider.toLowerCase().includes(q) ||
        d.managed_by.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q),
    )
  }, [domains, search])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(d: OwnedDomain) {
    setEditing(d)
    setForm({
      domain_name: d.domain_name || '',
      registrar: d.registrar || '',
      registrar_account: d.registrar_account || '',
      status: d.status || 'active',
      registered_on: d.registered_on ? String(d.registered_on).slice(0, 10) : '',
      expires_on: d.expires_on ? String(d.expires_on).slice(0, 10) : '',
      auto_renew: Boolean(d.auto_renew),
      dns_provider: d.dns_provider || '',
      nameservers: d.nameservers || '',
      hosting_provider: d.hosting_provider || '',
      website_url: d.website_url || '',
      managed_by: d.managed_by || '',
      cost_aed: d.cost_aed != null && Number.isFinite(Number(d.cost_aed)) ? String(d.cost_aed) : '',
      billing_cycle: d.billing_cycle || '',
      notes: d.notes || '',
    })
    setOpen(true)
  }

  async function save() {
    const domain_name = normalizeDomainName(form.domain_name)
    if (!domain_name || !domain_name.includes('.')) {
      showToast('Enter a valid domain (e.g. redreach.ae)', 'error')
      return
    }
    const duplicate = domains.find(
      (d) => d.domain_name.toLowerCase() === domain_name && d.id !== editing?.id,
    )
    if (duplicate) {
      showToast(`${domain_name} is already in the tracker`, 'error')
      return
    }
    setSaving(true)
    try {
      const costRaw = form.cost_aed.trim()
      const cost_aed = costRaw === '' ? null : Number(costRaw)
      if (costRaw !== '' && !Number.isFinite(cost_aed)) {
        showToast('Renewal cost must be a number', 'error')
        setSaving(false)
        return
      }
      const payload = {
        domain_name,
        registrar: form.registrar.trim(),
        registrar_account: form.registrar_account.trim(),
        status: form.status,
        registered_on: form.registered_on || null,
        expires_on: form.expires_on || null,
        auto_renew: form.auto_renew,
        dns_provider: form.dns_provider.trim(),
        nameservers: form.nameservers.trim(),
        hosting_provider: form.hosting_provider.trim(),
        website_url: form.website_url.trim(),
        managed_by: form.managed_by.trim(),
        cost_aed,
        billing_cycle: form.billing_cycle,
        notes: form.notes.trim(),
        active: true,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await db.from('owned_domains').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('owned_domains').insert({
          ...payload,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        })
        if (error) throw error
      }
      await logActivity(
        editing ? 'update_domain' : 'save_domain',
        'owned_domain',
        domain_name,
        [
          payload.registrar && `Registrar ${payload.registrar}`,
          payload.expires_on && `Expires ${payload.expires_on}`,
        ]
          .filter(Boolean)
          .join(' · '),
        user?.email || '',
      )
      showToast(editing ? 'Domain updated' : 'Domain added', 'success')
      setOpen(false)
      await load()
    } catch (e) {
      if (isMissingRelationError(e)) {
        showToast(
          'Domains table is missing. Run supabase/migrations/20261008120000_owned_domains.sql in Supabase first.',
          'error',
        )
        setMissingTable(true)
      } else {
        showToast(errorMessage(e, 'Save failed'), 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const { error } = await db
        .from('owned_domains')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', deleteTarget.id)
      if (error) throw error
      await logActivity('archive_domain', 'owned_domain', deleteTarget.domain_name, '', user?.email || '')
      showToast('Domain archived', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Delete failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Domains</h1>
          <p style={pageSubtitleStyle}>
            Track every domain you own — registrar, renewals, DNS, and hosting. Renewal alerts show
            on the dashboard when expiry is within 90 days.
          </p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={openCreate} disabled={missingTable}>
          <Plus size={16} /> Add domain
        </button>
      </div>

      {missingTable ? (
        <div style={{ ...cardStyle, color: colors.muted, lineHeight: 1.55, marginBottom: 16 }}>
          The <code>owned_domains</code> table is not on this database yet. Run{' '}
          <code>supabase/migrations/20261008120000_owned_domains.sql</code> in the Supabase SQL
          editor, then refresh. Local mode creates the store automatically after a reload.
        </div>
      ) : null}

      {renewalAlerts.length > 0 ? (
        <div
          style={{
            ...cardStyle,
            marginBottom: 16,
            borderColor: 'rgba(245, 158, 11, 0.35)',
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Upcoming renewals</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: colors.muted }}>
            {renewalAlerts.slice(0, 8).map((a) => (
              <li key={a.id} style={{ marginBottom: 4 }}>
                <strong style={{ color: a.severity === 'overdue' ? colors.danger : colors.text }}>
                  {a.domainName}
                </strong>{' '}
                · {domainAlertLabel(a)}
                {a.registrar ? ` · ${a.registrar}` : ''}
                {a.autoRenew ? ' · auto-renew on' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={{ marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, maxWidth: 360 }}
          placeholder="Search domain, registrar, DNS…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading domains…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Globe size={22} />}
          title="No domains yet"
          subtitle="Add redreach.ae, teetribe.com, and any other domains you own so renewals are not missed."
          actionLabel="Add domain"
          onAction={openCreate}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Domain</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Registrar</th>
                  <th style={thStyle}>Expires</th>
                  <th style={thStyle}>DNS / hosting</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const alert = renewalAlerts.find((a) => a.id === d.id)
                  return (
                    <tr key={d.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{d.domain_name}</div>
                        {d.website_url ? (
                          <div style={{ fontSize: 11, color: colors.muted2 }}>
                            {isHttpUrl(d.website_url) ? (
                              <a
                                href={d.website_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: colors.accent }}
                              >
                                Open site <ExternalLink size={10} style={{ verticalAlign: -1 }} />
                              </a>
                            ) : (
                              d.website_url
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{domainStatusLabel(d.status)}</td>
                      <td style={tdStyle}>
                        {d.registrar || '—'}
                        {d.auto_renew ? (
                          <div style={{ fontSize: 11, color: colors.muted2 }}>Auto-renew</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            color:
                              alert?.severity === 'overdue'
                                ? colors.danger
                                : alert?.severity === 'soon'
                                  ? colors.warn
                                  : undefined,
                          }}
                        >
                          {formatDate(d.expires_on)}
                        </span>
                        {d.cost_aed != null ? (
                          <div style={{ fontSize: 11, color: colors.muted2 }}>
                            {formatAED(Number(d.cost_aed))}
                            {d.billing_cycle ? ` / ${d.billing_cycle}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        {d.dns_provider || '—'}
                        {d.hosting_provider ? (
                          <div style={{ fontSize: 11, color: colors.muted2 }}>
                            {d.hosting_provider}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <button type="button" style={buttonSecondaryStyle} onClick={() => openEdit(d)}>
                          <Pencil size={14} />
                        </button>{' '}
                        <button
                          type="button"
                          style={buttonDangerStyle}
                          onClick={() => setDeleteTarget(d)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? 'Edit domain' : 'Add domain'}
        onClose={() => setOpen(false)}
        width={720}
      >
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>
          Record registrar login hints (not passwords), renewal dates, and where DNS / hosting live.
        </p>
        <div style={formGridStyle}>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Domain *</label>
            <input
              style={inputStyle}
              value={form.domain_name}
              onChange={(e) => setForm((f) => ({ ...f, domain_name: e.target.value }))}
              placeholder="redreach.ae"
              autoFocus
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Status</label>
            <select
              style={selectStyle}
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as OwnedDomainStatus }))
              }
            >
              {DOMAIN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {domainStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Managed by</label>
            <input
              style={inputStyle}
              value={form.managed_by}
              onChange={(e) => setForm((f) => ({ ...f, managed_by: e.target.value }))}
              placeholder="Email or name"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Registrar</label>
            <input
              style={inputStyle}
              value={form.registrar}
              onChange={(e) => setForm((f) => ({ ...f, registrar: e.target.value }))}
              placeholder="GoDaddy, Namecheap, Cloudflare…"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Registrar account hint</label>
            <input
              style={inputStyle}
              value={form.registrar_account}
              onChange={(e) => setForm((f) => ({ ...f, registrar_account: e.target.value }))}
              placeholder="Login email / team account — not the password"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Registered on</label>
            <input
              type="date"
              style={inputStyle}
              value={form.registered_on}
              onChange={(e) => setForm((f) => ({ ...f, registered_on: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Expires on</label>
            <input
              type="date"
              style={inputStyle}
              value={form.expires_on}
              onChange={(e) => setForm((f) => ({ ...f, expires_on: e.target.value }))}
            />
          </div>
          <label
            style={{
              ...fieldStyle,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={form.auto_renew}
              onChange={(e) => setForm((f) => ({ ...f, auto_renew: e.target.checked }))}
            />
            <span style={{ fontSize: 13, color: colors.text, lineHeight: 1.4 }}>
              Auto-renew enabled at registrar
            </span>
          </label>
          <div style={fieldStyle}>
            <label style={labelStyle}>Renewal cost (AED)</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.cost_aed}
              onChange={(e) => setForm((f) => ({ ...f, cost_aed: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Billing cycle</label>
            <select
              style={selectStyle}
              value={form.billing_cycle}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  billing_cycle: e.target.value as OwnedDomainBillingCycle,
                }))
              }
            >
              {DOMAIN_BILLING_CYCLES.map((c) => (
                <option key={c.value || 'none'} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>DNS provider</label>
            <input
              style={inputStyle}
              value={form.dns_provider}
              onChange={(e) => setForm((f) => ({ ...f, dns_provider: e.target.value }))}
              placeholder="Cloudflare, registrar DNS…"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Hosting</label>
            <input
              style={inputStyle}
              value={form.hosting_provider}
              onChange={(e) => setForm((f) => ({ ...f, hosting_provider: e.target.value }))}
              placeholder="GitHub Pages, Vercel, cPanel…"
            />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Nameservers</label>
            <input
              style={inputStyle}
              value={form.nameservers}
              onChange={(e) => setForm((f) => ({ ...f, nameservers: e.target.value }))}
              placeholder="ns1…, ns2… (comma or space separated)"
            />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Website URL</label>
            <input
              style={inputStyle}
              value={form.website_url}
              onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
              placeholder="https://www.redreach.ae"
            />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Purpose, linked products, transfer lock, etc."
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Archive domain?"
        onClose={() => setDeleteTarget(null)}
        width={420}
      >
        <p style={{ color: colors.muted, lineHeight: 1.5 }}>
          Archive <strong style={{ color: colors.text }}>{deleteTarget?.domain_name}</strong>? It
          will leave the active list (you can restore later from the database if needed).
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonDangerStyle}
            onClick={() => void confirmDelete()}
            disabled={saving}
          >
            {saving ? 'Archiving…' : 'Archive'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
