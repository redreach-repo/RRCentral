import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import ChurchDetailsModal from './ChurchDetailsModal'
import ChurchFacts from './ChurchFacts'
import { BILLING_STATUSES, churchView } from '../../lib/worshiphub'
import { fetchLiveTenants, listChurchProfiles, saveChurchProfile, type ChurchDetailsInput, type LiveResult } from '../../lib/worshiphubStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { parseChurchDetailsForm, type ChurchDetailsFormInput } from '../../lib/schemas/churchDetails'
import type { Account, WorshipChurchProfile } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

function parseBillingStatus(raw: string): string {
  const token = raw.trim().toLowerCase()
  if (!token) return ''
  const byValue = BILLING_STATUSES.find((s) => s.value === token)
  if (byValue) return byValue.value
  const byLabel = BILLING_STATUSES.find((s) => s.label.toLowerCase() === token)
  return byLabel?.value ?? token
}

type Props = {
  account: Account
  editable: boolean
  author: { appUserId: string | null; email: string }
  onChanged: () => void
}

/** WorshipHub plan, usage and billing on a church's account page. */
export default function ChurchProductCard({ account, editable, author, onChanged }: Props) {
  const { showToast } = useToast()
  const [profile, setProfile] = useState<WorshipChurchProfile | null>(null)
  const [live, setLive] = useState<LiveResult | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const rows = await listChurchProfiles()
      setProfile(rows.find((p) => p.account_id === account.id) ?? null)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the WorshipHub details'), 'error')
    }
  }, [account.id, showToast])

  useEffect(() => {
    void load()
    void fetchLiveTenants().then(setLive)
  }, [load])

  async function handleSave(values: ChurchDetailsInput) {
    setSaving(true)
    try {
      await saveChurchProfile(account.id, values, profile, author)
      setEditing(false)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the WorshipHub details'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importChurchCsv(file: File) {
    if (!editable) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const draft: ChurchDetailsFormInput = {
        tenant_slug: profile?.tenant_slug ?? '',
        plan: profile?.plan ?? '',
        modules: (profile?.modules ?? []).join(', '),
        whatsapp_month: profile?.whatsapp_month ?? '',
        whatsapp_conversations: profile?.whatsapp_conversations == null ? '' : String(profile.whatsapp_conversations),
        billing_status: profile?.billing_status ?? '',
        renewal_date: profile?.renewal_date ?? null,
        admin_url: profile?.admin_url ?? '',
        notes: profile?.notes ?? '',
      }
      let applied = 0
      for (const row of objects) {
        const field = String(row.field || row.key || '').trim().toLowerCase()
        const value = String(row.value ?? '').trim()
        if (!field || field === 'source') continue
        if (field === 'slug' || field === 'tenant_slug') {
          draft.tenant_slug = value
          applied += 1
        } else if (field === 'plan') {
          draft.plan = value
          applied += 1
        } else if (field === 'modules') {
          draft.modules = value
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .join(', ')
          applied += 1
        } else if (field === 'billing_status') {
          draft.billing_status = parseBillingStatus(value)
          applied += 1
        } else if (field === 'renewal_date') {
          draft.renewal_date = value || null
          applied += 1
        } else if (field === 'whatsapp_month') {
          draft.whatsapp_month = value
          applied += 1
        } else if (field === 'whatsapp_total' || field === 'whatsapp_conversations') {
          draft.whatsapp_conversations = value
          applied += 1
        } else if (field === 'admin_url') {
          draft.admin_url = value
          applied += 1
        } else if (field === 'notes') {
          draft.notes = value
          applied += 1
        }
      }
      if (!applied) {
        showToast('No WorshipHub fields to import in CSV', 'error')
        return
      }
      const parsed = parseChurchDetailsForm(draft)
      if (!parsed.ok) {
        showToast(parsed.error, 'error')
        return
      }
      await saveChurchProfile(account.id, parsed.data, profile, author)
      showToast(`Imported ${applied} WorshipHub field(s)`, 'success')
      setEditing(false)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'WorshipHub CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const slug = profile?.tenant_slug ?? ''
  const tenant = live?.connected && slug ? (live.tenants.find((t) => t.slug === slug) ?? null) : null
  const view = churchView(profile, tenant)
  let status: string
  if (!live) status = 'Checking WorshipHub…'
  else if (!live.connected) status = `Not connected. ${live.message} Showing the details entered by hand.`
  else if (!slug) status = 'Connected. Add the WorshipHub slug to see live details.'
  else if (!tenant) status = `Connected, but WorshipHub has no church with the slug ${slug}. Showing the details entered by hand.`
  else status = 'Live from WorshipHub.'

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>WorshipHub</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importChurchCsv(file)
            }}
          />
          {editable ? (
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
              disabled={importing || saving}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          {profile || tenant ? (
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
              onClick={() => {
                exportListCsv(
                  `worshiphub-${account.id.slice(0, 8)}.csv`,
                  ['field', 'value'],
                  [
                    { field: 'slug', value: slug },
                    { field: 'source', value: view.source },
                    { field: 'plan', value: view.plan },
                    { field: 'modules', value: view.modules.join('; ') },
                    { field: 'billing_status', value: view.billingStatus },
                    { field: 'renewal_date', value: view.renewalDate || '' },
                    { field: 'whatsapp_month', value: view.whatsappMonth },
                    { field: 'whatsapp_total', value: view.whatsappTotal ?? '' },
                    { field: 'admin_url', value: view.adminUrl },
                    { field: 'notes', value: profile?.notes || '' },
                  ],
                )
                showToast('WorshipHub CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
          ) : null}
          <Link to="/products" style={{ color: colors.muted, fontSize: 12 }}>
            All churches
          </Link>
          {editable ? (
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
              onClick={() => setEditing(true)}
            >
              <Pencil size={13} /> {profile ? 'Edit details' : 'Add details'}
            </button>
          ) : null}
        </div>
      </div>
      <p style={{ fontSize: 12, color: view.source === 'live' ? colors.success : colors.muted2, margin: '8px 0 6px' }}>
        {slug ? `${slug}. ` : ''}
        {status}
      </p>
      {!profile && !tenant ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
          No WorshipHub details yet. Add the church's slug, plan and renewal date so the team can support it.
        </p>
      ) : (
        <ChurchFacts view={view} />
      )}
      <ChurchDetailsModal
        open={editing}
        onClose={() => setEditing(false)}
        profile={profile}
        saving={saving}
        onSave={(v) => void handleSave(v)}
      />
    </section>
  )
}
