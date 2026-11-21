# HighMast PDF renderer (Vercel)

Makes quote, invoice and delivery note PDFs for the AI connector (`get_quote_pdf`, `get_invoice_pdf`,
`get_delivery_note_pdf` in `supabase/functions/highmast-mcp`) with **the app's own Download PDF code**, so the
file the AI hands out is the file a person downloads.

How it works:

1. `highmast-mcp` signs a 2 minute, read-only render login for the AI key's member and POSTs
   `{ kind, id, token, apikey }` to `/api/render`.
2. `api/render.js` asks the database whether the token is a live render login for exactly that document
   (`rr_pdf_render_check`). Anything else is refused before a browser starts, so no shared secret is needed.
3. Headless Chromium opens `https://redreach-repo.github.io/RRCentral/render-pdf/<kind>/<id>#t=<token>`.
   That page is the document page (`app/src/pages/DocumentPage.tsx` in render mode): it draws the document and
   runs the same function as the Download PDF button, then saves the file to the private Storage bucket
   `generated-pdfs`. The PDF never passes through Vercel.
4. The page reports back (`window.__HM_PDF_DONE`) and the function answers `{ ok, path, size_bytes }`.

## Set up on Vercel (once)

* New project from this GitHub repository, **Root Directory** `services/render-pdf`, Framework Preset **Other**,
  no build command. Node.js 22.
* No environment variables are needed. Optional: `APP_URL` (default `https://redreach-repo.github.io/RRCentral`) and
  `SUPABASE_URL` (default the live project).
* After the first deploy, copy the production address and add it to Supabase as the Edge Function secret
  `RENDER_PDF_URL`, ending in `/api/render`, e.g. `https://highmast-render-pdf.vercel.app/api/render`.
  Then redeploy `highmast-mcp` (Actions > Deploy Edge Functions).

`vercel.json` gives the function 2 GB and 60 seconds. A render takes about 5 to 10 seconds.

## Tests

`npm test` checks the request rules (no browser needed; runs in CI).
