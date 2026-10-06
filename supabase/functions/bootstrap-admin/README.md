# Bootstraps the default admin Auth user (service role).

Creates or resets `info@redreach.ae` with password `RedReach2026#` and
`email_confirm: true`. Prefer applying the SQL migration
`20261006170000_default_admin_info.sql` in the Supabase SQL Editor — that does
the same without needing this function.

## Optional deploy

```bash
supabase functions deploy bootstrap-admin --project-ref pszjylxrpvlumldtptrr --no-verify-jwt
curl -X POST "https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/bootstrap-admin" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "apikey: <ANON_KEY>"
```
