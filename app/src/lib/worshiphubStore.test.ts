import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
let configured = true
vi.mock('./supabaseConfig', () => ({
  isSupabaseConfigured: () => configured,
  getSupabaseClient: () => ({ functions: { invoke } }),
}))
vi.mock('./db', () => ({ db: {} }))

const { fetchLiveTenants } = await import('./worshiphubStore')

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
