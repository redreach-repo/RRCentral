import { db } from '../db'
import { readProbe, type DbSetupProbe, type DbSetupResult } from './dbSetupCheck'
import { DB_SETUP_PROBES } from './probes'

/** Read only: a select of zero rows. Never inserts, updates or deletes. */
async function probeOne(probe: DbSetupProbe): Promise<DbSetupResult> {
  if (!probe.table) return readProbe(probe, null)
  try {
    const { error } = await db.from(probe.table).select(probe.column ?? '*').limit(0)
    return readProbe(probe, error)
  } catch (e) {
    return readProbe(probe, e)
  }
}

/** Check every migration, a few at a time so the browser stays quick. */
export async function runDbSetupCheck(probes: DbSetupProbe[] = DB_SETUP_PROBES, batch = 8): Promise<DbSetupResult[]> {
  const out: DbSetupResult[] = []
  for (let i = 0; i < probes.length; i += batch) {
    out.push(...(await Promise.all(probes.slice(i, i + batch).map(probeOne))))
  }
  return out
}
