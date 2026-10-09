#!/usr/bin/env bash
# Purge files that must never have been public from ALL git history.
# Owner action: review docs/SECURITY.md, then run locally with a fresh clone backup.
#
# Requires: git-filter-repo (https://github.com/newren/git-filter-repo)
#
# Usage:
#   ./scripts/purge-sensitive-git-history.sh
#   git push --force --all
#   git push --force --tags
#   Open a GitHub support ticket to purge cached views if needed.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "This rewrites git history. Ensure you have a backup clone and team coordination."
echo "Purging: migration-data*.json, rrcentral-backup-*.json under app/public/"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "Install git-filter-repo first." >&2
  exit 1
fi

git filter-repo --force \
  --path app/public/migration-data.json --invert-paths \
  --path app/public/migration-data-clean.json --invert-paths \
  --path-glob 'app/public/rrcentral-backup-*.json' --invert-paths

echo "Done. Force-push all branches/tags, then rotate any credentials that appeared in those files."
