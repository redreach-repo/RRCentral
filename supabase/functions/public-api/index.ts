/**
 * Public API first slice (M11).
 * GET /public-api → health JSON. Authenticated account listing comes next.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
}

serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  const body = {
    ok: true,
    product: 'HighMast',
    api: 'public-api',
    version: '0.1.0',
    message: 'First slice health check. API key auth and resource routes come next.',
  }
  return new Response(JSON.stringify(body), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
