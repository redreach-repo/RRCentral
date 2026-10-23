import type {
  Account,
  AccountActivity,
  AccountActivityKind,
  AccountContact,
  AccountType,
  UserRole,
} from './types'

/**
 * Account types. `code` is the vertical code used in the account reference
 * (`AC-[code]-[YY][seq]`). Accounts use their own `AC` prefix so they never
 * share a number with RR- quotations or invoices.
 */
export const ACCOUNT_TYPES: {
  value: AccountType
  label: string
  plural: string
  code: string
  statuses: string[]
}[] = [
  {
    value: 'ai_crm_client',
    label: 'AI CRM client',
    plural: 'AI CRM clients',
    code: '07',
    statuses: ['onboarding', 'active', 'paused', 'ended', 'prospect'],
  },
  {
    value: 'worship_church',
    label: 'WorshipHub church',
    plural: 'WorshipHub churches',
    code: '08',
    statuses: ['trial', 'active', 'paused', 'ended'],
  },
  {
    value: 'ctrm_prospect',
    label: 'CTRM Next prospect',
    plural: 'CTRM Next prospects',
    code: '09',
    statuses: ['active', 'won', 'lost'],
  },
]

export const ACCOUNT_REFERENCE_PREFIX = 'AC'

export const ACTIVITY_KINDS: { value: AccountActivityKind; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'system', label: 'System' },
]

export function accountTypeInfo(type: string) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[0]
}

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type
}

export function accountStatusLabel(status: string): string {
  const s = String(status || '').trim()
  if (!s) return 'Not set'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function activityKindLabel(kind: string): string {
  return ACTIVITY_KINDS.find((k) => k.value === kind)?.label ?? kind
}

/** Next free account reference for a type, e.g. AC-07-26003. Same shape as generateReference(). */
export function nextAccountReference(
  type: AccountType,
  existingRefs: string[],
  now: Date = new Date(),
): string {
  const code = accountTypeInfo(type).code
  const yy = String(now.getFullYear()).slice(-2)
  const head = `${ACCOUNT_REFERENCE_PREFIX}-${code}-${yy}`
  let max = 0
  for (const ref of existingRefs) {
    const m = String(ref || '').match(new RegExp(`^${head}(\\d{3})`))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${head}${String(max + 1).padStart(3, '0')}`
}

/**
 * Accounts this person may see. RLS enforces the same rule in the cloud;
 * this keeps local mode and the UI honest.
 */
export function visibleAccounts<T extends Pick<Account, 'owner_user_id'>>(
  accounts: T[],
  role: UserRole,
  appUserId: string | null,
): T[] {
  if (role !== 'staff') return accounts
  if (!appUserId) return []
  return accounts.filter((a) => a.owner_user_id === appUserId)
}

export function canEditAccount(
  account: Pick<Account, 'owner_user_id'>,
  role: UserRole,
  appUserId: string | null,
): boolean {
  if (role === 'viewer') return false
  if (role === 'staff') return Boolean(appUserId) && account.owner_user_id === appUserId
  return true
}

/** Primary contact first, then by name. */
export function sortContacts(contacts: AccountContact[]): AccountContact[] {
  return [...contacts].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/** Newest first. */
export function sortTimeline(items: AccountActivity[]): AccountActivity[] {
  return [...items].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

const COMPANY_SUFFIXES = new Set([
  'the',
  'llc',
  'fze',
  'fzco',
  'fz',
  'fzc',
  'co',
  'company',
  'ltd',
  'limited',
  'est',
  'establishment',
  'trading',
  'inc',
  'plc',
  'llp',
  'dmcc',
])

/**
 * Same rule as rr_normalize_company_name() in SQL: lower case, letters and
 * digits only, legal suffixes dropped. "Al Noor Trading L.L.C." becomes "al noor".
 */
export function normalizeCompanyName(raw: string): string {
  const words = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\bl l c\b/g, 'llc')
    .split(' ')
    .filter((w) => w && !COMPANY_SUFFIXES.has(w))
  return words.join(' ')
}

export function sameCompany(a: string, b: string): boolean {
  const na = normalizeCompanyName(a)
  return na !== '' && na === normalizeCompanyName(b)
}

/** Money documents for an account: linked by id, or (not yet linked) by matching name. */
export function documentsForAccount<T extends { client: string; account_id?: string | null }>(
  account: Pick<Account, 'id' | 'name'>,
  docs: T[],
): { linked: T[]; suggested: T[] } {
  const linked: T[] = []
  const suggested: T[] = []
  for (const d of docs) {
    if (d.account_id === account.id) linked.push(d)
    else if (!d.account_id && sameCompany(d.client, account.name)) suggested.push(d)
  }
  return { linked, suggested }
}
