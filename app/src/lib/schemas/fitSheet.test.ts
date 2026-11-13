import { describe, expect, it } from 'vitest'
import { parseFitSheetForm } from './fitSheet'

describe('parseFitSheetForm', () => {
  it('rejects a non-numeric users box', () => {
    const r = parseFitSheetForm({
      commodities: 'Crude',
      focus: 'trading',
      users: 'many',
      current_system: 'Sheets',
      decision_maker_id: null,
      modules: [],
      notes: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/users/i)
  })

  it('accepts a partial draft (demo completeness is separate)', () => {
    const r = parseFitSheetForm({
      commodities: '  Diesel  ',
      focus: '',
      users: '',
      current_system: '',
      decision_maker_id: null,
      modules: ['Trade capture'],
      notes: '  ',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.commodities).toBe('Diesel')
      expect(r.data.user_count).toBeNull()
      expect(r.data.notes).toBe('')
    }
  })

  it('parses user count', () => {
    const r = parseFitSheetForm({
      commodities: 'Bitumen',
      focus: 'both',
      users: '12',
      current_system: 'Spreadsheets',
      decision_maker_id: 'c1',
      modules: ['Risk and exposure'],
      notes: 'Ready',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.user_count).toBe(12)
  })
})
