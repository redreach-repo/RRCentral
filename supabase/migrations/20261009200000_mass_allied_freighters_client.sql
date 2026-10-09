-- Mass Allied Freighters L.L.C — full bill-to details for invoices/quotes.
-- Matches short labels like "Mass Allied Freighters" via DocumentPage company matching.

do $$
declare
  v_name text := 'Mass Allied Freighters L.L.C';
  v_office text := '+971 4 882 4433';
  v_address text := E'Grosvenor Business Tower, Office 1506,\nP.O. Box 6641, Barsha Heights, TECOM,\nDubai, UAE';
  v_trn text := '100286214000003';
  v_match text := '%mass%allied%freighter%';
begin
  update public.clients
  set
    company_name = v_name,
    office = case when btrim(coalesce(office, '')) = '' then v_office else office end,
    address = case when btrim(coalesce(address, '')) = '' then v_address else address end,
    trn = case when btrim(coalesce(trn, '')) = '' then v_trn else trn end
  where lower(company_name) like v_match
     or lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%';

  if not exists (
    select 1 from public.clients
    where lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%'
  ) then
    insert into public.clients (company_name, office, address, trn, notes)
    values (v_name, v_office, v_address, v_trn, 'Seeded from client letterhead details');
  end if;

  update public.crm
  set
    company_name = v_name,
    office_number = case when btrim(coalesce(office_number, '')) = '' then v_office else office_number end,
    address = case when btrim(coalesce(address, '')) = '' then v_address else address end,
    trn = case when btrim(coalesce(trn, '')) = '' then v_trn else trn end,
    updated_at = now()
  where lower(company_name) like v_match
     or lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%';

  if not exists (
    select 1 from public.crm
    where lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%'
  ) then
    insert into public.crm (company_name, office_number, address, trn, pipeline_stage, notes)
    values (v_name, v_office, v_address, v_trn, 'Quoted', 'Seeded from client letterhead details');
  end if;

  -- Normalize short invoice/quote client labels to the legal name.
  update public.invoices
  set client = v_name
  where lower(regexp_replace(client, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%'
    and btrim(client) <> v_name;

  update public.quotations
  set client = v_name
  where lower(regexp_replace(client, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%'
    and btrim(client) <> v_name;
end $$;

notify pgrst, 'reload schema';
