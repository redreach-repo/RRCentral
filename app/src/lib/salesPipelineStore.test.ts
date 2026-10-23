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
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
    update: (p: Row) => ((op = 'update'), (patch = p), q),
    delete: () => ((op = 'delete'), q),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    insert: async (input: Row | Row[]) => {
      const list = Array.isArray(input) ? input : [input]
      for (const r of list) rows().push({ ...r })
      return { data: list, error: null }
    },
    then: (resolve: (v: unknown) => void) => resolve(run()),
  }
  return q
}

vi.mock('./db', () => ({ db: { from: (t: string) => query(t) }, currentAuthMode: () => 'local' }))
vi.mock('./accountsStore', () => ({
  logAccountEvent: vi.fn(async () => undefined),
  createAccount: vi.fn(),
  updateAccount: vi.fn(async (id: string, patch: Row) => {
    Object.assign(tables.accounts.find((a) => a.id === id)!, patch)
  }),
}))

const { makeContractFromDeal } = await import('./salesPipelineStore')
const author = { appUserId: 'u1', email: 'alfred@redreach.ae' }

function seed(over: Row = {}) {
  for (const k of Object.keys(tables)) delete tables[k]
  tables.accounts = [{ id: 'a1', name: 'Clinic LLC', status: 'prospect' }]
  tables.contracts = []
  tables.sales_deals = [
    {
      id: 'd1',
      account_id: 'a1',
      stage: 'quote_sent',
      next_action: 'Chase the signature',
      next_action_date: '2026-10-25',
      lost_reason: '',
      package_id: 'p2',
      option: 'B',
      monthly_fee: 4200,
      setup_fee: 3000,
      discount_percent: 0,
      discount_months: 0,
      start_date: '2026-11-01',
      quote_reference: '',
      contract_id: null,
      ...over,
    },
  ]
}

describe('makeContractFromDeal', () => {
  beforeEach(() => seed())

  it('creates the contract, signs the deal and moves the prospect to onboarding', async () => {
    const deal = { ...tables.sales_deals[0] } as never
    const id = await makeContractFromDeal(deal, { id: 'a1', status: 'prospect' }, author)
    expect(tables.contracts).toHaveLength(1)
    expect(tables.contracts[0]).toMatchObject({
      id,
      account_id: 'a1',
      package_id: 'p2',
      option: 'B',
      monthly_fee: 4200,
      setup_fee: 3000,
      term_start: '2026-11-01',
      term_end: '2027-10-31',
      status: 'active',
      auto_invoice: false,
    })
    expect(tables.sales_deals[0]).toMatchObject({ stage: 'signed', contract_id: id })
    expect(tables.accounts[0].status).toBe('onboarding')
  })

  it('does not make a second contract when pressed twice', async () => {
    const deal = { ...tables.sales_deals[0] } as never
    const first = await makeContractFromDeal(deal, { id: 'a1', status: 'prospect' }, author)
    const second = await makeContractFromDeal(deal, { id: 'a1', status: 'onboarding' }, author)
    expect(second).toBe(first)
    expect(tables.contracts).toHaveLength(1)
  })

  it('needs a quote', async () => {
    seed({ package_id: null, monthly_fee: 0 })
    await expect(makeContractFromDeal({ ...tables.sales_deals[0] } as never, undefined, author)).rejects.toThrow(/quoted/)
    expect(tables.contracts).toHaveLength(0)
  })
})
