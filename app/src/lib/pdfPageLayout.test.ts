import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PDF_PAGE_LAYOUTS, isPdfPageLayout, readPdfPageLayout, savePdfPageLayout } from './documents'

describe('PDF page layout option', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      clear: () => store.clear(),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers one page, two pages (terms on page 2) and natural length', () => {
    expect(PDF_PAGE_LAYOUTS.map((o) => o.value)).toEqual(['fit', 'split', 'flow'])
    expect(PDF_PAGE_LAYOUTS.find((o) => o.value === 'split')?.label).toBe('Two pages (terms on page 2)')
  })

  it('defaults to one page and remembers the last choice', () => {
    expect(readPdfPageLayout()).toBe('fit')
    savePdfPageLayout('split')
    expect(readPdfPageLayout()).toBe('split')
  })

  it('falls back to one page when storage is unavailable', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', undefined)
    expect(readPdfPageLayout()).toBe('fit')
    expect(() => savePdfPageLayout('split')).not.toThrow()
  })

  it('ignores unknown saved values', () => {
    localStorage.setItem('rrcentral_pdf_page_layout', 'three-pages')
    expect(readPdfPageLayout()).toBe('fit')
    expect(isPdfPageLayout('flow')).toBe(true)
    expect(isPdfPageLayout('x')).toBe(false)
  })
})
