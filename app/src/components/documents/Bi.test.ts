import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Bi from './Bi'
import { BilingualContext } from './bilingualContext'

const render = (en: string, on: boolean) =>
  renderToStaticMarkup(createElement(BilingualContext.Provider, { value: on }, createElement(Bi, { en })))

describe('Bi', () => {
  it('prints English only when off', () => {
    expect(render('Subtotal', false)).toBe('Subtotal')
  })
  it('adds Arabic marked rtl when on', () => {
    const html = render('TAX INVOICE', true)
    expect(html).toContain('TAX INVOICE · ')
    expect(html).toContain('lang="ar"')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('فاتورة ضريبية')
  })
  it('leaves unknown labels English only when on', () => {
    expect(render('CUSTOM CLIENT PROPOSAL', true)).toBe('CUSTOM CLIENT PROPOSAL')
  })
})
