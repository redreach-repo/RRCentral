import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
let configured = true
vi.mock('./supabaseConfig', () => ({
  isSupabaseConfigured: () => configured,
  getSupabaseClient: () => ({ functions: { invoke } }),
}))
vi.mock('./db', () => ({ db: {} }))

const { fetchLiveTenants, runChurchAction } = await import('./worshiphubStore')

describe('fetchLiveTenants', () => {
  beforeEach(() => {
    invoke.mockReset()
    configured = true
  })

  it('is not connected in local mode and never calls out', async () => {
    configured = false
    expect(await fetchLiveTenants()).toMatchObject({ connected: false, reason: 'local' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('passes on the function saying it is not set up', async () => {
    invoke.mockResolvedValue({ data: { connected: false, reason: 'not_configured', tenants: [] }, error: null })
    expect(await fetchLiveTenants()).toMatchObject({ connected: false, reason: 'not_configured' })
  })

  it('treats a missing function as not deployed', async () => {
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('non-2xx'), { context: { status: 404 } }) })
    expect(await fetchLiveTenants()).toMatchObject({ connected: false, reason: 'not_deployed' })
  })

  it('filters live rows again in the app', async () => {
    invoke.mockResolvedValue({
      data: { connected: true, fetched_at: '2026-10-23T10:00:00Z', tenants: [{ slug: 'icoc-uae', plan: 'Standard', members: [1, 2] }] },
      error: null,
    })
    const r = await fetchLiveTenants()
    expect(r.connected).toBe(true)
    if (r.connected) {
      expect(r.tenants).toHaveLength(1)
      expect(r.tenants[0]).not.toHaveProperty('members')
    }
  })
})

describe('runChurchAction', () => {
  beforeEach(() => {
    invoke.mockReset()
    configured = true
  })

  it('sends the action and church to worshiphub-manage', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await runChurchAction('accept', { slug: 'grace', name: 'Grace' })
    expect(invoke).toHaveBeenCalledWith('worshiphub-manage', { body: { action: 'accept', slug: 'grace', name: 'Grace' } })
  })

  it("shows WorshipHub's reason when it refuses", async () => {
    invoke.mockResolvedValue({ data: { ok: false, error: '"Grace" has real data' }, error: null })
    await expect(runChurchAction('delete', { slug: 'grace', name: 'Grace' })).rejects.toThrow('has real data')
  })

  it('reads the reason from a refused call', async () => {
    const context = { status: 403, json: async () => ({ error: 'Only RR Central admins can change churches on WorshipHub' }) }
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('non-2xx'), { context }) })
    await expect(runChurchAction('verify', { slug: 'grace', name: 'Grace' })).rejects.toThrow('Only RR Central admins')
  })

  it('says when the function is not deployed', async () => {
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('non-2xx'), { context: { status: 404 } }) })
    await expect(runChurchAction('verify', { slug: 'grace', name: 'Grace' })).rejects.toThrow('not deployed')
  })
})
