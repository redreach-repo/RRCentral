// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert@1"
import { openToken, sealToken, tokenKeyProblem } from "../../functions/mail-inbox/tokenBox.ts"
import {
  clampLimit,
  clampStart,
  cleanSearch,
  folderKind,
  isZohoId,
  mailboxBelongsTo,
  normalizeFolders,
  normalizeMessage,
  plain,
  stripActiveContent,
  zohoAccountsOrigin,
  zohoConsentUrl,
  zohoMailOrigin,
} from "../../functions/mail-inbox/mailbox.ts"

Deno.test("only numeric Zoho ids are accepted", () => {
  assert(isZohoId("1234567890123"))
  assert(!isZohoId("12/../34"))
  assert(!isZohoId("abc"))
  assert(!isZohoId(""))
  assert(!isZohoId(123))
})

Deno.test("limits and starts stay in range", () => {
  assertEquals(clampLimit(undefined), 30)
  assertEquals(clampLimit(500), 50)
  assertEquals(clampLimit(-3), 30)
  assertEquals(clampStart(0), 1)
  assertEquals(clampStart("41"), 41)
})

Deno.test("search text is one plain line with no operators", () => {
  assertEquals(cleanSearch("  invoice\nRR-01 "), "invoice RR-01")
  assertEquals(cleanSearch("from:boss@x.com"), "from boss@x.com")
  assertEquals(cleanSearch("x".repeat(300)).length, 100)
})

Deno.test("folders are typed and sorted inbox first", () => {
  assertEquals(folderKind("Sent"), "sent")
  assertEquals(folderKind("Sent Items"), "sent")
  assertEquals(folderKind("Projects", "inbox"), "inbox")
  const out = normalizeFolders([
    { folderId: "3", folderName: "Trash" },
    { folderId: "2", folderName: "Clients" },
    { folderId: "1", folderName: "Inbox", unreadCount: 4 },
    { folderId: "x", folderName: "Bad id" },
  ])
  assertEquals(out.map((f) => f.name), ["Inbox", "Clients", "Trash"])
  assertEquals(out[0].unread, 4)
})

Deno.test("headers come out as plain text and keep bare addresses", () => {
  assertEquals(plain("&quot;Sam&quot; &lt;sam@x.com&gt;", 100), '"Sam" <sam@x.com>')
  assertEquals(plain('"Sam" <sam@x.com>', 100), '"Sam" <sam@x.com>')
  assertEquals(plain("<b>Hi</b> there", 100), "Hi there")
})

Deno.test("messages are normalised, bad ids dropped", () => {
  const m = normalizeMessage({
    messageId: "111",
    folderId: "222",
    subject: "Quote <b>RR-01</b>",
    fromAddress: "a@b.com",
    status: "0",
    hasAttachment: "1",
    receivedTime: "1700000000000",
  })
  assert(m)
  assertEquals(m.subject, "Quote RR-01")
  assertEquals(m.unread, true)
  assertEquals(m.hasAttachment, true)
  assertEquals(m.receivedTime, 1700000000000)
  assertEquals(normalizeMessage({ messageId: "../1" }), null)
})

Deno.test("active content is removed from email HTML", () => {
  const html = stripActiveContent(
    '<p onclick="steal()">Hi</p><script>alert(1)</script><iframe src="x"></iframe>' +
      '<a href="javascript:alert(1)">x</a><img src="https://t.example/p.gif" onerror=bad()><form action="/x"><input></form>',
  )
  assert(!/script|alert\(1\)|onclick|onerror|<iframe|<form|javascript:/i.test(html), html)
  assert(html.includes("<p>Hi</p>"))
  assert(html.includes('src="https://t.example/p.gif"'))
})

const KEY = "a-test-key-that-is-long-enough-0123456789"

Deno.test("refresh tokens are stored encrypted and only open with the same key", async () => {
  const sealed = await sealToken(KEY, "1000.refresh.token")
  assert(sealed.startsWith("v1:"))
  assert(!sealed.includes("1000.refresh.token"))
  assertNotEquals(sealed, await sealToken(KEY, "1000.refresh.token"))
  assertEquals(await openToken(KEY, sealed), "1000.refresh.token")
  assertEquals(await openToken(KEY + "x", sealed), null)
  const [v, iv, ct] = sealed.split(":")
  assertEquals(await openToken(KEY, `${v}:${iv}:${ct.slice(0, -4)}AAAA`), null)
  assertEquals(await openToken(KEY, "plain-token"), null)
})

Deno.test("a short token key is refused", async () => {
  assert(tokenKeyProblem("short"))
  assertEquals(tokenKeyProblem(KEY), "")
  await assertRejects(() => sealToken("short", "x"))
})

Deno.test("only Zoho sign in servers are trusted, and the mail server follows the region", () => {
  assertEquals(zohoAccountsOrigin("https://accounts.zoho.eu"), "https://accounts.zoho.eu")
  assertEquals(zohoAccountsOrigin("https://accounts.zoho.com/oauth"), "https://accounts.zoho.com")
  assertEquals(zohoAccountsOrigin("https://accounts.zoho.com.evil.example"), null)
  assertEquals(zohoAccountsOrigin("http://accounts.zoho.com"), null)
  assertEquals(zohoAccountsOrigin("https://mail.zoho.com"), null)
  assertEquals(zohoMailOrigin("https://accounts.zoho.in"), "https://mail.zoho.in")
})

Deno.test("the consent link asks for read only mail and lasting access", () => {
  const url = new URL(zohoConsentUrl({ accountsOrigin: "https://accounts.zoho.com", clientId: "id", redirectUri: "https://x.supabase.co/functions/v1/mail-inbox", state: "s.t", loginHint: "a@redreach.ae" }))
  assertEquals(url.pathname, "/oauth/v2/auth")
  assertEquals(url.searchParams.get("access_type"), "offline")
  assertEquals(url.searchParams.get("scope"), "ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ")
  assertEquals(url.searchParams.get("login_hint"), "a@redreach.ae")
})

Deno.test("a mailbox is only accepted when it is the person's own", () => {
  assert(mailboxBelongsTo("Sam@RedReach.ae", { primaryEmailAddress: "sam@redreach.ae" }))
  assert(mailboxBelongsTo("sam@redreach.ae", { primaryEmailAddress: "info@redreach.ae", emailAddress: [{ mailId: "sam@redreach.ae" }] }))
  assert(!mailboxBelongsTo("sam@redreach.ae", { primaryEmailAddress: "alfred@redreach.ae" }))
  assert(!mailboxBelongsTo("", { primaryEmailAddress: "" }))
})
