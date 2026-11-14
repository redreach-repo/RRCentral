-- Cross-tenant isolation (RRCRM M1).
-- Run after migrations (and ideally after rls_test.sql fixtures).
-- Raises on failure.
\set ON_ERROR_STOP 1

create or replace function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'TENANT TEST FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Ensure Red Reach admin fixture exists (also seeded by rls_test.sql).
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'alfred@redreach.ae', now())
on conflict (id) do nothing;

insert into public.app_users (email, name, role, active, tenant_id)
values (
  'alfred@redreach.ae',
  'Alfred',
  'admin',
  true,
  'a0000000-0000-4000-8000-000000000001'
)
on conflict (email) do update
  set active = true,
      role = 'admin',
      tenant_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.crm (company_name, tenant_id)
values ('Lead Co', 'a0000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Second tenant + user (isolated from Red Reach)
insert into public.tenants (id, name, slug, status, is_demo)
values (
  'b0000000-0000-4000-8000-000000000001',
  'Demo Tenant B',
  'demo-b',
  'active',
  true
)
on conflict (id) do nothing;

insert into public.companies (id, tenant_id, name, legal_name, is_default)
values (
  'b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000001',
  'Demo Co B',
  'Demo Co B LLC',
  true
)
on conflict (id) do nothing;

insert into auth.users values
  ('00000000-0000-0000-0000-0000000000b1', 'admin@demo-b.test', now())
on conflict (id) do nothing;

insert into public.app_users (email, name, role, active, tenant_id)
values (
  'admin@demo-b.test',
  'Demo B Admin',
  'admin',
  true,
  'b0000000-0000-4000-8000-000000000001'
)
on conflict (email) do update
  set tenant_id = excluded.tenant_id, active = true, role = 'admin';

insert into public.crm (company_name, tenant_id)
values ('Tenant B Secret Lead', 'b0000000-0000-4000-8000-000000000001');

insert into public.vendors (company_name, tenant_id)
values ('Tenant B Secret Vendor', 'b0000000-0000-4000-8000-000000000001');

-- Broader stamped tables (GAP_PLAN: expand coverage beyond CRM/vendors).
insert into public.accounts (type, name, reference, tenant_id)
values (
  'ai_crm_client',
  'Tenant B Secret Account',
  'AC-TB-0001',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.quotations (client, reference_number, status, tenant_id)
values (
  'Tenant B Secret Quote',
  'RR-TB-0001',
  'Draft',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.invoices (client, reference_number, status, tenant_id)
values (
  'Tenant B Secret Invoice',
  'RR-TB-INV-1',
  'Draft',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.sales_deals (account_id, stage, next_action, next_action_date, tenant_id)
select
  id,
  'lead',
  'Call Tenant B',
  '2026-12-01',
  'b0000000-0000-4000-8000-000000000001'
from public.accounts
where reference = 'AC-TB-0001'
limit 1;

insert into public.expenses (vendor, category, amount, tenant_id)
values (
  'Tenant B Secret Expense',
  'COGS',
  250,
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.delivery_notes (client, reference_number, status, tenant_id)
values (
  'Tenant B Secret DN',
  'DN-TB-0001',
  'Issued',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.payment_log (invoice_ref, client, amount, notes, tenant_id)
values (
  'RR-TB-INV-1',
  'Tenant B Secret Invoice',
  100,
  'Tenant B Secret Payment',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.contracts (account_id, monthly_fee, status, notes, tenant_id)
select
  id,
  1900,
  'active',
  'Tenant B Secret Contract',
  'b0000000-0000-4000-8000-000000000001'
from public.accounts
where reference = 'AC-TB-0001'
limit 1;

insert into public.tickets (account_id, subject, tenant_id)
select
  id,
  'Tenant B Secret Ticket',
  'b0000000-0000-4000-8000-000000000001'
from public.accounts
where reference = 'AC-TB-0001'
limit 1;

insert into public.ctrm_deals (account_id, stage, region, next_action, next_action_date, tenant_id)
select
  id,
  'identified',
  'middle_east',
  'Call Tenant B CTRM',
  '2026-12-01',
  'b0000000-0000-4000-8000-000000000001'
from public.accounts
where reference = 'AC-TB-0001'
limit 1;

insert into public.legal_documents (company_name, title, doc_type, status, notes, tenant_id)
values (
  'Tenant B Secret Account',
  'Tenant B Secret NDA',
  'nda',
  'draft',
  'Tenant B Secret Legal',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.owned_domains (domain_name, registrar, notes, tenant_id)
values (
  'tenant-b-secret.example',
  'Registrar B',
  'Tenant B Secret Domain',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.customer_documents (company_name, title, file_name, notes, tenant_id)
values (
  'Tenant B Secret Account',
  'Tenant B Secret File',
  'tenant-b-secret.pdf',
  'Tenant B Secret Customer Doc',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.products (sku, name, notes, tenant_id)
values (
  'TB-SKU-001',
  'Tenant B Secret Product',
  'Tenant B Secret Product Notes',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.inventory_movements (sku, qty_delta, reason, reference, tenant_id)
values (
  'TB-SKU-001',
  5,
  'Tenant B Secret Stock Move',
  'TB-INV-001',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.quote_templates (name, description, tenant_id)
values (
  'Tenant B Secret Template',
  'Tenant B Secret Quote Template',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.income (client_source, reference_number, description, tenant_id)
values (
  'Tenant B Secret Client',
  'INC-TB-0001',
  'Tenant B Secret Income',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.follow_up_updates (company, update_text, tenant_id)
values (
  'Tenant B Secret Lead',
  'Tenant B Secret Follow-up Note',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.supplier_commitments (quote_ref, supplier_name, notes, tenant_id)
values (
  'RR-TB-0001',
  'Tenant B Secret Supplier',
  'Tenant B Secret Supplier Commitment',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.saved_views (module_id, name, tenant_id)
values (
  'crm',
  'Tenant B Secret View',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.pipelines (pipeline_key, name, object_type, description, tenant_id)
values (
  'tenant_b_secret',
  'Tenant B Secret Pipeline',
  'deal',
  'Tenant B Secret Pipeline Notes',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.pipeline_stages (pipeline_id, stage_key, label, tenant_id)
select
  id,
  'tenant_b_secret_stage',
  'Tenant B Secret Stage',
  'b0000000-0000-4000-8000-000000000001'
from public.pipelines
where pipeline_key = 'tenant_b_secret'
  and tenant_id = 'b0000000-0000-4000-8000-000000000001';

insert into public.custom_field_definitions (
  object_type, field_key, label, tenant_id
)
values (
  'account',
  'tenant_b_secret_field',
  'Tenant B Secret Field',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.custom_field_values (
  definition_id, object_type, record_id, value, tenant_id
)
select
  id,
  'account',
  'tenant-b-secret-record',
  '"Tenant B Secret Value"'::jsonb,
  'b0000000-0000-4000-8000-000000000001'
from public.custom_field_definitions
where field_key = 'tenant_b_secret_field'
  and tenant_id = 'b0000000-0000-4000-8000-000000000001';

insert into public.numbering_sequences (
  doc_type, division_code, prefix, year_yy, last_seq, tenant_id
)
values (
  'quotation',
  '99',
  'TBS',
  '99',
  1,
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.brand_kits (tenant_id, legal_footer)
values (
  'b0000000-0000-4000-8000-000000000001',
  'Tenant B Secret Brand'
);

insert into public.workflow_definitions (
  workflow_key, name, description, tenant_id
)
values (
  'tenant_b_secret',
  'Tenant B Secret Workflow',
  'Tenant B Secret Workflow Notes',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.workflow_runs (definition_id, tenant_id, status, error_message)
select
  id,
  'b0000000-0000-4000-8000-000000000001',
  'pending',
  'Tenant B Secret Run'
from public.workflow_definitions
where workflow_key = 'tenant_b_secret'
  and tenant_id = 'b0000000-0000-4000-8000-000000000001';

insert into public.event_outbox (event_type, aggregate_type, aggregate_id, tenant_id, status)
values (
  'finalize_quote',
  'quotation',
  'RR-TB-0001',
  'b0000000-0000-4000-8000-000000000001',
  'pending'
);

-- Red Reach-owned outbox row for the reverse check.
insert into public.event_outbox (event_type, aggregate_type, aggregate_id, tenant_id, status)
values (
  'mark_paid',
  'invoice',
  'RR-A-PAID',
  'a0000000-0000-4000-8000-000000000001',
  'pending'
);

------------------------------------------------------------ Red Reach admin cannot see tenant B
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

select pg_temp.expect(
  public.rr_my_tenant_id() = 'a0000000-0000-4000-8000-000000000001'::uuid,
  'redreach admin resolves own tenant id'
);
select pg_temp.expect(
  (select count(*) from public.crm where company_name = 'Tenant B Secret Lead') = 0,
  'redreach admin cannot read tenant B CRM'
);
select pg_temp.expect(
  (select count(*) from public.vendors where company_name = 'Tenant B Secret Vendor') = 0,
  'redreach admin cannot read tenant B vendors'
);
select pg_temp.expect(
  (select count(*) from public.accounts where name = 'Tenant B Secret Account') = 0,
  'redreach admin cannot read tenant B accounts'
);
select pg_temp.expect(
  (select count(*) from public.quotations where reference_number = 'RR-TB-0001') = 0,
  'redreach admin cannot read tenant B quotations'
);
select pg_temp.expect(
  (select count(*) from public.invoices where reference_number = 'RR-TB-INV-1') = 0,
  'redreach admin cannot read tenant B invoices'
);
select pg_temp.expect(
  (select count(*) from public.sales_deals where next_action = 'Call Tenant B') = 0,
  'redreach admin cannot read tenant B sales_deals'
);
select pg_temp.expect(
  (select count(*) from public.expenses where vendor = 'Tenant B Secret Expense') = 0,
  'redreach admin cannot read tenant B expenses'
);
select pg_temp.expect(
  (select count(*) from public.delivery_notes where reference_number = 'DN-TB-0001') = 0,
  'redreach admin cannot read tenant B delivery_notes'
);
select pg_temp.expect(
  (select count(*) from public.payment_log where notes = 'Tenant B Secret Payment') = 0,
  'redreach admin cannot read tenant B payment_log'
);
select pg_temp.expect(
  (select count(*) from public.contracts where notes = 'Tenant B Secret Contract') = 0,
  'redreach admin cannot read tenant B contracts'
);
select pg_temp.expect(
  (select count(*) from public.tickets where subject = 'Tenant B Secret Ticket') = 0,
  'redreach admin cannot read tenant B tickets'
);
select pg_temp.expect(
  (select count(*) from public.ctrm_deals where next_action = 'Call Tenant B CTRM') = 0,
  'redreach admin cannot read tenant B ctrm_deals'
);
select pg_temp.expect(
  (select count(*) from public.legal_documents where notes = 'Tenant B Secret Legal') = 0,
  'redreach admin cannot read tenant B legal_documents'
);
select pg_temp.expect(
  (select count(*) from public.owned_domains where domain_name = 'tenant-b-secret.example') = 0,
  'redreach admin cannot read tenant B owned_domains'
);
select pg_temp.expect(
  (select count(*) from public.customer_documents where notes = 'Tenant B Secret Customer Doc') = 0,
  'redreach admin cannot read tenant B customer_documents'
);
select pg_temp.expect(
  (select count(*) from public.products where sku = 'TB-SKU-001') = 0,
  'redreach admin cannot read tenant B products'
);
select pg_temp.expect(
  (select count(*) from public.inventory_movements where reference = 'TB-INV-001') = 0,
  'redreach admin cannot read tenant B inventory_movements'
);
select pg_temp.expect(
  (select count(*) from public.quote_templates where description = 'Tenant B Secret Quote Template') = 0,
  'redreach admin cannot read tenant B quote_templates'
);
select pg_temp.expect(
  (select count(*) from public.income where reference_number = 'INC-TB-0001') = 0,
  'redreach admin cannot read tenant B income'
);
select pg_temp.expect(
  (select count(*) from public.follow_up_updates where update_text = 'Tenant B Secret Follow-up Note') = 0,
  'redreach admin cannot read tenant B follow_up_updates'
);
select pg_temp.expect(
  (select count(*) from public.supplier_commitments where notes = 'Tenant B Secret Supplier Commitment') = 0,
  'redreach admin cannot read tenant B supplier_commitments'
);
select pg_temp.expect(
  (select count(*) from public.saved_views where name = 'Tenant B Secret View') = 0,
  'redreach admin cannot read tenant B saved_views'
);
select pg_temp.expect(
  (select count(*) from public.pipelines where pipeline_key = 'tenant_b_secret') = 0,
  'redreach admin cannot read tenant B pipelines'
);
select pg_temp.expect(
  (select count(*) from public.pipeline_stages where stage_key = 'tenant_b_secret_stage') = 0,
  'redreach admin cannot read tenant B pipeline_stages'
);
select pg_temp.expect(
  (select count(*) from public.custom_field_definitions where field_key = 'tenant_b_secret_field') = 0,
  'redreach admin cannot read tenant B custom_field_definitions'
);
select pg_temp.expect(
  (select count(*) from public.custom_field_values where record_id = 'tenant-b-secret-record') = 0,
  'redreach admin cannot read tenant B custom_field_values'
);
select pg_temp.expect(
  (select count(*) from public.numbering_sequences where prefix = 'TBS') = 0,
  'redreach admin cannot read tenant B numbering_sequences'
);
select pg_temp.expect(
  (select count(*) from public.brand_kits where legal_footer = 'Tenant B Secret Brand') = 0,
  'redreach admin cannot read tenant B brand_kits'
);
select pg_temp.expect(
  (select count(*) from public.workflow_definitions where workflow_key = 'tenant_b_secret') = 0,
  'redreach admin cannot read tenant B workflow_definitions'
);
select pg_temp.expect(
  (select count(*) from public.workflow_runs where error_message = 'Tenant B Secret Run') = 0,
  'redreach admin cannot read tenant B workflow_runs'
);
select pg_temp.expect(
  (select count(*) from public.event_outbox where aggregate_id = 'RR-TB-0001') = 0,
  'redreach admin cannot read tenant B event_outbox'
);
select pg_temp.expect(
  (select count(*) from public.tenants where slug = 'demo-b') = 0,
  'redreach admin cannot see other tenants row'
);
select pg_temp.expect(
  (select count(*) from public.companies where name = 'Demo Co B') = 0,
  'redreach admin cannot see tenant B companies'
);
select pg_temp.expect(
  (select count(*) from public.app_users where lower(email) = 'admin@demo-b.test') = 0,
  'redreach admin cannot see tenant B users'
);

------------------------------------------------------------ Tenant B admin cannot see Red Reach CRM seed
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

select pg_temp.expect(
  public.rr_my_tenant_id() = 'b0000000-0000-4000-8000-000000000001'::uuid,
  'demo-b admin resolves own tenant id'
);
select pg_temp.expect(
  (select count(*) from public.crm where company_name = 'Lead Co') = 0,
  'tenant B admin cannot read redreach CRM'
);
select pg_temp.expect(
  (select count(*) from public.crm where company_name = 'Tenant B Secret Lead') = 1,
  'tenant B admin can read own CRM'
);
select pg_temp.expect(
  (select count(*) from public.accounts where name = 'Tenant B Secret Account') = 1,
  'tenant B admin can read own accounts'
);
select pg_temp.expect(
  (select count(*) from public.quotations where reference_number = 'RR-TB-0001') = 1,
  'tenant B admin can read own quotations'
);
select pg_temp.expect(
  (select count(*) from public.invoices where reference_number = 'RR-TB-INV-1') = 1,
  'tenant B admin can read own invoices'
);
select pg_temp.expect(
  (select count(*) from public.sales_deals where next_action = 'Call Tenant B') = 1,
  'tenant B admin can read own sales_deals'
);
select pg_temp.expect(
  (select count(*) from public.expenses where vendor = 'Tenant B Secret Expense') = 1,
  'tenant B admin can read own expenses'
);
select pg_temp.expect(
  (select count(*) from public.delivery_notes where reference_number = 'DN-TB-0001') = 1,
  'tenant B admin can read own delivery_notes'
);
select pg_temp.expect(
  (select count(*) from public.payment_log where notes = 'Tenant B Secret Payment') = 1,
  'tenant B admin can read own payment_log'
);
select pg_temp.expect(
  (select count(*) from public.contracts where notes = 'Tenant B Secret Contract') = 1,
  'tenant B admin can read own contracts'
);
select pg_temp.expect(
  (select count(*) from public.tickets where subject = 'Tenant B Secret Ticket') = 1,
  'tenant B admin can read own tickets'
);
select pg_temp.expect(
  (select count(*) from public.ctrm_deals where next_action = 'Call Tenant B CTRM') = 1,
  'tenant B admin can read own ctrm_deals'
);
select pg_temp.expect(
  (select count(*) from public.legal_documents where notes = 'Tenant B Secret Legal') = 1,
  'tenant B admin can read own legal_documents'
);
select pg_temp.expect(
  (select count(*) from public.owned_domains where domain_name = 'tenant-b-secret.example') = 1,
  'tenant B admin can read own owned_domains'
);
select pg_temp.expect(
  (select count(*) from public.customer_documents where notes = 'Tenant B Secret Customer Doc') = 1,
  'tenant B admin can read own customer_documents'
);
select pg_temp.expect(
  (select count(*) from public.products where sku = 'TB-SKU-001') = 1,
  'tenant B admin can read own products'
);
select pg_temp.expect(
  (select count(*) from public.inventory_movements where reference = 'TB-INV-001') = 1,
  'tenant B admin can read own inventory_movements'
);
select pg_temp.expect(
  (select count(*) from public.quote_templates where description = 'Tenant B Secret Quote Template') = 1,
  'tenant B admin can read own quote_templates'
);
select pg_temp.expect(
  (select count(*) from public.income where reference_number = 'INC-TB-0001') = 1,
  'tenant B admin can read own income'
);
select pg_temp.expect(
  (select count(*) from public.follow_up_updates where update_text = 'Tenant B Secret Follow-up Note') = 1,
  'tenant B admin can read own follow_up_updates'
);
select pg_temp.expect(
  (select count(*) from public.supplier_commitments where notes = 'Tenant B Secret Supplier Commitment') = 1,
  'tenant B admin can read own supplier_commitments'
);
select pg_temp.expect(
  (select count(*) from public.saved_views where name = 'Tenant B Secret View') = 1,
  'tenant B admin can read own saved_views'
);
select pg_temp.expect(
  (select count(*) from public.pipelines where pipeline_key = 'tenant_b_secret') = 1,
  'tenant B admin can read own pipelines'
);
select pg_temp.expect(
  (select count(*) from public.pipeline_stages where stage_key = 'tenant_b_secret_stage') = 1,
  'tenant B admin can read own pipeline_stages'
);
select pg_temp.expect(
  (select count(*) from public.custom_field_definitions where field_key = 'tenant_b_secret_field') = 1,
  'tenant B admin can read own custom_field_definitions'
);
select pg_temp.expect(
  (select count(*) from public.custom_field_values where record_id = 'tenant-b-secret-record') = 1,
  'tenant B admin can read own custom_field_values'
);
select pg_temp.expect(
  (select count(*) from public.numbering_sequences where prefix = 'TBS') = 1,
  'tenant B admin can read own numbering_sequences'
);
select pg_temp.expect(
  (select count(*) from public.brand_kits where legal_footer = 'Tenant B Secret Brand') = 1,
  'tenant B admin can read own brand_kits'
);
select pg_temp.expect(
  (select count(*) from public.workflow_definitions where workflow_key = 'tenant_b_secret') = 1,
  'tenant B admin can read own workflow_definitions'
);
select pg_temp.expect(
  (select count(*) from public.workflow_runs where error_message = 'Tenant B Secret Run') = 1,
  'tenant B admin can read own workflow_runs'
);
select pg_temp.expect(
  (select count(*) from public.event_outbox where aggregate_id = 'RR-TB-0001') = 1,
  'tenant B admin can read own event_outbox'
);
select pg_temp.expect(
  (select count(*) from public.event_outbox where aggregate_id = 'RR-A-PAID') = 0,
  'tenant B admin cannot read redreach event_outbox'
);
select pg_temp.expect(
  (select count(*) from public.tenants) = 1,
  'tenant B admin sees only own tenant'
);
select pg_temp.expect(
  (select slug from public.tenants) = 'demo-b',
  'tenant B admin sees demo-b slug'
);

------------------------------------------------------------ Cannot insert into another tenant
do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.crm (company_name, tenant_id)
    values ('Forged into A', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin inserted into redreach tenant';
  end if;
  raise notice 'ok - tenant B cannot insert into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.event_outbox (event_type, aggregate_type, aggregate_id, tenant_id)
    values ('finalize_quote', 'quotation', 'FORGED', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged event_outbox into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert event_outbox into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.invoices (client, reference_number, tenant_id)
    values ('Forged invoice', 'RR-FORGED-1', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged invoice into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert invoice into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.expenses (vendor, tenant_id)
    values ('Forged expense', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged expense into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert expense into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.delivery_notes (client, reference_number, tenant_id)
    values ('Forged DN', 'DN-FORGED-1', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged delivery_note into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert delivery_note into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.payment_log (invoice_ref, client, amount, tenant_id)
    values ('RR-FORGED-PAY', 'Forged', 1, 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged payment_log into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert payment_log into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
  acct uuid;
begin
  select id into acct from public.accounts where reference = 'AC-TB-0001' limit 1;
  begin
    insert into public.contracts (account_id, monthly_fee, tenant_id)
    values (acct, 1, 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged contract into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert contract into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
  acct uuid;
begin
  select id into acct from public.accounts where reference = 'AC-TB-0001' limit 1;
  begin
    insert into public.tickets (account_id, subject, tenant_id)
    values (acct, 'Forged ticket', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged ticket into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert ticket into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.legal_documents (company_name, title, tenant_id)
    values ('Forged Co', 'Forged NDA', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged legal_document into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert legal_document into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.owned_domains (domain_name, registrar, tenant_id)
    values ('forged-into-a.example', 'Forged', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged owned_domain into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert owned_domain into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.customer_documents (company_name, title, tenant_id)
    values ('Forged Co', 'Forged File', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged customer_document into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert customer_document into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.products (sku, name, tenant_id)
    values ('FORGED-SKU', 'Forged Product', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged product into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert product into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.inventory_movements (sku, qty_delta, reason, tenant_id)
    values ('FORGED-SKU', 1, 'Forged move', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged inventory_movement into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert inventory_movement into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.quote_templates (name, tenant_id)
    values ('Forged Template', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged quote_template into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert quote_template into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.income (client_source, reference_number, tenant_id)
    values ('Forged Client', 'INC-FORGED', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged income into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert income into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.follow_up_updates (company, update_text, tenant_id)
    values ('Forged Co', 'Forged note', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged follow_up_update into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert follow_up_update into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.supplier_commitments (supplier_name, notes, tenant_id)
    values ('Forged Supplier', 'Forged commitment', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged supplier_commitment into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert supplier_commitment into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.saved_views (module_id, name, tenant_id)
    values ('crm', 'Forged View', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged saved_view into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert saved_view into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.pipelines (pipeline_key, name, object_type, tenant_id)
    values ('forged_pipeline', 'Forged Pipeline', 'deal', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged pipeline into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert pipeline into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.pipeline_stages (pipeline_id, stage_key, label, tenant_id)
    select
      id,
      'forged_stage',
      'Forged Stage',
      'a0000000-0000-4000-8000-000000000001'
    from public.pipelines
    where pipeline_key = 'tenant_b_secret';
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged pipeline_stage into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert pipeline_stage into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.custom_field_definitions (
      object_type, field_key, label, tenant_id
    )
    values (
      'account',
      'forged_field',
      'Forged Field',
      'a0000000-0000-4000-8000-000000000001'
    );
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged custom_field_definition into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert custom_field_definition into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.custom_field_values (
      definition_id, object_type, record_id, value, tenant_id
    )
    select
      id,
      'account',
      'forged-record',
      '"Forged Value"'::jsonb,
      'a0000000-0000-4000-8000-000000000001'
    from public.custom_field_definitions
    where field_key = 'tenant_b_secret_field';
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged custom_field_value into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert custom_field_value into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.numbering_sequences (
      doc_type, division_code, prefix, year_yy, tenant_id
    )
    values (
      'quotation',
      '98',
      'FRG',
      '98',
      'a0000000-0000-4000-8000-000000000001'
    );
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged numbering_sequence into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert numbering_sequence into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.brand_kits (tenant_id, legal_footer)
    values (
      'a0000000-0000-4000-8000-000000000001',
      'Forged Brand Kit'
    );
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged brand_kit into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert brand_kit into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.workflow_definitions (workflow_key, name, tenant_id)
    values ('forged_workflow', 'Forged Workflow', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged workflow_definition into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert workflow_definition into redreach tenant_id';
end $$;

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.workflow_runs (definition_id, tenant_id, error_message)
    select
      id,
      'a0000000-0000-4000-8000-000000000001',
      'Forged Run'
    from public.workflow_definitions
    where workflow_key = 'tenant_b_secret';
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin forged workflow_run into redreach';
  end if;
  raise notice 'ok - tenant B cannot insert workflow_run into redreach tenant_id';
end $$;

------------------------------------------------------------ Append-only audit_log (authenticated cannot mutate)
do $$
declare
  failed boolean := false;
  rid bigint;
begin
  -- Seed a row as the table owner (security definer / migration role), then
  -- prove authenticated cannot insert, update or delete it.
  reset role;
  insert into public.audit_log (table_name, operation, row_id, actor_email)
  values ('tenant_isolation_test', 'INSERT', 'ci-append-only', 'system')
  returning id into rid;

  set role authenticated;
  set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

  begin
    insert into public.audit_log (table_name, operation, row_id, actor_email)
    values ('tenant_isolation_test', 'INSERT', 'forged', 'evil');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: authenticated inserted into audit_log';
  end if;
  raise notice 'ok - authenticated cannot insert audit_log';

  failed := false;
  begin
    update public.audit_log set actor_email = 'tampered' where id = rid;
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: authenticated updated audit_log';
  end if;
  raise notice 'ok - authenticated cannot update audit_log';

  failed := false;
  begin
    delete from public.audit_log where id = rid;
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: authenticated deleted audit_log';
  end if;
  raise notice 'ok - authenticated cannot delete audit_log';
end $$;

reset role;

-- Clean the append-only probe row (superuser / migration role).
delete from public.audit_log where table_name = 'tenant_isolation_test' and row_id in ('ci-append-only', 'forged');

-- Leave no active non-@redreach.ae logins behind (catch_up_check_test expects OK).
update public.app_users
set active = false
where lower(email) = 'admin@demo-b.test';

select pg_temp.expect(true, 'tenant isolation suite complete');
