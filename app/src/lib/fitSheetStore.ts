import { db } from './db'
import { isMissingRelationError } from './errors'
import { logAccountEvent } from './accountsStore'
import { fitSheetMissing, fitSheetStageProblem, stageNeedsFitSheet, type FitSheetDraft } from './fitSheet'
import type { CtrmFitSheet, CtrmStage } from './types'

type Author = { appUserId: string | null; email: string }

export async function loadFitSheet(accountId: string): Promise<CtrmFitSheet | null> {
  const { data, error } = await db.from('ctrm_fit_sheets').select('*').eq('account_id', accountId)
  if (error) {
    if (isMissingRelationError(error)) return null
    throw error
  }
  const row = ((data || []) as CtrmFitSheet[])[0]
  return row ? { ...row, modules: Array.isArray(row.modules) ? row.modules : [] } : null
}

export async function saveFitSheet(accountId: string, existing: CtrmFitSheet | null, draft: FitSheetDraft, author: Author): Promise<void> {
  const now = new Date().toISOString()
  const values = {
    commodities: draft.commodities.trim(),
    focus: draft.focus,
    user_count: draft.user_count,
    current_system: draft.current_system.trim(),
    decision_maker_id: draft.decision_maker_id,
    modules: draft.modules,
    notes: draft.notes.trim(),
    updated_by: author.email,
    updated_at: now,
  }
  const { error } = existing
    ? await db.from('ctrm_fit_sheets').update(values).eq('id', existing.id)
    : await db.from('ctrm_fit_sheets').insert({ id: crypto.randomUUID(), account_id: accountId, created_at: now, ...values })
  if (error) {
    if (isMissingRelationError(error)) throw new Error('Run the fit sheet SQL first.')
    throw error
  }
  if (!existing) await logAccountEvent(accountId, 'Fit sheet started', author)
}

/** Throws the rule in words when this stage move needs a fit sheet that is not ready. */
export async function checkFitSheetForStage(accountId: string, from: CtrmStage | '', to: CtrmStage): Promise<void> {
  if (!stageNeedsFitSheet(from, to)) return
  const missing = fitSheetMissing(await loadFitSheet(accountId))
  if (missing.length) throw new Error(fitSheetStageProblem(missing))
}
