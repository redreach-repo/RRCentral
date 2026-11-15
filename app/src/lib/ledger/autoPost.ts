/**
 * M13: map a finalized invoice into draft GL lines (Unverified CoA mapping).
 * Never marks journals posted — human / maker-checker only.
 */

export type InvoiceAutoPostInput = {
  invoiceId: string
  invoiceNumber: string
  entryDate: string
  exclusiveAed: number
  vatAed: number
  inclusiveAed: number
}

export type AutoPostLine = {
  code: string
  memo: string
  debit: number
  credit: number
}

/** Starter UAE SME codes from seeded CoA — Unverified for tax. */
/** Codes match seeded starter CoA (Unverified). */
export const AUTO_POST_CODES = {
  ar: '1200',
  revenue: '4000',
  vatPayable: '2100',
} as const

export function invoiceToDraftLines(input: InvoiceAutoPostInput): AutoPostLine[] {
  const ex = round2(input.exclusiveAed)
  const vat = round2(input.vatAed)
  const inc = round2(input.inclusiveAed || ex + vat)
  if (inc <= 0) return []
  const lines: AutoPostLine[] = [
    {
      code: AUTO_POST_CODES.ar,
      memo: `AR ${input.invoiceNumber}`,
      debit: inc,
      credit: 0,
    },
    {
      code: AUTO_POST_CODES.revenue,
      memo: `Revenue ${input.invoiceNumber}`,
      debit: 0,
      credit: ex,
    },
  ]
  if (vat > 0) {
    lines.push({
      code: AUTO_POST_CODES.vatPayable,
      memo: `Output VAT ${input.invoiceNumber}`,
      debit: 0,
      credit: vat,
    })
  }
  return lines
}

export function autoPostMemo(input: InvoiceAutoPostInput): string {
  return `Auto draft from invoice ${input.invoiceNumber} (Unverified — not tax advice)`
}

export function autoPostSourceId(invoiceId: string): string {
  return `invoice:${invoiceId}`
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function linesBalance(lines: AutoPostLine[]): boolean {
  const d = lines.reduce((s, l) => s + l.debit, 0)
  const c = lines.reduce((s, l) => s + l.credit, 0)
  return Math.abs(round2(d) - round2(c)) < 0.005
}
