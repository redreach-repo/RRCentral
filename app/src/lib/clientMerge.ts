/**
 * Merging duplicate client records (HighMast brief fix 4, PR 3). The database
 * does the merge (rr_client_merge in 20261341090000_client_merge.sql); this
 * file holds the pure parts: the company key, the suggested groups and the
 * preview shape the Merge clients tab shows.
 */
import { nameSimilarity } from './duplicates'

/** Same rules as rr_company_key() in the database. */
export function companyKey(raw: string | null | undefined): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(l l c s p|l l c|s p c|s p)\b/g, ' ')
    .replace(/\bready ?mix\b/g, 'readymix')
    .replace(/\b(the|llc|llcsp|spc|sp|fze|fzco|fz|fzc|co|company|ltd|limited|est|establishment|trading|inc|plc|llp|dmcc|group)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** TRN digits only, or '' when too short to trust. */
export function trnKey(raw: string | null | undefined): string {
  const d = String(raw || '').replace(/\D/g, '')
  return d.length >= 6 ? d : ''
}

export type MergeCandidate = { id: string; company_name: string; trn: string; email: string; created_at?: string | null }
export type MergeGroup = { ids: string[]; names: string[]; reasons: string[] }

function sameCompany(a: MergeCandidate, b: MergeCandidate): string | null {
  const ta = trnKey(a.trn)
  if (ta && ta === trnKey(b.trn)) return 'Same TRN'
  const ka = companyKey(a.company_name)
  const kb = companyKey(b.company_name)
  if (!ka || !kb) return null
  if (ka === kb) return 'Same name'
  // "Sharjah Readymix" and "Sharjah Readymix Concrete": one name starts the other.
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka]
  if (short.includes(' ') && long.startsWith(short + ' ')) return 'Name starts the same'
  if (nameSimilarity(ka, kb) >= 0.9) return 'Very similar name'
  return null
}

/**
 * Clients that look like one company, grouped (a joins b joins c), oldest
 * first. Only groups of two or more are returned.
 */
export function suggestMergeGroups(list: MergeCandidate[]): MergeGroup[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x) ?? x
    if (p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  const why = new Map<string, Set<string>>()
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const r = sameCompany(list[i], list[j])
      if (!r) continue
      const a = find(list[i].id)
      const b = find(list[j].id)
      const root = a < b ? a : b
      parent.set(a, root)
      parent.set(b, root)
      const s = new Set([...(why.get(a) ?? []), ...(why.get(b) ?? []), r])
      why.set(root, s)
    }
  }
  const groups = new Map<string, MergeCandidate[]>()
  for (const c of list) {
    const r = find(c.id)
    groups.set(r, [...(groups.get(r) ?? []), c])
  }
  return [...groups.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([root, g]) => {
      const sorted = [...g].sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')))
      return { ids: sorted.map((c) => c.id), names: sorted.map((c) => c.company_name), reasons: [...(why.get(root) ?? [])] }
    })
    .sort((a, b) => a.names[0].localeCompare(b.names[0]))
}

export type PreviewRecord = {
  id: string
  company_name: string
  short_name?: string
  trn?: string
  email?: string
  address?: string
  account_reference?: string | null
  account_name?: string | null
  created_at?: string
  keep: boolean
}
export type PreviewField = { field: string; values: { client_id: string; value: unknown }[] }
export type MergePreview = {
  survivor_id: string
  duplicate_ids: string[]
  records: PreviewRecord[]
  moves: Record<string, number>
  unlinked: Record<string, { id: string; label: string; typed: string }[]>
  fields: PreviewField[]
  contacts: { name?: string; email?: string; phone?: string }[]
}

export const FIELD_LABELS: Record<string, string> = {
  company_name: 'Legal name',
  short_name: 'Short name',
  trn: 'TRN',
  address: 'Address',
  primary_contact: 'Main contact',
  email: 'Email',
  mobile: 'Mobile',
  office: 'Office phone',
  website: 'Website',
  company_owner: 'Owner',
  notes: 'Notes',
  account_id: 'Account',
  drive_folder_url: 'Drive folder',
}

export const MOVE_LABELS: Record<string, string> = {
  quotations: 'Quotes',
  invoices: 'Invoices',
  delivery_notes: 'Delivery notes',
  customer_payments: 'Payments',
  crm: 'Deals',
  tickets: 'Tickets',
  website_inquiries: 'Website enquiries',
  client_purchase_orders: 'Client POs',
  client_uniform_staff: 'Uniform staff',
}

/** "3 quotes, 1 client PO" style lines for the preview. */
export function moveLines(moves: Record<string, number>): string[] {
  return Object.entries(moves)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${MOVE_LABELS[t] ?? t}: ${n}`)
}

export function unlinkedCount(unlinked: MergePreview['unlinked']): number {
  return Object.values(unlinked || {}).reduce((s, rows) => s + rows.length, 0)
}

/** Default pick per differing field: the kept client's value when it has one. */
export function defaultPicks(p: MergePreview): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of p.fields) {
    const own = f.values.find((v) => v.client_id === p.survivor_id)
    out[f.field] = own ? own.client_id : f.values[0]?.client_id
  }
  return out
}

/** Show a field value from the preview (account ids show the account reference). */
export function fieldText(p: MergePreview, field: string, value: unknown, clientId: string): string {
  if (field === 'account_id') {
    const r = p.records.find((x) => x.id === clientId)
    return [r?.account_reference, r?.account_name].filter(Boolean).join(' · ') || String(value ?? '')
  }
  return String(value ?? '')
}

export const CONFIRM_WORD = 'MERGE'
export const confirmOk = (typed: string) => typed.trim().toUpperCase() === CONFIRM_WORD
