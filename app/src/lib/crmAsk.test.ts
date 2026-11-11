import { describe, expect, it } from 'vitest'
import { buildAiRequest, normaliseAiInput } from './aiAssist'
import { buildCrmAskFacts } from './crmAsk'
import type { CrmEntry } from './types'

const entry = (partial: Partial<CrmEntry>): CrmEntry =>
  ({
    id: partial.id || crypto.randomUUID(),
    company_name: 'Acme',
    pipeline_stage: 'Lead',
    owner: '',
    follow_up_date: null,
    next_action: '',
    notes: '',
    quote_ref: '',
    ...partial,
  }) as CrmEntry

describe('buildCrmAskFacts', () => {
  it('summarises overdue and stages from open deals', () => {
    const today = new Date('2026-11-11T08:00:00Z')
    const facts = buildCrmAskFacts(
      [
        entry({
          id: '1',
          company_name: 'Mass Allied',
          pipeline_stage: 'Quoted',
          owner: 'Alfred',
          follow_up_date: '2026-11-01',
          next_action: 'WhatsApp',
          quote_ref: 'RR-01-1',
        }),
        entry({ id: '2', company_name: 'Closed Co', pipeline_stage: 'Won' }),
        entry({ id: '3', company_name: 'Fresh Lead', pipeline_stage: 'Lead', owner: 'Alfred' }),
      ],
      { myOwnerName: 'Alfred', today },
    )
    expect(facts.some((f) => f.includes('Open deals: 2'))).toBe(true)
    expect(facts.some((f) => f.includes('1 overdue'))).toBe(true)
    expect(facts.some((f) => f.includes('Mass Allied') && f.includes('Quoted'))).toBe(true)
    expect(facts.some((f) => f.includes('Closed Co'))).toBe(false)
  })
})

describe('crm_ask AI request', () => {
  it('normalises and builds a prompt that can propose draft quotes', () => {
    const input = normaliseAiInput({
      feature: 'crm_ask',
      askerName: 'Alfred',
      question: "What's overdue?",
      facts: ['Open deals: 2', 'Mass Allied · overdue'],
    })
    expect(input).toEqual({
      feature: 'crm_ask',
      askerName: 'Alfred',
      question: "What's overdue?",
      facts: ['Open deals: 2', 'Mass Allied · overdue'],
    })
    if (!input || input.feature !== 'crm_ask') return
    const req = buildAiRequest(input)
    expect(req.system).toMatch(/quote_draft/)
    expect(req.system).toMatch(/must confirm/i)
    expect(req.schema).not.toBeNull()
    expect(req.user).toContain("What's overdue?")
    expect(req.user).toContain('Mass Allied')
  })

  it('rejects empty questions', () => {
    expect(normaliseAiInput({ feature: 'crm_ask', question: '  ', facts: ['x'] })).toBeNull()
    expect(normaliseAiInput({ feature: 'crm_ask', question: 'Hi', facts: [] })).toBeNull()
  })
})
