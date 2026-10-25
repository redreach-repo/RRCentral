// Send plain text email through the Zoho Mail connection saved in Settings
// (Client ID, Client Secret, Refresh Token, Mail set to yes). Returns null
// while that connection is not set up. Same steps as the daily digest.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

const ZOHO_HOST_RE = /^(accounts|mail)\.zoho\.(com|eu|in|com\.au|jp|com\.cn|sa|ca)$/i

function zohoUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== "https:" || !ZOHO_HOST_RE.test(url.hostname)) throw new Error(`Zoho host not allowed: ${url.hostname}`)
  return url.origin
}

export async function zohoMailer(sb: SupabaseClient) {
  const { data } = await sb
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "zohoClientId",
      "zohoClientSecret",
      "zohoRefreshToken",
      "zohoAccountsDomain",
      "zohoMailDomain",
      "zohoMailAccountId",
      "zohoMailEnabled",
      "email",
      "zohoMailFrom",
    ])
  const s: Record<string, string> = {}
  for (const row of (data || []) as { key: string; value: string }[]) s[row.key] = String(row.value ?? "").trim()
  if (!s.zohoClientId || !s.zohoClientSecret || !s.zohoRefreshToken || (s.zohoMailEnabled || "no").toLowerCase() !== "yes") {
    return null
  }
  const accounts = zohoUrl(s.zohoAccountsDomain || "https://accounts.zoho.com")
  const mail = s.zohoMailDomain
    ? zohoUrl(s.zohoMailDomain)
    : accounts.replace("accounts.", "mail.")

  return async (messages: { to: string; subject: string; body: string }[]) => {
    const tokenRes = await fetch(`${accounts}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: s.zohoClientId,
        client_secret: s.zohoClientSecret,
        refresh_token: s.zohoRefreshToken,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const token = ((await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string })
    if (!token.access_token) throw new Error(`Zoho sign in failed${token.error ? `: ${token.error}` : ""}`)
    const headers = { Authorization: `Zoho-oauthtoken ${token.access_token}`, "Content-Type": "application/json" }

    const accRes = await fetch(`${mail}/api/accounts`, { headers, signal: AbortSignal.timeout(20_000) })
    const accBody = (await accRes.json().catch(() => ({}))) as {
      data?: { accountId?: string | number; primaryEmailAddress?: string; mailboxAddress?: string; sendMailDetails?: { fromAddress?: string }[] }[]
      status?: { description?: string }
    }
    if (!accRes.ok) throw new Error(accBody.status?.description || `Zoho Mail answered ${accRes.status}`)
    const list = accBody.data || []
    const account = s.zohoMailAccountId ? list.find((a) => String(a.accountId) === s.zohoMailAccountId) : list[0]
    if (!account?.accountId) throw new Error("No Zoho Mail account found")
    const from =
      account.sendMailDetails?.[0]?.fromAddress || account.primaryEmailAddress || account.mailboxAddress || s.email || s.zohoMailFrom
    if (!from) throw new Error("Could not find the Zoho Mail from address")

    let sent = 0
    const errors: string[] = []
    for (const m of messages) {
      const res = await fetch(`${mail}/api/accounts/${encodeURIComponent(String(account.accountId))}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fromAddress: from, toAddress: m.to, subject: m.subject, content: m.body, mailFormat: "plaintext" }),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.ok) sent++
      else {
        const body = (await res.json().catch(() => ({}))) as { status?: { description?: string } }
        errors.push(`${m.to}: ${body.status?.description || res.status}`)
      }
    }
    return { sent, errors }
  }
}
