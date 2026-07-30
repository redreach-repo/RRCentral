import { db } from './db'
import { SEED_QUOTE_TEMPLATES } from './seedTemplates'
import type { QuoteTemplate } from './types'

export type SyncTemplatesResult = { inserted: number; updated: number; total: number }

/** Upsert seed quote templates by name (does not delete custom templates). */
export async function syncSeedTemplates(): Promise<SyncTemplatesResult> {
  const { data, error } = await db.from('quote_templates').select('*')
  if (error) throw error
  const existing = (data || []) as QuoteTemplate[]
  const byName = new Map(existing.map((t) => [t.name.trim().toLowerCase(), t]))

  let inserted = 0
  let updated = 0

  for (const seed of SEED_QUOTE_TEMPLATES) {
    const key = seed.name.trim().toLowerCase()
    const found = byName.get(key)
    const payload = {
      name: seed.name,
      division_code: seed.division_code,
      description: seed.description,
      items_json: seed.items,
    }
    if (found) {
      const { error: err } = await db.from('quote_templates').update(payload).eq('id', found.id)
      if (err) throw err
      updated += 1
    } else {
      const { error: err } = await db.from('quote_templates').insert(payload)
      if (err) throw err
      inserted += 1
    }
  }

  return { inserted, updated, total: SEED_QUOTE_TEMPLATES.length }
}
