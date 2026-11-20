// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert@1"
import { openToken, sealToken, tokenKeyProblem } from "../../functions/mail-inbox/tokenBox.ts"
import {
  canSendWith,
  clampLimit,
  cleanSubject,
  composeHtml,
  clampStart,
  cleanSearch,
  folderKind,
  isZohoId,
  linkTargetTable,
  mailboxBelongsTo,
  normalizeFolders,
  normalizeMessage,
  parseRecipients,
  plain,
  sendMode,
  textToHtml,
  underSendLimit,
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

Deno.test("the consent link asks to read and send mail, with lasting access", () => {
  const url = new URL(zohoConsentUrl({ accountsOrigin: "https://accounts.zoho.com", clientId: "id", redirectUri: "https://x.supabase.co/functions/v1/mail-inbox", state: "s.t", loginHint: "a@redreach.ae" }))
  assertEquals(url.pathname, "/oauth/v2/auth")
  assertEquals(url.searchParams.get("access_type"), "offline")
  assertEquals(url.searchParams.get("scope"), "ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ,ZohoMail.messages.CREATE")
  assertEquals(url.searchParams.get("login_hint"), "a@redreach.ae")
})

Deno.test("a mailbox is only accepted when it is the person's own", () => {
  assert(mailboxBelongsTo("Sam@RedReach.ae", { primaryEmailAddress: "sam@redreach.ae" }))
  assert(mailboxBelongsTo("sam@redreach.ae", { primaryEmailAddress: "info@redreach.ae", emailAddress: [{ mailId: "sam@redreach.ae" }] }))
  assert(!mailboxBelongsTo("sam@redreach.ae", { primaryEmailAddress: "alfred@redreach.ae" }))
  assert(!mailboxBelongsTo("", { primaryEmailAddress: "" }))
})

Deno.test("emails link only to clients, CRM entries, quotations and invoices", () => {
  assertEquals(linkTargetTable("account"), "accounts")
  assertEquals(linkTargetTable("crm"), "crm")
  assertEquals(linkTargetTable("quotation"), "quotations")
  assertEquals(linkTargetTable("invoice"), "invoices")
  assertEquals(linkTargetTable("app_users"), null)
  assertEquals(linkTargetTable("toString"), null)
  assertEquals(linkTargetTable(undefined), null)
})

Deno.test("send: only connections given the send scope can send", () => {
  assert(!canSendWith("ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ"))
  assert(canSendWith("ZohoMail.accounts.READ,ZohoMail.messages.CREATE"))
  assert(canSendWith("zohomail.messages.all"))
  assert(!canSendWith(""))
  assert(!canSendWith(null))
})

Deno.test("send: modes are an allow-list", () => {
  assertEquals(sendMode("reply"), "reply")
  assertEquals(sendMode("replyAll"), "replyAll")
  assertEquals(sendMode("forward"), "forward")
  assertEquals(sendMode("new"), "new")
  assertEquals(sendMode("delete"), null)
  assertEquals(sendMode(undefined), null)
})

Deno.test("send: recipients become bare addresses, duplicates dropped, junk reported", () => {
  assertEquals(parseRecipients('"Sara K" <Sara@Client.ae>, ops@client.ae; sara@client.ae\nbob@x.com').list, [
    "sara@client.ae",
    "ops@client.ae",
    "bob@x.com",
  ])
  assertEquals(parseRecipients("").list, [])
  const r = parseRecipients("good@x.com, not an address, a@b, evil@x.com\r\nBcc: z@z.com")
  // Each line is its own address, so a smuggled "Bcc:" line is refused rather than becoming a header.
  assertEquals(r.list, ["good@x.com", "evil@x.com"])
  assertEquals(r.bad, ["not an address", "a@b", "Bcc: z@z.com"])
})

Deno.test("send: subject is one line", () => {
  assertEquals(cleanSubject("Re: Quote\r\nBcc: x@y.com"), "Re: Quote Bcc: x@y.com")
  assertEquals(cleanSubject("a".repeat(400)).length, 300)
})

Deno.test("send: typed text is escaped, not run as HTML", () => {
  assertEquals(textToHtml("Hi <b>Sara</b>\n\nThanks & bye"), "<div>Hi &lt;b&gt;Sara&lt;/b&gt;</div><div>&nbsp;</div><div>Thanks &amp; bye</div>")
})

Deno.test("send: a reply quotes the original below what was typed, a new email does not", () => {
  const quoted = { from: "sara@client.ae", to: "me@redreach.ae", cc: "", date: "Fri, 20 Nov 2026 10:00:00 GMT", subject: "Quote", html: "<p>Original</p>" }
  const reply = composeHtml("Thanks", "reply", quoted)
  assert(reply.indexOf("Thanks") < reply.indexOf("<blockquote"))
  assert(reply.includes("sara@client.ae wrote:"))
  assert(reply.includes("<p>Original</p>"))
  const fwd = composeHtml("FYI", "forward", quoted)
  assert(fwd.includes("Forwarded message"))
  assert(!fwd.includes("<blockquote"))
  assertEquals(composeHtml("Hello", "new", quoted).includes("Original"), false)
})

Deno.test("send: at most 20 sends in 10 minutes", () => {
  const now = 1_000_000_000
  assert(underSendLimit([], now))
  assert(!underSendLimit(Array(20).fill(now - 1000), now))
  assert(underSendLimit(Array(20).fill(now - 11 * 60_000), now))
})
