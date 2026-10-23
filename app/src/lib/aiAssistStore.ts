import { db } from './db'
import type { AiInput, ProposedRequirement } from './aiAssist'
import { isMissingRelationError } from './errors'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { AiUsageLog } from './types'

export type AiResult = { text: string; requirements: ProposedRequirement[]; costUsd: number }

export const AI_LOCAL_MODE = 'AI help works once RR Central is connected to Supabase.'

/** Asks the ai-assist function. It checks the person may edit the account and logs the cost there. */
export async function runAi(accountId: string, input: AiInput): Promise<AiResult> {
  if (!isSupabaseConfigured()) throw new Error(AI_LOCAL_MODE)
  const { data, error } = await getSupabaseClient().functions.invoke('ai-assist', { body: { account_id: accountId, input } })
  if (error) {
    let message = 'AI help is not available right now. Please try again.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) message = String(body.error)
    } catch {
      // keep the plain message
    }
    throw new Error(message)
  }
  const d = (data || {}) as Partial<AiResult>
  return { text: String(d.text || ''), requirements: Array.isArray(d.requirements) ? d.requirements : [], costUsd: Number(d.costUsd) || 0 }
}

/** AI use logged on one account, or on every visible account when no id is given, since a date. */
export async function listAiUsage(accountId: string | null, sinceIso: string): Promise<AiUsageLog[]> {
  let q = db.from('ai_usage_log').select('*').gte('created_at', sinceIso)
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as AiUsageLog[]
}
