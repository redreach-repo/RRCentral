import { COLORS, SIZES, productById } from './catalog'
import { cartTotals, type CartLine } from './cart'
import { CURRENCY } from './format'

export const INTEGRATION_IDENTIFIER = 'tee-tribe-web-kxmqpwrn'

export const SHIP_COUNTRIES = ['AE', 'SA', 'OM', 'KW', 'BH', 'QA', 'IN', 'US', 'GB', 'PH'] as const

export type CheckoutRequest = {
  lines: CartLine[]
  successUrl: string
  cancelUrl: string
}

export type CheckoutLineItem = {
  quantity: number
  price_data: {
    currency: typeof CURRENCY
    unit_amount: number
    product_data: {
      name: string
      description: string
      metadata: Record<string, string>
    }
  }
}

export type CheckoutSessionParams = {
  mode: 'payment'
  integration_identifier: string
  success_url: string
  cancel_url: string
  line_items: CheckoutLineItem[]
  shipping_address_collection: { allowed_countries: string[] }
  billing_address_collection: 'required'
  phone_number_collection: { enabled: true }
  allow_promotion_codes: true
  shipping_options: Array<{
    shipping_rate_data: {
      type: 'fixed_amount'
      fixed_amount: { amount: number; currency: typeof CURRENCY }
      display_name: string
      delivery_estimate: {
        minimum: { unit: 'business_day'; value: number }
        maximum: { unit: 'business_day'; value: number }
      }
    }
  }>
  metadata: Record<string, string>
}

export type CheckoutBuildResult =
  | { ok: true; params: CheckoutSessionParams; totalFils: number; count: number }
  | { ok: false; error: string }

const URL_RE = /^https?:\/\//i

export function isSafeUrl(url: string): boolean {
  if (!URL_RE.test(url)) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseCheckoutRequest(input: unknown): CheckoutRequest | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Invalid checkout payload' }
  const body = input as Record<string, unknown>
  if (!Array.isArray(body.lines) || body.lines.length === 0) return { error: 'Your bag is empty' }
  const successUrl = String(body.successUrl || '')
  const cancelUrl = String(body.cancelUrl || '')
  if (!isSafeUrl(successUrl) || !isSafeUrl(cancelUrl)) return { error: 'Invalid return URL' }
  const lines: CartLine[] = []
  for (const row of body.lines) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const productId = String(r.productId || '')
    const colorId = String(r.colorId || '')
    const size = String(r.size || '').toUpperCase()
    const qty = Math.floor(Number(r.qty) || 0)
    if (!productId || !colorId || !size || qty < 1) continue
    if (!SIZES.includes(size as (typeof SIZES)[number])) continue
    lines.push({ productId, colorId, size, qty })
  }
  if (!lines.length) return { error: 'No valid items to check out' }
  return { lines, successUrl, cancelUrl }
}

export function buildCheckoutSessionParams(request: CheckoutRequest): CheckoutBuildResult {
  const totals = cartTotals(request.lines)
  if (!totals.valid.length) return { ok: false, error: 'No valid items to check out' }
  if (totals.valid.length > 30) return { ok: false, error: 'Too many lines in this bag' }

  const line_items: CheckoutLineItem[] = totals.valid.map((line) => {
    const product = productById(line.productId)!
    const color = COLORS[line.colorId]?.name || line.colorId
    return {
      quantity: line.qty,
      price_data: {
        currency: CURRENCY,
        unit_amount: product.priceFils,
        product_data: {
          name: product.name,
          description: `${color} · Size ${line.size}`,
          metadata: {
            sku: product.sku,
            product_id: product.id,
            color: line.colorId,
            size: line.size,
          },
        },
      },
    }
  })

  const shippingName = totals.shippingFils === 0 ? 'Free delivery (UAE)' : 'Standard delivery (UAE)'

  return {
    ok: true,
    totalFils: totals.totalFils,
    count: totals.count,
    params: {
      mode: 'payment',
      integration_identifier: INTEGRATION_IDENTIFIER,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      line_items,
      shipping_address_collection: { allowed_countries: [...SHIP_COUNTRIES] },
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: totals.shippingFils, currency: CURRENCY },
            display_name: shippingName,
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 5 },
            },
          },
        },
      ],
      metadata: {
        source: 'tee-tribe',
        item_count: String(totals.count),
        skus: totals.valid.map((line) => `${line.product.sku}:${line.size}:${line.qty}`).join(','),
      },
    },
  }
}
