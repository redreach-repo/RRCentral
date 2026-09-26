-- Add VAT to the quotation subtotal, then give that VAT as a commercial discount.
alter table quotations add column if not exists offset_vat boolean not null default false;

update quotations
set
  offset_vat = true,
  discount_percent = 0,
  discount_amount = 0,
  amount = 4535
where reference_number = 'RR-01-26003';

notify pgrst, 'reload schema';
