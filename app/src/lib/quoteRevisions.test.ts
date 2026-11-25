import { describe, expect, it } from 'vitest'
import {
  accountCandidates,
  addDaysIso,
  dealCandidates,
  defaultRevisionValidUntil,
  isDraftRevision,
  linkedDeal,
  nextRevisionNumber,
  quoteBaseReference,
  quoteChain,
  quoteNoteKindLabel,
  quoteNoteProblem,
  reviseProblem,
  revisionInputProblem,
  revisionMeta,
  revisionReference,
  sameCompanyName,
  sortQuoteNotes,
} from './quoteRevisions'
import { formatRevisionReference, parseBaseReference } from './referenceNumber'

// Green Cement, from the brief: RR-01-26008, Sent, valid until 25 Nov 2026.
const green = {
  id: 'q8',
  status: 'Sent',
  reference_number: 'RR-01-26008',
  base_reference: 'RR-01-26008',
  revision: 0,
  valid_until: '2026-11-25',
  revised_from: null as string | null,
}

describe('revision numbers', () => {
  it('shows a revision as RR-01-26008-R1', () => {
    expect(revisionReference('RR-01-26008', 1)).toBe('RR-01-26008-R1')
    expect(revisionReference('RR-01-26008', 0)).toBe('RR-01-26008')
    expect(formatRevisionReference('RR-01-26008', 2)).toBe('RR-01-26008-R2')
  })

  it('finds the base number from new and old style numbers', () => {
    expect(quoteBaseReference({ base_reference: '', reference_number: 'RR-01-26008-R3' })).toBe('RR-01-26008')
    expect(quoteBaseReference({ base_reference: '', reference_number: 'RR-01-26004_revision 1' })).toBe('RR-01-26004')
    expect(quoteBaseReference({ base_reference: 'RR-01-26008', reference_number: 'RR-01-26008-R1' })).toBe('RR-01-26008')
    expect(parseBaseReference('RR-01-26008-R1')).toBe('RR-01-26008')
    expect(parseBaseReference('RR-01-26004_revision 2')).toBe('RR-01-26004')
    expect(parseBaseReference('RR-01-26008')).toBe('RR-01-26008')
  })

  it('numbers the next revision after the highest in the chain', () => {
    const r1 = { ...green, id: 'r1', reference_number: 'RR-01-26008-R1', revision: 1, status: 'Superseded', revised_from: 'q8' }
    const r2 = { ...green, id: 'r2', reference_number: 'RR-01-26008-R2', revision: 2, status: 'Sent', revised_from: 'r1' }
    expect(nextRevisionNumber(green, [green])).toBe(1)
    expect(nextRevisionNumber(r2, [green, r1, r2])).toBe(3)
  })
})

describe('new valid-until date', () => {
  it('defaults to the old date + 14 days: RR-01-26008 goes to 9 Dec 2026', () => {
    expect(defaultRevisionValidUntil('2026-11-25', '2026-11-25')).toBe('2026-12-09')
  })

  it('is never less than 14 days from today for a long-expired quote', () => {
    expect(defaultRevisionValidUntil('2026-09-01', '2026-11-25')).toBe('2026-12-09')
    expect(defaultRevisionValidUntil(null, '2026-11-25')).toBe('2026-12-09')
  })

  it('adds days across month ends', () => {
    expect(addDaysIso('2026-12-25', 14)).toBe('2027-01-08')
  })
})

describe('who can be revised', () => {
  it('Finalized, Sent and Expired quotes can be revised', () => {
    for (const status of ['Finalized', 'Sent', 'Expired']) expect(reviseProblem({ ...green, status }), status).toBeNull()
  })

  it('Draft, Superseded, Accepted, Awarded and archived quotes cannot', () => {
    expect(reviseProblem({ ...green, status: 'Draft' })).toMatch(/Drafts/)
    expect(reviseProblem({ ...green, status: 'Superseded' })).toMatch(/newer revision/)
    expect(reviseProblem({ ...green, status: 'Accepted' })).toMatch(/Accepted/)
    expect(reviseProblem({ ...green, status: 'Awarded' })).toMatch(/Awarded/)
    expect(reviseProblem({ ...green, deleted_at: '2026-11-20T00:00:00Z' })).toMatch(/archived/)
    expect(reviseProblem({ ...green, reference_number: '', base_reference: '' })).toMatch(/Finalize/)
  })

  it('only one open revision per base number', () => {
    const draft = { ...green, id: 'r1', status: 'Draft', reference_number: 'RR-01-26008-R1', revision: 1, revised_from: 'q8' }
    expect(reviseProblem(green, [green, draft])).toMatch(/RR-01-26008-R1 is already open/)
    expect(isDraftRevision(draft)).toBe(true)
    expect(isDraftRevision(green)).toBe(false)
  })

  it('an older quote cannot be revised once a newer revision is live', () => {
    const r1 = { ...green, id: 'r1', status: 'Sent', reference_number: 'RR-01-26008-R1', revision: 1, revised_from: 'q8' }
    expect(reviseProblem({ ...green, status: 'Expired' }, [green, r1])).toMatch(/newer revision, RR-01-26008-R1/)
  })

  it('a chain is every quote with the same base number, oldest first', () => {
    const r1 = { ...green, id: 'r1', reference_number: 'RR-01-26008-R1', revision: 1 }
    const other = { ...green, id: 'x', reference_number: 'RR-01-26009', base_reference: 'RR-01-26009' }
    expect(quoteChain([r1, other, green], r1).map((q) => q.id)).toEqual(['q8', 'r1'])
  })

  it('list line says what replaced what', () => {
    const old = { ...green, status: 'Superseded' }
    const r1 = { ...green, id: 'r1', status: 'Sent', reference_number: 'RR-01-26008-R1', revision: 1, revised_from: 'q8' }
    expect(revisionMeta(old, [old, r1])).toBe('Replaced by RR-01-26008-R1')
    expect(revisionMeta(r1, [old, r1])).toBe('Revision 1 of RR-01-26008')
    expect(revisionMeta(green, [green])).toBe('')
  })
})

describe('the Revise / Extend form', () => {
  const today = '2026-11-25'
  it('accepts the Green Cement extension to 9 Dec with a meeting note', () => {
    expect(
      revisionInputProblem({ validUntil: '2026-12-09', reason: 'Meeting with Green Cement on 25 Nov', extend: true }, green, today),
    ).toBeNull()
  })

  it('extending needs a reason and a later date', () => {
    expect(revisionInputProblem({ validUntil: '2026-12-09', reason: ' ', extend: true }, green, today)).toMatch(/why/)
    expect(revisionInputProblem({ validUntil: '2026-11-25', reason: 'x', extend: true }, green, today)).toMatch(/after the current/)
  })

  it('no date in the past; reason optional for a revision', () => {
    expect(revisionInputProblem({ validUntil: '2026-11-24', reason: '', extend: false }, green, today)).toMatch(/past/)
    expect(revisionInputProblem({ validUntil: '', reason: '', extend: false }, green, today)).toMatch(/Pick/)
    expect(revisionInputProblem({ validUntil: '2026-11-25', reason: '', extend: false }, green, today)).toBeNull()
    expect(revisionInputProblem({ validUntil: '2026-12-09', reason: 'x'.repeat(1001), extend: false }, green, today)).toMatch(/1,000/)
  })
})

describe('quote notes', () => {
  it('needs text, at most 4,000 characters', () => {
    expect(quoteNoteProblem('  ')).toMatch(/Write/)
    expect(quoteNoteProblem('x'.repeat(4001))).toMatch(/4,000/)
    expect(quoteNoteProblem('Met the buyer')).toBeNull()
  })

  it('shows newest first with plain labels', () => {
    const sorted = sortQuoteNotes([
      { created_at: '2026-11-20T10:00:00Z' },
      { created_at: '2026-11-25T09:00:00Z' },
      { created_at: '2026-11-22T09:00:00Z' },
    ])
    expect(sorted.map((n) => n.created_at.slice(0, 10))).toEqual(['2026-11-25', '2026-11-22', '2026-11-20'])
    expect(quoteNoteKindLabel('extended')).toBe('Validity extended')
    expect(quoteNoteKindLabel('anything')).toBe('Note')
  })
})

describe('linking a quote to a deal or account', () => {
  const deals = [
    { id: 'd1', company_name: 'Green Cement Factory LLC', quote_ref: '', email_phone: '', account_id: null },
    { id: 'd2', company_name: 'Sharjah Ready Mix', quote_ref: 'RR-01-26007', email_phone: 'purchase@sharjahreadymix.ae', account_id: 'a7' },
    { id: 'd3', company_name: 'Oryx Mix Concrete', quote_ref: '', email_phone: '', account_id: null },
  ]

  it('finds the deal that carries a number of the chain', () => {
    expect(linkedDeal(deals, ['RR-01-26007'])?.id).toBe('d2')
    expect(linkedDeal(deals, ['RR-01-26008', 'RR-01-26008-R1'])).toBeNull()
  })

  it('matches by name without legal suffixes, or by contact email', () => {
    expect(sameCompanyName('Green Cement', 'Green Cement Factory LLC')).toBe(true)
    expect(sameCompanyName('Sharjah ReadyMix Concrete', 'Oryx Mix Concrete')).toBe(false)
    expect(dealCandidates(deals, { client: 'Green Cement' }).map((d) => d.id)).toEqual(['d1'])
    expect(
      dealCandidates(deals, { client: 'Sharjah ReadyMix Concrete', contact_email: 'purchase@sharjahreadymix.ae' }).map((d) => d.id),
    ).toEqual(['d2'])
    expect(dealCandidates(deals, { client: 'Nobody Trading' })).toEqual([])
  })

  it('matches accounts by name or a contact email', () => {
    const accounts = [
      { id: 'a7', name: 'Sharjah Ready Mix', reference: 'AC-07-26001', emails: ['techhead@sharjahreadymix.ae'] },
      { id: 'a9', name: 'Green Cement', reference: 'AC-01-26009', emails: [] },
    ]
    expect(accountCandidates(accounts, { client: 'Green Cement' }).map((a) => a.id)).toEqual(['a9'])
    expect(accountCandidates(accounts, { client: 'SRM', contact_email: 'techhead@sharjahreadymix.ae' }).map((a) => a.id)).toEqual(['a7'])
  })
})
