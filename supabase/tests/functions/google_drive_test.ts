// Google Drive helpers shared by the google-drive and client-portal functions.
// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1"
import { consentUrl, driveFolderId, readState, safeName, signState } from "../../functions/_shared/googleDrive.ts"

Deno.test("finds the folder id in a Google Drive folder link", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345"
  assertEquals(driveFolderId(`https://drive.google.com/drive/folders/${id}`), id)
  assertEquals(driveFolderId(`https://drive.google.com/drive/u/0/folders/${id}?usp=sharing`), id)
  assertEquals(driveFolderId(`https://drive.google.com/open?id=${id}`), id)
  assertEquals(driveFolderId(id), id)
})

Deno.test("old WorkDrive links and other sites are not Google Drive folders", () => {
  assertEquals(driveFolderId("https://workdrive.zoho.com/home/abc/teams/t1/ws/w1/folders/f1a2b3c4d5e6f7g8h9"), null)
  assertEquals(driveFolderId("https://evil.example/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345"), null)
  assertEquals(driveFolderId("http://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345"), null)
  assertEquals(driveFolderId("https://drive.google.com/drive/u/0/"), null)
  assertEquals(driveFolderId("short"), null)
  assertEquals(driveFolderId(""), null)
})

Deno.test("signed state round trips and refuses tampering or age", async () => {
  const state = { email: "alfred@redreach.ae", returnTo: "https://redreach.ae/settings", exp: Date.now() + 60_000 }
  const signed = await signState("secret", state)
  assertEquals(await readState("secret", signed), state)
  assertEquals(await readState("other", signed), null)
  const [body, sig] = signed.split(".")
  assertEquals(await readState("secret", `${body}x.${sig}`), null)
  assertEquals(await readState("secret", signed, state.exp + 1), null)
  assertEquals(await readState("secret", ""), null)
})

Deno.test("asks Google for files RR Central makes only, with lasting access", () => {
  const url = new URL(consentUrl("cid", "https://x.supabase.co/functions/v1/google-drive", "st"))
  assertEquals(url.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.file")
  assertEquals(url.searchParams.get("access_type"), "offline")
  assertEquals(url.searchParams.get("prompt"), "consent")
  assertEquals(url.searchParams.get("state"), "st")
})

Deno.test("file and folder names are safe for Drive", () => {
  assertEquals(safeName('Acme / Co: "Q1"'), "Acme Co Q1")
  assertEquals(safeName("   ", "Client"), "Client")
  assert(safeName("x".repeat(400)).length <= 150)
})
