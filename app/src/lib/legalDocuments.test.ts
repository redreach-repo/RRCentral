import { describe, expect, it } from 'vitest'
import { LEGAL_SIGN_ASSENT_BLURB, LEGAL_SIGN_DONE_BLURB } from './legalDocuments'

describe('legal sign copy (M5 e-sign honesty)', () => {
  it('describes /sign as assent evidence and denies QES', () => {
    expect(LEGAL_SIGN_ASSENT_BLURB).toMatch(/assent/i)
    expect(LEGAL_SIGN_ASSENT_BLURB).toMatch(/Qualified Electronic Signature|QES/)
    expect(LEGAL_SIGN_ASSENT_BLURB.toLowerCase()).not.toMatch(/same as handwritten/)
    expect(LEGAL_SIGN_DONE_BLURB).toMatch(/assent/i)
    expect(LEGAL_SIGN_DONE_BLURB).toMatch(/Qualified Electronic Signature|QES/)
  })
})
