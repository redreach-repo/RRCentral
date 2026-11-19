import { describe, expect, it } from 'vitest'
import {
  canDeleteUniformIssue,
  canEditUniforms,
  filterUniformStaff,
  issuesForStaff,
  latestIssueByStaff,
  sizeForItem,
  uniformCsvRows,
  uniformIssueProblem,
  uniformSizeSummary,
  uniformStaffProblem,
  type UniformIssue,
  type UniformStaff,
} from './clientUniforms'
import type { UserRole } from '../types'

const person = (over: Partial<UniformStaff> = {}): UniformStaff => ({
  id: 's1',
  client_id: 'c1',
  full_name: 'Ali Hassan',
  employee_code: 'EMP-1',
  department: 'Kitchen',
  job_title: 'Chef',
  shirt_size: 'L',
  trouser_size: '32',
  jacket_size: '',
  shoe_size: '42',
  cap_size: '',
  other_sizes: '',
  active: true,
  notes: '',
  clients: { company_name: 'Maxtherm' },
  ...over,
})

const issue = (over: Partial<UniformIssue> = {}): UniformIssue => ({
  id: 'i1',
  staff_id: 's1',
  item: 'Shirt',
  size: 'L',
  quantity: 2,
  issued_on: '2026-10-01',
  notes: '',
  ...over,
})

describe('client uniform sizes', () => {
  it('summarises the sizes on file, skipping blanks', () => {
    expect(uniformSizeSummary(person())).toBe('Shirt L · Trousers 32 · Shoes 42')
    expect(uniformSizeSummary(person({ other_sizes: 'Gloves M' }))).toBe('Shirt L · Trousers 32 · Shoes 42 · Gloves M')
    expect(uniformSizeSummary(person({ shirt_size: '', trouser_size: '', shoe_size: '' }))).toBe('')
  })

  it('prefills the size for the item being issued', () => {
    expect(sizeForItem(person(), 'Shirt')).toBe('L')
    expect(sizeForItem(person(), 'polo')).toBe('L')
    expect(sizeForItem(person(), 'Trousers')).toBe('32')
    expect(sizeForItem(person(), 'Shoes')).toBe('42')
    expect(sizeForItem(person(), 'Apron')).toBe('')
  })

  it('filters by client, search text and people who have left', () => {
    const rows = [
      person(),
      person({ id: 's2', client_id: 'c2', full_name: 'Sara Ahmed', employee_code: 'X9', clients: { company_name: 'Emaar' } }),
      person({ id: 's3', full_name: 'Old Timer', active: false }),
    ]
    expect(filterUniformStaff(rows, {}).map((r) => r.id)).toEqual(['s1', 's2'])
    expect(filterUniformStaff(rows, { includeInactive: true })).toHaveLength(3)
    expect(filterUniformStaff(rows, { clientId: 'c2' }).map((r) => r.id)).toEqual(['s2'])
    expect(filterUniformStaff(rows, { search: 'emaar' }).map((r) => r.id)).toEqual(['s2'])
    expect(filterUniformStaff(rows, { search: 'emp-1' }).map((r) => r.id)).toEqual(['s1'])
    expect(filterUniformStaff(rows, { search: 'kitchen', clientId: 'c2' })).toHaveLength(1)
  })

  it('finds the last issue per person and lists history newest first', () => {
    const list = [
      issue({ id: 'a', issued_on: '2026-01-05' }),
      issue({ id: 'b', issued_on: '2026-09-20', item: 'Trousers' }),
      issue({ id: 'c', staff_id: 's2', issued_on: '2026-03-01' }),
    ]
    expect(latestIssueByStaff(list).get('s1')?.id).toBe('b')
    expect(latestIssueByStaff(list).get('s2')?.id).toBe('c')
    expect(issuesForStaff(list, 's1').map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('checks the forms before saving', () => {
    expect(uniformStaffProblem({ clientId: '', fullName: 'A' })).toMatch(/client/)
    expect(uniformStaffProblem({ clientId: 'c1', fullName: '  ' })).toMatch(/name/)
    expect(uniformStaffProblem({ clientId: 'c1', fullName: 'Ali' })).toBeNull()
    expect(uniformIssueProblem({ item: '', quantity: 1, issuedOn: '2026-11-19' })).toMatch(/item/)
    expect(uniformIssueProblem({ item: 'Shirt', quantity: 0, issuedOn: '2026-11-19' })).toMatch(/Quantity/)
    expect(uniformIssueProblem({ item: 'Shirt', quantity: 1.5, issuedOn: '2026-11-19' })).toMatch(/Quantity/)
    expect(uniformIssueProblem({ item: 'Shirt', quantity: 1, issuedOn: '' })).toMatch(/date/)
    expect(uniformIssueProblem({ item: 'Shirt', quantity: 3, issuedOn: '2026-11-19' })).toBeNull()
  })

  it('matches the database access rule for every role', () => {
    const edit: Record<UserRole, boolean> = { admin: true, manager: true, sales: true, staff: false, viewer: false }
    const del: Record<UserRole, boolean> = { admin: true, manager: true, sales: false, staff: false, viewer: false }
    for (const role of Object.keys(edit) as UserRole[]) {
      expect(canEditUniforms(role), role).toBe(edit[role])
      expect(canDeleteUniformIssue(role), role).toBe(del[role])
    }
    expect(canEditUniforms(null)).toBe(false)
  })

  it('exports one CSV line per person with their last issue', () => {
    const rows = uniformCsvRows([person()], latestIssueByStaff([issue()]))
    expect(rows[0]).toMatchObject({
      client: 'Maxtherm',
      name: 'Ali Hassan',
      shirt: 'L',
      last_issued_on: '2026-10-01',
      last_issued_item: '2 x Shirt (L)',
      active: 'yes',
    })
  })
})
