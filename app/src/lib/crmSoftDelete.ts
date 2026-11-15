/** Soft-delete helpers for CRM follow-up rows. */

import { db } from './db'
import { isMissingRelationError } from './errors'

function check(res: { error: { message?: string } | null }) {
  if (res.error) throw res.error
}

export async function softDeleteCrmEntry(id: string): Promise<void> {
  const { error } = await db
    .from('crm')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    if (isMissingRelationError(error)) throw new Error('CRM soft-delete column missing — apply migrations')
    throw error
  }
}

export async function restoreCrmEntry(id: string): Promise<void> {
  check(
    await db
      .from('crm')
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', id),
  )
}
