/** M9a client PO tracker helpers. */
import { DIVISIONS } from './config'

export type ClientPoStatus = 'open' | 'partial' | 'fulfilled' | 'canceled'

export function clientPoIsOpen(status: ClientPoStatus | string): boolean {
  return status === 'open' || status === 'partial'
}

export function clientPoSummary(input: {
  poNumber: string
  accountName: string
  amount: number
  currency: string
  status: string
}): string {
  return `${input.accountName} PO ${input.poNumber}: ${input.amount} ${input.currency} (${input.status})`
}

export type ClientPoMatchCandidate = {
  invoiceId: string
  reference: string
  amount: number
  score: number
  reason: string
}

/** Soft-suggest invoice match by amount proximity (never invents payments). */
export function suggestClientPoInvoiceMatch(
  po: { amount: number; currency?: string },
  invoices: { id: string; reference_number?: string; amount?: number; currency?: string; status?: string }[],
): ClientPoMatchCandidate | null {
  const poAmt = Number(po.amount) || 0
  if (poAmt <= 0) return null
  let best: ClientPoMatchCandidate | null = null
  for (const inv of invoices) {
    const st = String(inv.status || '').toLowerCase()
    if (st === 'cancelled' || st === 'canceled' || st === 'draft') continue
    const amt = Number(inv.amount) || 0
    if (amt <= 0) continue
    const delta = Math.abs(amt - poAmt)
    const rel = delta / poAmt
    if (rel > 0.05 && delta > 1) continue
    const score = 1 - Math.min(1, rel)
    const cand: ClientPoMatchCandidate = {
      invoiceId: inv.id,
      reference: String(inv.reference_number || inv.id),
      amount: amt,
      score,
      reason: delta < 0.01 ? 'Exact amount' : `Within ${delta.toFixed(2)} AED`,
    }
    if (!best || cand.score > best.score) best = cand
  }
  return best
}

export function clientPoStatusAfterMatch(poAmount: number, invoiceAmount: number): ClientPoStatus {
  const po = Number(poAmount) || 0
  const inv = Number(invoiceAmount) || 0
  if (po <= 0) return 'fulfilled'
  if (inv + 0.009 >= po) return 'fulfilled'
  if (inv > 0) return 'partial'
  return 'open'
}

/** Status from cumulative received_amount vs PO amount. */
export function clientPoStatusAfterReceipt(poAmount: number, receivedAmount: number): ClientPoStatus {
  return clientPoStatusAfterMatch(poAmount, receivedAmount)
}

export function clientPoRemaining(poAmount: number, receivedAmount: number): number {
  return Math.max(0, Math.round(((Number(poAmount) || 0) - (Number(receivedAmount) || 0)) * 100) / 100)
}

/** Who the PO is from: the client (any department) or, for older rows, the CRM account. */
export function clientPoPartyName(row: {
  clients?: { company_name?: string | null } | null
  accounts?: { name?: string | null } | null
  client_id?: string | null
  account_id?: string | null
}): string {
  return (
    row.clients?.company_name?.trim() ||
    row.accounts?.name?.trim() ||
    row.client_id ||
    row.account_id ||
    'Unknown client'
  )
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a || '').trim().toLowerCase()
  const y = String(b || '').trim().toLowerCase()
  return x !== '' && x === y
}

/**
 * Invoices worth matching against a PO: same account, or same client name
 * (invoices carry the client as text). Falls back to every invoice when none fit.
 */
export function clientPoInvoicePool<
  I extends { account_id?: string | null; client?: string | null },
>(
  po: { account_id?: string | null; partyName: string },
  invoices: I[],
): I[] {
  const own = invoices.filter(
    (i) => (po.account_id && i.account_id === po.account_id) || sameName(i.client, po.partyName),
  )
  return own.length ? own : invoices
}

/** Departments a PO can be tagged with: the six trading divisions plus the three product lines. */
export const CLIENT_PO_DEPARTMENTS: { code: string; label: string }[] = [
  ...DIVISIONS.map((d) => ({ code: d.code, label: `${d.code} ${d.brand}` })),
  { code: '07', label: '07 AI CRM' },
  { code: '08', label: '08 WorshipHub' },
  { code: '09', label: '09 CTRM Next' },
]

export function clientPoDepartmentLabel(code: string | null | undefined): string {
  if (!code) return ''
  return CLIENT_PO_DEPARTMENTS.find((d) => d.code === code)?.label ?? code
}

/** Status tab label for a PO status (open → Open). */
export function clientPoStatusLabel(status: string): string {
  const s = String(status || '').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Open'
}

/**
 * List filter for the Client POs page: vertical ('' = every vertical, 'none' = untagged),
 * status tab ('All', 'Open' = open or partial, or an exact status) and free text search
 * over the PO number and client name.
 */
export function filterClientPos<
  R extends {
    po_number: string
    status: string
    division_code?: string | null
    clients?: { company_name?: string | null } | null
    accounts?: { name?: string | null } | null
    client_id?: string | null
    account_id?: string | null
  },
>(rows: R[], opts: { department: string; status: string; search: string }): R[] {
  const q = opts.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (opts.department === 'none' && r.division_code) return false
    if (opts.department && opts.department !== 'none' && r.division_code !== opts.department) return false
    if (opts.status === 'Open' && !clientPoIsOpen(r.status)) return false
    if (opts.status && opts.status !== 'All' && opts.status !== 'Open') {
      if (clientPoStatusLabel(r.status) !== opts.status) return false
    }
    if (q) {
      const hay = `${r.po_number} ${clientPoPartyName(r)}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
