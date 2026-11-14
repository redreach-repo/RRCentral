import { getSupabaseClient } from '../supabaseConfig'
import type { AiDecision, AiProposal, AiProposalStatus } from './aiApprovals'

const COLUMNS =
  'id, account_id, action, payload, original_payload, summary, rationale, prompt, model, cost_usd, status, proposed_by_email, decided_by_email, decided_at, decision_note, error, created_at, accounts(name)'

/** True when the error says the table or function is not in the database yet. */
export function isMissingSetup(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message || '')
}

export async function listAiProposals(status: AiProposalStatus | 'all'): Promise<{ rows: AiProposal[]; missing: boolean; error: string }> {
  let q = getSupabaseClient().from('ai_action_proposals').select(COLUMNS).order('created_at', { ascending: false }).limit(200)
  if (status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  if (error) return { rows: [], missing: isMissingSetup(error), error: error.message }
  return { rows: (data || []) as unknown as AiProposal[], missing: false, error: '' }
}

export async function searchAccounts(term: string): Promise<{ id: string; name: string }[]> {
  const t = term.trim()
  if (t.length < 2) return []
  const { data } = await getSupabaseClient()
    .from('accounts')
    .select('id, name')
    .ilike('name', `%${t.replace(/[%_]/g, '')}%`)
    .order('name')
    .limit(10)
  return (data || []) as { id: string; name: string }[]
}

export async function requestAiProposals(accountId: string, instruction: string): Promise<{ count: number; error: string }> {
  const { data, error } = await getSupabaseClient().functions.invoke('hm-ai-propose', {
    body: { account_id: accountId, instruction },
  })
  if (error) {
    let detail = error.message
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) detail = body.error
    } catch {
      /* keep the generic message */
    }
    return { count: 0, error: detail }
  }
  return { count: Array.isArray(data?.proposals) ? data.proposals.length : 0, error: data?.error || '' }
}

export async function decideAiProposal(
  id: string,
  decision: AiDecision,
  payload: Record<string, string> | null,
  note: string,
): Promise<{ proposal: AiProposal | null; error: string }> {
  const { data, error } = await getSupabaseClient().rpc('rr_ai_proposal_decide', {
    p_id: id,
    p_decision: decision,
    p_payload: payload,
    p_note: note,
  })
  if (error) return { proposal: null, error: error.message }
  return { proposal: data as AiProposal, error: '' }
}
