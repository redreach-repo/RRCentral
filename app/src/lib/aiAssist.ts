/**
 * AI help inside RR Central: summarise a ticket thread, draft a reply, write
 * the monthly report summary, and turn call notes into requirements.
 *
 * Shared by the app and the ai-assist Edge Function (bundled by
 * app/scripts/build-support-function.mjs), so the prompts, the model and the
 * cost sum live in one place. Every call is logged against the account in
 * ai_usage_log, and that cost counts in the client's profitability.
 * Only pure code here.
 */

/** The model for every feature: fast and cheap enough to use on every ticket. */
export const AI_MODEL = 'claude-haiku-5-5'

/**
 * Claude Haiku 5.5 prices in USD per million tokens. Prompts above 100K
 * tokens cost more; inputs are capped well below that, but the sum still
 * follows the price list.
 */
export const AI_PRICES = {
  inputPerM: 0.1,
  outputPerM: 0.5,
  longInputPerM: 0.5,
  longOutputPerM: 2.5,
  longFromTokens: 100_000,
} as const

/** Longest text sent in one request. Long threads keep the first message and the latest ones. */
export const AI_MAX_INPUT_CHARS = 60_000

export type AiFeature = 'ticket_summary' | 'ticket_reply' | 'report_summary' | 'call_notes'

export const AI_FEATURES: { value: AiFeature; label: string }[] = [
  { value: 'ticket_summary', label: 'Ticket summary' },
  { value: 'ticket_reply', label: 'Reply draft' },
  { value: 'report_summary', label: 'Report summary' },
  { value: 'call_notes', label: 'Requirements from call notes' },
]

export function isAiFeature(v: unknown): v is AiFeature {
  return AI_FEATURES.some((f) => f.value === v)
}

export type AiThreadMessage = { who: string; when: string; body: string; internal: boolean }

export type AiInput =
  | { feature: 'ticket_summary'; accountName: string; subject: string; messages: AiThreadMessage[] }
  | {
      feature: 'ticket_reply'
      accountName: string
      subject: string
      messages: AiThreadMessage[]
      companyName: string
      signOff: string
    }
  | { feature: 'report_summary'; accountName: string; monthLabel: string; facts: string[] }
  | { feature: 'call_notes'; accountName: string; notes: string; existing: string[] }

export type AiRequest = {
  system: string
  user: string
  maxTokens: number
  /** JSON schema for structured output, when the answer is data rather than text. */
  schema: Record<string, unknown> | null
}

export type AiUsage = { input_tokens?: number | null; output_tokens?: number | null }

/** What one call cost, in USD, from the token counts the API returns. */
export function aiCostUsd(usage: AiUsage): number {
  const input = Math.max(0, Number(usage.input_tokens) || 0)
  const output = Math.max(0, Number(usage.output_tokens) || 0)
  const long = input > AI_PRICES.longFromTokens
  const cost =
    (input * (long ? AI_PRICES.longInputPerM : AI_PRICES.inputPerM) +
      output * (long ? AI_PRICES.longOutputPerM : AI_PRICES.outputPerM)) /
    1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

const STYLE =
  'Write in plain, friendly UK English for a business in the UAE. Short sentences. ' +
  'Do not use em dashes or en dashes; use commas or full stops instead. No markdown headings, no bold.'

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[cut for length]`
}

/**
 * The thread as plain text. When it is too long, keeps the first message
 * (the original ask) and as many of the latest as fit.
 */
export function threadText(messages: AiThreadMessage[], max = AI_MAX_INPUT_CHARS): string {
  const blocks = messages.map(
    (m) => `${m.internal ? 'INTERNAL NOTE' : 'MESSAGE'} from ${m.who || 'someone'} on ${m.when}:\n${clip(m.body.trim(), max / 2)}`,
  )
  const all = blocks.join('\n\n')
  if (all.length <= max || blocks.length < 2) return clip(all, max)
  const first = blocks[0]
  const kept: string[] = []
  let size = first.length
  for (let i = blocks.length - 1; i > 0; i--) {
    if (size + blocks[i].length + 40 > max) break
    kept.unshift(blocks[i])
    size += blocks[i].length + 2
  }
  const skipped = blocks.length - 1 - kept.length
  return [first, `[${skipped} earlier ${skipped === 1 ? 'message' : 'messages'} left out]`, ...kept].join('\n\n')
}

export const REQUIREMENTS_SCHEMA = {
  type: 'object',
  properties: {
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['title', 'detail'],
        additionalProperties: false,
      },
    },
  },
  required: ['requirements'],
  additionalProperties: false,
} as const

export function buildAiRequest(input: AiInput): AiRequest {
  switch (input.feature) {
    case 'ticket_summary':
      return {
        system:
          'You help the support team at Red Reach, which builds and runs AI CRM systems for clients. ' +
          'Summarise a support ticket so a colleague can pick it up in under a minute. ' +
          'Give: what the client wants, what has been done or promised so far, and what is still open, ' +
          'with who owes the next step. Use 3 to 6 short bullet points starting with "- ". ' +
          'Only use facts from the thread. ' +
          STYLE,
        user: `Client: ${input.accountName}\nSubject: ${input.subject}\n\n${threadText(input.messages)}`,
        maxTokens: 1000,
        schema: null,
      }
    case 'ticket_reply':
      return {
        system:
          `You draft replies for the support team at ${input.companyName || 'Red Reach'}, which builds and runs AI CRM systems for clients. ` +
          'Write the next reply to the client, ready to send by email or WhatsApp after a human checks it. ' +
          'Answer what the client last asked. Do not promise dates, prices or features that are not in the thread; ' +
          'where something needs checking, say the team will confirm. Internal notes are for context only: ' +
          'never quote them or reveal internal details to the client. ' +
          `Start with a greeting using the client's first name if known. End with "${input.signOff || 'Kind regards'}" on its own line and nothing after it. ` +
          'Reply with the message text only. ' +
          STYLE,
        user: `Client: ${input.accountName}\nSubject: ${input.subject}\n\n${threadText(input.messages)}`,
        maxTokens: 1500,
        schema: null,
      }
    case 'report_summary':
      return {
        system:
          'You write the opening summary of a monthly client report for Red Reach, which builds and runs AI CRM systems. ' +
          'Turn the numbers into one or two short paragraphs (80 to 140 words in all) addressed to the client. ' +
          'Say what was done, how support went and where usage stands against the plan, then what comes next. ' +
          'Use only the facts given and keep every number exactly as given. If usage is above plan, say so plainly ' +
          'and without alarm. ' +
          STYLE,
        user: `Client: ${input.accountName}\nMonth: ${input.monthLabel}\n\nFacts:\n${input.facts.map((f) => `- ${f}`).join('\n')}`,
        maxTokens: 800,
        schema: null,
      }
    case 'call_notes':
      return {
        system:
          'You turn notes from a call with a client into requirements for their AI CRM build at Red Reach. ' +
          'Each requirement is one thing the client wants the system to do or have. ' +
          'Title: a short action, at most 10 words (for example "Send a WhatsApp reminder the day before each appointment"). ' +
          'Detail: one or two sentences with the specifics from the notes, or an empty string. ' +
          'Leave out small talk, pricing and anything already in the existing list. ' +
          'Return an empty list if the notes contain no requirements. ' +
          STYLE,
        user:
          `Client: ${input.accountName}\n\n` +
          (input.existing.length ? `Already listed:\n${input.existing.map((t) => `- ${t}`).join('\n')}\n\n` : '') +
          `Call notes:\n${clip(input.notes, AI_MAX_INPUT_CHARS)}`,
        maxTokens: 3000,
        schema: REQUIREMENTS_SCHEMA as unknown as Record<string, unknown>,
      }
  }  throw new Error('Unknown AI feature')
}

export type ProposedRequirement = { title: string; detail: string }

/** Reads the call notes answer. Anything malformed becomes an empty list rather than an error. */
export function parseRequirements(text: string): ProposedRequirement[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const list = (data as { requirements?: unknown })?.requirements
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: ProposedRequirement[] = []
  for (const item of list) {
    const title = String((item as { title?: unknown })?.title ?? '').trim().slice(0, 200)
    const detail = String((item as { detail?: unknown })?.detail ?? '').trim().slice(0, 2000)
    const key = title.toLowerCase()
    if (!title || seen.has(key)) continue
    seen.add(key)
    out.push({ title, detail })
  }
  return out
}

/** Swaps any dash the model still used for a comma, as house style asks. */
export function tidyAiText(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .trim()
}

export type AiUsageRow = { account_id: string; cost_usd: number | string; created_at: string }

/** RR Central AI spend on one account in one month (`YYYY-MM`), USD. */
export function assistCostInMonth(rows: AiUsageRow[], accountId: string, month: string): number {
  const total = rows
    .filter((r) => r.account_id === accountId && r.created_at.slice(0, 7) === month.slice(0, 7))
    .reduce((s, r) => s + (Number(r.cost_usd) || 0), 0)
  return Math.round(total * 10_000) / 10_000
}

/** The first name from a sign off such as "Alfred, Red Reach". */
export function signOffFor(name: string, companyName: string): string {
  const first = name.trim().split(/\s+/)[0] || ''
  const company = companyName.replace(/\s+(Middle East\s+)?(FZE|FZ-LLC|LLC|Ltd)\.?$/i, '').trim() || 'Red Reach'
  return first ? `Kind regards,\n${first}, ${company}` : `Kind regards,\n${company}`
}

export type ReportFactsInput = {
  hours: number
  targetHours: number | null
  hoursByWork: { label: string; hours: number }[]
  ticketsResolved: number
  ticketsOpened: number
  answered: number
  answeredOnTime: number
  whatsappUsed: number | null
  whatsappIncluded: number | null
  aboveAed: number | null
  buildDone: number
  buildTotal: number
  buildCurrent: string
  comingNext: string[]
}

/** The monthly report numbers as short facts for the summary prompt. */
export function reportFacts(r: ReportFactsInput): string[] {
  const aed = (n: number) => `AED ${n.toLocaleString('en-AE', { maximumFractionDigits: 2 })}`
  const facts: string[] = []
  facts.push(
    `${r.hours} hours worked${r.targetHours ? ` against a monthly target of ${r.targetHours} hours` : ''}` +
      (r.hoursByWork.length ? ` (${r.hoursByWork.map((h) => `${h.label.toLowerCase()} ${h.hours}h`).join(', ')})` : ''),
  )
  facts.push(
    `${r.ticketsResolved} support ${r.ticketsResolved === 1 ? 'request' : 'requests'} resolved and ${r.ticketsOpened} opened` +
      (r.answered ? `; ${r.answeredOnTime} of ${r.answered} answered within the agreed response time` : ''),
  )
  if (r.whatsappUsed == null) {
    facts.push('No usage recorded for the month yet')
  } else {
    facts.push(
      `${r.whatsappUsed.toLocaleString('en-AE')} WhatsApp conversations` +
        (r.whatsappIncluded ? ` out of ${r.whatsappIncluded.toLocaleString('en-AE')} included in the plan` : ''),
    )
    if (r.aboveAed != null) {
      facts.push(r.aboveAed > 0 ? `Usage above the plan: ${aed(r.aboveAed)} excluding VAT` : 'Usage stayed within the plan')
    }
  }
  facts.push(
    r.buildDone >= r.buildTotal
      ? 'The system is live'
      : `Build: ${r.buildDone} of ${r.buildTotal} stages done, current stage ${r.buildCurrent}`,
  )
  if (r.comingNext.length) facts.push(`Planned next month: ${r.comingNext.join('; ')}`)
  return facts
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const strList = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, maxItems).map((x) => x.slice(0, maxLen)) : []

/**
 * Checks what the app sent before anything goes to the model: known feature,
 * plain strings only, and sizes kept in bounds. Returns null when unusable.
 */
export function normaliseAiInput(raw: unknown): AiInput | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const accountName = str(r.accountName, 200)
  switch (r.feature) {
    case 'ticket_summary':
    case 'ticket_reply': {
      const messages = (Array.isArray(r.messages) ? r.messages : []).slice(-200).map((m) => {
        const o = (m ?? {}) as Record<string, unknown>
        return { who: str(o.who, 120), when: str(o.when, 40), body: str(o.body, AI_MAX_INPUT_CHARS), internal: o.internal === true }
      })
      if (!messages.some((m) => m.body.trim())) return null
      const subject = str(r.subject, 300)
      return r.feature === 'ticket_summary'
        ? { feature: 'ticket_summary', accountName, subject, messages }
        : {
            feature: 'ticket_reply',
            accountName,
            subject,
            messages,
            companyName: str(r.companyName, 120),
            signOff: str(r.signOff, 200),
          }
    }
    case 'report_summary': {
      const facts = strList(r.facts, 30, 600).filter((f) => f.trim())
      if (!facts.length) return null
      return { feature: 'report_summary', accountName, monthLabel: str(r.monthLabel, 40), facts }
    }
    case 'call_notes': {
      const notes = str(r.notes, AI_MAX_INPUT_CHARS)
      if (!notes.trim()) return null
      return { feature: 'call_notes', accountName, notes, existing: strList(r.existing, 200, 200) }
    }
    default:
      return null
  }
}
