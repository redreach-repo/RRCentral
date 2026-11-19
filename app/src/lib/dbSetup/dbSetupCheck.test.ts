import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countDbSetup, migrationUrl, readProbe, sortDbSetup, type DbSetupProbe } from './dbSetupCheck'
import { DB_SETUP_PROBES } from './probes'

const MIGRATIONS = join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations')

describe('database setup probes', () => {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''))

  it('has one row for every migration file', () => {
    const listed = DB_SETUP_PROBES.map((p) => p.migration)
    const missing = files.filter((f) => !listed.includes(f))
    expect(missing, 'Add these migrations to lib/dbSetup/probes.ts').toEqual([])
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed.filter((m) => !files.includes(m))).toEqual([])
  })

  it('probes a table and column that the migration really mentions', () => {
    for (const p of DB_SETUP_PROBES) {
      if (!p.table) continue
      const sql = readFileSync(join(MIGRATIONS, `${p.migration}.sql`), 'utf8').toLowerCase()
      expect(sql, p.migration).toContain(p.table)
      if (p.column) expect(sql, p.migration).toContain(p.column)
    }
  })

  it('keeps the HR permission and A1 updates on hold', () => {
    const held = DB_SETUP_PROBES.filter((p) => p.hold).map((p) => p.migration)
    expect(held).toContain('20261217120000_feature_slices_m6_m12')
    expect(held).toContain('20261320120000_a1_money_server_payroll_ledger')
  })
})

describe('readProbe', () => {
  const probe: DbSetupProbe = { migration: '20261309130000_soft_delete_crm', label: 'soft delete crm', table: 'crm', column: 'deleted_at' }

  it('is done when the select works', () => {
    expect(readProbe(probe, null).state).toBe('done')
  })

  it('is missing for a missing table or column', () => {
    expect(readProbe(probe, { code: '42P01', message: 'relation "public.crm" does not exist' }).state).toBe('missing')
    expect(readProbe(probe, { code: '42703', message: 'column crm.deleted_at does not exist' }).state).toBe('missing')
    expect(readProbe(probe, { code: 'PGRST205', message: "Could not find the table 'public.x' in the schema cache" }).state).toBe('missing')
  })

  it('treats permission denied as present', () => {
    expect(readProbe(probe, { code: '42501', message: 'permission denied for table crm' }).state).toBe('done')
  })

  it('reports other errors as check', () => {
    expect(readProbe(probe, { message: 'Failed to fetch' })).toMatchObject({ state: 'error', reason: 'Failed to fetch' })
  })

  it('cannot see rule-only updates', () => {
    expect(readProbe({ migration: 'x', label: 'x' }, null).state).toBe('unknown')
  })

  it('counts and sorts missing first, oldest first', () => {
    const rows = [
      readProbe({ ...probe, migration: '2' }, null),
      readProbe({ ...probe, migration: '3' }, { code: '42703' }),
      readProbe({ ...probe, migration: '1' }, { code: '42703' }),
    ]
    expect(countDbSetup(rows)).toEqual({ done: 1, missing: 2, unknown: 0, error: 0 })
    expect(sortDbSetup(rows).map((r) => r.probe.migration)).toEqual(['1', '3', '2'])
  })

  it('links to the SQL file on GitHub', () => {
    expect(migrationUrl('abc')).toBe('https://github.com/redreach-repo/RRCentral/blob/main/supabase/migrations/abc.sql')
  })
})
