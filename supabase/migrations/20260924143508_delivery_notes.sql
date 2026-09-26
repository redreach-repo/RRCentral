-- Red Reach Central — delivery notes (run in the production Supabase SQL editor)
-- Fixes live Create: PGRST205 Could not find the table 'public.delivery_notes'
-- Project: pszjylxrpvlumldtptrr (https://pszjylxrpvlumldtptrr.supabase.co)

create extension if not exists "uuid-ossp";

insert into app_settings (key, value)
values ('deliveryNotePrefix', 'DN')
on conflict (key) do nothing;

create table if not exists delivery_notes (
  id uuid primary key default uuid_generate_v4(),
  client text not null default '',
  vertical text not null default '',
  division_code text not null default '01',
  reference_number text not null default '',
  date date,
  delivery_date date,
  description text not null default '',
  quote_ref text not null default '',
  quote_id text not null default '',
  status text not null default 'Issued',
  delivery_terms text not null default '',
  ship_to text not null default '',
  notes text not null default '',
  received_by text not null default '',
  vehicle_notes text not null default '',
  created_by text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_notes_quote_ref on delivery_notes(quote_ref);
create index if not exists idx_delivery_notes_status on delivery_notes(status);

alter table delivery_notes enable row level security;

drop policy if exists "Authenticated users full access" on delivery_notes;
create policy "Authenticated users full access" on delivery_notes
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Allow line_items.doc_type = 'DeliveryNote' (old CHECK is Quote/Invoice only).
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'line_items'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%doc_type%'
  loop
    execute format('alter table public.line_items drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.line_items
  add constraint line_items_doc_type_check
  check (doc_type in ('Quote', 'Invoice', 'DeliveryNote'));

notify pgrst, 'reload schema';
