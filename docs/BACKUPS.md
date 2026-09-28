# Backups & restore

## What runs

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs every night (02:17 Dubai)
and on demand (Actions → *Nightly database backup* → Run workflow). It takes a `pg_dump` of the
Supabase `public` and `auth` schemas, encrypts it with AES-256 using `BACKUP_PASSPHRASE`, and
stores it as a workflow artifact for 30 days.

The repository is public, so the job **refuses to run without a passphrase** — an unencrypted
dump is never uploaded.

## One-time setup

1. Supabase → Project Settings → Database → **Connection string** → URI (session pooler).
   Put the full URI (with password) in GitHub → Settings → Secrets → Actions as `SUPABASE_DB_URL`.
2. Generate a passphrase (e.g. `openssl rand -base64 32`), save it in your password manager, and
   add it as the `BACKUP_PASSPHRASE` secret.
3. Run the workflow once manually and check the artifact appears.

Supabase also keeps its own daily backups on paid plans (Database → Backups). The GitHub copy
protects against losing the Supabase project or account.

## Restore

```bash
# 1. Download the artifact zip from the workflow run, unzip it, then:
gpg --decrypt rrcentral-YYYYMMDD-HHMM.dump.gpg > rrcentral.dump

# 2. Inspect without touching production:
pg_restore --list rrcentral.dump | head

# 3. Restore into a NEW Supabase project (recommended) or a scratch database:
pg_restore --no-owner --no-privileges --dbname "$TARGET_DB_URL" rrcentral.dump
```

Restoring over the live project overwrites current data — take a fresh backup first and
prefer restoring single tables (`pg_restore -t invoices …`).

## In-browser backups

Settings → Data & storage → **Download backup** exports the data this browser can see as JSON.
Treat the file as confidential. Never put backup or export files in `app/public/` — that folder is
published to the internet (CI blocks it).
