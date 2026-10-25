/**
 * Duplicate finder (Wave 4, PR T): accounts and contacts that look like the
 * same one, by phone, email, website or a similar name. A manager or admin
 * merges a pair on the Duplicates page (rr_merge_accounts and
 * rr_merge_contacts in the database move everything, timeline included, to
 * the one kept) or marks it "Not a duplicate".
 */
import { normalizePhone } from './whatsapp'
import type { Account, AccountContact } from './types'

/** Last 9 digits of a phone, so 050 123 4567 and +971 50 123 4567 match. Empty when fewer than 7 digits were typed. */
export function phoneKey(raw: string | null | undefined, countryCode = '971'): string {
  const s = String(raw || '')
  if (s.replace(/\D/g, '').replace(/^0+/, '').length < 7) return ''
  return normalizePhone(s, countryCode).slice(-9)
}

export function emailKey(raw: string | null | undefined): string {
  const e = String(raw || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''
}

/** A website's bare domain: https://www.acme.ae/about and acme.ae match. */
export function domainKey(raw: string | null | undefined): string {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return ''
  const host = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '')
  return host.includes('.') ? host : ''
}

const SUFFIXES = /\b(llc|fze|fzco|fz llc|fz-llc|ltd|limited|inc|co|company|est|establishment|trading|group|the|dmcc)\b/g

/** A company or person name without case, punctuation or company suffixes. */
export function nameKey(raw: string | null | undefined): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\./g, '')
    .replace(/[^a-z0-9؀-ۿ ]+/g, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  const t = s.replace(/\s+/g, ' ')
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

/** How alike two names are, 0 to 1 (Dice on letter pairs, after nameKey). */
export function nameSimilarity(a: string, b: string): number {
  const x = nameKey(a)
  const y = nameKey(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return 0
  const bx = bigrams(x)
  const by = bigrams(y)
  let common = 0
  for (const [g, n] of bx) common += Math.min(n, by.get(g) ?? 0)
  const total = [...bx.values()].reduce((s, n) => s + n, 0) + [...by.values()].reduce((s, n) => s + n, 0)
  return total ? Math.round(((2 * common) / total) * 100) / 100 : 0
}

/** Names this alike count as a possible duplicate. */
export const NAME_MATCH = 0.85

export type DuplicateKind = 'account' | 'contact'
export type DuplicatePair = { kind: DuplicateKind; a: string; b: string; score: number; reasons: string[] }

/** The pair's key, smaller id first, as duplicate_dismissals stores it. */
export function pairIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}
export const pairKey = (kind: DuplicateKind, a: string, b: string) => `${kind}|${pairIds(a, b).join('|')}`

type AccountLite = Pick<Account, 'id' | 'name' | 'type' | 'website'>
type ContactLite = Pick<AccountContact, 'id' | 'account_id' | 'name' | 'email' | 'phone' | 'whatsapp'>

function addReason(map: Map<string, DuplicatePair>, kind: DuplicateKind, a: string, b: string, score: number, reason: string) {
  if (a === b) return
  const [x, y] = pairIds(a, b)
  const k = `${x}|${y}`
  const p = map.get(k) ?? { kind, a: x, b: y, score: 0, reasons: [] }
  if (!p.reasons.includes(reason)) p.reasons.push(reason)
  p.score = Math.max(p.score, score)
  map.set(k, p)
}

function byKey<T>(rows: T[], key: (r: T) => string[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    for (const k of new Set(key(r).filter(Boolean))) {
      const list = m.get(k) ?? []
      list.push(r)
      m.set(k, list)
    }
  }
  return m
}

const sorted = (pairs: DuplicatePair[], dismissed: Set<string>) =>
  pairs.filter((p) => !dismissed.has(pairKey(p.kind, p.a, p.b))).sort((x, y) => y.score - x.score || x.a.localeCompare(y.a))

/**
 * Accounts that look like the same company: a contact phone or email on both,
 * the same website, or (for accounts of the same type) a name at least 85% alike.
 */
export function findAccountDuplicates(
  accounts: AccountLite[],
  contacts: ContactLite[],
  dismissed: Set<string> = new Set(),
  countryCode = '971',
): DuplicatePair[] {
  const pairs = new Map<string, DuplicatePair>()
  const known = new Set(accounts.map((a) => a.id))
  const live = contacts.filter((c) => known.has(c.account_id))
  for (const [k, list] of byKey(live, (c) => [phoneKey(c.phone, countryCode), phoneKey(c.whatsapp, countryCode)])) {
    const ids = [...new Set(list.map((c) => c.account_id))]
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) addReason(pairs, 'account', ids[i], ids[j], 1, `Same phone (…${k.slice(-4)})`)
  }
  for (const [k, list] of byKey(live, (c) => [emailKey(c.email)])) {
    const ids = [...new Set(list.map((c) => c.account_id))]
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) addReason(pairs, 'account', ids[i], ids[j], 1, `Same email (${k})`)
  }
  for (const [k, list] of byKey(accounts, (a) => [domainKey(a.website)])) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) addReason(pairs, 'account', list[i].id, list[j].id, 0.95, `Same website (${k})`)
  }
  const keyed = accounts.map((a) => ({ a, k: nameKey(a.name) })).filter((x) => x.k)
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      if (keyed[i].a.type !== keyed[j].a.type) continue
      const s = nameSimilarity(keyed[i].a.name, keyed[j].a.name)
      if (s >= NAME_MATCH) addReason(pairs, 'account', keyed[i].a.id, keyed[j].a.id, s, s === 1 ? 'Same name' : `Similar name (${Math.round(s * 100)}%)`)
    }
  }
  return sorted([...pairs.values()], dismissed)
}

/** Contacts that look like the same person: the same phone or email anywhere, or the same name on one account. */
export function findContactDuplicates(contacts: ContactLite[], dismissed: Set<string> = new Set(), countryCode = '971'): DuplicatePair[] {
  const pairs = new Map<string, DuplicatePair>()
  const each = (list: ContactLite[], score: number, reason: string) => {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) addReason(pairs, 'contact', list[i].id, list[j].id, score, reason)
  }
  for (const [k, list] of byKey(contacts, (c) => [phoneKey(c.phone, countryCode), phoneKey(c.whatsapp, countryCode)])) each(list, 1, `Same phone (…${k.slice(-4)})`)
  for (const [k, list] of byKey(contacts, (c) => [emailKey(c.email)])) each(list, 1, `Same email (${k})`)
  for (const [, list] of byKey(contacts, (c) => [nameKey(c.name) ? `${c.account_id}|${nameKey(c.name)}` : ''])) each(list, 0.9, 'Same name on the account')
  return sorted([...pairs.values()], dismissed)
}

const ACCOUNT_FILL: (keyof Account)[] = ['industry', 'country', 'city', 'website', 'source']

/** What the kept account gains from the duplicate: blank details that get filled. */
export function accountFills(keep: Account, dup: Account): { field: string; value: string }[] {
  const label: Record<string, string> = { industry: 'Industry', country: 'Country', city: 'City', website: 'Website', source: 'Source' }
  return ACCOUNT_FILL.filter((f) => !String(keep[f] ?? '').trim() && String(dup[f] ?? '').trim()).map((f) => ({
    field: label[f as string],
    value: String(dup[f]),
  }))
}

/** Which of the two to keep by default: the one with more on it, then the older one. */
export function suggestKeep<T extends { id: string; created_at: string }>(a: T, b: T, weight: (x: T) => number): T {
  const wa = weight(a)
  const wb = weight(b)
  if (wa !== wb) return wa > wb ? a : b
  return a.created_at <= b.created_at ? a : b
}

/** The merge result from the database as one sentence. */
export function mergeSummary(result: { moved?: Record<string, number>; left?: Record<string, number>; removed?: string }): string {
  const nice = (t: string) => t.replace(/^public\./, '').replace(/_/g, ' ')
  const moved = Object.entries(result.moved ?? {}).map(([t, n]) => `${n} ${nice(t)}`)
  const left = Object.entries(result.left ?? {}).map(([t, n]) => `${n} ${nice(t)}`)
  return (
    `Merged ${result.removed ?? 'the duplicate'}. Moved ${moved.length ? moved.join(', ') : 'nothing'}.` +
    (left.length ? ` Not moved (already there on the kept one): ${left.join(', ')}.` : '')
  )
}
