import { useCallback, useEffect, useMemo, useState, type CSSProperties, Fragment } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Copy,
  ExternalLink,
  FilePlus2,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { db } from '../lib/db'
import {
  DELIVERY_TERMS,
  DIVISIONS,
  PAYMENT_TERMS,
  QUOTE_STATUSES,
  VAT_RATE,
} from '../lib/config'
import type { Client, Product, Quotation, QuoteTemplate } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import { logActivity } from '../lib/activity'
import {
  calcTotals,
  deleteLineItems,
  effectiveQty,
  loadLineItems,
  makeQuoteId,
  newDraftLine,
  saveLineItems,
  toDraftItems,
  type DraftLineItem,
} from '../lib/lineItems'
import { STANDARD_SIZES, emptySizeBreakdown, sumSizes } from '../lib/sizes'
import { commitStockForInvoice, releaseStockForQuote, reserveStockForQuote } from '../lib/inventory'
import { syncCrmFromQuote } from '../lib/crmSync'
import { formatAED } from '../lib/money'
import {
  generateReference,
  formatRevisionReference,
  parseBaseReference,
} from '../lib/referenceNumber'
import { sortByDateDesc } from '../lib/finance'
import { isQuotePastValidity, quoteValidUntil } from '../lib/documents'
import {
  BASE_CURRENCY,
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
  toBaseAmount,
} from '../lib/currency'
import { approveFxRate, quotationCurrencyDefaults } from '../lib/customerPayments'
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

type StatusTab = 'All' | 'Draft' | 'Finalized' | 'Sent' | 'Awarded'

interface QuoteForm {
  client: string
  division_code: string
  description: string
  payment_terms: string
  delivery_terms: string
  moq: string
  notes: string
  date: string
  items: DraftLineItem[]
  quotation_currency: string
  payment_currency: string
  supplier_currency: string
  booking_currency: string
  fx_rate: number
  fx_rate_date: string
  rate_valid_until: string
  charges_borne_by: string
  accept_other_payment_currency: boolean
  net_amount_required: string
  payment_instructions: string
  conversion_fee_estimate: number
  bank_fee_estimate: number
  supplier_cost_base: number
}

const emptyForm = (defaults?: Partial<QuoteForm>): QuoteForm => ({
  client: '',
  division_code: '01',
  description: '',
  payment_terms: '',
  delivery_terms: '',
  moq: '',
  notes: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  items: [newDraftLine()],
  quotation_currency: BASE_CURRENCY,
  payment_currency: BASE_CURRENCY,
  supplier_currency: BASE_CURRENCY,
  booking_currency: BASE_CURRENCY,
  fx_rate: 1,
  fx_rate_date: format(new Date(), 'yyyy-MM-dd'),
  rate_valid_until: '',
  charges_borne_by: 'Customer',
  accept_other_payment_currency: true,
  net_amount_required: '',
  payment_instructions: '',
  conversion_fee_estimate: 0,
  bank_fee_estimate: 0,
  supplier_cost_base: 0,
  ...defaults,
})

const tabBtn = (active: boolean): CSSProperties => ({
  ...buttonSecondaryStyle,
  background: active ? colors.accent : 'rgba(255,255,255,0.06)',
  borderColor: active ? colors.accent : colors.border,
  padding: '8px 14px',
})

export default function QuotationsPage() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StatusTab>('All')
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Quotation | null>(null)
  const [form, setForm] = useState<QuoteForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null)
  const [outcomeTarget, setOutcomeTarget] = useState<Quotation | null>(null)
  const [outcomeStatus, setOutcomeStatus] = useState('Awarded')
  const [outcomeReason, setOutcomeReason] = useState('')
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null)
  const [depositPct, setDepositPct] = useState('100')
  const [clientSuggest, setClientSuggest] = useState(false)

  const vatRate = Number(settings.vatRate || VAT_RATE) || VAT_RATE
  const quotePrefix = settings.quotePrefix || 'RR'
  const who = user?.email || ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [qRes, cRes, pRes] = await Promise.all([
        db.from('quotations').select('*').order('created_at', { ascending: false }),
        db.from('clients').select('*').order('company_name'),
        db.from('products').select('*').eq('active', true).order('name'),
      ])
      if (qRes.error) throw qRes.error
      if (cRes.error) throw cRes.error

      const validityDays = Number(settings.quoteValidityDays || 14) || 14
      let rows = sortByDateDesc((qRes.data || []) as Quotation[])

      // Backfill valid_until on finalized quotes that never got one
      const needValidUntil = rows.filter(
        (q) =>
          q.reference_number &&
          !q.valid_until &&
          ['Finalized', 'Sent', 'Awarded', 'Expired'].includes(q.status),
      )
      for (const q of needValidUntil) {
        const until = quoteValidUntil(q.date, validityDays)
        if (!until) continue
        await db.from('quotations').update({ valid_until: until }).eq('id', q.id)
        q.valid_until = until
      }

      // Auto-mark past-validity open quotes as Expired
      const toExpire = rows.filter((q) => {
        if (!['Finalized', 'Sent'].includes(q.status)) return false
        const until = q.valid_until || quoteValidUntil(q.date, validityDays)
        return until ? isQuotePastValidity(until) : false
      })
      if (toExpire.length) {
        await Promise.all(
          toExpire.map((q) =>
            db
              .from('quotations')
              .update({
                status: 'Expired',
                valid_until: q.valid_until || quoteValidUntil(q.date, validityDays),
                updated_at: new Date().toISOString(),
              })
              .eq('id', q.id),
          ),
        )
        rows = rows.map((q) =>
          toExpire.some((e) => e.id === q.id)
            ? {
                ...q,
                status: 'Expired',
                valid_until: q.valid_until || quoteValidUntil(q.date, validityDays),
              }
            : q,
        )
        await Promise.all(
          toExpire.map((q) =>
            syncCrmFromQuote({
              client: q.client,
              quoteRef: q.reference_number,
              quoteStatus: 'Expired',
            }),
          ),
        )
      }

      setQuotes(rows)
      setClients((cRes.data || []) as Client[])
      if (!pRes.error) setProducts((pRes.data || []) as Product[])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load quotations', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, settings.quoteValidityDays])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) setSearch(ref)
  }, [searchParams])

  useEffect(() => {
    const wantNew = searchParams.get('new') === '1'
    const client = searchParams.get('client')
    const division = searchParams.get('division')
    if (!wantNew || loading) return
    setEditing(null)
    setForm(
      emptyForm({
        client: client || '',
        division_code: division === '02' ? '02' : '01',
        payment_terms: settings.paymentTerms || PAYMENT_TERMS[0],
        delivery_terms: settings.deliveryTerms || DELIVERY_TERMS[0],
        moq: division === '02' ? '' : settings.moqDefault || '50',
        ...(division === '02'
          ? {
              quotation_currency: settings.wandersBaseCurrency || 'TBC',
              payment_currency: settings.wandersBaseCurrency || 'TBC',
              booking_currency: settings.wandersBaseCurrency || 'TBC',
              supplier_currency: settings.wandersBaseCurrency || 'TBC',
            }
          : {}),
      }),
    )
    setEditorOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, loading, setSearchParams, settings])

  useEffect(() => {
    const templateId = searchParams.get('template')
    if (!templateId || loading) return

    void (async () => {
      const { data, error } = await db
        .from('quote_templates')
        .select('*')
        .eq('id', templateId)
        .maybeSingle()
      if (error || !data) return
      const t = data as QuoteTemplate
      const itemsRaw = Array.isArray(t.items_json) ? t.items_json : []
      const items =
        itemsRaw.length > 0
          ? itemsRaw.map((row: unknown) => {
              const r = row as {
                description?: string
                qty?: number
                unit_price?: number
                remarks?: string
                sku?: string
              }
              return newDraftLine({
                description: r.description || '',
                qty: Number(r.qty) || 1,
                unit_price: Number(r.unit_price) || 0,
                remarks: r.remarks || '',
                sku: r.sku || '',
              })
            })
          : [newDraftLine()]
      setEditing(null)
      setForm(
        emptyForm({
          division_code: t.division_code || '01',
          description: t.description || t.name,
          payment_terms: settings.paymentTerms || PAYMENT_TERMS[0],
          delivery_terms: settings.deliveryTerms || DELIVERY_TERMS[0],
          moq: settings.moqDefault || '50',
          items,
        }),
      )
      setEditorOpen(true)
      setSearchParams({}, { replace: true })
    })()
  }, [searchParams, loading, setSearchParams, settings])

  const filtered = useMemo(() => {
    let list = quotes
    if (tab !== 'All') list = list.filter((q) => q.status === tab)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (row) =>
          row.client.toLowerCase().includes(q) ||
          row.reference_number.toLowerCase().includes(q) ||
          row.quote_id.toLowerCase().includes(q) ||
          row.description.toLowerCase().includes(q),
      )
    }
    return list
  }, [quotes, tab, search])

  const totals = useMemo(() => calcTotals(form.items, vatRate), [form.items, vatRate])

  const divisionBrand = (code: string) =>
    DIVISIONS.find((d) => d.code === code)?.brand || code

  async function openCreate() {
    setEditing(null)
    setForm(
      emptyForm({
        payment_terms: settings.paymentTerms || PAYMENT_TERMS[0],
        delivery_terms: settings.deliveryTerms || DELIVERY_TERMS[0],
        moq: settings.moqDefault || '50',
      }),
    )
    setEditorOpen(true)
  }

  async function openEdit(q: Quotation) {
    setEditing(q)
    try {
      const items = await loadLineItems('Quote', q.quote_id)
      setForm({
        client: q.client || '',
        division_code: q.division_code || '01',
        description: q.description || '',
        payment_terms: q.payment_terms || '',
        delivery_terms: q.delivery_terms || '',
        moq: q.moq || '',
        notes: q.notes || '',
        date: q.date ? q.date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
        items: toDraftItems(items),
        quotation_currency: q.quotation_currency || q.currency || BASE_CURRENCY,
        payment_currency: q.payment_currency || q.quotation_currency || BASE_CURRENCY,
        supplier_currency: q.supplier_currency || BASE_CURRENCY,
        booking_currency: q.booking_currency || BASE_CURRENCY,
        fx_rate: Number(q.fx_rate) || 1,
        fx_rate_date: q.fx_rate_date ? q.fx_rate_date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
        rate_valid_until: q.rate_valid_until ? q.rate_valid_until.slice(0, 10) : '',
        charges_borne_by: q.charges_borne_by || 'Customer',
        accept_other_payment_currency: q.accept_other_payment_currency !== false,
        net_amount_required: q.net_amount_required || '',
        payment_instructions: q.payment_instructions || '',
        conversion_fee_estimate: Number(q.conversion_fee_estimate) || 0,
        bank_fee_estimate: Number(q.bank_fee_estimate) || 0,
        supplier_cost_base: Number(q.supplier_cost_base) || 0,
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

  async function saveDraft() {
    if (!form.client.trim() && !form.items.some((i) => i.description.trim())) {
      showToast('Add a client or line items before saving', 'error')
      return
    }
    setSaving(true)
    try {
      const amount = totals.total
      const vertical = divisionBrand(form.division_code)
      const quoteId = editing?.quote_id || makeQuoteId()
      const fxRate = Number(form.fx_rate) || 1
      const baseAmount = toBaseAmount(amount, fxRate)
      const currencyFields = {
        currency: form.quotation_currency,
        quotation_currency: form.quotation_currency,
        payment_currency: form.payment_currency,
        supplier_currency: form.supplier_currency,
        booking_currency: form.booking_currency,
        fx_rate: fxRate,
        fx_rate_date: form.fx_rate_date || null,
        fx_rate_approved_by: who,
        fx_rate_approved_at: new Date().toISOString(),
        base_amount: baseAmount,
        conversion_fee_estimate: Number(form.conversion_fee_estimate) || 0,
        bank_fee_estimate: Number(form.bank_fee_estimate) || 0,
        charges_borne_by: form.charges_borne_by,
        net_amount_required: form.net_amount_required,
        accept_other_payment_currency: form.accept_other_payment_currency,
        rate_valid_until: form.rate_valid_until || null,
        payment_instructions: form.payment_instructions,
        supplier_cost_base: Number(form.supplier_cost_base) || 0,
        estimated_gross_profit_base: baseAmount - (Number(form.supplier_cost_base) || 0),
      }
      const payload = {
        client: form.client.trim(),
        vertical,
        division_code: form.division_code,
        description: form.description.trim(),
        payment_terms: form.payment_terms,
        delivery_terms: form.delivery_terms,
        moq: form.moq,
        notes: form.notes,
        date: form.date || null,
        amount,
        quote_id: quoteId,
        updated_by: who,
        updated_at: new Date().toISOString(),
        ...currencyFields,
      }

      if (form.quotation_currency !== BASE_CURRENCY || fxRate !== 1) {
        await approveFxRate({
          from: form.quotation_currency,
          rate: fxRate,
          rateDate: form.fx_rate_date,
          approvedBy: who,
          notes: `Quote draft ${quoteId}`,
        })
      }

      if (editing) {
        const { error } = await db.from('quotations').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('quotations').insert({
          ...payload,
          ...quotationCurrencyDefaults(),
          ...currencyFields,
          status: 'Draft',
          reference_number: '',
          base_reference: '',
          revision: 0,
          created_by: who,
        })
        if (error) throw error
      }

      await saveLineItems('Quote', quoteId, form.items, vatRate)
      await logActivity('save_quote', 'quotation', 'DRAFT', `${payload.client} · Draft`, who)
      showToast('Draft saved', 'success')
      setEditorOpen(false)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function finalize(q: Quotation) {
    if (!q.client) {
      showToast('Client is required before finalizing', 'error')
      return
    }
    setSaving(true)
    try {
      const { data: allRefs } = await db.from('quotations').select('reference_number')
      const refs = ((allRefs || []) as { reference_number: string }[]).map((r) => r.reference_number)
      const reference = generateReference(q.division_code || '01', refs, quotePrefix)
      const validityDays = Number(settings.quoteValidityDays || 14) || 14
      const validUntil = quoteValidUntil(q.date || format(new Date(), 'yyyy-MM-dd'), validityDays)
      const { error } = await db
        .from('quotations')
        .update({
          reference_number: reference,
          base_reference: reference,
          status: 'Finalized',
          revision: q.revision || 0,
          valid_until: validUntil,
          updated_by: who,
          updated_at: new Date().toISOString(),
        })
        .eq('id', q.id)
      if (error) throw error
      await logActivity('finalize_quote', 'quotation', reference, q.client, who)
      await syncCrmFromQuote({
        client: q.client,
        quoteRef: reference,
        quoteStatus: 'Finalized',
        userEmail: who,
      })
      showToast(`Finalized as ${reference}`, 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Finalize failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function undoFinalize(q: Quotation) {
    if (!q.reference_number) return
    setSaving(true)
    try {
      const { data: inv } = await db
        .from('invoices')
        .select('id')
        .eq('reference_number', q.reference_number)
        .maybeSingle()
      if (inv?.id) {
        showToast('Cannot undo — invoice exists for this reference', 'error')
        return
      }
      const { error } = await db
        .from('quotations')
        .update({
          status: 'Draft',
          reference_number: '',
          base_reference: '',
          updated_by: who,
          updated_at: new Date().toISOString(),
        })
        .eq('id', q.id)
      if (error) throw error
      await logActivity('undo_finalize', 'quotation', q.quote_id, q.client, who)
      showToast('Reverted to Draft', 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Undo failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function revise(q: Quotation) {
    if (!q.reference_number) {
      showToast('Finalize before revising', 'error')
      return
    }
    setSaving(true)
    try {
      const base = parseBaseReference(q.base_reference || q.reference_number)
      const nextRev = Number(q.revision || 0) + 1
      const newRef = formatRevisionReference(base, nextRev)
      const newQuoteId = makeQuoteId()
      const items = await loadLineItems('Quote', q.quote_id)

      await db.from('quotations').update({ status: 'Superseded', updated_by: who }).eq('id', q.id)

      const newDate = format(new Date(), 'yyyy-MM-dd')
      const validityDays = Number(settings.quoteValidityDays || 14) || 14
      const { error } = await db.from('quotations').insert({
        client: q.client,
        vertical: q.vertical,
        division_code: q.division_code,
        description: q.description,
        payment_terms: q.payment_terms,
        delivery_terms: q.delivery_terms,
        moq: q.moq,
        notes: q.notes,
        date: newDate,
        amount: q.amount,
        status: 'Finalized',
        reference_number: newRef,
        base_reference: base,
        revision: nextRev,
        quote_id: newQuoteId,
        valid_until: quoteValidUntil(newDate, validityDays),
        created_by: who,
        updated_by: who,
      })
      if (error) throw error

      await saveLineItems(
        'Quote',
        newQuoteId,
        toDraftItems(items),
        vatRate,
      )
      await logActivity('revise_quote', 'quotation', newRef, `Rev ${nextRev} of ${base}`, who)
      await syncCrmFromQuote({
        client: q.client,
        quoteRef: newRef,
        quoteStatus: 'Finalized',
        userEmail: who,
      })
      showToast(`Created revision ${newRef}`, 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Revise failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function duplicate(q: Quotation) {
    setSaving(true)
    try {
      const items = await loadLineItems('Quote', q.quote_id)
      const newQuoteId = makeQuoteId()
      const { error } = await db.from('quotations').insert({
        client: q.client,
        vertical: q.vertical,
        division_code: q.division_code,
        description: q.description,
        payment_terms: q.payment_terms,
        delivery_terms: q.delivery_terms,
        moq: q.moq,
        notes: q.notes,
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: q.amount,
        status: 'Draft',
        reference_number: '',
        base_reference: '',
        revision: 0,
        quote_id: newQuoteId,
        created_by: who,
        updated_by: who,
      })
      if (error) throw error
      await saveLineItems('Quote', newQuoteId, toDraftItems(items), vatRate)
      await logActivity('duplicate_quote', 'quotation', 'DRAFT', q.client, who)
      showToast('Duplicated as new Draft', 'success')
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
      await deleteLineItems('Quote', [deleteTarget.quote_id])
      const { error } = await db.from('quotations').delete().eq('id', deleteTarget.id)
      if (error) throw error
      await logActivity('delete_quote', 'quotation', deleteTarget.quote_id, deleteTarget.client, who)
      showToast('Quotation deleted', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveOutcome() {
    if (!outcomeTarget) return
    setSaving(true)
    try {
      const { error } = await db
        .from('quotations')
        .update({
          status: outcomeStatus,
          outcome_reason: outcomeReason.trim(),
          updated_by: who,
          updated_at: new Date().toISOString(),
        })
        .eq('id', outcomeTarget.id)
      if (error) throw error
      await logActivity(
        'set_outcome',
        'quotation',
        outcomeTarget.reference_number || outcomeTarget.quote_id,
        `${outcomeStatus}: ${outcomeReason}`,
        who,
      )
      await syncCrmFromQuote({
        client: outcomeTarget.client,
        quoteRef: outcomeTarget.reference_number,
        quoteStatus: outcomeStatus,
        outcomeReason,
        userEmail: who,
      })

      // Inventory: reserve on Awarded, release when lost / not awarded / expired
      try {
        const lines = await loadLineItems(
          'Quote',
          outcomeTarget.quote_id || outcomeTarget.reference_number,
        )
        const ref = outcomeTarget.reference_number || outcomeTarget.quote_id
        if (outcomeStatus === 'Awarded') {
          await reserveStockForQuote({ lines, quoteRef: ref, userEmail: who })
        } else if (['Not awarded', 'Expired'].includes(outcomeStatus)) {
          if (outcomeTarget.status === 'Awarded') {
            await releaseStockForQuote({ lines, quoteRef: ref, userEmail: who })
          }
        }
      } catch (invErr) {
        console.error(invErr)
        showToast('Outcome saved, but inventory update failed', 'error')
      }

      showToast('Outcome updated', 'success')
      setOutcomeTarget(null)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to set outcome', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function convertToInvoice() {
    if (!convertTarget?.reference_number) {
      showToast('Finalize before converting', 'error')
      return
    }
    setSaving(true)
    try {
      const q = convertTarget
      const { data: existing } = await db
        .from('invoices')
        .select('id')
        .eq('reference_number', q.reference_number)
        .maybeSingle()
      if (existing?.id) {
        showToast('Invoice already exists for this reference', 'error')
        setConvertTarget(null)
        navigate('/invoices')
        return
      }

      const pct = Math.min(100, Math.max(0, Number(depositPct) || 100))
      const items = await loadLineItems('Quote', q.quote_id)
      let draftItems = toDraftItems(items)
      if (pct < 100) {
        draftItems = draftItems.map((it) => ({
          ...it,
          unit_price: Math.round(((Number(it.unit_price) || 0) * pct) / 100 * 100) / 100,
          description: `${it.description} (${pct}% deposit)`,
        }))
      }
      const amount = calcTotals(draftItems, vatRate).total

      const { error } = await db.from('invoices').insert({
        client: q.client,
        vertical: q.vertical,
        reference_number: q.reference_number,
        date: format(new Date(), 'yyyy-MM-dd'),
        description: q.description,
        amount,
        status: 'Sent',
        payment_status: 'Pending',
        payment_terms: q.payment_terms,
        moq: q.moq,
        notes: q.notes,
        delivery_terms: q.delivery_terms,
        created_by: who,
        updated_by: who,
      })
      if (error) throw error

      await saveLineItems('Invoice', q.reference_number, draftItems, vatRate)

      try {
        await commitStockForInvoice({
          lines: items,
          invoiceRef: q.reference_number,
          userEmail: who,
        })
      } catch (invErr) {
        console.error(invErr)
        showToast('Invoice created, but inventory commit failed', 'error')
      }

      // Sync income (no unique constraint on reference_number — select then insert/update)
      const sub = calcTotals(draftItems, vatRate)
      const incomePayload = {
        client_source: q.client,
        category: q.vertical,
        reference_number: q.reference_number,
        date: format(new Date(), 'yyyy-MM-dd'),
        description: q.description,
        bill_amount: sub.subtotal,
        vat: sub.vat,
        total_amount: sub.total,
        status: 'Sent',
        payment_method: settings.paymentMethod || '',
        payment_status: 'Pending',
      }
      const { data: inc } = await db
        .from('income')
        .select('id')
        .eq('reference_number', q.reference_number)
        .maybeSingle()
      if (inc?.id) {
        await db.from('income').update(incomePayload).eq('id', inc.id)
      } else {
        await db.from('income').insert(incomePayload)
      }

      await logActivity('convert_invoice', 'invoice', q.reference_number, `${q.client} · ${pct}%`, who)
      showToast('Invoice created', 'success')
      setConvertTarget(null)
      navigate('/invoices')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Convert failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const clientMatches = clients
    .filter((c) => c.company_name.toLowerCase().includes(form.client.toLowerCase()))
    .slice(0, 8)

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Quotations</h1>
          <p style={pageSubtitleStyle}>Create, revise, and track quotations</p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={() => void openCreate()}>
          <Plus size={16} /> New quotation
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {(['All', 'Draft', 'Finalized', 'Sent', 'Awarded'] as StatusTab[]).map((t) => (
          <button key={t} type="button" style={tabBtn(tab === t)} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <input
          style={{ ...inputStyle, maxWidth: 260, marginLeft: 'auto' }}
          placeholder="Search client / ref…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading quotations…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FilePlus2 size={22} />}
          title="No quotations"
          subtitle="Create a draft or filter a different status."
          actionLabel="New quotation"
          onAction={() => void openCreate()}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Division</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => (
                  <tr key={q.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>
                        {q.reference_number || <span style={{ color: colors.muted2 }}>DRAFT</span>}
                      </div>
                      {q.valid_until && q.reference_number ? (
                        <div style={{ fontSize: 11, color: colors.muted2 }}>
                          Valid until {format(new Date(q.valid_until), 'dd MMM yyyy')}
                        </div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>{q.client || '—'}</td>
                    <td style={tdStyle}>{q.vertical || divisionBrand(q.division_code)}</td>
                    <td style={tdStyle}>
                      {q.date ? format(new Date(q.date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={tdStyle}>{formatAED(q.amount)}</td>
                    <td style={tdStyle}>
                      <StatusPill status={q.status} />
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button type="button" style={buttonSecondaryStyle} onClick={() => void openEdit(q)} title="Edit">
                          <Pencil size={14} />
                        </button>
                        {(q.reference_number || q.id) && (
                          <Link
                            to={`/document/quote/${q.id}`}
                            style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                            title="View / email PDF"
                          >
                            <ExternalLink size={14} /> PDF / Email
                          </Link>
                        )}
                        {q.status === 'Draft' && (
                          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void finalize(q)}>
                            Finalize
                          </button>
                        )}
                        {q.status === 'Finalized' && (
                          <>
                            <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => void undoFinalize(q)} title="Undo finalize">
                              <RotateCcw size={14} />
                            </button>
                            <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => void revise(q)}>
                              Revise
                            </button>
                          </>
                        )}
                        {['Finalized', 'Sent', 'Awarded'].includes(q.status) && (
                          <button
                            type="button"
                            style={buttonSecondaryStyle}
                            onClick={() => {
                              setOutcomeTarget(q)
                              setOutcomeStatus('Awarded')
                              setOutcomeReason(q.outcome_reason || '')
                            }}
                          >
                            Outcome
                          </button>
                        )}
                        {q.status === 'Awarded' && q.reference_number && (
                          <button
                            type="button"
                            style={buttonPrimaryStyle}
                            onClick={() => {
                              setConvertTarget(q)
                              setDepositPct('100')
                            }}
                          >
                            <Receipt size={14} /> Invoice
                          </button>
                        )}
                        <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => void duplicate(q)} title="Duplicate">
                          <Copy size={14} />
                        </button>
                        <button type="button" style={buttonDangerStyle} onClick={() => setDeleteTarget(q)} title="Delete">
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

      <Modal
        open={editorOpen}
        title={editing ? `Edit quotation` : 'New quotation'}
        onClose={() => setEditorOpen(false)}
        width={920}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={{ ...fieldStyle, position: 'relative' }}>
            <label style={labelStyle}>Client *</label>
            <input
              style={inputStyle}
              value={form.client}
              onChange={(e) => {
                setForm((f) => ({ ...f, client: e.target.value }))
                setClientSuggest(true)
              }}
              onFocus={() => setClientSuggest(true)}
              onBlur={() => window.setTimeout(() => setClientSuggest(false), 150)}
              placeholder="Company name"
            />
            {clientSuggest && form.client && clientMatches.length > 0 && (
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
                {clientMatches.map((c) => (
                  <button
                    key={c.id}
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
                      setForm((f) => ({ ...f, client: c.company_name }))
                      setClientSuggest(false)
                    }}
                  >
                    {c.company_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Division</label>
            <select
              style={selectStyle}
              value={form.division_code}
              onChange={(e) => setForm((f) => ({ ...f, division_code: e.target.value }))}
            >
              {DIVISIONS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.brand}
                </option>
              ))}
            </select>
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
          <div style={fieldStyle}>
            <label style={labelStyle}>Delivery terms</label>
            <select
              style={selectStyle}
              value={form.delivery_terms}
              onChange={(e) => setForm((f) => ({ ...f, delivery_terms: e.target.value }))}
            >
              <option value="">—</option>
              {DELIVERY_TERMS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>MOQ</label>
            <input
              style={inputStyle}
              value={form.moq}
              onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))}
            />
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

        <div style={{ marginTop: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>Line items</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            {products.length > 0 && (
              <select
                style={{ ...selectStyle, minWidth: 180 }}
                defaultValue=""
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value)
                  if (!p) return
                  setForm((f) => ({
                    ...f,
                    items: [
                      ...f.items,
                      newDraftLine({
                        description: [p.sku, `${p.name}${p.fabric ? ` (${p.fabric})` : ''}`]
                          .filter(Boolean)
                          .join(' — '),
                        qty: p.moq || 1,
                        unit_price: Number(p.unit_price) || 0,
                        sku: p.sku || '',
                        sizes: p.track_sizes ? emptySizeBreakdown() : null,
                      }),
                    ],
                  }))
                  e.target.value = ''
                }}
              >
                <option value="">Add from catalog…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku ? `${p.sku} — ` : ''}{p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => setForm((f) => ({ ...f, items: [...f.items, newDraftLine()] }))}
            >
              <Plus size={14} /> Row
            </button>
          </div>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Unit price</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>VAT</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((it) => {
                const qty = effectiveQty(it)
                const amount = qty * (Number(it.unit_price) || 0)
                const vat = amount * vatRate
                const lineTotal = amount + vat
                return (
                  <Fragment key={it.key}>
                    <tr>
                      <td style={tdStyle}>
                        <input
                          style={inputStyle}
                          value={it.description}
                          onChange={(e) => updateItem(it.key, { description: e.target.value })}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            type="button"
                            style={{ ...buttonSecondaryStyle, padding: '2px 8px', fontSize: 11 }}
                            onClick={() =>
                              updateItem(it.key, {
                                sizes: it.sizes ? null : emptySizeBreakdown(),
                                qty: it.sizes ? sumSizes(it.sizes) || 1 : it.qty,
                              })
                            }
                          >
                            {it.sizes ? 'Clear sizes' : 'Size run'}
                          </button>
                          {it.sku ? (
                            <span style={{ fontSize: 11, color: colors.muted2 }}>SKU {it.sku}</span>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, width: 90 }}>
                        <input
                          type="number"
                          style={inputStyle}
                          value={qty}
                          disabled={!!it.sizes}
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
                      <td style={tdStyle}>{formatAED(amount)}</td>
                      <td style={tdStyle}>{formatAED(vat)}</td>
                      <td style={tdStyle}>{formatAED(lineTotal)}</td>
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
                    {it.sizes ? (
                      <tr>
                        <td style={tdStyle} colSpan={7}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {STANDARD_SIZES.map((s) => (
                              <label key={s} style={{ fontSize: 11, color: colors.muted }}>
                                {s}
                                <input
                                  type="number"
                                  min={0}
                                  style={{ ...inputStyle, width: 64, marginTop: 4, display: 'block' }}
                                  value={Number(it.sizes?.[s] || 0)}
                                  onChange={(e) => {
                                    const next = { ...(it.sizes || {}) }
                                    next[s] = Number(e.target.value) || 0
                                    updateItem(it.key, { sizes: next, qty: sumSizes(next) })
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 24,
            fontSize: 14,
          }}
        >
          <div>
            Subtotal:{' '}
            <strong>
              {form.quotation_currency} {totals.subtotal.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </strong>
          </div>
          <div>
            VAT ({(vatRate * 100).toFixed(0)}%):{' '}
            <strong>
              {form.quotation_currency} {totals.vat.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </strong>
          </div>
          <div>
            Total:{' '}
            <strong style={{ color: colors.accent }}>
              {form.quotation_currency} {totals.total.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </strong>
          </div>
          <div style={{ color: colors.muted2 }}>
            ≈ AED {toBaseAmount(totals.total, form.fx_rate).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            padding: 14,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            background: form.division_code === '02' ? 'rgba(96,165,250,0.06)' : 'transparent',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
            Currencies & payment instructions
            {form.division_code === '02' ? ' · RR Wanders' : ''}
          </div>
          <div style={formGridStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Quotation currency</label>
              <select
                style={selectStyle}
                value={form.quotation_currency}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    quotation_currency: e.target.value,
                    payment_currency: f.payment_currency || e.target.value,
                    fx_rate: e.target.value === BASE_CURRENCY ? 1 : f.fx_rate,
                  }))
                }
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} — {CURRENCY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Customer payment currency</label>
              <select
                style={selectStyle}
                value={form.payment_currency}
                onChange={(e) => setForm((f) => ({ ...f, payment_currency: e.target.value }))}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Supplier currency</label>
              <select
                style={selectStyle}
                value={form.supplier_currency}
                onChange={(e) => setForm((f) => ({ ...f, supplier_currency: e.target.value }))}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Booking / reporting currency</label>
              <select
                style={selectStyle}
                value={form.booking_currency}
                onChange={(e) => setForm((f) => ({ ...f, booking_currency: e.target.value }))}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>FX rate (1 quote unit → AED)</label>
              <input
                type="number"
                step="0.0001"
                style={inputStyle}
                value={form.fx_rate}
                onChange={(e) => setForm((f) => ({ ...f, fx_rate: Number(e.target.value) }))}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Rate date</label>
              <input
                type="date"
                style={inputStyle}
                value={form.fx_rate_date}
                onChange={(e) => setForm((f) => ({ ...f, fx_rate_date: e.target.value }))}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Rate valid until</label>
              <input
                type="date"
                style={inputStyle}
                value={form.rate_valid_until}
                onChange={(e) => setForm((f) => ({ ...f, rate_valid_until: e.target.value }))}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bank / FX charges borne by</label>
              <select
                style={selectStyle}
                value={form.charges_borne_by}
                onChange={(e) => setForm((f) => ({ ...f, charges_borne_by: e.target.value }))}
              >
                <option value="Customer">Customer</option>
                <option value="RR Wanders">RR Wanders</option>
                <option value="Shared">Shared</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Conversion fee estimate</label>
              <input
                type="number"
                style={inputStyle}
                value={form.conversion_fee_estimate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, conversion_fee_estimate: Number(e.target.value) }))
                }
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bank fee estimate</label>
              <input
                type="number"
                style={inputStyle}
                value={form.bank_fee_estimate}
                onChange={(e) => setForm((f) => ({ ...f, bank_fee_estimate: Number(e.target.value) }))}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Supplier cost (AED)</label>
              <input
                type="number"
                style={inputStyle}
                value={form.supplier_cost_base}
                onChange={(e) => setForm((f) => ({ ...f, supplier_cost_base: Number(e.target.value) }))}
              />
            </div>
            <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
              <input
                type="checkbox"
                checked={form.accept_other_payment_currency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accept_other_payment_currency: e.target.checked }))
                }
                id="accept-other-ccy"
              />
              <label htmlFor="accept-other-ccy" style={{ fontSize: 13 }}>
                Accept other payment currencies
              </label>
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Net amount that must be received</label>
            <input
              style={inputStyle}
              value={form.net_amount_required}
              onChange={(e) => setForm((f) => ({ ...f, net_amount_required: e.target.value }))}
              placeholder="e.g. USD 2,500 net of all bank charges"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Payment instructions (selected currency)</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              value={form.payment_instructions}
              onChange={(e) => setForm((f) => ({ ...f, payment_instructions: e.target.value }))}
              placeholder="Bank name, IBAN, SWIFT, beneficiary…"
            />
          </div>
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
          <button type="button" style={buttonSecondaryStyle} onClick={() => setEditorOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void saveDraft()}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete quotation?" onClose={() => setDeleteTarget(null)} width={420}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Delete <strong style={{ color: colors.text }}>{deleteTarget?.reference_number || deleteTarget?.quote_id}</strong> and its line items? This cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button type="button" style={buttonDangerStyle} disabled={saving} onClick={() => void confirmDelete()}>
            Delete
          </button>
        </div>
      </Modal>

      <Modal open={!!outcomeTarget} title="Set outcome" onClose={() => setOutcomeTarget(null)} width={440}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Status</label>
          <select style={selectStyle} value={outcomeStatus} onChange={(e) => setOutcomeStatus(e.target.value)}>
            {QUOTE_STATUSES.filter((s) => ['Awarded', 'Not awarded', 'Expired', 'Sent'].includes(s)).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Reason</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            value={outcomeReason}
            onChange={(e) => setOutcomeReason(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOutcomeTarget(null)}>Cancel</button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void saveOutcome()}>
            Save
          </button>
        </div>
      </Modal>

      <Modal open={!!convertTarget} title="Convert to invoice" onClose={() => setConvertTarget(null)} width={440}>
        <p style={{ color: colors.muted, fontSize: 14, marginTop: 0 }}>
          Create invoice from <strong style={{ color: colors.text }}>{convertTarget?.reference_number}</strong>
        </p>
        <div style={fieldStyle}>
          <label style={labelStyle}>Deposit % (of line amounts)</label>
          <input
            type="number"
            min={1}
            max={100}
            style={inputStyle}
            value={depositPct}
            onChange={(e) => setDepositPct(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setConvertTarget(null)}>Cancel</button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void convertToInvoice()}>
            Create invoice
          </button>
        </div>
      </Modal>
    </div>
  )
}
