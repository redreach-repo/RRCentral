// Prospect outreach email: what goes out when a person presses Send.
// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1"
import {
  composeOutreachHtml,
  isOutreachId,
  isUnsubscribeToken,
  type OutreachClaim,
  outreachClaimProblem,
  outreachFooterText,
  outreachPayload,
  unsubscribeUrl,
  ZOHO_SUPPORTS_LIST_UNSUBSCRIBE,
} from "../../functions/mail-inbox/outreachMail.ts"

// Fictional people and companies only.
const claim: OutreachClaim = {
  id: "8f9c2c1e-6b2a-4c43-9d55-0a4c8f1b2e3d",
  to_email: "layla@falconbay.example",
  to_name: "Layla Test",
  subject: "Trading risk at Falcon Bay",
  body: "Hi Layla,\n\nA short note <about> CTRM Next & your desk.",
  sender_email: "alex@example-reach.test",
  sender_name: "Alex Sender",
  signature: "Alex Sender\nExample Reach FZE\nOn behalf of CTRM Next\nalex@example-reach.test",
  legal_name: "Example Reach FZE",
  address: "PO Box 0000\nTest Free Zone, Example City",
  opt_out_text: "If you would rather not hear from us, use this link:",
  unsubscribe_token: "a".repeat(64),
}
const link = unsubscribeUrl("https://abc.supabase.co/", claim.unsubscribe_token)

Deno.test("unsubscribe link goes to the public function with the token", () => {
  assertEquals(link, `https://abc.supabase.co/functions/v1/outreach-unsubscribe?t=${"a".repeat(64)}`)
  assert(isUnsubscribeToken("0".repeat(64)))
  assert(!isUnsubscribeToken("0".repeat(63)))
  assert(!isUnsubscribeToken("Z".repeat(64)))
  assert(isOutreachId(claim.id))
  assert(!isOutreachId("1; drop table"))
})

Deno.test("the email carries the approved body, signature, company address and opt-out", () => {
  const html = composeOutreachHtml(claim, link)
  assertStringIncludes(html, "A short note &lt;about&gt; CTRM Next &amp; your desk.")
  assertStringIncludes(html, "<div>On behalf of CTRM Next</div>")
  assertStringIncludes(html, "Example Reach FZE, PO Box 0000, Test Free Zone, Example City")
  assertStringIncludes(html, "If you would rather not hear from us, use this link:")
  assertStringIncludes(html, `<a href="${link}">Unsubscribe</a>`)
  // Only one link: the unsubscribe link.
  assertEquals(html.match(/<a /g)?.length, 1)
  assert(!/<script/i.test(html))
})

Deno.test("footer text matches what the review screen previews", () => {
  assertEquals(
    outreachFooterText(claim, link),
    `Example Reach FZE, PO Box 0000, Test Free Zone, Example City\nIf you would rather not hear from us, use this link: ${link}`,
  )
})

Deno.test("payload goes from the connected mailbox to the one recipient", () => {
  const p = outreachPayload({ ...claim, subject: "Line\none" }, "alex@example-reach.test", link)
  assertEquals(p.fromAddress, "alex@example-reach.test")
  assertEquals(p.toAddress, "layla@falconbay.example")
  assertEquals(p.subject, "Line one")
  assertEquals(p.mailFormat, "html")
  assertEquals(p.ccAddress, undefined)
  assertEquals(p.bccAddress, undefined)
})

Deno.test("nothing goes out without the sender's own mailbox, address and opt-out", () => {
  assertEquals(outreachClaimProblem(claim, "alex@example-reach.test"), "")
  assertEquals(outreachClaimProblem(claim, "ALEX@example-reach.test "), "")
  assertStringIncludes(outreachClaimProblem(claim, "someone@else.test"), "your connected mailbox is someone@else.test")
  assertStringIncludes(outreachClaimProblem({ ...claim, address: " " }, claim.sender_email), "postal address")
  assertStringIncludes(outreachClaimProblem({ ...claim, legal_name: "" }, claim.sender_email), "legal name")
  assertEquals(outreachClaimProblem({ ...claim, opt_out_text: "" }, claim.sender_email), "The opt-out line is empty")
  assertEquals(outreachClaimProblem({ ...claim, signature: "" }, claim.sender_email), "Your sender signature is empty")
  assertEquals(outreachClaimProblem({ ...claim, unsubscribe_token: "x" }, claim.sender_email), "The unsubscribe link could not be made")
  assertEquals(outreachClaimProblem({ ...claim, to_email: "nobody" }, claim.sender_email), "The email has no valid recipient")
  assertEquals(outreachClaimProblem({ ...claim, body: "  " }, claim.sender_email), "Subject and body are both needed")
  assertEquals(outreachClaimProblem(null, claim.sender_email), "The email could not be prepared")
})

Deno.test("Zoho's send API has no custom headers, so no List-Unsubscribe header is claimed", () => {
  assertEquals(ZOHO_SUPPORTS_LIST_UNSUBSCRIBE, false)
})

Deno.test("mail-inbox sends outreach only after the database claim, with the person's token", async () => {
  const src = await Deno.readTextFile(new URL("../../functions/mail-inbox/index.ts", import.meta.url))
  const block = src.slice(src.indexOf('action === "outreach_send"'), src.indexOf('return json({ error: "Unknown action" }'))
  assert(block.length > 100, "outreach_send block found")
  // The claim runs as the signed in person (userDb), never with the service role.
  assert(/userDb\.rpc\("rr_outreach_claim_send"/.test(block))
  assert(!/sb\.rpc\("rr_outreach_claim_send"/.test(block))
  // The Zoho call comes after the claim and the checks.
  assert(block.indexOf("rr_outreach_claim_send") < block.indexOf("zohoPost("))
  assert(block.indexOf("outreachClaimProblem(") < block.indexOf("zohoPost("))
  // The email text is never written to the logs.
  assert(!/console\.(log|error|warn|info)\([^)]*(claim\.body|claim\.subject|payload|content)/.test(block))
})
