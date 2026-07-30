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
  const title = docType === 'quote' ? 'QUOTATION' : 'INVOICE'
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
  const summary = useMemo(() => {
    if (items.length) {
      const subtotal = items.reduce((s, i) => s + Number(i.amount || 0), 0)
      const vat = items.reduce((s, i) => s + Number(i.vat_amount || 0), 0)
      const total = items.reduce((s, i) => s + Number(i.line_total || 0), 0)
      return { subtotal, vat, total }
    }
    const total = Number(doc?.amount || 0)
    const subtotal = total / (1 + vatRate)
    return { subtotal, vat: total - subtotal, total }
  }, [items, doc, vatRate])

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
      amount: formatAED(summary.total),
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
    amount: formatAED(summary.total),
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
                    {division}
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
                  Bill to
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
                  Description
                </h3>
                <p style={{ margin: 0, lineHeight: 1.5, fontSize: 14 }}>{doc.description || '—'}</p>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 13.5 }}>
              <thead>
                <tr>
                  {['#', 'Description', 'Qty', 'Unit price', 'Amount', 'VAT', 'Total'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 8px',
                        borderBottom: '2px solid #222',
                        textAlign: h === '#' || h === 'Description' ? 'left' : 'right',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: '#555',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: '#555' }}>
                      No line items
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id}>
                      <td style={cell}>{it.line_no}</td>
                      <td style={cell}>{it.description}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{it.qty}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{Number(it.unit_price).toFixed(2)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{Number(it.amount).toFixed(2)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{Number(it.vat_amount).toFixed(2)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{Number(it.line_total).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div style={{ width: 280, margin: '18px 0 0 auto', fontSize: 14 }}>
              <div style={totalRow}>
                <span>Subtotal</span>
                <span>{formatAED(summary.subtotal)}</span>
              </div>
              <div style={totalRow}>
                <span>VAT ({(vatRate * 100).toFixed(0)}%)</span>
                <span>{formatAED(summary.vat)}</span>
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
                <span>Total</span>
                <span>{formatAED(summary.total)}</span>
              </div>
            </div>

            <div style={{ marginTop: 28, fontSize: 12.5, lineHeight: 1.55, color: '#333' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#c1121f' }}>Payment & delivery</h3>
              <div>Payment terms: {doc.payment_terms || settings.paymentTerms || '—'}</div>
              <div>Delivery: {doc.delivery_terms || settings.deliveryTerms || '—'}</div>
              {'moq' in doc && <div>MOQ: {doc.moq || settings.moqDefault || '—'}</div>}
              {settings.accountName && (
                <div style={{ marginTop: 10 }}>
                  <strong>Bank:</strong> {settings.bankName} · {settings.accountName}
                  <br />
                  A/C {settings.bankAccount} · IBAN {settings.iban}
                </div>
              )}
            </div>

            {(doc.notes || settings.quoteTerms) && (
              <div style={{ marginTop: 22, fontSize: 12.5, lineHeight: 1.55, color: '#333' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#c1121f' }}>Notes / terms</h3>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {doc.notes || settings.quoteTerms}
                </p>
              </div>
            )}

            {docType === 'quote' && settings.quoteClosing && (
              <p style={{ marginTop: 18, fontSize: 13 }}>{settings.quoteClosing}</p>
            )}

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
