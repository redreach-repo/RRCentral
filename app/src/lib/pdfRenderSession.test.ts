import { afterEach, describe, expect, it } from 'vitest'
import { isPdfRenderPath, pdfRenderToken, renderTokenFromHash, resetPdfRenderTokenCache } from './pdfRenderSession'

const ID = 'e6200000-0000-4000-8000-000000000001'
const TOKEN = 'aaa.bbb.ccc'

describe('PDF render session', () => {
  afterEach(() => resetPdfRenderTokenCache())

  it('only the render page counts', () => {
    expect(isPdfRenderPath(`/RRCentral/render-pdf/quote/${ID}`)).toBe(true)
    expect(isPdfRenderPath(`/render-pdf/delivery-note/${ID}`)).toBe(true)
    expect(isPdfRenderPath(`/RRCentral/document/quote/${ID}`)).toBe(false)
    expect(isPdfRenderPath(`/RRCentral/render-pdf/payroll/${ID}`)).toBe(false)
    expect(isPdfRenderPath('/RRCentral/render-pdf/quote/not-an-id')).toBe(false)
  })

  it('reads a token shaped like a login token', () => {
    expect(renderTokenFromHash(`#t=${TOKEN}`)).toBe(TOKEN)
    expect(renderTokenFromHash('#t=<script>')).toBeNull()
    expect(renderTokenFromHash('')).toBeNull()
  })

  it('never applies on a normal page, even with a token in the link', () => {
    expect(pdfRenderToken({ pathname: `/RRCentral/document/quote/${ID}`, hash: `#t=${TOKEN}` })).toBeNull()
  })

  it('applies on the render page', () => {
    expect(pdfRenderToken({ pathname: `/RRCentral/render-pdf/quote/${ID}`, hash: `#t=${TOKEN}` })).toBe(TOKEN)
  })
})
