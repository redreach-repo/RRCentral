import { authMode } from './db'
import { importMigrationDump, type MigrationDump } from './localDb'

const FLAG = 'rrcentral_sheets_import_v1'

export async function tryAutoImportSheetsDump(): Promise<{
  imported: boolean
  counts?: Record<string, number>
  error?: string
}> {
  if (authMode !== 'local') return { imported: false }
  if (typeof window === 'undefined') return { imported: false }
  if (localStorage.getItem(FLAG) === '1') return { imported: false }

  try {
    const url = `${import.meta.env.BASE_URL}migration-data.json`
    const res = await fetch(url)
    if (!res.ok) return { imported: false }
    const dump = (await res.json()) as MigrationDump
    const hasData =
      (dump.crm && dump.crm.length > 0) ||
      (dump.quotations && dump.quotations.length > 0) ||
      (dump.invoices && dump.invoices.length > 0)
    if (!hasData) return { imported: false }

    const counts = await importMigrationDump(dump)
    localStorage.setItem(FLAG, '1')
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
  const dump = JSON.parse(text) as MigrationDump
  const counts = await importMigrationDump(dump)
  localStorage.setItem(FLAG, '1')
  return counts
}

export async function importSheetsDumpFromUrl(url: string): Promise<Record<string, number>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch dump (${res.status})`)
  const dump = (await res.json()) as MigrationDump
  const counts = await importMigrationDump(dump)
  localStorage.setItem(FLAG, '1')
  return counts
}

export function resetSheetsImportFlag(): void {
  localStorage.removeItem(FLAG)
}
