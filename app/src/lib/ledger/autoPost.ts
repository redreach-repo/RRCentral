import { roundAmount, sumAmounts } from '../money/index'
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
  bank: '1100',
  opex: '6000',
} as const

export type ExpenseAutoPostInput = {
  expenseId: string
  label: string
  entryDate: string
  exclusiveAed: number
  vatAed: number
  inclusiveAed: number
}

export function invoiceToDraftLines(input: InvoiceAutoPostInput): AutoPostLine[] {
  const ex = round2(input.exclusiveAed)
  const vat = round2(input.vatAed)
  const inc = round2(input.inclusiveAed || sumAmounts([ex, vat]))
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

/** Expense → Dr opex (+ optional VAT as opex), Cr bank (Unverified). */
export function expenseToDraftLines(input: ExpenseAutoPostInput): AutoPostLine[] {
  const ex = round2(input.exclusiveAed)
  const vat = round2(input.vatAed)
  const inc = round2(input.inclusiveAed || sumAmounts([ex, vat]))
  if (inc <= 0) return []
  const lines: AutoPostLine[] = [
    {
      code: AUTO_POST_CODES.opex,
      memo: `Expense ${input.label}`,
      debit: ex > 0 ? ex : inc,
      credit: 0,
    },
    {
      code: AUTO_POST_CODES.bank,
      memo: `Pay ${input.label}`,
      debit: 0,
      credit: inc,
    },
  ]
  if (vat > 0 && ex > 0) {
    lines.splice(1, 0, {
      code: AUTO_POST_CODES.opex,
      memo: `Input VAT stub ${input.label}`,
      debit: vat,
      credit: 0,
    })
  }
  return lines
}

export function expenseAutoPostMemo(input: ExpenseAutoPostInput): string {
  return `Auto draft from expense ${input.label} (Unverified — not tax advice)`
}

export function expenseAutoPostSourceId(expenseId: string): string {
  return `expense:${expenseId}`
}

function round2(n: number): number {
  return roundAmount(n, 'AED')
}

/** Exact: debits equal credits to the fil. */
export function linesBalance(lines: AutoPostLine[]): boolean {
  return sumAmounts(lines.map((l) => l.debit)) === sumAmounts(lines.map((l) => l.credit))
}
