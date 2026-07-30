import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
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
import { syncCrmFromQuote } from '../lib/crmSync'
import { formatAED } from '../lib/money'
import {
  generateReference,
  formatRevisionReference,
  parseBaseReference,
} from '../lib/referenceNumber'
import {
  calcTotals,
  deleteLineItems,
  loadLineItems,
  makeQuoteId,
  newDraftLine,
  saveLineItems,
  toDraftItems,
  type DraftLineItem,
} from '../lib/lineItems'
import { sortByDateDesc } from '../lib/finance'
import { isQuotePastValidity, quoteValidUntil } from '../lib/documents'
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
    if (!wantNew || loading) return
    setEditing(null)
    setForm(
      emptyForm({
        client: client || '',
        payment_terms: settings.paymentTerms || PAYMENT_TERMS[0],
        delivery_terms: settings.deliveryTerms || DELIVERY_TERMS[0],
        moq: settings.moqDefault || '50',
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
              const r = row as { description?: string; qty?: number; unit_price?: number; remarks?: string }
              return newDraftLine({
                description: r.description || '',
                qty: Number(r.qty) || 1,
                unit_price: Number(r.unit_price) || 0,
                remarks: r.remarks || '',
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
      }

      if (editing) {
        const { error } = await db.from('quotations').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('quotations').insert({
          ...payload,
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
                const amount = (Number(it.qty) || 0) * (Number(it.unit_price) || 0)
                const vat = amount * vatRate
                const lineTotal = amount + vat
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
          <div>Subtotal: <strong>{formatAED(totals.subtotal)}</strong></div>
          <div>VAT ({(vatRate * 100).toFixed(0)}%): <strong>{formatAED(totals.vat)}</strong></div>
          <div>Total: <strong style={{ color: colors.accent }}>{formatAED(totals.total)}</strong></div>
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
