import { describe, expect, it } from 'vitest'
import { isMcpKeyShape } from './highmastMcp'
import { generateMcpKey, mcpServerUrl, sha256Hex } from './mcpKeys'

describe('AI connector keys', () => {
  it('makes hmk_ keys with 32 random bytes, different every time', () => {
    const a = generateMcpKey()
    const b = generateMcpKey()
    expect(isMcpKeyShape(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('stores only a 64 character SHA-256 hash, never the key', async () => {
    const key = generateMcpKey(() => new Uint8Array(32))
    expect(key).toBe('hmk_' + 'A'.repeat(43))
    const hash = await sha256Hex(key)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(key)
  })

  it('gives the function URL for the project', () => {
    expect(mcpServerUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co/functions/v1/highmast-mcp')
  })
})
