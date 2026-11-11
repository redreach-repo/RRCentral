import { db } from './db'
import type { AiInput, AskQuoteDraft, ProposedRequirement } from './aiAssist'
import { isMissingRelationError } from './errors'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { AiUsageLog } from './types'

export type AiResult = {
  text: string
  requirements: ProposedRequirement[]
  questions: string[]
  quoteDraft: AskQuoteDraft | null
  costUsd: number
}

export const AI_LOCAL_MODE = 'AI help works once RR Central is connected to Supabase.'

function asQuoteDraft(raw: unknown): AskQuoteDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const client = String(d.client || '').trim()
  const items = Array.isArray(d.items) ? d.items : []
  if (!client || !items.length) return null
  return {
    client,
    division_code: String(d.division_code || '01').trim() || '01',
    description: String(d.description || '').trim(),
    notes: String(d.notes || '').trim(),
    items: items
      .map((row) => {
        const r = (row || {}) as Record<string, unknown>
        return {
          description: String(r.description || '').trim(),
          qty: Number(r.qty) || 0,
          unit_price: Number(r.unit_price) || 0,
        }
      })
      .filter((i) => i.description && i.qty > 0),
  }
}

async function invokeAi(body: { account_id: string | null; input: AiInput }): Promise<AiResult> {
  if (!isSupabaseConfigured()) throw new Error(AI_LOCAL_MODE)
  const { data, error } = await getSupabaseClient().functions.invoke('ai-assist', { body })
  if (error) {
    let message = 'AI help is not available right now. Please try again.'
    try {
      const errBody = await (error as { context?: Response }).context?.json()
      if (errBody?.error) message = String(errBody.error)
    } catch {
      // keep the plain message
    }
    throw new Error(message)
  }
  const d = (data || {}) as Partial<AiResult> & { quoteDraft?: unknown }
  return {
    text: String(d.text || ''),
    requirements: Array.isArray(d.requirements) ? d.requirements : [],
    questions: Array.isArray(d.questions) ? d.questions.map(String) : [],
    quoteDraft: asQuoteDraft(d.quoteDraft),
    costUsd: Number(d.costUsd) || 0,
  }
}

/** Asks the ai-assist function. It checks the person may edit the account and logs the cost there. */
export async function runAi(accountId: string, input: AiInput): Promise<AiResult> {
  return invokeAi({ account_id: accountId, input })
}

/** Read-only Ask RR over a CRM snapshot the signed-in person already loaded. */
export async function runCrmAsk(input: Extract<AiInput, { feature: 'crm_ask' }>): Promise<AiResult> {
  return invokeAi({ account_id: null, input })
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
