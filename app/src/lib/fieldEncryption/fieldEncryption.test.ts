import { describe, expect, it } from 'vitest'
import { cipherVersion, isCiphertext, maskIban } from './fieldEncryption'

describe('field-level encryption helpers', () => {
  it('recognises stored ciphertext and its key version', () => {
    expect(isCiphertext('fle:v1:wcBMA...')).toBe(true)
    expect(isCiphertext('AE070331234567890123456')).toBe(false)
    expect(isCiphertext(12000)).toBe(false)
    expect(cipherVersion('fle:v12:abc')).toBe(12)
    expect(cipherVersion('nope')).toBeNull()
  })
  it('masks IBAN like the database does', () => {
    expect(maskIban('AE07 0331 2345 6789 0123 456')).toBe('AE•• •••• 3456')
    expect(maskIban('')).toBe('')
  })
})
