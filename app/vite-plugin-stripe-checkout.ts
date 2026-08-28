import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import { loadEnv } from 'vite'
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
    | { ok: true; params: Record<string, unknown>; totalFils: number; count: number }
    | { ok: false; error: string }
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

async function handleCheckout(
  req: IncomingMessage,
  res: ServerResponse,
  loadHelpers: () => Promise<CheckoutHelpers>,
) {
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

  const { parseCheckoutRequest, buildCheckoutSessionParams } = await loadHelpers()
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
  const session = await stripe.checkout.sessions.create(
    built.params as unknown as Stripe.Checkout.SessionCreateParams,
  )
  send(res, 200, { url: session.url, id: session.id, demo: false })
}

export function stripeCheckoutPlugin(): Plugin {
  let devServer: ViteDevServer | undefined

  const loadHelpers = async (): Promise<CheckoutHelpers> => {
    if (!devServer) throw new Error('Checkout API is only available during Vite dev')
    return (await devServer.ssrLoadModule('/src/shop/checkout.ts')) as CheckoutHelpers
  }

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] || ''
    if (!PATHS.has(url)) {
      next()
      return
    }
    void handleCheckout(req, res, loadHelpers).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Checkout failed'
      send(res, 500, { error: message })
    })
  }

  return {
    name: 'stripe-checkout',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), '')
      if (env.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY
      if (env.STRIPE_RESTRICTED_KEY) process.env.STRIPE_RESTRICTED_KEY = env.STRIPE_RESTRICTED_KEY
    },
    configureServer(server) {
      devServer = server
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
