-- Legal documents vault: NDAs (and later agreements) with client e-sign links.
-- Pattern matches quote accept: SHA-256 token hash, PDF snapshot, audit trail.
-- Safe to re-run.

begin;

------------------------------------------------------------
-- NDA / legal wording templates (lawyer-approved versions)
------------------------------------------------------------
create table if not exists public.nda_templates (
  id uuid primary key default uuid_generate_v4(),
  version integer not null unique check (version > 0),
  title text not null default 'Non-disclosure agreement',
  body text not null check (btrim(body) <> ''),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approved_by text not null default '',
  approved_at timestamptz,
  approval_note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nda_templates_approval check (
    status = 'draft' or (btrim(approved_by) <> '' and approved_at is not null)
  )
);
create unique index if not exists nda_templates_one_approved
  on public.nda_templates ((true)) where status = 'approved';

create or replace function public.rr_nda_template_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Approved NDA templates are kept as a record and cannot be deleted.';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (
    new.body is distinct from old.body
    or new.title is distinct from old.title
    or new.version is distinct from old.version
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
  ) then
    raise exception 'An approved NDA template cannot be changed. Start a new draft instead.';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'A retired NDA template cannot be used again. Start a new draft from it instead.';
  end if;
  return new;
end $$;

drop trigger if exists rr_nda_template_lock on public.nda_templates;
create trigger rr_nda_template_lock
  before update or delete on public.nda_templates
  for each row execute function public.rr_nda_template_lock();

------------------------------------------------------------
-- Vault: one row per legal document for a company
------------------------------------------------------------
create table if not exists public.legal_documents (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null default '',
  crm_id text not null default '',
  doc_type text not null default 'nda' check (doc_type in ('nda', 'service_agreement', 'other')),
  title text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'expired', 'void')),
  party_name text not null default '',
  party_email text not null default '',
  party_company text not null default '',
  template_id uuid references public.nda_templates(id) on delete set null,
  template_version integer,
  related_ref text not null default '',
  customer_document_id uuid,
  drive_url text not null default '',
  unsigned_file_name text not null default '',
  signed_file_name text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  signed_at timestamptz,
  expires_at timestamptz,
  voided_at timestamptz,
  notes text not null default ''
);
create index if not exists legal_documents_company_idx
  on public.legal_documents (lower(company_name));
create index if not exists legal_documents_crm_idx
  on public.legal_documents (crm_id);
create index if not exists legal_documents_status_idx
  on public.legal_documents (status);

------------------------------------------------------------
-- Sign links (token hash only) + PDF snapshot + signature audit
------------------------------------------------------------
create table if not exists public.legal_sign_links (
  id uuid primary key default uuid_generate_v4(),
  legal_document_id uuid not null references public.legal_documents(id) on delete cascade,
  label text not null default '',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_opened_at timestamptz,
  signed_at timestamptz,
  signed_name text not null default ''
);
create index if not exists legal_sign_links_doc_idx on public.legal_sign_links (legal_document_id);

create table if not exists public.legal_sign_pdfs (
  link_id uuid primary key references public.legal_sign_links(id) on delete cascade,
  pdf_base64 text not null check (char_length(pdf_base64) between 1 and 8000000)
);

create table if not exists public.legal_signatures (
  id uuid primary key default uuid_generate_v4(),
  link_id uuid not null unique references public.legal_sign_links(id) on delete cascade,
  legal_document_id uuid not null references public.legal_documents(id) on delete cascade,
  signed_name text not null,
  signed_date date not null,
  signed_at timestamptz not null default now(),
  signature_png_base64 text not null default '',
  signed_pdf_base64 text not null default '',
  ip text not null default '',
  user_agent text not null default ''
);
create index if not exists legal_signatures_doc_idx on public.legal_signatures (legal_document_id);

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.nda_templates enable row level security;
alter table public.legal_documents enable row level security;
alter table public.legal_sign_links enable row level security;
alter table public.legal_sign_pdfs enable row level security;
alter table public.legal_signatures enable row level security;

revoke all on public.nda_templates from anon;
revoke all on public.legal_documents from anon;
revoke all on public.legal_sign_links from anon;
revoke all on public.legal_sign_pdfs from anon;
revoke all on public.legal_signatures from anon;

grant select on public.nda_templates to authenticated;
grant insert, update, delete on public.nda_templates to authenticated;

grant select, insert, update, delete on public.legal_documents to authenticated;
grant select, insert, update, delete on public.legal_sign_links to authenticated;
grant select, insert, delete on public.legal_sign_pdfs to authenticated;
grant select on public.legal_signatures to authenticated;

drop policy if exists "Staff read NDA templates" on public.nda_templates;
drop policy if exists "Managers edit NDA templates" on public.nda_templates;
create policy "Staff read NDA templates" on public.nda_templates
  for select to authenticated using (public.rr_is_staff());
create policy "Managers edit NDA templates" on public.nda_templates
  for all to authenticated
  using (public.rr_is_manager_or_admin())
  with check (public.rr_is_manager_or_admin());

drop policy if exists "Staff manage legal documents" on public.legal_documents;
create policy "Staff manage legal documents" on public.legal_documents
  for all to authenticated
  using (public.rr_is_staff())
  with check (public.rr_is_staff());

drop policy if exists "Staff read sign links" on public.legal_sign_links;
drop policy if exists "Staff add sign links" on public.legal_sign_links;
drop policy if exists "Staff turn off sign links" on public.legal_sign_links;
drop policy if exists "Admins delete sign links" on public.legal_sign_links;
create policy "Staff read sign links" on public.legal_sign_links
  for select to authenticated using (public.rr_is_staff());
create policy "Staff add sign links" on public.legal_sign_links
  for insert to authenticated
  with check (public.rr_is_staff() and signed_at is null and signed_name = '' and revoked_at is null);
create policy "Staff turn off sign links" on public.legal_sign_links
  for update to authenticated
  using (public.rr_is_staff() and signed_at is null)
  with check (public.rr_is_staff() and signed_at is null and signed_name = '');
create policy "Admins delete sign links" on public.legal_sign_links
  for delete to authenticated using (public.rr_is_admin());

drop policy if exists "Staff read sign PDFs" on public.legal_sign_pdfs;
drop policy if exists "Staff add sign PDFs" on public.legal_sign_pdfs;
drop policy if exists "Admins delete sign PDFs" on public.legal_sign_pdfs;
create policy "Staff read sign PDFs" on public.legal_sign_pdfs
  for select to authenticated using (public.rr_is_staff());
create policy "Staff add sign PDFs" on public.legal_sign_pdfs
  for insert to authenticated with check (public.rr_is_staff());
create policy "Admins delete sign PDFs" on public.legal_sign_pdfs
  for delete to authenticated using (public.rr_is_admin());

drop policy if exists "Staff read signatures" on public.legal_signatures;
create policy "Staff read signatures" on public.legal_signatures
  for select to authenticated using (public.rr_is_staff());

------------------------------------------------------------
-- Starter NDA draft (version 1) if none exist
------------------------------------------------------------
insert into public.nda_templates (id, version, title, body, status, created_by)
select
  uuid_generate_v4(),
  1,
  'Non-disclosure agreement',
  $nda$# Non-disclosure agreement

This Non-Disclosure Agreement ("Agreement") is entered into as of {{effective_date}} between:

**Disclosing party:** {{provider_name}} ("Red Reach"), of {{provider_address}}.

**Receiving party:** {{party_company}} ("Recipient"), represented by {{party_name}}{{party_email_clause}}.

## 1. Purpose
The parties wish to explore a possible business relationship regarding uniforms, merchandise, or related services. In that discussion, Red Reach may share confidential commercial information with the Recipient.

## 2. Confidential information
"Confidential Information" means non-public information disclosed by Red Reach, including pricing, quotations, designs, artwork, client lists, manufacturing details, and business plans, whether written, oral, or electronic. It does not include information that (a) is or becomes public other than by breach of this Agreement, (b) was already known to the Recipient without duty of confidence, (c) is independently developed without use of Confidential Information, or (d) is required to be disclosed by law (with prior notice to Red Reach where legally allowed).

## 3. Obligations
The Recipient shall:
- use Confidential Information only for evaluating or performing the contemplated work with Red Reach;
- not disclose it to third parties without Red Reach's prior written consent, except to employees or advisers who need it and are bound by similar duties;
- protect it with at least reasonable care;
- return or destroy Confidential Information on Red Reach's written request, except for copies retained under legal hold.

## 4. Term
This Agreement starts on {{effective_date}} and continues for {{term_years}} years, unless ended earlier in writing. Confidentiality obligations survive for {{survive_years}} years after disclosure of the relevant information.

## 5. No licence
Nothing in this Agreement grants a licence to any intellectual property of Red Reach.

## 6. Governing law
This Agreement is governed by the laws of the {{governing_law}}. The courts of {{governing_courts}} have non-exclusive jurisdiction.

## 7. Entire agreement
This Agreement is the entire understanding on confidentiality for the purpose above and may be signed in counterparts (including electronic signature).

[signatures]
$nda$,
  'draft',
  'system'
where not exists (select 1 from public.nda_templates);

notify pgrst, 'reload schema';

commit;
