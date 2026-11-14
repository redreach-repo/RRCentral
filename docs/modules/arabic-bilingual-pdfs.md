# Arabic bilingual PDFs

Status: **built and tested; the PDF was produced and checked in a local build. Not live (draft PR, not merged).**

## What it does

The document page (quotes, invoices, delivery notes) gets an **English + Arabic** toggle next to the page layout picker. When it is on, every fixed label on the sheet prints as `English · العربية`: the title (TAX INVOICE · فاتورة ضريبية), Date, Valid until, Status, TRN, Bill to and the other section headings, the column headings (Arabic on a second line), Subtotal, Discount, VAT, Total, Payment terms, Delivery and MOQ. The PDF download, Save to Drive, email and quote accept link all use the same sheet, so they all come out bilingual.

The PDF is drawn from the rendered page (jsPDF from a canvas of the sheet, as before). The browser shapes the Arabic, so it joins correctly and reads right to left with no font file to embed. The Arabic is marked `lang="ar" dir="rtl"` and uses an Arabic-capable font stack.

The toggle is remembered per browser (`rr.documents.bilingual`). It is off by default, so nothing changes for anyone until they switch it on.

## What is not translated

- What people type: client names, descriptions, line items, payment and delivery terms, notes, bank details. These print as typed. Type them in Arabic too if a client needs them in Arabic.
- Custom document titles or section headings typed in Settings (e.g. "CUSTOM CLIENT PROPOSAL") stay English, because there is no Arabic for them. The test fails if a built-in title, heading or column ever lacks Arabic.
- A few smaller labels on page two stay English: Quotation currency, Other payment currencies accepted, Bank, Fulfilment partner, and the signature captions.
- Amounts keep Western digits (0 to 9), which is normal on UAE invoices.

## Needs Alfred

- **The Arabic was written by the build, not by a native speaker or a tax adviser.** Have someone check `app/src/lib/bilingualDocs/arabicLabels.ts` before sending a bilingual tax invoice.
- UAE VAT rules: whether a tax invoice must carry Arabic, and the exact wording for "Tax Invoice", is a compliance question for your accountant. This feature makes Arabic possible; it does not make an invoice compliant by itself.

## Files

- `app/src/lib/bilingualDocs/arabicLabels.ts` (dictionary, lookup, saved preference) and its test
- `app/src/components/documents/Bi.tsx`, `bilingualContext.ts`, `Bi.test.ts`
- `app/src/pages/DocumentPage.tsx` (toggle and label wrapping only, no layout change when the toggle is off)
- `app/src/lib/i18n.ts` (one key: `page.document.bilingual`)

Sample output from a local build: `/mnt/project-files/rr-central/modules/bilingual-quote.pdf` and `.png`.
