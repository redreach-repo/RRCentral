import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { HandCoins, Plus } from 'lucide-react'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import StatusPill from '../components/StatusPill'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { db } from '../lib/db'
import { errorMessage } from '../lib/errors'
import { formatAED, round2 } from '../lib/money'
import { roleAtLeast } from '../lib/permissions'
import { canSeeProfit } from '../lib/salesReports'
import { exportListCsv } from '../lib/listIo'
import { listVendors, type VendorRow } from '../lib/vendors'
import { clientPoPartyName } from '../lib/clientPurchaseOrders'
import { listClientPurchaseOrdersWithDetails, type ClientPurchaseOrder } from '../lib/opsSliceStores'
import {
  advanceOpenBalance,
  advanceStatus,
  advanceStatusLabel,
  appliedToAdvance,
  billsForAdvance,
  maxApplicable,
  parseAdvanceForm,
  poSupplierCost,
  type AdvanceForm,
  type SupplierAdvance,
  type SupplierAdvanceApplication,
} from '../lib/supplierAdvances'
import {
  applyAdvanceToBill,
  deleteSupplierAdvance,
  loadSupplierAdvances,
  saveSupplierAdvance,
  unapplyAdvance,
} from '../lib/supplierAdvanceStore'
import type { Expense } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

type QuoteOpt = { id: string; reference_number: string; quote_id: string; client: string; status: string }
type BillRow = Expense & { deleted_at?: string | null }

const STATUS_TABS = ['All', 'Open', 'Applied'] as const
const smallBtn = { ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }
const today = () => format(new Date(), 'yyyy-MM-dd')

const emptyForm = (): AdvanceForm => ({
  vendor_id: '',
  vendor_name: '',
  client_po_id: '',
  quotation_id: '',
  paid_on: today(),
  amount: '',
  payment_method: 'Bank transfer',
  reference: '',
  notes: '',
})

function shortDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'dd MMM yyyy')
  } catch {
    return d
  }
}

/** Margin as a percentage with one decimal (a ratio, not money). */
function marginPct(margin: number, revenue: number): number {
  return Math.round((margin / revenue) * 1000) / 10 // money-guard: not money
}

function quoteLabel(q: QuoteOpt): string {
  return `${q.reference_number || q.quote_id} · ${q.client}${q.status ? ` · ${q.status}` : ''}`
}

/** Finance > Money out: advances paid to suppliers before their bill, linked to a client PO and quote. */
export default function SupplierAdvancesPage() {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const canWrite = roleAtLeast(userRole, 'sales')
  const canRemove = roleAtLeast(userRole, 'manager')
  const seesProfit = canSeeProfit(userRole)

  const [advances, setAdvances] = useState<SupplierAdvance[]>([])
  const [apps, setApps] = useState<SupplierAdvanceApplication[]>([])
  const [ready, setReady] = useState(true)
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [pos, setPos] = useState<ClientPurchaseOrder[]>([])
  const [quotes, setQuotes] = useState<QuoteOpt[]>([])
  const [bills, setBills] = useState<BillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>('All')
  const [search, setSearch] = useState('')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierAdvance | null>(null)
  const [form, setForm] = useState<AdvanceForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  const [applyFor, setApplyFor] = useState<SupplierAdvance | null>(null)
  const [applyBillId, setApplyBillId] = useState('')
  const [applyAmount, setApplyAmount] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [adv, v, p, q, e] = await Promise.all([
        loadSupplierAdvances(),
        listVendors(),
        listClientPurchaseOrdersWithDetails(),
        db
          .from('quotations')
          .select('id, reference_number, quote_id, client, status')
          .neq('status', 'Draft')
          .order('created_at', { ascending: false })
          .limit(500),
        db
          .from('expenses')
          .select('id, date, vendor, category, amount, amount_ex_vat, vat_amount, quote_ref, status, supplier_invoice_no, deleted_at, created_at')
          .order('date', { ascending: false })
          .limit(2000),
      ])
      setAdvances(adv.advances)
      setApps(adv.applications)
      setReady(adv.ready)
      setVendors(v)
      setPos(p.rows)
      setQuotes(q.error ? [] : ((q.data || []) as QuoteOpt[]))
      setBills(e.error ? [] : ((e.data || []) as BillRow[]))
    } catch (err) {
      showToast(errorMessage(err, 'Could not load supplier advances'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const poById = useMemo(() => new Map(pos.map((p) => [p.id, p])), [pos])
  const quoteById = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes])
  const billById = useMemo(() => new Map(bills.map((b) => [b.id, b])), [bills])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return advances.filter((a) => {
      const st = advanceStatus(a, apps)
      if (tab === 'Open' && st === 'applied') return false
      if (tab === 'Applied' && st !== 'applied') return false
      if (!s) return true
      const po = poById.get(a.client_po_id)
      return [a.vendor_name, a.quote_reference, a.reference, a.notes, po?.po_number || '', po ? clientPoPartyName(po) : '']
        .join(' ')
        .toLowerCase()
        .includes(s)
    })
  }, [advances, apps, tab, search, poById])

  const totals = useMemo(() => {
    const month = format(new Date(), 'yyyy-MM')
    return {
      open: advances.reduce((s, a) => s + advanceOpenBalance(a, apps), 0),
      openCount: advances.filter((a) => advanceOpenBalance(a, apps) > 0).length,
      paidThisMonth: advances.filter((a) => a.paid_on.startsWith(month)).reduce((s, a) => s + Number(a.amount), 0),
      paidAll: advances.reduce((s, a) => s + Number(a.amount), 0),
    }
  }, [advances, apps])

  /** POs with advances, and what the job earns once supplier money is taken off. */
  const poMargins = useMemo(() => {
    const ids = [...new Set(advances.map((a) => a.client_po_id))]
    return ids
      .map((id) => poById.get(id))
      .filter((p): p is ClientPurchaseOrder => Boolean(p))
      .map((p) => ({ po: p, cost: poSupplierCost(p, advances, apps, bills) }))
  }, [advances, apps, bills, poById])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setEditorOpen(true)
  }

  function openEdit(a: SupplierAdvance) {
    setEditing(a)
    setForm({
      vendor_id: a.vendor_id || '',
      vendor_name: a.vendor_name,
      client_po_id: a.client_po_id,
      quotation_id: a.quotation_id || '',
      paid_on: a.paid_on,
      amount: String(a.amount),
      payment_method: a.payment_method,
      reference: a.reference,
      notes: a.notes,
    })
    setEditorOpen(true)
  }

  function pickPo(id: string) {
    const po = poById.get(id)
    setForm((f) => ({ ...f, client_po_id: id, quotation_id: po?.quotation_id || f.quotation_id }))
  }

  function pickVendor(name: string) {
    const v = vendors.find((x) => x.company_name.trim().toLowerCase() === name.trim().toLowerCase())
    setForm((f) => ({ ...f, vendor_name: name, vendor_id: v?.id || '' }))
  }

  async function save() {
    const po = poById.get(form.client_po_id)
    const parsed = parseAdvanceForm(form, {
      poHasQuote: Boolean(po?.quotation_id),
      applied: editing ? appliedToAdvance(editing.id, apps) : 0,
    })
    if ('error' in parsed) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      await saveSupplierAdvance(editing?.id || null, parsed.row)
      showToast(editing ? 'Advance updated' : 'Advance recorded', 'success')
      setEditorOpen(false)
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save the advance'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(a: SupplierAdvance) {
    if (!window.confirm(`Remove the advance of ${formatAED(a.amount)} to ${a.vendor_name}? Bills it was applied to stay as they are.`)) return
    try {
      await deleteSupplierAdvance(a.id)
      showToast('Advance removed', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not remove the advance'), 'error')
    }
  }

  function openApply(a: SupplierAdvance) {
    setApplyFor(a)
    const first = billsForAdvance(a, bills, apps)[0]
    setApplyBillId(first?.id || '')
    setApplyAmount(first ? String(maxApplicable(a, first, apps)) : '')
  }

  function pickBill(id: string) {
    setApplyBillId(id)
    const b = billById.get(id)
    if (applyFor && b) setApplyAmount(String(maxApplicable(applyFor, b, apps)))
  }

  async function apply() {
    if (!applyFor || !applyBillId) return
    const amount = round2(Number(String(applyAmount).replace(/,/g, '')))
    const b = billById.get(applyBillId)
    const max = b ? maxApplicable(applyFor, b, apps) : 0
    if (!(amount > 0) || amount > max) {
      showToast(`Enter an amount between 0 and ${formatAED(max)}`, 'error')
      return
    }
    try {
      await applyAdvanceToBill(applyFor.id, applyBillId, amount, today())
      showToast('Advance applied to the bill', 'success')
      setApplyFor(null)
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not apply the advance'), 'error')
    }
  }

  async function unapply(appId: string) {
    try {
      await unapplyAdvance(appId)
      showToast('Taken off the bill', 'success')
      setApplyFor(null)
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not take it off the bill'), 'error')
    }
  }

  const selectedPo = poById.get(form.client_po_id)
  const applyBills = applyFor ? billsForAdvance(applyFor, bills, apps) : []
  const applyDone = applyFor ? apps.filter((x) => x.advance_id === applyFor.id) : []

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Finance · money out</p>
          <h1 className={docsStyles.title}>Supplier advances</h1>
          <p className={docsStyles.subtitle}>
            Money paid to a vendor before their bill arrives. Each advance belongs to a client PO and its quotation.
            When the bill comes in, apply the advance to it. Until then the open amount counts as money out on the day
            it was paid, so profit on the job and in Reports stays right.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!filtered.length}
            onClick={() =>
              exportListCsv(
                'supplier-advances.csv',
                ['paid_on', 'vendor', 'client_po', 'client', 'quote', 'amount', 'applied', 'open', 'status', 'method', 'reference', 'notes'],
                filtered.map((a) => {
                  const po = poById.get(a.client_po_id)
                  return {
                    paid_on: a.paid_on,
                    vendor: a.vendor_name,
                    client_po: po?.po_number || '',
                    client: po ? clientPoPartyName(po) : '',
                    quote: a.quote_reference,
                    amount: a.amount,
                    applied: appliedToAdvance(a.id, apps),
                    open: advanceOpenBalance(a, apps),
                    status: advanceStatusLabel(advanceStatus(a, apps)),
                    method: a.payment_method,
                    reference: a.reference,
                    notes: a.notes,
                  }
                }),
              )
            }
          >
            Export CSV
          </button>
          {canWrite && ready ? (
            <button type="button" className={docsStyles.newBtn} onClick={openCreate}>
              <Plus size={16} /> New advance
            </button>
          ) : null}
        </div>
      </header>

      {!loading && !ready ? (
        <div className={docsStyles.empty}>
          <EmptyState
            icon={<HandCoins size={22} />}
            title="Supplier advances are not set up yet"
            subtitle="Run supplier-advances.sql in Supabase (SQL editor) once, then reload this page."
          />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Kpi label="Open advances" value={formatAED(totals.open)} sub={`${totals.openCount} waiting for a bill`} />
            <Kpi label="Paid this month" value={formatAED(totals.paidThisMonth)} />
            <Kpi label="Paid in all" value={formatAED(totals.paidAll)} sub={`${advances.length} advances`} />
          </div>

          <div className={docsStyles.controls}>
            <div className={docsStyles.tabs} role="tablist" aria-label="Advance status">
              {STATUS_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? docsStyles.tabActive : docsStyles.tab}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              className={docsStyles.search}
              placeholder="Search vendor / PO / quote / reference…"
              aria-label="Search supplier advances"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className={docsStyles.loading}>Loading supplier advances…</div>
          ) : filtered.length === 0 ? (
            <div className={docsStyles.empty}>
              <EmptyState
                icon={<HandCoins size={22} />}
                title="No supplier advances"
                subtitle={advances.length ? 'Nothing matches these filters.' : 'Record the first advance paid to a vendor.'}
                actionLabel={canWrite ? 'New advance' : undefined}
                onAction={canWrite ? openCreate : undefined}
              />
            </div>
          ) : (
            <div className={docsStyles.tableShell}>
              <div className={docsStyles.tableWrap}>
                <table className={docsStyles.table}>
                  <thead>
                    <tr>
                      <th className={docsStyles.colDate}>Paid</th>
                      <th className={docsStyles.colClient}>Vendor</th>
                      <th className={docsStyles.colRef}>Client PO · quote</th>
                      <th className={docsStyles.colAmount}>Amount</th>
                      <th className={docsStyles.colAmount}>Open</th>
                      <th className={docsStyles.colStatus}>Status</th>
                      <th className={docsStyles.colActions} style={{ textAlign: 'right' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => {
                      const po = poById.get(a.client_po_id)
                      const st = advanceStatus(a, apps)
                      const open = advanceOpenBalance(a, apps)
                      const appliedBills = apps
                        .filter((x) => x.advance_id === a.id)
                        .map((x) => billById.get(x.expense_id)?.supplier_invoice_no || 'bill')
                      return (
                        <tr key={a.id}>
                          <td className={docsStyles.colDate}>{shortDate(a.paid_on)}</td>
                          <td className={`${docsStyles.colClient} ${docsStyles.clientCell}`}>
                            {a.vendor_name}
                            {a.payment_method || a.reference ? (
                              <div className={docsStyles.meta}>{[a.payment_method, a.reference].filter(Boolean).join(' · ')}</div>
                            ) : null}
                            {a.notes ? <div className={docsStyles.meta}>{a.notes}</div> : null}
                          </td>
                          <td className={docsStyles.colRef}>
                            <div className={docsStyles.ref}>{po ? `PO ${po.po_number}` : 'Client PO'}</div>
                            {po ? <div className={docsStyles.meta}>{clientPoPartyName(po)}</div> : null}
                            <div className={docsStyles.meta}>Quote {a.quote_reference || '—'}</div>
                          </td>
                          <td className={`${docsStyles.colAmount} ${docsStyles.amount}`}>{formatAED(a.amount)}</td>
                          <td className={docsStyles.colAmount}>
                            {formatAED(open)}
                            {appliedBills.length ? (
                              <div className={docsStyles.meta}>On {appliedBills.join(', ')}</div>
                            ) : null}
                          </td>
                          <td className={docsStyles.colStatus}>
                            <StatusPill status={advanceStatusLabel(st)} />
                          </td>
                          <td className={`${docsStyles.colActions} ${docsStyles.actionsCell}`}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {canWrite ? (
                                <button type="button" style={smallBtn} onClick={() => openApply(a)}>
                                  {open > 0 ? 'Apply to bill' : 'Bills'}
                                </button>
                              ) : null}
                              {canWrite ? (
                                <button type="button" style={smallBtn} onClick={() => openEdit(a)}>
                                  Edit
                                </button>
                              ) : null}
                              {canRemove ? (
                                <button type="button" style={{ ...smallBtn, color: colors.danger }} onClick={() => void remove(a)}>
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {seesProfit && poMargins.length ? (
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Margin by client PO</h2>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
                PO value before VAT, less supplier bills on the PO's quote and advances not yet on a bill. An advance
                that has been applied is counted through its bill, never twice.
              </p>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Client PO</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>PO value (ex VAT)</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Supplier bills</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Open advances</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poMargins.map(({ po, cost }) => (
                      <tr key={po.id}>
                        <td style={tdStyle}>
                          PO {po.po_number}
                          <div style={{ fontSize: 12, color: colors.muted }}>
                            {clientPoPartyName(po)}
                            {po.quote_reference ? ` · ${po.quote_reference}` : ''}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatAED(cost.revenue)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatAED(cost.bills)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatAED(cost.advancesOpen)}</td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 700,
                            color: cost.margin < 0 ? colors.danger : undefined,
                          }}
                        >
                          {formatAED(cost.margin)}
                          {cost.revenue > 0 ? (
                            <div style={{ fontSize: 12, color: colors.muted, fontWeight: 400 }}>
                              {marginPct(cost.margin, cost.revenue)}%
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Modal open={editorOpen} title={editing ? 'Edit supplier advance' : 'New supplier advance'} onClose={() => setEditorOpen(false)} width={640}>
        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="adv-vendor">Vendor</label>
            <input
              id="adv-vendor"
              style={inputStyle}
              list="adv-vendor-list"
              value={form.vendor_name}
              onChange={(e) => pickVendor(e.target.value)}
              placeholder="Pick from Vendors or type a name"
            />
            <datalist id="adv-vendor-list">
              {vendors.map((v) => (
                <option key={v.id} value={v.company_name} />
              ))}
            </datalist>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="adv-po">Client PO</label>
            <select id="adv-po" style={inputStyle} value={form.client_po_id} onChange={(e) => pickPo(e.target.value)}>
              <option value="">Pick the client PO…</option>
              {pos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.po_number} · {clientPoPartyName(p)}
                  {p.quote_reference ? ` · ${p.quote_reference}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="adv-quote">Quotation</label>
            <select
              id="adv-quote"
              style={inputStyle}
              value={form.quotation_id}
              onChange={(e) => setForm((f) => ({ ...f, quotation_id: e.target.value }))}
            >
              <option value="">{selectedPo?.quotation_id ? 'Same as the client PO' : 'Pick the quotation…'}</option>
              {form.quotation_id && !quoteById.has(form.quotation_id) ? (
                <option value={form.quotation_id}>{editing?.quote_reference || 'Linked quote'}</option>
              ) : null}
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {quoteLabel(q)}
                </option>
              ))}
            </select>
            {selectedPo && !selectedPo.quotation_id ? (
              <span style={{ fontSize: 12, color: colors.muted }}>This PO is not linked to a quote yet, so pick one here.</span>
            ) : null}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="adv-date">Date paid</label>
            <input
              id="adv-date"
              type="date"
              style={inputStyle}
              value={form.paid_on}
              onChange={(e) => setForm((f) => ({ ...f, paid_on: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="adv-amount">Amount paid (AED)</label>
            <input
              id="adv-amount"
              inputMode="decimal"
              style={inputStyle}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="adv-method">Paid by</label>
            <select
              id="adv-method"
              style={inputStyle}
              value={form.payment_method}
              onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
            >
              {['Bank transfer', 'Cheque', 'Card', 'Cash', 'Other'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="adv-ref">Bank / cheque reference</label>
            <input
              id="adv-ref"
              style={inputStyle}
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle} htmlFor="adv-notes">Notes</label>
            <textarea
              id="adv-notes"
              style={{ ...inputStyle, minHeight: 64 }}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setEditorOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Record advance'}
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(applyFor)}
        title={applyFor ? `Apply advance · ${applyFor.vendor_name}` : 'Apply advance'}
        onClose={() => setApplyFor(null)}
        width={620}
      >
        {applyFor ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
              Paid {formatAED(applyFor.amount)} on {shortDate(applyFor.paid_on)}. Open: {formatAED(advanceOpenBalance(applyFor, apps))}.
              Bills come from Expenses with the same vendor name.
            </p>
            {applyDone.length ? (
              <div>
                <div style={labelStyle}>Already applied</div>
                {applyDone.map((x) => {
                  const b = billById.get(x.expense_id)
                  return (
                    <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', fontSize: 13 }}>
                      <span>
                        {formatAED(x.amount)} on {b?.supplier_invoice_no || 'bill'} · {shortDate(b?.date)}
                        {b?.quote_ref ? ` · ${b.quote_ref}` : ''}
                      </span>
                      {canRemove ? (
                        <button type="button" style={{ ...smallBtn, color: colors.danger }} onClick={() => void unapply(x.id)}>
                          Take off
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
            {advanceOpenBalance(applyFor, apps) > 0 ? (
              applyBills.length ? (
                <>
                  <div style={fieldStyle}>
                    <label style={labelStyle} htmlFor="apply-bill">Vendor bill</label>
                    <select id="apply-bill" style={inputStyle} value={applyBillId} onChange={(e) => pickBill(e.target.value)}>
                      {applyBills.map((b) => (
                        <option key={b.id} value={b.id}>
                          {shortDate(b.date)} · {b.supplier_invoice_no || b.category || 'bill'} · {formatAED(b.amount)}
                          {b.quote_ref ? ` · ${b.quote_ref}` : ''} · {formatAED(b.left)} left
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle} htmlFor="apply-amount">Amount to apply (AED)</label>
                    <input
                      id="apply-amount"
                      inputMode="decimal"
                      style={inputStyle}
                      value={applyAmount}
                      onChange={(e) => setApplyAmount(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => setApplyFor(null)}>
                      Close
                    </button>
                    <button type="button" style={buttonPrimaryStyle} disabled={!applyBillId} onClick={() => void apply()}>
                      Apply
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13 }}>
                  No open bill from {applyFor.vendor_name} yet. Add the bill under Expenses (same vendor name), then come
                  back and apply this advance.
                </p>
              )
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" style={buttonSecondaryStyle} onClick={() => setApplyFor(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div style={{ fontSize: 12, color: colors.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{sub}</div> : null}
    </div>
  )
}
