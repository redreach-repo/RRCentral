import { afterEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabaseConfig', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ functions: { invoke } }),
}))

import { getGmailStatus } from './gmailCalendarApi'
import { getM365Status } from './m365MailCalendarApi'

function httpError(status: number, body: unknown = {}) {
  const err = new Error('Edge Function returned a non-2xx status code') as Error & { context: Response }
  err.context = new Response(JSON.stringify(body), { status })
  return err
}

afterEach(() => invoke.mockReset())

describe('mail and calendar status when the function is not deployed', () => {
  it('shows Gmail as off, not an error, on a 404', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(404, { code: 'NOT_FOUND' }) })
    await expect(getGmailStatus()).resolves.toMatchObject({ deployed: false, configured: false, connected: false })
  })

  it('shows Microsoft 365 as off, not an error, on a 404', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(404) })
    await expect(getM365Status()).resolves.toMatchObject({ deployed: false, configured: false, connected: false })
  })

  it('still reports real errors from a deployed function', async () => {
    invoke.mockImplementation(async () => ({ data: null, error: httpError(500, { error: 'Token refresh failed' }) }))
    await expect(getGmailStatus()).rejects.toThrow('Token refresh failed')
    await expect(getM365Status()).rejects.toThrow('Token refresh failed')
  })
})
