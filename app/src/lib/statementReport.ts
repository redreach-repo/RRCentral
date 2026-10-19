import { jsPDF } from 'jspdf'
import { expenseVatParts, incomeVatParts } from './finance'
import { expenseReportDescription } from './supplierInvoiceStore'
import type { Expense, IncomeEntry, PaymentLogEntry } from './types'

/** One line of the income & expenses statement. Income is money in (+), expenses money out (−). */
export interface StatementRow {
  id: string
  date: string
  kind: 'income' | 'expense'
  party: string
  description: string
  reference: string
  category: string
  exclusive: number
  vat: number
  inclusive: number
}

export interface Statement {
  from: string
  to: string
  rows: StatementRow[]
  totals: {
    income: number
    expenses: number
    net: number
    outputVat: number
    inputVat: number
    netVat: number
    incomeCount: number
    expenseCount: number
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

function inRange(date: string | null | undefined, from: string, to: string): boolean {
  const d = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  return (!from || d >= from) && (!to || d <= to)
}

/** First and last day (yyyy-MM-dd) of a calendar quarter. */
export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
  const mm = (m: number) => String(m).padStart(2, '0')
  return { from: `${year}-${mm(startMonth)}-01`, to: `${year}-${mm(endMonth)}-${lastDay}` }
}

/**
 * Merge recognised income and expenses between `from` and `to` (inclusive, yyyy-MM-dd)
 * into one date-ordered statement with totals and VAT. Invoices with recorded
 * payments appear once per payment, on the day each was received.
 */
export function buildStatement(
  income: IncomeEntry[],
  expenses: Expense[],
  from: string,
  to: string,
  vatRate = 0.05,
  payments: Pick<PaymentLogEntry, 'id' | 'invoice_ref' | 'amount' | 'created_at'>[] = [],
): Statement {
  const rows: StatementRow[] = []
  // Payments recorded against each invoice: income is shown per payment, on the day received.
  const paymentsByRef = new Map<string, Pick<PaymentLogEntry, 'id' | 'amount' | 'created_at'>[]>()
  for (const p of payments) {
    const ref = String(p.invoice_ref || '').trim()
    if (!ref || !(Number(p.amount) > 0)) continue
    paymentsByRef.set(ref, [...(paymentsByRef.get(ref) || []), p])
  }
  for (const r of income) {
    const parts = incomeVatParts(r, vatRate)
    const ref = String(r.reference_number || '').trim()
    const base = {
      kind: 'income' as const,
      party: r.client_source || '',
      description: r.description || r.category || '',
      reference: ref,
      category: r.category || '',
    }
    const paid = (ref && paymentsByRef.get(ref)) || []
    if (!paid.length) {
      if (!inRange(r.date, from, to)) continue
      rows.push({
        ...base,
        id: `i-${r.id}`,
        date: String(r.date).slice(0, 10),
        exclusive: round2(parts.exclusive),
        vat: round2(parts.vat),
        inclusive: round2(parts.inclusive),
      })
      continue
    }
    // Split the invoice VAT across its payments in proportion to each amount;
    // when the payments add up to the invoice, the last one takes the rounding.
    const sorted = [...paid].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    const total = parts.inclusive > 0 ? parts.inclusive : sorted.reduce((s, p) => s + Number(p.amount), 0)
    const paidTotal = round2(sorted.reduce((s, p) => s + Number(p.amount), 0))
    const fullyPaid = Math.abs(paidTotal - total) < 0.01
    let vatSoFar = 0
    sorted.forEach((p, i) => {
      const amount = round2(Number(p.amount))
      const vat =
        fullyPaid && i === sorted.length - 1
          ? round2(parts.vat - vatSoFar)
          : round2(total > 0 ? (parts.vat * amount) / total : 0)
      vatSoFar = round2(vatSoFar + vat)
      const date = String(p.created_at || '').slice(0, 10)
      if (!inRange(date, from, to)) return
      rows.push({
        ...base,
        id: `p-${p.id}`,
        date,
        description: [base.description, sorted.length > 1 ? `payment ${i + 1} of ${sorted.length}` : 'payment received']
          .filter(Boolean)
          .join(' · '),
        exclusive: round2(amount - vat),
        vat,
        inclusive: amount,
      })
    })
  }
  for (const r of expenses) {
    if (!inRange(r.date, from, to)) continue
    const parts = expenseVatParts(r, vatRate)
    const description = expenseReportDescription(r)
    rows.push({
      id: `e-${r.id}`,
      date: String(r.date).slice(0, 10),
      kind: 'expense',
      party: r.vendor || '',
      description: description === r.vendor ? '' : description,
      reference: r.quote_ref || r.supplier_invoice_no || r.references_text || '',
      category: r.category || '',
      exclusive: round2(parts.exclusive),
      vat: round2(parts.vat),
      inclusive: round2(parts.inclusive),
    })
  }
  // Oldest first; income before expenses on the same day.
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'income' ? -1 : 1))

  const sum = (kind: StatementRow['kind'], key: 'inclusive' | 'vat') =>
    round2(rows.filter((r) => r.kind === kind).reduce((s, r) => s + r[key], 0))
  const incomeTotal = sum('income', 'inclusive')
  const expenseTotal = sum('expense', 'inclusive')
  const outputVat = sum('income', 'vat')
  const inputVat = sum('expense', 'vat')
  return {
    from,
    to,
    rows,
    totals: {
      income: incomeTotal,
      expenses: expenseTotal,
      net: round2(incomeTotal - expenseTotal),
      outputVat,
      inputVat,
      netVat: round2(outputVat - inputVat),
      incomeCount: rows.filter((r) => r.kind === 'income').length,
      expenseCount: rows.filter((r) => r.kind === 'expense').length,
    },
  }
}

const money = (n: number) =>
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "+AED 1,050.00" for income, "-AED 78.09" for expenses (ASCII minus so it survives PDF / CSV fonts). */
export function signedAmount(n: number, kind: StatementRow['kind'] | 'net'): string {
  const negative = kind === 'expense' || (kind === 'net' && n < 0)
  return `${negative ? '-' : '+'}AED ${money(n)}`
}

/** VAT with the row's sign; zero shows as plain 0.00. */
export function signedVat(n: number, kind: StatementRow['kind']): string {
  if (Math.abs(n) < 0.005) return '0.00'
  return `${kind === 'income' ? '+' : '-'}${money(n)}`
}

export const entriesLabel = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`

function csvCell(value: unknown): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV with signed amounts: income positive, expenses negative. */
export function statementCsv(st: Statement, companyName = ''): string {
  const signed = (r: StatementRow, n: number) => (r.kind === 'expense' ? -n : n).toFixed(2)
  const lines = [
    [`${companyName ? `${companyName} – ` : ''}Income & expenses statement`],
    [`Period`, `${st.from} to ${st.to}`],
    [],
    ['Date', 'Type', 'Party', 'Description', 'Reference', 'Category', 'Amount ex-VAT (AED)', 'VAT (AED)', 'Amount (AED)'],
    ...st.rows.map((r) => [
      r.date,
      r.kind === 'income' ? 'Income (+)' : 'Expense (-)',
      r.party,
      r.description,
      r.reference,
      r.category,
      signed(r, r.exclusive),
      signed(r, r.vat),
      signed(r, r.inclusive),
    ]),
    [],
    ['Total income (+)', '', '', '', '', '', '', st.totals.outputVat.toFixed(2), st.totals.income.toFixed(2)],
    ['Total expenses (-)', '', '', '', '', '', '', (-st.totals.inputVat).toFixed(2), (-st.totals.expenses).toFixed(2)],
    ['Net', '', '', '', '', '', '', st.totals.netVat.toFixed(2), st.totals.net.toFixed(2)],
  ]
  return lines.map((l) => l.map(csvCell).join(',')).join('\n')
}

const GREEN: [number, number, number] = [21, 128, 61]
const RED: [number, number, number] = [185, 28, 28]
const INK: [number, number, number] = [17, 24, 39]
const MUTED: [number, number, number] = [107, 114, 128]
const RULE: [number, number, number] = [229, 231, 235]

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`
}

/** A4 PDF: summary, then every line with income in green (+) and expenses in red (−). */
export function statementPdf(st: Statement, companyName = 'RED REACH'): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const W = 210
  const H = 297
  const M = 14
  const right = W - M
  // Column x positions (right edge for numbers).
  const col = { date: M, desc: M + 24, vat: right - 34, amount: right }
  const descWidth = col.vat - 22 - col.desc

  let y = M
  const setColor = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2])

  // Header
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  setColor(INK)
  pdf.text(companyName, M, y + 4)
  pdf.setFontSize(12)
  pdf.text('Income & expenses statement', M, y + 11)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  setColor(MUTED)
  pdf.text(`Period: ${prettyDate(st.from)} – ${prettyDate(st.to)}`, M, y + 17)
  pdf.text(`Generated ${prettyDate(new Date().toISOString().slice(0, 10))}`, right, y + 17, { align: 'right' })
  y += 24

  // Summary boxes
  const boxes: { label: string; value: string; color: [number, number, number]; sub: string }[] = [
    { label: 'Income', value: signedAmount(st.totals.income, 'income'), color: GREEN, sub: `${entriesLabel(st.totals.incomeCount)} · VAT ${money(st.totals.outputVat)}` },
    { label: 'Expenses', value: signedAmount(st.totals.expenses, 'expense'), color: RED, sub: `${entriesLabel(st.totals.expenseCount)} · VAT ${money(st.totals.inputVat)}` },
    {
      label: 'Net',
      value: signedAmount(st.totals.net, 'net'),
      color: st.totals.net < 0 ? RED : GREEN,
      sub: `Net VAT ${st.totals.netVat < 0 ? '-' : ''}${money(st.totals.netVat)} ${st.totals.netVat < 0 ? '(refundable)' : '(payable)'}`,
    },
  ]
  const gap = 4
  const bw = (W - 2 * M - gap * 2) / 3
  boxes.forEach((b, i) => {
    const x = M + i * (bw + gap)
    pdf.setDrawColor(RULE[0], RULE[1], RULE[2])
    pdf.roundedRect(x, y, bw, 20, 2, 2)
    pdf.setFontSize(8)
    setColor(MUTED)
    pdf.text(b.label.toUpperCase(), x + 4, y + 5.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    setColor(b.color)
    pdf.text(b.value, x + 4, y + 12)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    setColor(MUTED)
    pdf.text(b.sub, x + 4, y + 17)
  })
  y += 28

  const drawHeader = () => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    setColor(MUTED)
    pdf.text('DATE', col.date, y)
    pdf.text('DESCRIPTION', col.desc, y)
    pdf.text('VAT', col.vat, y, { align: 'right' })
    pdf.text('AMOUNT', col.amount, y, { align: 'right' })
    y += 2
    pdf.setDrawColor(INK[0], INK[1], INK[2])
    pdf.setLineWidth(0.4)
    pdf.line(M, y, right, y)
    pdf.setLineWidth(0.2)
    y += 4.5
    pdf.setFont('helvetica', 'normal')
  }

  const footer = () => {
    pdf.setFontSize(7.5)
    setColor(MUTED)
    pdf.text('Income shown in green (+), expenses in red (-). Amounts in AED and include VAT.', M, H - 8)
    pdf.text(`Page ${pdf.getNumberOfPages()}`, right, H - 8, { align: 'right' })
  }

  drawHeader()
  if (!st.rows.length) {
    pdf.setFontSize(9)
    setColor(MUTED)
    pdf.text('No income or expenses in this period.', M, y)
    y += 6
  }

  for (const r of st.rows) {
    const title = [r.party, r.description].filter(Boolean).join(' – ') || (r.kind === 'income' ? 'Income' : 'Expense')
    const meta = [r.reference, r.category].filter(Boolean).join(' · ')
    pdf.setFontSize(9)
    const lines = pdf.splitTextToSize(title, descWidth).slice(0, 2) as string[]
    const rowH = 4.2 * lines.length + (meta ? 3.6 : 0) + 2.6
    if (y + rowH > H - 16) {
      footer()
      pdf.addPage()
      y = M + 4
      drawHeader()
    }
    const color = r.kind === 'income' ? GREEN : RED
    setColor(INK)
    pdf.text(prettyDate(r.date), col.date, y)
    pdf.text(lines, col.desc, y)
    if (meta) {
      pdf.setFontSize(7.5)
      setColor(MUTED)
      pdf.text(meta, col.desc, y + 4.2 * lines.length - 0.6)
      pdf.setFontSize(9)
    }
    setColor(color)
    pdf.text(signedVat(r.vat, r.kind), col.vat, y, { align: 'right' })
    pdf.setFont('helvetica', 'bold')
    pdf.text(signedAmount(r.inclusive, r.kind), col.amount, y, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    y += rowH
    pdf.setDrawColor(RULE[0], RULE[1], RULE[2])
    pdf.line(M, y - 2.2, right, y - 2.2)
  }

  // Totals
  if (y + 26 > H - 16) {
    footer()
    pdf.addPage()
    y = M + 4
  }
  y += 2
  const totalLine = (label: string, vat: string, amount: string, color: [number, number, number], bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(bold ? 10.5 : 9.5)
    setColor(INK)
    pdf.text(label, col.desc, y)
    setColor(color)
    pdf.text(vat, col.vat, y, { align: 'right' })
    pdf.text(amount, col.amount, y, { align: 'right' })
    y += bold ? 7 : 5.5
  }
  totalLine('Total income', signedVat(st.totals.outputVat, 'income'), signedAmount(st.totals.income, 'income'), GREEN)
  totalLine('Total expenses', signedVat(st.totals.inputVat, 'expense'), signedAmount(st.totals.expenses, 'expense'), RED)
  pdf.setDrawColor(INK[0], INK[1], INK[2])
  pdf.setLineWidth(0.4)
  pdf.line(col.desc, y - 3.5, right, y - 3.5)
  pdf.setLineWidth(0.2)
  y += 1
  const netColor = st.totals.net < 0 ? RED : GREEN
  totalLine(
    'Net',
    `${st.totals.netVat < 0 ? '-' : '+'}${money(st.totals.netVat)}`,
    signedAmount(st.totals.net, 'net'),
    netColor,
    true,
  )
  footer()
  return pdf
}
