// POST /api/render  { kind, id, token, apikey }  ->  { ok, path, size_bytes } | { ok: false, error }
//
// Called only by the highmast-mcp Supabase function (get_quote_pdf and friends).
// 1. Asks the database whether `token` is a live 2 minute render login for exactly
//    this document (rr_pdf_render_check). Anything else is refused before a
//    browser starts, so no shared secret is needed here.
// 2. Opens the HighMast page /render-pdf/<kind>/<id> in headless Chromium. That
//    page draws the document like /document/<kind>/<id> and runs the app's own
//    Download PDF code, then saves the file to the private generated-pdfs bucket.
// 3. Waits for the page to report back (window.__HM_PDF_DONE) and returns it.
//
// The PDF itself never passes through here. Env (all optional): APP_URL, SUPABASE_URL.
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import {
  DEFAULT_APP_URL,
  DEFAULT_SUPABASE_URL,
  parseRenderRequest,
  renderCheckMatches,
  renderPageUrl,
} from '../lib/request.js'

const PAGE_TIMEOUT_MS = 45_000

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return null
  }
}

async function checkToken(supabaseUrl, r) {
  const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/rr_pdf_render_check`, {
    method: 'POST',
    headers: { apikey: r.apikey, authorization: `Bearer ${r.token}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) return false
  return renderCheckMatches(await res.json().catch(() => null), r.kind, r.id)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only.' })
  const r = parseRenderRequest(await readJson(req))
  if (r.error) return send(res, 400, { ok: false, error: r.error })

  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  if (!(await checkToken(supabaseUrl, r).catch(() => false))) {
    return send(res, 401, { ok: false, error: 'Not a live render login for this document.' })
  }

  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1800, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
    const page = await browser.newPage()
    await page.goto(renderPageUrl(process.env.APP_URL || DEFAULT_APP_URL, r.kind, r.id, r.token), {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    })
    await page.waitForFunction(() => Boolean(window.__HM_PDF_DONE), { timeout: PAGE_TIMEOUT_MS, polling: 250 })
    const done = await page.evaluate(() => window.__HM_PDF_DONE)
    return send(res, done && done.ok ? 200 : 502, done || { ok: false, error: 'The page did not report back.' })
  } catch (e) {
    return send(res, 502, { ok: false, error: `Render failed: ${e && e.message ? e.message : String(e)}`.slice(0, 500) })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
