import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import Stripe from 'stripe'

const PATHS = new Set(['/api/create-checkout-session', '/RRCentral/api/create-checkout-session'])

type CheckoutRequest = {
  lines: Array<{ productId: string; colorId: string; size: string; qty: number }>
  successUrl: string
  cancelUrl: string
}

type CheckoutHelpers = {
  parseCheckoutRequest: (input: unknown) => CheckoutRequest | { error: string }
  buildCheckoutSessionParams: (request: CheckoutRequest) =>
    | { ok: true; params: Stripe.Checkout.SessionCreateParams; totalFils: number; count: number }
    | { ok: false; error: string }
}

async function loadCheckoutHelpers(): Promise<CheckoutHelpers> {
  const specifier = pathToFileURL(join(process.cwd(), 'src/shop/checkout.ts')).href
  return import(specifier) as Promise<CheckoutHelpers>
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handleCheckout(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== 'POST') {
    send(res, 405, { error: 'POST only' })
    return
  }

  let payload: unknown
  try {
    payload = await readJson(req)
  } catch {
    send(res, 400, { error: 'Invalid JSON' })
    return
  }

  const { parseCheckoutRequest, buildCheckoutSessionParams } = await loadCheckoutHelpers()
  const parsed = parseCheckoutRequest(payload)
  if ('error' in parsed) {
    send(res, 400, { error: parsed.error })
    return
  }

  const built = buildCheckoutSessionParams(parsed)
  if (!built.ok) {
    send(res, 400, { error: built.error })
    return
  }

  const secret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_RESTRICTED_KEY
  if (!secret) {
    const withSession = parsed.successUrl.replace('{CHECKOUT_SESSION_ID}', 'cs_demo_teetribe')
    const demoUrl = withSession.includes('?') ? `${withSession}&demo=1` : `${withSession}?demo=1`
    send(res, 200, { demo: true, url: demoUrl })
    return
  }

  const stripe = new Stripe(secret, {
    apiVersion: '2026-07-29.dahlia' as Stripe.LatestApiVersion,
  })
  const session = await stripe.checkout.sessions.create(built.params)
  send(res, 200, { url: session.url, id: session.id, demo: false })
}

export function stripeCheckoutPlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] || ''
    if (!PATHS.has(url)) {
      next()
      return
    }
    void handleCheckout(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Checkout failed'
      send(res, 500, { error: message })
    })
  }

  return {
    name: 'stripe-checkout',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
