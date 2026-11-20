import { describe, expect, it } from 'vitest'
import {
  auditArgs,
  bearerToken,
  clampPage,
  companySearchWord,
  defaultStages,
  invoiceDaysOverdue,
  isMcpKeyShape,
  MCP_KEY_ROLES,
  MCP_TOOLS,
  normalizeCompany,
  pageFrom,
  pageOf,
  sameCompany,
  stageMoveProblem,
  stagesFor,
  ticketReplyAlert,
  toolNameProblem,
  likeText,
} from './highmastMcp'

describe('MCP tool list', () => {
  it('has the 14 tools from the spec and nothing else', () => {
    expect([...MCP_TOOLS].sort()).toEqual(
      [
        'search_accounts', 'get_account', 'list_deals', 'get_deal', 'list_follow_ups_due', 'list_tickets',
        'get_ticket', 'list_quotes', 'list_invoices', 'dashboard_summary', 'create_lead', 'add_timeline_note',
        'move_deal_stage', 'create_follow_up',
      ].sort(),
    )
  })

  it('has no delete, HR, payroll, secrets, settings, users or payment tools', () => {
    for (const name of MCP_TOOLS) expect(toolNameProblem(name), name).toBeNull()
  })

  it('would catch a risky tool', () => {
    for (const bad of ['delete_deal', 'list_hr_people', 'get_payroll', 'read_settings', 'list_users', 'reveal_iban', 'get_passport', 'mark_invoice_paid', 'record_payment']) {
      expect(toolNameProblem(bad), bad).not.toBeNull()
    }
  })

  it('keys act only as sales, staff or viewer', () => {
    expect([...MCP_KEY_ROLES]).toEqual(['sales', 'staff', 'viewer'])
  })
})

describe('keys', () => {
  it('reads a bearer token', () => {
    expect(bearerToken('Bearer abc')).toBe('abc')
    expect(bearerToken('bearer   abc ')).toBe('abc')
    expect(bearerToken('Basic abc')).toBe('')
    expect(bearerToken(null)).toBe('')
  })

  it('checks the key shape', () => {
    expect(isMcpKeyShape('hmk_' + 'a'.repeat(43))).toBe(true)
    expect(isMcpKeyShape('hm_' + 'a'.repeat(43))).toBe(false)
    expect(isMcpKeyShape('hmk_short')).toBe(false)
  })
})

describe('paging', () => {
  it('caps the limit at 50', () => {
    expect(clampPage(500, 0)).toEqual({ limit: 50, offset: 0 })
    expect(clampPage(undefined, undefined)).toEqual({ limit: 20, offset: 0 })
    expect(clampPage(-3, -1)).toEqual({ limit: 20, offset: 0 })
    expect(clampPage(10, 30)).toEqual({ limit: 10, offset: 30 })
  })

  it('says when there is more', () => {
    expect(pageFrom([1, 2, 3], 2, 0)).toEqual({ items: [1, 2], limit: 2, offset: 0, has_more: true, next_offset: 2 })
    expect(pageFrom([1, 2], 2, 4)).toEqual({ items: [1, 2], limit: 2, offset: 4, has_more: false, next_offset: null })
    expect(pageOf([1, 2, 3, 4, 5], 2, 2).items).toEqual([3, 4])
  })

  it('cleans search text', () => {
    expect(likeText('50%_off, (now)')).toBe('50 off now')
  })
})

describe('stage moves', () => {
  const crm = defaultStages('company')
  const sales = defaultStages('ai_crm')
  const ctrm = defaultStages('ctrm_next')

  it('moves forward', () => {
    expect(stageMoveProblem(crm, 'Lead', 'Quoted')).toBeNull()
    expect(stageMoveProblem(sales, 'lead', 'discovery_call')).toBeNull()
    expect(stageMoveProblem(ctrm, 'contacted', 'decision_pending')).toBeNull()
  })

  it('never backwards or sideways', () => {
    expect(stageMoveProblem(crm, 'Quoted', 'Lead')).toMatch(/forward/)
    expect(stageMoveProblem(crm, 'Quoted', 'Quoted')).toMatch(/forward/)
    expect(stageMoveProblem(ctrm, 'evaluating', 'contacted')).toMatch(/forward/)
  })

  it('never to won, lost or signed', () => {
    expect(stageMoveProblem(crm, 'Negotiation', 'Won')).toMatch(/not allowed/)
    expect(stageMoveProblem(crm, 'Lead', 'lost')).toMatch(/not allowed/)
    expect(stageMoveProblem(sales, 'quote_sent', 'signed')).toMatch(/not allowed/)
    expect(stageMoveProblem(ctrm, 'evaluating', 'lost')).toMatch(/not allowed/)
  })

  it('never reopens a closed deal', () => {
    expect(stageMoveProblem(crm, 'Lost', 'Contacted')).toMatch(/closed/)
  })

  it('refuses unknown stages', () => {
    expect(stageMoveProblem(sales, 'lead', 'proposal')).toMatch(/Unknown stage/)
  })

  it('uses the stages from the database for the company CRM, won/lost by outcome', () => {
    const custom = stagesFor('company', [
      { stage_key: 'Lead', outcome: 'open' },
      { stage_key: 'Demo', outcome: 'open' },
      { stage_key: 'Closed', outcome: 'won' },
      { stage_key: 'Old', outcome: 'open', active: false },
    ])
    expect(custom.map((s) => s.key)).toEqual(['Lead', 'Demo', 'Closed'])
    expect(stageMoveProblem(custom, 'Lead', 'Demo')).toBeNull()
    expect(stageMoveProblem(custom, 'Demo', 'Closed')).toMatch(/not allowed/)
    expect(stageMoveProblem(custom, 'Demo', 'Old')).toMatch(/Unknown/)
  })

  it('keeps only keys the deal tables accept for AI CRM and CTRM', () => {
    expect(stagesFor('ai_crm', [{ stage_key: 'made_up' }]).map((s) => s.key)).toEqual(sales.map((s) => s.key))
  })
})

describe('company matching', () => {
  it('ignores case, punctuation and LLC style endings', () => {
    expect(normalizeCompany('Mass Allied Freighters L.L.C')).toBe('mass allied freighters')
    expect(sameCompany('Acme Trading LLC', 'ACME FZE')).toBe(true)
    expect(sameCompany('Acme', 'Acme Steel')).toBe(false)
    expect(sameCompany('', '')).toBe(false)
  })

  it('narrows the search to the longest word', () => {
    expect(companySearchWord('Mass Allied Freighters LLC')).toBe('freighters')
  })
})

describe('dashboard rules', () => {
  const today = new Date('2026-11-20T10:00:00Z')

  it('an invoice is overdue after its payment terms, unless paid, draft or cancelled', () => {
    expect(invoiceDaysOverdue({ date: '2026-10-01', payment_terms: 'Net 30 days', status: 'Sent', payment_status: 'Pending' }, today)).toBe(20)
    expect(invoiceDaysOverdue({ date: '2026-11-10', payment_terms: 'Net 30 days', status: 'Sent', payment_status: 'Pending' }, today)).toBeNull()
    expect(invoiceDaysOverdue({ date: '2026-10-01', payment_terms: 'Net 30 days', status: 'Sent', payment_status: 'Paid' }, today)).toBeNull()
    expect(invoiceDaysOverdue({ date: '2026-10-01', payment_terms: 'Net 30 days', status: 'Draft', payment_status: 'Pending' }, today)).toBeNull()
    expect(invoiceDaysOverdue({ date: '2026-10-01', payment_terms: 'Net 30 days', status: 'Cancelled', payment_status: 'Pending' }, today)).toBeNull()
  })

  it('flags tickets near or past their first reply target', () => {
    const base = { status: 'open', created_at: '2026-11-19T10:00:00Z', first_response_at: null }
    expect(ticketReplyAlert({ ...base, sla_due_at: '2026-11-20T09:00:00Z' }, today)).toBe('breached')
    expect(ticketReplyAlert({ ...base, sla_due_at: '2026-11-20T11:00:00Z' }, today)).toBe('warning')
    expect(ticketReplyAlert({ ...base, sla_due_at: '2026-11-25T11:00:00Z' }, today)).toBeNull()
    expect(ticketReplyAlert({ ...base, status: 'resolved', sla_due_at: '2026-11-20T09:00:00Z' }, today)).toBeNull()
  })
})

describe('audit', () => {
  it('keeps short arguments and cuts long text', () => {
    const out = auditArgs({ a: 'x'.repeat(300), b: 2, c: { nested: true } })
    expect(String(out.a).length).toBe(201)
    expect(out.b).toBe(2)
    expect(out.c).toBe('[object]')
  })
})
