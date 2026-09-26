import { itemCount, type CartLine } from './cart'
import { getSupabaseRuntimeConfig } from '../lib/supabaseConfig'

export function shopPath(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : path ? `/${path}` : ''
  return `${base}/shop${suffix}`
}

type CheckoutTarget = { url: string; headers: Record<string, string> }

/**
 * Where to create the Stripe session:
 *  1. VITE_CHECKOUT_API_URL, if set
 *  2. Vite dev server middleware (local development)
 *  3. Supabase Edge Function `create-checkout-session` (live site)
 */
export function checkoutTarget(): CheckoutTarget | null {
  const explicit = import.meta.env.VITE_CHECKOUT_API_URL
  if (explicit) return { url: String(explicit), headers: {} }
  if (import.meta.env.DEV) {
    return { url: `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}api/create-checkout-session`, headers: {} }
  }
  const cfg = getSupabaseRuntimeConfig()
  if (cfg.source !== 'env') return null
  return {
    url: `${cfg.url.replace(/\/$/, '')}/functions/v1/create-checkout-session`,
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
  }
}

export function checkoutReturnUrls() {
  const origin = window.location.origin
  const success = `${origin}${shopPath('/order/success')}?session_id={CHECKOUT_SESSION_ID}`
  const cancel = `${origin}${shopPath('/order/cancel')}`
  return { successUrl: success, cancelUrl: cancel }
}

export async function startCheckout(lines: CartLine[]): Promise<{ demo: boolean }> {
  if (!itemCount(lines)) throw new Error('Your bag is empty')
  const { successUrl, cancelUrl } = checkoutReturnUrls()
  const target = checkoutTarget()

  if (target) {
    let response: Response | null = null
    try {
      response = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...target.headers },
        body: JSON.stringify({ lines, successUrl, cancelUrl }),
      })
    } catch {
      if (!import.meta.env.DEV) {
        throw new Error('Could not reach checkout. Check your connection and try again.')
      }
    }
    if (response) {
      const data = (await response.json().catch(() => ({}))) as {
        url?: string
        demo?: boolean
        error?: string
      }
      if (response.ok && data.url) {
        window.location.assign(data.url)
        return { demo: Boolean(data.demo) }
      }
      if (!import.meta.env.DEV) {
        throw new Error(data.error || 'Checkout is unavailable right now. Please try again shortly.')
      }
    }
  } else if (!import.meta.env.DEV) {
    // Never pretend an order succeeded on the live site.
    throw new Error('Online checkout is not available yet. Please contact us to order.')
  }

  // Local development without Stripe keys: simulate a successful order.
  const demo = new URL(shopPath('/order/success'), window.location.origin)
  demo.searchParams.set('demo', '1')
  demo.searchParams.set('items', String(itemCount(lines)))
  window.location.assign(demo.toString())
  return { demo: true }
}
