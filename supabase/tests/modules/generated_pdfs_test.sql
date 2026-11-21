-- Generated PDFs bucket (20261326090000_generated_pdfs.sql):
--   * private bucket, PDFs only
--   * a PDF can be read or saved only by someone who can see its document
--   * viewers can read but not save; nothing can be saved under a made-up number
--   * AI keys follow their departments (sales sees quote PDFs, HR does not)
begin;
\ir _fixtures.sql

create or replace function pg_temp.login_ai(key uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001c1', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000001c1', 'role', 'authenticated', 'hm_mcp_key', key)::text, true);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select pg_temp.expect((select not public from storage.buckets where id = 'generated-pdfs'), 'the generated-pdfs bucket is private');
select pg_temp.expect((select allowed_mime_types from storage.buckets where id = 'generated-pdfs') = array['application/pdf'], 'and takes PDFs only');

insert into public.quotations (id, quote_id, reference_number, client, status, tenant_id)
values ('e6200000-0000-4000-8000-000000000001', 'Q-PDFTEST', 'RR-01-26907', 'PDF Test LLC', 'Sent', 'a0000000-0000-4000-8000-000000000001');

select pg_temp.login('sales');
insert into storage.objects (bucket_id, name) values ('generated-pdfs', 'quotes/RR-01-26907.pdf');
select pg_temp.expect((select count(*) from storage.objects where name = 'quotes/RR-01-26907.pdf') = 1, 'sales saves the PDF of a quote it can see');
update storage.objects set updated_at = now() where name = 'quotes/RR-01-26907.pdf';
select pg_temp.expect(pg_temp.fails($q$insert into storage.objects (bucket_id, name) values ('generated-pdfs', 'quotes/RR-01-99999.pdf')$q$),
  'nothing can be saved under a number no document has');
select pg_temp.expect(pg_temp.fails($q$insert into storage.objects (bucket_id, name) values ('generated-pdfs', 'quotes/../x.pdf')$q$),
  'nor under an odd path');
select pg_temp.expect(pg_temp.fails($q$insert into storage.objects (bucket_id, name) values ('generated-pdfs', 'other/RR-01-26907.pdf')$q$),
  'nor in another folder');
delete from storage.objects where name = 'quotes/RR-01-26907.pdf';
reset role;
select pg_temp.expect((select count(*) from storage.objects where name = 'quotes/RR-01-26907.pdf') = 1, 'and nobody deletes it');
select pg_temp.logout();

select pg_temp.login('viewer');
select pg_temp.expect(pg_temp.fails($q$insert into storage.objects (bucket_id, name) values ('generated-pdfs', 'quotes/Q-PDFTEST.pdf')$q$),
  'a viewer cannot save PDFs');
reset role;
select pg_temp.logout();

select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'generated-pdfs') = 0, 'someone outside the company sees no PDFs');
reset role;
select pg_temp.logout();

-- AI keys follow their departments.
insert into auth.users values ('00000000-0000-0000-0000-0000000001c1', 'ai-assistant@redreach.ae', now()) on conflict (id) do nothing;
insert into public.app_users (email, name, role, active, tenant_id)
values ('ai-assistant@redreach.ae', 'AI Assistant', 'admin', true, 'a0000000-0000-4000-8000-000000000001')
on conflict (email) do update set role = 'admin', active = true;
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, scope, assistant, departments, acts_as_user_id, created_by)
select v.id::uuid, v.name, 'hmk_pdft', v.hash, 'admin', 'admin', 'grok', v.depts::text[], u.id, 'test'
from public.app_users u,
  (values ('e6920000-0000-4000-8000-000000000001', 'PDF sales', repeat('a', 63) || '1', '{sales}'),
          ('e6920000-0000-4000-8000-000000000002', 'PDF hr', repeat('a', 63) || '2', '{hr}')) as v(id, name, hash, depts)
where u.email = 'ai-assistant@redreach.ae';

select pg_temp.login_ai('e6920000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) from storage.objects where name = 'quotes/RR-01-26907.pdf') = 1, 'a sales AI key reads the quote PDF');
reset role;
select pg_temp.logout();
select pg_temp.login_ai('e6920000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*) from storage.objects where name = 'quotes/RR-01-26907.pdf') = 0, 'an HR AI key does not');
select pg_temp.expect(pg_temp.fails($q$insert into storage.objects (bucket_id, name) values ('generated-pdfs', 'quotes/RR-01-26907.pdf')$q$),
  'and cannot save one');
reset role;
select pg_temp.logout();

-- Render logins (hm_pdf_render): read what the page needs, write nothing.
create or replace function pg_temp.login_render(key uuid, doc text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001c1', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000001c1', 'role', 'authenticated', 'hm_mcp_key', key,
                      'hm_pdf_render', doc)::text, true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
insert into public.app_settings (key, value) values ('companyName', 'Red Reach Test FZE') on conflict (key) do update set value = excluded.value;
insert into public.crm (company_name) values ('PDF Test LLC');

select pg_temp.login_ai('e6920000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) from public.app_settings where key = 'companyName') = 0, 'an AI key still cannot read settings');
select pg_temp.expect(public.rr_pdf_render_check() ->> 'ok' = 'false', 'and is not a render login');
reset role;
select pg_temp.logout();

select pg_temp.login_render('e6920000-0000-4000-8000-000000000001', 'quote:e6200000-0000-4000-8000-000000000001');
select pg_temp.expect(public.rr_pdf_render_check() ->> 'document' = 'quote:e6200000-0000-4000-8000-000000000001', 'a render login names its document');
select pg_temp.expect((select value from public.app_settings where key = 'companyName') = 'Red Reach Test FZE', 'a render login reads the letterhead settings');
select pg_temp.expect((select count(*) from public.quotations where id = 'e6200000-0000-4000-8000-000000000001') = 1, 'and the quote');
select pg_temp.expect(pg_temp.fails($q$insert into public.crm (company_name) values ('Render wrote this')$q$), 'but adds nothing');
select pg_temp.expect(pg_temp.fails($q$update public.quotations set status = 'Accepted' where id = 'e6200000-0000-4000-8000-000000000001'$q$)
  or (select status from public.quotations where id = 'e6200000-0000-4000-8000-000000000001') = 'Sent', 'and changes nothing');
update storage.objects set updated_at = now() where name = 'quotes/RR-01-26907.pdf';
select pg_temp.expect((select count(*) from storage.objects where name = 'quotes/RR-01-26907.pdf') = 1, 'it can still replace the PDF file');
reset role;
select pg_temp.logout();

-- A finance key's render login reads the CRM row the letterhead uses (finance alone cannot).
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, scope, assistant, departments, acts_as_user_id, created_by)
select 'e6920000-0000-4000-8000-000000000003', 'PDF finance', 'hmk_pdft', repeat('a', 63) || '3', 'admin', 'admin', 'grok', '{finance}', u.id, 'test'
from public.app_users u where u.email = 'ai-assistant@redreach.ae';
select pg_temp.login_ai('e6920000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) from public.crm where company_name = 'PDF Test LLC') = 0, 'a finance AI key does not read CRM');
reset role;
select pg_temp.logout();
select pg_temp.login_render('e6920000-0000-4000-8000-000000000003', 'invoice:e6200000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) from public.crm where company_name = 'PDF Test LLC') = 1, 'its render login does, read only');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'but nothing outside the page');
reset role;
select pg_temp.logout();
select pg_temp.login_render('e6920000-0000-4000-8000-000000000003', 'nonsense');
select pg_temp.expect(public.rr_pdf_render_check() ->> 'ok' = 'false', 'a made-up render claim is not a render login');
reset role;
select pg_temp.logout();

rollback;
