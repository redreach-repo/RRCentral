import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'

/** Makes (or reuses) the card payment link for an invoice. */
export async function getInvoicePayLink(invoiceId: string): Promise<{ url: string; amount: number; currency: string }> {
  if (!isSupabaseConfigured()) throw new Error('Card payment links only work when RR Central is connected to the cloud.')
  const { data, error } = await getSupabaseClient().functions.invoke('invoice-pay-link', { body: { invoice_id: invoiceId } })
  if (error) {
    let message = 'The payment link could not be made. Try again later.'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) message = String(b.error)
    } catch {
      // keep the plain message
    }
    throw new Error(message)
  }
  return data as { url: string; amount: number; currency: string }
}
