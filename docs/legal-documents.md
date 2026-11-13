# Contracts vault & NDA e-sign

RR Central stores NDAs (and later other contracts) per CRM company, generates
them from a lawyer-approved template, sends a private sign link, and files the
signed PDF to Google Drive + Customer files automatically.

## One-time setup

1. Run `supabase/migrations/20261206120000_legal_documents.sql` in the Supabase SQL editor.
2. Deploy the edge function: **Actions → Deploy Edge Functions → `legal-sign`**.
3. Open **NDA template** in the menu, review the starter wording, send a sample PDF to your lawyer, then **Mark approved by lawyer**.
4. Connect Google Drive in Settings (same as Customer files) so signed PDFs auto-file.

## Day-to-day

1. Open a company in **CRM Pipeline** → **Contracts** tab.
2. Choose the signatory → **New NDA**.
3. **Send for signature** → copy the link and send it (WhatsApp / email).
4. Client opens `/sign#…`, reads the PDF, draws a signature, submits.
5. Status becomes **Signed**. When Drive is connected, the PDF lands in the client folder and under Customer files → **Contracts & NDAs**.

## Notes

- Sign links use the same token pattern as quote accept (hash only stored; token after `#`).
- Unsigned PDFs from an unapproved template are marked DRAFT — do not send those for real signature.
- If Drive is not connected, the signature is still stored in RR Central; you can file the PDF later.
- **Compliance:** The canvas signature is an **electronic signing record / assent capture**, not a UAE Qualified E-Signature (QES) or Advanced E-Signature under Decree-Law 46/2021. See `docs/COMPLIANCE_NOTES.md` § E-sign and `docs/M5_CONTRACTS_ESIGN.md`. Do not describe it as “same as handwritten” or “qualified”.
