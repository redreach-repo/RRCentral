import { db } from './db'
import { logActivity } from './activity'
import type { CrmEntry } from './types'

/** Map quote status → suggested CRM pipeline stage. */
export function stageForQuoteStatus(status: string): string | null {
  switch (status) {
    case 'Finalized':
    case 'Sent':
      return 'Quoted'
    case 'Awarded':
      return 'Won'
    case 'Not awarded':
    case 'Expired':
      return 'Lost'
    default:
      return null
  }
}

const OPEN_STAGES = new Set(['Lead', 'Contacted', 'Quoted', 'Negotiation', ''])

/** Whether we should advance CRM stage based on current stage + target. */
export function shouldAdvanceStage(current: string, target: string): boolean {
  const cur = current || 'Lead'
  if (cur === target) return false
  if (target === 'Won' || target === 'Lost') return true
  if (target === 'Quoted') return OPEN_STAGES.has(cur) && cur !== 'Quoted' && cur !== 'Negotiation'
  return false
}

export async function findCrmByCompany(company: string): Promise<CrmEntry | null> {
  const name = company.trim()
  if (!name) return null
  const { data, error } = await db.from('crm').select('*').ilike('company_name', name).limit(5)
  if (error || !data?.length) return null
  const rows = data as CrmEntry[]
  const exact = rows.find((r) => r.company_name.trim().toLowerCase() === name.toLowerCase())
  return exact || rows[0] || null
}

export type SyncCrmFromQuoteOpts = {
  client: string
  quoteRef?: string | null
  quoteStatus: string
  outcomeReason?: string | null
  userEmail?: string
}

/**
 * Best-effort: when a quote is finalized / awarded / lost, update matching CRM
 * company (quote_ref + pipeline stage + optional outcome_reason).
 */
export async function syncCrmFromQuote(opts: SyncCrmFromQuoteOpts): Promise<{
  updated: boolean
  crmId?: string
}> {
  const crm = await findCrmByCompany(opts.client)
  if (!crm) return { updated: false }

  const targetStage = stageForQuoteStatus(opts.quoteStatus)
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (opts.userEmail) patch.updated_by = opts.userEmail

  const ref = (opts.quoteRef || '').trim()
  if (ref) patch.quote_ref = ref

  let stageChanged = false
  if (targetStage && shouldAdvanceStage(crm.pipeline_stage || 'Lead', targetStage)) {
    patch.pipeline_stage = targetStage
    stageChanged = true
  }

  const reason = (opts.outcomeReason || '').trim()
  if (reason && (targetStage === 'Won' || targetStage === 'Lost' || opts.quoteStatus === 'Awarded' || opts.quoteStatus === 'Not awarded')) {
    patch.outcome_reason = reason
  }

  const meaningful =
    patch.quote_ref !== undefined ||
    stageChanged ||
    patch.outcome_reason !== undefined
  if (!meaningful) return { updated: false, crmId: crm.id }

  const { error } = await db.from('crm').update(patch).eq('id', crm.id)
  if (error) {
    console.error('CRM sync failed:', error.message)
    return { updated: false, crmId: crm.id }
  }

  await logActivity(
    'sync_crm_from_quote',
    'crm',
    crm.company_name,
    `${opts.quoteStatus}${ref ? ` · ${ref}` : ''}${stageChanged ? ` → ${targetStage}` : ''}`,
    opts.userEmail || '',
    crm.id,
  )

  return { updated: true, crmId: crm.id }
}
