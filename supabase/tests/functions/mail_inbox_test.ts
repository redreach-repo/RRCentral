// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1"
import {
  clampLimit,
  clampStart,
  cleanSearch,
  folderKind,
  isZohoId,
  normalizeFolders,
  normalizeMessage,
  plain,
  stripActiveContent,
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
