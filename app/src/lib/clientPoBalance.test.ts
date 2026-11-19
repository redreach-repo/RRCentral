import { describe, expect, it } from 'vitest'
import {
  drawdownRows,
  invoiceLineFromPo,
  issuedToGroup,
  overDrawWarnings,
  poLineBalances,
  poStatusFromBalances,
  sizeCounts,
  staffForGroup,
  staffGroups,
  withLineIds,
  type PoDrawdown,
} from './clientPoBalance'

const lines = [
  { id: 'd', description: 'Uniform, drivers', quantity: 30, unit: 'set', unit_price: 100, amount: 3000, staff_group: 'Driver' },
  { id: 'p', description: 'Uniform, pump operators', quantity: 20, unit: 'set', unit_price: 100, amount: 2000 },
  { id: 'h', description: 'Uniform, helpers', quantity: 40, unit: 'set', unit_price: 90, amount: 3600 },
]
const dd = (invoice_id: string, po_line_id: string, quantity: number, status = 'Sent', date = '2026-11-01'): PoDrawdown => ({
  po_id: 'po',
  invoice_id,
  po_line_id,
  quantity,
  invoices: { reference_number: `RR-${invoice_id}`, status, date },
})

describe('PO balances', () => {
  it('requested minus everything invoiced, line by line', () => {
    const b = poLineBalances(lines, [dd('i1', 'd', 10), dd('i1', 'p', 10), dd('i1', 'h', 20), dd('i2', 'd', 5, 'Sent', '2026-11-10')])
    expect(b.map((x) => [x.requested, x.invoiced, x.balance])).toEqual([
      [30, 15, 15],
      [20, 10, 10],
      [40, 20, 20],
    ])
    expect(b[0].takenBy.map((t) => t.reference)).toEqual(['RR-i2', 'RR-i1'])
  })

  it('cancelled invoices give their quantities back', () => {
    const b = poLineBalances(lines, [dd('i1', 'd', 10, 'Cancelled')])
    expect(b[0].invoiced).toBe(0)
    expect(b[0].balance).toBe(30)
  })

  it('leaves out the invoice being edited', () => {
    const b = poLineBalances(lines, [dd('i1', 'd', 10), dd('i2', 'd', 5)], 'i2')
    expect(b[0].invoiced).toBe(10)
  })

  it('status follows the lines', () => {
    expect(poStatusFromBalances(poLineBalances(lines, []))).toBe('open')
    expect(poStatusFromBalances(poLineBalances(lines, [dd('i1', 'd', 1)]))).toBe('partial')
    expect(poStatusFromBalances(poLineBalances(lines, [dd('i1', 'd', 30), dd('i1', 'p', 20), dd('i1', 'h', 40)]))).toBe('fulfilled')
    expect(poStatusFromBalances([])).toBeNull()
  })

  it('warns when an invoice takes more than is left', () => {
    const b = poLineBalances(lines, [dd('i1', 'd', 25)])
    expect(overDrawWarnings(b, { d: 10, p: 5 })).toEqual(['Uniform, drivers: 10 on this invoice, but only 5 left on the PO'])
    expect(overDrawWarnings(b, { d: 5 })).toEqual([])
  })

  it('saves only real quantities for lines on the PO', () => {
    expect(drawdownRows('po', 'inv', lines, { d: 10, p: 0, x: 4, h: 2.5 }, 'alfred')).toEqual([
      { po_id: 'po', po_line_id: 'd', invoice_id: 'inv', quantity: 10, created_by: 'alfred' },
      { po_id: 'po', po_line_id: 'h', invoice_id: 'inv', quantity: 2.5, created_by: 'alfred' },
    ])
  })

  it('makes the invoice line from the PO line', () => {
    expect(invoiceLineFromPo(lines[2], 20, 'LPO-9')).toEqual({ description: 'Uniform, helpers', qty: 20, unit_price: 90, remarks: 'Client PO LPO-9' })
  })

  it('gives lines a stable id and keeps existing ones', () => {
    const out = withLineIds([{ description: 'a', quantity: 1, unit: '', unit_price: null, amount: null }, lines[0]])
    expect(out[0].id).toBeTruthy()
    expect(out[1].id).toBe('d')
  })
})

describe('uniform staff on a PO line', () => {
  const staff = [
    { id: 's1', job_title: 'Driver', department: '', active: true, shirt_size: 'M', trouser_size: '32' },
    { id: 's2', job_title: 'driver', department: '', active: true, shirt_size: 'L', trouser_size: '34' },
    { id: 's3', job_title: 'Drivers', department: '', active: true, shirt_size: 'm', trouser_size: '' },
    { id: 's4', job_title: 'Pump Operator', department: '', active: true, shirt_size: 'XL', trouser_size: '36' },
    { id: 's5', job_title: 'Driver', department: '', active: false, shirt_size: 'S', trouser_size: '30' },
    { id: 's6', job_title: '', department: 'Helpers', active: true, shirt_size: '', trouser_size: '' },
  ]

  it('matches the group by job title or department, ignoring plurals and case, active only', () => {
    expect(staffForGroup(staff, 'Drivers').map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    expect(staffForGroup(staff, 'helper').map((s) => s.id)).toEqual(['s6'])
    expect(staffForGroup(staff, '')).toEqual([])
  })

  it('lists each group once', () => {
    expect(staffGroups(staff)).toEqual(['Driver', 'Helpers', 'Pump Operator'])
  })

  it('counts sizes', () => {
    const drivers = staffForGroup(staff, 'Driver')
    expect(sizeCounts(drivers, 'shirt_size')).toBe('L ×1, M ×2')
    expect(sizeCounts(drivers, 'trouser_size')).toBe('32 ×1, 34 ×1, (no size) ×1')
  })

  it('sums what was issued to the group', () => {
    const issues = [
      { id: 'a', staff_id: 's1', item: 'Shirt', size: 'M', quantity: 2, issued_on: '2026-10-01', notes: '' },
      { id: 'b', staff_id: 's2', item: 'Shirt', size: 'L', quantity: 1, issued_on: '2026-11-05', notes: '' },
      { id: 'c', staff_id: 's4', item: 'Shirt', size: 'XL', quantity: 3, issued_on: '2026-11-09', notes: '' },
    ]
    expect(issuedToGroup(issues, ['s1', 's2', 's3'])).toEqual({ items: 3, people: 2, last: '2026-11-05' })
  })
})
