export type CrmOrderPayload = {
  orderId: string
  email: string
  name: string
  phone: string
  emirate: string
  address: string
  totalFils: number
  subtotalFils: number
  deliveryFils: number
  items: Array<{
    productName: string
    variantLabel: string
    qty: number
    priceFils: number
  }>
  paidAt: string
}

export async function syncOrderToCrm(payload: CrmOrderPayload): Promise<{ ok: boolean; skipped?: boolean }> {
  const url = process.env.CRM_SYNC_URL
  const secret = process.env.CRM_SYNC_SECRET

  if (!url) {
    return { ok: true, skipped: true }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-CRM-Sync-Secret': secret } : {}),
      },
      body: JSON.stringify({
        source: 'teetribe',
        type: 'paid_order',
        inquiry: {
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          company: 'Tee Tribe Website',
          notes: formatCrmNotes(payload),
        },
        order: payload,
      }),
    })

    if (!res.ok) {
      console.error('[crmSync] Failed:', res.status, await res.text().catch(() => ''))
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error('[crmSync] Error:', err)
    return { ok: false }
  }
}

function formatCrmNotes(payload: CrmOrderPayload): string {
  const lines = [
    `Tee Tribe paid order ${payload.orderId}`,
    `Total: AED ${(payload.totalFils / 100).toFixed(2)}`,
    `Emirate: ${payload.emirate}`,
    `Address: ${payload.address}`,
    '',
    'Items:',
    ...payload.items.map(
      (i) => `- ${i.productName} (${i.variantLabel}) × ${i.qty} @ AED ${(i.priceFils / 100).toFixed(2)}`,
    ),
  ]
  return lines.join('\n')
}
