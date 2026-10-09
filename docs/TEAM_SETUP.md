# Team tracker checklist

## Cloud for every device
1. GitHub → RRCentral → Settings → Secrets → Actions  
   - `VITE_SUPABASE_URL` = `https://pszjylxrpvlumldtptrr.supabase.co`  
   - `VITE_SUPABASE_ANON_KEY` = anon key  
2. Redeploy Pages  
3. Confirm phones show **no** orange Local mode banner  

## Data in Supabase
Settings → **Upload backup JSON to cloud** (once), after connecting.

## Default admin login
1. Apply migration `supabase/migrations/20261006170000_default_admin_info.sql` in the Supabase SQL Editor  
   (creates `info@redreach.ae` in `app_users`; sets an initial Auth password **only on first apply** of that migration).
2. Set or reset the password in **Supabase → Authentication → Users**, or use **Settings → User management** (`manage-auth-user` Edge function).
3. Sign in at Central as `info@redreach.ae` and change the password under **Settings → My password**.

Optional one-shot bootstrap: `bootstrap-admin` Edge function — **disabled by default** until you set `BOOTSTRAP_ADMIN_SECRET` + `BOOTSTRAP_ADMIN_PASSWORD` in Supabase secrets (see that function’s README). Do not use a password that appears in old git commits.

## Login (email + password)
1. Supabase → Authentication → Providers → **Email** → enable  
2. Deploy edge function: `supabase functions deploy manage-auth-user --project-ref pszjylxrpvlumldtptrr`  
3. Settings → **User management** to add teammates with an initial password  

Optional: disable the Google provider so it cannot be used by mistake.

## Org redirect + domain
See [`org-pages/README.md`](./org-pages/README.md).
