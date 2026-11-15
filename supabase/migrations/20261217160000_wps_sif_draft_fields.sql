-- WPS SIF draft fields on HR (still not bank-certified / not legal advice).

alter table public.hr_employees
  add column if not exists labour_card_no text not null default '',
  add column if not exists bank_routing_code text not null default '';

comment on column public.hr_employees.labour_card_no is
  'MoL / WPS personal number for SIF drafts — verify before live upload.';
comment on column public.hr_employees.bank_routing_code is
  'Bank routing / agent code (typically 9 digits) for SIF drafts.';
