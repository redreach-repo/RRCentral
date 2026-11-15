-- Trading pack leftover: soft credit limit on accounts.

alter table public.accounts
  add column if not exists credit_limit_aed numeric(14, 2);

alter table public.accounts
  add column if not exists credit_hold boolean not null default false;

comment on column public.accounts.credit_limit_aed is
  'Optional trading credit limit AED (null = unlimited). Soft gate only.';
comment on column public.accounts.credit_hold is
  'When true, block new quotes/invoices until cleared (soft product rule).';
