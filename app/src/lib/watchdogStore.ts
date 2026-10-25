import { db } from './db'
import { isMissingRelationError } from './errors'
import type { WatchRow } from './watchdog'

/** Open watchdog items this user may see (RLS: staff only get their own). Empty until the SQL is run. */
export async function listOpenWatchItems(): Promise<WatchRow[]> {
  const { data, error } = await db.from('watch_items').select('*').is('cleared_at', null)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as WatchRow[]
}
