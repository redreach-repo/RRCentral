import { describe, expect, it } from 'vitest'
import { filterOpenObligations } from './obligationBoardStore'
import type { ContractObligation } from './types'

function row(partial: Partial<ContractObligation> & Pick<ContractObligation, 'id' | 'status'>): ContractObligation {
  return {
    company_name: 'Acme',
    crm_id: '',
    legal_document_id: null,
    title: 'Duty',
    description: '',
    owner_party: 'red_reach',
    due_date: null,
    completed_at: null,
    created_by: 'test',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('filterOpenObligations', () => {
  it('keeps only open rows', () => {
    const open = filterOpenObligations([
      row({ id: '1', status: 'open' }),
      row({ id: '2', status: 'done' }),
      row({ id: '3', status: 'cancelled' }),
    ])
    expect(open.map((r) => r.id)).toEqual(['1'])
  })
})
