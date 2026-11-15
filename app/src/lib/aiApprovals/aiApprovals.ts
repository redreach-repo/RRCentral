/**
 * AI approval queue (docs/modules/ai-approval-queue.md): pure helpers.
 * The database (rr_ai_proposal_payload_problem) is the real check; this
 * mirrors it so the edit form can say what is wrong before saving.
 */

export type AiProposalAction = 'add_timeline_note' | 'update_account_fields'
export type AiProposalStatus = 'pending' | 'executed' | 'rejected' | 'cancelled' | 'failed'
export type AiDecision = 'approve' | 'reject' | 'cancel'

export type AiProposal = {
  id: string
  account_id: string
  action: AiProposalAction
  payload: Record<string, string>
  original_payload: Record<string, string> | null
  summary: string
  rationale: string
  prompt: string
  model: string
  cost_usd: number
  status: AiProposalStatus
  proposed_by_email: string
  decided_by_email: string
  decided_at: string | null
  decision_note: string
  error: string
  created_at: string
  accounts?: { name: string } | null
}

export const NOTE_KINDS = ['note', 'call', 'email', 'meeting'] as const
export const ACCOUNT_FIELDS = ['industry', 'country', 'city', 'website', 'notes'] as const

/** '' when the payload is fine for the action, else the reason. */
export function payloadProblem(action: string, payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'payload must be an object'
  const keys = Object.keys(payload)
  if (action === 'add_timeline_note') {
    const bad = keys.find((k) => k !== 'kind' && k !== 'body')
    if (bad) return `unknown field ${bad}`
    if (!(NOTE_KINDS as readonly string[]).includes(String(payload.kind))) return 'kind must be note, call, email or meeting'
    if (typeof payload.body !== 'string' || !payload.body.trim()) return 'body is required'
    if (payload.body.length > 4000) return 'body is longer than 4000 characters'
    return ''
  }
  if (action === 'update_account_fields') {
    if (!keys.length) return 'no fields to change'
    for (const k of keys) {
      if (!(ACCOUNT_FIELDS as readonly string[]).includes(k)) return `field ${k} cannot be changed by an AI proposal`
      if (typeof payload[k] !== 'string') return `${k} must be text`
      if ((payload[k] as string).length > 2000) return `${k} is longer than 2000 characters`
    }
    return ''
  }
  return `unknown action ${action || '(none)'}`
}

/** Plain lines describing what approving will do. */
export function describeProposal(action: AiProposalAction, payload: Record<string, string>): string[] {
  if (action === 'add_timeline_note') {
    return [`Add a ${payload.kind || 'note'} to the timeline:`, payload.body || '']
  }
  return ACCOUNT_FIELDS.filter((f) => f in payload).map((f) => `Set ${f} to “${payload[f]}”`)
}

/** Drops empty account fields from an edited payload (an empty field means "leave as is"). */
export function cleanEditedPayload(action: AiProposalAction, payload: Record<string, string>): Record<string, string> {
  if (action === 'add_timeline_note') return { kind: payload.kind || 'note', body: (payload.body || '').trim() }
  const out: Record<string, string> = {}
  for (const f of ACCOUNT_FIELDS) {
    const v = (payload[f] ?? '').trim()
    if (v) out[f] = v
  }
  return out
}

export function isEdited(original: Record<string, string>, edited: Record<string, string>): boolean {
  const a = Object.keys(original).sort()
  const b = Object.keys(edited).sort()
  return a.length !== b.length || a.some((k, i) => k !== b[i] || original[k] !== edited[k])
}

export function statusTone(s: AiProposalStatus): 'neutral' | 'good' | 'bad' {
  if (s === 'executed') return 'good'
  if (s === 'failed' || s === 'rejected') return 'bad'
  return 'neutral'
}
