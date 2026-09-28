-- Shared deal key so sibling quote branches can share one supplier invoice / cost.
alter table quotations add column if not exists deal_ref text not null default '';

-- Backfill: each quote is its own deal until branched.
update quotations
set deal_ref = coalesce(nullif(trim(base_reference), ''), nullif(trim(reference_number), ''), quote_id)
where trim(coalesce(deal_ref, '')) = ''
  and coalesce(nullif(trim(base_reference), ''), nullif(trim(reference_number), ''), quote_id) is not null;

create index if not exists idx_quotations_deal_ref on quotations(deal_ref);

notify pgrst, 'reload schema';
