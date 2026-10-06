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
    if ! "${PSQL[@]}" -d "$DB" -f "$f"; then
      echo "FAILED applying $f (pass $pass)" >&2
      exit 1
    fi
  done
done

echo "Running RLS tests…"
set +e
"${PSQL[@]}" -d "$DB" -f tests/rls_test.sql > /tmp/rls_test_out.txt 2>&1
rls_rc=$?
set -e
sed -n "s/.*NOTICE:  //p" /tmp/rls_test_out.txt || true
if [[ $rls_rc -ne 0 ]] || grep -q "RLS TEST FAILED\|ERROR:" /tmp/rls_test_out.txt; then
  echo "RLS tests failed — full output:" >&2
  cat /tmp/rls_test_out.txt >&2
  exit 1
fi
echo "RLS tests passed"
