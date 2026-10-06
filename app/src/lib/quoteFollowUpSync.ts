import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import { db } from './db'
import type { CrmEntry, Quotation } from './types'

export type QuoteFollowUpSyncResult = {
  updated: number
  skipped: number
}

function norm(s: string): string {
  return (s || '').trim().toLowerCase()
}

/**
 * For Sent quotations older than `daysAfter` with no open follow-up on the CRM row,
 * set follow_up_date to today and a short next_action. Does not overwrite a future follow-up.
 */
export async function syncUnansweredQuoteFollowUps(args: {
  quotations: Quotation[]
  crm: CrmEntry[]
  daysAfter: number
  today?: Date
}): Promise<QuoteFollowUpSyncResult> {
  const today = startOfDay(args.today || new Date())
  const daysAfter = Math.max(1, Number(args.daysAfter) || 3)
  const byCompany = new Map<string, CrmEntry>()
  for (const row of args.crm) {
    const key = norm(row.company_name)
    if (key && !byCompany.has(key)) byCompany.set(key, row)
  }

  let updated = 0
  let skipped = 0
  const touched = new Set<string>()

  for (const quote of args.quotations) {
    if (String(quote.status || '') !== 'Sent') {
      skipped += 1
      continue
    }
    const quoteDateRaw = String(quote.date || quote.created_at || '').slice(0, 10)
    if (!quoteDateRaw) {
      skipped += 1
      continue
    }
    let quoteDate: Date
    try {
      quoteDate = startOfDay(parseISO(quoteDateRaw))
    } catch {
      skipped += 1
      continue
    }
    if (differenceInCalendarDays(today, quoteDate) < daysAfter) {
      skipped += 1
      continue
    }

    const crm = byCompany.get(norm(quote.client))
    if (!crm?.id) {
      skipped += 1
      continue
    }
    if (touched.has(crm.id)) {
      skipped += 1
      continue
    }

    if (crm.follow_up_date) {
      try {
        const due = startOfDay(parseISO(String(crm.follow_up_date).slice(0, 10)))
        if (due >= today) {
          skipped += 1
          continue
        }
      } catch {
        /* treat as needs refresh */
      }
    }

    const ref = quote.reference_number || 'quote'
    const todayIso = today.toISOString().slice(0, 10)
    const nextAction =
      crm.next_action?.trim() ||
      `Follow up on unanswered quote ${ref} (sent ${quoteDateRaw})`

    const { error } = await db
      .from('crm')
      .update({
        follow_up_date: todayIso,
        next_action: nextAction,
        updated_at: new Date().toISOString(),
      })
      .eq('id', crm.id)

    if (error) {
      skipped += 1
      continue
    }
    touched.add(crm.id)
    // Keep in-memory map in sync for subsequent quotes for same company
    byCompany.set(norm(crm.company_name), {
      ...crm,
      follow_up_date: todayIso,
      next_action: nextAction,
    })
    updated += 1
  }

  return { updated, skipped }
}
