// Encrypts each person's Zoho refresh token before it is stored (AES-256-GCM).
// The key is derived from the MAIL_TOKEN_KEY function secret, which lives only
// in Supabase secrets. Stored form: v1:<iv base64>:<ciphertext base64>.

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function unb64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** At least 32 characters, so a short or empty secret never protects tokens. */
export function tokenKeyProblem(secret: string): string {
  return secret.length >= 32 ? "" : "MAIL_TOKEN_KEY must be at least 32 characters"
}

async function key(secret: string): Promise<CryptoKey> {
  const problem = tokenKeyProblem(secret)
  if (problem) throw new Error(problem)
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`rr-mail-token:${secret}`))
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
}

export async function sealToken(secret: string, plain: string): Promise<string> {
  if (!plain) throw new Error("Nothing to encrypt")
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), enc.encode(plain)))
  return `v1:${b64(iv)}:${b64(ct)}`
}

/** Null when the token cannot be opened (wrong key, changed text, old format). */
export async function openToken(secret: string, sealed: string): Promise<string | null> {
  const [v, iv, ct] = String(sealed || "").split(":")
  if (v !== "v1" || !iv || !ct) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(secret), unb64(ct))
    return dec.decode(plain)
  } catch {
    return null
  }
}
