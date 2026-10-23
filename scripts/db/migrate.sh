#!/usr/bin/env bash
# Applies every migration in supabase/migrations, in file name order, to the
# database given. Used to set up and update the STAGING database. Each
# migration is safe to run again; the baseline is only run on an empty
# database.
#
# Usage: migrate.sh <database url>
set -euo pipefail
db="$1"
cd "$(dirname "$0")/../../supabase/migrations"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 "$db")

has_schema="$("${PSQL[@]}" -Atc "select to_regclass('public.app_users') is not null")"
for f in *.sql; do
  if [[ $f == *baseline_schema.sql && $has_schema == t ]]; then
    echo "skip $f (database already has the base tables)"
    continue
  fi
  echo "apply $f"
  "${PSQL[@]}" -c "set client_min_messages = warning" -f "$f"
done
echo "All migrations applied."
