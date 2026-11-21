import { describe, expect, it } from 'vitest'
import {
  issuedNotInvoiced,
  issuedPerPerson,
  isAllStaffGroup,
  itemForLine,
  lineAmount,
  lookalikeClientsWithStaff,
  poIssuedByLine,
  poLineBalances,
  staffForLine,
  type PoDrawdown,
} from './clientPoBalance'
import { UNIFORM_ITEMS } from './clientUniforms/clientUniforms'

const lines = [
  { id: 'c', description: 'Coverall, navy', quantity: 60, unit: 'pcs', unit_price: 45, amount: 2700, staff_group: 'All staff' },
  { id: 's', description: 'Safety shoes', quantity: 30, unit: 'pair', unit_price: 120, amount: 3600, staff_group: 'Driver' },
]
const issue = (staff_id: string, po_line_id: string | null, quantity: number, po_id: string | null = 'po') => ({
  staff_id,
  po_id,
  po_line_id,
  quantity,
})
const issues = [
  issue('a', 'c', 2),
  issue('b', 'c', 2),
  issue('a', 'c', 1),
  issue('a', 's', 1),
  issue('a', 'c', 5, 'other-po'),
  issue('b', null, 3, null),
]

describe('uniforms issued against a PO', () => {
  it('sums items and people per PO line, only for this PO', () => {
    const m = poIssuedByLine(issues, 'po')
    expect(m.get('c')).toEqual({ items: 5, people: 2 })
    expect(m.get('s')).toEqual({ items: 1, people: 1 })
  })

  it('counts per person for one line', () => {
    const m = issuedPerPerson(issues, 'po', 'c')
    expect(m.get('a')).toBe(3)
    expect(m.get('b')).toBe(2)
  })

  it('bills issued minus invoiced, never below zero, cancelled invoices ignored', () => {
    const dd: PoDrawdown[] = [
      { po_id: 'po', po_line_id: 'c', invoice_id: 'i1', quantity: 2, invoices: { status: 'Sent' } },
      { po_id: 'po', po_line_id: 'c', invoice_id: 'i2', quantity: 3, invoices: { status: 'Cancelled' } },
      { po_id: 'po', po_line_id: 's', invoice_id: 'i1', quantity: 4, invoices: { status: 'Sent' } },
    ]
    const waiting = issuedNotInvoiced(poLineBalances(lines, dd), poIssuedByLine(issues, 'po'))
    expect(waiting).toEqual({ c: 3 })
  })

  it('"All staff" means every active person', () => {
    const staff = [
      { job_title: 'Driver', department: '', active: true },
      { job_title: 'Helper', department: '', active: true },
      { job_title: 'Helper', department: '', active: false },
    ]
    expect(isAllStaffGroup('all staff')).toBe(true)
    expect(isAllStaffGroup('Everyone')).toBe(true)
    expect(isAllStaffGroup('Driver')).toBe(false)
    expect(staffForLine(staff, 'All staff')).toHaveLength(2)
    expect(staffForLine(staff, 'Drivers')).toHaveLength(1)
  })

  it('finds the uniform item in the line description', () => {
    expect(itemForLine('Coverall, navy, 2 pairs', UNIFORM_ITEMS)).toBe('Coverall')
    expect(itemForLine('Polo T-shirts with logo', UNIFORM_ITEMS)).toBe('T-shirt')
    expect(itemForLine('Hi-vis reflective set', UNIFORM_ITEMS)).toBe('Hi-vis reflective set')
    expect(itemForLine('', UNIFORM_ITEMS)).toBe('Uniform')
  })

  it('works out the line amount', () => {
    expect(lineAmount(90, 45.5)).toBe(4095)
    expect(lineAmount(3, 0.1)).toBe(0.3)
    expect(lineAmount(null, 10)).toBeNull()
  })

  it('spots staff saved under a look-alike client record', () => {
    const staff = [
      { client_id: 'x', active: true, clients: { company_name: 'Sharjah Ready Mix Concrete LLC' } },
      { client_id: 'x', active: true, clients: { company_name: 'Sharjah Ready Mix Concrete LLC' } },
      { client_id: 'y', active: true, clients: { company_name: 'Sharjah Cement' } },
      { client_id: 'me', active: true, clients: { company_name: 'Sharjah Ready Mix' } },
    ]
    expect(lookalikeClientsWithStaff('me', 'Sharjah Ready Mix Concrete', staff)).toEqual([
      { clientId: 'x', name: 'Sharjah Ready Mix Concrete LLC', people: 2 },
    ])
  })
})
