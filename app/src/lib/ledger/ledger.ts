import { roundAmount, sumAmounts } from '../money/index'
/** M7 double-entry helpers (pure). CoA tax mapping stays Unverified. */

export type GlAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export type JournalLineInput = {
  accountId: string
  debit: number
  credit: number
  memo?: string
}

export type JournalBalance = {
  debitTotal: number
  creditTotal: number
  balanced: boolean
  lineCount: number
}

export function money2(n: number): number {
  return roundAmount(n, 'AED')
}

export function normalizeLine(line: JournalLineInput): JournalLineInput | null {
  const debit = money2(Math.max(0, Number(line.debit) || 0))
  const credit = money2(Math.max(0, Number(line.credit) || 0))
  if (!line.accountId.trim()) return null
  if (debit > 0 && credit > 0) return null
  if (debit <= 0 && credit <= 0) return null
  return {
    accountId: line.accountId.trim(),
    debit: credit > 0 ? 0 : debit,
    credit: debit > 0 ? 0 : credit,
    memo: (line.memo || '').trim(),
  }
}

export function journalBalance(lines: JournalLineInput[]): JournalBalance {
  let debitTotal = 0
  let creditTotal = 0
  let lineCount = 0
  for (const raw of lines) {
    const line = normalizeLine(raw)
    if (!line) continue
    debitTotal = sumAmounts([debitTotal, line.debit])
    creditTotal = sumAmounts([creditTotal, line.credit])
    lineCount += 1
  }
  return {
    debitTotal,
    creditTotal,
    balanced: lineCount >= 2 && debitTotal > 0 && debitTotal === creditTotal,
    lineCount,
  }
}

export function canPostJournal(input: {
  status: string
  lines: JournalLineInput[]
}): { ok: true } | { ok: false; reason: string } {
  if (input.status !== 'draft') return { ok: false, reason: 'Only draft journals can be posted' }
  const bal = journalBalance(input.lines)
  if (!bal.balanced) {
    return { ok: false, reason: 'Journal is not balanced (debits must equal credits)' }
  }
  return { ok: true }
}

export function nextJournalNumber(existing: string[], entryDate: string): string {
  const y = (entryDate || '').slice(0, 4) || String(new Date().getUTCFullYear())
  const prefix = `J-${y}-`
  let max = 0
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue
    const part = Number(n.slice(prefix.length))
    if (Number.isFinite(part) && part > max) max = part
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

/** Starter CoA codes shipped in migration — not a compliance chart. */
export const STARTER_COA: { code: string; name: string; account_type: GlAccountType }[] = [
  { code: '1000', name: 'Cash', account_type: 'asset' },
  { code: '1100', name: 'Bank', account_type: 'asset' },
  { code: '1200', name: 'Accounts receivable', account_type: 'asset' },
  { code: '2000', name: 'Accounts payable', account_type: 'liability' },
  { code: '2100', name: 'VAT payable', account_type: 'liability' },
  { code: '3000', name: 'Owner equity', account_type: 'equity' },
  { code: '4000', name: 'Sales revenue', account_type: 'revenue' },
  { code: '5000', name: 'Cost of sales', account_type: 'expense' },
  { code: '6000', name: 'Operating expenses', account_type: 'expense' },
  { code: '6100', name: 'Salaries', account_type: 'expense' },
]
