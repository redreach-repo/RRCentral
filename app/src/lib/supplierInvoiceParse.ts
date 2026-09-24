import { VAT_RATE } from './config'
import { round2 } from './lineItems'

export type ParsedSupplierInvoice = {
  vendor: string
  date: string
  supplierInvoiceNo: string
  amountExVat: number | null
  vatAmount: number | null
  amountInclusive: number | null
  trn: string
  confidence: 'high' | 'medium' | 'low'
  rawTextSample: string
}

function moneyFromMatch(raw: string | undefined | null): number | null {
  if (!raw) return null
  const cleaned = String(raw).replace(/,/g, '').replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return round2(n)
}

function normalizeDate(raw: string): string {
  const s = raw.trim()
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  }
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (dmy) {
    const day = dmy[1].padStart(2, '0')
    const month = dmy[2].padStart(2, '0')
    let year = dmy[3]
    if (year.length === 2) year = `20${year}`
    return `${year}-${month}-${day}`
  }
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/)
  if (named) {
    const months: Record<string, string> = {
      jan: '01',
      january: '01',
      feb: '02',
      february: '02',
      mar: '03',
      march: '03',
      apr: '04',
      april: '04',
      may: '05',
      jun: '06',
      june: '06',
      jul: '07',
      july: '07',
      aug: '08',
      august: '08',
      sep: '09',
      sept: '09',
      september: '09',
      oct: '10',
      october: '10',
      nov: '11',
      november: '11',
      dec: '12',
      december: '12',
    }
    const m = months[named[2].toLowerCase()]
    if (m) return `${named[3]}-${m}-${named[1].padStart(2, '0')}`
  }
  return ''
}

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return ''
}

function guessVendor(lines: string[]): string {
  const skip =
    /^(tax\s*invoice|invoice|commercial\s*invoice|proforma|receipt|page\s*\d|tel|phone|fax|email|www\.|p\.?\s*o\.?\s*box|trn|vat|united arab|uae|dubai|abu dhabi)/i
  for (const line of lines.slice(0, 12)) {
    const t = line.trim()
    if (t.length < 3 || t.length > 80) continue
    if (skip.test(t)) continue
    if (/^\d[\d\s./-]*$/.test(t)) continue
    if (/^aed\b/i.test(t)) continue
    return t
  }
  return ''
}

/**
 * Parse plain text extracted from a supplier tax invoice (UAE-style heuristics).
 * Always editable in the UI — this is a best-effort prefill.
 */
export function parseSupplierInvoiceText(text: string, vatRate = VAT_RATE): ParsedSupplierInvoice {
  const cleaned = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const flat = cleaned.replace(/\r?\n/g, '\n')

  const supplierInvoiceNo = firstMatch(flat, [
    /(?:tax\s*)?invoice\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9/_-]{2,})/i,
    /(?:inv\.?\s*#|bill\s*no\.?)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9/_-]{2,})/i,
  ])

  const dateRaw = firstMatch(flat, [
    /(?:invoice\s*)?date\s*[:#]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i,
  ])
  const date = normalizeDate(dateRaw)

  const trn = firstMatch(flat, [/(?:trn|tax\s*registration(?:\s*number)?)\s*[:#]?\s*(\d{9,15})/i])

  const amountInclusive =
    moneyFromMatch(
      firstMatch(flat, [
        /grand\s*total\s*(?:amount|due|incl(?:uding)?\.?\s*vat)?\s*[:#]?\s*(?:aed|د\.إ)?\s*([\d,]+\.?\d*)/i,
        /(?:^|[^a-z])total\s*(?:amount|due|incl(?:uding)?\.?\s*vat)\s*[:#]?\s*(?:aed|د\.إ)?\s*([\d,]+\.?\d*)/i,
        /amount\s*payable\s*[:#]?\s*(?:aed)?\s*([\d,]+\.?\d*)/i,
        /(?:^|[^a-z])total\s*[:#]?\s*(?:aed)?\s*([\d,]+\.?\d*)/im,
      ]),
    ) || null

  let amountExVat =
    moneyFromMatch(
      firstMatch(flat, [
        /(?:sub\s*total|subtotal|taxable\s*amount|amount\s*(?:before|excl(?:uding)?)\s*vat|net\s*amount)\s*[:#]?\s*(?:aed)?\s*([\d,]+\.?\d*)/i,
      ]),
    ) || null

  let vatAmount =
    moneyFromMatch(
      firstMatch(flat, [
        /(?:vat|tax)\s*(?:amount)?\s*(?:\(?\s*5\s*%\s*\)?|@\s*5\s*%)?\s*[:#]?\s*(?:aed)?\s*([\d,]+\.?\d*)/i,
        /5\s*%\s*vat\s*[:#]?\s*(?:aed)?\s*([\d,]+\.?\d*)/i,
      ]),
    ) || null

  // Avoid treating the "5" in "VAT 5%" as the VAT amount when no currency figure follows cleanly.
  if (vatAmount != null && vatAmount <= 5 && amountInclusive != null && amountInclusive > 50) {
    const look = flat.match(/vat[^0-9]{0,20}([\d,]+\.\d{2})/i)
    const better = moneyFromMatch(look?.[1])
    if (better != null && better > vatAmount) vatAmount = better
    else if (amountExVat != null) vatAmount = round2(Math.max(0, amountInclusive - amountExVat))
  }

  const rate = Number(vatRate) || 0.05
  if (amountInclusive != null && amountInclusive > 0) {
    if (amountExVat == null && vatAmount == null) {
      amountExVat = round2(amountInclusive / (1 + rate))
      vatAmount = round2(amountInclusive - amountExVat)
    } else if (amountExVat == null && vatAmount != null) {
      amountExVat = round2(Math.max(0, amountInclusive - vatAmount))
    } else if (vatAmount == null && amountExVat != null) {
      vatAmount = round2(Math.max(0, amountInclusive - amountExVat))
    }
  } else if (amountExVat != null && vatAmount == null && rate > 0) {
    vatAmount = round2(amountExVat * rate)
  }

  const inclusive =
    amountInclusive != null
      ? amountInclusive
      : amountExVat != null && vatAmount != null
        ? round2(amountExVat + vatAmount)
        : null

  const vendor = guessVendor(lines)
  let confidence: ParsedSupplierInvoice['confidence'] = 'low'
  const hits = [supplierInvoiceNo, date, inclusive != null, amountExVat != null, vatAmount != null].filter(
    Boolean,
  ).length
  if (hits >= 4) confidence = 'high'
  else if (hits >= 2) confidence = 'medium'

  return {
    vendor,
    date,
    supplierInvoiceNo,
    amountExVat,
    vatAmount,
    amountInclusive: inclusive,
    trn,
    confidence,
    rawTextSample: lines.slice(0, 40).join('\n').slice(0, 1200),
  }
}

/** Gross profit when a supplier invoice is linked to a customer quotation. */
export function supplierInvoiceProfit(opts: {
  /** Quotation `amount` (customer total — usually VAT-inclusive). */
  quoteAmount: number
  /** When true, quote amount is the ex-VAT figure the customer pays. */
  quoteOffsetVat?: boolean
  expenseExclusive: number
  expenseVat: number
  vatRate?: number
}) {
  const rate = Number(opts.vatRate) || VAT_RATE
  const quoteAmount = round2(Math.max(0, Number(opts.quoteAmount) || 0))
  const expenseExclusive = round2(Math.max(0, Number(opts.expenseExclusive) || 0))
  const expenseVat = round2(Math.max(0, Number(opts.expenseVat) || 0))
  const revenueExclusive = opts.quoteOffsetVat
    ? quoteAmount
    : rate > 0
      ? round2(quoteAmount / (1 + rate))
      : quoteAmount
  const revenueVat = round2(Math.max(0, quoteAmount - revenueExclusive))
  const profit = round2(revenueExclusive - expenseExclusive)
  const marginPct = revenueExclusive > 0 ? round2((profit / revenueExclusive) * 100) : 0
  return {
    revenueExclusive,
    revenueVat,
    expenseExclusive,
    expenseVat,
    profit,
    marginPct,
    netVatPosition: round2(revenueVat - expenseVat),
  }
}
