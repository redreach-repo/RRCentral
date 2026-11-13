-- Numbering allocate (RRCRM M2). Run after migrations + tenant fixtures.
\set ON_ERROR_STOP 1

create or replace function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'NUMBERING TEST FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'alfred@redreach.ae', now())
on conflict (id) do nothing;

insert into public.app_users (email, name, role, active, tenant_id)
values (
  'alfred@redreach.ae', 'Alfred', 'admin', true,
  'a0000000-0000-4000-8000-000000000001'
)
on conflict (email) do update
  set active = true, role = 'admin',
      tenant_id = 'a0000000-0000-4000-8000-000000000001';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$
declare
  a text;
  b text;
  yy text := to_char(now(), 'YY');
begin
  a := public.rr_allocate_reference('quotation', '01', 'RR');
  b := public.rr_allocate_reference('invoice', '01', 'RR');
  if a is null or b is null then
    raise exception 'NUMBERING TEST FAILED: null allocate';
  end if;
  if a !~ ('^RR-01-' || yy || '[0-9]{3}$') then
    raise exception 'NUMBERING TEST FAILED: bad quotation shape %', a;
  end if;
  if b !~ ('^RR-01-' || yy || '[0-9]{3}$') then
    raise exception 'NUMBERING TEST FAILED: bad invoice shape %', b;
  end if;
  if a = b then
    raise exception 'NUMBERING TEST FAILED: quotation and invoice collided (%)', a;
  end if;
  -- Shared counter: invoice seq must be quotation seq + 1
  if substring(b from '[0-9]{3}$')::int <> substring(a from '[0-9]{3}$')::int + 1 then
    raise exception 'NUMBERING TEST FAILED: expected sequential share got % then %', a, b;
  end if;
  raise notice 'ok - quotation/invoice share RR sequence (% → %)', a, b;
end $$;

select pg_temp.expect(
  public.rr_allocate_reference('delivery_note', '01', 'DN') ~ ('^DN-01-' || to_char(now(), 'YY') || '[0-9]{3}$'),
  'delivery note allocate shape'
);

select pg_temp.expect(
  public.rr_allocate_reference('account', '07', 'AC') ~ ('^AC-07-' || to_char(now(), 'YY') || '[0-9]{3}$'),
  'account allocate shape'
);

reset role;
select pg_temp.expect(true, 'numbering suite complete');
