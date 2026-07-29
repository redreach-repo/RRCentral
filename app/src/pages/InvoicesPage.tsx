import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Copy, ExternalLink, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { db } from '../lib/db'
import {
  DELIVERY_TERMS,
  DIVISIONS,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_TERMS,
  VAT_RATE,
} from '../lib/config'
import type { Client, Invoice, PaymentLogEntry } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import { logActivity } from '../lib/activity'
import { formatAED } from '../lib/money'
import { generateReference } from '../lib/referenceNumber'
import {
  calcTotals,
  deleteLineItems,
  loadLineItems,
  newDraftLine,
  saveLineItems,
  toDraftItems,
  type DraftLineItem,
} from '../lib/lineItems'
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
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
} from '../lib/uiStyles'

interface InvoiceForm {
  client: string
  vertical: string
  reference_number: string
  description: string
  payment_terms: string
  delivery_terms: string
  moq: string
  notes: string
  date: string
  status: string
  items: DraftLineItem[]
}

const emptyForm = (defaults?: Partial<InvoiceForm>): InvoiceForm => ({
  client: '',
  vertical: DIVISIONS[0].brand,
  reference_number: '',
  description: '',
  payment_terms: '',
  delivery_terms: '',
  moq: '',
  notes: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  status: 'Draft',
  items: [newDraftLine()],
  ...defaults,
})

async function syncIncome(inv: {
  client: string
  vertical: string
  reference_number: string
  date: string | null
  description: string
  payment_status: string
  payment_method?: string
}, totals: { subtotal: number; vat: number; total: number }) {
  if (!inv.reference_number) return
  const row = {
    client_source: inv.client,
    category: inv.vertical,
    reference_number: inv.reference_number,
    date: inv.date,
    description: inv.description,
    bill_amount: totals.subtotal,
    vat: totals.vat,
    total_amount: totals.total,
    status: inv.payment_status === 'Paid' ? 'Paid' : 'Open',
    payment_method: inv.payment_method || '',
    payment_status: inv.payment_status,
  }
  const { data: existing } = await db
    .from('income')
    .select('id')
    .eq('reference_number', inv.reference_number)
    .maybeSingle()
  if (existing?.id) {
    await db.from('income').update(row).eq('id', existing.id)
  } else {
    await db.from('income').insert(row)
  }
}

export default function InvoicesPage() {
  const { user, userRole } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const who = user?.email || ''
  const vatRate = Number(settings.vatRate || VAT_RATE) || VAT_RATE
  const invoicePrefix = settings.invoicePrefix || 'RR'

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [form, setForm] = useState<InvoiceForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [payTarget, setPayTarget] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<string>(PAYMENT_METHODS[0])
  const [payNotes, setPayNotes] = useState('')
  const [payHistory, setPayHistory] = useState<PaymentLogEntry[]>([])
  const [divisionCode, setDivisionCode] = useState('01')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, cRes] = await Promise.all([
        db.from('invoices').select('*').order('created_at', { ascending: false }),
        db.from('clients').select('*').order('company_name'),
      ])
      if (iRes.error) throw iRes.error
      setInvoices((iRes.data || []) as Invoice[])
      setClients((cRes.data || []) as Client[])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load invoices', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(
      (i) =>
        i.client.toLowerCase().includes(q) ||
        i.reference_number.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q),
    )
  }, [invoices, search])

  const totals = useMemo(() => calcTotals(form.items, vatRate), [form.items, vatRate])

  function openCreate() {
    setEditing(null)
    setDivisionCode('01')
    setForm(
      emptyForm({
        payment_terms: settings.paymentTerms || PAYMENT_TERMS[0],
        delivery_terms: settings.deliveryTerms || DELIVERY_TERMS[0],
        moq: settings.moqDefault || '50',
        vertical: DIVISIONS[0].brand,
      }),
    )
    setEditorOpen(true)
  }

  async function openEdit(inv: Invoice) {
    setEditing(inv)
    try {
      const items = await loadLineItems('Invoice', inv.reference_number)
      const div = DIVISIONS.find((d) => d.brand === inv.vertical)
      setDivisionCode(div?.code || '01')
      setForm({
        client: inv.client || '',
        vertical: inv.vertical || '',
        reference_number: inv.reference_number || '',
        description: inv.description || '',
        payment_terms: inv.payment_terms || '',
        delivery_terms: inv.delivery_terms || '',
        moq: inv.moq || '',
        notes: inv.notes || '',
        date: inv.date ? inv.date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
        status: inv.status || 'Draft',
        items: toDraftItems(items),
      })
      setEditorOpen(true)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load line items', 'error')
    }
  }

  function updateItem(key: string, patch: Partial<DraftLineItem>) {
    setForm((f) => ({
      ...f,
      items: f.items.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    }))
  }

  async function saveInvoice(finalize = false) {
    if (!form.client.trim()) {
      showToast('Client is required', 'error')
      return
    }
    setSaving(true)
    try {
      let reference = form.reference_number.trim()
      if (finalize && !reference) {
        const { data: allRefs } = await db.from('invoices').select('reference_number')
        const refs = ((allRefs || []) as { reference_number: string }[]).map((r) => r.reference_number)
        const { data: quoteRefs } = await db.from('quotations').select('reference_number')
        const qrefs = ((quoteRefs || []) as { reference_number: string }[]).map((r) => r.reference_number)
        reference = generateReference(divisionCode, [...refs, ...qrefs], invoicePrefix)
      }
      if (!reference) {
        reference = `INV-DRAFT-${Date.now()}`
      }

      const amount = totals.total
      const vertical =
        DIVISIONS.find((d) => d.code === divisionCode)?.brand || form.vertical
      const status = finalize ? (form.status === 'Draft' ? 'Sent' : form.status) : form.status
      const payment_status = editing?.payment_status || 'Pending'

      const payload = {
        client: form.client.trim(),
        vertical,
        reference_number: reference,
        description: form.description.trim(),
        payment_terms: form.payment_terms,
        delivery_terms: form.delivery_terms,
        moq: form.moq,
        notes: form.notes,
        date: form.date || null,
        amount,
        status,
        payment_status,
        updated_by: who,
        updated_at: new Date().toISOString(),
      }

      if (editing) {
        // If reference changed, migrate line items
        if (editing.reference_number && editing.reference_number !== reference) {
          await deleteLineItems('Invoice', [editing.reference_number])
        }
        const { error } = await db.from('invoices').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('invoices').insert({
          ...payload,
          created_by: who,
        })
        if (error) throw error
      }

      await saveLineItems('Invoice', reference, form.items, vatRate)
      await syncIncome(
        {
          client: payload.client,
          vertical: payload.vertical,
          reference_number: reference,
          date: payload.date,
          description: payload.description,
          payment_status,
          payment_method: settings.paymentMethod || '',
        },
        totals,
      )
      await logActivity('save_invoice', 'invoice', reference, `${payload.client} · ${status}`, who)
      showToast('Invoice saved', 'success')
      setEditorOpen(false)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function openPayment(inv: Invoice) {
    setPayTarget(inv)
    setPayAmount('')
    setPayMethod(settings.paymentMethod || PAYMENT_METHODS[0])
    setPayNotes('')
    const { data } = await db
      .from('payment_log')
      .select('*')
      .eq('invoice_ref', inv.reference_number)
      .order('created_at', { ascending: false })
    setPayHistory((data || []) as PaymentLogEntry[])
    const paid = ((data || []) as PaymentLogEntry[]).reduce((s, p) => s + Number(p.amount || 0), 0)
    const balance = Math.max(0, Number(inv.amount) - paid)
    setPayAmount(String(balance || ''))
  }

  async function recordPayment() {
    if (!payTarget) return
    const amount = Number(payAmount)
    if (!(amount > 0)) {
      showToast('Enter a valid payment amount', 'error')
      return
    }
    setSaving(true)
    try {
      const paidSoFar = payHistory.reduce((s, p) => s + Number(p.amount || 0), 0)
      const newPaid = Math.round((paidSoFar + amount) * 100) / 100
      const balanceAfter = Math.max(0, Math.round((Number(payTarget.amount) - newPaid) * 100) / 100)
      const payment_status = balanceAfter <= 0.009 ? 'Paid' : 'Partial'

      const { error: pErr } = await db.from('payment_log').insert({
        invoice_ref: payTarget.reference_number,
        client: payTarget.client,
        amount,
        method: payMethod,
        notes: payNotes,
        user_email: who,
        balance_after: balanceAfter,
      })
      if (pErr) throw pErr

      const { error } = await db
        .from('invoices')
        .update({
          payment_status,
          updated_by: who,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payTarget.id)
      if (error) throw error

      const items = await loadLineItems('Invoice', payTarget.reference_number)
      const t = calcTotals(toDraftItems(items), vatRate)
      await syncIncome(
        {
          client: payTarget.client,
          vertical: payTarget.vertical,
          reference_number: payTarget.reference_number,
          date: payTarget.date,
          description: payTarget.description,
          payment_status,
          payment_method: payMethod,
        },
        { subtotal: t.subtotal || payTarget.amount / (1 + vatRate), vat: t.vat, total: t.total || payTarget.amount },
      )

      await logActivity(
        'record_payment',
        'invoice',
        payTarget.reference_number,
        `${amount} · ${payment_status} · bal ${balanceAfter}`,
        who,
      )
      showToast(`Payment recorded — ${payment_status}`, 'success')
      setPayTarget(null)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function markPaid(inv: Invoice) {
    if (userRole !== 'admin') {
      showToast('Only admins can mark invoices as paid', 'error')
      return
    }
    setSaving(true)
    try {
      const { data } = await db
        .from('payment_log')
        .select('*')
        .eq('invoice_ref', inv.reference_number)
      const paid = ((data || []) as PaymentLogEntry[]).reduce((s, p) => s + Number(p.amount || 0), 0)
      const balance = Math.max(0, Math.round((Number(inv.amount) - paid) * 100) / 100)
      if (balance > 0.009) {
        await db.from('payment_log').insert({
          invoice_ref: inv.reference_number,
          client: inv.client,
          amount: balance,
          method: settings.paymentMethod || 'Bank Transfer',
          notes: 'Marked paid (full remaining balance)',
          user_email: who,
          balance_after: 0,
        })
      }
      await db
        .from('invoices')
        .update({ payment_status: 'Paid', updated_by: who, updated_at: new Date().toISOString() })
        .eq('id', inv.id)

      const items = await loadLineItems('Invoice', inv.reference_number)
      const t = calcTotals(toDraftItems(items), vatRate)
      await syncIncome(
        {
          client: inv.client,
          vertical: inv.vertical,
          reference_number: inv.reference_number,
          date: inv.date,
          description: inv.description,
          payment_status: 'Paid',
          payment_method: settings.paymentMethod || '',
        },
        { subtotal: t.subtotal || inv.amount / (1 + vatRate), vat: t.vat, total: t.total || inv.amount },
      )
      await logActivity('mark_paid', 'invoice', inv.reference_number, inv.client, who)
      showToast('Marked as Paid', 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to mark paid', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function duplicate(inv: Invoice) {
    setSaving(true)
    try {
      const items = await loadLineItems('Invoice', inv.reference_number)
      const draftRef = `INV-DRAFT-${Date.now()}`
      const { error } = await db.from('invoices').insert({
        client: inv.client,
        vertical: inv.vertical,
        reference_number: draftRef,
        date: format(new Date(), 'yyyy-MM-dd'),
        description: inv.description,
        amount: inv.amount,
        status: 'Draft',
        payment_status: 'Pending',
        payment_terms: inv.payment_terms,
        moq: inv.moq,
        notes: inv.notes,
        delivery_terms: inv.delivery_terms,
        created_by: who,
        updated_by: who,
      })
      if (error) throw error
      await saveLineItems('Invoice', draftRef, toDraftItems(items), vatRate)
      showToast('Duplicated as draft', 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Duplicate failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await deleteLineItems('Invoice', [deleteTarget.reference_number])
      const { error } = await db.from('invoices').delete().eq('id', deleteTarget.id)
      if (error) throw error
      await logActivity('delete_invoice', 'invoice', deleteTarget.reference_number, deleteTarget.client, who)
      showToast('Invoice deleted', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Invoices</h1>
          <p style={pageSubtitleStyle}>Billing and payment tracking</p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={openCreate}>
          <Plus size={16} /> New invoice
        </button>
      </div>

      <input
        style={{ ...inputStyle, maxWidth: 320, marginBottom: 16 }}
        placeholder="Search client / ref…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading invoices…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Wallet size={22} />}
          title="No invoices"
          subtitle="Convert an awarded quote or create an invoice."
          actionLabel="New invoice"
          onAction={openCreate}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Payment</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id}>
                    <td style={tdStyle}>
                      <strong>{inv.reference_number || '—'}</strong>
                    </td>
                    <td style={tdStyle}>{inv.client || '—'}</td>
                    <td style={tdStyle}>
                      {inv.date ? format(new Date(inv.date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={tdStyle}>{formatAED(inv.amount)}</td>
                    <td style={tdStyle}>
                      <StatusPill status={inv.status} />
                    </td>
                    <td style={tdStyle}>
                      <StatusPill status={inv.payment_status} />
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button type="button" style={buttonSecondaryStyle} onClick={() => void openEdit(inv)}>
                          <Pencil size={14} />
                        </button>
                        <Link
                          to={`/document/invoice/${inv.id}`}
                          style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                        >
                          <ExternalLink size={14} />
                        </Link>
                        {inv.payment_status !== 'Paid' && (
                          <button type="button" style={buttonPrimaryStyle} onClick={() => void openPayment(inv)}>
                            Pay
                          </button>
                        )}
                        {userRole === 'admin' && inv.payment_status !== 'Paid' && (
                          <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => void markPaid(inv)}>
                            Mark paid
                          </button>
                        )}
                        <button type="button" style={buttonSecondaryStyle} onClick={() => void duplicate(inv)}>
                          <Copy size={14} />
                        </button>
                        <button type="button" style={buttonDangerStyle} onClick={() => setDeleteTarget(inv)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={editorOpen} title={editing ? 'Edit invoice' : 'New invoice'} onClose={() => setEditorOpen(false)} width={920}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Client *</label>
            <input
              style={inputStyle}
              list="invoice-clients"
              value={form.client}
              onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
            />
            <datalist id="invoice-clients">
              {clients.map((c) => (
                <option key={c.id} value={c.company_name} />
              ))}
            </datalist>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Division</label>
            <select
              style={selectStyle}
              value={divisionCode}
              onChange={(e) => {
                setDivisionCode(e.target.value)
                const brand = DIVISIONS.find((d) => d.code === e.target.value)?.brand || ''
                setForm((f) => ({ ...f, vertical: brand }))
              }}
            >
              {DIVISIONS.map((d) => (
                <option key={d.code} value={d.code}>{d.code} — {d.brand}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Reference</label>
            <input
              style={inputStyle}
              value={form.reference_number}
              onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))}
              placeholder="Auto on finalize"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              style={inputStyle}
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Status</label>
            <select
              style={selectStyle}
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Payment terms</label>
            <select
              style={selectStyle}
              value={form.payment_terms}
              onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
            >
              <option value="">—</option>
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Description</label>
          <input
            style={inputStyle}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 8px' }}>
          <strong>Line items</strong>
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => setForm((f) => ({ ...f, items: [...f.items, newDraftLine()] }))}
          >
            <Plus size={14} /> Row
          </button>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Unit price</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((it) => {
                const line = (Number(it.qty) || 0) * (Number(it.unit_price) || 0) * (1 + vatRate)
                return (
                  <tr key={it.key}>
                    <td style={tdStyle}>
                      <input
                        style={inputStyle}
                        value={it.description}
                        onChange={(e) => updateItem(it.key, { description: e.target.value })}
                      />
                    </td>
                    <td style={{ ...tdStyle, width: 90 }}>
                      <input
                        type="number"
                        style={inputStyle}
                        value={it.qty}
                        onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ ...tdStyle, width: 120 }}>
                      <input
                        type="number"
                        style={inputStyle}
                        value={it.unit_price}
                        onChange={(e) => updateItem(it.key, { unit_price: Number(e.target.value) })}
                      />
                    </td>
                    <td style={tdStyle}>{formatAED(line)}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        style={buttonDangerStyle}
                        disabled={form.items.length <= 1}
                        onClick={() =>
                          setForm((f) => ({ ...f, items: f.items.filter((x) => x.key !== it.key) }))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 12, fontSize: 14 }}>
          <span>Subtotal: <strong>{formatAED(totals.subtotal)}</strong></span>
          <span>VAT: <strong>{formatAED(totals.vat)}</strong></span>
          <span>Total: <strong style={{ color: colors.accent }}>{formatAED(totals.total)}</strong></span>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setEditorOpen(false)}>Cancel</button>
          <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => void saveInvoice(false)}>
            Save
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void saveInvoice(true)}>
            Save & assign ref
          </button>
        </div>
      </Modal>

      <Modal open={!!payTarget} title={`Record payment — ${payTarget?.reference_number || ''}`} onClose={() => setPayTarget(null)} width={480}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Amount (AED)</label>
          <input type="number" style={inputStyle} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Method</label>
          <select style={selectStyle} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />
        </div>
        {payHistory.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>Payment history</div>
            {payHistory.map((p) => (
              <div key={p.id} style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>
                {formatAED(p.amount)} · {p.method} · {format(new Date(p.created_at), 'dd MMM yyyy')}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setPayTarget(null)}>Cancel</button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void recordPayment()}>
            Record payment
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete invoice?" onClose={() => setDeleteTarget(null)} width={420}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Delete <strong style={{ color: colors.text }}>{deleteTarget?.reference_number}</strong> and its line items?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button type="button" style={buttonDangerStyle} disabled={saving} onClick={() => void confirmDelete()}>
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}
