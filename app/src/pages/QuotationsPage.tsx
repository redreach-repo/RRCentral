import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { FilePlus2, Plus, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import {
  DELIVERY_TERMS,
  DIVISIONS,
  PAYMENT_TERMS,
  QUOTE_STATUSES,
  VAT_RATE,
} from '../lib/config'
import type { Client, CrmContact, CrmEntry, Product, Quotation, QuoteTemplate, Vendor } from '../lib/types'
import {
  contactsForCompany,
  contactToQuoteFields,
  EMPTY_QUOTE_CONTACT,
  quoteContactLabel,
  resolveQuoteContactSelection,
  shouldShowQuoteContactPicker,
} from '../lib/quoteContact'
import { useAuth } from '../contexts/AuthContext'
import { can } from '../lib/permissions'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EditorSectionTabs, {
  editorPanelStyle,
  type EditorSection,
} from '../components/EditorSectionTabs'
import LineItemImageField from '../components/LineItemImageField'
import CustomFieldsCard from '../components/CustomFieldsCard'
import SavedViewsBar from '../components/SavedViewsBar'
import ClientBillToFields from '../components/ClientBillToFields'
import {
  normalizeQuotationsFilters,
  quotationsFiltersEqual,
  type QuotationsViewFilters,
} from '../lib/savedViews'
import { useClientBillTo } from '../hooks/useClientBillTo'
import SupplierInvoiceModal from '../components/quotations/SupplierInvoiceModal'
import QuoteRowActions from '../components/quotations/QuoteRowActions'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import qStyles from '../styles/docsList.module.css'
import { logActivity } from '../lib/activity'
import {
  calcTotals,
  deleteLineItems,
  effectiveQty,
  loadLineItems,
  makeQuoteId,
  newDraftLine,
  OFFSET_VAT_SETTING_KEY,
  parseOffsetVatQuoteKeys,
  quoteOffsetsVat,
  saveLineItems,
  toDraftItems,
  withOffsetVatQuoteKeys,
  foldVatIntoUnitPrices,
  parseMoneyInput,
  round2,
  type DraftLineItem,
} from '../lib/lineItems'
import { STANDARD_SIZES, emptySizeBreakdown, sumSizes } from '../lib/sizes'
import { commitStockForInvoice, releaseStockForQuote, reserveStockForQuote } from '../lib/inventory'
import { syncCrmFromQuote } from '../lib/crmSync'
import { ensureCompanyFromDocument } from '../lib/ensureCompanyFromDocument'
import { formatAED } from '../lib/money'
import { formatRevisionReference, parseBaseReference } from '../lib/referenceNumber'
import { allocateReference } from '../lib/numbering'
import { parseQuotationForm } from '../lib/schemas/quotation'
import { sortByDateDesc } from '../lib/finance'
import { isQuotePastValidity, quoteValidUntil } from '../lib/documents'
import { errorMessage, isUndefinedColumnError } from '../lib/errors'
import { createDeliveryNoteFromQuote, matchQuoteForDeliveryNote } from '../lib/deliveryNotes'
import { resolveDealRef } from '../lib/dealQuotes'
import { registerLineItemSkus } from '../lib/skuRegistry'
import { listVendors } from '../lib/vendors'
import {
  BASE_CURRENCY,
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
  toBaseAmount,
} from '../lib/currency'
import { approveFxRate, quotationCurrencyDefaults } from '../lib/customerPayments'
import { getDivisionQuoteFormat } from '../lib/divisionQuoteFormats'
import { ensureDivisionCataloguesSeeded } from '../lib/syncDivisionCatalogues'
import { CONNECT_PARTNER } from '../lib/seedDivisionCatalogues'
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
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  formGridStyle,
} from '../lib/uiStyles'

type StatusTab = 'All' | 'Draft' | 'Finalized' | 'Sent' | 'Awarded'

interface QuoteForm {
  client: string
  /** Selected CRM/client contact id for the picker (not persisted). */
  contact_id: string
  contact_name: string
  contact_email: string
  contact_phone: string
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
  /** Percent off subtotal before VAT. */
  discount_percent: number
  /** Fixed amount off subtotal before VAT. */
  discount_amount: number
  /** Add VAT then discount that VAT so the customer pays the subtotal. */
  offset_vat: boolean
}

const emptyForm = (defaults?: Partial<QuoteForm>): QuoteForm => ({
  client: '',
  contact_id: '',
  ...EMPTY_QUOTE_CONTACT,
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
  discount_percent: 0,
  discount_amount: 0,
  offset_vat: false,
  ...defaults,
})

export default function QuotationsPage() {
  const { user, userRole, appUserId } = useAuth()
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const canDeleteQuote = can(userRole, 'quote.deleteAny')

  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [crmRows, setCrmRows] = useState<CrmEntry[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StatusTab>('All')
  const [search, setSearch] = useState('')

  const currentQuoteViewFilters = useMemo(
    () => normalizeQuotationsFilters({ q: search, status: tab }),
    [search, tab],
  )

  const applyQuoteViewFilters = useCallback((raw: Record<string, unknown>) => {
    const f = raw as QuotationsViewFilters
    const nextStatus = String(f.status || 'All') as StatusTab
    const allowed: StatusTab[] = ['All', 'Draft', 'Finalized', 'Sent', 'Awarded']
    setTab(allowed.includes(nextStatus) ? nextStatus : 'All')
    setSearch(String(f.q || ''))
  }, [])
  /** Only one row’s action panel open at a time — keeps the table scannable. */
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorSection, setEditorSection] = useState<EditorSection>('basics')
  const [editing, setEditing] = useState<Quotation | null>(null)
  const [form, setForm] = useState<QuoteForm>(emptyForm())
  const billTo = useClientBillTo(clients)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null)
  const [outcomeTarget, setOutcomeTarget] = useState<Quotation | null>(null)
  const [outcomeStatus, setOutcomeStatus] = useState('Awarded')
  const [outcomeReason, setOutcomeReason] = useState('')
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null)
  const [depositPct, setDepositPct] = useState('100')
  const [dnTarget, setDnTarget] = useState<Quotation | null>(null)
  const [supplierInvoiceTarget, setSupplierInvoiceTarget] = useState<Quotation | null>(null)
  const [vatFoldOpen, setVatFoldOpen] = useState(false)
  const [vatFoldTarget, setVatFoldTarget] = useState('')
  const [clientSuggest, setClientSuggest] = useState(false)
  const compact = useCompactCrm()

  const vatRate = Number(settings.vatRate || VAT_RATE) || VAT_RATE
  const quotePrefix = settings.quotePrefix || 'RR'
  const who = user?.email || ''
  const activeFormat = getDivisionQuoteFormat(form.division_code, settings)
  const divisionProducts = useMemo(
    () => products.filter((p) => (p.division_code || '01') === form.division_code),
    [products, form.division_code],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await ensureDivisionCataloguesSeeded().catch(() => undefined)
      const [qRes, cRes, crmRes, pRes, vendorRows] = await Promise.all([
        db.from('quotations').select('*').order('created_at', { ascending: false }),
        db.from('clients').select('*').order('company_name'),
        db
          .from('crm')
          .select('id, company_name, primary_contact, email_phone, mobile_number, office_number, contacts')
          .order('company_name'),
        db.from('products').select('*').eq('active', true).order('name'),
        listVendors().catch(() => [] as Vendor[]),
      ])
      if (qRes.error) throw qRes.error
      if (cRes.error) throw cRes.error
      if (pRes.error) throw pRes.error
      setClients((cRes.data || []) as Client[])
      setCrmRows((crmRes.data || []) as CrmEntry[])
      setProducts((pRes.data || []) as Product[])
      setVendors(vendorRows)

      const validityDays = Number(settings.quoteValidityDays || 14) || 14
      let rows = sortByDateDesc((qRes.data || []) as Quotation[])

      // Backfill valid_until on finalized quotes that never got one
      const needValidUntil = rows.filter(
        (q) =>
          q.reference_number &&
          !q.valid_until &&
          ['Finalized', 'Sent', 'Accepted', 'Awarded', 'Expired'].includes(q.status),
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
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load quotations'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, settings.quoteValidityDays])

  const companyContacts = useMemo(
    () => contactsForCompany(form.client, { clients, crm: crmRows }),
    [form.client, clients, crmRows],
  )

  const contactFieldsForClient = useCallback(
    (
      company: string,
      saved?: Partial<Pick<Quotation, 'contact_name' | 'contact_email' | 'contact_phone'>> | null,
    ) => {
      const list = contactsForCompany(company, { clients, crm: crmRows })
      const picked = resolveQuoteContactSelection(list, saved)
      return { contact_id: picked.contactId, ...picked.fields }
    },
    [clients, crmRows],
  )

  function selectQuoteContact(contactId: string, list: CrmContact[] = companyContacts) {
    const hit = list.find((c) => c.id === contactId) || null
    setForm((f) => ({
      ...f,
      contact_id: contactId,
      ...contactToQuoteFields(hit),
    }))
  }

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const ref = searchParams.get('ref') || searchParams.get('quote')
    const client = searchParams.get('client')
    if (ref) setSearch(ref)
    else if (client && searchParams.get('new') !== '1') setSearch(client)
  }, [searchParams])

  useEffect(() => {
    if (loading) return
    const wantDn = searchParams.get('dn') === '1' || searchParams.get('deliveryNote') === '1'
    if (!wantDn) return
    const query = searchParams.get('quote') || searchParams.get('ref') || searchParams.get('client') || search
    const match = matchQuoteForDeliveryNote(quotes, query)
    if (match) setDnTarget(match)
    setSearchParams({}, { replace: true })
  }, [loading, quotes, search, searchParams, setSearchParams])

  useEffect(() => {
    const wantNew = searchParams.get('new') === '1'
    const client = searchParams.get('client')
    const division = searchParams.get('division')
    if (!wantNew || loading) return
    setEditing(null)
    billTo.reset()
    if (client) billTo.prefillFor(client)
    setForm(
      emptyForm({
        client: client || '',
        ...contactFieldsForClient(client || ''),
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
    setEditorSection('basics'); setEditorOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, loading, setSearchParams, settings, clients, crmRows, contactFieldsForClient, billTo])

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
      setEditorSection('basics'); setEditorOpen(true)
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

  const totals = useMemo(
    () =>
      calcTotals(form.items, vatRate, {
        discountPercent: form.offset_vat ? 0 : form.discount_percent,
        discountAmount: form.offset_vat ? 0 : form.discount_amount,
        offsetVat: form.offset_vat,
      }),
    [form.items, form.discount_percent, form.discount_amount, form.offset_vat, vatRate],
  )
  const vatFoldTargetAmount = parseMoneyInput(vatFoldTarget)
  const vatFoldPreview = useMemo(
    () =>
      vatFoldOpen
        ? foldVatIntoUnitPrices(form.items, vatRate, vatFoldTargetAmount)
        : null,
    [vatFoldOpen, form.items, vatRate, vatFoldTargetAmount],
  )

  const divisionBrand = (code: string) =>
    DIVISIONS.find((d) => d.code === code)?.brand || code

  function openSupplierInvoice(q: Quotation) {
    setSupplierInvoiceTarget(q)
  }

  async function openCreate() {
    setEditing(null)
    billTo.reset()
    setForm(
      emptyForm({
        payment_terms: settings.paymentTerms || PAYMENT_TERMS[0],
        delivery_terms: settings.deliveryTerms || DELIVERY_TERMS[0],
        moq: settings.moqDefault || '50',
      }),
    )
    setEditorSection('basics'); setEditorOpen(true)
  }

  async function openEdit(q: Quotation) {
    setEditing(q)
    try {
      const items = await loadLineItems('Quote', q.quote_id)
      billTo.reset()
      billTo.prefillFor(q.client || '')
      const contact = contactFieldsForClient(q.client || '', q)
      setForm({
        client: q.client || '',
        ...contact,
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
        discount_percent: Number(q.discount_percent) || 0,
        discount_amount: Number(q.discount_amount) || 0,
        offset_vat: quoteOffsetsVat(q, settings),
      })
      setEditorSection('basics'); setEditorOpen(true)
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

  async function saveDraft() {
    const parsed = parseQuotationForm({
      client: form.client,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone,
      division_code: form.division_code,
      description: form.description,
      payment_terms: form.payment_terms,
      delivery_terms: form.delivery_terms,
      moq: form.moq,
      notes: form.notes,
      date: form.date,
      quotation_currency: form.quotation_currency,
      payment_currency: form.payment_currency,
      fx_rate: Number(form.fx_rate) || 0,
      discount_percent: Number(form.discount_percent) || 0,
      discount_amount: Number(form.discount_amount) || 0,
      has_line_items: form.items.some((i) => i.description.trim()),
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    const f = parsed.data
    setSaving(true)
    // Which step failed is shown in the error, so problems can be diagnosed from a screenshot.
    let step = 'preparing the quote'
    try {
      const amount = totals.total
      const vertical = divisionBrand(f.division_code)
      const quoteId = editing?.quote_id || makeQuoteId()
      const fxRate = Number(f.fx_rate) || 1
      const baseAmount = toBaseAmount(amount, fxRate)
      const lineCostDoc = totals.cost
      const lineCostBase = toBaseAmount(lineCostDoc, fxRate)
      const revenueBase = toBaseAmount(totals.taxable, fxRate)
      const supplierCostBase =
        lineCostDoc > 0 ? lineCostBase : Number(form.supplier_cost_base) || 0
      const currencyFields = {
        currency: f.quotation_currency,
        quotation_currency: f.quotation_currency,
        payment_currency: f.payment_currency,
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
        supplier_cost_base: supplierCostBase,
        estimated_gross_profit_base: revenueBase - supplierCostBase,
      }
      const payload = {
        client: f.client,
        contact_name: f.contact_name,
        contact_email: f.contact_email,
        contact_phone: f.contact_phone,
        vertical,
        division_code: f.division_code,
        description: f.description,
        payment_terms: f.payment_terms,
        delivery_terms: f.delivery_terms,
        moq: f.moq,
        notes: f.notes,
        date: f.date || null,
        amount,
        discount_percent: form.offset_vat ? 0 : f.discount_percent,
        discount_amount: form.offset_vat ? 0 : f.discount_amount,
        offset_vat: form.offset_vat,
        quote_id: quoteId,
        updated_by: who,
        updated_at: new Date().toISOString(),
        ...currencyFields,
      }

      const stripOptionalQuoteColumns = <T extends Record<string, unknown>>(row: T) => {
        const {
          offset_vat: _o,
          contact_name: _n,
          contact_email: _e,
          contact_phone: _p,
          ...rest
        } = row
        return rest
      }

      if (f.quotation_currency !== BASE_CURRENCY || fxRate !== 1) {
        step = 'saving the FX rate'
        await approveFxRate({
          from: f.quotation_currency,
          rate: fxRate,
          rateDate: form.fx_rate_date,
          approvedBy: who,
          notes: `Quote draft ${quoteId}`,
        })
      }

      step = 'saving the quotation'
      if (editing) {
        const { error } = await db.from('quotations').update(payload).eq('id', editing.id)
        if (error && isUndefinedColumnError(error)) {
          const retry = await db
            .from('quotations')
            .update(stripOptionalQuoteColumns(payload))
            .eq('id', editing.id)
          if (retry.error) throw retry.error
        } else if (error) throw error
      } else {
        const insertRow = {
          ...payload,
          ...quotationCurrencyDefaults(),
          ...currencyFields,
          status: 'Draft',
          reference_number: '',
          base_reference: '',
          revision: 0,
          created_by: who,
        }
        const { error } = await db.from('quotations').insert(insertRow)
        if (error && isUndefinedColumnError(error)) {
          // Older DBs may lack offset_vat / contact_* — save without those columns.
          const retry = await db.from('quotations').insert(stripOptionalQuoteColumns(insertRow))
          if (retry.error) throw retry.error
        } else if (error) throw error
      }

      // Every line gets an SKU and a catalog / inventory record so it can be recalled later.
      step = 'registering SKUs in the catalog'
      const registered = await registerLineItemSkus(
        form.items,
        form.division_code,
        `quotation ${editing?.reference_number || quoteId}`,
      )
      step = 'saving line items'
      const lineSave = await saveLineItems('Quote', quoteId, registered.items, vatRate)
      const flagIds = [quoteId, editing?.id, editing?.reference_number].filter(
        (v): v is string => Boolean(v),
      )
      const nextFlags = withOffsetVatQuoteKeys(
        parseOffsetVatQuoteKeys(settings[OFFSET_VAT_SETTING_KEY]),
        flagIds,
        form.offset_vat,
      )
      step = 'saving the VAT setting'
      await updateSetting(OFFSET_VAT_SETTING_KEY, JSON.stringify(nextFlags))
      step = 'logging activity'
      await logActivity('save_quote', 'quotation', 'DRAFT', `${payload.client} · Draft`, who)
      step = 'saving the company (Clients, CRM, Drive)'
      if (payload.client.trim()) {
        try {
          const ensured = await ensureCompanyFromDocument({
            company: payload.client,
            address: billTo.draft.address,
            trn: billTo.draft.trn,
            contactName: form.contact_name,
            contactEmail: form.contact_email,
            contactPhone: form.contact_phone,
            owner: who.split('@')[0] || who,
            userEmail: who,
            source: 'quotation',
          })
          if (ensured.crm === 'created' && ensured.driveFolder === 'created') {
            showToast(`${payload.client} added to CRM · Google Drive folder ready`, 'success')
          } else if (ensured.crm === 'created') {
            showToast(`${payload.client} added to CRM`, 'success')
          } else if (ensured.client === 'created') {
            showToast(`${payload.client} added to Clients`, 'success')
          } else if (ensured.driveFolder === 'created') {
            showToast(`Google Drive folder ready for ${payload.client}`, 'success')
          }
          if (ensured.driveFolder === 'error' && ensured.detail) {
            showToast(`Company saved; Drive folder: ${ensured.detail}`, 'error')
          }
        } catch (e) {
          showToast(errorMessage(e, 'Draft saved, but the company could not be added to CRM'), 'error')
        }
      }
      if (lineSave.imagesDropped) {
        showToast(
          'Draft saved, but product images were dropped — apply the line_item_image DB migration, then re-save.',
          'error',
        )
      } else {
        showToast(
          registered.added
            ? `Draft saved · ${registered.added} new item${registered.added === 1 ? '' : 's'} added to the catalog`
            : 'Draft saved',
          'success',
        )
      }
      setEditorOpen(false)
      await load()
    } catch (e) {
      console.error(`[quotations] save failed while ${step}`, e)
      showToast(`Save failed while ${step}: ${errorMessage(e, 'unknown error')}`, 'error')
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
      const { data: invRefs } = await db.from('invoices').select('reference_number')
      const irefs = ((invRefs || []) as { reference_number: string }[]).map((r) => r.reference_number)
      const reference = await allocateReference({
        docType: 'quotation',
        divisionCode: q.division_code || '01',
        prefix: quotePrefix,
        existingRefs: [...refs, ...irefs],
      })
      const validityDays = Number(settings.quoteValidityDays || 14) || 14
      const validUntil = quoteValidUntil(q.date || format(new Date(), 'yyyy-MM-dd'), validityDays)
      const { error } = await db
        .from('quotations')
        .update({
          reference_number: reference,
          base_reference: reference,
          deal_ref: String(q.deal_ref || '').trim() || reference,
          status: 'Finalized',
          revision: q.revision || 0,
          valid_until: validUntil,
          updated_by: who,
          updated_at: new Date().toISOString(),
        })
        .eq('id', q.id)
      if (error && isUndefinedColumnError(error)) {
        const retry = await db
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
        if (retry.error) throw retry.error
      } else if (error) throw error
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
      showToast(errorMessage(e, 'Finalize failed'), 'error')
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
      showToast(errorMessage(e, 'Undo failed'), 'error')
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
      showToast(errorMessage(e, 'Revise failed'), 'error')
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
      showToast(errorMessage(e, 'Duplicate failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Branch a quote for partial delivery: new draft under the same deal_ref so one
   * supplier invoice can cover both. Parent stays active (not superseded).
   */
  async function branchQuote(q: Quotation) {
    const dealRef = resolveDealRef(q)
    if (!dealRef) {
      showToast('Finalize the quotation first so it has a reference to branch from', 'error')
      return
    }
    setSaving(true)
    try {
      // Ensure parent carries deal_ref for shared supplier invoice / cost.
      if (!String(q.deal_ref || '').trim()) {
        const { error: parentErr } = await db
          .from('quotations')
          .update({ deal_ref: dealRef, updated_by: who, updated_at: new Date().toISOString() })
          .eq('id', q.id)
        if (parentErr && !isUndefinedColumnError(parentErr)) throw parentErr
      }

      const items = await loadLineItems('Quote', q.quote_id)
      const newQuoteId = makeQuoteId()
      const branchNote = `Branch of ${q.reference_number || q.quote_id} — keep only the lines still to deliver. Same supplier invoice / deal ${dealRef}.`
      const payload = {
        client: q.client,
        vertical: q.vertical,
        division_code: q.division_code,
        description: q.description,
        payment_terms: q.payment_terms,
        delivery_terms: q.delivery_terms,
        moq: q.moq,
        notes: [q.notes, branchNote].filter(Boolean).join('\n'),
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: 0,
        discount_percent: Number(q.discount_percent) || 0,
        discount_amount: Number(q.discount_amount) || 0,
        offset_vat: Boolean(q.offset_vat),
        status: 'Draft',
        reference_number: '',
        base_reference: '',
        revision: 0,
        deal_ref: dealRef,
        quote_id: newQuoteId,
        supplier_cost_base: 0,
        estimated_gross_profit_base: 0,
        created_by: who,
        updated_by: who,
        ...quotationCurrencyDefaults(),
        quotation_currency: q.quotation_currency || BASE_CURRENCY,
        payment_currency: q.payment_currency || BASE_CURRENCY,
        supplier_currency: q.supplier_currency || BASE_CURRENCY,
        booking_currency: q.booking_currency || BASE_CURRENCY,
        fx_rate: Number(q.fx_rate) || 1,
      }
      const { error } = await db.from('quotations').insert(payload)
      if (error && isUndefinedColumnError(error)) {
        const { deal_ref: _d, offset_vat: _o, ...legacy } = payload
        const retry = await db.from('quotations').insert(legacy)
        if (retry.error) throw retry.error
        showToast(
          'Branch created, but deal_ref is missing on the database. Run supabase/migrations/20260924205429_quote_deal_branch.sql.',
          'error',
        )
      } else if (error) throw error

      // Copy lines so you can delete the ones already delivered and keep the rest.
      await saveLineItems('Quote', newQuoteId, toDraftItems(items), vatRate)
      await logActivity(
        'branch_quote',
        'quotation',
        'DRAFT',
        `Branch of ${q.reference_number || q.quote_id} · deal ${dealRef}`,
        who,
      )
      showToast(
        `Branch draft created under deal ${dealRef}. Keep only the undelivered lines, then finalize / invoice.`,
        'success',
      )
      await load()
      const { data: fresh } = await db
        .from('quotations')
        .select('*')
        .eq('quote_id', newQuoteId)
        .maybeSingle()
      if (fresh) await openEdit(fresh as Quotation)
    } catch (e) {
      showToast(errorMessage(e, 'Branch failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    if (!canDeleteQuote) {
      showToast('Only managers and admins can delete quotations', 'error')
      setDeleteTarget(null)
      return
    }
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
      showToast(errorMessage(e, 'Delete failed'), 'error')
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
      showToast(errorMessage(e, 'Failed to set outcome'), 'error')
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
      // Bake quotation discount into unit prices so invoice lines match the discounted total.
      const offsetVat = quoteOffsetsVat(q, settings)
      const discountOpts = {
        discountPercent: offsetVat ? 0 : Number(q.discount_percent) || 0,
        discountAmount: offsetVat ? 0 : Number(q.discount_amount) || 0,
        offsetVat,
      }
      const preDiscount = calcTotals(draftItems, vatRate)
      const withDiscount = calcTotals(draftItems, vatRate, discountOpts)
      if (!offsetVat && withDiscount.discount > 0 && preDiscount.subtotal > 0) {
        const factor = withDiscount.taxable / preDiscount.subtotal
        draftItems = draftItems.map((it) => ({
          ...it,
          unit_price: Math.round((Number(it.unit_price) || 0) * factor * 100) / 100,
        }))
      }
      const sub = offsetVat ? withDiscount : calcTotals(draftItems, vatRate)
      const amount = sub.total

      const depositNote =
        pct < 100 ? `\nInvoice type: ${pct}% deposit of quotation` : '\nInvoice type: Full amount'
      const discountNote = offsetVat
        ? `\nVAT of ${sub.vat.toFixed(2)} given as a commercial discount; net ${sub.total.toFixed(2)}`
        : Number(q.discount_percent) || Number(q.discount_amount)
          ? `\nDiscount applied from quotation: ${Number(q.discount_percent) || 0}%` +
            (Number(q.discount_amount) ? ` + ${Number(q.discount_amount).toFixed(2)}` : '')
          : ''

      const invoiceRow = {
        client: q.client,
        vertical: q.vertical,
        reference_number: q.reference_number,
        date: format(new Date(), 'yyyy-MM-dd'),
        description:
          pct < 100
            ? `${q.description} (${pct}% deposit)`.trim()
            : q.description,
        amount,
        currency: (q.quotation_currency || 'AED').toUpperCase(),
        status: 'Sent',
        payment_status: 'Pending',
        payment_terms: q.payment_terms,
        moq: q.moq,
        notes: (q.notes || '') + depositNote + discountNote,
        delivery_terms: q.delivery_terms,
        created_by: who,
        updated_by: who,
      }
      let { error } = await db.from('invoices').insert(invoiceRow)
      // Before the "Card payments" SQL there is no currency column: AED invoices save without it.
      if (error && isUndefinedColumnError(error) && invoiceRow.currency === 'AED') {
        const { currency: _currency, ...withoutCurrency } = invoiceRow
        ;({ error } = await db.from('invoices').insert(withoutCurrency))
      }
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

      // Sync income (align with InvoicesPage syncIncome: Open until Paid)
      const incomePayload = {
        client_source: q.client,
        category: q.vertical,
        reference_number: q.reference_number,
        date: format(new Date(), 'yyyy-MM-dd'),
        description: pct < 100 ? `${q.description} (${pct}% deposit)`.trim() : q.description,
        bill_amount: sub.taxable,
        vat: sub.vat,
        total_amount: sub.total,
        status: 'Open',
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
      showToast(errorMessage(e, 'Convert failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function createDeliveryNote() {
    if (!dnTarget) return
    setSaving(true)
    try {
      const note = await createDeliveryNoteFromQuote({
        quote: dnTarget,
        who,
        prefix: settings.deliveryNotePrefix || 'DN',
      })
      showToast(`Delivery note ${note.reference_number} created`, 'success')
      setDnTarget(null)
      navigate(`/document/delivery-note/${note.id}`)
    } catch (e) {
      showToast(errorMessage(e, 'Could not create delivery note'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const clientMatches = clients
    .filter((c) => c.company_name.toLowerCase().includes(form.client.toLowerCase()))
    .slice(0, 8)

  function quoteMeta(q: Quotation): string {
    const bits: string[] = []
    if (q.valid_until && q.reference_number) {
      bits.push(`Valid until ${format(new Date(q.valid_until), 'dd MMM yyyy')}`)
    }
    const deal = resolveDealRef(q)
    if (deal && deal !== (q.reference_number || q.quote_id)) bits.push(`Deal ${deal}`)
    else if (
      q.deal_ref &&
      quotes.some((o) => o.id !== q.id && resolveDealRef(o) === resolveDealRef(q))
    ) {
      bits.push(`Deal ${resolveDealRef(q)} · branched`)
    }
    return bits.join(' · ')
  }

  function renderQuoteActions(q: Quotation) {
    return (
      <QuoteRowActions
        quote={q}
        expanded={actionsOpenId === q.id}
        onToggle={() => setActionsOpenId((id) => (id === q.id ? null : q.id))}
        saving={saving}
        canDelete={canDeleteQuote}
        onEdit={(row) => void openEdit(row)}
        onFinalize={(row) => void finalize(row)}
        onUndoFinalize={(row) => void undoFinalize(row)}
        onRevise={(row) => void revise(row)}
        onOutcome={(row) => {
          setOutcomeTarget(row)
          setOutcomeStatus('Awarded')
          setOutcomeReason(row.outcome_reason || '')
        }}
        onInvoice={(row) => {
          setConvertTarget(row)
          setDepositPct('100')
        }}
        onDeliveryNote={(row) => setDnTarget(row)}
        onSupplierInvoice={(row) => void openSupplierInvoice(row)}
        onBranch={(row) => void branchQuote(row)}
        onDuplicate={(row) => void duplicate(row)}
        onDelete={(row) => setDeleteTarget(row)}
      />
    )
  }

  return (
    <div className={qStyles.page}>
      <header className={qStyles.hero}>
        <div>
          <p className={qStyles.kicker}>Sales documents</p>
          <h1 className={qStyles.title}>Quotations</h1>
          <p className={qStyles.subtitle}>
            Create, revise, and track quotations. Click Actions on a row to reveal every option.
          </p>
        </div>
        <button type="button" className={qStyles.newBtn} onClick={() => void openCreate()}>
          <Plus size={16} /> New quotation
        </button>
      </header>

      <SavedViewsBar
        moduleId="quotations"
        filters={currentQuoteViewFilters}
        ownerUserId={appUserId}
        canWrite={userRole !== 'viewer'}
        applyDefaultOnLoad={
          !searchParams.get('client') && !searchParams.get('ref') && !searchParams.get('quote')
        }
        onApply={applyQuoteViewFilters}
        onToast={showToast}
        filtersEqual={(a, b) =>
          quotationsFiltersEqual(a as QuotationsViewFilters, b as QuotationsViewFilters)
        }
      />

      <div className={qStyles.controls}>
        <div className={qStyles.tabs}>
          {(['All', 'Draft', 'Finalized', 'Sent', 'Awarded'] as StatusTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? qStyles.tabActive : qStyles.tab}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          className={qStyles.search}
          placeholder="Search client / ref…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className={qStyles.loading}>Loading quotations…</div>
      ) : filtered.length === 0 ? (
        <div className={qStyles.empty}>
          <EmptyState
            icon={<FilePlus2 size={22} />}
            title="No quotations"
            subtitle="Create a draft or filter a different status."
            actionLabel="New quotation"
            onAction={() => void openCreate()}
          />
        </div>
      ) : (
        <div className={qStyles.tableShell}>
          <div className={qStyles.tableWrap}>
            <table className={qStyles.table}>
              <thead>
                <tr>
                  <th className={qStyles.colRef}>Reference</th>
                  <th className={qStyles.colClient}>Client</th>
                  <th className={qStyles.colDivision}>Division</th>
                  <th className={qStyles.colDate}>Date</th>
                  <th className={qStyles.colAmount}>Amount</th>
                  <th className={qStyles.colStatus}>Status</th>
                  <th className={qStyles.colActions} style={{ textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => (
                  <tr
                    key={q.id}
                    className={actionsOpenId === q.id ? qStyles.rowExpanded : undefined}
                  >
                    <td className={qStyles.colRef}>
                      <div className={qStyles.ref}>
                        {q.reference_number || <span className={qStyles.refMuted}>DRAFT</span>}
                      </div>
                      {quoteMeta(q) ? <div className={qStyles.meta}>{quoteMeta(q)}</div> : null}
                    </td>
                    <td className={`${qStyles.colClient} ${qStyles.clientCell}`}>{q.client || '—'}</td>
                    <td className={qStyles.colDivision}>{q.vertical || divisionBrand(q.division_code)}</td>
                    <td className={qStyles.colDate}>
                      {q.date ? format(new Date(q.date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className={`${qStyles.colAmount} ${qStyles.amount}`}>{formatAED(q.amount)}</td>
                    <td className={qStyles.colStatus}>
                      <StatusPill status={q.status} />
                    </td>
                    <td className={`${qStyles.colActions} ${qStyles.actionsCell}`}>
                      {renderQuoteActions(q)}
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
        <EditorSectionTabs value={editorSection} onChange={setEditorSection} />

        <div style={editorPanelStyle(editorSection === 'basics')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
          <div style={{ ...fieldStyle, position: 'relative' }}>
            <label style={labelStyle}>Client *</label>
            <input
              style={inputStyle}
              value={form.client}
              onChange={(e) => {
                const name = e.target.value
                setForm((f) => ({
                  ...f,
                  client: name,
                  ...contactFieldsForClient(name),
                }))
                billTo.prefillFor(name)
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
                      setForm((f) => ({
                        ...f,
                        client: c.company_name,
                        ...contactFieldsForClient(c.company_name),
                      }))
                      billTo.prefillFor(c.company_name)
                      setClientSuggest(false)
                    }}
                  >
                    {c.company_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {shouldShowQuoteContactPicker(companyContacts) ? (
            <div style={fieldStyle}>
              <label style={labelStyle}>Contact person *</label>
              <select
                style={selectStyle}
                value={form.contact_id}
                onChange={(e) => selectQuoteContact(e.target.value)}
              >
                {companyContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {quoteContactLabel(c)}
                  </option>
                ))}
              </select>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted }}>
                This company has {companyContacts.length} contacts — choose who this quotation is for.
              </p>
            </div>
          ) : companyContacts.length === 1 ? (
            <div style={fieldStyle}>
              <label style={labelStyle}>Contact person</label>
              <input style={inputStyle} value={quoteContactLabel(companyContacts[0])} readOnly />
            </div>
          ) : null}
          <div style={fieldStyle}>
            <label style={labelStyle}>Division</label>
            <select
              style={selectStyle}
              value={form.division_code}
              onChange={(e) => {
                const code = e.target.value
                const fmt = getDivisionQuoteFormat(code, settings)
                setForm((f) => ({
                  ...f,
                  division_code: code,
                  payment_terms: fmt.defaultPaymentTerms || f.payment_terms,
                  description: f.description || fmt.defaultDescriptionHint,
                  moq: fmt.showMoq ? f.moq || settings.moqDefault || '50' : '',
                  delivery_terms: fmt.showDelivery
                    ? f.delivery_terms || settings.deliveryTerms || ''
                    : '',
                }))
              }}
            >
              {DIVISIONS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.brand}
                </option>
              ))}
            </select>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted }}>
              Format: <strong>{activeFormat.formatLabel}</strong>
              {activeFormat.showPartnerFulfillment
                ? ` · Partner: ${activeFormat.partnerName || CONNECT_PARTNER.name}`
                : ''}
              . Catalogue and PDF layout switch with the division; amounts stay editable per customer.
            </p>
          </div>
          <ClientBillToFields
            draft={billTo.draft}
            onChange={billTo.edit}
            client={form.client}
            savedClient={billTo.isSavedClient(form.client)}
          />
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

        </div>

        <div style={editorPanelStyle(editorSection === 'lines')}>
        <div
          style={{
            marginTop: 8,
            marginBottom: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ fontSize: 14 }}>Line items</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            {divisionProducts.length > 0 && (
              <select
                style={{ ...selectStyle, minWidth: 180 }}
                defaultValue=""
                onChange={(e) => {
                  const p = divisionProducts.find((x) => x.id === e.target.value)
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
                        unit_cost: Number(p.unit_cost) || 0,
                        sku: p.sku || '',
                        sizes: p.track_sizes ? emptySizeBreakdown() : null,
                      }),
                    ],
                  }))
                  e.target.value = ''
                }}
              >
                <option value="">Add from {activeFormat.brand} catalog…</option>
                {divisionProducts.map((p) => (
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
          {compact ? (
            <div className={resp.lineStack}>
              {form.items.map((it) => {
                const qty = effectiveQty(it)
                const amount = qty * (Number(it.unit_price) || 0)
                const vat = amount * vatRate
                const lineTotal = amount + vat
                const lineCost = qty * (Number(it.unit_cost) || 0)
                return (
                  <div key={it.key} className={resp.lineCard}>
                    <div className={`${resp.cardField} ${resp.lineCardFull}`}>
                      <label>Description</label>
                      <input
                        style={inputStyle}
                        value={it.description}
                        onChange={(e) => updateItem(it.key, { description: e.target.value })}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
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
                      <LineItemImageField
                        value={it.image_data}
                        onChange={(image_data) => updateItem(it.key, { image_data })}
                      />
                    </div>
                    <div className={resp.cardField}>
                      <label>Qty</label>
                      <input
                        type="number"
                        style={inputStyle}
                        value={qty}
                        disabled={!!it.sizes}
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
                    <div className={resp.cardField}>
                      <label>Cost</label>
                      <input
                        type="number"
                        style={inputStyle}
                        value={it.unit_cost || ''}
                        placeholder="0"
                        onChange={(e) =>
                          updateItem(it.key, { unit_cost: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                      {lineCost > 0 ? (
                        <div style={{ fontSize: 10, color: colors.muted2, marginTop: 4 }}>
                          = {form.quotation_currency} {lineCost.toFixed(2)}
                        </div>
                      ) : null}
                    </div>
                    <div className={resp.lineCardActions}>
                      <div style={{ fontSize: 12, color: colors.muted }}>
                        {formatAED(amount)} + VAT {formatAED(vat)} = <strong>{formatAED(lineTotal)}</strong>
                      </div>
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
                    {it.sizes ? (
                      <div className={resp.lineCardFull}>
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
                      </div>
                    ) : null}
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
                <th style={thStyle}>Cost</th>
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
                const lineCost = qty * (Number(it.unit_cost) || 0)
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
                        <LineItemImageField
                          value={it.image_data}
                          onChange={(image_data) => updateItem(it.key, { image_data })}
                        />
                      </td>
                      <td style={{ ...tdStyle, width: 80 }}>
                        <input
                          type="number"
                          style={inputStyle}
                          value={qty}
                          disabled={!!it.sizes}
                          onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) })}
                        />
                      </td>
                      <td style={{ ...tdStyle, width: 110 }}>
                        <input
                          type="number"
                          style={inputStyle}
                          value={it.unit_price}
                          onChange={(e) => updateItem(it.key, { unit_price: Number(e.target.value) })}
                        />
                      </td>
                      <td style={{ ...tdStyle, width: 110 }}>
                        <input
                          type="number"
                          style={inputStyle}
                          value={it.unit_cost || ''}
                          placeholder="0"
                          onChange={(e) =>
                            updateItem(it.key, { unit_cost: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                        {lineCost > 0 ? (
                          <div style={{ fontSize: 10, color: colors.muted2, marginTop: 4 }}>
                            = {form.quotation_currency} {lineCost.toFixed(2)}
                          </div>
                        ) : null}
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
                        <td style={tdStyle} colSpan={8}>
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
          )}
        </div>

        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Discount %</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.discount_percent || ''}
              placeholder="0"
              disabled={form.offset_vat}
              onChange={(e) =>
                setForm((f) => ({ ...f, discount_percent: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Discount amount ({form.quotation_currency})</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              step={0.01}
              value={form.discount_amount || ''}
              placeholder="0.00"
              disabled={form.offset_vat}
              onChange={(e) =>
                setForm((f) => ({ ...f, discount_amount: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </div>
          <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.offset_vat}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  offset_vat: e.target.checked,
                  discount_percent: e.target.checked ? 0 : f.discount_percent,
                  discount_amount: e.target.checked ? 0 : f.discount_amount,
                }))
              }
            />
            <span style={{ fontSize: 13, color: colors.text, lineHeight: 1.4 }}>
              Give VAT as a discount
              <span style={{ display: 'block', color: colors.muted, fontSize: 12 }}>
                Writes VAT off on the PDF. The customer pays the ex-VAT amount; this is not the FTA-clean option.
              </span>
            </span>
          </label>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={vatRate <= 0 || totals.subtotal <= 0}
              onClick={() => {
                const current = round2(totals.subtotal)
                setVatFoldTarget(Number.isInteger(current) ? String(current) : current.toFixed(2))
                setVatFoldOpen(true)
              }}
            >
              Include VAT in this total
            </button>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted, lineHeight: 1.45 }}>
              Rewrites unit prices so they pay a VAT-inclusive total you choose — keep{' '}
              {form.quotation_currency}{' '}
              {totals.subtotal.toLocaleString('en-AE', { minimumFractionDigits: 2 })} or round it.
              You still remit 5% to the FTA. Use this instead of a discount line.
            </p>
          </div>
          <div style={{ fontSize: 13, color: colors.muted, paddingBottom: 8 }}>
            {form.offset_vat
              ? 'VAT is shown, then taken off as a commercial discount.'
              : 'Percent/fixed discount applies to subtotal before VAT.'}
          </div>
        </div>

        </div>

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 24,
            fontSize: 14,
            flexWrap: 'wrap',
          }}
        >
          <div>
            Subtotal:{' '}
            <strong>
              {form.quotation_currency} {totals.subtotal.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </strong>
          </div>
          {totals.discount > 0 ? (
            <div>
              {form.offset_vat ? 'Discount (VAT)' : 'Discount'}:{' '}
              <strong style={{ color: colors.danger || '#f87171' }}>
                −{form.quotation_currency}{' '}
                {totals.discount.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          ) : null}
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
          {totals.cost > 0 ? (
            <>
              <div>
                Cost:{' '}
                <strong>
                  {form.quotation_currency}{' '}
                  {totals.cost.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div>
                Gross profit:{' '}
                <strong style={{ color: totals.profit >= 0 ? colors.success : colors.danger }}>
                  {form.quotation_currency}{' '}
                  {totals.profit.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </strong>
                <span style={{ color: colors.muted2, marginLeft: 6 }}>({totals.marginPct}% margin)</span>
              </div>
            </>
          ) : null}
          <div style={{ color: colors.muted2 }}>
            ≈ AED {toBaseAmount(totals.total, form.fx_rate).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={editorPanelStyle(editorSection === 'terms')}>
        <div
          style={{
            marginTop: 18,
            padding: 14,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            background:
              form.division_code === '02'
                ? 'rgba(96,165,250,0.06)'
                : form.division_code === '03'
                  ? 'rgba(52,211,153,0.06)'
                  : form.division_code === '04'
                    ? 'rgba(251,191,36,0.06)'
                    : form.division_code === '06'
                      ? 'rgba(167,139,250,0.06)'
                      : 'transparent',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
            Currencies & payment instructions
            {form.division_code !== '01' ? ` · ${activeFormat.brand}` : ''}
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
              <label style={labelStyle}>Supplier cost override (AED)</label>
              <input
                type="number"
                style={inputStyle}
                value={form.supplier_cost_base}
                onChange={(e) => setForm((f) => ({ ...f, supplier_cost_base: Number(e.target.value) }))}
              />
              <div style={{ fontSize: 11, color: colors.muted2, marginTop: 4 }}>
                Leave 0 to use line-item costs. Line costs win when entered.
              </div>
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

        </div>

        <div style={editorPanelStyle(editorSection === 'notes')}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        {editing?.id ? (
          <CustomFieldsCard
            objectType="quotation"
            recordId={String(editing.id)}
            editable={userRole !== 'viewer'}
            onToast={showToast}
            framed={false}
          />
        ) : (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: colors.muted }}>
            Save the draft once to edit quotation custom fields.
          </p>
        )}
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

      <Modal
        open={vatFoldOpen}
        title="Include VAT in this total"
        onClose={() => setVatFoldOpen(false)}
        width={480}
      >
        <p style={{ color: colors.muted, fontSize: 14, marginTop: 0, lineHeight: 1.55 }}>
          Enter what they should pay, including VAT. Round up or down if you want a cleaner figure.
          Unit prices will be rewritten so the quoted total matches, with no discount line. You still
          remit 5% to the FTA.
        </p>
        <div style={fieldStyle}>
          <label style={labelStyle}>Desired total (incl. VAT)</label>
          <input
            type="text"
            inputMode="decimal"
            style={inputStyle}
            value={vatFoldTarget}
            placeholder={round2(totals.subtotal).toFixed(2)}
            onChange={(e) => setVatFoldTarget(e.target.value)}
          />
        </div>
        {vatFoldPreview && vatFoldTargetAmount ? (
          <div style={{ ...cardStyle, padding: 12, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
            <div>
              They pay:{' '}
              <strong>
                {form.quotation_currency}{' '}
                {vatFoldPreview.total.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
              </strong>
            </div>
            <div>
              New subtotal (ex-VAT): {form.quotation_currency}{' '}
              {vatFoldPreview.exclusiveSubtotal.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </div>
            <div>
              VAT to FTA: {form.quotation_currency}{' '}
              {vatFoldPreview.vat.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </div>
            {vatFoldPreview.matched ? null : (
              <div style={{ color: colors.danger || '#f87171', fontSize: 13 }}>
                Could not land exactly on {form.quotation_currency}{' '}
                {vatFoldTargetAmount.toLocaleString('en-AE', { minimumFractionDigits: 2 })}. Closest
                quoted total is shown above.
              </div>
            )}
            {vatFoldPreview.changed ? (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}`, fontSize: 13 }}>
                {vatFoldPreview.items.map((next, i) => {
                  const prev = form.items[i]
                  const qty = effectiveQty(prev)
                  const beforeAmt = round2(qty * (Number(prev.unit_price) || 0))
                  const afterAmt = round2(qty * (Number(next.unit_price) || 0))
                  if (beforeAmt === afterAmt) return null
                  return (
                    <div
                      key={prev.key}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}
                    >
                      <span style={{ color: colors.muted }}>{prev.description || `Line ${i + 1}`}</span>
                      <span>
                        {beforeAmt.toLocaleString('en-AE', { minimumFractionDigits: 2 })} →{' '}
                        {afterAmt.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <p style={{ color: colors.muted2, fontSize: 13 }}>Enter a total greater than 0 to preview the new prices.</p>
        )}
        <p style={{ color: colors.muted2, fontSize: 12, lineHeight: 1.45 }}>
          Line amounts stay in the same proportion. If this quote is already VAT-inclusive, enter a
          new total only when you want to round it.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setVatFoldOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={!vatFoldPreview?.changed || !vatFoldTargetAmount}
            onClick={() => {
              if (!vatFoldPreview?.changed) return
              setForm((f) => ({
                ...f,
                items: vatFoldPreview.items,
                offset_vat: false,
                discount_percent: 0,
                discount_amount: 0,
              }))
              setVatFoldOpen(false)
              showToast(
                `Prices adjusted. Total ${form.quotation_currency} ${vatFoldPreview.total.toLocaleString('en-AE', { minimumFractionDigits: 2 })} includes VAT ${vatFoldPreview.vat.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`,
                'success',
              )
            }}
          >
            Adjust prices
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
        <p style={{ color: colors.muted, fontSize: 14, marginTop: 0, lineHeight: 1.5 }}>
          Create invoice from{' '}
          <strong style={{ color: colors.text }}>{convertTarget?.reference_number}</strong>
          . Payment stays <strong style={{ color: colors.text }}>Pending</strong> until you record
          payment on Invoices. Income is recognized when marked Paid.
        </p>
        <div style={fieldStyle}>
          <label style={labelStyle}>Invoice amount</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {[
              { label: '30% deposit', value: '30' },
              { label: '50% deposit', value: '50' },
              { label: 'Full 100%', value: '100' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                style={{
                  ...buttonSecondaryStyle,
                  ...(depositPct === opt.value
                    ? { borderColor: colors.accent, color: colors.accent }
                    : null),
                }}
                onClick={() => setDepositPct(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label style={labelStyle}>Or custom deposit %</label>
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

      <Modal
        open={!!dnTarget}
        title="Create delivery note"
        onClose={() => setDnTarget(null)}
        width={460}
      >
        <p style={{ color: colors.muted, fontSize: 14, marginTop: 0, lineHeight: 1.5 }}>
          Create a delivery note from quotation{' '}
          <strong style={{ color: colors.text }}>{dnTarget?.reference_number}</strong>
          {dnTarget?.client ? ` for ${dnTarget.client}` : ''}. Line items and quantities are copied;
          prices are omitted.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDnTarget(null)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void createDeliveryNote()}>
            {saving ? 'Creating…' : 'Create delivery note'}
          </button>
        </div>
      </Modal>

      <SupplierInvoiceModal
        quote={supplierInvoiceTarget}
        vendors={vendors}
        vatRate={vatRate}
        who={who}
        onClose={() => setSupplierInvoiceTarget(null)}
        onSaved={load}
      />
    </div>
  )
}
