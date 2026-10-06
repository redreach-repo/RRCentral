# Team tracker checklist

## Cloud for every device
1. GitHub → RRCentral → Settings → Secrets → Actions  
   - `VITE_SUPABASE_URL` = `https://pszjylxrpvlumldtptrr.supabase.co`  
   - `VITE_SUPABASE_ANON_KEY` = anon key  
2. Redeploy Pages  
3. Confirm phones show **no** orange Local mode banner  

## Data in Supabase
Settings → **Upload backup JSON to cloud** (once), after connecting.

## Login (email + password)
1. Supabase → Authentication → Providers → **Email** → enable  
2. Deploy edge function: `supabase functions deploy manage-auth-user --project-ref pszjylxrpvlumldtptrr`  
3. **First admin bootstrap** (one time): Supabase → Authentication → Users → open your `@redreach.ae` user → set a password  
4. Sign in at Central with email + password  
5. Settings → **My password** to change it anytime  

## Teammates
1. Central → Settings → **User management** → Add user (email + role + initial password)  
2. They sign in with that email + password, then change it under **My password**  
3. To reset someone’s password later: Edit user → enter a new password → Save  

Optional: disable the Google provider so it cannot be used by mistake.

## Org redirect + domain
See [`org-pages/README.md`](./org-pages/README.md).
