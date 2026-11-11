-- Optional product image on quotation / invoice line items.
-- Empty string means no image — the printable document must not show a placeholder.

alter table public.line_items
  add column if not exists image_data text not null default '';

comment on column public.line_items.image_data is
  'Optional compressed image (data URL or https) for the line. Empty = omit from quotation.';

notify pgrst, 'reload schema';
