-- Link existing clients, quotations and invoices to accounts.
-- Paste into the Supabase SQL editor one step at a time. Needs
-- migrations/20261023090000_accounts_foundation.sql applied first.
--
-- Matching is by company name after dropping case, punctuation and legal
-- suffixes (LLC, FZE, Trading, ...). Nothing is renamed: only the empty
-- account_id column is filled. Invoice numbers never change.

-- 1. Dry run. Changes nothing. Review every row.
--    kind = match                 will be linked
--    kind = ambiguous             two accounts share the same name, left alone
--    kind = account_without_match an account with nothing to link (check spelling)
--    kind = unmatched             an existing row with no account (expected for Threads, Wanders, ...)
--    kind = already_linked        left as it is
select kind, table_name, row_label, account_name, account_reference
from rr_link_accounts()
where kind <> 'unmatched'
order by kind, table_name, row_label;

-- Unmatched rows, grouped, if you want to see them:
-- select table_name, row_label from rr_link_accounts() where kind = 'unmatched' order by 1, 2;

-- 2. Apply. Copy the batch_id from the result; you need it to undo.
-- select distinct batch_id, count(*) over () as rows_linked
-- from rr_link_accounts(p_dry_run => false) where kind = 'match';

-- 3. Undo one apply (returns how many rows were cleared).
-- select rr_unlink_accounts('<batch_id>');
