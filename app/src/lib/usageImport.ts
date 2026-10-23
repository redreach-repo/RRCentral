/**
 * Rules for the daily usage import, shared by the app and the usage-import
 * Edge Function (bundled by app/scripts/build-support-function.mjs, so the
 * two never disagree). No imports: the function runs on Deno.
 *
 * WhatsApp: Meta's pricing_analytics on the WhatsApp Business Account,
 * broken down by phone number and pricing category. Marketing messages count
 * as marketing; utility, authentication and service count as service.
 *
 * AI: the Anthropic Admin API cost report grouped by workspace. One
 * workspace per client gives each client's spend.
 */

export type UsageSource = {
  account_id: string
  /** Phone numbers as digits only, e.g. 971501234567. */
  whatsapp_phones: string[]
  ai_workspace_id: string
}

export type WhatsAppCounts = { marketing: number; service: number }

/** Digits only, without a leading 00. */
export function phoneDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '').replace(/^00/, '')
}

/** Phone numbers typed in one box, split on commas, spaces or new lines. */
export function parsePhoneList(raw: string): string[] {
  return [...new Set(String(raw || '').split(/[,;\n]+/).map(phoneDigits).filter((p) => p.length >= 7))]
}

/** `YYYY-MM-01` for a UTC date. */
export function monthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
}

/** Start and end of the month in UTC, with the end capped at `now`. */
export function monthWindow(month: string, now: Date): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const next = new Date(Date.UTC(y, m, 1))
  return { start, end: next.getTime() < now.getTime() ? next : now }
}

/**
 * The months each run refreshes: this month so far, and last month during
 * the first 3 days of a month, while Meta and Anthropic finish reporting it.
 */
export function monthsToImport(now: Date): string[] {
  const current = monthOf(now)
  return now.getUTCDate() <= 3 ? [previousMonth(current), current] : [current]
}

export function isMarketingCategory(category: string): boolean {
  return /MARKETING/i.test(String(category || ''))
}

/** Meta's pricing_analytics (or the older conversation_analytics) as counts per phone. */
export function parseWhatsAppAnalytics(body: unknown): Map<string, WhatsAppCounts> {
  const out = new Map<string, WhatsAppCounts>()
  const root = (body ?? {}) as Record<string, unknown>
  const block = (root.pricing_analytics ?? root.conversation_analytics ?? root) as { data?: unknown }
  const groups = Array.isArray(block.data) ? block.data : []
  for (const g of groups) {
    const points = Array.isArray((g as { data_points?: unknown }).data_points)
      ? ((g as { data_points: unknown[] }).data_points as Record<string, unknown>[])
      : []
    for (const p of points) {
      const phone = phoneDigits(String(p.phone_number ?? ''))
      const count = Number(p.volume ?? p.conversation ?? 0)
      if (!Number.isFinite(count) || count <= 0) continue
      const category = String(p.pricing_category ?? p.conversation_category ?? '')
      const row = out.get(phone) ?? { marketing: 0, service: 0 }
      if (isMarketingCategory(category)) row.marketing += count
      else row.service += count
      out.set(phone, row)
    }
  }
  return out
}

/** Anthropic cost report pages as US dollars per workspace (default workspace under ''). */
export function parseAnthropicCost(pages: unknown[]): Map<string, number> {
  const cents = new Map<string, number>()
  for (const page of pages) {
    const buckets = Array.isArray((page as { data?: unknown })?.data) ? (page as { data: unknown[] }).data : []
    for (const b of buckets) {
      const results = Array.isArray((b as { results?: unknown }).results) ? (b as { results: unknown[] }).results : []
      for (const r of results as Record<string, unknown>[]) {
        if (r.currency && r.currency !== 'USD') continue
        const amount = Number(r.amount)
        if (!Number.isFinite(amount)) continue
        const ws = String(r.workspace_id ?? '')
        cents.set(ws, (cents.get(ws) ?? 0) + amount)
      }
    }
  }
  const usd = new Map<string, number>()
  for (const [ws, c] of cents) usd.set(ws, Math.round(c) / 100)
  return usd
}

export type ExistingUsage = {
  id: string
  account_id: string
  month: string
  updated_at: string | null
  imported_at?: string | null
}

export type UsageUpdate = {
  account_id: string
  month: string
  /** Existing row to update, or null to add one. */
  id: string | null
  fields: Partial<{ whatsapp_marketing_count: number; whatsapp_service_count: number; ai_cost_usd: number }>
}

/** A row someone changed by hand after the last import is left alone. */
export function editedByHand(row: Pick<ExistingUsage, 'updated_at' | 'imported_at'>): boolean {
  if (!row.updated_at) return false
  if (!row.imported_at) return true
  return Date.parse(row.updated_at) - Date.parse(row.imported_at) > 5_000
}

/**
 * What to write for one month. Only the numbers a client has a source for
 * are written; lead credits always stay manual.
 */
export function planUsageUpdates(input: {
  month: string
  sources: UsageSource[]
  existing: ExistingUsage[]
  whatsapp: Map<string, WhatsAppCounts> | null
  ai: Map<string, number> | null
}): { updates: UsageUpdate[]; skipped: string[] } {
  const updates: UsageUpdate[] = []
  const skipped: string[] = []
  for (const s of input.sources) {
    const fields: UsageUpdate['fields'] = {}
    if (input.whatsapp && s.whatsapp_phones.length) {
      let marketing = 0
      let service = 0
      for (const phone of s.whatsapp_phones.map(phoneDigits)) {
        const c = input.whatsapp.get(phone)
        if (c) {
          marketing += c.marketing
          service += c.service
        }
      }
      fields.whatsapp_marketing_count = Math.round(marketing)
      fields.whatsapp_service_count = Math.round(service)
    }
    if (input.ai && s.ai_workspace_id.trim()) {
      fields.ai_cost_usd = Math.round((input.ai.get(s.ai_workspace_id.trim()) ?? 0) * 100) / 100
    }
    if (Object.keys(fields).length === 0) continue
    const row = input.existing.find((r) => r.account_id === s.account_id && String(r.month).slice(0, 10) === input.month)
    if (row && editedByHand(row)) {
      skipped.push(s.account_id)
      continue
    }
    updates.push({ account_id: s.account_id, month: input.month, id: row?.id ?? null, fields })
  }
  return { updates, skipped }
}
