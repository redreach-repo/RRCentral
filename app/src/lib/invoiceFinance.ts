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

/**
 * Clear orphan income/payments left after invoice deletes, and void Paid income
 * on cancelled invoices so the dashboard stops counting them.
 */
export async function reconcileInvoiceFinance(): Promise<number> {
  let cleaned = 0

  const { data: invoices } = await db.from('invoices').select('reference_number,status')
  const invList = (invoices || []) as { reference_number: string; status: string }[]
  const liveRefs = new Set(invList.map((i) => String(i.reference_number || '').trim()).filter(Boolean))

  const orphanRefs = new Set<string>()

  const { data: acts } = await db.from('activity_log').select('reference,action')
  for (const a of (acts || []) as { reference: string; action: string }[]) {
    if (a.action === 'delete_invoice' && a.reference && !liveRefs.has(a.reference)) {
      orphanRefs.add(a.reference)
    }
  }

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

  for (const inv of invList) {
    if (!isCancelledInvoice(inv)) continue
    const ref = String(inv.reference_number || '').trim()
    if (!ref) continue
    const { data: incomeRows } = await db
      .from('income')
      .select('id,payment_status')
      .eq('reference_number', ref)
    for (const row of (incomeRows || []) as { id: string; payment_status: string }[]) {
      const pay = String(row.payment_status || '').trim().toLowerCase()
      if (pay === 'paid' || pay === 'partial') {
        await db
          .from('income')
          .update({
            payment_status: 'Pending',
            status: 'Cancelled',
            payment_method: '',
          })
          .eq('id', row.id)
        cleaned += 1
      }
    }
    const { data: payRows } = await db.from('payment_log').select('id').eq('invoice_ref', ref)
    for (const row of (payRows || []) as { id: string }[]) {
      await db.from('payment_log').delete().eq('id', row.id)
      cleaned += 1
    }
  }

  return cleaned
}
