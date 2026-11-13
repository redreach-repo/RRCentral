import { describe, expect, it } from 'vitest'
import { defaultObligationsOnSign } from './obligationSpawn'

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
})
