import { useCallback, useEffect, useRef, useState } from 'react'
import { LOST_REASONS, lostText } from '../../lib/dealRules'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import DealFormModal, { type DealFormValues } from './DealFormModal'
import {
  CTRM_COMPANY_TYPES,
  CTRM_REGIONS,
  CTRM_STAGES,
  companyTypeLabel,
  isOverdue,
  isStale,
  regionLabel,
  stageLabel,
} from '../../lib/ctrm'
import { listCommissions, listDeals, saveDealForm } from '../../lib/ctrmStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { parseCtrmDealForm } from '../../lib/schemas/ctrmDeal'
import type { Account, AccountContact, AppUser, CtrmCommission, CtrmCompanyType, CtrmDeal, CtrmRegion, CtrmStage } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const EXPORT_COLUMNS = [
  'stage',
  'region',
  'company_type',
  'source',
  'next_action',
  'next_action_date',
  'last_touch_at',
  'lost_reason',
  'notes',
] as const

type Props = {
  account: Account
  contacts: AccountContact[]
  team: AppUser[]
  editable: boolean
  showCommission: boolean
  author: { appUserId: string | null; email: string }
  onChanged: () => void
}

function matchLabeledValue<T extends string>(
  raw: string,
  options: { value: T; label: string }[],
): T | null {
  const v = raw.trim()
  if (!v) return null
  const lower = v.toLowerCase()
  const byValue = options.find((o) => o.value === v || o.value === lower.replace(/\s+/g, '_'))
  if (byValue) return byValue.value
  const byLabel = options.find((o) => o.label.toLowerCase() === lower)
  return byLabel?.value ?? null
}

function parseYmd(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const day = v.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** Reverse `lostText(code, note)` → code + note for import. */
function parseLostReason(raw: string): { code: string; note: string } {
  const v = raw.trim()
  if (!v) return { code: '', note: '' }
  const colon = v.indexOf(':')
  if (colon > 0) {
    const code = v.slice(0, colon).trim()
    const note = v.slice(colon + 1).trim()
    if ((LOST_REASONS as readonly string[]).includes(code)) return { code, note: note || code }
  }
  if ((LOST_REASONS as readonly string[]).includes(v)) return { code: v, note: v }
  return { code: '', note: v }
}

function rowHasContent(row: Record<string, string>): boolean {
  return EXPORT_COLUMNS.some((k) => String(row[k] ?? '').trim())
}

/** The CTRM Next deal for a prospect, on its account page. */
export default function AccountDealsCard({ account, contacts, team, editable, showCommission, author, onChanged }: Props) {
  const { showToast } = useToast()
  const [deals, setDeals] = useState<CtrmDeal[]>([])
  const [commissions, setCommissions] = useState<CtrmCommission[]>([])
  const [editing, setEditing] = useState<CtrmDeal | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([listDeals(account.id), showCommission ? listCommissions() : Promise.resolve([])])
      setDeals(d)
      setCommissions(c)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the deal'), 'error')
    }
  }, [account.id, showCommission, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(values: DealFormValues) {
    setSaving(true)
    try {
      await saveDealForm(values, editing ?? null, editing ? commissions.find((c) => c.deal_id === editing.id) : undefined, [], author)
      setEditing(undefined)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the deal'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importDealsCsv(file: File) {
    if (!editable) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      const existing = [...deals]
      let saved = 0
      let skipped = 0
      let rowIndex = 0
      const today = format(new Date(), 'yyyy-MM-dd')
      const defaultOwner = account.owner_user_id ?? author.appUserId

      for (const row of objects) {
        if (!rowHasContent(row)) {
          skipped += 1
          continue
        }
        const deal = existing[rowIndex] ?? null
        const stage =
          matchLabeledValue(String(row.stage || ''), CTRM_STAGES) ??
          (deal?.stage as CtrmStage | undefined) ??
          'identified'
        const region =
          matchLabeledValue(String(row.region || ''), CTRM_REGIONS) ??
          (deal?.region as CtrmRegion | undefined) ??
          'middle_east'
        const companyType =
          matchLabeledValue(String(row.company_type || ''), CTRM_COMPANY_TYPES) ??
          (deal?.company_type as CtrmCompanyType | undefined) ??
          'trading_house'
        const lost = parseLostReason(String(row.lost_reason || ''))
        const nextAction = String(row.next_action || '').trim()
        const nextDate = parseYmd(String(row.next_action_date || ''))
        const existingCommission = deal ? commissions.find((c) => c.deal_id === deal.id) : undefined
        const values: DealFormValues = {
          accountId: account.id,
          newCompany: '',
          stage,
          region,
          company_type: companyType,
          primary_contact_id: deal?.primary_contact_id ?? null,
          source: String(row.source || deal?.source || '').trim(),
          owner_user_id: deal?.owner_user_id ?? defaultOwner,
          next_action: nextAction || (stage !== 'signed' && stage !== 'lost' ? deal?.next_action || 'Follow up' : ''),
          next_action_date:
            nextDate ||
            (stage !== 'signed' && stage !== 'lost' ? deal?.next_action_date || today : null),
          lost_reason: stage === 'lost' ? lost.note || deal?.lost_reason || '' : '',
          lost_reason_code: stage === 'lost' ? lost.code || deal?.lost_reason_code || '' : '',
          notes: String(row.notes || '').trim() || deal?.notes || '',
          commission: showCommission
            ? {
                expected: Number(existingCommission?.expected_commission ?? 0),
                received: Number(existingCommission?.commission_received ?? 0),
              }
            : null,
        }
        const parsed = parseCtrmDealForm(values)
        if (!parsed.ok) {
          skipped += 1
          continue
        }
        await saveDealForm(parsed.data, deal, existingCommission, [], author)
        saved += 1
        rowIndex += 1
      }

      if (!saved && skipped) {
        showToast('No matching CTRM deal rows in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} CTRM deal(s)${skipNote}`, 'success')
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'CTRM deals CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const now = new Date()
  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CTRM Next deal</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importDealsCsv(file)
            }}
          />
          {editable ? (
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          {deals.length ? (
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
              onClick={() => {
                exportListCsv(
                  `ctrm-deals-${account.id.slice(0, 8)}.csv`,
                  [...EXPORT_COLUMNS],
                  deals.map((d) => ({
                    stage: stageLabel(d.stage),
                    region: regionLabel(d.region),
                    company_type: companyTypeLabel(d.company_type),
                    source: d.source || '',
                    next_action: d.next_action || '',
                    next_action_date: d.next_action_date || '',
                    last_touch_at: d.last_touch_at || '',
                    lost_reason: d.stage === 'lost' ? lostText(d.lost_reason_code || '', d.lost_reason) : '',
                    notes: d.notes || '',
                  })),
                )
                showToast('CTRM deals CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
          ) : null}
          <Link to="/deals?pipeline=ctrm&view=board" style={{ color: colors.muted, fontSize: 12 }}>
            Open Pipeline
          </Link>
          {editable && deals.length === 0 ? (
            <button type="button" style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }} onClick={() => setEditing(null)}>
              <Plus size={14} /> Add deal
            </button>
          ) : null}
        </div>
      </div>
      {deals.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '10px 0 0' }}>
          Not in the pipeline yet. Add a deal to track the stage and the next step.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {deals.map((d) => {
            const c = commissions.find((x) => x.deal_id === d.id)
            return (
              <div key={d.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{stageLabel(d.stage)}</strong>
                  {editable ? (
                    <button type="button" style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => setEditing(d)}>
                      Edit
                    </button>
                  ) : null}
                </div>
                <div style={{ fontSize: 13, color: colors.muted }}>
                  {regionLabel(d.region)}, {companyTypeLabel(d.company_type)}
                  {d.source ? `, from ${d.source}` : ''}
                </div>
                {d.stage === 'lost' ? (
                  <div style={{ fontSize: 13 }}>Lost: {lostText(d.lost_reason_code || '', d.lost_reason)}</div>
                ) : d.next_action ? (
                  <div style={{ fontSize: 13, color: isOverdue(d, now) ? colors.danger : colors.text }}>
                    Next: {d.next_action}
                    {d.next_action_date ? `, by ${format(parseISO(d.next_action_date), 'd MMM')}` : ''}
                    {isOverdue(d, now) ? ' (overdue)' : ''}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: isStale(d, now) ? colors.warn : colors.muted2 }}>
                  Last touch {format(parseISO(d.last_touch_at), 'd MMM yyyy')}
                </div>
                {showCommission && c ? (
                  <div style={{ fontSize: 12, color: colors.muted2 }}>
                    Red Reach commission: AED {Number(c.commission_received).toLocaleString('en-AE')} received of AED{' '}
                    {Number(c.expected_commission).toLocaleString('en-AE')} expected
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <DealFormModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        deal={editing ?? null}
        commission={editing ? commissions.find((c) => c.deal_id === editing.id) : undefined}
        prospects={[account]}
        contacts={contacts}
        team={team}
        lockedAccountId={account.id}
        defaultOwnerId={account.owner_user_id ?? author.appUserId}
        showCommission={showCommission}
        saving={saving}
        onSave={(v) => void handleSave(v)}
      />
    </section>
  )
}
