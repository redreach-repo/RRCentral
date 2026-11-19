/**
 * Client PO balances: what each PO line asked for, what invoices have taken
 * so far, and what is left. Invoices take quantities through
 * client_po_drawdowns (one row per invoice per PO line); cancelled invoices
 * do not count.
 */
import type { PoLineItem } from './clientPoReader'
import type { UniformIssue, UniformSizeField, UniformStaff } from './clientUniforms/clientUniforms'

export type PoDrawdown = {
  id?: string
  po_id: string
  po_line_id: string
  invoice_id: string
  quantity: number
  invoices?: { reference_number?: string | null; status?: string | null; date?: string | null } | null
}

export type PoLineBalance = {
  line: PoLineItem & { id: string }
  requested: number
  invoiced: number
  balance: number
  /** Invoices that took some of this line, newest first. */
  takenBy: { invoiceId: string; reference: string; date: string; quantity: number }[]
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** Gives every line a stable id (keeps ids already there). */
export function withLineIds<L extends PoLineItem>(lines: L[]): (L & { id: string })[] {
  return lines.map((l) => (l.id ? (l as L & { id: string }) : { ...l, id: newId() }))
}

function qty(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** Two decimals without float noise (quantities, not money). */
function q2(n: number): number {
  return Number(n.toFixed(2)) // money-guard: not money
}

export function isCancelledStatus(status: string | null | undefined): boolean {
  return /^cancel/i.test(String(status || '').trim())
}

/**
 * Requested, invoiced and balance for each PO line. Pass excludeInvoiceId to
 * leave out the invoice being edited (so its own quantities are not counted twice).
 */
export function poLineBalances(lines: PoLineItem[], drawdowns: PoDrawdown[], excludeInvoiceId?: string): PoLineBalance[] {
  return lines
    .filter((l): l is PoLineItem & { id: string } => Boolean(l.id))
    .map((line) => {
      const mine = drawdowns.filter(
        (d) => d.po_line_id === line.id && d.invoice_id !== excludeInvoiceId && !isCancelledStatus(d.invoices?.status),
      )
      const invoiced = q2(mine.reduce((s, d) => s + qty(d.quantity), 0))
      const requested = qty(line.quantity)
      return {
        line,
        requested,
        invoiced,
        balance: q2(requested - invoiced),
        takenBy: mine
          .map((d) => ({
            invoiceId: d.invoice_id,
            reference: String(d.invoices?.reference_number || 'invoice'),
            date: String(d.invoices?.date || ''),
            quantity: qty(d.quantity),
          }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      }
    })
}

/** PO status from its lines: nothing taken = open, some = partial, all lines fully taken = fulfilled. */
export function poStatusFromBalances(balances: PoLineBalance[]): 'open' | 'partial' | 'fulfilled' | null {
  const counted = balances.filter((b) => b.requested > 0)
  if (!counted.length) return null
  if (counted.every((b) => b.balance <= 0)) return 'fulfilled'
  if (counted.some((b) => b.invoiced > 0)) return 'partial'
  return 'open'
}

/** Plain words for quantities that go over what the PO has left, or [] when all fit. */
export function overDrawWarnings(balances: PoLineBalance[], thisInvoice: Record<string, number>): string[] {
  const out: string[] = []
  for (const b of balances) {
    const take = qty(thisInvoice[b.line.id])
    if (take > 0 && b.requested > 0 && take > b.balance) {
      out.push(`${b.line.description || 'Line'}: ${take} on this invoice, but only ${Math.max(0, b.balance)} left on the PO`)
    }
  }
  return out
}

/** The drawdown rows to save for one invoice (only quantities above zero, only lines on the PO). */
export function drawdownRows(poId: string, invoiceId: string, lines: PoLineItem[], thisInvoice: Record<string, number>, by = '') {
  const ids = new Set(lines.map((l) => l.id).filter(Boolean))
  return Object.entries(thisInvoice)
    .filter(([lineId, n]) => ids.has(lineId) && qty(n) > 0)
    .map(([lineId, n]) => ({ po_id: poId, po_line_id: lineId, invoice_id: invoiceId, quantity: q2(qty(n)), created_by: by }))
}

/** An invoice line for a PO line: same description and unit price, the quantity taken now. */
export function invoiceLineFromPo(line: PoLineItem, take: number, poNumber: string) {
  return {
    description: line.description,
    qty: qty(take),
    unit_price: Number(line.unit_price) || 0,
    remarks: `Client PO ${poNumber}`,
  }
}

function norm(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .replace(/\b(\w+?)s\b/g, '$1')
    .trim()
}

/** Client staff whose job title (or department) matches a PO line's staff group, e.g. "Drivers" ~ "Driver". */
export function staffForGroup<S extends Pick<UniformStaff, 'job_title' | 'department' | 'active'>>(staff: S[], group: string | undefined): S[] {
  const g = norm(group)
  if (!g) return []
  return staff.filter((s) => s.active !== false && (norm(s.job_title) === g || norm(s.department) === g))
}

/** The staff groups a client has (job titles, else departments), for the PO line picker. */
export function staffGroups(staff: Pick<UniformStaff, 'job_title' | 'department' | 'active'>[]): string[] {
  const seen = new Map<string, string>()
  for (const s of staff) {
    if (s.active === false) continue
    const label = (s.job_title || s.department || '').trim()
    if (label && !seen.has(norm(label))) seen.set(norm(label), label)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** "M ×4, L ×6, (no size) ×1" for one size field across a group of people. */
export function sizeCounts(staff: Partial<Record<UniformSizeField, string | null>>[], field: UniformSizeField): string {
  const counts = new Map<string, number>()
  for (const s of staff) {
    const size = String(s[field] || '').trim().toUpperCase() || '(no size)'
    counts.set(size, (counts.get(size) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] === '(no size)' ? 1 : b[0] === '(no size)' ? -1 : a[0].localeCompare(b[0], undefined, { numeric: true })))
    .map(([size, n]) => `${size} ×${n}`)
    .join(', ')
}

/** Items issued to a group of people: total quantity and the last issue date. */
export function issuedToGroup(issues: UniformIssue[], staffIds: string[]): { items: number; people: number; last: string } {
  const ids = new Set(staffIds)
  const mine = issues.filter((i) => ids.has(i.staff_id))
  return {
    items: mine.reduce((s, i) => s + qty(i.quantity), 0),
    people: new Set(mine.map((i) => i.staff_id)).size,
    last: mine.reduce((m, i) => (i.issued_on > m ? i.issued_on : m), ''),
  }
}
