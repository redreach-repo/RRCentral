import { describe, expect, it } from 'vitest'
import { parseExpensePdfPick } from './expensePdf'

describe('parseExpensePdfPick', () => {
  it('rejects non-pdf', () => {
    const r = parseExpensePdfPick({ fileName: 'scan.png', mimeType: 'image/png' })
    expect(r.ok).toBe(false)
  })

  it('accepts pdf by mime or extension', () => {
    expect(parseExpensePdfPick({ fileName: 'a.pdf', mimeType: '' }).ok).toBe(true)
    expect(parseExpensePdfPick({ fileName: 'a', mimeType: 'application/pdf' }).ok).toBe(true)
  })
})
