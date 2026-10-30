import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Copy, CreditCard, ExternalLink, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { canMakePayLink } from '../lib/invoicePayLink'
import { getInvoicePayLink } from '../lib/invoicePayLinkStore'
import { db } from '../lib/db'
import {
  DELIVERY_TERMS,
  DIVISIONS,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_TERMS,
  VAT_RATE,
} from '../lib/config'
import type { Account, Client, Invoice, PaymentLogEntry } from '../lib/types'
import { accountTypeLabel } from '../lib/accounts'
import { listAccounts } from '../lib/accountsStore'
import { useAuth } from '../contexts/AuthContext'
import { can, roleAtLeast } from '../lib/permissions'
import PaymentRemindersCard from '../components/invoices/PaymentRemindersCard'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ClientBillToFields from '../components/ClientBillToFields'
import { useClientBillTo } from '../hooks/useClientBillTo'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import { logActivity } from '../lib/activity'
import { formatAED } from '../lib/money'
import { generateReference } from '../lib/referenceNumber'
import { getDivisionQuoteFormat } from '../lib/divisionQuoteFormats'
import { registerLineItemSkus } from '../lib/skuRegistry'
import {
  calcTotals,
  deleteLineItems,
  loadLineItems,
  newDraftLine,
  saveLineItems,
  savedVatRate,
  toDraftItems,
  vatPercentToRate,
  vatRateToPercent,
  type DraftLineItem,
} from '../lib/lineItems'
import {
  effectiveInvoicePaymentStatus,
  isCancelledInvoice,
  sortByDateDesc,
} from '../lib/finance'
import { deleteFinanceForInvoiceRef, reconcileInvoiceFinance } from '../lib/invoiceFinance'
import { useCompactCrm } from '../hooks/useMediaQuery'
import resp from '../styles/crmResponsive.module.css'
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
import { errorMessage } from '../lib/errors'

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
  /** VAT for this invoice: the standard rate, none (e.g. companies outside the UAE) or a custom %. */
  vat_mode: 'standard' | 'zero' | 'custom'
  vat_percent: string
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
  vat_mode: 'standard',
  vat_percent: '',
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
  invoice_status?: string
}, totals: { subtotal: number; vat: number; total: number }) {
  if (!inv.reference_number) return
  const cancelled = isCancelledInvoice({ status: inv.invoice_status || '' })
  const payment_status = cancelled ? 'Pending' : inv.payment_status
  const row = {
    client_source: inv.client,
    category: inv.vertical,
    reference_number: inv.reference_number,
    date: inv.date,
    description: inv.description,
    bill_amount: totals.subtotal,
    vat: totals.vat,
    total_amount: totals.total,
    status: cancelled ? 'Cancelled' : payment_status === 'Paid' ? 'Paid' : 'Open',
    payment_method: cancelled ? '' : inv.payment_method || '',
    payment_status,
  }
  const { data: existing } = await db
    .from('income')
    .select('id')
    .eq('reference_number', inv.reference_number)
    .maybeSingle()
  if (existing?.id) {
    await db.from('income').update(row).eq('id', existing.id)
  } else if (!cancelled) {
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
  const billTo = useClientBillTo(clients)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [payTarget, setPayTarget] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<string>(PAYMENT_METHODS[0])
  const [payNotes, setPayNotes] = useState('')
  const [payDate, setPayDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [payHistory, setPayHistory] = useState<PaymentLogEntry[]>([])
  const [divisionCode, setDivisionCode] = useState('01')
  const vatFormFields = (rate: number, standard: number): Pick<InvoiceForm, 'vat_mode' | 'vat_percent'> =>
    rate === 0
      ? { vat_mode: 'zero', vat_percent: '0' }
      : Math.abs(rate - standard) < 1e-9
        ? { vat_mode: 'standard', vat_percent: vatRateToPercent(standard) }
        : { vat_mode: 'custom', vat_percent: vatRateToPercent(rate) }
  const [payTab, setPayTab] = useState<'All' | 'Pending' | 'Partial' | 'Paid'>('All')
  const compact = useCompactCrm()
  const [searchParams, setSearchParams] = useSearchParams()
  const accountFilter = searchParams.get('account') || ''
  const [accounts, setAccounts] = useState<Account[]>([])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await reconcileInvoiceFinance()
      const [iRes, cRes, acc] = await Promise.all([
        db.from('invoices').select('*').order('created_at', { ascending: false }),
        db.from('clients').select('*').order('company_name'),
        listAccounts().catch(() => ({ rows: [] as Account[] })),
      ])
      setAccounts(acc.rows)
      if (iRes.error) throw iRes.error
      const raw = (iRes.data || []) as Invoice[]
      // Repair stale Paid marks on cancelled invoices (e.g. wrong Ello payment applied then cancelled)
      const stalePaid = raw.filter(
        (inv) => isCancelledInvoice(inv) && String(inv.payment_status || '').toLowerCase() === 'paid',
      )
      for (const inv of stalePaid) {
        await db
          .from('invoices')
          .update({
            payment_status: 'Pending',
            updated_at: new Date().toISOString(),
            updated_by: who || inv.updated_by || '',
          })
          .eq('id', inv.id)
        await deleteFinanceForInvoiceRef(inv.reference_number)
      }
      const invoicesFixed = stalePaid.length
        ? raw.map((inv) =>
            isCancelledInvoice(inv) && String(inv.payment_status || '').toLowerCase() === 'paid'
              ? { ...inv, payment_status: 'Pending' }
              : inv,
          )
        : raw
      setInvoices(sortByDateDesc(invoicesFixed))
      setClients((cRes.data || []) as Client[])
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load invoices'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, who])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter((i) => {
      if (accountFilter && i.account_id !== accountFilter) return false
      if (payTab !== 'All') {
        const pay = effectiveInvoicePaymentStatus(i)
        if (pay !== payTab) return false
      }
      if (!q) return true
      return (
        i.client.toLowerCase().includes(q) ||
        i.reference_number.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
      )
    })
  }, [invoices, search, payTab, accountFilter])

  const formVatRate =
    form.vat_mode === 'zero' ? 0 : form.vat_mode === 'custom' ? vatPercentToRate(form.vat_percent, vatRate) : vatRate
  const totals = useMemo(() => calcTotals(form.items, formVatRate), [form.items, formVatRate])

  function openCreate() {
    setEditing(null)
    setDivisionCode('01')
    billTo.reset()
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
      billTo.reset()
      billTo.prefillFor(inv.client || '')
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
        ...vatFormFields(savedVatRate(items, vatRate), vatRate),
        items: toDraftItems(items),
      })
      setEditorOpen(true)
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load line items'), 'error')
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
      const isTempRef = !reference || /^INV-DRAFT-/i.test(reference)
      const amount = totals.total
      const vertical =
        DIVISIONS.find((d) => d.code === divisionCode)?.brand || form.vertical
      const status = finalize ? (form.status === 'Draft' ? 'Sent' : form.status) : form.status
      // Assign a real RR-XX-YYNNN ref when finalizing (or leaving Draft) — do not keep INV-DRAFT-*.
      const leavingDraft = String(status).toLowerCase() !== 'draft'
      if ((finalize || leavingDraft) && isTempRef) {
        const { data: allRefs } = await db.from('invoices').select('reference_number')
        const refs = ((allRefs || []) as { reference_number: string }[]).map((r) => r.reference_number)
        const { data: quoteRefs } = await db.from('quotations').select('reference_number')
        const qrefs = ((quoteRefs || []) as { reference_number: string }[]).map((r) => r.reference_number)
        reference = generateReference(divisionCode, [...refs, ...qrefs], invoicePrefix)
      }
      if (!reference) {
        reference = `INV-DRAFT-${Date.now()}`
      }
      // Cancelled invoices are not paid — clear any mistaken Paid mark
      const payment_status = isCancelledInvoice({ status })
        ? 'Pending'
        : editing?.payment_status || 'Pending'
      const fmt = getDivisionQuoteFormat(divisionCode, settings)

      const payload = {
        client: form.client.trim(),
        vertical,
        reference_number: reference,
        description: form.description.trim(),
        payment_terms: form.payment_terms,
        delivery_terms: fmt.showDelivery ? form.delivery_terms : '',
        moq: fmt.showMoq ? form.moq : '',
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

      if (isCancelledInvoice({ status })) {
        await deleteFinanceForInvoiceRef(reference)
      }

      // Every line gets an SKU and a catalog / inventory record so it can be recalled later.
      const registered = await registerLineItemSkus(form.items, divisionCode, `invoice ${reference}`)
      await saveLineItems('Invoice', reference, registered.items, formVatRate)
      await syncIncome(
        {
          client: payload.client,
          vertical: payload.vertical,
          reference_number: reference,
          date: payload.date,
          description: payload.description,
          payment_status,
          payment_method: isCancelledInvoice({ status }) ? '' : settings.paymentMethod || '',
          invoice_status: status,
        },
        totals,
      )
      await logActivity('save_invoice', 'invoice', reference, `${payload.client} · ${status}`, who)
      await saveBillToForClient(payload.client)
      showToast('Invoice saved', 'success')
      setEditorOpen(false)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /** Address/TRN typed on the form go to the client record, which the invoice prints from. */
  async function saveBillToForClient(client: string) {
    try {
      const result = await billTo.save(client)
      if (result === 'created') showToast(`${client} added to Clients`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Invoice saved, but the client address/TRN could not be saved'), 'error')
    }
  }

  async function openPayment(inv: Invoice) {
    if (isCancelledInvoice(inv)) {
      showToast('Cancelled invoices cannot take payments', 'error')
      return
    }
    setPayTarget(inv)
    setPayAmount('')
    setPayMethod(settings.paymentMethod || PAYMENT_METHODS[0])
    setPayNotes('')
    setPayDate(format(new Date(), 'yyyy-MM-dd'))
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
    if (isCancelledInvoice(payTarget)) {
      showToast('Cancelled invoices cannot take payments', 'error')
      return
    }
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
        // Only once the "Card payments" SQL added the column; until then everything is AED.
        ...(payTarget.currency && payTarget.currency !== 'AED' ? { currency: payTarget.currency } : {}),
        method: payMethod,
        notes: payNotes,
        user_email: who,
        balance_after: balanceAfter,
        // The day the money was received (noon UAE time so the date never shifts).
        ...(payDate ? { created_at: `${payDate}T12:00:00+04:00` } : {}),
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
      const invRate = savedVatRate(items, vatRate)
      const t = calcTotals(toDraftItems(items), invRate)
      await syncIncome(
        {
          client: payTarget.client,
          vertical: payTarget.vertical,
          reference_number: payTarget.reference_number,
          date: payTarget.date,
          description: payTarget.description,
          payment_status,
          payment_method: payMethod,
          invoice_status: payTarget.status,
        },
        { subtotal: t.subtotal || payTarget.amount / (1 + invRate), vat: t.vat, total: t.total || payTarget.amount },
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
      showToast(errorMessage(e, 'Payment failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function markPaid(inv: Invoice) {
    if (!can(userRole, 'invoice.markPaid')) {
      showToast('Only admins can mark invoices as paid', 'error')
      return
    }
    if (isCancelledInvoice(inv)) {
      showToast('Cancelled invoices cannot be marked paid', 'error')
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
          ...(inv.currency && inv.currency !== 'AED' ? { currency: inv.currency } : {}),
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
      const invRate = savedVatRate(items, vatRate)
      const t = calcTotals(toDraftItems(items), invRate)
      await syncIncome(
        {
          client: inv.client,
          vertical: inv.vertical,
          reference_number: inv.reference_number,
          date: inv.date,
          description: inv.description,
          payment_status: 'Paid',
          payment_method: settings.paymentMethod || '',
          invoice_status: inv.status,
        },
        { subtotal: t.subtotal || inv.amount / (1 + invRate), vat: t.vat, total: t.total || inv.amount },
      )
      await logActivity('mark_paid', 'invoice', inv.reference_number, inv.client, who)
      showToast('Marked as Paid', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Failed to mark paid'), 'error')
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
        ...(inv.currency && inv.currency !== 'AED' ? { currency: inv.currency } : {}),
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
      await saveLineItems('Invoice', draftRef, toDraftItems(items), savedVatRate(items, vatRate))
      showToast('Duplicated as draft', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Duplicate failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    if (!can(userRole, 'invoice.delete')) {
      showToast('Only admins can delete invoices', 'error')
      return
    }
    setSaving(true)
    try {
      const ref = deleteTarget.reference_number
      await deleteLineItems('Invoice', [ref])
      await deleteFinanceForInvoiceRef(ref)
      const { error } = await db.from('invoices').delete().eq('id', deleteTarget.id)
      if (error) throw error
      await logActivity('delete_invoice', 'invoice', ref, deleteTarget.client, who)
      showToast('Invoice deleted', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Delete failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function copyPayLink(inv: Invoice) {
    setSaving(true)
    try {
      const link = await getInvoicePayLink(inv.id)
      try {
        await navigator.clipboard.writeText(link.url)
        showToast(`Card payment link for ${link.currency} ${link.amount.toFixed(2)} copied. Send it to the client.`, 'success')
      } catch {
        window.prompt('Card payment link. Copy it and send it to the client:', link.url)
      }
      await logActivity('pay_link', 'invoice', inv.reference_number, `${link.currency} ${link.amount}`, who)
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the payment link'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function renderInvoiceActions(inv: Invoice) {
    return (
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
        {!isCancelledInvoice(inv) && effectiveInvoicePaymentStatus(inv) !== 'Paid' && (
          <button type="button" style={buttonPrimaryStyle} onClick={() => void openPayment(inv)}>
            Pay
          </button>
        )}
        {canMakePayLink(userRole) &&
          inv.reference_number &&
          !isCancelledInvoice(inv) &&
          String(inv.status).toLowerCase() !== 'draft' &&
          effectiveInvoicePaymentStatus(inv) !== 'Paid' && (
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={saving}
              title="Card payment link for what is still owed"
              onClick={() => void copyPayLink(inv)}
            >
              <CreditCard size={14} /> Card link
            </button>
          )}
        {can(userRole, 'invoice.markPaid') &&
          !isCancelledInvoice(inv) &&
          effectiveInvoicePaymentStatus(inv) !== 'Paid' && (
            <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => void markPaid(inv)}>
              Mark paid
            </button>
          )}
        <button type="button" style={buttonSecondaryStyle} onClick={() => void duplicate(inv)}>
          <Copy size={14} />
        </button>
        {can(userRole, 'invoice.delete') && (
          <button
            type="button"
            style={buttonDangerStyle}
            onClick={() => setDeleteTarget(inv)}
            aria-label="Delete invoice"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    )
  }

  /** Client name, linked to its account when the invoice is linked to one. */
  function clientCell(inv: Invoice) {
    const account = inv.account_id ? accountById.get(inv.account_id) : undefined
    if (!account) return inv.client || '—'
    return (
      <>
        <Link to={`/accounts/${account.id}`} style={{ color: 'inherit' }}>
          {inv.client || account.name}
        </Link>
        <span style={{ display: 'block', fontSize: 11, color: colors.muted2 }}>{accountTypeLabel(account.type)}</span>
      </>
    )
  }

  const filterAccount = accountFilter ? accountById.get(accountFilter) : undefined

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

      {roleAtLeast(userRole, 'sales') ? <PaymentRemindersCard /> : null}

      {accountFilter ? (
        <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 12px' }}>
          Showing invoices for {filterAccount?.name ?? 'one account'}.{' '}
          <button
            type="button"
            style={{ all: 'unset', cursor: 'pointer', color: colors.accent }}
            onClick={() => {
              const next = new URLSearchParams(window.location.search)
              next.delete('account')
              setSearchParams(next, { replace: true })
            }}
          >
            Show all
          </button>
        </p>
      ) : null}

      <div className={resp.toolbar} style={{ marginBottom: 16 }}>
        <div className={compact ? resp.chipScroll : resp.chipRow} style={{ marginBottom: 0, flex: 1 }}>
          {(['All', 'Pending', 'Partial', 'Paid'] as const).map((t) => (
            <button
              key={t}
              type="button"
              style={{
                ...buttonSecondaryStyle,
                ...(payTab === t ? { borderColor: colors.accent, color: colors.accent } : null),
              }}
              onClick={() => setPayTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          className={resp.toolbarSearch}
          style={{ ...inputStyle, maxWidth: compact ? '100%' : 320 }}
          placeholder="Search client / ref…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
      ) : compact ? (
        <div className={resp.listStack}>
          {filtered.map((inv) => (
            <article key={inv.id} className={resp.card}>
              <div className={resp.cardTop}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className={resp.cardTitle} style={{ cursor: 'default' }}>
                    {inv.reference_number || '—'}
                  </div>
                  <div className={resp.cardMeta}>
                    {clientCell(inv)}
                    {inv.date ? ` · ${format(new Date(inv.date), 'dd MMM yyyy')}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <StatusPill status={inv.status} />
                  <StatusPill status={effectiveInvoicePaymentStatus(inv)} />
                </div>
              </div>
              <div className={resp.cardMeta} style={{ fontSize: 15, fontWeight: 650, color: colors.text }}>
                {formatAED(inv.amount)}
              </div>
              <div className={resp.cardActions}>{renderInvoiceActions(inv)}</div>
            </article>
          ))}
        </div>
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
                    <td style={tdStyle}>{clientCell(inv)}</td>
                    <td style={tdStyle}>
                      {inv.date ? format(new Date(inv.date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={tdStyle}>{formatAED(inv.amount)}</td>
                    <td style={tdStyle}>
                      <StatusPill status={inv.status} />
                    </td>
                    <td style={tdStyle}>
                      <StatusPill status={effectiveInvoicePaymentStatus(inv)} />
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{renderInvoiceActions(inv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={editorOpen} title={editing ? 'Edit invoice' : 'New invoice'} onClose={() => setEditorOpen(false)} width={920}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Client *</label>
            <input
              style={inputStyle}
              list="invoice-clients"
              value={form.client}
              onChange={(e) => {
                setForm((f) => ({ ...f, client: e.target.value }))
                billTo.prefillFor(e.target.value)
              }}
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
                const code = e.target.value
                setDivisionCode(code)
                const brand = DIVISIONS.find((d) => d.code === code)?.brand || ''
                const fmt = getDivisionQuoteFormat(code, settings)
                setForm((f) => ({
                  ...f,
                  vertical: brand,
                  // Threads-style commercial lines only when the division format shows them.
                  moq: fmt.showMoq ? f.moq || settings.moqDefault || '50' : '',
                  delivery_terms: fmt.showDelivery
                    ? f.delivery_terms || settings.deliveryTerms || DELIVERY_TERMS[0]
                    : '',
                }))
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
          <ClientBillToFields
            draft={billTo.draft}
            onChange={billTo.edit}
            client={form.client}
            savedClient={billTo.isSavedClient(form.client)}
          />
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
          {compact ? (
            <div className={resp.lineStack}>
              {form.items.map((it) => {
                const line = (Number(it.qty) || 0) * (Number(it.unit_price) || 0) * (1 + formVatRate)
                return (
                  <div key={it.key} className={resp.lineCard}>
                    <div className={`${resp.cardField} ${resp.lineCardFull}`}>
                      <label>Description</label>
                      <input
                        style={inputStyle}
                        value={it.description}
                        onChange={(e) => updateItem(it.key, { description: e.target.value })}
                      />
                    </div>
                    <div className={resp.cardField}>
                      <label>Qty</label>
                      <input
                        type="number"
                        style={inputStyle}
                        value={it.qty}
                        onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) })}
                      />
                    </div>
                    <div className={resp.cardField}>
                      <label>Unit price</label>
                      <input
                        type="number"
                        style={inputStyle}
                        value={it.unit_price}
                        onChange={(e) => updateItem(it.key, { unit_price: Number(e.target.value) })}
                      />
                    </div>
                    <div className={resp.lineCardActions}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{formatAED(line)}</div>
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
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
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
                const line = (Number(it.qty) || 0) * (Number(it.unit_price) || 0) * (1 + formVatRate)
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
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
          <div style={{ ...fieldStyle, minWidth: 220 }}>
            <label style={labelStyle}>VAT on this invoice</label>
            <select
              style={selectStyle}
              aria-label="VAT on this invoice"
              value={form.vat_mode}
              onChange={(e) => {
                const vat_mode = e.target.value as InvoiceForm['vat_mode']
                setForm((f) => ({
                  ...f,
                  vat_mode,
                  vat_percent:
                    vat_mode === 'zero' ? '0' : vat_mode === 'standard' ? vatRateToPercent(vatRate) : f.vat_percent,
                }))
              }}
            >
              <option value="standard">Standard {vatRateToPercent(vatRate)}%</option>
              <option value="zero">No VAT (0%) — e.g. outside the UAE</option>
              <option value="custom">Custom rate…</option>
            </select>
          </div>
          {form.vat_mode === 'custom' ? (
            <div style={{ ...fieldStyle, width: 120 }}>
              <label style={labelStyle}>VAT %</label>
              <input
                type="number"
                min={0}
                max={99}
                step="0.01"
                style={inputStyle}
                aria-label="Custom VAT percent"
                value={form.vat_percent}
                onChange={(e) => setForm((f) => ({ ...f, vat_percent: e.target.value }))}
              />
            </div>
          ) : null}
        </div>

        <div className={resp.totalsRow}>
          <span>Subtotal: <strong>{formatAED(totals.subtotal)}</strong></span>
          <span>VAT ({vatRateToPercent(formVatRate)}%): <strong>{formatAED(totals.vat)}</strong></span>
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
          <label style={labelStyle}>Date received</label>
          <input type="date" style={inputStyle} value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-label="Date received" />
        </div>
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
          Delete <strong style={{ color: colors.text }}>{deleteTarget?.reference_number}</strong>, its line items,
          linked payments, and income?
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
