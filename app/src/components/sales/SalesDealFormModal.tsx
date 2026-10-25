import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import Modal from '../Modal'
import LostReasonFields from '../deals/LostReasonFields'
import { formatAED } from '../../lib/money'
import { SALES_STAGES, quoteFirstYear, quoteFromPackage, salesDealProblem } from '../../lib/salesPipeline'
import type { SalesDealInput } from '../../lib/salesPipelineStore'
import type { Account, AppUser, DeliveryPackage, SalesDeal, SalesStage } from '../../lib/types'
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

export type SalesDealFormValues = {
  /** Existing AI CRM account, or empty with newCompany set. */
  accountId: string
  newCompany: string
} & SalesDealInput

type Props = {
  open: boolean
  onClose: () => void
  deal: SalesDeal | null
  /** Stage to open the form at, e.g. after a move that needs more details. */
  stage?: SalesStage
  accounts: Account[]
  packages: DeliveryPackage[]
  team: AppUser[]
  /** Fixes the company, e.g. when opened from its account page. */
  lockedAccountId?: string
  defaultOwnerId: string | null
  saving: boolean
  onSave: (values: SalesDealFormValues) => void
}

const today = () => format(new Date(), 'yyyy-MM-dd')
const num = (raw: string) => Number(raw.replace(/,/g, '')) || 0

export default function SalesDealFormModal({
  open,
  onClose,
  deal,
  stage,
  accounts,
  packages,
  team,
  lockedAccountId,
  defaultOwnerId,
  saving,
  onSave,
}: Props) {
  const [v, setV] = useState<SalesDealFormValues | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setV({
      accountId: deal?.account_id ?? lockedAccountId ?? '',
      newCompany: '',
      stage: stage ?? deal?.stage ?? 'lead',
      source: deal?.source ?? '',
      owner_user_id: deal ? deal.owner_user_id : defaultOwnerId,
      next_action: deal?.next_action ?? '',
      next_action_date: deal?.next_action_date ?? today(),
      lost_reason: deal?.lost_reason ?? '',
      lost_reason_code: deal?.lost_reason_code ?? '',
      notes: deal?.notes ?? '',
      discovery_call_date: deal?.discovery_call_date ?? null,
      package_id: deal?.package_id ?? null,
      option: deal?.option ?? 'A',
      monthly_fee: Number(deal?.monthly_fee ?? 0),
      setup_fee: Number(deal?.setup_fee ?? 0),
      discount_percent: Number(deal?.discount_percent ?? 0),
      discount_months: Number(deal?.discount_months ?? 0),
      start_date: deal?.start_date ?? null,
      quote_reference: deal?.quote_reference ?? '',
    })
  }, [open, deal, stage, lockedAccountId, defaultOwnerId])

  if (!v) return null
  const set = (patch: Partial<SalesDealFormValues>) => setV((cur) => (cur ? { ...cur, ...patch } : cur))
  const sorted = accounts.filter((a) => a.type === 'ai_crm_client').sort((a, b) => a.name.localeCompare(b.name))
  const isOpen = v.stage !== 'signed' && v.stage !== 'lost'
  const signed = Boolean(deal?.contract_id)
  const stages = SALES_STAGES.filter((s) => s.value !== 'signed' || signed)

  function pickPackage(packageId: string, option: 'A' | 'B') {
    const pkg = packages.find((p) => p.id === packageId)
    if (!pkg) {
      set({ package_id: null, option })
      return
    }
    set(quoteFromPackage(pkg, option))
  }

  function submit() {
    if (!v) return
    if (!v.accountId && !v.newCompany.trim()) {
      setError('Pick the company, or type a new one')
      return
    }
    const problem = salesDealProblem({ ...v, contract_id: deal?.contract_id ?? null })
    if (problem) {
      setError(problem)
      return
    }
    onSave(v)
  }

  return (
    <Modal open={open} onClose={onClose} title={deal ? 'Edit sales deal' : 'New sales deal'} width={720}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="sd-account">
              Company
            </label>
            <select
              id="sd-account"
              style={selectStyle}
              value={v.accountId}
              disabled={Boolean(deal || lockedAccountId)}
              onChange={(e) => set({ accountId: e.target.value })}
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
              <label style={labelStyle} htmlFor="sd-new-company">
                New company name
              </label>
              <input
                id="sd-new-company"
                style={inputStyle}
                value={v.newCompany}
                placeholder="Bright Smile Dental Clinic"
                onChange={(e) => set({ newCompany: e.target.value })}
              />
            </div>
          ) : null}
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="sd-stage">
              Stage
            </label>
            <select
              id="sd-stage"
              style={selectStyle}
              value={v.stage}
              disabled={signed}
              onChange={(e) => set({ stage: e.target.value as SalesStage })}
            >
              {stages.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="sd-owner">
              Owner
            </label>
            <select id="sd-owner" style={selectStyle} value={v.owner_user_id ?? ''} onChange={(e) => set({ owner_user_id: e.target.value || null })}>
              <option value="">Nobody yet</option>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="sd-source">
              Source
            </label>
            <input id="sd-source" style={inputStyle} value={v.source} placeholder="Referral, website, LinkedIn" onChange={(e) => set({ source: e.target.value })} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="sd-discovery">
              Discovery call
            </label>
            <input
              id="sd-discovery"
              type="date"
              style={inputStyle}
              value={v.discovery_call_date ?? ''}
              onChange={(e) => set({ discovery_call_date: e.target.value || null })}
            />
          </div>
        </div>

        {v.stage === 'lost' ? (
          <LostReasonFields
            idPrefix="sd-lost"
            code={v.lost_reason_code || ''}
            note={v.lost_reason}
            notePlaceholder="Went with another agency, no budget this year"
            onChange={({ code, note }) => set({ lost_reason_code: code, lost_reason: note })}
          />
        ) : null}

        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="sd-next">
              Next action{isOpen ? '' : ' (optional)'}
            </label>
            <input
              id="sd-next"
              style={inputStyle}
              value={v.next_action}
              placeholder="Send the quote after the discovery call"
              onChange={(e) => set({ next_action: e.target.value })}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="sd-next-date">
              By when
            </label>
            <input
              id="sd-next-date"
              type="date"
              style={inputStyle}
              value={v.next_action_date ?? ''}
              onChange={(e) => set({ next_action_date: e.target.value || null })}
            />
          </div>
        </div>

        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Quote (AED, excluding VAT)</div>
          <div style={formGridStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="sd-package">
                Package
              </label>
              <select
                id="sd-package"
                style={selectStyle}
                value={v.package_id ?? ''}
                disabled={signed}
                onChange={(e) => pickPackage(e.target.value, v.option)}
              >
                <option value="">Not quoted yet</option>
                {packages
                  .filter((p) => p.active || p.id === v.package_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="sd-option">
                Option
              </label>
              <select
                id="sd-option"
                style={selectStyle}
                value={v.option}
                disabled={signed || !v.package_id}
                onChange={(e) => pickPackage(v.package_id ?? '', e.target.value as 'A' | 'B')}
              >
                <option value="A">A: monthly only</option>
                <option value="B">B: setup fee plus lower monthly</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="sd-monthly">
                Monthly fee
              </label>
              <input
                id="sd-monthly"
                style={inputStyle}
                inputMode="decimal"
                disabled={signed}
                value={String(v.monthly_fee)}
                onChange={(e) => set({ monthly_fee: num(e.target.value) })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="sd-setup">
                Setup fee
              </label>
              <input
                id="sd-setup"
                style={inputStyle}
                inputMode="decimal"
                disabled={signed}
                value={String(v.setup_fee)}
                onChange={(e) => set({ setup_fee: num(e.target.value) })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="sd-discount">
                Discount %
              </label>
              <input
                id="sd-discount"
                style={inputStyle}
                inputMode="decimal"
                disabled={signed}
                value={String(v.discount_percent)}
                onChange={(e) => set({ discount_percent: Math.min(100, num(e.target.value)) })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="sd-discount-months">
                For how many months
              </label>
              <input
                id="sd-discount-months"
                style={inputStyle}
                inputMode="numeric"
                disabled={signed}
                value={String(v.discount_months)}
                onChange={(e) => set({ discount_months: Math.min(12, Math.round(num(e.target.value))) })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="sd-start">
                Contract start
              </label>
              <input
                id="sd-start"
                type="date"
                style={inputStyle}
                disabled={signed}
                value={v.start_date ?? ''}
                onChange={(e) => set({ start_date: e.target.value || null })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="sd-quote-ref">
                Quotation number (optional)
              </label>
              <input
                id="sd-quote-ref"
                style={inputStyle}
                value={v.quote_reference}
                placeholder="RR-03-26014"
                onChange={(e) => set({ quote_reference: e.target.value })}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, color: colors.muted2 }}>
            {v.package_id && v.monthly_fee > 0
              ? `First year value ${formatAED(quoteFirstYear(v))}. `
              : 'Pick a package to fill in its fees. '}
            Leave the start empty to start on the first of next month.
          </div>
        </div>

        <div style={{ ...fieldStyle, marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="sd-notes">
            Notes
          </label>
          <textarea
            id="sd-notes"
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={v.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>

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
