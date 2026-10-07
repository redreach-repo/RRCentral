import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAllProducts } from '@/lib/catalog'

const schema = z.object({
  message: z.string().min(1).max(500),
  locale: z.enum(['en', 'ar']).optional(),
})

// Simple in-memory rate limit: IP -> timestamps
const rateBuckets = new Map<string, number[]>()
const RATE_LIMIT = Number(process.env.TAYO_RATE_LIMIT_PER_MIN || 20)
const WINDOW_MS = 60_000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip) || []
  const recent = bucket.filter((t) => now - t < WINDOW_MS)
  if (recent.length >= RATE_LIMIT) return true
  recent.push(now)
  rateBuckets.set(ip, recent)
  return false
}

function scriptedFallback(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('size') || lower.includes('fit')) {
    return 'Oversized tees run big — size down one. Regular tees are true to size. Check the size guide on the product page.'
  }
  if (lower.includes('deliver') || lower.includes('shipping')) {
    return 'Free UAE delivery over AED 200. Otherwise AED 15 flat. Dispatch in 1–3 business days.'
  }
  if (lower.includes('gift')) {
    return 'Try Salik Survivor, Karak Over Everything, or a limited drop hoodie. All great gifts with free delivery over AED 200.'
  }
  if (lower.includes('order') || lower.includes('track')) {
    return 'Track at /order/track with your email and order number. Confirmation emails go out within minutes of payment.'
  }
  if (lower.includes('custom') || lower.includes('tribe made') || lower.includes('bulk')) {
    return 'Tribe Made does custom merch — head to /tribe-made for a quote. MOQ starts at 10 pieces.'
  }
  if (lower.includes('return') || lower.includes('exchange')) {
    return 'Unworn items can be exchanged within 14 days. Email alfred@redreach.ae with your order number.'
  }
  return 'I\'m Tayo, Tee Tribe\'s assistant. Ask about sizes, delivery, gifts, orders, or custom merch — or email alfred@redreach.ae for help.'
}

async function buildCatalogPrompt(): Promise<string> {
  const products = await getAllProducts()
  const summary = products
    .slice(0, 12)
    .map((p) => `- ${p.name} (${p.collection}): ${p.priceFils / 100} AED`)
    .join('\n')

  return `You are Tayo, the friendly assistant for Tee Tribe — a UAE premium tee brand.
Be concise, warm, and helpful. Prices in AED. Free delivery over AED 200.
Never mention flags or political imagery. Encourage visiting product pages.

Sample catalogue:
${summary}

Answer in the user's language if they write in Arabic.`
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'Rate limit exceeded' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid message' }, { status: 400 })
  }

  const { message } = parsed.data
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ ok: true, reply: scriptedFallback(message), source: 'scripted' })
  }

  try {
    const systemPrompt = await buildCatalogPrompt()
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    })

    if (!res.ok) {
      console.error('[tayo] Anthropic error:', res.status)
      return NextResponse.json({ ok: true, reply: scriptedFallback(message), source: 'fallback' })
    }

    const data = await res.json()
    const reply = data.content?.[0]?.text || scriptedFallback(message)
    return NextResponse.json({ ok: true, reply, source: 'claude' })
  } catch (err) {
    console.error('[tayo]', err)
    return NextResponse.json({ ok: true, reply: scriptedFallback(message), source: 'fallback' })
  }
}
