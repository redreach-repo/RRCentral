import { useCallback, useEffect, useRef, useState } from 'react'
import { LOST_REASONS, isLostReason, lostText } from '../../lib/dealRules'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { FileSignature, Plus } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import MakeContractModal from './MakeContractModal'
import SalesDealFormModal, { type SalesDealFormValues } from './SalesDealFormModal'
import { listPackages } from '../../lib/deliveryStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { formatAED } from '../../lib/money'
import { parseSalesDealForm } from '../../lib/schemas/salesDeal'
import {
  SALES_STAGES,
  canMakeContract,
  hasQuote,
  isSalesDealOverdue,
  quoteFirstYear,
  salesStageLabel,
} from '../../lib/salesPipeline'
import { listSalesDeals, makeContractFromDeal, saveSalesDealForm } from '../../lib/salesPipelineStore'
import type { Account, AppUser, DeliveryPackage, SalesDeal, SalesStage } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const EXPORT_COLUMNS = [
  'stage',
  'source',
  'package',
  'option',
  'monthly_fee',
  'setup_fee',
  'next_action',
  'next_action_date',
  'lost_reason',
  'notes',
] as const

const STAGE_VALUES = new Set(SALES_STAGES.map((s) => s.value))
const STAGE_BY_LABEL = new Map(SALES_STAGES.map((s) => [s.label.toLowerCase(), s.value]))

function resolveStage(raw: string): SalesStage | '' {
  const value = raw.trim()
  if (!value) return ''
  if (STAGE_VALUES.has(value as SalesStage)) return value as SalesStage
  return STAGE_BY_LABEL.get(value.toLowerCase()) || ''
}

function parseLostFromExport(raw: string): { code: string; note: string } {
  const text = raw.trim()
  if (!text) return { code: '', note: '' }
  const colon = text.indexOf(': ')
  if (colon > 0) {
    const code = text.slice(0, colon).trim()
    const note = text.slice(colon + 2).trim()
    if (isLostReason(code)) return { code, note: note || code }
  }
  if (isLostReason(text)) return { code: text, note: text }
  // Match a known lost reason as a prefix (export uses "code: note").
  for (const code of LOST_REASONS) {
    if (text === code || text.startsWith(`${code}:`)) {
      const note = text === code ? code : text.slice(code.length).replace(/^:\s*/, '').trim()
      return { code, note: note || code }
    }
  }
  return { code: '', note: text }
}

function resolveOption(raw: string): 'A' | 'B' {
  const v = raw.trim().toUpperCase()
  return v === 'B' ? 'B' : 'A'
}

type Props = {
  account: Account
  team: AppUser[]
  editable: boolean
  canContract: boolean
  author: { appUserId: string | null; email: string }
  onChanged: () => void
}

/** The pre-sale deal for an AI CRM account, on its page. Hidden for clients that never went through the pipeline. */
export default function AccountSalesDealCard({ account, team, editable, canContract, author, onChanged }: Props) {
  const { showToast } = useToast()
  const [deals, setDeals] = useState<SalesDeal[]>([])
  const [missingTable, setMissingTable] = useState(true)
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [editing, setEditing] = useState<SalesDeal | null | undefined>(undefined)
  const [contractFor, setContractFor] = useState<SalesDeal | null>(null)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [d, pkgs] = await Promise.all([listSalesDeals(account.id), listPackages()])
      setDeals(d.rows)
      setMissingTable(d.missingTable)
      setPackages(pkgs)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the sales deal'), 'error')
    }
  }, [account.id, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(values: SalesDealFormValues) {
    setSaving(true)
    try {
      await saveSalesDealForm(values, editing ?? null, [], author)
      setEditing(undefined)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the deal'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmContract() {
    if (!contractFor) return
    setSaving(true)
    try {
      await makeContractFromDeal(contractFor, account, author)
      showToast('Contract made from the quote', 'success')
      setContractFor(null)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the contract'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importSalesDealsCsv(file: File) {
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
      const today = format(new Date(), 'yyyy-MM-dd')
      let saved = 0
      let skipped = 0
      for (const row of objects) {
        const stage = resolveStage(String(row.stage || ''))
        // Signed deals need Make contract; skip them on import.
        if (!stage || stage === 'signed') {
          skipped += 1
          continue
        }
        const packageName = String(row.package || '').trim()
        const pkg = packageName
          ? packages.find((p) => p.name.trim().toLowerCase() === packageName.toLowerCase())
          : undefined
        const lost = parseLostFromExport(String(row.lost_reason || ''))
        const nextAction = String(row.next_action || '').trim()
        const nextActionDate = String(row.next_action_date || '').trim() || (stage !== 'lost' ? today : '')
        const values: SalesDealFormValues = {
          accountId: account.id,
          newCompany: '',
          stage,
          source: String(row.source || '').trim(),
          owner_user_id: account.owner_user_id ?? author.appUserId,
          next_action: nextAction,
          next_action_date: nextActionDate || null,
          lost_reason: lost.note,
          lost_reason_code: lost.code,
          notes: String(row.notes || '').trim(),
          discovery_call_date: null,
          package_id: pkg?.id ?? null,
          option: resolveOption(String(row.option || '')),
          monthly_fee: Number(String(row.monthly_fee ?? '').replace(/,/g, '')) || 0,
          setup_fee: Number(String(row.setup_fee ?? '').replace(/,/g, '')) || 0,
          discount_percent: 0,
          discount_months: 0,
          start_date: null,
          quote_reference: '',
        }
        const parsed = parseSalesDealForm(values)
        if (!parsed.ok) {
          skipped += 1
          continue
        }
        await saveSalesDealForm(parsed.data, null, [], author)
        saved += 1
      }
      if (!saved && skipped) {
        showToast('No matching sales deal rows in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} sales deal(s)${skipNote}`, 'success')
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Sales deals CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  // Only prospects, or clients that came through the pipeline, get the card.
  if (missingTable || (deals.length === 0 && account.status !== 'prospect')) return null

  const now = new Date()
  return (
    <section style={{ ...cardStyle, marginTop: 16 }} aria-label="Sales deal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Sales deal</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importSalesDealsCsv(file)
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
                  `sales-deals-${account.id.slice(0, 8)}.csv`,
                  [...EXPORT_COLUMNS],
                  deals.map((d) => {
                    const pkg = packages.find((p) => p.id === d.package_id)
                    return {
                      stage: salesStageLabel(d.stage),
                      source: d.source || '',
                      package: pkg?.name || '',
                      option: d.option || '',
                      monthly_fee: d.monthly_fee,
                      setup_fee: d.setup_fee,
                      next_action: d.next_action || '',
                      next_action_date: d.next_action_date || '',
                      lost_reason: d.stage === 'lost' ? lostText(d.lost_reason_code || '', d.lost_reason) : '',
                      notes: d.notes || '',
                    }
                  }),
                )
                showToast('Sales deals CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
          ) : null}
          <Link to="/deals?pipeline=sales&view=board" style={{ color: colors.muted, fontSize: 12 }}>
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
          Not in the pipeline yet. Add a deal to track the stage, the quote and the next step.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {deals.map((d) => {
            const pkg = packages.find((p) => p.id === d.package_id)
            const late = isSalesDealOverdue(d, now)
            return (
              <div key={d.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{salesStageLabel(d.stage)}</strong>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {editable && canContract && canMakeContract(d) ? (
                      <button type="button" style={{ ...buttonPrimaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => setContractFor(d)}>
                        <FileSignature size={12} /> Make contract
                      </button>
                    ) : null}
                    {editable ? (
                      <button type="button" style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => setEditing(d)}>
                        Edit
                      </button>
                    ) : null}
                  </span>
                </div>
                {hasQuote(d) ? (
                  <div style={{ fontSize: 13, color: colors.muted }}>
                    Quote: {pkg?.name ?? 'Package'} option {d.option}, {formatAED(Number(d.monthly_fee))} a month
                    {Number(d.setup_fee) ? ` plus ${formatAED(Number(d.setup_fee))} setup` : ''}, first year {formatAED(quoteFirstYear(d))}
                    {d.quote_reference ? ` (${d.quote_reference})` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: colors.muted }}>No quote yet.</div>
                )}
                {d.stage === 'lost' ? (
                  <div style={{ fontSize: 13 }}>Lost: {lostText(d.lost_reason_code || '', d.lost_reason)}</div>
                ) : d.stage === 'signed' ? (
                  <div style={{ fontSize: 13 }}>Signed {d.signed_at ? format(parseISO(d.signed_at), 'd MMM yyyy') : ''}. The contract is in the Contract section below.</div>
                ) : d.next_action ? (
                  <div style={{ fontSize: 13, color: late ? colors.danger : colors.text }}>
                    Next: {d.next_action}
                    {d.next_action_date ? `, by ${format(parseISO(d.next_action_date), 'd MMM')}` : ''}
                    {late ? ' (overdue)' : ''}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <SalesDealFormModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        deal={editing ?? null}
        accounts={[account]}
        packages={packages}
        team={team}
        lockedAccountId={account.id}
        defaultOwnerId={account.owner_user_id ?? author.appUserId}
        saving={saving}
        onSave={(v) => void handleSave(v)}
      />
      <MakeContractModal
        deal={contractFor}
        companyName={account.name}
        packages={packages}
        saving={saving}
        onClose={() => setContractFor(null)}
        onConfirm={() => void confirmContract()}
      />
    </section>
  )
}
