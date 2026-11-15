// PII / secret scrubber for Edge Function logs (gap plan module 3,
// docs/modules/observability.md). Same rules as app/src/lib/observability/scrub.ts;
// supabase/tests/functions/observability_test.ts fails if the two drift.

const RULES: [RegExp, string][] = [
  // JSON Web Tokens (Supabase sessions, service keys)
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt]'],
  // Bearer / Basic credentials
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  // Our own and common provider keys
  [/\b(hm|whsec|sk_live|sk_test|rk_live|pk_live)_[A-Za-z0-9]{8,}\b/g, '[$1_key]'],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, '[anthropic_key]'],
  // key=value secrets in query strings or text
  [/\b(api[_-]?key|token|secret|password|passwd|access_token|refresh_token)=([^&\s"']+)/gi, '$1=[redacted]'],
  // IBAN (UAE AE + 21 digits, and others 15-34 chars), with or without spaces
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g, '[iban]'],
  // Emirates ID 784-YYYY-NNNNNNN-C
  [/\b784-?\d{4}-?\d{7}-?\d\b/g, '[emirates_id]'],
  // Card numbers (13-19 digits, optional spaces/dashes)
  [/\b(?:\d[ -]?){12,18}\d\b/g, '[card]'],
  // Email addresses
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]'],
  // Phone numbers with a + country code
  [/\+\d[\d\s-]{7,}\d/g, '[phone]'],
]

export function scrubText(text: string): string {
  let out = text
  for (const [re, rep] of RULES) out = out.replace(re, rep)
  return out
}

const SECRET_KEYS = /^(password|passwd|secret|token|access_token|refresh_token|api_key|apikey|authorization|cookie|iban|salary|key_hash|card|cvv)$/i

/** Deep copy with secret-looking keys blanked and every string scrubbed. Depth limited. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]'
  if (typeof value === 'string') return scrubText(value)
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrubValue(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : scrubValue(v, depth + 1)
    }
    return out
  }
  return value
}
