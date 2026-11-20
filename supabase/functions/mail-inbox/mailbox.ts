// Pure helpers for the mail-inbox function (no network, no Deno APIs),
// so they can be tested on their own: supabase/tests/functions/mail_inbox_test.ts

export type MailFolderKind = "inbox" | "sent" | "drafts" | "spam" | "trash" | "other"

export type MailFolder = {
  folderId: string
  name: string
  kind: MailFolderKind
  unread: number
}

export type MailListItem = {
  messageId: string
  folderId: string
  threadId: string
  subject: string
  fromAddress: string
  sender: string
  toAddress: string
  summary: string
  receivedTime: number
  unread: boolean
  hasAttachment: boolean
}

/** Zoho ids are long numbers sent as strings. Anything else is refused. */
export const ZOHO_ID = /^\d{1,30}$/

export function isZohoId(value: unknown): value is string {
  return typeof value === "string" && ZOHO_ID.test(value)
}

export function clampLimit(raw: unknown, fallback = 30, max = 50): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

/** Zoho's `start` is 1 based. */
export function clampStart(raw: unknown): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 100_000)
}

/** Search text: one line, no Zoho search operators smuggled in, at most 100 characters. */
export function cleanSearch(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
}

export function folderKind(name: string, type?: string): MailFolderKind {
  const t = String(type || "").toLowerCase()
  const n = name.trim().toLowerCase()
  if (t === "inbox" || n === "inbox") return "inbox"
  if (t === "sent" || /^sent\b|sent\s*(mail|items)/.test(n)) return "sent"
  if (t === "drafts" || n === "drafts") return "drafts"
  if (t === "spam" || n === "spam" || n === "junk") return "spam"
  if (t === "trash" || n === "trash" || n === "deleted items") return "trash"
  return "other"
}

const KIND_ORDER: MailFolderKind[] = ["inbox", "sent", "drafts", "other", "spam", "trash"]

export function normalizeFolders(rows: Record<string, unknown>[]): MailFolder[] {
  const out: MailFolder[] = []
  for (const r of rows) {
    const folderId = String(r.folderId ?? "")
    if (!ZOHO_ID.test(folderId)) continue
    const name = String(r.folderName || r.path || "Folder").slice(0, 120)
    out.push({
      folderId,
      name,
      kind: folderKind(name, r.folderType as string | undefined),
      unread: Math.max(0, Number(r.unreadCount ?? r.unreadMessageCount ?? 0) || 0),
    })
  }
  return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name))
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }

/** Zoho sends headers like `&quot;Name&quot; &lt;a@b.com&gt;`. Plain text out, no tags. */
export function plain(text: unknown, max: number): string {
  return String(text ?? "")
    // Real tags only, so a bare <a@b.com> address survives.
    .replace(/<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/gi, " ")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e: string) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

export function normalizeMessage(raw: Record<string, unknown>): MailListItem | null {
  const messageId = String(raw.messageId ?? "")
  const folderId = String(raw.folderId ?? "")
  if (!ZOHO_ID.test(messageId)) return null
  const received = Number(raw.receivedTime || raw.sentDateInGMT || 0)
  const status = String(raw.status ?? "1")
  return {
    messageId,
    folderId: ZOHO_ID.test(folderId) ? folderId : "",
    threadId: ZOHO_ID.test(String(raw.threadId ?? "")) ? String(raw.threadId) : "",
    subject: plain(raw.subject, 300) || "(no subject)",
    fromAddress: plain(raw.fromAddress, 300),
    sender: plain(raw.sender || raw.fromAddress, 200),
    toAddress: plain(raw.toAddress, 1000),
    summary: plain(raw.summary, 300),
    receivedTime: Number.isFinite(received) ? received : 0,
    // Zoho: status "0" is unread, "1" read.
    unread: status === "0" || String(raw.status2 ?? "") === "0",
    hasAttachment: !["0", "false", "", "undefined"].includes(String(raw.hasAttachment ?? "0")),
  }
}

/**
 * Belt and braces: the page also shows the email in a sandboxed frame with
 * scripts off. Removes scripts, frames, plugins, forms and inline handlers.
 */
export function stripActiveContent(html: string): string {
  return String(html || "")
    .replace(/<\s*(script|iframe|object|embed|applet|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|noscript|base|meta|link|form)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, "$1=$2#$2")
    .slice(0, 2_000_000)
}

const ZOHO_ACCOUNTS_HOST = /^accounts\.zoho\.(com|eu|in|com\.au|jp|com\.cn|sa|ca|uk)$/i

/** Zoho sign in server for a region, e.g. https://accounts.zoho.eu. Null when not a Zoho one. */
export function zohoAccountsOrigin(raw: unknown): string | null {
  try {
    const url = new URL(String(raw || ""))
    if (url.protocol !== "https:" || !ZOHO_ACCOUNTS_HOST.test(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}

/** The Mail API server in the same region: accounts.zoho.eu -> mail.zoho.eu. */
export function zohoMailOrigin(accountsOrigin: string): string {
  return accountsOrigin.replace("://accounts.", "://mail.")
}

/** Read only for now: list folders and read mail. Sending comes in a later step (reconnect then). */
export const ZOHO_MAIL_SCOPES = "ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ"

export function zohoConsentUrl(opts: { accountsOrigin: string; clientId: string; redirectUri: string; state: string; loginHint?: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    scope: ZOHO_MAIL_SCOPES,
    redirect_uri: opts.redirectUri,
    access_type: "offline",
    prompt: "consent",
    state: opts.state,
  })
  if (opts.loginHint) q.set("login_hint", opts.loginHint)
  return `${opts.accountsOrigin}/oauth/v2/auth?${q}`
}

/**
 * Per person only: the Zoho mailbox must belong to the person signed in to
 * RR Central (their login address is one of the mailbox's addresses).
 */
export function mailboxBelongsTo(
  userEmail: string,
  account: { primaryEmailAddress?: unknown; mailboxAddress?: unknown; emailAddress?: unknown },
): boolean {
  const me = userEmail.trim().toLowerCase()
  if (!me) return false
  const addresses = new Set<string>()
  for (const v of [account.primaryEmailAddress, account.mailboxAddress]) if (typeof v === "string") addresses.add(v.trim().toLowerCase())
  if (Array.isArray(account.emailAddress)) {
    for (const e of account.emailAddress) {
      const mail = typeof e === "string" ? e : (e as { mailId?: unknown })?.mailId
      if (typeof mail === "string") addresses.add(mail.trim().toLowerCase())
    }
  }
  return addresses.has(me)
}
