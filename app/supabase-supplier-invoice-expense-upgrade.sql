-- Supplier / uniform invoices stored as expenses with explicit VAT and quote link.
alter table expenses add column if not exists quote_ref text not null default '';
alter table expenses add column if not exists supplier_invoice_no text not null default '';
alter table expenses add column if not exists amount_ex_vat numeric(12,2);
alter table expenses add column if not exists vat_amount numeric(12,2);

notify pgrst, 'reload schema';
