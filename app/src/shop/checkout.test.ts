import { describe, expect, it } from 'vitest'
import { INTEGRATION_IDENTIFIER, buildCheckoutSessionParams, parseCheckoutRequest } from './checkout'

describe('Tee Tribe Stripe checkout payload', () => {
  const urls = {
    successUrl: 'http://localhost:5173/RRCentral/shop/order/success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'http://localhost:5173/RRCentral/shop/order/cancel',
  }

  it('builds hosted Checkout Sessions from catalog prices', () => {
    const parsed = parseCheckoutRequest({
      ...urls,
      lines: [{ productId: 'tt-chr-001', colorId: 'black', size: 'M', qty: 2 }],
    })
    if ('error' in parsed) throw new Error(parsed.error)
    const built = buildCheckoutSessionParams(parsed)
    if (!built.ok) throw new Error(built.error)
    expect(built.params.mode).toBe('payment')
    expect(built.params.integration_identifier).toBe(INTEGRATION_IDENTIFIER)
    expect(built.params.line_items).toHaveLength(1)
    expect(built.params.line_items[0]?.price_data.unit_amount).toBe(10900)
    expect(built.params.line_items[0]?.quantity).toBe(2)
    expect(built.params.line_items[0]?.price_data.currency).toBe('aed')
    expect('payment_method_types' in built.params).toBe(false)
    expect(built.params.shipping_options[0]?.shipping_rate_data.fixed_amount.amount).toBe(0)
    expect(built.totalFils).toBe(21800)
  })

  it('rejects empty bags, bad URLs, and invented SKUs', () => {
    expect(parseCheckoutRequest({ lines: [], ...urls })).toEqual({ error: 'Your bag is empty' })
    expect(parseCheckoutRequest({ lines: [{ productId: 'tt-chr-001', colorId: 'black', size: 'M', qty: 1 }], successUrl: 'javascript:alert(1)', cancelUrl: urls.cancelUrl })).toEqual({
      error: 'Invalid return URL',
    })
    const parsed = parseCheckoutRequest({
      ...urls,
      lines: [{ productId: 'not-a-tee', colorId: 'black', size: 'M', qty: 1 }],
    })
    if ('error' in parsed) throw new Error(parsed.error)
    expect(buildCheckoutSessionParams(parsed)).toEqual({ ok: false, error: 'No valid items to check out' })
  })
})
