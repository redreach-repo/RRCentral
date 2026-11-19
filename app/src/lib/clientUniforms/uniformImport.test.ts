import { describe, expect, it } from 'vitest'
import type { UniformStaff } from './clientUniforms'
import {
  UNIFORM_TEMPLATE_HEADERS,
  findHeaderRow,
  guessMapping,
  importCounts,
  importPayload,
  planUniformImport,
} from './uniformImport'

const clients = [
  { id: 'c1', company_name: 'Maxtherm' },
  { id: 'c2', company_name: 'Emaar Hospitality' },
]

const saved = (over: Partial<UniformStaff> = {}): UniformStaff => ({
  id: 's1',
  client_id: 'c1',
  full_name: 'Ali Hassan',
  employee_code: 'EMP-1',
  department: '',
  job_title: '',
  shirt_size: 'L',
  trouser_size: '32',
  jacket_size: '',
  shoe_size: '42',
  cap_size: '',
  other_sizes: '',
  active: true,
  notes: '',
  ...over,
})

function plan(rows: string[][], extra: Partial<Parameters<typeof planUniformImport>[0]> = {}) {
  const headerRow = findHeaderRow(rows)
  return planUniformImport({
    rows,
    headerRow,
    mapping: guessMapping(rows[headerRow]),
    clients,
    existing: [],
    ...extra,
  })
}

describe('uniform upload', () => {
  it('matches the template headings to every field', () => {
    const m = guessMapping(UNIFORM_TEMPLATE_HEADERS)
    expect(Object.values(m).every((i) => i >= 0)).toBe(true)
  })

  it('matches common spreadsheet headings and skips a title row', () => {
    const rows = [
      ['Uniform measurements 2026'],
      ['Sr No', 'Employee Name', 'Designation', 'Shirt Size (S/M/L)', 'Pant Size', 'Safety Shoes', 'Chest'],
      ['1', 'Ali', 'Chef', 'L', '32', '42', '40'],
    ]
    expect(findHeaderRow(rows)).toBe(1)
    const m = guessMapping(rows[1])
    expect(m.full_name).toBe(1)
    expect(m.job_title).toBe(2)
    expect(m.shirt_size).toBe(3)
    expect(m.trouser_size).toBe(4)
    expect(m.shoe_size).toBe(5)
    expect(m.employee_code).toBe(-1)
  })

  it('never copies a serial number column into Other sizes', () => {
    const lines = plan(
      [
        ['S.No', 'Employee Name', 'Shirt', 'Chest (cm)'],
        ['1', 'Ali', 'L', '101.5'],
      ],
      { defaultClientId: 'c1', keepOtherColumns: true },
    )
    expect(lines[0].values.other_sizes).toBe('Chest (cm): 101.5')
  })

  it('uses the chosen client when the file has no client column, and keeps other columns', () => {
    const lines = plan(
      [
        ['Name', 'Shirt', 'Chest', 'Height'],
        ['Ali', 'L', '40', ''],
      ],
      { defaultClientId: 'c2', keepOtherColumns: true },
    )
    expect(lines[0]).toMatchObject({ status: 'new', clientId: 'c2', clientName: 'Emaar Hospitality' })
    expect(lines[0].values.other_sizes).toBe('Chest: 40')
  })

  it('flags rows it cannot save, with the spreadsheet row number', () => {
    const lines = plan([
      ['Client', 'Name', 'Employee no', 'Shirt'],
      ['Unknown Co', 'Ali', '1', 'L'],
      ['Maxtherm', '', '2', 'M'],
      ['', 'Sara', '3', 'S'],
      ['maxtherm ', 'Omar', '4', 'XL'],
      ['Maxtherm', 'Omar again', '4', 'XL'],
    ])
    expect(lines.map((l) => [l.rowNumber, l.status])).toEqual([
      [2, 'problem'],
      [3, 'problem'],
      [4, 'problem'],
      [5, 'new'],
      [6, 'problem'],
    ])
    expect(lines[0].problem).toMatch(/not in the clients list/)
    expect(lines[1].problem).toMatch(/No name/)
    expect(lines[2].problem).toMatch(/No client/)
    expect(lines[4].problem).toMatch(/row 5/)
  })

  it('updates people already saved instead of adding them twice', () => {
    const rows = [
      ['Client', 'Name', 'Employee no', 'Shirt', 'Trousers', 'Shoes'],
      ['Maxtherm', 'Ali Hassan', 'emp-1', 'XL', '', '42'],
      ['Maxtherm', 'Sara', '', 'M', '', ''],
      ['Maxtherm', 'Ali Hassan', 'EMP-9', 'S', '', ''],
    ]
    const existing = [saved(), saved({ id: 's2', full_name: 'sara', employee_code: '', shirt_size: 'M' })]
    const lines = plan(rows, { existing })
    expect(lines[0]).toMatchObject({ status: 'update', existingId: 's1', changes: ['Shirt size'] })
    expect(lines[1]).toMatchObject({ status: 'unchanged', existingId: 's2' })
    // Same name but a different employee no is a different person.
    expect(lines[2]).toMatchObject({ status: 'new' })
    expect(importCounts(lines)).toEqual({ new: 1, update: 1, unchanged: 1, problem: 0 })
    expect(Object.keys(importPayload(lines[2]))).toEqual(['full_name', 'employee_code', 'shirt_size'])
    // Only the change is sent: the blank trousers cell keeps the saved 32, and emp-1 vs EMP-1 is no change.
    expect(importPayload(lines[0])).toEqual({ shirt_size: 'XL' })
  })

  it('a second upload of the same file changes nothing', () => {
    const rows = [
      ['Client', 'Name', 'Employee no', 'Shirt'],
      ['Maxtherm', 'Ali Hassan', 'EMP-1', 'L'],
    ]
    const lines = plan(rows, { existing: [saved()] })
    expect(importCounts(lines)).toEqual({ new: 0, update: 0, unchanged: 1, problem: 0 })
  })
})
