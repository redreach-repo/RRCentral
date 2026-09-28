import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { FileUp } from 'lucide-react'
import Modal from '../Modal'
import { useToast } from '../../contexts/ToastContext'
import { PAYMENT_METHODS } from '../../lib/config'
import type { Attachment, Expense, Quotation, Vendor } from '../../lib/types'
import { logActivity } from '../../lib/activity'
import { round2 } from '../../lib/lineItems'
import { formatAED } from '../../lib/money'
import { supplierInvoiceProfit } from '../../lib/supplierInvoiceParse'
import {
  clearSupplierInvoiceBlobs,
  loadQuoteSupplierExpenses,
  loadQuoteSupplierInvoiceAttachments,
  saveSupplierInvoiceForQuote,
} from '../../lib/supplierInvoiceStore'
import { isWorkDriveShareUrl } from '../../lib/customerFiles'
import { resolveDealRef } from '../../lib/dealQuotes'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../../lib/uiStyles'

type Props = {
  /** Quotation to record a supplier invoice for; null keeps the dialog closed. */
  quote: Quotation | null
  vendors: Vendor[]
  vatRate: number
  who: string
  onClose: () => void
  onSaved: () => void | Promise<void>
}

/** Record the supplier's invoice (cost + VAT) against a quotation's deal. */
export default function SupplierInvoiceModal({ quote, vendors, vatRate, who, onClose, onSaved }: Props) {
  const { showToast } = useToast()
  const supplierInvoiceTarget = quote
  const [saving, setSaving] = useState(false)
  const [supplierInvoiceForm, setSupplierInvoiceForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    vendor: '',
    supplier_invoice_no: '',
    amount: 0,
    amount_ex_vat: 0,
    vat_amount: 0,
    payment_method: 'Bank transfer',
    notes: '',
  })
  const [supplierInvoiceWorkDriveUrl, setSupplierInvoiceWorkDriveUrl] = useState('')
  const [supplierInvoiceWorkDriveTitle, setSupplierInvoiceWorkDriveTitle] = useState('')
  const [supplierInvoiceAttachments, setSupplierInvoiceAttachments] = useState<Attachment[]>([])
  const [supplierInvoiceExpenses, setSupplierInvoiceExpenses] = useState<Expense[]>([])
  const [supplierInvoiceHint, setSupplierInvoiceHint] = useState('')
  const [vendorSuggest, setVendorSuggest] = useState(false)

  const supplierInvoiceProfitPreview = useMemo(() => {
    if (!supplierInvoiceTarget) return null
    return supplierInvoiceProfit({
      quoteAmount: Number(supplierInvoiceTarget.amount) || 0,
      quoteOffsetVat: Boolean(supplierInvoiceTarget.offset_vat),
      expenseExclusive: supplierInvoiceForm.amount_ex_vat,
      expenseVat: supplierInvoiceForm.vat_amount,
      vatRate,
    })
  }, [supplierInvoiceTarget, supplierInvoiceForm.amount_ex_vat, supplierInvoiceForm.vat_amount, vatRate])

  const vendorMatches = useMemo(() => {
    const q = supplierInvoiceForm.vendor.trim().toLowerCase()
    if (!q) return vendors.slice(0, 8)
    return vendors.filter((v) => v.company_name.toLowerCase().includes(q)).slice(0, 8)
  }, [vendors, supplierInvoiceForm.vendor])

  useEffect(() => {
    if (quote) void openSupplierInvoice(quote)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote])

  async function openSupplierInvoice(q: Quotation) {
    setSupplierInvoiceForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      vendor: '',
      supplier_invoice_no: '',
      amount: 0,
      amount_ex_vat: 0,
      vat_amount: 0,
      payment_method: PAYMENT_METHODS[0] || 'Bank transfer',
      notes: '',
    })
    setSupplierInvoiceWorkDriveUrl('')
    setSupplierInvoiceWorkDriveTitle('')
    setSupplierInvoiceHint(
      'Upload the PDF to Zoho WorkDrive, then paste the share link here. Old PDF blobs in Supabase are cleared automatically.',
    )
    try {
      // Free Supabase space from legacy data-URL supplier PDFs.
      try {
        const cleared = await clearSupplierInvoiceBlobs()
        if (cleared.quoteAttachments || cleared.expenseAttachments) {
          showToast(
            `Cleared ${cleared.quoteAttachments + cleared.expenseAttachments} stored PDF blob(s) from Supabase`,
            'success',
          )
        }
      } catch {
        /* ignore purge errors */
      }

      const [atts, exps] = await Promise.all([
        loadQuoteSupplierInvoiceAttachments(q),
        loadQuoteSupplierExpenses(q),
      ])
      // Prefer WorkDrive https links; hide leftover data-URL blobs from the list.
      const links = atts.filter((a) => !String(a.url || '').startsWith('data:'))
      setSupplierInvoiceAttachments(links)
      setSupplierInvoiceExpenses(exps)
      const latestLink = links[0]
      if (latestLink) {
        setSupplierInvoiceWorkDriveUrl(latestLink.url || '')
        setSupplierInvoiceWorkDriveTitle(latestLink.file_name || '')
      }
      const latest = exps[0]
      if (latest) {
        const extraNotes = String(latest.notes || '')
          .split(/\n/)
          .map((l) => l.trim())
          .filter((l) => l && !/^payment to\b/i.test(l))
          .join('\n')
        setSupplierInvoiceForm({
          date: latest.date ? latest.date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
          vendor: latest.vendor || '',
          supplier_invoice_no: latest.supplier_invoice_no || '',
          amount: Number(latest.amount) || 0,
          amount_ex_vat: Number(latest.amount_ex_vat) || 0,
          vat_amount: Number(latest.vat_amount) || 0,
          payment_method: latest.payment_method || PAYMENT_METHODS[0] || 'Bank transfer',
          notes: extraNotes,
        })
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load supplier invoices', 'error')
      setSupplierInvoiceAttachments([])
      setSupplierInvoiceExpenses([])
    }
  }

  async function saveSupplierInvoice() {
    if (!supplierInvoiceTarget) return
    if (!supplierInvoiceForm.vendor.trim()) {
      showToast('Vendor is required', 'error')
      return
    }
    if (!supplierInvoiceForm.amount && !supplierInvoiceForm.amount_ex_vat) {
      showToast('Enter the supplier invoice total', 'error')
      return
    }
    const linkUrl = supplierInvoiceWorkDriveUrl.trim()
    if (linkUrl && !isWorkDriveShareUrl(linkUrl)) {
      showToast('Use a Zoho WorkDrive share link', 'error')
      return
    }
    setSaving(true)
    try {
      const amount_ex_vat =
        supplierInvoiceForm.amount_ex_vat > 0
          ? round2(supplierInvoiceForm.amount_ex_vat)
          : round2(supplierInvoiceForm.amount / (1 + vatRate))
      const vat_amount =
        supplierInvoiceForm.vat_amount > 0
          ? round2(supplierInvoiceForm.vat_amount)
          : round2(supplierInvoiceForm.amount - amount_ex_vat)
      const amount =
        supplierInvoiceForm.amount > 0
          ? round2(supplierInvoiceForm.amount)
          : round2(amount_ex_vat + vat_amount)

      const result = await saveSupplierInvoiceForQuote({
        quote: supplierInvoiceTarget,
        workDriveLink: linkUrl
          ? {
              url: linkUrl,
              title:
                supplierInvoiceWorkDriveTitle.trim() ||
                supplierInvoiceForm.supplier_invoice_no.trim() ||
                'Supplier invoice',
            }
          : null,
        uploadedBy: who,
        vendor: supplierInvoiceForm.vendor,
        date: supplierInvoiceForm.date || null,
        amount,
        amount_ex_vat,
        vat_amount,
        payment_method: supplierInvoiceForm.payment_method,
        notes: supplierInvoiceForm.notes,
        supplier_invoice_no: supplierInvoiceForm.supplier_invoice_no,
        expenseId: supplierInvoiceExpenses[0]?.id,
        vatRate,
      })
      await logActivity(
        'save_supplier_invoice',
        'quotation',
        result.quoteRef,
        `${supplierInvoiceForm.vendor} · ${formatAED(amount)}`,
        who,
      )
      showToast(
        `Supplier invoice saved on deal ${result.dealRef || result.quoteRef}. VAT paid ${formatAED(vat_amount)}; cost shared across branch quotes when they have revenue.`,
        'success',
      )
      onClose()
      await onSaved()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save supplier invoice', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!supplierInvoiceTarget}
      title={`Supplier invoice · ${supplierInvoiceTarget?.reference_number || supplierInvoiceTarget?.quote_id || ''}`}
      onClose={onClose}
      width={640}
    >
      <p style={{ color: colors.muted, fontSize: 14, marginTop: 0, lineHeight: 1.5 }}>
        Store the PDF on <strong style={{ color: colors.text }}>Zoho WorkDrive</strong>, then paste
        the share link on this quotation’s deal (
        {supplierInvoiceTarget ? resolveDealRef(supplierInvoiceTarget) : '—'}). A matching expense
        is created for finance reports. Branch quotes on the same deal share the supplier cost.
      </p>
      <div style={fieldStyle}>
        <label style={labelStyle}>
          <FileUp size={12} style={{ marginRight: 4 }} />
          Zoho WorkDrive share link
        </label>
        <input
          style={inputStyle}
          value={supplierInvoiceWorkDriveUrl}
          onChange={(e) => setSupplierInvoiceWorkDriveUrl(e.target.value)}
          placeholder="https://workdrive.zoho.com/… or workdrive.zohoexternal.com/…"
        />
        <input
          style={{ ...inputStyle, marginTop: 8 }}
          value={supplierInvoiceWorkDriveTitle}
          onChange={(e) => setSupplierInvoiceWorkDriveTitle(e.target.value)}
          placeholder="Link title (optional) — e.g. Uniforms INV-8821"
        />
        {supplierInvoiceHint ? (
          <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.muted }}>{supplierInvoiceHint}</p>
        ) : null}
      </div>
      <div style={formGridStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Date</label>
          <input
            type="date"
            style={inputStyle}
            value={supplierInvoiceForm.date}
            onChange={(e) => setSupplierInvoiceForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Invoice number (from their PDF)</label>
          <input
            style={inputStyle}
            value={supplierInvoiceForm.supplier_invoice_no}
            onChange={(e) =>
              setSupplierInvoiceForm((f) => ({ ...f, supplier_invoice_no: e.target.value }))
            }
            placeholder="e.g. INV-8821 — not a vendor ID"
          />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: colors.muted }}>
            The number on the supplier’s tax invoice. You do not register a vendor number.
          </p>
        </div>
        <div style={{ ...fieldStyle, position: 'relative' }}>
          <label style={labelStyle}>Vendor company *</label>
          <input
            style={inputStyle}
            value={supplierInvoiceForm.vendor}
            onChange={(e) => {
              setSupplierInvoiceForm((f) => ({ ...f, vendor: e.target.value }))
              setVendorSuggest(true)
            }}
            onFocus={() => setVendorSuggest(true)}
            onBlur={() => window.setTimeout(() => setVendorSuggest(false), 150)}
            placeholder="Company name from the invoice"
          />
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
                    setSupplierInvoiceForm((f) => ({ ...f, vendor: v.company_name }))
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
            Pick a registered vendor or type a new company — saving registers them under Vendors.
          </p>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Payment method</label>
          <select
            style={selectStyle}
            value={supplierInvoiceForm.payment_method}
            onChange={(e) =>
              setSupplierInvoiceForm((f) => ({ ...f, payment_method: e.target.value }))
            }
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
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
            value={supplierInvoiceForm.amount_ex_vat || ''}
            onChange={(e) => {
              const amount_ex_vat = round2(Number(e.target.value) || 0)
              const vat_amount = round2(amount_ex_vat * vatRate)
              setSupplierInvoiceForm((f) => ({
                ...f,
                amount_ex_vat,
                vat_amount,
                amount: round2(amount_ex_vat + vat_amount),
              }))
            }}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>VAT paid</label>
          <input
            type="number"
            step="0.01"
            style={inputStyle}
            value={supplierInvoiceForm.vat_amount || ''}
            onChange={(e) => {
              const vat_amount = round2(Number(e.target.value) || 0)
              setSupplierInvoiceForm((f) => ({
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
            value={supplierInvoiceForm.amount || ''}
            onChange={(e) => {
              const amount = round2(Number(e.target.value) || 0)
              const amount_ex_vat = vatRate > 0 ? round2(amount / (1 + vatRate)) : amount
              setSupplierInvoiceForm((f) => ({
                ...f,
                amount,
                amount_ex_vat,
                vat_amount: round2(amount - amount_ex_vat),
              }))
            }}
          />
        </div>
      </div>
      {supplierInvoiceProfitPreview ? (
        <div style={{ ...cardStyle, padding: 12, marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
          <div>
            Customer revenue (ex-VAT):{' '}
            <strong>{formatAED(supplierInvoiceProfitPreview.revenueExclusive)}</strong>
          </div>
          <div>
            Supplier cost (ex-VAT):{' '}
            <strong>{formatAED(supplierInvoiceProfitPreview.expenseExclusive)}</strong>
          </div>
          <div>
            VAT paid: <strong>{formatAED(supplierInvoiceProfitPreview.expenseVat)}</strong>
          </div>
          <div>
            Gross profit:{' '}
            <strong
              style={{
                color:
                  supplierInvoiceProfitPreview.profit >= 0 ? colors.success : colors.danger,
              }}
            >
              {formatAED(supplierInvoiceProfitPreview.profit)}
            </strong>{' '}
            <span style={{ color: colors.muted2 }}>
              ({supplierInvoiceProfitPreview.marginPct}% margin)
            </span>
          </div>
        </div>
      ) : null}
      <div style={fieldStyle}>
        <label style={labelStyle}>Notes</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={supplierInvoiceForm.notes}
          onChange={(e) => setSupplierInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>
      {supplierInvoiceAttachments.length > 0 ? (
        <div style={fieldStyle}>
          <label style={labelStyle}>WorkDrive links on this quotation</label>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {supplierInvoiceAttachments.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer" style={{ color: colors.accent }}>
                  {a.file_name || 'Supplier invoice'}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          style={buttonSecondaryStyle}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          style={buttonPrimaryStyle}
          disabled={saving}
          onClick={() => void saveSupplierInvoice()}
        >
          {saving ? 'Saving…' : 'Save on quotation'}
        </button>
      </div>
    </Modal>
  )
}
