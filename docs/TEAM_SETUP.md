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
1. Central → Settings → **User management** → Add user (email + admin/sales)  
2. They open Central and **Sign in with Google** using that email  
3. Supabase → Authentication → Users: confirm they appear after first login  

## Google Auth return URL
Supabase → Authentication → URL Configuration  
- Site URL + Redirect: `https://redreach-repo.github.io/RRCentral/`

## Org redirect + domain
See [`org-pages/README.md`](./org-pages/README.md).
