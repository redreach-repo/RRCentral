import { describe, expect, it } from 'vitest'
import { cipherVersion, isCiphertext, maskIban, maskId } from './fieldEncryption'
import strings from '../../modules/extensions/sensitive-fields/strings'

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


describe('A1 masking and strings', () => {
  it('masks ID numbers like the database', () => {
    expect(maskId('784-1990-1234567-1')).toBe('•••• 5671')
    expect(maskId('')).toBe('')
  })
  it('has every reveal string in English and Arabic', () => {
    expect(Object.keys(strings.ar).sort()).toEqual(Object.keys(strings.en).sort())
  })
})
