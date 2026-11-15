import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import {
  MY_DEALS_CSV_COLUMNS,
  resolveDealStage,
  resolvePipeline,
  takeMatchingDeal,
} from './myDealsCsv'
import type { DealRow } from './myDeals'

describe('MY_DEALS_CSV_COLUMNS', () => {
  it('requires pipeline and account', () => {
    const csv = [
      'pipeline,account,deal,stage,value,weighted,next_action,next_action_date,days_in_stage,owner,source,division,quote_ref',
      'crm,Acme Co,CRM lead,Quoted,1000,500,Call back,2026-11-20,3,Alex,,01,RR-1',
      ',,,,,,,,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of MY_DEALS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, MY_DEALS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].pipeline).toBe('crm')
    expect(ok[0].account).toBe('Acme Co')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})

describe('resolvePipeline / resolveDealStage', () => {
  it('accepts pipeline keys and labels', () => {
    expect(resolvePipeline('sales')).toBe('sales')
    expect(resolvePipeline('AI CRM sales')).toBe('sales')
    expect(resolvePipeline('CTRM Next')).toBe('ctrm')
    expect(resolvePipeline('nope')).toBeNull()
  })

  it('resolves stage values and labels', () => {
    expect(resolveDealStage('crm', 'Quoted')).toBe('Quoted')
    expect(resolveDealStage('sales', 'Quote sent')).toBe('quote_sent')
    expect(resolveDealStage('ctrm', 'Demo done')).toBe('demo_done')
    expect(resolveDealStage('sales', 'bogus')).toBeNull()
  })
})

describe('takeMatchingDeal', () => {
  const base = {
    id: '1',
    account_id: null,
    stage: 'Lead',
    stageLabel: 'Lead',
    column: 'new' as const,
    open: true,
    value: null,
    weighted: null,
    next_action: '',
    next_action_date: null,
    overdue: false,
    days_in_stage: 0,
    owner_user_id: null,
    owner_label: '',
    source: '',
    notes: '',
    quote_ref: '',
    division: '',
    link: '/',
  }

  it('matches by pipeline + account and prefers deal title', () => {
    const remaining: DealRow[] = [
      { ...base, key: 'crm:a', pipeline: 'crm', account: 'Acme', deal: 'CRM lead', id: 'a' },
      { ...base, key: 'crm:b', pipeline: 'crm', account: 'Acme', deal: 'RR-99', id: 'b' },
    ]
    const hit = takeMatchingDeal(remaining, 'crm', 'Acme', 'RR-99')
    expect(hit?.id).toBe('b')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('a')
  })
})
