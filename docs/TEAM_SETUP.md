# Team tracker checklist

## Cloud for every device
1. GitHub → RRCentral → Settings → Secrets → Actions  
   - `VITE_SUPABASE_URL` = `https://pszjylxrpvlumldtptrr.supabase.co`  
   - `VITE_SUPABASE_ANON_KEY` = anon key  
2. Redeploy Pages  
3. Confirm phones show **no** orange Local mode banner  

## Data in Supabase
Settings → **Upload backup JSON to cloud** (once), after connecting.

## Teammates
1. Central → Settings → **User management** → Add user (email + admin/manager/sales)  
2. They open Central, enter their **@redreach.ae** email, and open the **magic link** from Zoho Mail  
3. Supabase → Authentication → Users: confirm they appear after first login  

## Email magic-link return URL
Supabase → Authentication → Providers → **Email** → enable  
Supabase → Authentication → URL Configuration  
- Site URL + Redirect: `https://redreach-repo.github.io/RRCentral/login`

Optional: disable the Google provider so it cannot be used by mistake.

## Org redirect + domain
See [`org-pages/README.md`](./org-pages/README.md).
