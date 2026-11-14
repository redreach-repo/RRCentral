import { describe, expect, it } from 'vitest'
import { parseLegalSignForm } from './legalSign'

const now = new Date('2026-11-14T10:00:00Z')
const okSig = `data:image/png;base64,${'A'.repeat(100)}`

describe('parseLegalSignForm', () => {
  it('rejects missing agreement tick', () => {
    const r = parseLegalSignForm(
      { name: 'Sara Ali', date: '2026-11-14', agreed: false, signaturePng: okSig },
      now,
    )
    expect(r.ok).toBe(false)
  })

  it('accepts a valid signature form', () => {
    const r = parseLegalSignForm(
      { name: '  Sara Ali  ', date: '2026-11-14', agreed: true, signaturePng: okSig },
      now,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.name).toBe('Sara Ali')
    expect(r.data.signature_png.startsWith('data:image/png')).toBe(true)
  })
})
