import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Download, Mail, MessageCircle, Printer } from 'lucide-react'
import { db } from '../lib/db'
import { DIVISIONS, VAT_RATE } from '../lib/config'
import type { Client, CrmContact, CrmEntry, Invoice, LineItem, Quotation } from '../lib/types'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { formatAED } from '../lib/money'
import { BASE_CURRENCY, formatMoneyAmount } from '../lib/currency'
import { isWandersDivision } from '../lib/wandersConfig'
import { buildWandersTermsText } from '../lib/wandersTerms'
import {
  columnLabel,
  getDivisionQuoteFormat,
  type QuoteColumnId,
} from '../lib/divisionQuoteFormats'
import { CONNECT_PARTNER } from '../lib/seedDivisionCatalogues'
import { loadLineItems } from '../lib/lineItems'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import { resolveLogoUrl } from '../lib/brand'
import {
  displayDocumentReference,
  downloadBlob,
  elementToPdfBlob,
  quoteValidUntil,
} from '../lib/documents'
import { hydrateContacts, primaryContact } from '../lib/contacts'
import { isZohoMailEnabled } from '../lib/zoho'
import EmailComposeModal from '../components/EmailComposeModal'
import { logActivity } from '../lib/activity'
import { syncCrmFromQuote } from '../lib/crmSync'
import {
  applyMessageTemplate,
  DEFAULT_EMAIL_QUOTE_BODY,
  DEFAULT_EMAIL_QUOTE_SUBJECT,
  DEFAULT_WHATSAPP_QUOTE,
} from '../lib/templates'

type DocType = 'quote' | 'invoice'

export default function DocumentPage() {
  const { type = 'quote', id = '' } = useParams<{ type: string; id: string }>()
  const docType: DocType = type === 'invoice' ? 'invoice' : 'quote'
  const { settings } = useSettings()
  const { showToast } = useToast()
  const sheetRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<Quotation | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<LineItem[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [emailContacts, setEmailContacts] = useState<CrmContact[]>([])
  const [pdfBusy, setPdfBusy] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (docType === 'quote') {
        const { data, error: err } = await db.from('quotations').select('*').eq('id', id).maybeSingle()
        if (err) throw err
        if (!data) throw new Error('Quotation not found')
        const q = data as Quotation
        setQuote(q)
        setInvoice(null)
        const lines = await loadLineItems('Quote', q.quote_id)
        setItems(lines)
        if (q.client) {
          const { data: c } = await db
            .from('clients')
            .select('*')
            .ilike('company_name', q.client)
            .maybeSingle()
          setClient((c as Client) || null)
          const { data: crm } = await db
            .from('crm')
            .select('*')
            .ilike('company_name', q.client)
            .maybeSingle()
          const fromCrm = crm ? hydrateContacts(crm as CrmEntry) : []
          if (fromCrm.length) setEmailContacts(fromCrm)
          else if (c) {
            setEmailContacts(
              hydrateContacts({
                primary_contact: (c as Client).primary_contact,
                email_phone: (c as Client).email,
                mobile_number: (c as Client).mobile,
                contacts: (c as Client).contacts,
              }),
            )
          } else setEmailContacts([])
        }
      } else {
        const { data, error: err } = await db.from('invoices').select('*').eq('id', id).maybeSingle()
        if (err) throw err
        if (!data) throw new Error('Invoice not found')
        const inv = data as Invoice
        setInvoice(inv)
        setQuote(null)
        const lines = await loadLineItems('Invoice', inv.reference_number)
        setItems(lines)
        if (inv.client) {
          const { data: c } = await db
            .from('clients')
            .select('*')
            .ilike('company_name', inv.client)
            .maybeSingle()
          setClient((c as Client) || null)
          const { data: crm } = await db
            .from('crm')
            .select('*')
            .ilike('company_name', inv.client)
            .maybeSingle()
          const fromCrm = crm ? hydrateContacts(crm as CrmEntry) : []
          if (fromCrm.length) setEmailContacts(fromCrm)
          else if (c) {
            setEmailContacts(
              hydrateContacts({
                primary_contact: (c as Client).primary_contact,
                email_phone: (c as Client).email,
                mobile_number: (c as Client).mobile,
                contacts: (c as Client).contacts,
              }),
            )
          } else setEmailContacts([])
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load document')
    } finally {
      setLoading(false)
    }
  }, [docType, id])

  useEffect(() => {
    void load()
  }, [load])

  const doc = quote || invoice
  const displayRef = displayDocumentReference({
    referenceNumber: quote?.reference_number || invoice?.reference_number,
    fallbackId: quote?.quote_id,
    status: doc?.status,
  })
  const title =
    docType === 'quote'
      ? getDivisionQuoteFormat(quote?.division_code, settings).documentTitle
      : 'INVOICE'
  const quoteFormat = getDivisionQuoteFormat(
    docType === 'quote' ? quote?.division_code : '01',
    settings,
  )
  const isDraft =
    displayRef === 'DRAFT' ||
    (quote ? !quote.reference_number || quote.status === 'Draft' : invoice?.status === 'Draft')
  const division =
    DIVISIONS.find((d) => d.code === quote?.division_code)?.brand ||
    quote?.vertical ||
    invoice?.vertical ||
    ''

  const validityDays = Number(settings.quoteValidityDays || 14) || 14
  const validUntil =
    quote?.valid_until ||
    (quote?.date && quote.status !== 'Draft'
      ? quoteValidUntil(quote.date, validityDays)
      : quote?.date
        ? quoteValidUntil(quote.date, validityDays)
        : null)

  const vatRate = Number(settings.vatRate || VAT_RATE) || VAT_RATE
  const isWandersQuote = docType === 'quote' && isWandersDivision(quote?.division_code)
  const wandersVatEnabled = (settings.wandersApplyVat || 'no').toLowerCase() === 'yes'
  const effectiveVatRate =
    isWandersQuote && !wandersVatEnabled
      ? 0
      : isWandersQuote && settings.wandersVatRate && settings.wandersVatRate !== 'TBC'
        ? Number(settings.wandersVatRate) || 0
        : vatRate
  const docCurrency = (
    (quote && (quote.quotation_currency || quote.currency)) ||
    BASE_CURRENCY
  ).toUpperCase()
  const money = (n: number) => {
    if (docType !== 'quote') return formatAED(n)
    if (docCurrency === 'TBC') {
      return `TBC ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return formatMoneyAmount(n, docCurrency)
  }
  const wandersLegalReady =
    Boolean(settings.wandersLegalEntityName) &&
    settings.wandersLegalEntityName !== 'TBC' &&
    settings.wandersGoverningLaw &&
    settings.wandersGoverningLaw !== 'TBC'
  const wandersTermsBlock =
    isWandersQuote && quote
      ? buildWandersTermsText({
          includeFlightsClause: true,
          depositPercent: Number(settings.wandersDepositPercent) || 50,
          holdBusinessDays: Number(settings.wandersHoldBusinessDays) || 3,
          balanceDaysBefore: settings.wandersBalanceDaysBefore || '30-45',
          version: settings.wandersTermsVersion,
          governingLaw: settings.wandersGoverningLaw || 'TBC',
          disputeJurisdiction: settings.wandersDisputeJurisdiction || 'TBC',
        })
      : ''
  const summary = useMemo(() => {
    if (items.length) {
      if (isWandersQuote && !wandersVatEnabled) {
        const subtotal = items.reduce((s, i) => s + Number(i.amount || 0), 0)
        return { subtotal, vat: 0, total: subtotal }
      }
      const subtotal = items.reduce((s, i) => s + Number(i.amount || 0), 0)
      const vat = items.reduce((s, i) => s + Number(i.vat_amount || 0), 0)
      const total = items.reduce((s, i) => s + Number(i.line_total || 0), 0)
      return { subtotal, vat, total }
    }
    const total = Number(doc?.amount || 0)
    if (effectiveVatRate <= 0) return { subtotal: total, vat: 0, total }
    const subtotal = total / (1 + effectiveVatRate)
    return { subtotal, vat: total - subtotal, total }
  }, [items, doc, effectiveVatRate, isWandersQuote, wandersVatEnabled])

  async function downloadPdf() {
    if (!sheetRef.current) return
    setPdfBusy(true)
    try {
      const { blob, filename } = await elementToPdfBlob(sheetRef.current, {
        filenameHint: `${title.toLowerCase()}-${displayRef}`,
      })
      downloadBlob(blob, filename)
      showToast('PDF downloaded', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'PDF failed', 'error')
    } finally {
      setPdfBusy(false)
    }
  }

  async function prepareEmail() {
    if (!sheetRef.current) {
      setEmailOpen(true)
      return
    }
    setPdfBusy(true)
    try {
      const { blob, filename } = await elementToPdfBlob(sheetRef.current, {
        filenameHint: `${title.toLowerCase()}-${displayRef}`,
      })
      downloadBlob(blob, filename)
      showToast('PDF downloaded — attach it to the email if needed', 'success')
      setEmailOpen(true)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'PDF failed', 'error')
      setEmailOpen(true)
    } finally {
      setPdfBusy(false)
    }
  }

  function shareWhatsApp() {
    const p = primaryContact(emailContacts)
    const phone = p?.phone || client?.mobile || ''
    const company = settings.companyName || 'Red Reach Middle East FZE'
    const text = applyMessageTemplate(settings.whatsappQuoteMessage || DEFAULT_WHATSAPP_QUOTE, {
      contactGreeting: p?.name || client?.primary_contact ? ` ${p?.name || client?.primary_contact}` : '',
      titleLower: title.toLowerCase(),
      ref: displayRef,
      amount: money(summary.total),
      company,
      client: doc?.client || '',
      contact: p?.name || client?.primary_contact || 'team',
      validUntil: validUntil ? format(new Date(validUntil), 'dd MMM yyyy') : '',
    })
    const url = buildWhatsAppUrl(phone, text, settings.whatsappCountryCode || '971')
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function markQuoteSent() {
    if (docType !== 'quote' || !quote) return
    if (!['Finalized', 'Draft'].includes(quote.status)) return
    if (quote.status === 'Sent') return
    // Only promote Finalized → Sent (Draft stays draft until finalized)
    if (quote.status !== 'Finalized') return
    const { error: err } = await db
      .from('quotations')
      .update({
        status: 'Sent',
        updated_at: new Date().toISOString(),
      })
      .eq('id', quote.id)
    if (!err) {
      setQuote({ ...quote, status: 'Sent' })
      await logActivity('email_quote', 'quotation', displayRef, quote.client, '')
      await syncCrmFromQuote({
        client: quote.client,
        quoteRef: quote.reference_number,
        quoteStatus: 'Sent',
      })
    }
  }

  const emailVars = {
    title,
    titleLower: title.toLowerCase(),
    ref: displayRef,
    company: settings.companyName || 'Red Reach Middle East FZE',
    client: doc?.client || '',
    contact: primaryContact(emailContacts)?.name || client?.primary_contact || 'team',
    amount: money(summary.total),
    validUntil: validUntil ? format(new Date(validUntil), 'dd MMM yyyy') : '',
    validUntilLine: validUntil && docType === 'quote' ? `\nValid until: ${format(new Date(validUntil), 'dd MMM yyyy')}` : '',
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f0f0', color: '#333', padding: 40 }}>
        Loading document…
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f0f0', color: '#333', padding: 40 }}>
        <p style={{ color: '#b91c1c' }}>{error || 'Document not found'}</p>
        <Link to={docType === 'quote' ? '/quotations' : '/invoices'}>Back</Link>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', color: '#111' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          flexWrap: 'wrap',
          padding: '12px 16px',
          background: '#111',
        }}
      >
        <Link
          to={docType === 'quote' ? '/quotations' : '/invoices'}
          style={{
            marginRight: 'auto',
            color: 'rgba(255,255,255,0.8)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
          }}
        >
          <ArrowLeft size={16} /> Back
        </Link>
        <ToolbarBtn onClick={() => window.print()}>
          <Printer size={14} /> Print
        </ToolbarBtn>
        <ToolbarBtn onClick={() => void downloadPdf()} disabled={pdfBusy}>
          <Download size={14} /> {pdfBusy ? 'Preparing…' : 'Download PDF'}
        </ToolbarBtn>
        <ToolbarBtn onClick={() => void prepareEmail()} disabled={pdfBusy}>
          <Mail size={14} /> Email PDF
        </ToolbarBtn>
        <ToolbarBtn onClick={shareWhatsApp} accent>
          <MessageCircle size={14} /> WhatsApp
        </ToolbarBtn>
      </div>

      <div
        style={{
          width: 'min(900px, calc(100% - 24px))',
          margin: '20px auto 40px',
        }}
      >
        <div
          ref={sheetRef}
          style={{
            background: '#fff',
            boxShadow: '0 18px 40px rgba(0,0,0,0.12)',
            borderLeft: '10px solid #e85d04',
            borderRight: '10px solid #e85d04',
          }}
        >
          <div style={{ padding: '36px 40px 24px' }}>
            {isDraft && (
              <div
                style={{
                  background: '#fff3cd',
                  color: '#7a5b00',
                  padding: '8px 12px',
                  borderRadius: 8,
                  marginBottom: 14,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                DRAFT — reference not finalized
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 24,
                paddingBottom: 18,
                borderBottom: '2px solid #e85d04',
              }}
            >
              <div>
                <img
                  src={resolveLogoUrl(settings.logoUrl)}
                  alt={settings.brand || 'RED REACH'}
                  style={{ maxHeight: 72, maxWidth: 280, objectFit: 'contain' }}
                />
                <div style={{ marginTop: 10, color: '#555', fontSize: 12.5, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, color: '#111' }}>
                    {settings.companyName || 'Red Reach Middle East FZE'}
                  </div>
                  {settings.address}
                  <br />
                  {settings.email}
                  {settings.phone ? ` · ${settings.phone}` : ''}
                  {settings.trn ? (
                    <>
                      <br />
                      TRN: {settings.trn}
                    </>
                  ) : null}
                </div>
                {division ? (
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: 8,
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #c1121f, #e85d04)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {quoteFormat.introEyebrow || division}
                  </span>
                ) : null}
              </div>
              <div style={{ textAlign: 'right', minWidth: 220 }}>
                <div
                  style={{
                    fontSize: 12,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#c1121f',
                    fontWeight: 700,
                  }}
                >
                  {title}
                </div>
                <h1 style={{ margin: '6px 0 12px', fontSize: 22, wordBreak: 'break-word' }}>
                  {displayRef}
                </h1>
                <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                  <div>
                    <span style={{ color: '#555' }}>Date: </span>
                    {doc.date ? format(new Date(doc.date), 'dd MMM yyyy') : '—'}
                  </div>
                  {docType === 'quote' && validUntil ? (
                    <div>
                      <span style={{ color: '#555' }}>Valid until: </span>
                      {format(new Date(validUntil), 'dd MMM yyyy')}
                    </div>
                  ) : null}
                  {'payment_status' in doc && (
                    <div>
                      <span style={{ color: '#555' }}>Payment: </span>
                      {doc.payment_status}
                    </div>
                  )}
                  {'status' in doc && (
                    <div>
                      <span style={{ color: '#555' }}>Status: </span>
                      {doc.status}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 24,
                margin: '24px 0 16px',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#555',
                  }}
                >
                  {quoteFormat.sectionHeadings.billTo}
                </h3>
                <p style={{ margin: 0, lineHeight: 1.5, fontSize: 14 }}>
                  <strong>{doc.client}</strong>
                  {client?.primary_contact ? (
                    <>
                      <br />
                      {client.primary_contact}
                    </>
                  ) : null}
                  {client?.email ? (
                    <>
                      <br />
                      {client.email}
                    </>
                  ) : null}
                  {client?.mobile || client?.office ? (
                    <>
                      <br />
                      {client.mobile || client.office}
                    </>
                  ) : null}
                  {client?.address ? (
                    <>
                      <br />
                      {client.address}
                    </>
                  ) : null}
                  {client?.trn ? (
                    <>
                      <br />
                      TRN: {client.trn}
                    </>
                  ) : null}
                </p>
              </div>
              <div>
                <h3
                  style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#555',
                  }}
                >
                  {quoteFormat.sectionHeadings.scope}
                </h3>
                <p style={{ margin: 0, lineHeight: 1.5, fontSize: 14 }}>{doc.description || '—'}</p>
                {docType === 'quote' && quoteFormat.showPartnerFulfillment ? (
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#444', lineHeight: 1.45 }}>
                    <strong>Fulfilment partner:</strong> {quoteFormat.partnerName || CONNECT_PARTNER.name}{' '}
                    ({CONNECT_PARTNER.location}). {CONNECT_PARTNER.billingNote}
                  </p>
                ) : null}
                {docType === 'quote' && quoteFormat.showTripSummary && quote ? (
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#444', lineHeight: 1.45 }}>
                    Travel proposal format — passenger counts, dates and inclusions as listed below.
                    Flights and visa assistance only when stated.
                  </p>
                ) : null}
              </div>
            </div>

            <h3
              style={{
                margin: '18px 0 8px',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#555',
              }}
            >
              {quoteFormat.sectionHeadings.lines}
            </h3>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 13.5 }}>
              <thead>
                <tr>
                  {quoteFormat.columns.map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 8px',
                        borderBottom: '2px solid #222',
                        textAlign:
                          h === 'line' || h === 'sku' || h === 'description' || h === 'sizes'
                            ? 'left'
                            : 'right',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: '#555',
                      }}
                    >
                      {columnLabel(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={quoteFormat.columns.length}
                      style={{ padding: 12, color: '#555' }}
                    >
                      No line items
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id}>
                      {quoteFormat.columns.map((col) => (
                        <td
                          key={col}
                          style={{
                            ...cell,
                            textAlign:
                              col === 'line' ||
                              col === 'sku' ||
                              col === 'description' ||
                              col === 'sizes'
                                ? 'left'
                                : 'right',
                          }}
                        >
                          {renderLineCell(col, it, quoteFormat.showInventorySku)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div style={{ width: 280, margin: '18px 0 0 auto', fontSize: 14 }}>
              <div style={totalRow}>
                <span>Subtotal</span>
                <span>{money(summary.subtotal)}</span>
              </div>
              <div style={totalRow}>
                <span>VAT ({(effectiveVatRate * 100).toFixed(0)}%)</span>
                <span>{money(summary.vat)}</span>
              </div>
              <div
                style={{
                  ...totalRow,
                  marginTop: 6,
                  paddingTop: 10,
                  borderTop: '2px solid #222',
                  fontWeight: 800,
                  fontSize: 16,
                }}
              >
                <span>Total ({docType === 'quote' ? docCurrency : 'AED'})</span>
                <span>{money(summary.total)}</span>
              </div>
            </div>

            <div style={{ marginTop: 28, fontSize: 12.5, lineHeight: 1.55, color: '#333' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#c1121f' }}>
                {quoteFormat.sectionHeadings.commercial}
              </h3>
              <div>
                Payment terms:{' '}
                {doc.payment_terms || quoteFormat.defaultPaymentTerms || settings.paymentTerms || '—'}
              </div>
              {quoteFormat.showDelivery ? (
                <div>Delivery: {doc.delivery_terms || settings.deliveryTerms || '—'}</div>
              ) : null}
              {quoteFormat.showMoq && 'moq' in doc ? (
                <div>MOQ: {doc.moq || settings.moqDefault || '—'}</div>
              ) : null}
              {docType === 'quote' && quoteFormat.showHoursBilling ? (
                <div style={{ marginTop: 8 }}>
                  Hours and rates are as listed. Unused hours policy is editable per client engagement.
                </div>
              ) : null}
              {docType === 'quote' && quote ? (
                <div style={{ marginTop: 10 }}>
                  <strong>Quotation currency:</strong> {docCurrency}
                  <br />
                  <strong>Other payment currencies accepted:</strong>{' '}
                  {quote.accept_other_payment_currency === false ? 'No' : 'Yes'}
                  {quote.payment_currency && quote.payment_currency !== docCurrency
                    ? ` (preferred: ${quote.payment_currency})`
                    : ''}
                  <br />
                  {quote.fx_rate && quote.fx_rate !== 1 ? (
                    <>
                      <strong>Exchange rate used:</strong> 1 {docCurrency} = {quote.fx_rate}{' '}
                      {quote.booking_currency || BASE_CURRENCY}
                      {quote.fx_rate_date ? ` (as of ${quote.fx_rate_date})` : ''}
                      <br />
                    </>
                  ) : null}
                  {quote.rate_valid_until ? (
                    <>
                      <strong>Rate valid until:</strong> {quote.rate_valid_until}
                      <br />
                    </>
                  ) : null}
                  <strong>Bank / conversion charges borne by:</strong>{' '}
                  {quote.charges_borne_by || 'Customer'}
                  <br />
                  {quote.net_amount_required ? (
                    <>
                      <strong>Net amount required:</strong> {quote.net_amount_required}
                      <br />
                    </>
                  ) : null}
                  {quote.payment_instructions ? (
                    <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                      <strong>Payment instructions ({quote.payment_currency || docCurrency}):</strong>
                      <br />
                      {quote.payment_instructions}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {settings.accountName && (
                <div style={{ marginTop: 10 }}>
                  <strong>Bank:</strong> {settings.bankName} · {settings.accountName}
                  <br />
                  A/C {settings.bankAccount} · IBAN {settings.iban}
                </div>
              )}
            </div>

            {isWandersQuote && (
              <div style={{ marginTop: 18, fontSize: 12.5, lineHeight: 1.55, color: '#333' }}>
                {wandersLegalReady ? (
                  <div style={{ marginBottom: 10 }}>
                    <strong>Contracting entity:</strong> {settings.wandersLegalEntityName}
                    <br />
                    {settings.wandersRegisteredAddress}
                  </div>
                ) : (
                  <div style={{ marginBottom: 10, fontStyle: 'italic', color: '#666' }}>
                    Contracting legal-entity details will appear here once confirmed (currently TBC —
                    not published as UAE or any assumed jurisdiction).
                  </div>
                )}
              </div>
            )}

            {(doc.notes ||
              quoteFormat.defaultScopeNotes ||
              (!isWandersQuote && settings.quoteTerms) ||
              (isWandersQuote && wandersTermsBlock)) && (
              <div style={{ marginTop: 22, fontSize: 12.5, lineHeight: 1.55, color: '#333' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#c1121f' }}>
                  {quoteFormat.sectionHeadings.terms}
                </h3>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {isWandersQuote
                    ? [doc.notes, wandersTermsBlock].filter(Boolean).join('\n\n')
                    : [doc.notes, quoteFormat.defaultScopeNotes || settings.quoteTerms]
                        .filter(Boolean)
                        .join('\n\n')}
                </p>
              </div>
            )}

            {docType === 'quote' ? (
              <p style={{ marginTop: 18, fontSize: 13 }}>
                {isWandersQuote
                  ? null
                  : quoteFormat.closingNote || settings.quoteClosing || null}
              </p>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 40,
                margin: '42px 0 18px',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <div style={{ borderTop: '1px solid #bbb', paddingTop: 10, marginTop: 48 }}>
                For {settings.companyName || 'Red Reach Middle East FZE'}
              </div>
              <div style={{ borderTop: '1px solid #bbb', paddingTop: 10, marginTop: 48 }}>
                Client acceptance
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'linear-gradient(90deg, #c1121f 0%, #e85d04 55%, #f48c06 100%)',
              color: '#fff',
              textAlign: 'center',
              fontSize: 12.5,
              fontWeight: 600,
              padding: '12px 16px',
            }}
          >
            {settings.tagline || 'Multi-division commerce · UAE'}
            {settings.website ? ` · ${settings.website}` : ''}
          </div>
        </div>
      </div>

      <EmailComposeModal
        open={emailOpen}
        companyName={doc.client || ''}
        contacts={emailContacts}
        defaultSubject={applyMessageTemplate(
          settings.emailQuoteSubject || DEFAULT_EMAIL_QUOTE_SUBJECT,
          emailVars,
        )}
        defaultBody={applyMessageTemplate(
          settings.emailQuoteBody || DEFAULT_EMAIL_QUOTE_BODY,
          emailVars,
        )}
        zohoEnabled={isZohoMailEnabled(settings)}
        onClose={() => setEmailOpen(false)}
        onSent={() => void markQuoteSent()}
      />

      <style>{`
        @media print {
          body { background: #fff !important; }
          a, button { display: none !important; }
        }
      `}</style>
    </div>
  )
}

const cell: CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid #e2e2e2',
  textAlign: 'left',
}

const totalRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  padding: '6px 0',
}

function formatSizes(raw: LineItem['sizes_json']): string {
  if (!raw) return '—'
  try {
    const obj = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, number>) : raw
    const parts = Object.entries(obj || {})
      .filter(([, n]) => Number(n) > 0)
      .map(([k, n]) => `${k}:${n}`)
    return parts.length ? parts.join(' ') : '—'
  } catch {
    return '—'
  }
}

function renderLineCell(col: QuoteColumnId, it: LineItem, showSku: boolean): ReactNode {
  switch (col) {
    case 'line':
      return it.line_no
    case 'sku':
      return showSku ? it.sku || '—' : '—'
    case 'description':
      return it.description
    case 'sizes':
      return formatSizes(it.sizes_json)
    case 'qty':
    case 'hours':
      return it.qty
    case 'unit':
      return '—'
    case 'unit_price':
    case 'rate':
      return Number(it.unit_price).toFixed(2)
    case 'amount':
      return Number(it.amount).toFixed(2)
    case 'vat':
      return Number(it.vat_amount).toFixed(2)
    case 'total':
      return Number(it.line_total).toFixed(2)
    case 'period':
      return '—'
    default:
      return '—'
  }
}

function ToolbarBtn({
  children,
  onClick,
  disabled,
  accent,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none',
        border: 0,
        borderRadius: 999,
        padding: '10px 14px',
        fontWeight: 600,
        cursor: disabled ? 'wait' : 'pointer',
        background: accent ? '#25D366' : '#fff',
        color: accent ? '#fff' : '#111',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        opacity: disabled ? 0.6 : 1,
        fontSize: 13,
      }}
    >
      {children}
    </button>
  )
}
