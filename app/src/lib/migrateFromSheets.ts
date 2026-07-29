import { authMode } from './db'
import { importMigrationDump, localDb, type MigrationDump } from './localDb'

/** Bump when bundled migration-data.json is cleaned so browsers re-import. */
const FLAG = 'rrcentral_sheets_import_version'

function storedImportVersion(): number {
  const raw = localStorage.getItem(FLAG)
  if (raw == null || raw === '') return 0
  // legacy flag from v1
  if (raw === '1') return 1
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function dumpVersion(dump: MigrationDump & { cleanVersion?: number; version?: number }): number {
  return Number(dump.cleanVersion || dump.version || 1)
}

function rememberImportVersion(version: number) {
  localStorage.setItem(FLAG, String(version))
  // clear legacy key if present
  localStorage.removeItem('rrcentral_sheets_import_v1')
}

export async function tryAutoImportSheetsDump(): Promise<{
  imported: boolean
  counts?: Record<string, number>
  error?: string
}> {
  if (authMode !== 'local') return { imported: false }
  if (typeof window === 'undefined') return { imported: false }

  try {
    const url = `${import.meta.env.BASE_URL}migration-data.json`
    const res = await fetch(url)
    if (!res.ok) return { imported: false, error: `Dump HTTP ${res.status}` }
    const dump = (await res.json()) as MigrationDump & { cleanVersion?: number }
    const remoteVersion = dumpVersion(dump)
    const localVersion = storedImportVersion()

    const { data: existing } = await localDb.from('crm').select('id').limit(1)
    const hasCrm = Array.isArray(existing) ? existing.length > 0 : Boolean(existing)

    // Re-import when a newer cleaned dump ships, or when local CRM is empty
    if (hasCrm && localVersion >= remoteVersion) {
      return { imported: false }
    }

    const hasData =
      (dump.crm && dump.crm.length > 0) ||
      (dump.quotations && dump.quotations.length > 0) ||
      (dump.invoices && dump.invoices.length > 0) ||
      (dump.expenses && dump.expenses.length > 0)
    if (!hasData) return { imported: false }

    const counts = await importMigrationDump(dump)
    rememberImportVersion(remoteVersion)
    return { imported: true, counts }
  } catch (e) {
    return {
      imported: false,
      error: e instanceof Error ? e.message : 'Import failed',
    }
  }
}

export async function importSheetsDumpFromFile(file: File): Promise<Record<string, number>> {
  const text = await file.text()
  const dump = JSON.parse(text) as MigrationDump & { cleanVersion?: number }
  const counts = await importMigrationDump(dump)
  rememberImportVersion(dumpVersion(dump))
  return counts
}

export async function importSheetsDumpFromUrl(url: string): Promise<Record<string, number>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch dump (${res.status})`)
  const dump = (await res.json()) as MigrationDump & { cleanVersion?: number }
  const counts = await importMigrationDump(dump)
  rememberImportVersion(dumpVersion(dump))
  return counts
}

export function resetSheetsImportFlag(): void {
  localStorage.removeItem(FLAG)
  localStorage.removeItem('rrcentral_sheets_import_v1')
}
