# Zoho proxy (required for browser)

Safari/Chrome block direct calls to Zoho OAuth (`405`). RRCentral routes Zoho through this Edge Function when Supabase is connected.

## Deploy (CLI)

```bash
# from repo root, logged into Supabase CLI
npx supabase login
npx supabase link --project-ref YOUR_RR_CENTRAL_REF
npx supabase functions deploy zoho-proxy
```

After deploying, regenerate the Zoho refresh token with Mail **and** WorkDrive scopes if you use
**Dashboard → Scan & file to WorkDrive**:

- `ZohoMail.messages.READ`, `ZohoMail.folders.READ`, `ZohoMail.accounts.READ`
- `WorkDrive.files.CREATE`, `WorkDrive.files.READ`, `WorkDrive.links.CREATE`

Set Settings → WorkDrive auto-file = **yes** and Customers root folder URL/ID.

## Deploy (Supabase Dashboard)

Edge Functions → **Create a new function**. Three fields must match exactly:

1. **Function name** (bottom of the editor): `zoho-proxy`  
   Not `bright-function` or any other default name.
2. **File name** (left FILES panel): `index.ts`  
   Not `zoho-proxy`. Deploy looks for `/source/index.ts` and fails if the file is named anything else.
3. **File contents**: paste the full body of this folder’s `index.ts` (the complete `Deno.serve(...)` handler).  
   Do not paste `app/src/lib/zoho.ts` (that is client code).

Then click **Deploy function**. JWT verification stays **on** (default). The CRM calls it with the signed-in user’s session.

If you see `Entrypoint path does not exist …/source/index.ts`, rename the editor file to `index.ts` and redeploy.
