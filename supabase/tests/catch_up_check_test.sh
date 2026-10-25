#!/usr/bin/env bash
# Runs supabase/scripts/check-catch-up-skipped.sql on the test database twice:
# as migrated (every item applied) and with production-like differences set
# up inside a transaction that is rolled back. Checks the status column.
# Usage (after run.sh): bash supabase/tests/catch_up_check_test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${RR_TEST_DB:-rr_rls_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X -At -F '|' -d "$DB")

# Supabase keeps pgcrypto in the extensions schema; the stub does not.
"${PSQL[@]}" -c "create schema if not exists extensions" \
  -c "do \$\$ begin if not exists (select 1 from pg_extension where extname = 'pgcrypto') then create extension pgcrypto schema extensions; end if; end \$\$"

fail=0
expect() { # $1 output, $2 row number, $3 expected status, $4 label
  local got
  got=$(printf '%s\n' "$1" | awk -F'|' -v n="$2" '$1 == n { print $5 }')
  if [[ "$got" == "$3" ]]; then echo "ok - $4: $got"; else echo "FAIL - $4: expected $3, got '${got}'" >&2; fail=1; fi
}

applied=$("${PSQL[@]}" -f scripts/check-catch-up-skipped.sql)
rows=$(printf '%s\n' "$applied" | grep -c '|' || true)
[[ "$rows" == 6 ]] || { echo "FAIL - expected 6 rows, got $rows" >&2; fail=1; }
expect "$applied" 1 OK "email login only, as migrated"
expect "$applied" 2 CHECK "default admin without a password column (CI stub)"
expect "$applied" 3 OK "attachments, as migrated"
expect "$applied" 4 OK "company address, as migrated"
expect "$applied" 5 OK "Mass Allied, as migrated"
expect "$applied" 6 CHECK "quote RR-01-26003 missing"

different=$("${PSQL[@]}" <<'SQL'
begin;
insert into public.app_users (email, name, role, active) values ('someone@gmail.com', 'Outside', 'sales', true);
alter table auth.users add column if not exists encrypted_password text;
update auth.users set encrypted_password = extensions.crypt('RedReach2026#', extensions.gen_salt('bf'))
  where lower(email) = 'info@redreach.ae';
alter table public.attachments drop constraint if exists attachments_url_no_data;
alter table public.attachments drop constraint if exists attachments_url_https_or_empty;
insert into public.attachments (entity_type, file_name, url) values ('invoice', 'x.pdf', 'data:application/pdf;base64,AAAA');
update public.app_settings set value = 'P.O. Box 6641, Dubai, UAE' where key = 'address';
update public.clients set trn = '' where company_name = 'Mass Allied Freighters L.L.C';
insert into public.quotations (reference_number, client, amount) values ('RR-01-26003', 'Test', 5000);
\i scripts/check-catch-up-skipped.sql
rollback;
SQL
)
expect "$different" 1 DIFFERENT "an active gmail login"
expect "$different" 2 URGENT "info@ still on the public password"
expect "$different" 3 DIFFERENT "a data: attachment and no rules"
expect "$different" 4 DIFFERENT "old Dubai address"
expect "$different" 5 DIFFERENT "Mass Allied without TRN"
expect "$different" 6 DIFFERENT "quote without offset VAT"

# The clean-up refuses while a data: file is stored, and deletes nothing.
refused=$("${PSQL[@]}" 2>&1 <<'SQL' || true
begin;
alter table public.attachments drop constraint if exists attachments_url_no_data;
alter table public.attachments drop constraint if exists attachments_url_https_or_empty;
insert into public.attachments (entity_type, file_name, url) values ('invoice', 'x.pdf', 'data:application/pdf;base64,AAAA');
\i scripts/attachments-link-only-rules.sql
SQL
)
if [[ "$refused" == *"Not changed: 1 attachments"* ]]; then echo "ok - clean-up refuses while a file is stored"; else echo "FAIL - clean-up did not refuse: $refused" >&2; fail=1; fi
"${PSQL[@]}" -f scripts/attachments-link-only-rules.sql
echo "ok - clean-up runs again on a clean database"

# Read only: running it changed nothing.
after=$("${PSQL[@]}" -f scripts/check-catch-up-skipped.sql)
[[ "$after" == "$applied" ]] || { echo "FAIL - the check changed data" >&2; fail=1; }

[[ $fail == 0 ]] && echo "Catch-up check tests passed"
exit $fail
