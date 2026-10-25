#!/usr/bin/env bash
# Purge files that must never have been public from ALL git history.
# Owner action: review docs/SECURITY.md, then run locally with a fresh clone backup.
#
# Requires: git-filter-repo (https://github.com/newren/git-filter-repo)
#
# Usage:
#   Full steps, including the push and what to rotate: docs/SECURITY.md
#   ("Purge the old export and invoice PDF from git history").

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "This rewrites git history. Ensure you have a backup clone and team coordination."
echo "Purging: CRM exports, backups and customer invoice PDFs under app/public/"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "Install git-filter-repo first." >&2
  exit 1
fi

# One --invert-paths at the end applies to every --path before it.
git filter-repo --force \
  --path app/public/migration-data.json \
  --path app/public/migration-data-clean.json \
  --path-glob 'app/public/rrcentral-backup-*.json' \
  --path app/public/invoices/ \
  --invert-paths

echo "Done. Force-push all branches/tags, then rotate any credentials that appeared in those files."
