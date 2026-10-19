import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildStatement } from './statementReport'
import { excelDate, statementXlsx } from './statementXlsx'
import type { Expense, IncomeEntry } from './types'

const income = {
  id: 'i1', client_source: 'Maxtherm', category: 'RR Threads', reference_number: 'RR-01-26003',
  date: '2026-09-28', description: '', bill_amount: 5237.82, vat: 261.89, total_amount: 5499.71,
  status: 'Paid', payment_method: '', payment_status: 'Paid',
} as IncomeEntry
const expense = {
  id: 'e1', date: '2026-08-04', vendor: 'Cursor <AI> & Co', category: 'Office', amount: 78.09,
  amount_ex_vat: 78.01, vat_amount: 0.08, payment_method: '', references_text: '', notes: '', created_at: '',
} as Expense

describe('statementXlsx', () => {
  it('converts dates to Excel serials', () => {
    expect(excelDate('1900-03-01')).toBe(61)
    expect(excelDate('2026-09-18')).toBe(46283)
  })

  it('builds a styled workbook with signed, coloured amounts', () => {
    const st = buildStatement([income], [expense], '2026-07-01', '2026-09-30', 0.05, [
      { id: 'p1', invoice_ref: 'RR-01-26003', amount: 2870.31, created_at: '2026-09-18T08:00:00+00:00' },
      { id: 'p2', invoice_ref: 'RR-01-26003', amount: 2629.4, created_at: '2026-09-30T08:00:00+00:00' },
    ])
    const files = unzipSync(statementXlsx(st, 'Red Reach'))
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    const styles = strFromU8(files['xl/styles.xml'])
    expect(styles).toContain('FF15803D') // green
    expect(styles).toContain('FFB91C1C') // red
    expect(styles).toContain('+#,##0.00_);-#,##0.00_);0.00_)')
    // Expense is negative with the red style (10/11); income payments positive with green (8/9).
    // Amount incl. VAT sits in column E, right after Description; VAT in F.
    expect(sheet).toMatch(/<c r="E\d+" s="11"><v>-78.09<\/v><\/c>/)
    expect(sheet).toMatch(/<c r="E\d+" s="9"><v>2870.31<\/v><\/c>/)
    expect(sheet).toMatch(/<c r="F\d+" s="8"><v>136.68<\/v><\/c>/)
    expect(sheet).toMatch(/<c r="E\d+" s="9"><v>5499.71<\/v><\/c>/) // total income incl. VAT
    expect(sheet).toContain('Invoice RR-01-26003 · payment 1 of 2')
    expect(sheet).toContain('Cursor &lt;AI&gt; &amp; Co')
    // Date as a real Excel date
    expect(sheet).toContain(`<v>${excelDate('2026-09-18')}</v>`)
  })
})
