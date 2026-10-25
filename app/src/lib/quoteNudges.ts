import { differenceInCalendarDays, parseISO } from 'date-fns'
import { DIVISIONS } from './config'
import { applyMessageTemplate } from './templates'
import type { Quotation, SalesDeal } from './types'

/**
 * Follow up templates and the "quote sent, no reply in 3 days" nudge.
 *
 * Templates have merge fields ({{name}}, {{account}}, {{quote_number}},
 * {{amount}}, {{link}}, {{company}}) and are kept per division and channel
 * (WhatsApp or email) in message_templates. A division's own template wins,
 * then one for every division, then the built in wording below.
 *
 * A quote is nudged when it has been Sent (or an AI CRM deal has sat at
 * Quote sent) for 3 days with no follow up since. Sending the follow up from
 * the nudge counts as the follow up, so the next nudge comes 3 days later.
 * Shared by the app and the daily digest (bundled). Only pure modules here.
 */

export const NUDGE_DAYS = 3

export type TemplateChannel = 'whatsapp' | 'email'
export type TemplatePurpose = 'quote_followup' | 'general'

export const TEMPLATE_CHANNELS: { value: TemplateChannel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
]

export const TEMPLATE_PURPOSES: { value: TemplatePurpose; label: string }[] = [
  { value: 'quote_followup', label: 'Quote follow up' },
  { value: 'general', label: 'General' },
]

export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Contact name' },
  { key: 'account', label: 'Client company' },
  { key: 'quote_number', label: 'Quote number' },
  { key: 'amount', label: 'Quote amount' },
  { key: 'link', label: 'Link (when there is one)' },
  { key: 'company', label: 'Our company name' },
]

export type MessageTemplate = {
  id: string
  name: string
  /** A division code ('01'...'07'), or '' for every division. */
  division_code: string
  channel: TemplateChannel
  purpose: TemplatePurpose
  subject: string
  body: string
  active: boolean
}

/** AI CRM deals are not a quotation division; their templates use this code. */
export const AI_CRM_DIVISION = '07'

export const DIVISION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Every division' },
  ...DIVISIONS.map((d) => ({ value: d.code, label: `${d.code} ${d.brand}` })),
  { value: AI_CRM_DIVISION, label: '07 AI CRM' },
]

export const BUILT_IN_FOLLOWUP: Record<TemplateChannel, { subject: string; body: string }> = {
  whatsapp: {
    subject: '',
    body: 'Hello {{name}},\n\nJust checking in on our quote {{quote_number}} for {{account}} ({{amount}}). Do you have any questions, or shall we go ahead?\n{{link}}\n\nThank you,\n{{company}}',
  },
  email: {
    subject: 'Quote {{quote_number}} for {{account}}',
    body: 'Dear {{name}},\n\nI hope you are well. I am following up on our quote {{quote_number}} for {{account}} ({{amount}}).\n\nPlease let me know if you have any questions, or if you would like to go ahead.\n{{link}}\n\nBest regards,\n{{company}}',
  },
}

/** The template to use: the division's own, then one for every division, then the built in one. */
export function pickTemplate(
  templates: MessageTemplate[],
  opts: { division: string; channel: TemplateChannel; purpose: TemplatePurpose },
): { id: string | null; name: string; subject: string; body: string } {
  const usable = templates.filter((t) => t.active && t.channel === opts.channel && t.purpose === opts.purpose)
  const own = usable.find((t) => t.division_code === opts.division)
  const all = usable.find((t) => t.division_code === '')
  const t = own ?? all
  if (t) return { id: t.id, name: t.name, subject: t.subject, body: t.body }
  const built = BUILT_IN_FOLLOWUP[opts.channel]
  return { id: null, name: 'Built in', subject: built.subject, body: built.body }
}

export type MergeValues = { name: string; account: string; quote_number: string; amount: string; link: string; company: string }

/** Fills the merge fields. A line that only holds an empty field (such as no link) is dropped. */
export function renderTemplate(t: { subject: string; body: string }, values: MergeValues): { subject: string; body: string } {
  const vars: Record<string, string> = { ...values, name: values.name.trim() || 'there' }
  const field = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  const kept = String(t.body || '')
    .split('\n')
    .filter((line) => {
      const keys = [...line.matchAll(field)].map((m) => m[1])
      if (!keys.length || line.replace(field, '').trim()) return true
      return keys.some((k) => String(vars[k] || '').trim())
    })
    .join('\n')
  return {
    subject: applyMessageTemplate(t.subject, vars).trim(),
    body: applyMessageTemplate(kept, vars).replace(/\n{3,}/g, '\n\n').trim(),
  }
}

/** Fields a template uses that are not merge fields, such as {{nmae}}. */
export function unknownFields(text: string): string[] {
  const known = new Set(MERGE_FIELDS.map((f) => f.key))
  const found = [...String(text || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(found.filter((k) => !known.has(k)))]
}

export function templateProblem(t: Pick<MessageTemplate, 'name' | 'channel' | 'subject' | 'body'>): string | null {
  if (!t.name.trim()) return 'Give the template a name'
  if (!t.body.trim()) return 'Write the message'
  if (t.channel === 'email' && !t.subject.trim()) return 'Give the email a subject'
  const bad = unknownFields(`${t.subject}\n${t.body}`)
  if (bad.length) return `Unknown merge field ${bad.map((b) => `{{${b}}}`).join(', ')}. Use ${MERGE_FIELDS.map((f) => `{{${f.key}}}`).join(', ')}`
  return null
}

export function formatQuoteAmount(amount: number, currency: string): string {
  return `${currency || 'AED'} ${(Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ---------------------------------------------------------------------------
// The nudge
// ---------------------------------------------------------------------------

export type NudgeQuote = Pick<Quotation, 'id' | 'client' | 'reference_number' | 'division_code' | 'amount' | 'status'> & {
  account_id?: string | null
  quotation_currency?: string
  sent_at?: string | null
  followed_up_at?: string | null
}

export type NudgeDeal = Pick<SalesDeal, 'id' | 'account_id' | 'stage' | 'quote_reference' | 'monthly_fee' | 'last_touch_at'> & {
  quote_sent_at?: string | null
}

export type QuoteNudge = {
  key: string
  kind: 'quote' | 'sales_deal'
  id: string
  account_id: string | null
  account: string
  division: string
  quote_number: string
  amount: string
  /** Whole days since the quote went out or was last followed up. */
  days: number
  path: string
}

const latest = (...isos: (string | null | undefined)[]) =>
  isos.filter((v): v is string => Boolean(v)).sort().pop() || ''

/** Quotes and AI CRM deals waiting for a reply for NUDGE_DAYS or more, longest first. */
export function quoteNudges(input: {
  quotes: NudgeQuote[]
  deals: NudgeDeal[]
  accountNames: Map<string, string>
  now: Date
}): QuoteNudge[] {
  const out: QuoteNudge[] = []
  for (const q of input.quotes) {
    if (q.status !== 'Sent' || !q.sent_at) continue
    const since = latest(q.sent_at, q.followed_up_at)
    const days = differenceInCalendarDays(input.now, parseISO(since))
    if (days < NUDGE_DAYS) continue
    out.push({
      key: `quote:${q.id}`,
      kind: 'quote',
      id: q.id,
      account_id: q.account_id ?? null,
      account: q.client || (q.account_id ? input.accountNames.get(q.account_id) ?? '' : ''),
      division: q.division_code,
      quote_number: q.reference_number,
      amount: formatQuoteAmount(q.amount, q.quotation_currency || 'AED'),
      days,
      path: `/document/quote/${q.id}`,
    })
  }
  for (const d of input.deals) {
    if (d.stage !== 'quote_sent') continue
    const since = latest(d.quote_sent_at, d.last_touch_at)
    if (!since) continue
    const days = differenceInCalendarDays(input.now, parseISO(since))
    if (days < NUDGE_DAYS) continue
    out.push({
      key: `deal:${d.id}`,
      kind: 'sales_deal',
      id: d.id,
      account_id: d.account_id,
      account: input.accountNames.get(d.account_id) ?? 'AI CRM prospect',
      division: AI_CRM_DIVISION,
      quote_number: d.quote_reference || 'AI CRM quote',
      amount: `${formatQuoteAmount(d.monthly_fee, 'AED')} a month`,
      days,
      path: `/accounts/${d.account_id}`,
    })
  }
  return out.sort((a, b) => b.days - a.days || a.account.localeCompare(b.account))
}

/** Who edits templates, and who sees and sends the nudges. */
export function canEditTemplates(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager'
}

export function canSendNudges(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'sales'
}
