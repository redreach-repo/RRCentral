import { db } from './db'
import { isCancelledInvoice } from './finance'

/** Remove income + payment_log rows tied to an invoice reference. */
export async function deleteFinanceForInvoiceRef(reference: string): Promise<void> {
  const ref = String(reference || '').trim()
  if (!ref) return

  const { data: incomeRows } = await db.from('income').select('id').eq('reference_number', ref)
  for (const row of (incomeRows || []) as { id: string }[]) {
    await db.from('income').delete().eq('id', row.id)
  }

  const { data: payRows } = await db.from('payment_log').select('id').eq('invoice_ref', ref)
  for (const row of (payRows || []) as { id: string }[]) {
    await db.from('payment_log').delete().eq('id', row.id)
  }
}

/** Invoice refs recorded as deleted in the activity log (and no longer present). */
export async function loadDeletedInvoiceRefs(liveRefs?: Set<string>): Promise<Set<string>> {
  const live =
    liveRefs ||
    new Set(
      (
        ((await db.from('invoices').select('reference_number')).data || []) as {
          reference_number: string
        }[]
      )
        .map((i) => String(i.reference_number || '').trim())
        .filter(Boolean),
    )

  const deleted = new Set<string>()
  const { data: acts } = await db.from('activity_log').select('reference,action')
  for (const a of (acts || []) as { reference: string; action: string }[]) {
    const ref = String(a.reference || '').trim()
    if (a.action === 'delete_invoice' && ref && !live.has(ref)) deleted.add(ref)
  }

  const { data: pays } = await db.from('payment_log').select('invoice_ref')
  for (const p of (pays || []) as { invoice_ref: string }[]) {
    const ref = String(p.invoice_ref || '').trim()
    if (ref && !live.has(ref)) deleted.add(ref)
  }

  return deleted
}

/**
 * Clear orphan income/payments left after invoice deletes, and remove all finance
 * for cancelled invoices so the dashboard stops counting them.
 */
export async function reconcileInvoiceFinance(): Promise<number> {
  let cleaned = 0

  const { data: invoices } = await db.from('invoices').select('reference_number,status,client')
  const invList = (invoices || []) as { reference_number: string; status: string; client: string }[]
  const liveRefs = new Set(invList.map((i) => String(i.reference_number || '').trim()).filter(Boolean))

  const orphanRefs = await loadDeletedInvoiceRefs(liveRefs)

  const { data: pays } = await db.from('payment_log').select('id,invoice_ref')
  for (const p of (pays || []) as { id: string; invoice_ref: string }[]) {
    const ref = String(p.invoice_ref || '').trim()
    if (!ref || liveRefs.has(ref)) continue
    orphanRefs.add(ref)
    await db.from('payment_log').delete().eq('id', p.id)
    cleaned += 1
  }

  for (const ref of orphanRefs) {
    const { data: incomeRows } = await db.from('income').select('id').eq('reference_number', ref)
    for (const row of (incomeRows || []) as { id: string }[]) {
      await db.from('income').delete().eq('id', row.id)
      cleaned += 1
    }
  }

  // Cancelled invoices must not keep any income / payment rows
  for (const inv of invList) {
    if (!isCancelledInvoice(inv)) continue
    const ref = String(inv.reference_number || '').trim()
    if (!ref) continue
    const { data: incomeRows } = await db.from('income').select('id').eq('reference_number', ref)
    for (const row of (incomeRows || []) as { id: string }[]) {
      await db.from('income').delete().eq('id', row.id)
      cleaned += 1
    }
    const { data: payRows } = await db.from('payment_log').select('id').eq('invoice_ref', ref)
    for (const row of (payRows || []) as { id: string }[]) {
      await db.from('payment_log').delete().eq('id', row.id)
      cleaned += 1
    }
  }

  // Known bad Ello Pets row: cancelled catalogue invoice must never count as income
  const { data: elloIncome } = await db.from('income').select('id,reference_number,client_source')
  for (const row of (elloIncome || []) as {
    id: string
    reference_number: string
    client_source: string
  }[]) {
    const client = String(row.client_source || '').toLowerCase()
    const ref = String(row.reference_number || '').trim()
    if (!client.includes('ello pets')) continue
    if (ref === '26107') continue
    // Any other Ello income (e.g. RR-01-26001) is incorrect for the paid cash invoice
    await db.from('income').delete().eq('id', row.id)
    cleaned += 1
    if (ref) {
      const { data: payRows } = await db.from('payment_log').select('id').eq('invoice_ref', ref)
      for (const p of (payRows || []) as { id: string }[]) {
        await db.from('payment_log').delete().eq('id', p.id)
        cleaned += 1
      }
    }
  }

  return cleaned
}
