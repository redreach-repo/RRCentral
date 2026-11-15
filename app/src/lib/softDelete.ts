/** Soft-delete helpers for list screens (deleted_at column). */

export type SoftDeletable = { deleted_at?: string | null }

export function isSoftDeleted(row: SoftDeletable): boolean {
  return Boolean(row.deleted_at)
}

export function withoutSoftDeleted<T extends SoftDeletable>(rows: T[]): T[] {
  return rows.filter((r) => !isSoftDeleted(r))
}
