# Zoho proxy (required for browser)

Safari/Chrome block direct calls to Zoho OAuth (`405`). RRCentral routes Zoho through this Edge Function when Supabase is connected.

## Deploy

```bash
# from repo root, logged into Supabase CLI
npx supabase login
npx supabase link --project-ref YOUR_RR_CENTRAL_REF
npx supabase functions deploy zoho-proxy
```

Or Dashboard → **Edge Functions** → create `zoho-proxy` → paste `index.ts`.

JWT verification should stay **on** (default). The CRM calls it with the signed-in user’s session.
