import { useEffect, useState } from 'react'
import Modal from '../Modal'
import { ACCOUNT_TYPES, accountStatusLabel, accountTypeInfo } from '../../lib/accounts'
import type { AccountInput, ContactInput } from '../../lib/accountsStore'
import type { Account, AccountType, AppUser } from '../../lib/types'
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
  /** Editing an existing account; null creates a new one. */
  account: Account | null
  defaultType?: AccountType
  team: AppUser[]
  /** Owner picker is locked to `lockedOwnerId` when set (staff create their own accounts). */
  lockedOwnerId?: string | null
  /** Sales cannot reassign an existing account. */
  canReassign: boolean
  defaultOwnerId: string | null
  saving: boolean
  onSave: (input: AccountInput, primaryContact: ContactInput | null) => void
}

type Form = AccountInput & { contactName: string; contactEmail: string; contactPhone: string }

function emptyForm(type: AccountType, ownerId: string | null): Form {
  return {
    type,
    name: '',
    industry: '',
    country: 'United Arab Emirates',
    city: '',
    website: '',
    status: accountTypeInfo(type).statuses[0],
    owner_user_id: ownerId,
    source: '',
    notes: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  }
}

export default function AccountFormModal({
  open,
  onClose,
  account,
  defaultType = 'ai_crm_client',
  team,
  lockedOwnerId,
  canReassign,
  defaultOwnerId,
  saving,
  onSave,
}: Props) {
  const [form, setForm] = useState<Form>(() => emptyForm(defaultType, defaultOwnerId))

  useEffect(() => {
    if (!open) return
    if (account) {
      setForm({
        type: account.type,
        name: account.name,
        industry: account.industry || '',
        country: account.country || '',
        city: account.city || '',
        website: account.website || '',
        status: account.status || '',
        owner_user_id: account.owner_user_id,
        source: account.source || '',
        notes: account.notes || '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
      })
    } else {
      setForm(emptyForm(defaultType, lockedOwnerId ?? defaultOwnerId))
    }
  }, [open, account, defaultType, lockedOwnerId, defaultOwnerId])

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const statuses = accountTypeInfo(form.type).statuses
  const ownerLocked = Boolean(lockedOwnerId) || (Boolean(account) && !canReassign)

  function submit() {
    const input: AccountInput = {
      type: form.type,
      name: form.name.trim(),
      industry: form.industry.trim(),
      country: form.country.trim(),
      city: form.city.trim(),
      website: form.website.trim(),
      status: form.status,
      owner_user_id: lockedOwnerId ?? form.owner_user_id ?? null,
      source: form.source.trim(),
      notes: form.notes.trim(),
    }
    const contact: ContactInput | null =
      !account && form.contactName.trim()
        ? {
            name: form.contactName.trim(),
            role: '',
            email: form.contactEmail.trim(),
            phone: form.contactPhone.trim(),
            whatsapp: form.contactPhone.trim(),
            is_primary: true,
          }
        : null
    onSave(input, contact)
  }

  return (
    <Modal open={open} onClose={onClose} title={account ? 'Edit account' : 'New account'} width={640}>
      <div style={formGridStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Type</label>
          <select
            style={selectStyle}
            value={form.type}
            disabled={Boolean(account)}
            onChange={(e) => {
              const type = e.target.value as AccountType
              setForm((f) => ({ ...f, type, status: accountTypeInfo(type).statuses[0] }))
            }}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Name</label>
          <input
            style={inputStyle}
            value={form.name}
            placeholder="Company or church name"
            onChange={(e) => set('name', e.target.value)}
            autoFocus
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Status</label>
          <select style={selectStyle} value={form.status} onChange={(e) => set('status', e.target.value)}>
            {!statuses.includes(form.status) && form.status ? (
              <option value={form.status}>{accountStatusLabel(form.status)}</option>
            ) : null}
            {statuses.map((s) => (
              <option key={s} value={s}>
                {accountStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Owner</label>
          <select
            style={selectStyle}
            value={form.owner_user_id ?? ''}
            disabled={ownerLocked}
            onChange={(e) => set('owner_user_id', e.target.value || null)}
          >
            <option value="">Nobody yet</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Industry</label>
          <input style={inputStyle} value={form.industry} onChange={(e) => set('industry', e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Source</label>
          <input
            style={inputStyle}
            value={form.source}
            placeholder="Referral, website, event"
            onChange={(e) => set('source', e.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Country</label>
          <input style={inputStyle} value={form.country} onChange={(e) => set('country', e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>City</label>
          <input style={inputStyle} value={form.city} onChange={(e) => set('city', e.target.value)} />
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Website</label>
        <input
          style={inputStyle}
          value={form.website}
          placeholder="https://"
          onChange={(e) => set('website', e.target.value)}
        />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Notes</label>
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      {!account ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 10px' }}>
            Main contact <span style={{ color: colors.muted2, fontWeight: 400 }}>(optional)</span>
          </div>
          <div style={formGridStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Name</label>
              <input
                style={inputStyle}
                value={form.contactName}
                onChange={(e) => set('contactName', e.target.value)}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle}
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Phone or WhatsApp</label>
              <input
                style={inputStyle}
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
              />
            </div>
          </div>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          style={buttonPrimaryStyle}
          onClick={submit}
          disabled={saving || !form.name.trim()}
        >
          {saving ? 'Saving…' : account ? 'Save changes' : 'Create account'}
        </button>
      </div>
    </Modal>
  )
}
