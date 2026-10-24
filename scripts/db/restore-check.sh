#!/usr/bin/env bash
# Proves a backup can be restored: restores a pg_dump file into an EMPTY
# scratch database and compares every table's row count with the counts
# taken from the live database when the backup was made.
#
# Usage: restore-check.sh <backup.dump> <empty scratch db url> <expected-counts.tsv>
#   expected-counts.tsv comes from: psql "$LIVE_DB_URL" -AtF $'\t' -f table-counts.sql
#
# Never point the second argument at the live database.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dump="$1"; target="$2"; expected="$3"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

if [[ "$("${PSQL[@]}" "$target" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")" != "0" ]]; then
  echo "The scratch database is not empty. Refusing to restore into it." >&2
  exit 1
fi

"${PSQL[@]}" "$target" -f "$here/restore-prep.sql"

# Supabase-only objects (event triggers, some auth functions) may not
# restore on plain Postgres; that is fine as long as the data comes back.
set +e
pg_restore --no-owner --no-privileges --dbname "$target" "$dump" 2> restore-errors.log
set -e
echo "pg_restore reported $(grep -c 'error:' restore-errors.log || true) non-fatal errors (see restore-errors.log)."

psql -X -q "$target" -AtF $'\t' -f "$here/table-counts.sql" > restored-counts.tsv

# Compare: every table must come back, with its row count within 1% (or 5
# rows) of the live count, allowing for writes during the backup.
status=0
summary="| Table | Live | Restored |\n|---|---:|---:|\n"
while IFS=$'\t' read -r table live; do
  [[ -z "$table" ]] && continue
  got="$(awk -F'\t' -v t="$table" '$1 == t { print $2 }' restored-counts.tsv)"
  if [[ -z "$got" ]]; then
    echo "MISSING: $table did not come back" >&2; status=1; got="missing"
  else
    diff=$(( got > live ? got - live : live - got ))
    allowed=$(( live / 100 > 5 ? live / 100 : 5 ))
    if (( diff > allowed )); then
      echo "MISMATCH: $table live $live, restored $got" >&2; status=1
    fi
  fi
  summary+="| $table | $live | $got |\n"
done < "$expected"

tables=$(grep -c . "$expected" || true)
rows=$(awk -F'\t' '{ s += $2 } END { print s + 0 }' restored-counts.tsv)
if [[ $status -eq 0 ]]; then
  echo "Restore check passed: $tables tables, $rows rows restored."
else
  echo "Restore check FAILED." >&2
fi
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  { echo "### Backup restore check: $([[ $status -eq 0 ]] && echo passed || echo FAILED)"; echo; echo "$tables tables, $rows rows restored."; echo; printf "%b" "$summary"; } >> "$GITHUB_STEP_SUMMARY"
fi
exit $status
