import { describe, expect, it } from 'vitest'
import { clauseMarker } from './clauseCompose'
import { defaultObligationsOnSign, obligationsFromClauseKeys } from './obligationSpawn'

describe('defaultObligationsOnSign', () => {
  it('spawns NDA counterparty duties', () => {
    const rows = defaultObligationsOnSign({
      company_name: 'Sample Client LLC',
      crm_id: 'crm-1',
      legal_document_id: 'doc-1',
      doc_type: 'nda',
      signed_at: '2026-11-13T12:00:00.000Z',
    })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'open')).toBe(true)
    expect(rows.every((r) => r.legal_document_id === 'doc-1')).toBe(true)
    expect(rows[0].owner_party).toBe('counterparty')
  })

  it('spawns a service-agreement kickoff with a due date', () => {
    const rows = defaultObligationsOnSign({
      company_name: 'Sample Client LLC',
      crm_id: '',
      legal_document_id: 'doc-2',
      doc_type: 'service_agreement',
      signed_at: '2026-11-13T12:00:00.000Z',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].due_date).toBe('2026-11-27')
    expect(rows[0].owner_party).toBe('both')
  })

  it('adds clause-tag duties from template markers', () => {
    const body = `
${clauseMarker('term_survive')}
## Term and survival
Survives disclosure.
`
    const rows = defaultObligationsOnSign({
      company_name: 'Acme',
      crm_id: 'c1',
      legal_document_id: 'doc-3',
      doc_type: 'nda',
      signed_at: '2026-11-13T12:00:00.000Z',
      template_body: body,
    })
    expect(rows.some((r) => r.title === 'Diary confidentiality survival end')).toBe(true)
    expect(rows.some((r) => r.title === 'Protect Confidential Information')).toBe(true)
    expect(rows.find((r) => r.title.includes('Diary'))?.due_date).toBe('2026-12-13')
  })
})

describe('obligationsFromClauseKeys', () => {
  it('maps known keys and ignores unknown', () => {
    const rows = obligationsFromClauseKeys(['recipient_obligations', 'nope', 'recipient_obligations'], {
      company_name: 'Acme',
      crm_id: '',
      legal_document_id: 'd',
      doc_type: 'nda',
      signed_at: '2026-11-13T12:00:00.000Z',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].owner_party).toBe('red_reach')
    expect(rows[0].due_date).toBe('2026-11-20')
  })
})
