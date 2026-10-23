import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import Modal from '../Modal'
import { CTRM_COMPANY_TYPES, CTRM_REGIONS, CTRM_STAGES, dealProblem } from '../../lib/ctrm'
import type {
  Account,
  AccountContact,
  AppUser,
  CtrmCommission,
  CtrmCompanyType,
  CtrmDeal,
  CtrmRegion,
  CtrmStage,
} from '../../lib/types'
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

export type DealFormValues = {
  /** Existing prospect account, or empty with newCompany set. */
  accountId: string
  newCompany: string
  stage: CtrmStage
  region: CtrmRegion
  company_type: CtrmCompanyType
  primary_contact_id: string | null
  source: string
  owner_user_id: string | null
  next_action: string
  next_action_date: string | null
  lost_reason: string
  notes: string
  /** Null when the person cannot see commission. */
  commission: { expected: number; received: number } | null
}

type Props = {
  open: boolean
  onClose: () => void
  deal: CtrmDeal | null
  commission: CtrmCommission | undefined
  prospects: Account[]
  contacts: AccountContact[]
  team: AppUser[]
  /** Fixes the prospect, e.g. when opened from its account page. */
  lockedAccountId?: string
  defaultOwnerId: string | null
  showCommission: boolean
  saving: boolean
  onSave: (values: DealFormValues) => void
}

const today = () => format(new Date(), 'yyyy-MM-dd')

export default function DealFormModal({
  open,
  onClose,
  deal,
  commission,
  prospects,
  contacts,
  team,
  lockedAccountId,
  defaultOwnerId,
  showCommission,
  saving,
  onSave,
}: Props) {
  const [v, setV] = useState<DealFormValues | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setV({
      accountId: deal?.account_id ?? lockedAccountId ?? '',
      newCompany: '',
      stage: deal?.stage ?? 'identified',
      region: deal?.region ?? 'middle_east',
      company_type: deal?.company_type ?? 'trading_house',
      primary_contact_id: deal?.primary_contact_id ?? null,
      source: deal?.source ?? '',
      owner_user_id: deal ? deal.owner_user_id : defaultOwnerId,
      next_action: deal?.next_action ?? '',
      next_action_date: deal?.next_action_date ?? today(),
      lost_reason: deal?.lost_reason ?? '',
      notes: deal?.notes ?? '',
      commission: showCommission
        ? { expected: Number(commission?.expected_commission ?? 0), received: Number(commission?.commission_received ?? 0) }
        : null,
    })
  }, [open, deal, commission, lockedAccountId, defaultOwnerId, showCommission])

  if (!v) return null
  const set = (patch: Partial<DealFormValues>) => setV((cur) => (cur ? { ...cur, ...patch } : cur))
  const accountContacts = contacts.filter((c) => c.account_id === v.accountId)
  const sorted = [...prospects].sort((a, b) => a.name.localeCompare(b.name))
  const isOpen = v.stage !== 'signed' && v.stage !== 'lost'

  function submit() {
    if (!v) return
    if (!v.accountId && !v.newCompany.trim()) {
      setError('Pick the company, or type a new one')
      return
    }
    const problem = dealProblem(v)
    if (problem) {
      setError(problem)
      return
    }
    onSave(v)
  }

  return (
    <Modal open={open} onClose={onClose} title={deal ? 'Edit CTRM Next deal' : 'New CTRM Next deal'} width={680}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="deal-account">
              Company
            </label>
            <select
              id="deal-account"
              style={selectStyle}
              value={v.accountId}
              disabled={Boolean(deal || lockedAccountId)}
              onChange={(e) => set({ accountId: e.target.value, primary_contact_id: null })}
            >
              <option value="">{deal || lockedAccountId ? '' : 'New company (type below)'}</option>
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {!v.accountId ? (
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="deal-new-company">
                New company name
              </label>
              <input
                id="deal-new-company"
                style={inputStyle}
                value={v.newCompany}
                placeholder="Gulf Energy Trading"
                onChange={(e) => set({ newCompany: e.target.value })}
              />
            </div>
          ) : (
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="deal-contact">
                Main contact
              </label>
              <select
                id="deal-contact"
                style={selectStyle}
                value={v.primary_contact_id ?? ''}
                onChange={(e) => set({ primary_contact_id: e.target.value || null })}
                disabled={!accountContacts.length}
              >
                <option value="">{accountContacts.length ? 'Not set' : 'Add contacts on the account page'}</option>
                {accountContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="deal-stage">
              Stage
            </label>
            <select id="deal-stage" style={selectStyle} value={v.stage} onChange={(e) => set({ stage: e.target.value as CtrmStage })}>
              {CTRM_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="deal-region">
              Region
            </label>
            <select id="deal-region" style={selectStyle} value={v.region} onChange={(e) => set({ region: e.target.value as CtrmRegion })}>
              {CTRM_REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="deal-type">
              Company type
            </label>
            <select
              id="deal-type"
              style={selectStyle}
              value={v.company_type}
              onChange={(e) => set({ company_type: e.target.value as CtrmCompanyType })}
            >
              {CTRM_COMPANY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="deal-owner">
              Owner
            </label>
            <select
              id="deal-owner"
              style={selectStyle}
              value={v.owner_user_id ?? ''}
              onChange={(e) => set({ owner_user_id: e.target.value || null })}
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
            <label style={labelStyle} htmlFor="deal-source">
              Source
            </label>
            <input
              id="deal-source"
              style={inputStyle}
              value={v.source}
              placeholder="LinkedIn, referral, event"
              onChange={(e) => set({ source: e.target.value })}
            />
          </div>
        </div>

        {v.stage === 'lost' ? (
          <div style={{ ...fieldStyle, marginBottom: 12 }}>
            <label style={labelStyle} htmlFor="deal-lost">
              Why was it lost?
            </label>
            <input
              id="deal-lost"
              style={inputStyle}
              value={v.lost_reason}
              placeholder="Chose another system, no budget this year"
              onChange={(e) => set({ lost_reason: e.target.value })}
            />
          </div>
        ) : null}

        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="deal-next">
              Next action{isOpen ? '' : ' (optional)'}
            </label>
            <input
              id="deal-next"
              style={inputStyle}
              value={v.next_action}
              placeholder="Book the intro call with their CFO"
              onChange={(e) => set({ next_action: e.target.value })}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="deal-next-date">
              By when
            </label>
            <input
              id="deal-next-date"
              type="date"
              style={inputStyle}
              value={v.next_action_date ?? ''}
              onChange={(e) => set({ next_action_date: e.target.value || null })}
            />
          </div>
        </div>

        <div style={{ ...fieldStyle, marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="deal-notes">
            Notes
          </label>
          <textarea
            id="deal-notes"
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={v.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>

        {v.commission ? (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Commission to Red Reach (AED)</div>
            <div style={formGridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="deal-comm-expected">
                  Expected by Red Reach
                </label>
                <input
                  id="deal-comm-expected"
                  style={inputStyle}
                  inputMode="decimal"
                  value={String(v.commission.expected)}
                  onChange={(e) => set({ commission: { ...v.commission!, expected: Number(e.target.value) || 0 } })}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="deal-comm-received">
                  Received by Red Reach
                </label>
                <input
                  id="deal-comm-received"
                  style={inputStyle}
                  inputMode="decimal"
                  value={String(v.commission.received)}
                  onChange={(e) => set({ commission: { ...v.commission!, received: Number(e.target.value) || 0 } })}
                />
              </div>
            </div>
            <div style={{ fontSize: 12, color: colors.muted2 }}>
              Recorded for the company, never for a person. Not shown to staff or in the weekly summary.
            </div>
          </div>
        ) : null}

        {error ? <p style={{ color: colors.danger, margin: '0 0 10px', fontSize: 13 }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
            {saving ? 'Saving…' : deal ? 'Save deal' : 'Add deal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
