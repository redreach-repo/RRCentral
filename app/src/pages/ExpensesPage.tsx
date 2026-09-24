import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { FileUp, Paperclip, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { db } from '../lib/db'
import { PAYMENT_METHODS, VAT_RATE } from '../lib/config'
import type { Attachment, Expense, Quotation, Vendor } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { formatAED } from '../lib/money'
import { logActivity } from '../lib/activity'
import { expenseVatParts } from '../lib/finance'
import { round2 } from '../lib/lineItems'
import {
  supplierInvoiceProfit,
  type ParsedSupplierInvoice,
} from '../lib/supplierInvoiceParse'
import {
  expenseReportDescription,
  formatSupplierExpenseDescription,
  saveAttachmentsToExpense,
  saveAttachmentsToQuote,
  syncQuoteSupplierCostFromExpense,
} from '../lib/supplierInvoiceStore'
import { ensureVendor, listVendors } from '../lib/vendors'
import { isUndefinedColumnError } from '../lib/errors'
import { Link } from 'react-router-dom'
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
  formGridStyle,
} from '../lib/uiStyles'

const CATEGORIES = [
  'Uniforms / Cost of goods',
  'Office',
  'Travel',
  'Marketing',
  'Salary',
  'Rent',
  'Utilities',
  'Supplies',
  'Shipping',
  'Professional fees',
  'Other',
]

type ExpenseForm = {
  date: string
  vendor: string
  category: string
  amount: number
  amount_ex_vat: number
  vat_amount: number
  payment_method: string
  references_text: string
  notes: string
  quote_ref: string
  supplier_invoice_no: string
}

const emptyForm = (): ExpenseForm => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  vendor: '',
  category: CATEGORIES[0],
  amount: 0,
  amount_ex_vat: 0,
  vat_amount: 0,
  payment_method: PAYMENT_METHODS[0],
  references_text: '',
  notes: '',
  quote_ref: '',
  supplier_invoice_no: '',
})

function applyVatInclusive(inclusive: number, rate: number): Pick<ExpenseForm, 'amount' | 'amount_ex_vat' | 'vat_amount'> {
  const amount = round2(Math.max(0, inclusive))
  if (amount <= 0 || rate <= 0) return { amount, amount_ex_vat: amount, vat_amount: 0 }
  const amount_ex_vat = round2(amount / (1 + rate))
  const vat_amount = round2(amount - amount_ex_vat)
  return { amount, amount_ex_vat, vat_amount }
}

function applyExVat(exclusive: number, rate: number): Pick<ExpenseForm, 'amount' | 'amount_ex_vat' | 'vat_amount'> {
  const amount_ex_vat = round2(Math.max(0, exclusive))
  const vat_amount = round2(amount_ex_vat * rate)
  return { amount_ex_vat, vat_amount, amount: round2(amount_ex_vat + vat_amount) }
}

export default function ExpensesPage() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const vatRate = Number(settings.vatRate || VAT_RATE) || VAT_RATE

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorSuggest, setVendorSuggest] = useState(false)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseHint, setParseHint] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pendingFiles, setPendingFiles] = useState<{ name: string; dataUrl: string; mime?: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [expRes, quoteRes, vendorRows] = await Promise.all([
        db.from('expenses').select('*').order('date', { ascending: false }),
        db.from('quotations').select('*').order('date', { ascending: false }),
        listVendors().catch(() => [] as Vendor[]),
      ])
      if (expRes.error) throw expRes.error
      setExpenses((expRes.data || []) as Expense[])
      if (!quoteRes.error) setQuotes((quoteRes.data || []) as Quotation[])
      setVendors(vendorRows)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load expenses', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return true
      const d = e.date.slice(0, 10)
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
  }, [expenses, from, to])

  const total = useMemo(
    () => filtered.reduce((s, e) => s + Number(e.amount || 0), 0),
    [filtered],
  )

  const linkedQuote = useMemo(
    () => quotes.find((q) => q.reference_number === form.quote_ref || q.quote_id === form.quote_ref) || null,
    [quotes, form.quote_ref],
  )

  const vendorMatches = useMemo(() => {
    const q = form.vendor.trim().toLowerCase()
    if (!q) return vendors.slice(0, 8)
    return vendors
      .filter((v) => v.company_name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [vendors, form.vendor])

  const profitPreview = useMemo(() => {
    if (!linkedQuote) return null
    const exclusive = form.amount_ex_vat > 0 ? form.amount_ex_vat : expenseVatParts({
      amount: form.amount,
      amount_ex_vat: form.amount_ex_vat,
      vat_amount: form.vat_amount,
    } as Expense, vatRate).exclusive
    const vat = form.vat_amount > 0 || form.amount_ex_vat > 0
      ? form.vat_amount
      : expenseVatParts({ amount: form.amount } as Expense, vatRate).vat
    return supplierInvoiceProfit({
      quoteAmount: Number(linkedQuote.amount) || 0,
      quoteOffsetVat: Boolean(linkedQuote.offset_vat),
      expenseExclusive: exclusive,
      expenseVat: vat,
      vatRate,
    })
  }, [linkedQuote, form.amount, form.amount_ex_vat, form.vat_amount, vatRate])

  async function loadAttachments(expenseId: string) {
    const { data } = await db
      .from('attachments')
      .select('*')
      .eq('entity_type', 'expense')
      .eq('entity_ref', expenseId)
      .order('uploaded_at', { ascending: false })
    setAttachments((data || []) as Attachment[])
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setAttachments([])
    setPendingFiles([])
    setParseHint('')
    setOpen(true)
  }

  function openCreateSupplierInvoice() {
    openCreate()
    setForm((f) => ({ ...f, category: 'Uniforms / Cost of goods' }))
  }

  function openEdit(e: Expense) {
    const parts = expenseVatParts(e, vatRate)
    setEditing(e)
    setForm({
      date: e.date ? e.date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
      vendor: e.vendor || '',
      category: e.category || CATEGORIES[0],
      amount: Number(e.amount) || parts.inclusive || 0,
      amount_ex_vat: Number(e.amount_ex_vat) || parts.exclusive || 0,
      vat_amount: Number(e.vat_amount) || parts.vat || 0,
      payment_method: e.payment_method || PAYMENT_METHODS[0],
      references_text: e.references_text || '',
      notes: e.notes || '',
      quote_ref: e.quote_ref || '',
      supplier_invoice_no: e.supplier_invoice_no || '',
    })
    setPendingFiles([])
    setParseHint('')
    setOpen(true)
    void loadAttachments(e.id)
  }

  async function readFileAsDataUrl(file: File): Promise<{ name: string; dataUrl: string; mime?: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        resolve({ name: file.name, dataUrl: String(reader.result || ''), mime: file.type })
      reader.onerror = () => reject(reader.error || new Error('Read failed'))
      reader.readAsDataURL(file)
    })
  }

  function applyParsedInvoice(parsed: ParsedSupplierInvoice) {
    setForm((f) => ({
      ...f,
      vendor: parsed.vendor || f.vendor,
      date: parsed.date || f.date,
      supplier_invoice_no: parsed.supplierInvoiceNo || f.supplier_invoice_no,
      amount: parsed.amountInclusive ?? f.amount,
      amount_ex_vat: parsed.amountExVat ?? f.amount_ex_vat,
      vat_amount: parsed.vatAmount ?? f.vat_amount,
      category: f.category === CATEGORIES[0] || !f.category ? 'Uniforms / Cost of goods' : f.category,
      notes: [
        f.notes.trim(),
        parsed.trn ? `Supplier TRN ${parsed.trn}` : '',
        parsed.rawTextSample && !parsed.amountInclusive
          ? 'PDF text extracted — check totals manually.'
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      references_text: f.references_text || parsed.supplierInvoiceNo || '',
    }))
    setParseHint(
      parsed.confidence === 'high'
        ? 'Filled from the PDF. Check the figures before saving.'
        : parsed.confidence === 'medium'
          ? 'Partially filled from the PDF. Confirm vendor, date, and totals.'
          : 'Could only read a little from the PDF. Enter the missing fields.',
    )
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return
    try {
      const list = [...files]
      const rows = await Promise.all(list.map((f) => readFileAsDataUrl(f)))
      setPendingFiles((prev) => [...prev, ...rows])

      const pdf = list.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
      if (!pdf) return
      setParsing(true)
      try {
        const { parseSupplierInvoicePdf } = await import('../lib/supplierInvoicePdf')
        const parsed = await parseSupplierInvoicePdf(pdf, vatRate)
        applyParsedInvoice(parsed)
        showToast('Supplier invoice PDF read — review the form', 'success')
      } catch (e) {
        setParseHint('Could not read text from this PDF. Fill the form manually.')
        showToast(e instanceof Error ? e.message : 'PDF parse failed', 'error')
      } finally {
        setParsing(false)
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not read file', 'error')
    }
  }

  async function saveAttachmentsFor(expenseId: string) {
    const who = user?.email || ''
    await saveAttachmentsToExpense({ expenseId, files: pendingFiles, uploadedBy: who })
    if (linkedQuote) {
      await saveAttachmentsToQuote({ quote: linkedQuote, files: pendingFiles, uploadedBy: who })
    }
  }

  async function save() {
    if (!form.vendor.trim()) {
      showToast('Vendor is required', 'error')
      return
    }
    setSaving(true)
    try {
      const parts =
        form.amount_ex_vat > 0 || form.vat_amount > 0
          ? {
              amount_ex_vat: round2(form.amount_ex_vat),
              vat_amount: round2(form.vat_amount),
              amount:
                form.amount > 0
                  ? round2(form.amount)
                  : round2(form.amount_ex_vat + form.vat_amount),
            }
          : applyVatInclusive(form.amount, vatRate)

      const quoteRef = form.quote_ref.trim()
      const autoDescription = quoteRef
        ? formatSupplierExpenseDescription(form.vendor, quoteRef)
        : ''
      const extraNotes = form.notes
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^payment to\b/i.test(l))
        .join('\n')
      const notes = autoDescription
        ? extraNotes
          ? `${autoDescription}\n${extraNotes}`
          : autoDescription
        : form.notes.trim()

      const payload = {
        date: form.date || null,
        vendor: form.vendor.trim(),
        category: form.category,
        amount: parts.amount,
        amount_ex_vat: parts.amount_ex_vat,
        vat_amount: parts.vat_amount,
        payment_method: form.payment_method,
        references_text: quoteRef || form.references_text.trim(),
        notes,
        quote_ref: quoteRef,
        supplier_invoice_no: form.supplier_invoice_no.trim(),
      }

      let expenseId = editing?.id || ''
      if (editing) {
        let { error } = await db.from('expenses').update(payload).eq('id', editing.id)
        if (error && isUndefinedColumnError(error)) {
          const {
            amount_ex_vat: _a,
            vat_amount: _v,
            quote_ref: _q,
            supplier_invoice_no: _s,
            ...legacy
          } = payload
          const retry = await db.from('expenses').update(legacy).eq('id', editing.id)
          if (retry.error) throw retry.error
          showToast(
            'Saved without supplier-invoice columns. Run supabase-supplier-invoice-expense-upgrade.sql in Supabase.',
            'error',
          )
        } else if (error) throw error
        expenseId = editing.id
      } else {
        const newId = crypto.randomUUID()
        let { error } = await db.from('expenses').insert({ ...payload, id: newId })
        if (error && isUndefinedColumnError(error)) {
          const {
            amount_ex_vat: _a,
            vat_amount: _v,
            quote_ref: _q,
            supplier_invoice_no: _s,
            ...legacy
          } = payload
          const retry = await db.from('expenses').insert({ ...legacy, id: newId })
          if (retry.error) throw retry.error
          showToast(
            'Saved without supplier-invoice columns. Run supabase-supplier-invoice-expense-upgrade.sql in Supabase.',
            'error',
          )
        } else if (error) throw error
        expenseId = newId
      }

      if (pendingFiles.length && expenseId) {
        await saveAttachmentsFor(expenseId)
      }

      if (linkedQuote && parts.amount_ex_vat > 0) {
        try {
          await syncQuoteSupplierCostFromExpense({
            quote: linkedQuote,
            exclusiveCost: parts.amount_ex_vat,
            vatRate,
            updatedBy: user?.email || '',
          })
        } catch {
          /* quote sync is best-effort */
        }
      }

      try {
        const trnMatch = form.notes.match(/Supplier TRN\s+(\d{9,15})/i)
        await ensureVendor({
          company_name: payload.vendor,
          trn: trnMatch?.[1] || '',
        })
      } catch {
        /* vendor registry is best-effort until SQL upgrade runs */
      }

      await logActivity(
        editing ? 'update_expense' : 'save_expense',
        'expense',
        payload.vendor,
        `${payload.category} · ${formatAED(payload.amount)}${payload.quote_ref ? ` · ${payload.quote_ref}` : ''}`,
        user?.email || '',
      )
      showToast(
        linkedQuote
          ? `Saved on quotation ${linkedQuote.reference_number || linkedQuote.quote_id} and in expenses`
          : 'Expense saved — it will show in finance reports',
        'success',
      )
      setOpen(false)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const { data: atts } = await db
        .from('attachments')
        .select('id')
        .eq('entity_type', 'expense')
        .eq('entity_ref', deleteTarget.id)
      for (const a of (atts || []) as { id: string }[]) {
        await db.from('attachments').delete().eq('id', a.id)
      }
      const { error } = await db.from('expenses').delete().eq('id', deleteTarget.id)
      if (error) throw error
      await logActivity('delete_expense', 'expense', deleteTarget.vendor, '', user?.email || '')
      showToast('Expense deleted', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function removeAttachment(id: string) {
    await db.from('attachments').delete().eq('id', id)
    if (editing) await loadAttachments(editing.id)
  }

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Expenses</h1>
          <p style={pageSubtitleStyle}>
            Vendor bills, uniform supplier invoices, receipts — and spend in finance reports
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={buttonSecondaryStyle} onClick={openCreateSupplierInvoice}>
            <FileUp size={16} /> Supplier invoice
          </button>
          <button type="button" style={buttonPrimaryStyle} onClick={openCreate}>
            <Plus size={16} /> Add expense
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div>
          <label style={labelStyle}>From</label>
          <input type="date" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>To</label>
          <input type="date" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ ...cardStyle, padding: '10px 16px', marginLeft: 'auto' }}>
          <div style={{ fontSize: 12, color: colors.muted }}>Filtered total</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{formatAED(total)}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading expenses…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Wallet size={22} />}
          title="No expenses"
          subtitle="Upload a supplier PDF or add spend by vendor."
          actionLabel="Supplier invoice"
          onAction={openCreateSupplierInvoice}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Vendor</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Ex-VAT</th>
                  <th style={thStyle}>VAT paid</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Quote</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const parts = expenseVatParts(e, vatRate)
                  return (
                    <tr key={e.id}>
                      <td style={tdStyle}>
                        {e.date ? format(parseISO(e.date.slice(0, 10)), 'dd MMM yyyy') : '—'}
                      </td>
                      <td style={tdStyle}>
                        {e.vendor}
                        {e.supplier_invoice_no ? (
                          <div style={{ fontSize: 11, color: colors.muted2 }}>{e.supplier_invoice_no}</div>
                        ) : null}
                        {e.quote_ref || /^payment to\b/i.test(String(e.notes || '')) ? (
                          <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                            {expenseReportDescription(e)}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{e.category || '—'}</td>
                      <td style={tdStyle}>{formatAED(parts.exclusive)}</td>
                      <td style={tdStyle}>{formatAED(parts.vat)}</td>
                      <td style={tdStyle}>{formatAED(parts.inclusive)}</td>
                      <td style={tdStyle}>{e.quote_ref || e.references_text || '—'}</td>
                      <td style={tdStyle}>
                        <button type="button" style={buttonSecondaryStyle} onClick={() => openEdit(e)}>
                          <Pencil size={14} />
                        </button>{' '}
                        <button type="button" style={buttonDangerStyle} onClick={() => setDeleteTarget(e)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? 'Edit expense' : 'Add expense / supplier invoice'}
        onClose={() => setOpen(false)}
        width={640}
      >
        <div style={fieldStyle}>
          <label style={labelStyle}>
            <FileUp size={12} style={{ marginRight: 4 }} />
            Upload supplier invoice PDF
          </label>
          <input
            type="file"
            accept="application/pdf,image/*,.pdf"
            multiple
            disabled={parsing}
            onChange={(e) => void onPickFiles(e.target.files)}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted, lineHeight: 1.45 }}>
            PDF text is copied into the form when possible (vendor, date, invoice no, totals, VAT). Always
            review before saving. When a quotation is linked, the PDF is stored on that quotation as well
            as on this expense.
          </p>
          {parsing ? (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.accent }}>Reading PDF…</p>
          ) : null}
          {parseHint ? (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.muted }}>{parseHint}</p>
          ) : null}
          {pendingFiles.length > 0 ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: colors.muted }}>
              {pendingFiles.map((f) => (
                <li key={f.name + f.dataUrl.slice(0, 24)}>{f.name} (pending save)</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div style={formGridStyle}>
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
            <label style={labelStyle}>Invoice number (from their PDF)</label>
            <input
              style={inputStyle}
              value={form.supplier_invoice_no}
              onChange={(e) => setForm((f) => ({ ...f, supplier_invoice_no: e.target.value }))}
              placeholder="e.g. INV-8821 — not a vendor ID"
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: colors.muted }}>
              The number printed on the supplier’s tax invoice. You do not need a CRM vendor number.
            </p>
          </div>
          <div style={{ ...fieldStyle, position: 'relative' }}>
            <label style={labelStyle}>Vendor company *</label>
            <input
              style={inputStyle}
              value={form.vendor}
              list="expense-vendor-suggestions"
              onChange={(e) => {
                setForm((f) => ({ ...f, vendor: e.target.value }))
                setVendorSuggest(true)
              }}
              onFocus={() => setVendorSuggest(true)}
              onBlur={() => window.setTimeout(() => setVendorSuggest(false), 150)}
              placeholder="Company name — pick a registered vendor or type a new one"
            />
            <datalist id="expense-vendor-suggestions">
              {vendors.map((v) => (
                <option key={v.id} value={v.company_name} />
              ))}
            </datalist>
            {vendorSuggest && vendorMatches.length > 0 ? (
              <div
                style={{
                  position: 'absolute',
                  zIndex: 5,
                  left: 0,
                  right: 0,
                  top: '100%',
                  background: '#1a1d22',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  maxHeight: 180,
                  overflow: 'auto',
                }}
              >
                {vendorMatches.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: 'none',
                      color: colors.text,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                    onMouseDown={() => {
                      setForm((f) => ({ ...f, vendor: v.company_name }))
                      setVendorSuggest(false)
                    }}
                  >
                    {v.company_name}
                    {v.trn ? (
                      <span style={{ color: colors.muted2, marginLeft: 8 }}>TRN {v.trn}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            <p style={{ margin: '4px 0 0', fontSize: 11, color: colors.muted }}>
              Register suppliers under{' '}
              <Link to="/vendors" style={{ color: colors.accent }}>
                Vendors
              </Link>
              . Saving also registers a new company name automatically.
            </p>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Category</label>
            <select
              style={selectStyle}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Amount ex-VAT</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.amount_ex_vat || ''}
              onChange={(e) => {
                const exclusive = Number(e.target.value) || 0
                setForm((f) => ({ ...f, ...applyExVat(exclusive, vatRate) }))
              }}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>VAT paid ({(vatRate * 100).toFixed(0)}%)</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.vat_amount || ''}
              onChange={(e) => {
                const vat_amount = round2(Number(e.target.value) || 0)
                setForm((f) => ({
                  ...f,
                  vat_amount,
                  amount: round2((Number(f.amount_ex_vat) || 0) + vat_amount),
                }))
              }}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Total incl. VAT</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.amount || ''}
              onChange={(e) => {
                const inclusive = Number(e.target.value) || 0
                setForm((f) => ({ ...f, ...applyVatInclusive(inclusive, vatRate) }))
              }}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Payment method</label>
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
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Link to quotation</label>
            <select
              style={selectStyle}
              value={form.quote_ref}
              onChange={(e) => setForm((f) => ({ ...f, quote_ref: e.target.value }))}
            >
              <option value="">— None —</option>
              {quotes.map((q) => (
                <option key={q.id} value={q.reference_number || q.quote_id}>
                  {(q.reference_number || q.quote_id) + ` · ${q.client} · ${formatAED(Number(q.amount) || 0)}`}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Reference</label>
            <input
              style={inputStyle}
              value={form.references_text}
              onChange={(e) => setForm((f) => ({ ...f, references_text: e.target.value }))}
              placeholder="PO / internal ref"
            />
          </div>
        </div>

        {profitPreview && linkedQuote ? (
          <div style={{ ...cardStyle, padding: 12, marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Profit vs {linkedQuote.reference_number || linkedQuote.quote_id}
            </div>
            <div>
              Customer revenue (ex-VAT): <strong>{formatAED(profitPreview.revenueExclusive)}</strong>
            </div>
            <div>
              Supplier cost (ex-VAT): <strong>{formatAED(profitPreview.expenseExclusive)}</strong>
            </div>
            <div>
              VAT paid on supplier invoice: <strong>{formatAED(profitPreview.expenseVat)}</strong>
            </div>
            <div>
              Gross profit:{' '}
              <strong style={{ color: profitPreview.profit >= 0 ? colors.success : colors.danger }}>
                {formatAED(profitPreview.profit)}
              </strong>{' '}
              <span style={{ color: colors.muted2 }}>({profitPreview.marginPct}% margin)</span>
            </div>
            <div style={{ color: colors.muted2, fontSize: 12 }}>
              Net VAT position on this deal (output − input): {formatAED(profitPreview.netVatPosition)}
            </div>
          </div>
        ) : null}

        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {attachments.length > 0 ? (
          <div style={fieldStyle}>
            <label style={labelStyle}>
              <Paperclip size={12} style={{ marginRight: 4 }} />
              Saved attachments
            </label>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {attachments.map((a) => (
                <li key={a.id} style={{ marginBottom: 4 }}>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ color: colors.accent }}>
                    {a.file_name || 'Attachment'}
                  </a>{' '}
                  <button type="button" style={buttonGhostTiny} onClick={() => void removeAttachment(a.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving || parsing} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete expense?" onClose={() => setDeleteTarget(null)} width={400}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Delete expense for <strong style={{ color: colors.text }}>{deleteTarget?.vendor}</strong>?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>
            Cancel
          </button>
          <button type="button" style={buttonDangerStyle} disabled={saving} onClick={() => void confirmDelete()}>
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}

const buttonGhostTiny = {
  ...buttonSecondaryStyle,
  padding: '2px 8px',
  fontSize: 11,
}
