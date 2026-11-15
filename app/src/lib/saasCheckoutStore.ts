import { getSupabaseClient } from './supabaseConfig'

export type SaasCheckoutResult = { url: string; session_id?: string }

function appSaasBillingUrl(): { success: string; cancel: string; returnUrl: string } {
  const origin = window.location.origin
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const path = `${origin}${base}/saas-billing`
  return {
    success: `${path}?checkout=success`,
    cancel: `${path}?checkout=cancel`,
    returnUrl: path,
  }
}

export async function startSaasCheckout(planKey: string): Promise<SaasCheckoutResult> {
  const urls = appSaasBillingUrl()
  const { data, error } = await getSupabaseClient().functions.invoke('saas-checkout', {
    body: {
      action: 'checkout',
      plan_key: planKey,
      success_url: urls.success,
      cancel_url: urls.cancel,
    },
  })
  if (error) throw error
  const body = data as { url?: string; session_id?: string; error?: string } | null
  if (!body?.url) throw new Error(body?.error || 'Checkout did not return a URL')
  return { url: body.url, session_id: body.session_id }
}

export async function openSaasBillingPortal(): Promise<{ url: string }> {
  const urls = appSaasBillingUrl()
  const { data, error } = await getSupabaseClient().functions.invoke('saas-checkout', {
    body: { action: 'portal', return_url: urls.returnUrl },
  })
  if (error) throw error
  const body = data as { url?: string; error?: string } | null
  if (!body?.url) throw new Error(body?.error || 'Portal did not return a URL')
  return { url: body.url }
}
