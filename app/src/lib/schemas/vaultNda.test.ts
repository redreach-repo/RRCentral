import { describe, expect, it } from 'vitest'
import { parseVaultNdaForm } from './vaultNda'

describe('parseVaultNdaForm', () => {
  it('rejects blank party name', () => {
    const r = parseVaultNdaForm({ partyName: '  ', partyEmail: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/sign/i)
  })

  it('rejects invalid email when provided', () => {
    const r = parseVaultNdaForm({ partyName: 'Alex', partyEmail: 'not-an-email' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/email/i)
  })

  it('allows empty email and trims name', () => {
    const r = parseVaultNdaForm({ partyName: '  Alex Client  ', partyEmail: '' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.partyName).toBe('Alex Client')
    expect(r.data.partyEmail).toBe('')
  })
})
