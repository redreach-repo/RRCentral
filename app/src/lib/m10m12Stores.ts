/**
 * Stores for M10–M12 deepen (marketing segments/recipients, knowledge docs,
 * app identities, workspace provision invoke).
 */
import { db } from './db'
import { isMissingRelationError } from './errors'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import {
  canQueueRecipient,
  normalizeConsentSource,
  recipientStatusForQueue,
  type MarketingSegmentFilter,
} from './marketingConsent'
import {
  BUILTIN_BUSINESS_TYPE_PACKS,
  buildIdempotencyKey,
  provisionRequestProblem,
  type BusinessTypePack,
} from './workspaceProvision'
import { PRODUCT } from './product'

export type MarketingSegment = {
  id: string
  name: string
  description: string
  filter_json: MarketingSegmentFilter
}

export async function listMarketingSegments(): Promise<MarketingSegment[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('marketing_segments')
    .select('id, name, description, filter_json')
    .order('name')
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as MarketingSegment[]
}

export async function createMarketingSegment(input: {
  name: string
  description?: string
  filter?: MarketingSegmentFilter
}): Promise<void> {
  const { error } = await db.from('marketing_segments').insert({
    name: input.name.trim(),
    description: input.description || '',
    filter_json: input.filter || { opt_in_only: true },
  })
  if (error) throw error
}

export async function setContactMarketingConsent(input: {
  contactId: string
  optIn: boolean
  source?: string
}): Promise<void> {
  const { error } = await db
    .from('account_contacts')
    .update({
      marketing_opt_in: input.optIn,
      marketing_opt_in_at: input.optIn ? new Date().toISOString() : null,
      marketing_opt_in_source: normalizeConsentSource(input.source || 'manual'),
    })
    .eq('id', input.contactId)
  if (error) throw error
}

export async function queueCampaignRecipients(input: {
  campaignId: string
  contacts: Array<{ id: string; email?: string | null; marketing_opt_in: boolean }>
}): Promise<{ queued: number; skipped: number }> {
  let queued = 0
  let skipped = 0
  for (const c of input.contacts) {
    const gate = canQueueRecipient({
      marketing_opt_in: c.marketing_opt_in,
      email: c.email,
    })
    const status = recipientStatusForQueue(gate.ok, gate.reason)
    const { error } = await db.from('marketing_campaign_recipients').upsert(
      {
        campaign_id: input.campaignId,
        contact_id: c.id,
        status,
        skip_reason: gate.reason,
      },
      { onConflict: 'campaign_id,contact_id' },
    )
    if (error) {
      if (isMissingRelationError(error)) throw error
      continue
    }
    if (status === 'queued') queued += 1
    else skipped += 1
  }
  return { queued, skipped }
}

/** Local dry-run: mark queued recipients as dry_run_sent — never calls an ESP. */
export async function dryRunCampaignSend(campaignId: string): Promise<{ sent: number; skipped: number }> {
  const { dryRunEligible, dryRunResultStatus, summarizeDryRun } = await import('./marketingDryRun')
  const { data, error } = await db
    .from('marketing_campaign_recipients')
    .select('id, status, account_contacts(email)')
    .eq('campaign_id', campaignId)
  if (error) throw error
  type RecipientJoin = { id: string; status: string; account_contacts?: { email?: string } | null }
  const rows = ((data || []) as RecipientJoin[]).map((r) => ({
    id: r.id,
    status: r.status,
    email: r.account_contacts?.email || '',
  }))
  const summary = summarizeDryRun(rows)
  const eligibleIds = rows
    .filter((r: { status: string; email: string }) => dryRunEligible(r.status) && String(r.email).includes('@'))
    .map((r: { id: string }) => r.id)
  if (eligibleIds.length) {
    const { error: uErr } = await db
      .from('marketing_campaign_recipients')
      .update({ status: dryRunResultStatus(), skip_reason: 'dry_run_local' })
      .in('id', eligibleIds)
    if (uErr) throw uErr
  }
  return summary
}

export async function listAiKnowledgeDocs(): Promise<Array<{ id: string; title: string; body: string; source: string }>> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('ai_knowledge_docs')
    .select('id, title, body, source')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return data || []
}

export async function createAiKnowledgeDoc(input: { title: string; body: string }): Promise<void> {
  const { error } = await db.from('ai_knowledge_docs').insert({
    title: input.title.trim(),
    body: input.body.trim(),
    source: 'manual',
  })
  if (error) throw error
}

export async function listBusinessTypePacks(): Promise<BusinessTypePack[]> {
  if (!isSupabaseConfigured()) return BUILTIN_BUSINESS_TYPE_PACKS
  const { data, error } = await db
    .from('business_type_packs')
    .select('business_type, pack_key, label, description')
    .order('business_type')
  if (error) {
    if (isMissingRelationError(error)) return BUILTIN_BUSINESS_TYPE_PACKS
    throw error
  }
  return data?.length ? (data as BusinessTypePack[]) : BUILTIN_BUSINESS_TYPE_PACKS
}

export async function requestWorkspaceProvision(input: {
  workspaceName: string
  adminEmail: string
  businessType: string
  provisionSecret?: string
}): Promise<{ ok: boolean; pack_key?: string; detail?: string; idempotent?: boolean }> {
  const problem = provisionRequestProblem(input)
  if (problem) throw new Error(problem)
  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      pack_key: BUILTIN_BUSINESS_TYPE_PACKS.find((b) => b.business_type === input.businessType)?.pack_key,
      detail: `Local mode: recorded intent only (${PRODUCT.name}).`,
      idempotent: false,
    }
  }
  const key = buildIdempotencyKey(input)
  const headers: Record<string, string> = {}
  if (input.provisionSecret) headers['x-provision-secret'] = input.provisionSecret
  const { data, error } = await getSupabaseClient().functions.invoke('hm-provision-workspace', {
    body: {
      idempotency_key: key,
      workspace_name: input.workspaceName,
      admin_email: input.adminEmail,
      business_type: input.businessType,
    },
    headers,
  })
  if (error) {
    let message = 'Provision request failed'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) message = String(b.error)
    } catch {
      /* keep */
    }
    throw new Error(message)
  }
  return data as { ok: boolean; pack_key?: string; detail?: string; idempotent?: boolean }
}

export async function upsertTenantAppIdentity(input: {
  hostSlug: string
  displayName: string
  shortName: string
  primaryColor?: string
  companyId?: string | null
}): Promise<void> {
  const { error } = await db.from('tenant_app_identities').upsert(
    {
      host_slug: input.hostSlug.trim().toLowerCase(),
      display_name: input.displayName.trim(),
      short_name: input.shortName.trim(),
      primary_color: input.primaryColor || '#c8321a',
      company_id: input.companyId || null,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'host_slug' },
  )
  if (error) throw error
}
