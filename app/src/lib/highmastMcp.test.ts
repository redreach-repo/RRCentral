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
  MCP_ADMIN_TOOLS,
  adminToolNameProblem,
  normalizeCompany,
  pageFrom,
  pageOf,
  sameCompany,
  stageMoveProblem,
  stagesFor,
  ticketReplyAlert,
  toolNameProblem,
  likeText,
  toolAllowedForDepartments,
} from './highmastMcp'

describe('MCP tool list', () => {
  it('has the 14 tools from the spec plus the chase tools and add_quote_note, and nothing else', () => {
    expect([...MCP_TOOLS].sort()).toEqual(
      [
        'search_accounts', 'get_account', 'list_deals', 'get_deal', 'list_follow_ups_due', 'list_tickets',
        'get_ticket', 'list_quotes', 'list_invoices', 'dashboard_summary', 'create_lead', 'add_timeline_note',
        'move_deal_stage', 'create_follow_up',
        // Overdue invoice chasing (fix 1)
        'list_invoice_aging', 'add_invoice_chase_note', 'complete_invoice_chase_task',
        // Revise and extend sent quotes (fix 2)
        'add_quote_note',
        // Quote follow-up chasing
        'list_quote_followups', 'add_quote_chase_note', 'complete_quote_chase_task',
      ].sort(),
    )
  })

  it('offers the chase tools to finance and sales keys only', () => {
    for (const t of [
      'list_invoice_aging', 'add_invoice_chase_note', 'complete_invoice_chase_task',
      'list_quote_followups', 'add_quote_chase_note', 'complete_quote_chase_task',
    ]) {
      expect(toolAllowedForDepartments(t, ['finance']), t).toBe(true)
      expect(toolAllowedForDepartments(t, ['sales']), t).toBe(true)
      expect(toolAllowedForDepartments(t, ['hr', 'payroll', 'support']), t).toBe(false)
    }
  })

  it('offers quote notes to whoever reads quotes, and revise / extend to sales admin keys only', () => {
    expect(toolAllowedForDepartments('add_quote_note', ['finance'])).toBe(true)
    expect(toolAllowedForDepartments('add_quote_note', ['sales'])).toBe(true)
    expect(toolAllowedForDepartments('add_quote_note', ['hr', 'support'])).toBe(false)
    for (const t of ['revise_quote', 'extend_quote_validity']) {
      expect(MCP_ADMIN_TOOLS as readonly string[], t).toContain(t)
      expect(MCP_TOOLS as readonly string[], t).not.toContain(t)
      expect(toolAllowedForDepartments(t, ['sales']), t).toBe(true)
      expect(toolAllowedForDepartments(t, ['finance', 'hr']), t).toBe(false)
      expect(adminToolNameProblem(t), t).toBeNull()
    }
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

describe('admin scope rules', () => {
  it('admin tools are separate from the standard ones and none approves, pays out or touches secrets', async () => {
    const { MCP_ADMIN_TOOLS, adminToolNameProblem } = await import('./highmastMcp')
    for (const t of MCP_ADMIN_TOOLS) {
      expect(adminToolNameProblem(t)).toBeNull()
      expect((MCP_TOOLS as readonly string[]).includes(t)).toBe(false)
    }
    expect(new Set(MCP_ADMIN_TOOLS).size).toBe(MCP_ADMIN_TOOLS.length)
    expect(adminToolNameProblem('approve_payroll_run')).toMatch(/approve/)
    expect(adminToolNameProblem('update_settings')).toMatch(/settings/)
    // Standard keys still never get admin roles.
    expect(MCP_KEY_ROLES).not.toContain('admin')
  })

  it('works out VAT like the app: 5% by default, rounded to fils', async () => {
    const { expenseAmounts, vatRateFromPercent } = await import('./highmastMcp')
    expect(vatRateFromPercent(undefined)).toBe(0.05)
    expect(vatRateFromPercent(0)).toBe(0)
    expect(() => vatRateFromPercent(101)).toThrow()
    expect(expenseAmounts(200)).toEqual({ amount_ex_vat: 200, vat_amount: 10, amount: 210 })
    expect(expenseAmounts(33.335)).toEqual({ amount_ex_vat: 33.34, vat_amount: 1.67, amount: 35.01 })
    expect(expenseAmounts(100, 0)).toEqual({ amount_ex_vat: 100, vat_amount: 0, amount: 100 })
  })

  it('maps division codes to the brand the app stores', async () => {
    const { divisionVertical } = await import('./highmastMcp')
    expect(divisionVertical('01')).toBe('RR Threads')
    expect(divisionVertical('2')).toBe('RR Wanders')
    expect(divisionVertical(null)).toBe('RR Threads')
  })

  it('never writes salary, IBAN or ID numbers into the call log', () => {
    expect(auditArgs({ iban: 'AE07', basic_salary_aed: 9000, job_title: 'Designer', passport_no: 'X1' })).toEqual({
      iban: '[hidden]', basic_salary_aed: '[hidden]', job_title: 'Designer', passport_no: '[hidden]',
    })
  })
})

describe('departments', () => {
  it('maps every tool to departments, and only admin gets the user list', async () => {
    const m = await import('./highmastMcp')
    const all = [...m.MCP_TOOLS, ...m.MCP_ADMIN_TOOLS, ...m.MCP_PDF_TOOLS]
    expect(Object.keys(m.MCP_TOOL_DEPARTMENTS).sort()).toEqual([...all].sort())
    for (const depts of Object.values(m.MCP_TOOL_DEPARTMENTS)) {
      for (const d of depts) expect(m.MCP_DEPARTMENT_VALUES).toContain(d)
    }
    expect(m.toolsForDepartments(['admin'])).toHaveLength(all.length)
    expect(m.toolsForDepartments(['sales'])).not.toContain('list_users')
  })

  it('gives each department only its own tools', async () => {
    const m = await import('./highmastMcp')
    const sales = m.toolsForDepartments(['sales'])
    expect(sales).toContain('create_quote')
    expect(sales).not.toContain('record_payment')
    expect(sales).not.toContain('update_employee')
    const hr = m.toolsForDepartments(['hr'])
    expect(hr).toContain('update_employee')
    expect(hr).not.toContain('create_payroll_run')
    expect(hr).not.toContain('create_quote')
    const payroll = m.toolsForDepartments(['payroll'])
    expect(payroll).toContain('create_payroll_run')
    expect(payroll).toContain('get_employee')
    expect(payroll).not.toContain('update_employee')
    const finance = m.toolsForDepartments(['finance'])
    expect(finance).toContain('convert_quote_to_invoice')
    expect(finance).not.toContain('create_deal')
    // Two departments add up.
    const both = m.toolsForDepartments(['support', 'documents'])
    expect(both).toContain('reply_ticket')
    expect(both).toContain('add_document')
    // Unknown departments give nothing extra.
    expect(m.toolsForDepartments(['legal'])).toEqual([])
    expect(m.normalizeDepartments(['Finance', 'sales', 'sales', 'nope'])).toEqual(['sales', 'finance'])
    expect(m.departmentsLabel(['finance', 'sales'])).toBe('Sales, Finance')
    expect(m.assistantLabel('grok')).toBe('Grok Bot')
  })
})

describe('generated PDFs', () => {
  it('files each document under its number in its own folder', async () => {
    const m = await import('./highmastMcp')
    expect(m.generatedPdfPath('quote', 'RR-01-26007')).toBe('quotes/RR-01-26007.pdf')
    expect(m.generatedPdfPath('invoice', 'RR-01-26007-CN1')).toBe('invoices/RR-01-26007-CN1.pdf')
    expect(m.generatedPdfPath('delivery-note', 'DN-01-26001')).toBe('delivery-notes/DN-01-26001.pdf')
    expect(m.generatedPdfPath('quote', '../secret')).toBeNull()
    expect(m.generatedPdfPath('quote', 'a/b')).toBeNull()
    expect(m.generatedPdfPath('quote', '')).toBeNull()
    expect(m.quotePdfNumber({ reference_number: '', quote_id: 'Q-123' })).toBe('Q-123')
    expect(m.quotePdfNumber({ reference_number: 'RR-01-26007', quote_id: 'Q-123' })).toBe('RR-01-26007')
    expect(m.GENERATED_PDF_LINK_SECONDS).toBe(3600)
  })

  it('gives the PDF tools to the departments that see those documents', async () => {
    const m = await import('./highmastMcp')
    expect(m.toolsForDepartments(['sales'])).toContain('get_quote_pdf')
    expect(m.toolsForDepartments(['finance'])).toContain('get_invoice_pdf')
    expect(m.toolsForDepartments(['operations'])).toContain('get_delivery_note_pdf')
    expect(m.toolsForDepartments(['hr'])).not.toContain('get_quote_pdf')
  })
})
