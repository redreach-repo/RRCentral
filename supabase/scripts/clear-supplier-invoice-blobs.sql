-- Clear bulky attachment PDFs from Supabase (data URLs).
-- Prefer clear-all-attachment-data-urls.sql for a full wipe.
-- Keep expense rows and quotation cost fields — only deletes attachment blobs.
-- Safe to re-run.

delete from attachments
where entity_type in (
  'quotation_supplier_invoice',
  'expense',
  'delivery_note_signed'
)
  and url like 'data:%';
