# manage-auth-user

Admin-only edge function: create or reset a staff member’s Supabase Auth password
(for `@redreach.ae` emails). No magic-link email is required.

## Deploy

```bash
supabase functions deploy manage-auth-user --project-ref pszjylxrpvlumldtptrr
```

Service role is injected automatically by Supabase. No extra secrets required
unless you need a custom `ALLOWED_ORIGINS` list.
