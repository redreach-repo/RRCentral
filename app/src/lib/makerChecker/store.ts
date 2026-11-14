import { db } from '../db'
import { isMissingRelationError } from '../errors'
import type { ApprovalPolicy, ApprovalRequest } from './makerChecker'

export type Loaded<T> = { rows: T[]; missingTable: boolean }

export async function listApprovalRequests(): Promise<Loaded<ApprovalRequest>> {
  const { data, error } = await db.from('approval_requests').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as ApprovalRequest[], missingTable: false }
}

export async function listApprovalPolicies(): Promise<Loaded<ApprovalPolicy>> {
  const { data, error } = await db.from('approval_policies').select('*').order('action_key')
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as ApprovalPolicy[], missingTable: false }
}

/** Raise a request. Maker and status are set by the database. */
export async function raiseApprovalRequest(input: {
  action_key: string
  summary: string
  amount?: number | null
  entity_type?: string
  entity_id?: string
  payload?: Record<string, unknown>
}): Promise<ApprovalRequest> {
  const { data, error } = await db
    .from('approval_requests')
    .insert({
      action_key: input.action_key,
      summary: input.summary,
      amount: input.amount ?? null,
      entity_type: input.entity_type ?? '',
      entity_id: input.entity_id ?? '',
      payload: input.payload ?? {},
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ApprovalRequest
}

export async function decideApprovalRequest(id: string, approve: boolean, reason: string): Promise<void> {
  const { error } = await db.rpc('rr_approval_decide', { p_id: id, p_approve: approve, p_reason: reason })
  if (error) throw error
}

export async function cancelApprovalRequest(id: string): Promise<void> {
  const { error } = await db.rpc('rr_approval_cancel', { p_id: id })
  if (error) throw error
}

export async function saveApprovalPolicy(p: Omit<ApprovalPolicy, 'id'> & { id?: string }): Promise<void> {
  const row = {
    action_key: p.action_key,
    label: p.label,
    min_amount: p.min_amount,
    required: p.required,
    active: p.active,
    updated_at: new Date().toISOString(),
  }
  const { error } = p.id
    ? await db.from('approval_policies').update(row).eq('id', p.id)
    : await db.from('approval_policies').insert(row)
  if (error) throw error
}
