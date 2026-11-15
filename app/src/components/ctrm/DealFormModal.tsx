import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import Modal from '../Modal'
import EditorSectionTabs, {
  editorPanelStyle,
  type EditorSection,
} from '../EditorSectionTabs'
import LostReasonFields from '../deals/LostReasonFields'
import { CTRM_COMPANY_TYPES, CTRM_REGIONS, CTRM_STAGES } from '../../lib/ctrm'
import { parseCtrmDealForm } from '../../lib/schemas/ctrmDeal'
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
  lost_reason_code: string
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
const num = (raw: string) => Number(String(raw).replace(/,/g, '')) || 0

function parseStage(raw: string): CtrmStage | null {
  const token = raw.trim().toLowerCase()
  if (!token) return null
  const byValue = CTRM_STAGES.find((s) => s.value === token)
  if (byValue) return byValue.value
  const byLabel = CTRM_STAGES.find((s) => s.label.toLowerCase() === token)
  return byLabel?.value ?? null
}

function parseRegion(raw: string): CtrmRegion | null {
  const token = raw.trim().toLowerCase()
  if (!token) return null
  const byValue = CTRM_REGIONS.find((r) => r.value === token)
  if (byValue) return byValue.value
  const byLabel = CTRM_REGIONS.find((r) => r.label.toLowerCase() === token)
  return byLabel?.value ?? null
}

function parseCompanyType(raw: string): CtrmCompanyType | null {
  const token = raw.trim().toLowerCase()
  if (!token) return null
  const byValue = CTRM_COMPANY_TYPES.find((t) => t.value === token)
  if (byValue) return byValue.value
  const byLabel = CTRM_COMPANY_TYPES.find((t) => t.label.toLowerCase() === token)
  return byLabel?.value ?? null
}

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
  const { showToast } = useToast()
  const [v, setV] = useState<DealFormValues | null>(null)
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
      stage: deal?.stage ?? 'identified',
      region: deal?.region ?? 'middle_east',
      company_type: deal?.company_type ?? 'trading_house',
      primary_contact_id: deal?.primary_contact_id ?? null,
      source: deal?.source ?? '',
      owner_user_id: deal ? deal.owner_user_id : defaultOwnerId,
      next_action: deal?.next_action ?? '',
      next_action_date: deal?.next_action_date ?? today(),
      lost_reason: deal?.lost_reason ?? '',
      lost_reason_code: deal?.lost_reason_code ?? '',
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
  const accountLocked = Boolean(deal || lockedAccountId)

  function submit() {
    if (!v) return
    const parsed = parseCtrmDealForm(v)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    onSave({ ...v, ...parsed.data })
  }

  async function importDealCsv(file: File) {
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
        showToast('No CTRM deal draft rows in CSV', 'error')
        return
      }

      const next: DealFormValues = {
        accountId: v.accountId,
        newCompany: v.newCompany,
        stage: v.stage,
        region: v.region,
        company_type: v.company_type,
        primary_contact_id: v.primary_contact_id,
        source: v.source,
        owner_user_id: v.owner_user_id,
        next_action: v.next_action,
        next_action_date: v.next_action_date,
        lost_reason: v.lost_reason,
        lost_reason_code: v.lost_reason_code,
        notes: v.notes,
        commission: v.commission
          ? { expected: v.commission.expected, received: v.commission.received }
          : null,
      }
      let applied = 0
      const row = objects[0]
      const has = (key: string) => Object.prototype.hasOwnProperty.call(row, key)

      if (!accountLocked && has('account_id')) {
        const accountId = String(row.account_id ?? '').trim()
        if (!accountId || prospects.some((p) => p.id === accountId)) {
          next.accountId = accountId
          if (accountId) next.newCompany = ''
          next.primary_contact_id = null
          applied += 1
        }
      }
      if (!accountLocked && has('new_company')) {
        next.newCompany = String(row.new_company ?? '').trim()
        applied += 1
      }
      if (has('stage')) {
        const stage = parseStage(String(row.stage ?? ''))
        if (stage) {
          next.stage = stage
          applied += 1
        }
      }
      if (has('region')) {
        const region = parseRegion(String(row.region ?? ''))
        if (region) {
          next.region = region
          applied += 1
        }
      }
      if (has('company_type')) {
        const companyType = parseCompanyType(String(row.company_type ?? ''))
        if (companyType) {
          next.company_type = companyType
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
      if (has('notes')) {
        next.notes = String(row.notes ?? '').trim()
        applied += 1
      }
      if (showCommission && next.commission) {
        if (has('commission_expected')) {
          next.commission.expected = num(String(row.commission_expected ?? ''))
          applied += 1
        }
        if (has('commission_received')) {
          next.commission.received = num(String(row.commission_received ?? ''))
          applied += 1
        }
      }

      if (!applied) {
        showToast('No CTRM deal draft fields to import in CSV', 'error')
        return
      }
      setV(next)
      showToast(`Imported ${applied} CTRM deal draft field(s)`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'CTRM deal draft CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={deal ? 'Edit CTRM Next deal' : 'New CTRM Next deal'} width={680}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <EditorSectionTabs
          value={editorSection}
          onChange={setEditorSection}
          sections={['basics', 'terms', 'notes']}
        />
        <div style={editorPanelStyle(editorSection === 'basics')}>
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
          <LostReasonFields
            idPrefix="deal-lost"
            code={v.lost_reason_code}
            note={v.lost_reason}
            notePlaceholder="Chose another system, no budget this year"
            onChange={({ code, note }) => set({ lost_reason_code: code, lost_reason: note })}
          />
        ) : null}
        </div>

        <div style={editorPanelStyle(editorSection === 'terms')}>
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
        </div>

        <div style={editorPanelStyle(editorSection === 'notes')}>
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
              if (file) void importDealCsv(file)
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
                'ctrm-deal-form.csv',
                [
                  'account_id',
                  'new_company',
                  'stage',
                  'region',
                  'company_type',
                  'source',
                  'owner_user_id',
                  'next_action',
                  'next_action_date',
                  'notes',
                  'commission_expected',
                  'commission_received',
                ],
                [
                  {
                    account_id: v.accountId,
                    new_company: v.newCompany,
                    stage: v.stage,
                    region: v.region,
                    company_type: v.company_type,
                    source: v.source,
                    owner_user_id: v.owner_user_id || '',
                    next_action: v.next_action,
                    next_action_date: v.next_action_date || '',
                    notes: v.notes,
                    commission_expected: v.commission?.expected ?? '',
                    commission_received: v.commission?.received ?? '',
                  },
                ],
              )
              showToast('CTRM deal draft CSV downloaded', 'success')
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
