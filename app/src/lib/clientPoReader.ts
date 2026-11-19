/**
 * Client PO upload: the rules the app and the client-po-file Edge Function share
 * (bundled into the function by app/scripts/build-support-function.mjs), so the
 * file checks, the question asked of Claude and the clean up of its answer are
 * the same on both sides.
 *
 * Flow: the user picks the PO file, the function reads it (nothing is saved),
 * the form is filled in for review, and on Save the file goes to the client's
 * Google Drive folder and the PO row is written with the details.
 */
import { round2 } from './money'

/** Claude Opus 5.5: reads tables in scanned and photographed POs reliably. */
export const PO_READER_MODEL = 'claude-opus-5-5'

/** Claude Opus 5.5 prices in USD per million tokens. */
const PO_READER_PRICES = { inputPerM: 4, outputPerM: 20 }

/** PDFs up to 10 MB (same as other Drive uploads); images up to 5 MB (the AI's limit for one image). */
export const PO_MAX_PDF_BYTES = 10 * 1024 * 1024
export const PO_MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const PO_FILE_TYPES: Record<string, 'document' | 'image'> = {
  'application/pdf': 'document',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
}

/** What the file picker offers. */
export const PO_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/jpeg,image/png,image/webp,image/gif'

/** The content type to send for a file, falling back to the extension when the browser gives none. */
export function poContentType(filename: string, browserType: string): string {
  const t = String(browserType || '').toLowerCase()
  if (t === 'image/jpg') return 'image/jpeg'
  if (PO_FILE_TYPES[t]) return t
  const ext = String(filename || '').toLowerCase().split('.').pop() || ''
  const byExt: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  }
  return byExt[ext] || t
}

/** Plain words on why a file can't be read, or null when it can. */
export function poFileProblem(contentType: string, bytes: number): string | null {
  const kind = PO_FILE_TYPES[contentType]
  if (!kind) {
    return 'Upload the PO as a PDF or a photo (JPG, PNG, WEBP). iPhone HEIC photos: share them as JPG first.'
  }
  if (bytes <= 0) return 'The file is empty'
  if (kind === 'document' && bytes > PO_MAX_PDF_BYTES) return 'The PDF is over 10 MB'
  if (kind === 'image' && bytes > PO_MAX_IMAGE_BYTES) return 'The photo is over 5 MB. Take it at a smaller size or save it as a PDF.'
  return null
}

export type PoLineItem = {
  description: string
  quantity: number | null
  unit: string
  unit_price: number | null
  amount: number | null
}

/** What was read off the PO. Every field may be empty: the user checks and fills the gaps. */
export type ExtractedPo = {
  po_number: string
  client_name: string
  client_trn: string
  contact_name: string
  issued_on: string
  delivery_date: string
  currency: string
  line_items: PoLineItem[]
  subtotal: number | null
  vat_rate: number | null
  vat_amount: number | null
  total: number | null
  delivery_address: string
  delivery_terms: string
  payment_terms: string
  notes: string
}

export const EMPTY_PO: ExtractedPo = {
  po_number: '',
  client_name: '',
  client_trn: '',
  contact_name: '',
  issued_on: '',
  delivery_date: '',
  currency: '',
  line_items: [],
  subtotal: null,
  vat_rate: null,
  vat_amount: null,
  total: null,
  delivery_address: '',
  delivery_terms: '',
  payment_terms: '',
  notes: '',
}

const num = { type: ['number', 'null'] }
const str = { type: 'string' }

/** Structured output schema: the AI must answer in exactly this shape. */
export const PO_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(EMPTY_PO),
  properties: {
    po_number: str,
    client_name: str,
    client_trn: str,
    contact_name: str,
    issued_on: str,
    delivery_date: str,
    currency: str,
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unit', 'unit_price', 'amount'],
        properties: { description: str, quantity: num, unit: str, unit_price: num, amount: num },
      },
    },
    subtotal: num,
    vat_rate: num,
    vat_amount: num,
    total: num,
    delivery_address: str,
    delivery_terms: str,
    payment_terms: str,
    notes: str,
  },
}

export const PO_READER_SYSTEM =
  'You read purchase orders that customers send to Red Reach, a trading and services company in the UAE. ' +
  'The customer (the buyer who issued the PO) is the client; Red Reach is the supplier, so never give Red Reach as the client. ' +
  'Copy what the document says; never guess or work out a value that is not printed. Leave a text field empty and a number null when the PO does not show it. ' +
  'po_number: the PO / LPO / order number exactly as printed. client_trn: the buyer\'s TRN or VAT number. ' +
  'Dates as YYYY-MM-DD (UAE documents write day first, so 03/04/2026 is 3 April 2026). ' +
  'currency: the three letter code (AED, USD, EUR, ...); write AED for Dhs, Dirham or د.إ. ' +
  'Numbers without thousands separators or currency signs. vat_rate as a percent (5 for 5%). ' +
  'One line_items entry per ordered line, in order, with the description as printed. ' +
  'total is the grand total including VAT. delivery_terms covers delivery place, Incoterms and lead time; payment_terms the credit terms. ' +
  'notes: anything else on the PO the team should know (special instructions, penalties, validity), in one or two short sentences, or empty. ' +
  'The document may be in English or Arabic; answer in English but copy names, numbers and item descriptions as printed.'

export const PO_READER_PROMPT = 'Read this purchase order and fill in every field you can find on it.'

/** The user message: the file, then the ask. */
export function poReaderContent(contentType: string, base64: string): unknown[] {
  const kind = PO_FILE_TYPES[contentType]
  const file =
    kind === 'document'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } }
  return [file, { type: 'text', text: PO_READER_PROMPT }]
}

export function poReaderCostUsd(usage: { input_tokens?: number | null; output_tokens?: number | null }): number {
  const input = Math.max(0, Number(usage.input_tokens) || 0)
  const output = Math.max(0, Number(usage.output_tokens) || 0)
  const cost = (input * PO_READER_PRICES.inputPerM + output * PO_READER_PRICES.outputPerM) / 1_000_000
  return cost
}

function text(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/** A money or quantity value: numbers, or strings like "1,250.50" / "AED 1,250.50". Never negative. */
export function poNumber(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.-]/g, '')
    if (!cleaned || cleaned === '-' || cleaned === '.') return null
    n = Number(cleaned)
  } else return null
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** A real calendar date as YYYY-MM-DD, or ''. */
export function poDate(v: unknown): string {
  const s = text(v, 20)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return ''
  return s
}

export function poCurrency(v: unknown): string {
  const s = text(v, 20).toUpperCase()
  if (/^(DHS?|DIRHAMS?|AED|د\.إ)$/.test(s)) return 'AED'
  return /^[A-Z]{3}$/.test(s) ? s : ''
}

/** Cleans the AI's answer (or anything else) into a safe ExtractedPo. */
export function normaliseExtractedPo(raw: unknown): ExtractedPo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const items = Array.isArray(r.line_items) ? r.line_items : []
  const vatRate = poNumber(r.vat_rate)
  return {
    po_number: text(r.po_number, 100),
    client_name: text(r.client_name, 200),
    client_trn: text(r.client_trn, 40),
    contact_name: text(r.contact_name, 120),
    issued_on: poDate(r.issued_on),
    delivery_date: poDate(r.delivery_date),
    currency: poCurrency(r.currency),
    line_items: items
      .slice(0, 200)
      .map((it) => {
        const i = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>
        return {
          description: text(i.description, 500),
          quantity: poNumber(i.quantity),
          unit: text(i.unit, 30),
          unit_price: poNumber(i.unit_price),
          amount: poNumber(i.amount),
        }
      })
      .filter((i) => i.description || i.amount != null),
    subtotal: poNumber(r.subtotal),
    vat_rate: vatRate != null && vatRate <= 100 ? vatRate : null,
    vat_amount: poNumber(r.vat_amount),
    total: poNumber(r.total),
    delivery_address: text(r.delivery_address, 500),
    delivery_terms: text(r.delivery_terms, 500),
    payment_terms: text(r.payment_terms, 300),
    notes: text(r.notes, 1000),
  }
}

/** Parses the AI's JSON text. Bad JSON gives an empty PO rather than an error. */
export function parseExtractedPo(textOut: string): ExtractedPo {
  try {
    return normaliseExtractedPo(JSON.parse(textOut))
  } catch {
    return { ...EMPTY_PO }
  }
}

/** True when nothing useful came back (not a PO, or unreadable). */
export function poIsEmpty(po: ExtractedPo): boolean {
  return !po.po_number && !po.client_name && po.total == null && po.line_items.length === 0
}


/** The PO amount to save: the printed total, else subtotal plus VAT, else the sum of the lines. */
export function poTotal(po: Pick<ExtractedPo, 'total' | 'subtotal' | 'vat_amount' | 'line_items'>): number | null {
  if (po.total != null) return round2(po.total)
  if (po.subtotal != null) return round2(po.subtotal + (po.vat_amount || 0))
  const lines = po.line_items.filter((l) => l.amount != null)
  return lines.length ? round2(lines.reduce((s, l) => s + (l.amount || 0), 0)) : null
}

/**
 * Sums that don't add up on what was read, in plain words, so the user knows
 * where to look before saving. Allows 1 unit of rounding.
 */
export function poTotalsWarnings(po: Pick<ExtractedPo, 'total' | 'subtotal' | 'vat_amount' | 'vat_rate' | 'line_items'>): string[] {
  const out: string[] = []
  const off = (a: number, b: number) => Math.abs(a - b) > 1
  po.line_items.forEach((l, i) => {
    if (l.quantity != null && l.unit_price != null && l.amount != null && off(l.quantity * l.unit_price, l.amount)) {
      out.push(`Line ${i + 1}: quantity × price is ${round2(l.quantity * l.unit_price)}, but the line says ${l.amount}`)
    }
  })
  const withAmount = po.line_items.filter((l) => l.amount != null)
  if (po.subtotal != null && withAmount.length && withAmount.length === po.line_items.length) {
    const sum = round2(withAmount.reduce((s, l) => s + (l.amount || 0), 0))
    if (off(sum, po.subtotal)) out.push(`The lines add up to ${sum}, but the subtotal says ${po.subtotal}`)
  }
  if (po.subtotal != null && po.vat_rate != null && po.vat_amount != null && off((po.subtotal * po.vat_rate) / 100, po.vat_amount)) {
    out.push(`VAT at ${po.vat_rate}% of ${po.subtotal} is ${round2((po.subtotal * po.vat_rate) / 100)}, but the PO says ${po.vat_amount}`)
  }
  if (po.subtotal != null && po.total != null && off(po.subtotal + (po.vat_amount || 0), po.total)) {
    out.push(`Subtotal plus VAT is ${round2(po.subtotal + (po.vat_amount || 0))}, but the total says ${po.total}`)
  }
  return out
}

function nameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(l\.?\s?l\.?\s?c|llc|fze|fzco|fz-llc|fzc|co|company|est|establishment|trading|ltd|limited|plc|inc|the)\b\.?/g, ' ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim()
}

/**
 * The client on the PO, from the company wide list: same TRN first, then the
 * same name ignoring L.L.C / FZE and punctuation, then one name containing the
 * other. Null when nothing fits or more than one client fits equally.
 */
export function matchPoClient<C extends { id: string; company_name: string; trn?: string | null }>(
  po: Pick<ExtractedPo, 'client_name' | 'client_trn'>,
  clients: C[],
): C | null {
  const trn = String(po.client_trn || '').replace(/\D/g, '')
  if (trn.length >= 10) {
    const byTrn = clients.filter((c) => String(c.trn || '').replace(/\D/g, '') === trn)
    if (byTrn.length === 1) return byTrn[0]
  }
  const key = nameKey(po.client_name)
  if (!key) return null
  const exact = clients.filter((c) => nameKey(c.company_name) === key)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  if (key.length < 4) return null
  const partial = clients.filter((c) => {
    const k = nameKey(c.company_name)
    return k.length >= 4 && (k.includes(key) || key.includes(k))
  })
  return partial.length === 1 ? partial[0] : null
}

/** The Drive file name: "PO <number> <original name>", so the folder sorts by PO. */
export function poDriveFilename(poNumberText: string, original: string): string {
  const po = String(poNumberText || '').trim()
  const name = String(original || 'po.pdf').trim() || 'po.pdf'
  return (po ? `PO ${po} - ${name}` : name).slice(0, 200)
}

/**
 * What the Client POs page tells the user is not set up yet, in plain words.
 * Each half works on its own: reading without Drive, filing without reading.
 */
export function clientPoSetupNotes(setup: { reader: boolean; drive: boolean; reachable: boolean }, detailsReady: boolean): string[] {
  const out: string[] = []
  if (!detailsReady) {
    out.push('Saving the PO file and its line items needs the database update client-po-file-and-details.sql run in Supabase first. Until then only the PO number, date and amount are saved.')
  }
  if (!setup.reachable) {
    out.push('PO upload is not switched on yet: deploy client-po-file (GitHub > Actions > Deploy Edge Functions). You can still type the PO in by hand.')
    return out
  }
  if (!setup.reader) out.push('Reading POs automatically needs the ANTHROPIC_API_KEY secret in Supabase. Until then, type the details in by hand.')
  if (!setup.drive) out.push('Google Drive is not connected, so the PO file cannot be kept yet. An admin connects it under Settings > Google Drive.')
  return out
}

/** Money with its currency, e.g. "4,410.00 AED". */
export function formatPoMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  const n = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n} ${String(currency || 'AED').toUpperCase()}`
}
