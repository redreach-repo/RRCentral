import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Banknote, Plus, RefreshCw } from 'lucide-react'
import { db } from '../lib/db'
import {
  BASE_CURRENCY,
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
  formatMoneyAmount,
  toBaseAmount,
} from '../lib/currency'
import { PAYMENT_STATUSES, PAYMENT_TYPES, buildBookingMoneySnapshot } from '../lib/bookingMoney'
import {
  approveFxRate,
  loadPaymentsForBooking,
  loadRefundsForBooking,
  loadSuppliersForBooking,
  saveCustomerPayment,
  saveCustomerRefund,
  saveSupplierCommitment,
} from '../lib/customerPayments'
import type { CustomerPayment, CustomerRefund, Quotation, SupplierCommitment } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import StatusPill from '../components/StatusPill'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
  sectionTitleStyle,
} from '../lib/uiStyles'
import { PAYMENT_METHODS } from '../lib/config'

type PayForm = {
  booking_id: string
  quote_ref: string
  invoice_ref: string
  client: string
  payment_date: string
  amount_received: number
  currency: string
  fx_rate: number
  fx_rate_date: string
  payment_method: string
  bank_provider: string
  processing_fee: number
  conversion_fee: number
  payment_type: string
  transaction_ref: string
  proof_url: string
  status: string
  notes: string
}

const emptyPay = (q?: Quotation | null): PayForm => ({
  booking_id: q?.id || '',
  quote_ref: q?.reference_number || q?.quote_id || '',
  invoice_ref: '',
  client: q?.client || '',
  payment_date: format(new Date(), 'yyyy-MM-dd'),
  amount_received: 0,
  currency: q?.payment_currency || q?.quotation_currency || BASE_CURRENCY,
  fx_rate: Number(q?.fx_rate) || 1,
  fx_rate_date: format(new Date(), 'yyyy-MM-dd'),
  payment_method: PAYMENT_METHODS[0],
  bank_provider: '',
  processing_fee: 0,
  conversion_fee: 0,
  payment_type: 'Deposit',
  transaction_ref: '',
  proof_url: '',
  status: 'Received',
  notes: '',
})

export default function PaymentsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [payments, setPayments] = useState<CustomerPayment[]>([])
  const [refunds, setRefunds] = useState<CustomerRefund[]>([])
  const [suppliers, setSuppliers] = useState<SupplierCommitment[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [form, setForm] = useState<PayForm>(emptyPay())
  const [refundPayment, setRefundPayment] = useState<CustomerPayment | null>(null)
  const [refundAmount, setRefundAmount] = useState(0)
  const [refundReason, setRefundReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [supplierForm, setSupplierForm] = useState({
    supplier_name: '',
    description: '',
    amount: 0,
    currency: BASE_CURRENCY,
    fx_rate: 1,
    fx_rate_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: '',
    notes: '',
  })
  const [requestForm, setRequestForm] = useState({
    currency: BASE_CURRENCY,
    fx_rate: 1,
    fx_rate_date: format(new Date(), 'yyyy-MM-dd'),
    instructions: '',
  })
  const [requestText, setRequestText] = useState('')

  const loadQuotes = useCallback(async () => {
    const { data, error } = await db
      .from('quotations')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    setQuotes((data || []) as Quotation[])
  }, [])

  const selected = useMemo(
    () => quotes.find((q) => q.id === selectedId) || null,
    [quotes, selectedId],
  )

  const loadLedger = useCallback(async (bookingId: string) => {
    if (!bookingId) {
      setPayments([])
      setRefunds([])
      setSuppliers([])
      return
    }
    const [p, r, s] = await Promise.all([
      loadPaymentsForBooking(bookingId),
      loadRefundsForBooking(bookingId),
      loadSuppliersForBooking(bookingId),
    ])
    setPayments(p)
    setRefunds(r)
    setSuppliers(s)
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        await loadQuotes()
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to load bookings', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [loadQuotes, showToast])

  useEffect(() => {
    void loadLedger(selectedId)
  }, [selectedId, loadLedger])

  const snapshot = useMemo(() => {
    if (!selected) return null
    return buildBookingMoneySnapshot({
      quote: selected,
      payments,
      refunds,
      suppliers,
    })
  }, [selected, payments, refunds, suppliers])

  async function savePayment() {
    if (!selected) return
    if (!form.amount_received) {
      showToast('Enter amount received', 'error')
      return
    }
    setSaving(true)
    try {
      await approveFxRate({
        from: form.currency,
        rate: form.fx_rate,
        rateDate: form.fx_rate_date,
        approvedBy: user?.email || '',
        notes: `Payment ${form.payment_type} · ${form.quote_ref}`,
      })
      await saveCustomerPayment({
        ...form,
        booking_id: selected.id,
        quote_ref: selected.reference_number || selected.quote_id,
        invoice_ref: form.invoice_ref || '',
        client: selected.client,
        created_by: user?.email || '',
        fx_rate_approved_by: user?.email || '',
      })
      showToast('Payment recorded (original currency preserved)', 'success')
      setPayOpen(false)
      await loadLedger(selected.id)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveRefund() {
    if (!refundPayment || !selected) return
    setSaving(true)
    try {
      const rate = Number(refundPayment.fx_rate) || 1
      const base = toBaseAmount(refundAmount, rate)
      await saveCustomerRefund({
        payment_id: refundPayment.id,
        booking_id: selected.id,
        quote_ref: selected.reference_number || selected.quote_id,
        client: selected.client,
        refund_date: format(new Date(), 'yyyy-MM-dd'),
        original_currency: refundPayment.currency,
        original_amount_received: refundPayment.amount_received,
        refund_currency: refundPayment.currency,
        amount_refunded: refundAmount,
        fx_rate: rate,
        fx_rate_date: format(new Date(), 'yyyy-MM-dd'),
        conversion_fee: 0,
        bank_fee: 0,
        base_amount: base,
        fx_gain_loss: 0,
        reason: refundReason,
        approved_by: user?.email || '',
        approved_at: new Date().toISOString(),
        status: 'Refunded',
        notes: '',
        created_by: user?.email || '',
      })
      showToast('Refund recorded', 'success')
      setRefundOpen(false)
      setRefundPayment(null)
      await loadLedger(selected.id)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Refund failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveSupplier() {
    if (!selected) return
    if (!supplierForm.amount || !supplierForm.supplier_name) {
      showToast('Supplier name and amount required', 'error')
      return
    }
    setSaving(true)
    try {
      await approveFxRate({
        from: supplierForm.currency,
        rate: supplierForm.fx_rate,
        rateDate: supplierForm.fx_rate_date,
        approvedBy: user?.email || '',
        notes: `Supplier ${supplierForm.supplier_name} · ${selected.reference_number || selected.quote_id}`,
      })
      await saveSupplierCommitment({
        booking_id: selected.id,
        quote_ref: selected.reference_number || selected.quote_id,
        supplier_name: supplierForm.supplier_name,
        description: supplierForm.description,
        amount: supplierForm.amount,
        currency: supplierForm.currency,
        fx_rate: supplierForm.fx_rate,
        fx_rate_date: supplierForm.fx_rate_date,
        status: 'Open',
        due_date: supplierForm.due_date || null,
        notes: supplierForm.notes,
      })
      showToast('Supplier commitment saved (original currency preserved)', 'success')
      setSupplierOpen(false)
      await loadLedger(selected.id)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Supplier save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  function buildPaymentRequest() {
    if (!selected) return
    const quoteCur = (selected.quotation_currency || selected.currency || BASE_CURRENCY).toUpperCase()
    const quoteAmt = Number(selected.amount) || 0
    const quoteRate = Number(selected.fx_rate) || 1
    const payRate = Number(requestForm.fx_rate) || 1
    // Convert quote → base → request currency without mutating the approved quotation
    const base = Number(selected.base_amount) || toBaseAmount(quoteAmt, quoteRate)
    const requestAmt =
      requestForm.currency.toUpperCase() === quoteCur
        ? quoteAmt
        : payRate > 0
          ? Math.round((base / payRate) * 100) / 100
          : 0
    const text = [
      `PAYMENT REQUEST (does not amend quotation ${selected.reference_number || selected.quote_id})`,
      `Client: ${selected.client}`,
      `Approved quotation: ${formatMoneyAmount(quoteAmt, quoteCur)}`,
      `Request currency: ${requestForm.currency}`,
      `Approved FX for this request: 1 ${requestForm.currency} = ${payRate} ${BASE_CURRENCY} (as of ${requestForm.fx_rate_date})`,
      `Amount to receive: ${formatMoneyAmount(requestAmt, requestForm.currency)}`,
      `Net amount required by RR Wanders: ${selected.net_amount_required || formatMoneyAmount(requestAmt, requestForm.currency)}`,
      `Charges borne by: ${selected.charges_borne_by || 'Customer'}`,
      selected.rate_valid_until ? `Rate valid until: ${selected.rate_valid_until}` : '',
      '',
      requestForm.instructions || selected.payment_instructions || 'Please transfer the amount above and send proof of payment.',
    ]
      .filter(Boolean)
      .join('\n')
    setRequestText(text)
  }

  const wandersQuotes = quotes.filter(
    (q) => q.division_code === '02' || (q.vertical || '').toLowerCase().includes('wander'),
  )
  const list = wandersQuotes.length ? wandersQuotes : quotes

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Multi-currency payments</h1>
          <p style={pageSubtitleStyle}>
            RR Wanders bookings — quotation, payment and supplier currencies may all differ. Original
            FC amounts are never overwritten.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={!selected}
            onClick={() => {
              setRequestForm({
                currency: selected?.payment_currency || selected?.quotation_currency || BASE_CURRENCY,
                fx_rate: Number(selected?.fx_rate) || 1,
                fx_rate_date: format(new Date(), 'yyyy-MM-dd'),
                instructions: selected?.payment_instructions || '',
              })
              setRequestText('')
              setRequestOpen(true)
            }}
          >
            Payment request
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={!selected}
            onClick={() => {
              setSupplierForm({
                supplier_name: '',
                description: '',
                amount: 0,
                currency: selected?.supplier_currency || BASE_CURRENCY,
                fx_rate: 1,
                fx_rate_date: format(new Date(), 'yyyy-MM-dd'),
                due_date: '',
                notes: '',
              })
              setSupplierOpen(true)
            }}
          >
            Add supplier
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={!selected}
            onClick={() => {
              setForm(emptyPay(selected))
              setPayOpen(true)
            }}
          >
            <Plus size={16} /> Record payment
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <label style={labelStyle}>Booking / quotation</label>
        <select
          style={selectStyle}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Select booking…</option>
          {list.map((q) => (
            <option key={q.id} value={q.id}>
              {(q.reference_number || 'DRAFT')} · {q.client} ·{' '}
              {q.quotation_currency || q.currency || 'AED'}{' '}
              {Number(q.amount || 0).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading…</div>
      ) : !selected ? (
        <EmptyState
          icon={<Banknote size={22} />}
          title="Select a booking"
          subtitle="Choose a quotation to view multi-currency balances and payments."
        />
      ) : (
        <>
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  <Link
                    to={`/quotations?ref=${encodeURIComponent(selected.reference_number || '')}`}
                    style={{ color: colors.accent, textDecoration: 'none' }}
                  >
                    {selected.reference_number || selected.quote_id}
                  </Link>{' '}
                  · {selected.client}
                </div>
                <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                  Quote {selected.quotation_currency || 'AED'} · Pay{' '}
                  {selected.payment_currency || '—'} · Supplier{' '}
                  {selected.supplier_currency || '—'} · Booking{' '}
                  {selected.booking_currency || BASE_CURRENCY}
                  {selected.fx_rate ? ` · Rate ${selected.fx_rate}` : ''}
                  {selected.rate_valid_until ? ` · Rate valid until ${selected.rate_valid_until}` : ''}
                </div>
              </div>
              <StatusPill status={selected.status} />
            </div>
          </div>

          {snapshot ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 10,
                marginBottom: 16,
              }}
            >
              <Kpi
                label={`Invoiced (${snapshot.quotationCurrency})`}
                value={formatMoneyAmount(snapshot.invoicedQuoteCurrency, snapshot.quotationCurrency)}
              />
              <Kpi
                label="Received (AED)"
                value={formatMoneyAmount(snapshot.receivedBase, BASE_CURRENCY)}
              />
              <Kpi
                label={`Balance (${snapshot.quotationCurrency})`}
                value={formatMoneyAmount(
                  snapshot.customerBalanceQuoteCurrency,
                  snapshot.quotationCurrency,
                )}
              />
              <Kpi
                label="FX gain / loss (AED)"
                value={formatMoneyAmount(snapshot.fxGainLoss, BASE_CURRENCY)}
              />
              <Kpi
                label="Conversion fees"
                value={String(snapshot.conversionFees)}
              />
              <Kpi
                label="Est. GP (AED)"
                value={formatMoneyAmount(snapshot.estimatedGrossProfitBase, BASE_CURRENCY)}
              />
              <Kpi
                label="Actual GP (AED)"
                value={formatMoneyAmount(snapshot.actualGrossProfitBase, BASE_CURRENCY)}
              />
            </div>
          ) : null}

          {snapshot && Object.keys(snapshot.paidByCurrency).length > 0 ? (
            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <h2 style={sectionTitleStyle}>Paid by currency (not cross-added)</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(snapshot.paidByCurrency).map(([c, amt]) => (
                  <div key={c} style={{ fontSize: 14 }}>
                    <strong>{formatMoneyAmount(amt, c)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Customer payments</h2>
            </div>
            {payments.length === 0 ? (
              <div style={{ padding: 16, color: colors.muted }}>No payments yet.</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Received</th>
                      <th style={thStyle}>Rate</th>
                      <th style={thStyle}>AED equiv.</th>
                      <th style={thStyle}>Net</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Ref</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td style={tdStyle}>{p.payment_date || '—'}</td>
                        <td style={tdStyle}>{p.payment_type}</td>
                        <td style={tdStyle}>
                          {formatMoneyAmount(p.amount_received, p.currency)}
                        </td>
                        <td style={tdStyle}>{p.fx_rate}</td>
                        <td style={tdStyle}>
                          {formatMoneyAmount(p.base_amount, BASE_CURRENCY)}
                        </td>
                        <td style={tdStyle}>
                          {formatMoneyAmount(p.net_amount, p.currency)}
                        </td>
                        <td style={tdStyle}>
                          <StatusPill status={p.status} />
                        </td>
                        <td style={tdStyle}>{p.transaction_ref || '—'}</td>
                        <td style={tdStyle}>
                          <button
                            type="button"
                            style={buttonSecondaryStyle}
                            onClick={() => {
                              setRefundPayment(p)
                              setRefundAmount(p.net_amount || p.amount_received)
                              setRefundReason('')
                              setRefundOpen(true)
                            }}
                          >
                            Refund
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {refunds.length > 0 ? (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Refunds</h2>
              </div>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Original</th>
                      <th style={thStyle}>Refunded</th>
                      <th style={thStyle}>AED</th>
                      <th style={thStyle}>Reason</th>
                      <th style={thStyle}>Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.refund_date || '—'}</td>
                        <td style={tdStyle}>
                          {formatMoneyAmount(r.original_amount_received, r.original_currency)}
                        </td>
                        <td style={tdStyle}>
                          {formatMoneyAmount(r.amount_refunded, r.refund_currency)}
                        </td>
                        <td style={tdStyle}>
                          {formatMoneyAmount(r.base_amount, BASE_CURRENCY)}
                        </td>
                        <td style={tdStyle}>{r.reason || '—'}</td>
                        <td style={tdStyle}>{r.approved_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Supplier commitments</h2>
            </div>
            {suppliers.length === 0 ? (
              <div style={{ padding: 16, color: colors.muted }}>No supplier commitments yet.</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Supplier</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Rate</th>
                      <th style={thStyle}>AED equiv.</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr key={s.id}>
                        <td style={tdStyle}>{s.supplier_name}</td>
                        <td style={tdStyle}>{s.description || '—'}</td>
                        <td style={tdStyle}>{formatMoneyAmount(s.amount, s.currency)}</td>
                        <td style={tdStyle}>{s.fx_rate}</td>
                        <td style={tdStyle}>{formatMoneyAmount(s.base_amount, BASE_CURRENCY)}</td>
                        <td style={tdStyle}>
                          <StatusPill status={s.status} />
                        </td>
                        <td style={tdStyle}>{s.due_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {snapshot && Object.keys(snapshot.supplierByCurrency).length > 0 ? (
              <div style={{ padding: 12, borderTop: `1px solid ${colors.border}`, fontSize: 13 }}>
                By currency:{' '}
                {Object.entries(snapshot.supplierByCurrency)
                  .map(([c, a]) => formatMoneyAmount(a, c))
                  .join(' · ')}{' '}
                · Total AED {formatMoneyAmount(snapshot.supplierBase, BASE_CURRENCY)}
              </div>
            ) : null}
          </div>
        </>
      )}

      <Modal open={payOpen} title="Record customer payment" onClose={() => setPayOpen(false)} width={640}>
        <div style={formGridStyle}>
          <Field label="Payment date">
            <input
              type="date"
              style={inputStyle}
              value={form.payment_date}
              onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
            />
          </Field>
          <Field label="Type">
            <select
              style={selectStyle}
              value={form.payment_type}
              onChange={(e) => setForm((f) => ({ ...f, payment_type: e.target.value }))}
            >
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount received (original currency)">
            <input
              type="number"
              style={inputStyle}
              value={form.amount_received}
              onChange={(e) => setForm((f) => ({ ...f, amount_received: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Currency received">
            <select
              style={selectStyle}
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} — {CURRENCY_LABELS[c]}
                </option>
              ))}
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="FX rate (1 unit → AED)">
            <input
              type="number"
              step="0.0001"
              style={inputStyle}
              value={form.fx_rate}
              onChange={(e) => setForm((f) => ({ ...f, fx_rate: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Rate date">
            <input
              type="date"
              style={inputStyle}
              value={form.fx_rate_date}
              onChange={(e) => setForm((f) => ({ ...f, fx_rate_date: e.target.value }))}
            />
          </Field>
          <Field label="Processing fee">
            <input
              type="number"
              style={inputStyle}
              value={form.processing_fee}
              onChange={(e) => setForm((f) => ({ ...f, processing_fee: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Conversion fee">
            <input
              type="number"
              style={inputStyle}
              value={form.conversion_fee}
              onChange={(e) => setForm((f) => ({ ...f, conversion_fee: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Payment method">
            <select
              style={selectStyle}
              value={form.payment_method}
              onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bank / provider">
            <input
              style={inputStyle}
              value={form.bank_provider}
              onChange={(e) => setForm((f) => ({ ...f, bank_provider: e.target.value }))}
            />
          </Field>
          <Field label="Transaction ref">
            <input
              style={inputStyle}
              value={form.transaction_ref}
              onChange={(e) => setForm((f) => ({ ...f, transaction_ref: e.target.value }))}
            />
          </Field>
          <Field label="Status">
            <select
              style={selectStyle}
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Proof URL">
            <input
              style={inputStyle}
              value={form.proof_url}
              onChange={(e) => setForm((f) => ({ ...f, proof_url: e.target.value }))}
              placeholder="https://… or attachment path"
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Field>
        <p style={{ fontSize: 12, color: colors.muted2 }}>
          AED equivalent (net):{' '}
          {formatMoneyAmount(
            toBaseAmount(
              form.amount_received - form.processing_fee - form.conversion_fee,
              form.fx_rate,
            ),
            BASE_CURRENCY,
          )}
          . Rate will be logged with your approval.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setPayOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void savePayment()}>
            <RefreshCw size={14} /> Save payment
          </button>
        </div>
      </Modal>

      <Modal open={refundOpen} title="Record refund" onClose={() => setRefundOpen(false)} width={480}>
        <p style={{ fontSize: 13, color: colors.muted }}>
          Original:{' '}
          {refundPayment
            ? formatMoneyAmount(refundPayment.amount_received, refundPayment.currency)
            : '—'}
        </p>
        <Field label="Amount refunded (same currency)">
          <input
            type="number"
            style={inputStyle}
            value={refundAmount}
            onChange={(e) => setRefundAmount(Number(e.target.value))}
          />
        </Field>
        <Field label="Reason">
          <input
            style={inputStyle}
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setRefundOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void saveRefund()}>
            Save refund
          </button>
        </div>
      </Modal>

      <Modal open={supplierOpen} title="Supplier commitment" onClose={() => setSupplierOpen(false)} width={560}>
        <div style={formGridStyle}>
          <Field label="Supplier">
            <input
              style={inputStyle}
              value={supplierForm.supplier_name}
              onChange={(e) => setSupplierForm((f) => ({ ...f, supplier_name: e.target.value }))}
            />
          </Field>
          <Field label="Description">
            <input
              style={inputStyle}
              value={supplierForm.description}
              onChange={(e) => setSupplierForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label="Amount (original currency)">
            <input
              type="number"
              style={inputStyle}
              value={supplierForm.amount}
              onChange={(e) => setSupplierForm((f) => ({ ...f, amount: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Currency">
            <select
              style={selectStyle}
              value={supplierForm.currency}
              onChange={(e) => setSupplierForm((f) => ({ ...f, currency: e.target.value }))}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="FX rate (1 → AED)">
            <input
              type="number"
              step="0.0001"
              style={inputStyle}
              value={supplierForm.fx_rate}
              onChange={(e) => setSupplierForm((f) => ({ ...f, fx_rate: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Rate date">
            <input
              type="date"
              style={inputStyle}
              value={supplierForm.fx_rate_date}
              onChange={(e) => setSupplierForm((f) => ({ ...f, fx_rate_date: e.target.value }))}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              style={inputStyle}
              value={supplierForm.due_date}
              onChange={(e) => setSupplierForm((f) => ({ ...f, due_date: e.target.value }))}
            />
          </Field>
        </div>
        <p style={{ fontSize: 12, color: colors.muted2 }}>
          AED equivalent:{' '}
          {formatMoneyAmount(toBaseAmount(supplierForm.amount, supplierForm.fx_rate), BASE_CURRENCY)}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setSupplierOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void saveSupplier()}>
            Save supplier
          </button>
        </div>
      </Modal>

      <Modal
        open={requestOpen}
        title="Payment request (alternate currency)"
        onClose={() => setRequestOpen(false)}
        width={600}
      >
        <p style={{ fontSize: 13, color: colors.muted, marginTop: 0 }}>
          Issues a payment request in the customer’s chosen currency without changing the approved
          quotation.
        </p>
        <div style={formGridStyle}>
          <Field label="Request currency">
            <select
              style={selectStyle}
              value={requestForm.currency}
              onChange={(e) => setRequestForm((f) => ({ ...f, currency: e.target.value }))}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Approved FX rate (1 → AED)">
            <input
              type="number"
              step="0.0001"
              style={inputStyle}
              value={requestForm.fx_rate}
              onChange={(e) => setRequestForm((f) => ({ ...f, fx_rate: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Rate date">
            <input
              type="date"
              style={inputStyle}
              value={requestForm.fx_rate_date}
              onChange={(e) => setRequestForm((f) => ({ ...f, fx_rate_date: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Payment instructions">
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={requestForm.instructions}
            onChange={(e) => setRequestForm((f) => ({ ...f, instructions: e.target.value }))}
          />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            style={buttonPrimaryStyle}
            onClick={() => {
              buildPaymentRequest()
              void approveFxRate({
                from: requestForm.currency,
                rate: requestForm.fx_rate,
                rateDate: requestForm.fx_rate_date,
                approvedBy: user?.email || '',
                notes: `Payment request · ${selected?.reference_number || ''}`,
              }).catch(() => undefined)
            }}
          >
            Generate request
          </button>
          {requestText ? (
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(requestText)
                  showToast('Copied to clipboard', 'success')
                } catch {
                  showToast('Copy failed', 'error')
                }
              }}
            >
              Copy
            </button>
          ) : null}
        </div>
        {requestText ? (
          <pre
            style={{
              ...inputStyle,
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              minHeight: 160,
            }}
          >
            {requestText}
          </pre>
        ) : null}
      </Modal>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...cardStyle, padding: 12 }}>
      <div style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}
