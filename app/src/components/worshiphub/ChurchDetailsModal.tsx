import { useEffect, useState } from 'react'
import Modal from '../Modal'
import { BILLING_STATUSES, churchDetailsProblem } from '../../lib/worshiphub'
import type { ChurchDetailsInput } from '../../lib/worshiphubStore'
import type { WorshipBillingStatus, WorshipChurchProfile } from '../../lib/types'
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

export default function ChurchDetailsModal({ open, onClose, profile, saving, onSave }: Props) {
  const [d, setD] = useState<Draft | null>(null)
  const [error, setError] = useState('')

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
    const clean = { ...d, tenant_slug: d.tenant_slug.trim().toLowerCase(), admin_url: d.admin_url.trim() }
    const problem = churchDetailsProblem(clean)
    if (problem) {
      setError(problem)
      return
    }
    onSave({
      ...clean,
      plan: clean.plan.trim(),
      modules: [...new Set(clean.modules.split(',').map((m) => m.trim()).filter(Boolean))],
      whatsapp_conversations: clean.whatsapp_conversations.trim() ? Number(clean.whatsapp_conversations) : null,
      renewal_date: clean.renewal_date || null,
      notes: clean.notes.trim(),
    })
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
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
