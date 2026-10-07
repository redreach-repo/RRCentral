// Receives paid Tee Tribe orders and writes a website inquiry + optional CRM note
// into Red Reach Central. Deploy with Verify JWT OFF; protect with CRM_SYNC_SECRET.
//
// Tee Tribe env: CRM_SYNC_URL=https://<project>.supabase.co/functions/v1/teetribe-order-sync
//                CRM_SYNC_SECRET=<shared secret>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-crm-sync-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const expected = Deno.env.get('CRM_SYNC_SECRET') || ''
  const provided = req.headers.get('x-crm-sync-secret') || ''
  if (expected && provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => null) as {
    source?: string
    type?: string
    inquiry?: { name?: string; email?: string; phone?: string; company?: string; notes?: string }
    order?: { orderId?: string; totalFils?: number; email?: string }
  } | null

  if (!body?.inquiry?.email) {
    return new Response(JSON.stringify({ error: 'Missing inquiry.email' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const name = (body.inquiry.name || 'Tee Tribe customer').slice(0, 200)
  const email = body.inquiry.email.slice(0, 320)
  const phone = (body.inquiry.phone || '').slice(0, 50)
  const message = (body.inquiry.notes || `Tee Tribe order ${body.order?.orderId || ''}`).slice(0, 5000)

  const { error: inqErr } = await sb.from('website_inquiries').insert({
    name,
    email,
    phone,
    vertical: 'Tee Tribe',
    message,
    status: 'new',
    source: 'teetribe',
  })

  // Older schemas may not have source column — retry without it
  if (inqErr && /source|column/i.test(inqErr.message)) {
    const { error: retryErr } = await sb.from('website_inquiries').insert({
      name,
      email,
      phone,
      vertical: 'Tee Tribe',
      message,
      status: 'new',
    })
    if (retryErr) {
      return new Response(JSON.stringify({ error: retryErr.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  } else if (inqErr) {
    return new Response(JSON.stringify({ error: inqErr.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Soft-create / update CRM row by email/company when possible
  const company = body.inquiry.company || 'Tee Tribe Website'
  const { data: existing } = await sb
    .from('crm')
    .select('id')
    .ilike('company_name', company)
    .limit(1)
    .maybeSingle()

  if (!existing?.id) {
    await sb.from('crm').insert({
      company_name: `${name} (Tee Tribe)`,
      primary_contact: name,
      email,
      mobile: phone,
      pipeline_stage: 'Lead',
      next_action: 'Fulfil Tee Tribe order',
      notes: message.slice(0, 2000),
      source: 'teetribe',
    }).then(() => undefined).catch(() => undefined)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
