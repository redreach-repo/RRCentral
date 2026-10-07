import { Resend } from 'resend'
import { formatAed } from '@/lib/money'

let resendClient: Resend | null = null

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!resendClient) resendClient = new Resend(key)
  return resendClient
}

const from = process.env.EMAIL_FROM || 'Tee Tribe <onboarding@resend.dev>'
const replyTo = process.env.EMAIL_REPLY_TO || 'alfred@redreach.ae'

export type OrderEmailData = {
  orderId: string
  email: string
  name: string
  totalFils: number
  items: Array<{ name: string; variant: string; qty: number; priceFils: number }>
}

export async function sendOrderConfirmation(data: OrderEmailData): Promise<{ ok: boolean; stub?: boolean }> {
  const resend = getResend()
  const itemLines = data.items
    .map((i) => `${i.name} (${i.variant}) × ${i.qty} — ${formatAed(i.priceFils * i.qty)}`)
    .join('\n')

  const html = `
    <h1>Thanks for your order, ${data.name}!</h1>
    <p>Order <strong>${data.orderId}</strong> is confirmed.</p>
    <pre style="font-family:sans-serif">${itemLines}</pre>
    <p><strong>Total: ${formatAed(data.totalFils)}</strong></p>
    <p>We'll dispatch within 1–3 business days across the UAE.</p>
    <p>Questions? Reply to this email.</p>
  `

  if (!resend) {
    console.log('[email stub] Order confirmation:', data.orderId, data.email)
    return { ok: true, stub: true }
  }

  const { error } = await resend.emails.send({
    from,
    to: data.email,
    replyTo,
    subject: `Tee Tribe order confirmed — ${data.orderId}`,
    html,
  })

  if (error) {
    console.error('[email] Order confirmation failed:', error)
    return { ok: false }
  }
  return { ok: true }
}

export type QuoteEmailData = {
  quoteId: string
  name: string
  email: string
  phone?: string
  company?: string
  quantity?: number
  productInterest?: string
  notes?: string
}

export async function sendQuoteNotification(data: QuoteEmailData): Promise<{ ok: boolean; stub?: boolean }> {
  const notifyEmail = process.env.QUOTE_NOTIFY_EMAIL || 'info@redreach.ae'

  const html = `
    <h1>New Tribe Made quote request</h1>
    <p><strong>ID:</strong> ${data.quoteId}</p>
    <p><strong>Name:</strong> ${data.name}</p>
    <p><strong>Email:</strong> ${data.email}</p>
    ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
    ${data.company ? `<p><strong>Company:</strong> ${data.company}</p>` : ''}
    ${data.quantity ? `<p><strong>Quantity:</strong> ${data.quantity}</p>` : ''}
    ${data.productInterest ? `<p><strong>Product:</strong> ${data.productInterest}</p>` : ''}
    ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
  `

  if (!getResend()) {
    console.log('[email stub] Quote notification:', data.quoteId, notifyEmail)
    return { ok: true, stub: true }
  }

  const { error } = await getResend()!.emails.send({
    from,
    to: notifyEmail,
    replyTo: data.email,
    subject: `Tribe Made quote — ${data.name} (${data.quoteId})`,
    html,
  })

  if (error) {
    console.error('[email] Quote notification failed:', error)
    return { ok: false }
  }
  return { ok: true }
}

export type MemberWelcomeData = {
  email: string
  name?: string
  discountCode: string
}

export async function sendMemberWelcome(data: MemberWelcomeData): Promise<{ ok: boolean; stub?: boolean }> {
  const html = `
    <h1>Welcome to the Tribe${data.name ? `, ${data.name}` : ''}!</h1>
    <p>Your first-order discount code:</p>
    <p style="font-size:24px;font-weight:bold">${data.discountCode}</p>
    <p>10% off your first order. Use it at checkout.</p>
  `

  if (!getResend()) {
    console.log('[email stub] Member welcome:', data.email, data.discountCode)
    return { ok: true, stub: true }
  }

  const { error } = await getResend()!.emails.send({
    from,
    to: data.email,
    replyTo,
    subject: 'Welcome to Tee Tribe — 10% off inside',
    html,
  })

  if (error) {
    console.error('[email] Member welcome failed:', error)
    return { ok: false }
  }
  return { ok: true }
}
