-- PR N: pay by card. A Stripe payment link on a finalised invoice, and the
-- RR Central Stripe webhook that marks it paid. Bank transfer stays manual.
--
-- invoices.currency: the invoice's currency (it was implied by the quote).
-- invoices.pay_link_*: the current payment link and the amount it asks for.
-- payment_log.currency: the currency each payment was made in.
-- payment_log.external_ref: the Stripe checkout id, so a retried webhook is
-- recorded once. Existing RLS applies unchanged. Safe to run more than once.

alter table public.invoices add column if not exists currency text not null default 'AED';
alter table public.invoices add column if not exists pay_link_id text not null default '';
alter table public.invoices add column if not exists pay_link_url text not null default '';
alter table public.invoices add column if not exists pay_link_amount numeric(14,2);
alter table public.invoices add column if not exists pay_link_created_at timestamptz;

-- Invoices made from a quote in another currency are in that currency.
update public.invoices i
set currency = upper(q.quotation_currency)
from public.quotations q
where q.reference_number = i.reference_number
  and i.reference_number <> ''
  and i.currency = 'AED'
  and coalesce(q.quotation_currency, '') not in ('', 'AED');

alter table public.payment_log add column if not exists currency text not null default 'AED';
alter table public.payment_log add column if not exists external_ref text not null default '';
create unique index if not exists payment_log_external_ref_key on public.payment_log (external_ref) where external_ref <> '';

-- Earlier payments are in their invoice's currency.
update public.payment_log p
set currency = i.currency
from public.invoices i
where i.reference_number = p.invoice_ref
  and p.invoice_ref <> ''
  and p.currency = 'AED'
  and i.currency <> 'AED';

notify pgrst, 'reload schema';
