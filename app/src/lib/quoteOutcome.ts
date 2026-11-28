/**
 * Quote statuses that show the Outcome button (mark Awarded / Not awarded).
 * Expired is included: a client often confirms or sends a PO after the quote's
 * valid-until date, and the Quote follow-up page asks for a decision on
 * expired quotes. Draft, Superseded and Not awarded never show it.
 */
export const QUOTE_OUTCOME_STATUSES = ['Finalized', 'Sent', 'Accepted', 'Awarded', 'Expired'] as const

export function canSetQuoteOutcome(status: string | null | undefined): boolean {
  return (QUOTE_OUTCOME_STATUSES as readonly string[]).includes(status ?? '')
}
