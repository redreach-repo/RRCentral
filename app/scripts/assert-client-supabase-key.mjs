/**
 * Fail the production build if VITE_SUPABASE_ANON_KEY is a service_role JWT.
 * That key bypasses RLS and must never ship in the GitHub Pages bundle.
 */
function jwtRole(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

const key = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim()
const url = String(process.env.VITE_SUPABASE_URL || '').trim()

if (!url && !key) {
  console.warn(
    '[assert-client-supabase-key] VITE_SUPABASE_* unset — build will use Local mode / runtime Settings.',
  )
  process.exit(0)
}

if (!url || !key) {
  console.error(
    '[assert-client-supabase-key] Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or neither.',
  )
  process.exit(1)
}

const role = jwtRole(key)
if (role === 'service_role') {
  console.error(
    [
      '[assert-client-supabase-key] Refusing to build: VITE_SUPABASE_ANON_KEY is a service_role JWT.',
      'Use the anon (or publishable) key from Supabase → Project Settings → API.',
      'Rotate the exposed service_role key before redeploying Pages.',
    ].join('\n'),
  )
  process.exit(1)
}

if (role && role !== 'anon') {
  console.warn(`[assert-client-supabase-key] Unusual JWT role "${role}" — expected "anon" for the browser key.`)
}

console.log('[assert-client-supabase-key] Client Supabase key looks safe for the browser.')
