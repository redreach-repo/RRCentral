-- Quotation contact person (when a company has several CRM contacts).

begin;

alter table public.quotations
  add column if not exists contact_name text not null default '';

alter table public.quotations
  add column if not exists contact_email text not null default '';

alter table public.quotations
  add column if not exists contact_phone text not null default '';

comment on column public.quotations.contact_name is
  'Chosen contact person for this quotation (Attn). Empty = no specific contact.';

notify pgrst, 'reload schema';

commit;
