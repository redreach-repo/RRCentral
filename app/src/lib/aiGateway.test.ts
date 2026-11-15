import { describe, expect, it } from 'vitest'
import { rankHits, stubAnswerFromHits, type AiKnowledgeHit } from './aiGateway'

const hits: AiKnowledgeHit[] = [
  { id: '1', title: 'VAT', body: 'UAE VAT is 5%.', source: 'manual', rank: 0.2 },
  { id: '2', title: 'WPS', body: 'WPS is draft only.', source: 'manual', rank: 0.9 },
]

describe('aiGateway', () => {
  it('ranks hits descending', () => {
    expect(rankHits(hits).map((h) => h.id)).toEqual(['2', '1'])
  })

  it('builds a stub answer from hits', () => {
    const a = stubAnswerFromHits('payroll', hits)
    expect(a).toContain('WPS')
    expect(a).toContain('draft')
    expect(stubAnswerFromHits('x', [])).toMatch(/No knowledge/)
  })
})
