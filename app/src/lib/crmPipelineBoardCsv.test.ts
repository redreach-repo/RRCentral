import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import {
  CRM_PIPELINE_BOARD_CSV_COLUMNS,
  buildCrmBoardCsvPatch,
  isTerminalCrmBoardStage,
  resolveCrmBoardStage,
  takeMatchingCrmEntry,
} from './crmPipelineBoardCsv'
import type { CrmEntry } from './types'

describe('CRM_PIPELINE_BOARD_CSV_COLUMNS', () => {
  it('requires company_name and accepts export headers', () => {
    const csv = [
      'company_name,pipeline_stage,owner,follow_up_date,next_action,contact,phone,email,quote_ref,follow_up_bucket',
      'Acme Co,Quoted,Alex,2026-11-20,Call back,Sam,+971500000000,sam@acme.test,RR-1,Upcoming',
      ',,,,,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of CRM_PIPELINE_BOARD_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, CRM_PIPELINE_BOARD_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].company_name).toBe('Acme Co')
    expect(ok[0].pipeline_stage).toBe('Quoted')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})

describe('resolveCrmBoardStage / isTerminalCrmBoardStage', () => {
  const stages = ['Lead', 'Contacted', 'Quoted', 'Negotiation', 'Won', 'Lost'] as const

  it('resolves stage values case-insensitively', () => {
    expect(resolveCrmBoardStage('Quoted', stages)).toBe('Quoted')
    expect(resolveCrmBoardStage('quoted', stages)).toBe('Quoted')
    expect(resolveCrmBoardStage('bogus', stages)).toBeNull()
  })

  it('flags Won/Lost as terminal', () => {
    expect(isTerminalCrmBoardStage('Won')).toBe(true)
    expect(isTerminalCrmBoardStage('Lost')).toBe(true)
    expect(isTerminalCrmBoardStage('Quoted')).toBe(false)
  })
})

describe('takeMatchingCrmEntry', () => {
  const base = {
    owner: '',
    pipeline_stage: 'Lead',
    next_action: '',
    follow_up_date: null,
    primary_contact: '',
    email_phone: '',
    mobile_number: '',
    office_number: '',
    company_owner: '',
    address: '',
    website: '',
    trn: '',
    notes: '',
    outcome_reason: '',
    calendar_event_id: '',
    account_id: null,
  } as unknown as CrmEntry

  it('matches by company and prefers quote_ref', () => {
    const remaining: CrmEntry[] = [
      { ...base, id: 'a', company_name: 'Acme', quote_ref: 'RR-1' },
      { ...base, id: 'b', company_name: 'Acme', quote_ref: 'RR-99' },
    ]
    const hit = takeMatchingCrmEntry(remaining, 'Acme', 'RR-99')
    expect(hit?.id).toBe('b')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('a')
  })
})

describe('buildCrmBoardCsvPatch', () => {
  const entry = {
    id: '1',
    company_name: 'Acme',
    owner: 'Alex',
    follow_up_date: '2026-11-20',
    next_action: 'Call',
    quote_ref: 'RR-1',
  } as CrmEntry

  it('keeps blanks and returns changed fields only', () => {
    expect(buildCrmBoardCsvPatch({ next_action: 'Email' }, entry)).toEqual({ next_action: 'Email' })
    expect(buildCrmBoardCsvPatch({ owner: 'Alex', next_action: '' }, entry)).toEqual({})
    expect(buildCrmBoardCsvPatch({ follow_up_date: 'not-a-date' }, entry)).toBeNull()
  })
})
