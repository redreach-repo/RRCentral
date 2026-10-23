import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}

/** A small in-memory stand-in for the Supabase query builder. */
function query(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'update' | 'delete' = 'select'
  let patch: Row = {}
  const rows = () => (tables[table] ??= [])
  const run = () => {
    const hit = rows().filter((r) => filters.every((f) => f(r)))
    if (op === 'update') hit.forEach((r) => Object.assign(r, patch))
    if (op === 'delete') tables[table] = rows().filter((r) => !hit.includes(r))
    return { data: hit.map((r) => ({ ...r })), error: null }
  }
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
    update: (p: Row) => ((op = 'update'), (patch = p), q),
    delete: () => ((op = 'delete'), q),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    insert: async (input: Row | Row[]) => {
      const list = Array.isArray(input) ? input : [input]
      for (const r of list) {
        if (
          table === 'contract_invoices' &&
          rows().some((x) => x.contract_id === r.contract_id && x.kind === r.kind && x.period === r.period)
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } }
        }
        rows().push({ ...r })
      }
      return { data: list, error: null }
    },
    then: (resolve: (v: unknown) => void) => resolve(run()),
  }
  return q
}

vi.mock('./db', () => ({ db: { from: (t: string) => query(t) } }))
vi.mock('./accountsStore', () => ({ logAccountEvent: vi.fn(async () => undefined) }))

const { runContractBilling, skipSetupInvoice, listDueReminders, recordReminder } = await import('./contractBillingStore')
const { DEFAULT_DELIVERY_RATES } = await import('./delivery')

const author = { appUserId: 'u1', email: 'alfred@redreach.ae' }
const run = (today: string) =>
  runContractBilling({ rates: DEFAULT_DELIVERY_RATES, settings: {}, author, today: new Date(`${today}T09:00:00`) })

function seed(contract: Row = {}) {
  for (const k of Object.keys(tables)) delete tables[k]
  tables.accounts = [{ id: 'a1', name: 'Clinic LLC' }]
  tables.delivery_packages = [
    { id: 'p1', name: 'Growth', included_whatsapp: 4000, ai_cap_usd: 50, included_lead_credits_usd: 0 },
  ]
  tables.contracts = [
    {
      id: 'c1',
      account_id: 'a1',
      package_id: 'p1',
      option: 'B',
      monthly_fee: 4200,
      setup_fee: 3000,
      setup_fee_paid: 0,
      term_start: '2026-10-10',
      term_end: '2027-10-09',
      discount_percent: 0,
      discount_months_left: 0,
      annual_prepay: false,
      status: 'active',
      auto_invoice: true,
      billing_from: null,
      created_at: '2026-10-10T08:00:00Z',
      ...contract,
    },
  ]
  tables.usage_records = []
}

const invoices = () => tables.invoices ?? []
const lines = (ref: unknown) => (tables.line_items ?? []).filter((l) => l.reference === ref)

describe('runContractBilling', () => {
  beforeEach(() => seed())

  it('raises the setup and first monthly invoice as drafts, once', async () => {
    expect(await run('2026-10-10')).toMatchObject({ raised: 2 })
    expect(invoices().map((i) => [i.description, i.amount, i.status, i.account_id])).toEqual([
      ['Setup fee, Growth package', 3150, 'Draft', 'a1'],
      ['Growth package, October 2026', 4410, 'Draft', 'a1'],
    ])
    expect(String(invoices()[0].reference_number)).toMatch(/^INV-DRAFT-/)
    expect(invoices()[0].payment_terms).toBe('Net 7 days')
    expect(lines(invoices()[1].reference_number)).toHaveLength(1)
    expect(await run('2026-10-20')).toMatchObject({ raised: 0 })
    expect(invoices()).toHaveLength(2)
  })

  it('adds last month usage to the next invoice and keeps the draft up to date', async () => {
    await run('2026-10-10')
    tables.usage_records.push({
      id: 'u1', account_id: 'a1', month: '2026-10-01',
      whatsapp_marketing_count: 4100, whatsapp_service_count: 0, ai_cost_usd: 0, lead_credits_cost_usd: 0,
    })
    expect(await run('2026-11-01')).toMatchObject({ raised: 1 })
    const nov = invoices()[2]
    expect(nov.amount).toBe(4441.5)
    expect(lines(nov.reference_number)).toHaveLength(2)

    // More usage entered later: the unsent draft follows it.
    tables.usage_records[0].whatsapp_marketing_count = 4200
    expect(await run('2026-11-03')).toMatchObject({ raised: 0, refreshed: 1 })
    expect(invoices()[2].amount).toBe(4473)

    // Once someone edits or finalises it, it is left alone.
    invoices()[2].status = 'Sent'
    tables.usage_records[0].whatsapp_marketing_count = 4300
    expect(await run('2026-11-04')).toMatchObject({ refreshed: 0 })
    expect(invoices()[2].amount).toBe(4473)
  })

  it('uses up discount months and keeps the discount when refreshing', async () => {
    seed({ setup_fee: 0, discount_percent: 10, discount_months_left: 1 })
    await run('2026-10-10')
    expect(invoices()[0].amount).toBe(3969)
    expect(tables.contracts[0].discount_months_left).toBe(0)
    tables.usage_records.push({ id: 'u1', account_id: 'a1', month: '2026-09-01', whatsapp_marketing_count: 0, whatsapp_service_count: 0, ai_cost_usd: 0, lead_credits_cost_usd: 0 })
    await run('2026-10-11')
    expect(invoices()[0].amount).toBe(3969)
    await run('2026-11-01')
    expect(invoices()[1].amount).toBe(4410)
  })

  it('does not raise a setup invoice for a contract switched on later', async () => {
    seed({ billing_from: '2026-11-01' })
    await skipSetupInvoice({ id: 'c1', account_id: 'a1', term_start: '2026-10-10', created_at: '' })
    expect(await run('2026-10-20')).toMatchObject({ raised: 0 })
    expect(await run('2026-11-01')).toMatchObject({ raised: 1 })
    expect(invoices()[0].description).toBe('Growth package, November 2026')
  })

  it('does nothing for contracts with automatic invoicing off', async () => {
    seed({ auto_invoice: false })
    expect(await run('2026-10-10')).toMatchObject({ raised: 0 })
  })

  it('skips a month whose draft was deleted', async () => {
    await run('2026-10-10')
    tables.invoices = []
    for (const r of tables.contract_invoices) r.invoice_id = null
    expect(await run('2026-10-12')).toMatchObject({ raised: 0 })
  })
})

describe('listDueReminders', () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k]
    tables.invoices = [
      { id: 'i1', client: 'Clinic', reference_number: 'RR-03-26001', date: '2026-10-01', amount: 1000, status: 'Sent', payment_status: 'Partial', payment_terms: 'Net 7 days' },
      { id: 'i2', client: 'Paid Co', reference_number: 'RR-03-26002', date: '2026-10-01', amount: 500, status: 'Sent', payment_status: 'Pending', payment_terms: 'Net 7 days' },
    ]
    tables.payment_log = [
      { invoice_ref: 'RR-03-26001', amount: 400 },
      { invoice_ref: 'RR-03-26002', amount: 500 },
    ]
  })

  it('lists invoices that still owe money, with the balance', async () => {
    const due = await listDueReminders(new Date('2026-10-16T09:00:00'))
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ balance: 600, due: { stage: 7, daysLate: 8 } })
    await recordReminder('i1', 7, 'email', 'alfred@redreach.ae')
    expect(await listDueReminders(new Date('2026-10-16T09:00:00'))).toHaveLength(0)
  })
})
