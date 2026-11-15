/** Marketing ESP dry-run — local status only, never calls a provider. */

export type RecipientDryRunRow = {
  id: string
  status: string
  email?: string | null
}

export function dryRunEligible(status: string): boolean {
  return status === 'queued' || status === 'drafted'
}

export function dryRunResultStatus(): 'dry_run_sent' {
  return 'dry_run_sent'
}

export function summarizeDryRun(rows: RecipientDryRunRow[]): {
  sent: number
  skipped: number
} {
  let sent = 0
  let skipped = 0
  for (const r of rows) {
    if (dryRunEligible(r.status) && String(r.email || '').includes('@')) sent += 1
    else skipped += 1
  }
  return { sent, skipped }
}
