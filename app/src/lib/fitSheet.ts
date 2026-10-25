/**
 * Prospect fit sheet (Wave 5, PR V): one sheet per CTRM Next account with
 * what they trade, the focus, how many users, the system they use now, the
 * decision maker, modules of interest and notes. Relationship facts only:
 * never trades, positions or prices, and no commission. A deal cannot move
 * to Demo done or later until the sheet is filled in (the database checks
 * the same rule, rr_ctrm_demo_needs_fit_sheet).
 */
import type { CtrmFitFocus, CtrmFitSheet, CtrmStage } from './types'

export const FIT_FOCUS: { value: CtrmFitFocus; label: string }[] = [
  { value: 'trading', label: 'Trading' },
  { value: 'operations', label: 'Operations' },
  { value: 'both', label: 'Trading and operations' },
]
export const focusLabel = (f: string) => FIT_FOCUS.find((o) => o.value === f)?.label ?? ''

/** app_settings key for the modules list (one per line). */
export const FIT_MODULES_SETTING = 'ctrmFitModules'
export const DEFAULT_FIT_MODULES = [
  'Trade capture',
  'Risk and exposure',
  'Physical operations and scheduling',
  'Inventory',
  'Invoicing and settlement',
  'Credit',
  'Hedging',
  'Reporting',
]

/** A settings list kept as one item per line; the default when it is empty. */
export function parseSettingsList(raw: string | undefined, fallback: string[]): string[] {
  const items = String(raw || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length ? [...new Set(items)] : fallback
}

export const FIT_SHEET_NOTE = 'Relationship facts only. Never paste trades, positions, prices or anything from the client’s own system.'

export type FitSheetDraft = Pick<CtrmFitSheet, 'commodities' | 'focus' | 'user_count' | 'current_system' | 'decision_maker_id' | 'modules' | 'notes'>

export const emptyFitSheet = (): FitSheetDraft => ({
  commodities: '',
  focus: '',
  user_count: null,
  current_system: '',
  decision_maker_id: null,
  modules: [],
  notes: '',
})

/** What is still missing before a demo, in words. Empty when ready. */
export function fitSheetMissing(s: Partial<FitSheetDraft> | null | undefined): string[] {
  const out: string[] = []
  if (!String(s?.commodities ?? '').trim()) out.push('what they trade')
  if (!s?.focus) out.push('the focus')
  if (s?.user_count === null || s?.user_count === undefined || Number.isNaN(Number(s.user_count))) out.push('the number of users')
  if (!String(s?.current_system ?? '').trim()) out.push('the current system')
  return out
}

export const isFitSheetReady = (s: Partial<FitSheetDraft> | null | undefined) => fitSheetMissing(s).length === 0

const EARLY: CtrmStage[] = ['identified', 'contacted', 'intro_call_booked']

/** True when moving a deal from `from` (empty for a new deal) to `to` needs a ready fit sheet. */
export function stageNeedsFitSheet(from: CtrmStage | '' | null | undefined, to: CtrmStage): boolean {
  if (EARLY.includes(to) || to === 'lost') return false
  return !from || EARLY.includes(from)
}

export function fitSheetStageProblem(missing: string[]): string {
  return `Fill in the fit sheet before the demo: ${missing.join(', ')}.`
}

/** A form value for the users box: a whole number, or null when blank. */
export function parseUserCount(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Math.round(Number(t))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100000) : null
}

/** The rows of the one page PDF, in order. No commission and nothing from deals. */
export function fitSheetRows(s: FitSheetDraft, decisionMaker: string): { label: string; value: string }[] {
  return [
    { label: 'Commodities and products', value: s.commodities.trim() },
    { label: 'Focus', value: focusLabel(s.focus) },
    { label: 'Number of users', value: s.user_count === null ? '' : String(s.user_count) },
    { label: 'Current system', value: s.current_system.trim() },
    { label: 'Decision maker', value: decisionMaker },
    { label: 'Modules of interest', value: s.modules.join(', ') },
    { label: 'Notes', value: s.notes.trim() },
  ].map((r) => ({ ...r, value: r.value || 'Not recorded' }))
}

/** Public wording for CTRM Next on anything a client sees (no prices or fees). */
export const CTRM_NEXT_PUBLIC = 'CTRM Next is a commodity trading and risk management platform focused on oil and refined products.'
