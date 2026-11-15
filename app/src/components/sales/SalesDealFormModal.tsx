import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import Modal from '../Modal'
import EditorSectionTabs, {
  editorPanelStyle,
  type EditorSection,
} from '../EditorSectionTabs'
import LostReasonFields from '../deals/LostReasonFields'
import { formatAED } from '../../lib/money'
import { SALES_STAGES, quoteFirstYear, quoteFromPackage } from '../../lib/salesPipeline'
import type { SalesDealInput } from '../../lib/salesPipelineStore'
import { parseSalesDealForm } from '../../lib/schemas/salesDeal'
import type { Account, AppUser, DeliveryPackage, SalesDeal, SalesStage } from '../../lib/types'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
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
const num = (raw: string) => Number(String(raw).replace(/,/g, '')) || 0

function parseSalesStage(raw: string): SalesStage | null {
  const token = raw.trim().toLowerCase()
  if (!token) return null
  const byValue = SALES_STAGES.find((s) => s.value === token)
  if (byValue) return byValue.value
  const byLabel = SALES_STAGES.find((s) => s.label.toLowerCase() === token)
  return byLabel?.value ?? null
}

function parseOption(raw: string): 'A' | 'B' | null {
  const token = raw.trim().toUpperCase()
  if (token === 'A' || token === 'B') return token
  return null
}

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
  const { showToast } = useToast()
  const [v, setV] = useState<SalesDealFormValues | null>(null)
  const [error, setError] = useState('')
  const [editorSection, setEditorSection] = useState<EditorSection>('basics')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setEditorSection('basics')
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
  const accountLocked = Boolean(deal || lockedAccountId)

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
    const parsed = parseSalesDealForm({ ...v, contract_id: deal?.contract_id ?? null })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    onSave({ ...v, ...parsed.data })
  }

  async function importSalesDealCsv(file: File) {
    if (!v) return
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
        showToast('No sales deal draft rows in CSV', 'error')
        return
      }

      const next: SalesDealFormValues = {
        accountId: v.accountId,
        newCompany: v.newCompany,
        stage: v.stage,
        source: v.source,
        owner_user_id: v.owner_user_id,
        next_action: v.next_action,
        next_action_date: v.next_action_date,
        lost_reason: v.lost_reason,
        lost_reason_code: v.lost_reason_code,
        notes: v.notes,
        discovery_call_date: v.discovery_call_date,
        package_id: v.package_id,
        option: v.option,
        monthly_fee: v.monthly_fee,
        setup_fee: v.setup_fee,
        discount_percent: v.discount_percent,
        discount_months: v.discount_months,
        start_date: v.start_date,
        quote_reference: v.quote_reference,
      }
      let applied = 0
      const row = objects[0]
      const has = (key: string) => Object.prototype.hasOwnProperty.call(row, key)
      const aiAccounts = accounts.filter((a) => a.type === 'ai_crm_client')

      if (!accountLocked && has('account_id')) {
        const accountId = String(row.account_id ?? '').trim()
        if (!accountId || aiAccounts.some((a) => a.id === accountId)) {
          next.accountId = accountId
          if (accountId) next.newCompany = ''
          applied += 1
        }
      }
      if (!accountLocked && has('new_company')) {
        next.newCompany = String(row.new_company ?? '').trim()
        applied += 1
      }
      if (has('stage')) {
        const parsedStage = parseSalesStage(String(row.stage ?? ''))
        if (parsedStage && (parsedStage !== 'signed' || signed)) {
          next.stage = parsedStage
          applied += 1
        }
      }
      if (has('source')) {
        next.source = String(row.source ?? '').trim()
        applied += 1
      }
      if (has('owner_user_id')) {
        const owner = String(row.owner_user_id ?? '').trim()
        if (!owner || team.some((u) => u.id === owner)) {
          next.owner_user_id = owner || null
          applied += 1
        }
      }
      if (has('next_action')) {
        next.next_action = String(row.next_action ?? '').trim()
        applied += 1
      }
      if (has('next_action_date')) {
        next.next_action_date = String(row.next_action_date ?? '').trim() || null
        applied += 1
      }
      if (has('package_id')) {
        const packageId = String(row.package_id ?? '').trim()
        if (!packageId || packages.some((p) => p.id === packageId)) {
          next.package_id = packageId || null
          applied += 1
        }
      }
      if (has('option')) {
        const option = parseOption(String(row.option ?? ''))
        if (option) {
          next.option = option
          applied += 1
        }
      }
      if (has('monthly_fee')) {
        next.monthly_fee = num(String(row.monthly_fee ?? ''))
        applied += 1
      }
      if (has('setup_fee')) {
        next.setup_fee = num(String(row.setup_fee ?? ''))
        applied += 1
      }
      if (has('discount_percent')) {
        next.discount_percent = num(String(row.discount_percent ?? ''))
        applied += 1
      }
      if (has('discount_months')) {
        next.discount_months = num(String(row.discount_months ?? ''))
        applied += 1
      }
      if (has('start_date')) {
        next.start_date = String(row.start_date ?? '').trim() || null
        applied += 1
      }
      if (has('notes')) {
        next.notes = String(row.notes ?? '').trim()
        applied += 1
      }

      if (!applied) {
        showToast('No sales deal draft fields to import in CSV', 'error')
        return
      }
      setV(next)
      showToast(`Imported ${applied} sales deal draft field(s)`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Sales deal draft CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={deal ? 'Edit sales deal' : 'New sales deal'} width={720}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <EditorSectionTabs
          value={editorSection}
          onChange={setEditorSection}
          sections={['basics', 'lines', 'terms', 'notes']}
        />
        <div style={editorPanelStyle(editorSection === 'basics')}>
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
        </div>

        <div style={editorPanelStyle(editorSection === 'lines')}>
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
        </div>

        <div style={editorPanelStyle(editorSection === 'terms')}>
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
        </div>

        <div style={editorPanelStyle(editorSection === 'notes')}>
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
              if (file) void importSalesDealCsv(file)
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
              if (!v) return
              exportListCsv(
                'sales-deal-form.csv',
                [
                  'account_id',
                  'new_company',
                  'stage',
                  'source',
                  'owner_user_id',
                  'next_action',
                  'next_action_date',
                  'package_id',
                  'option',
                  'monthly_fee',
                  'setup_fee',
                  'discount_percent',
                  'discount_months',
                  'start_date',
                  'notes',
                ],
                [
                  {
                    account_id: v.accountId,
                    new_company: v.newCompany,
                    stage: v.stage,
                    source: v.source,
                    owner_user_id: v.owner_user_id || '',
                    next_action: v.next_action,
                    next_action_date: v.next_action_date || '',
                    package_id: v.package_id || '',
                    option: v.option,
                    monthly_fee: v.monthly_fee,
                    setup_fee: v.setup_fee,
                    discount_percent: v.discount_percent,
                    discount_months: v.discount_months,
                    start_date: v.start_date || '',
                    notes: v.notes,
                  },
                ],
              )
              showToast('Sales deal draft CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={importing || saving}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving || importing}>
            {saving ? 'Saving…' : deal ? 'Save deal' : 'Add deal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
