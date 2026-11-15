import { useEffect, useRef, useState } from 'react'
import Modal from '../Modal'
import { BILLING_STATUSES } from '../../lib/worshiphub'
import { parseChurchDetailsForm } from '../../lib/schemas/churchDetails'
import type { ChurchDetailsInput } from '../../lib/worshiphubStore'
import type { WorshipBillingStatus, WorshipChurchProfile } from '../../lib/types'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { errorMessage } from '../../lib/errors'
import { useToast } from '../../contexts/ToastContext'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../../lib/uiStyles'

type Props = {
  open: boolean
  onClose: () => void
  profile: WorshipChurchProfile | null
  saving: boolean
  onSave: (values: ChurchDetailsInput) => void
}

type Draft = Omit<ChurchDetailsInput, 'modules' | 'whatsapp_conversations'> & {
  modules: string
  whatsapp_conversations: string
}

function parseBillingStatus(raw: string): WorshipBillingStatus | '' {
  const token = raw.trim().toLowerCase()
  if (!token) return ''
  const byValue = BILLING_STATUSES.find((s) => s.value === token)
  if (byValue) return byValue.value
  const byLabel = BILLING_STATUSES.find((s) => s.label.toLowerCase() === token)
  return (byLabel?.value ?? '') as WorshipBillingStatus | ''
}

export default function ChurchDetailsModal({ open, onClose, profile, saving, onSave }: Props) {
  const { showToast } = useToast()
  const [d, setD] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setD({
      tenant_slug: profile?.tenant_slug ?? '',
      plan: profile?.plan ?? '',
      modules: (profile?.modules ?? []).join(', '),
      whatsapp_month: profile?.whatsapp_month ?? '',
      whatsapp_conversations: profile?.whatsapp_conversations == null ? '' : String(profile.whatsapp_conversations),
      billing_status: profile?.billing_status ?? '',
      renewal_date: profile?.renewal_date ?? null,
      admin_url: profile?.admin_url ?? '',
      notes: profile?.notes ?? '',
    })
  }, [open, profile])

  if (!d) return null
  const set = (patch: Partial<Draft>) => setD((cur) => (cur ? { ...cur, ...patch } : cur))

  function submit() {
    if (!d) return
    const parsed = parseChurchDetailsForm(d)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError('')
    onSave(parsed.data)
  }

  async function importChurchCsv(file: File) {
    if (!d) return
    setImporting(true)
    setError('')
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      if (!objects.length) {
        showToast('No church details rows in CSV', 'error')
        return
      }

      const next: Draft = {
        tenant_slug: d.tenant_slug,
        plan: d.plan,
        modules: d.modules,
        whatsapp_month: d.whatsapp_month,
        whatsapp_conversations: d.whatsapp_conversations,
        billing_status: d.billing_status,
        renewal_date: d.renewal_date,
        admin_url: d.admin_url,
        notes: d.notes,
      }
      let applied = 0
      const headerSet = new Set(headers.map((h) => h.trim().toLowerCase()))
      const isWide =
        headerSet.has('tenant_slug') ||
        headerSet.has('plan') ||
        headerSet.has('modules') ||
        headerSet.has('billing_status')

      if (isWide) {
        const row = objects[0]
        if (Object.prototype.hasOwnProperty.call(row, 'tenant_slug')) {
          next.tenant_slug = String(row.tenant_slug ?? '').trim()
          applied += 1
        }
        if (Object.prototype.hasOwnProperty.call(row, 'plan')) {
          next.plan = String(row.plan ?? '').trim()
          applied += 1
        }
        if (Object.prototype.hasOwnProperty.call(row, 'modules')) {
          next.modules = String(row.modules ?? '').trim()
          applied += 1
        }
        if (Object.prototype.hasOwnProperty.call(row, 'whatsapp_month')) {
          next.whatsapp_month = String(row.whatsapp_month ?? '').trim()
          applied += 1
        }
        if (Object.prototype.hasOwnProperty.call(row, 'whatsapp_conversations')) {
          next.whatsapp_conversations = String(row.whatsapp_conversations ?? '').trim()
          applied += 1
        }
        if (Object.prototype.hasOwnProperty.call(row, 'billing_status')) {
          next.billing_status = parseBillingStatus(String(row.billing_status ?? ''))
          applied += 1
        }
        if (Object.prototype.hasOwnProperty.call(row, 'renewal_date')) {
          next.renewal_date = String(row.renewal_date ?? '').trim() || null
          applied += 1
        }
        if (Object.prototype.hasOwnProperty.call(row, 'admin_url')) {
          next.admin_url = String(row.admin_url ?? '').trim()
          applied += 1
        }
        if (Object.prototype.hasOwnProperty.call(row, 'notes')) {
          next.notes = String(row.notes ?? '').trim()
          applied += 1
        }
      } else {
        for (const row of objects) {
          const field = String(row.field || row.key || '').trim().toLowerCase()
          const value = String(row.value ?? '').trim()
          if (!field || field === 'source') continue
          if (field === 'slug' || field === 'tenant_slug') {
            next.tenant_slug = value
            applied += 1
          } else if (field === 'plan') {
            next.plan = value
            applied += 1
          } else if (field === 'modules') {
            next.modules = value
            applied += 1
          } else if (field === 'billing_status') {
            next.billing_status = parseBillingStatus(value)
            applied += 1
          } else if (field === 'renewal_date') {
            next.renewal_date = value || null
            applied += 1
          } else if (field === 'whatsapp_month') {
            next.whatsapp_month = value
            applied += 1
          } else if (field === 'whatsapp_total' || field === 'whatsapp_conversations') {
            next.whatsapp_conversations = value
            applied += 1
          } else if (field === 'admin_url') {
            next.admin_url = value
            applied += 1
          } else if (field === 'notes') {
            next.notes = value
            applied += 1
          }
        }
      }

      if (!applied) {
        showToast('No WorshipHub fields to import in CSV', 'error')
        return
      }
      setD(next)
      showToast(`Imported ${applied} WorshipHub field(s) into the form`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'WorshipHub CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="WorshipHub details" width={640}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 14px' }}>
          Used when WorshipHub is not connected. When it is, the live plan, usage and billing show instead.
        </p>
        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="wh-slug">
              WorshipHub slug
            </label>
            <input
              id="wh-slug"
              style={inputStyle}
              value={d.tenant_slug}
              placeholder="icoc-uae"
              onChange={(e) => set({ tenant_slug: e.target.value })}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="wh-plan">
              Plan
            </label>
            <input id="wh-plan" style={inputStyle} value={d.plan} onChange={(e) => set({ plan: e.target.value })} />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle} htmlFor="wh-modules">
              Modules turned on
            </label>
            <input
              id="wh-modules"
              style={inputStyle}
              value={d.modules}
              placeholder="Events, Giving, WhatsApp"
              onChange={(e) => set({ modules: e.target.value })}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="wh-month">
              WhatsApp month
            </label>
            <input
              id="wh-month"
              type="month"
              style={inputStyle}
              value={d.whatsapp_month}
              onChange={(e) => set({ whatsapp_month: e.target.value })}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="wh-conversations">
              WhatsApp conversations that month
            </label>
            <input
              id="wh-conversations"
              inputMode="numeric"
              style={inputStyle}
              value={d.whatsapp_conversations}
              onChange={(e) => set({ whatsapp_conversations: e.target.value })}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="wh-billing">
              Billing
            </label>
            <select
              id="wh-billing"
              style={selectStyle}
              value={d.billing_status}
              onChange={(e) => set({ billing_status: e.target.value as WorshipBillingStatus })}
            >
              <option value="">Not set</option>
              {BILLING_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="wh-renewal">
              Renewal date
            </label>
            <input
              id="wh-renewal"
              type="date"
              style={inputStyle}
              value={d.renewal_date ?? ''}
              onChange={(e) => set({ renewal_date: e.target.value || null })}
            />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle} htmlFor="wh-admin">
              WorshipHub admin link
            </label>
            <input
              id="wh-admin"
              style={inputStyle}
              value={d.admin_url}
              placeholder="https://"
              onChange={(e) => set({ admin_url: e.target.value })}
            />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle} htmlFor="wh-notes">
              Notes
            </label>
            <textarea
              id="wh-notes"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={d.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>
        {error ? <p style={{ color: colors.danger, margin: '0 0 10px', fontSize: 13 }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing || saving}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing || saving}
            onClick={() => {
              if (!d) return
              exportListCsv(
                `church-details-${d.tenant_slug || 'profile'}.csv`,
                [
                  'tenant_slug',
                  'plan',
                  'modules',
                  'whatsapp_month',
                  'whatsapp_conversations',
                  'billing_status',
                  'renewal_date',
                  'admin_url',
                  'notes',
                ],
                [
                  {
                    tenant_slug: d.tenant_slug,
                    plan: d.plan,
                    modules: d.modules,
                    whatsapp_month: d.whatsapp_month,
                    whatsapp_conversations: d.whatsapp_conversations,
                    billing_status: d.billing_status,
                    renewal_date: d.renewal_date || '',
                    admin_url: d.admin_url,
                    notes: d.notes,
                  },
                ],
              )
              showToast('Church details CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={importing || saving}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving || importing}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
