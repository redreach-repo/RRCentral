import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIT_MODULES,
  emptyFitSheet,
  fitSheetMissing,
  fitSheetRows,
  fitSheetStageProblem,
  isFitSheetReady,
  parseSettingsList,
  parseUserCount,
  stageNeedsFitSheet,
} from './fitSheet'

const ready = { ...emptyFitSheet(), commodities: 'Diesel, jet fuel', focus: 'trading' as const, user_count: 12, current_system: 'Spreadsheets' }

describe('fit sheet readiness', () => {
  it('lists what is missing before a demo', () => {
    expect(fitSheetMissing(null)).toEqual(['what they trade', 'the focus', 'the number of users', 'the current system'])
    expect(fitSheetMissing({ ...ready, user_count: 0 })).toEqual([])
    expect(fitSheetMissing({ ...ready, current_system: '  ' })).toEqual(['the current system'])
    expect(isFitSheetReady(ready)).toBe(true)
  })
  it('only asks for it when a deal moves from before Demo done to Demo done or later', () => {
    expect(stageNeedsFitSheet('intro_call_booked', 'demo_done')).toBe(true)
    expect(stageNeedsFitSheet('contacted', 'signed')).toBe(true)
    expect(stageNeedsFitSheet('', 'evaluating')).toBe(true)
    expect(stageNeedsFitSheet('', 'identified')).toBe(false)
    expect(stageNeedsFitSheet('identified', 'contacted')).toBe(false)
    expect(stageNeedsFitSheet('demo_done', 'evaluating')).toBe(false)
    expect(stageNeedsFitSheet('contacted', 'lost')).toBe(false)
    expect(fitSheetStageProblem(['the focus'])).toBe('Fill in the fit sheet before the demo: the focus.')
  })
})

describe('fit sheet helpers', () => {
  it('reads a settings list, falling back when empty', () => {
    expect(parseSettingsList(' Risk \n\nRisk\nCredit ', [])).toEqual(['Risk', 'Credit'])
    expect(parseSettingsList('', DEFAULT_FIT_MODULES)).toBe(DEFAULT_FIT_MODULES)
  })
  it('reads the users box', () => {
    expect(parseUserCount('')).toBeNull()
    expect(parseUserCount(' 25 ')).toBe(25)
    expect(parseUserCount('abc')).toBeNull()
  })
  it('builds the PDF rows with no commission and fills blanks', () => {
    const rows = fitSheetRows({ ...ready, modules: ['Risk and exposure', 'Credit'] }, 'Sam, CFO')
    expect(rows.map((r) => r.label)).toEqual([
      'Commodities and products',
      'Focus',
      'Number of users',
      'Current system',
      'Decision maker',
      'Modules of interest',
      'Notes',
    ])
    expect(rows[1].value).toBe('Trading')
    expect(rows[5].value).toBe('Risk and exposure, Credit')
    expect(rows[6].value).toBe('Not recorded')
    expect(JSON.stringify(rows)).not.toMatch(/commission|AED|price|fee/i)
  })
})
