import { itemCount, type CartLine } from './cart'

export function shopPath(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : path ? `/${path}` : ''
  return `${base}/shop${suffix}`
}

export function checkoutEndpoint(): string {
  const explicit = import.meta.env.VITE_CHECKOUT_API_URL
  if (explicit) return String(explicit)
  return `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}api/create-checkout-session`
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
  try {
    const response = await fetch(checkoutEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, successUrl, cancelUrl }),
    })
    if (response.ok) {
      const data = (await response.json()) as { url?: string; demo?: boolean }
      if (data.url) {
        window.location.assign(data.url)
        return { demo: Boolean(data.demo) }
      }
    }
  } catch {
    // Static hosts such as GitHub Pages have no checkout API — fall through to demo.
  }
  const demo = new URL(shopPath('/order/success'), window.location.origin)
  demo.searchParams.set('demo', '1')
  demo.searchParams.set('items', String(itemCount(lines)))
  window.location.assign(demo.toString())
  return { demo: true }
}
