import { db } from './db'
import { isMissingRelationError } from './errors'
import { logAccountEvent } from './accountsStore'
import type { CtrmClientTerms } from './types'

type Author = { appUserId: string | null; email: string }
export type TermsDraft = Pick<CtrmClientTerms, 'contract_start' | 'renewal_date' | 'notice_days'>

export async function listTerms(accountId?: string): Promise<CtrmClientTerms[]> {
  let q = db.from('ctrm_client_terms').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as CtrmClientTerms[]
}

export async function saveTerms(accountId: string, existing: CtrmClientTerms | null, draft: TermsDraft, author: Author): Promise<void> {
  const now = new Date().toISOString()
  const values = {
    contract_start: draft.contract_start || null,
    renewal_date: draft.renewal_date || null,
    notice_days: Math.round(Number(draft.notice_days) || 0),
    updated_by: author.email,
    updated_at: now,
  }
  const { error } = existing
    ? await db.from('ctrm_client_terms').update(values).eq('id', existing.id)
    : await db.from('ctrm_client_terms').insert({ id: crypto.randomUUID(), account_id: accountId, created_at: now, ...values })
  if (error) {
    if (isMissingRelationError(error)) throw new Error('Run the renewal dates SQL first.')
    throw error
  }
  if (values.renewal_date !== (existing?.renewal_date ?? null)) {
    await logAccountEvent(accountId, values.renewal_date ? `CTRM Next renewal date set to ${values.renewal_date}` : 'CTRM Next renewal date cleared', author)
  }
}
