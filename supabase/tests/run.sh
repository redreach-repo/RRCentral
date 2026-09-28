#!/usr/bin/env bash
# Apply every migration to a fresh database (twice, to prove they are
# re-runnable) and run the RLS tests. Needs psql + a Postgres superuser via
# the usual PG* env vars.  Usage: bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${RR_TEST_DB:-rr_rls_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f tests/supabase_stub.sql

for pass in 1 2; do
  for f in migrations/*.sql; do
    # The baseline uses plain CREATE TABLE, so only apply it on the first pass.
    if [[ $pass == 2 && $f == *baseline_schema.sql ]]; then continue; fi
    echo "pass $pass: $f"
    "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null 2>&1 || "${PSQL[@]}" -d "$DB" -f "$f"
  done
done

"${PSQL[@]}" -d "$DB" -o /dev/null -f tests/rls_test.sql 2>&1 | sed -n "s/.*NOTICE:  //p"
echo "RLS tests passed"
