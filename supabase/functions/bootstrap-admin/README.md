# bootstrap-admin (optional, disabled by default)

Creates or resets `info@redreach.ae` in Auth + `app_users`. **Disabled** until you set Supabase secrets:

| Secret | Requirement |
|--------|-------------|
| `BOOTSTRAP_ADMIN_SECRET` | 32+ random characters |
| `BOOTSTRAP_ADMIN_PASSWORD` | 12+ character password (not stored in this repo) |

Call with header `x-bootstrap-secret: <BOOTSTRAP_ADMIN_SECRET>`.

**Preferred:** apply `20261006170000_default_admin_info.sql` once, then set the password in **Supabase → Authentication → Users**, or use **`manage-auth-user`** from Settings (admin).

Do **not** deploy this function on production unless you need a one-time bootstrap and you rotate/remove it afterward.

```bash
supabase secrets set BOOTSTRAP_ADMIN_SECRET='…' BOOTSTRAP_ADMIN_PASSWORD='…'
supabase functions deploy bootstrap-admin --no-verify-jwt
curl -X POST "$SUPABASE_URL/functions/v1/bootstrap-admin" \
  -H "apikey: $ANON_KEY" \
  -H "x-bootstrap-secret: $BOOTSTRAP_ADMIN_SECRET"
```
