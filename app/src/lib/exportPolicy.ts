/**
 * CSV export switch (Sales lockdown). Every CSV download in the app goes through
 * downloadCsv (lib/uiStyles.ts), which asks here first. Sales users need the
 * "Export to CSV" switch (user_permissions 'export.csv'); everyone else may export.
 *
 * The database already limits what a Sales user can read, so this stops bulk
 * copies of what they can see, not access to what they cannot.
 */
export const CSV_EXPORT_BLOCKED_EVENT = 'rr:csv-export-blocked'

let allowed = true

export function setCsvExportAllowed(next: boolean): void {
  allowed = next
}

export function isCsvExportAllowed(): boolean {
  return allowed
}

/** True when the download may go ahead; otherwise tells the shell to explain why. */
export function checkCsvExport(filename: string): boolean {
  if (allowed) return true
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CSV_EXPORT_BLOCKED_EVENT, { detail: { filename } }))
  }
  return false
}

export const CSV_EXPORT_BLOCKED_MESSAGE =
  'CSV export is switched off for your account. Ask an admin to switch on "Export to CSV" in Settings, Users.'
