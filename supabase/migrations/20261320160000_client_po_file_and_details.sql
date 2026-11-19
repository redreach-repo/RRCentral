-- Client POs: keep the PO file in Google Drive and the details read off it.
--
-- On Documents > Client POs the user uploads the PO (PDF or photo). The
-- client-po-file Edge Function reads it with AI to fill in the form, the user
-- checks and corrects it, and on Save the file goes to the client's Google
-- Drive folder. This adds the columns that hold the result:
--
-- * file_name, file_url, drive_file_id: the PO file in Google Drive.
-- * line_items: the ordered lines [{description, quantity, unit, unit_price, amount}].
-- * subtotal, vat_rate, vat_amount: as printed; amount stays the PO total.
-- * contact_name, delivery_date, delivery_address, delivery_terms, payment_terms.
-- * details_read_at: when the details were read by AI (null when typed by hand).
-- * clients.drive_folder_url: the client's Google Drive folder, so every PO
--   for a client lands in the same folder (same idea as crm.drive_folder_url).
--
-- RLS: no new table. The existing client_purchase_orders policies (tenant
-- isolation; admin, manager and sales read and write) cover the new columns,
-- and clients keeps its own policies. Changes no existing data. Safe to re-run.
-- Run after 20261320140000_client_po_all_departments.sql.

do $$
begin
  if to_regclass('public.client_purchase_orders') is null then
    raise exception 'Run 20261230180000_client_purchase_orders.sql first (client_purchase_orders is missing).';
  end if;
end $$;

alter table public.client_purchase_orders
  add column if not exists file_name text not null default '',
  add column if not exists file_url text not null default '',
  add column if not exists drive_file_id text not null default '',
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists subtotal numeric(14, 2),
  add column if not exists vat_rate numeric(5, 2),
  add column if not exists vat_amount numeric(14, 2),
  add column if not exists contact_name text not null default '',
  add column if not exists delivery_date date,
  add column if not exists delivery_address text not null default '',
  add column if not exists delivery_terms text not null default '',
  add column if not exists payment_terms text not null default '',
  add column if not exists details_read_at timestamptz;

alter table public.client_purchase_orders
  drop constraint if exists client_purchase_orders_line_items_check;
alter table public.client_purchase_orders
  add constraint client_purchase_orders_line_items_check
  check (jsonb_typeof(line_items) = 'array');

alter table public.client_purchase_orders
  drop constraint if exists client_purchase_orders_money_check;
alter table public.client_purchase_orders
  add constraint client_purchase_orders_money_check
  check (
    (subtotal is null or subtotal >= 0)
    and (vat_amount is null or vat_amount >= 0)
    and (vat_rate is null or (vat_rate >= 0 and vat_rate <= 100))
  );

alter table public.client_purchase_orders
  drop constraint if exists client_purchase_orders_file_url_check;
alter table public.client_purchase_orders
  add constraint client_purchase_orders_file_url_check
  check (file_url = '' or file_url ~ '^https://(drive|docs)\.google\.com/');

alter table public.clients
  add column if not exists drive_folder_url text not null default '';

comment on column public.client_purchase_orders.file_url is 'The PO file in the client''s Google Drive folder.';
comment on column public.client_purchase_orders.line_items is 'Ordered lines as on the PO: [{description, quantity, unit, unit_price, amount}].';
comment on column public.client_purchase_orders.details_read_at is 'When the details were read off the PO file by AI (checked by a person before saving).';
comment on column public.clients.drive_folder_url is 'The client''s Google Drive folder (RR Central / Customers / <client>).';
