/**
 * CSV export switch and log (Sales lockdown). Every CSV download in the app goes
 * through downloadCsv (lib/uiStyles.ts), which asks here first.
 *
 * 1. Quick local check: Sales users need the "Export to CSV" switch
 *    (user_permissions 'export.csv'); everyone else may export.
 * 2. With Supabase: rr_log_export() logs the download and, for Sales, applies
 *    the daily cap (migration 20261333090000_sales_safeguards.sql). If that
 *    function is not on the database yet, the local check alone decides.
 *
 * The database already limits what a Sales user can read, so this stops bulk
 * copies of what they can see, not access to what they cannot.
 */
export const CSV_EXPORT_BLOCKED_EVENT = 'rr:csv-export-blocked'

export const CSV_EXPORT_BLOCKED_MESSAGE =
  'CSV export is switched off for your account. Ask an admin to switch on "Export to CSV" in Settings, Users.'

export type ExportDecision = { allowed: boolean; reason?: string; used?: number; cap?: number | null }

/** Sends the download to the server log; returns its decision. */
export type ExportLogger = (filename: string, rows: number) => Promise<ExportDecision | null>

let allowed = true
let logger: ExportLogger | null = null

export function setCsvExportAllowed(next: boolean): void {
  allowed = next
}

export function isCsvExportAllowed(): boolean {
  return allowed
}

/** Set once Supabase is ready (AuthContext). null = no server log (local mode). */
export function setExportLogger(next: ExportLogger | null): void {
  logger = next
}

export function blockedMessage(decision: ExportDecision): string {
  if (decision.reason === 'daily_cap') {
    return `You have reached today's limit of ${decision.cap ?? ''} CSV exports. Ask an admin if you need more.`.replace('  ', ' ')
  }
  if (decision.reason === 'not_member') return 'Your account is not active, so CSV export is off.'
  return CSV_EXPORT_BLOCKED_MESSAGE
}

function tellScreen(filename: string, message: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CSV_EXPORT_BLOCKED_EVENT, { detail: { filename, message } }))
  }
}

/** True when the download may go ahead (local switch only); otherwise tells the shell why. */
export function checkCsvExport(filename: string): boolean {
  if (allowed) return true
  tellScreen(filename, CSV_EXPORT_BLOCKED_MESSAGE)
  return false
}

/** Rows in a CSV text, header excluded. */
export function csvRowCount(csv: string): number {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '')
  return Math.max(lines.length - 1, 0)
}

/**
 * Full check before a download: local switch, then the server log and cap.
 * A logger error (function missing, offline) falls back to the local check.
 */
export async function requestCsvExport(filename: string, csv: string): Promise<boolean> {
  if (!checkCsvExport(filename)) return false
  if (!logger) return true
  let decision: ExportDecision | null = null
  try {
    decision = await logger(filename, csvRowCount(csv))
  } catch {
    return true
  }
  if (!decision || decision.allowed) return true
  tellScreen(filename, blockedMessage(decision))
  return false
}
