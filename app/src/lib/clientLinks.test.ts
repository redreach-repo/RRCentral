import { describe, expect, it } from 'vitest'
import { documentPath, groupSummary, matchCount, reviewGroups, suggestClients, tableLabel, type ClientLinkRow } from './clientLinks'

const row = (over: Partial<ClientLinkRow>): ClientLinkRow => ({
  kind: 'unmatched',
  table_name: 'quotations',
  row_id: Math.random().toString(36).slice(2),
  row_label: 'RR-01-26005',
  client_text: 'Sharjah ReadyMix Concrete',
  match: 'none',
  candidates: 0,
  client_id: null,
  client_name: null,
  doc_date: '2026-11-01',
  batch_id: null,
  ...over,
})

describe('client link review', () => {
  it('groups documents typed with the same client name, ambiguous first', () => {
    const rows = [
      row({ row_label: 'RR-01-26005' }),
      row({ row_label: 'RR-01-26006', client_text: 'Sharjah ReadyMix Concrete.' }),
      row({ row_label: 'RR-01-26007', client_text: 'sharjah readymix concrete' }),
      row({ kind: 'ambiguous', client_text: 'Bin Ghurair Trading', candidates: 2 }),
      row({ kind: 'match', client_text: 'Green Cement', client_id: 'c1' }),
    ]
    const groups = reviewGroups(rows)
    expect(groups.map((g) => g.clientText)).toEqual(['Bin Ghurair Trading', 'Sharjah ReadyMix Concrete'])
    expect(groups[1].rows).toHaveLength(3)
    expect(matchCount(rows)).toBe(1)
  })

  it('summarises a group by document type', () => {
    expect(groupSummary([row({}), row({}), row({ table_name: 'invoices' })])).toBe('2 quotes, 1 invoice')
    expect(tableLabel('crm', 2)).toBe('deals')
  })

  it('suggests the clients that look like the typed name', () => {
    const clients = [
      { id: 'a', company_name: 'Sharjah Ready Mix Concrete Company L.L.C SP' },
      { id: 'b', company_name: 'Sharjah Ready Mix' },
      { id: 'c', company_name: 'Green Cement' },
    ]
    const s = suggestClients('Sharjah ReadyMix Concrete', clients)
    expect(s.map((c) => c.id)).toContain('a')
    expect(s.map((c) => c.id)).not.toContain('c')
    expect(suggestClients('', clients)).toEqual([])
  })

  it('opens each document where it lives', () => {
    expect(documentPath({ table_name: 'quotations', row_id: 'x', row_label: 'RR-01-26005' })).toBe('/quotations?ref=RR-01-26005')
    expect(documentPath({ table_name: 'tickets', row_id: 't1', row_label: 'Ticket: help' })).toBe('/support/t1')
  })
})
