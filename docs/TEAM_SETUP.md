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
2. They open Central, enter their **@redreach.ae** email, and open the **magic link**  
3. Supabase → Authentication → Users: confirm they appear after first login  

## Email magic-link (required for login mail to arrive)
Supabase → Authentication → Providers → **Email** → enable  
Supabase → Authentication → URL Configuration  
- Site URL + Redirect: `https://redreach-repo.github.io/RRCentral/login`

### Custom SMTP via Zoho (strongly recommended)
Supabase’s built-in mailer has a very low hourly rate limit. Without custom SMTP, login links often do not arrive.

1. Zoho Mail → create an **App Password** for the sending mailbox (e.g. `noreply@redreach.ae` or an admin address)
2. Supabase → **Project Settings → Authentication → SMTP Settings** → enable  
   - Host: `smtp.zoho.com` (or `smtp.zoho.eu` / regional host if your org uses it)  
   - Port: `465` (SSL)  
   - Username: the full @redreach.ae address  
   - Password: the Zoho app password  
   - Sender name: `RED REACH Central`  
   - Sender email: same @redreach.ae address  
3. Save, then try login again

Optional: disable the Google provider so it cannot be used by mistake.

## Org redirect + domain
See [`org-pages/README.md`](./org-pages/README.md).
