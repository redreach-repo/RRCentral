import { describe, expect, it } from 'vitest'
import { passkeysSupported, passkeyStubStatus } from './passkeyStub'

describe('passkeyStub', () => {
  it('reports support and stub labels', () => {
    expect(passkeysSupported({})).toBe(false)
    expect(passkeysSupported({ PublicKeyCredential: {} })).toBe(true)
    expect(passkeyStubStatus({ supported: true, enrolledCount: 0 }).label).toMatch(/coming soon/)
    expect(passkeyStubStatus({ supported: true, enrolledCount: 2 }).label).toMatch(/2 passkey/)
    expect(passkeyStubStatus({ supported: false, enrolledCount: 0 }).ready).toBe(false)
  })
})
