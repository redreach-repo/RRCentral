import { errorCode, errorMessage, isMissingRelationError, isUndefinedColumnError } from '../errors'

/**
 * Database setup check: for each migration file, look for one table or column
 * it adds. The check is read only (a select of zero rows), so it never changes
 * or reads CRM data. It answers "is this database update on live yet?".
 */

export type DbSetupProbe = {
  /** Migration file name without .sql. */
  migration: string
  /** Short words for the feature. */
  label: string
  /** A table the migration adds (or adds a column to). Missing = cannot check from the app. */
  table?: string
  /** A column the migration adds to `table`. */
  column?: string
  /** Set when this update must not go on live yet, with the reason. */
  hold?: string
}

export type DbSetupState = 'done' | 'missing' | 'unknown' | 'error'

export type DbSetupResult = {
  probe: DbSetupProbe
  state: DbSetupState
  reason: string
}

const REPO_MIGRATIONS = 'https://github.com/redreach-repo/RRCentral/blob/main/supabase/migrations/'

export function migrationUrl(migration: string): string {
  return `${REPO_MIGRATIONS}${migration}.sql`
}

/** Turn the answer of the zero-row select into a state. */
export function readProbe(probe: DbSetupProbe, error: unknown): DbSetupResult {
  if (!probe.table) {
    return { probe, state: 'unknown', reason: 'Changes rules, functions or settings only. The app cannot see it.' }
  }
  if (!error) return { probe, state: 'done', reason: 'On live' }
  if (isMissingRelationError(error)) {
    return { probe, state: 'missing', reason: `Table ${probe.table} is not on live yet` }
  }
  if (isUndefinedColumnError(error)) {
    return { probe, state: 'missing', reason: `Column ${probe.table}.${probe.column ?? ''} is not on live yet` }
  }
  // Permission denied means the table is there, this login just cannot read it.
  if (errorCode(error) === '42501' || /permission denied/i.test(errorMessage(error))) {
    return { probe, state: 'done', reason: 'On live (this login cannot read it)' }
  }
  return { probe, state: 'error', reason: errorMessage(error, 'Could not check') }
}

export type DbSetupCounts = Record<DbSetupState, number>

export function countDbSetup(results: DbSetupResult[]): DbSetupCounts {
  const out: DbSetupCounts = { done: 0, missing: 0, unknown: 0, error: 0 }
  for (const r of results) out[r.state]++
  return out
}

/** Missing first (oldest first, the order to run them), then errors, then the rest. */
export function sortDbSetup(results: DbSetupResult[]): DbSetupResult[] {
  const rank: Record<DbSetupState, number> = { missing: 0, error: 1, unknown: 2, done: 3 }
  return [...results].sort(
    (a, b) => rank[a.state] - rank[b.state] || a.probe.migration.localeCompare(b.probe.migration),
  )
}
