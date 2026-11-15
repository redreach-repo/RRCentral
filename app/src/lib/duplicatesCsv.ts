/** Duplicate pair CSV column map — export review list; import merge/dismiss actions. */

import type { ColumnMap } from './listIo'

export const DUPLICATES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'kind', label: 'kind', required: true },
  { key: 'keep_id', label: 'keep_id', required: true },
  { key: 'dup_id', label: 'dup_id', required: true },
  { key: 'keep_label', label: 'keep_label' },
  { key: 'dup_label', label: 'dup_label' },
  { key: 'reasons', label: 'reasons' },
  /** merge | dismiss — blank rows are skipped on import (safe re-import of export). */
  { key: 'action', label: 'action' },
]

export const DUPLICATES_CSV_HEADERS = DUPLICATES_CSV_COLUMNS.map((c) => c.key)

export type DuplicateCsvAction = 'merge' | 'dismiss'

export function parseDuplicateCsvAction(raw: string): DuplicateCsvAction | null {
  const a = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (a === 'merge') return 'merge'
  if (a === 'dismiss' || a === 'not_a_duplicate' || a === 'not_duplicate') return 'dismiss'
  return null
}
