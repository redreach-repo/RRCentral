import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { PLANNING_GOALS_CSV_COLUMNS, PLANNING_SCENARIOS_CSV_COLUMNS } from './planningCsv'

describe('PLANNING_GOALS_CSV_COLUMNS', () => {
  it('requires name and target_value', () => {
    const csv = [
      'name,metric_key,target_value,period_yyyy_mm',
      'Q4 revenue,revenue_aed,100000,2026-11',
      ',,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of PLANNING_GOALS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, PLANNING_GOALS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Q4 revenue')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})

describe('PLANNING_SCENARIOS_CSV_COLUMNS', () => {
  it('requires name', () => {
    const csv = ['name,description,assumptions_json', 'Upside,Optimistic,{"revenue_uplift_pct":10}', ',,'].join(
      '\n',
    )
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of PLANNING_SCENARIOS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, PLANNING_SCENARIOS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Upside')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
