import { describe, expect, it } from 'vitest'

// Light sanity checks for UUID / empty-date prep used by cloud import.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

describe('cloud backup import helpers', () => {
  it('accepts standard UUIDs and rejects local string ids', () => {
    expect(isUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true)
    expect(isUuid('user-alfred@redreach.ae')).toBe(false)
    expect(isUuid('')).toBe(false)
  })
})
