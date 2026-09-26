-- Clear bulky supplier invoice PDFs from Supabase (data URLs).
-- Keep expense rows and quotation cost fields — only deletes attachment blobs.
-- Safe to re-run.

-- Quotation-linked supplier invoice PDFs stored as data:... blobs
delete from attachments
where entity_type = 'quotation_supplier_invoice'
  and url like 'data:%';

-- Mirrored expense PDF blobs that look like invoices
delete from attachments
where entity_type = 'expense'
  and url like 'data:%'
  and (
    lower(coalesce(file_name, '')) like '%.pdf'
    or lower(coalesce(file_name, '')) like '%invoice%'
  );
