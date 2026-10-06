# RED REACH Central (GitHub + optional Supabase)

Modern React CRM for Red Reach Middle East FZE. Frontend on GitHub Pages.

**CRM-first:** `/` redirects to `/login`. Public marketing lives on [www.redreach.ae](https://www.redreach.ae). Tee Tribe shop remains at `/shop`. Website inquiry intake on the CRM page is unchanged.

## Data storage

| Mode | When | Where data lives |
|------|------|------------------|
| **Local** (default on GitHub Pages today) | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing or still placeholders | **IndexedDB** in the browser (`rrcentral_local`). Session in `localStorage`. Not shared across devices. |
| **Supabase** | Real project URL + anon key set at build time | **Postgres** in your Supabase project + email magic link (Zoho) |

In local mode, open **Settings → Data & storage** to download / restore a JSON backup. Clearing site data in the browser deletes the CRM.

## Setup

### Local mode (no cloud)

```bash
cd app
npm install
npm run dev
```

Open http://localhost:5173/RRCentral/login — pick a seeded admin email.

Tee Tribe retail lives at http://localhost:5173/RRCentral/shop. Stripe Checkout runs through the Vite `/api/create-checkout-session` plugin when `STRIPE_SECRET_KEY` is set.

### Cloud mode (Supabase)

1. Create a project at https://supabase.com
2. Apply `supabase/migrations/*.sql` in filename order (`npx supabase db push` or the SQL Editor)
3. Auth → Email provider (magic link) + redirect URLs:
   - `http://localhost:5173/RRCentral/login`
   - `https://redreach-repo.github.io/RRCentral/login`
4. Copy Project URL + anon key into `.env` (from `.env.example`)
5. For GitHub Pages, add secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then push `main`

## Responsive layout

- **Phone (&lt;640px):** hamburger drawer, compact top bar, stacking forms/KPIs, horizontal table scroll
- **Tablet (≤1024px):** same drawer nav for usable content width
- **Laptop / desktop (&gt;1024px):** persistent sidebar

## Features

Dashboard (monthly income/expense), CRM with **multiple contacts**, **pipeline stages**, and **activity timeline**, Follow-ups, Quotations (validity + auto-expire), Invoices, Catalog, Templates, VAT report + P&amp;L, Expenses, Settings, professional PDF (drafts show **DRAFT** not internal IDs), Email PDF, WhatsApp share, **Zoho Calendar / Mail**.

## Shared cloud backend (Supabase)

Local IndexedDB is fine for a single browser. For the whole team:

1. Create a project at https://supabase.com
2. Apply [`supabase/migrations/`](../supabase/migrations/) in filename order (`npx supabase db push` or the SQL Editor)
3. Auth → enable **Email** (magic link to Zoho for `@redreach.ae`), add redirect URLs for local + GitHub Pages (`…/login`)
4. Copy Project URL + anon key into `app/.env` (and GitHub Actions secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
5. Redeploy — the app switches from local mode to shared Postgres automatically

Until those secrets are set, GitHub Pages keeps running in local mode.

## Zoho Calendar & Mail

CRM follow-ups can sync to Zoho Calendar; Email actions can send via Zoho Mail.

1. Open [Zoho API Console](https://api-console.zoho.com/) → create a **Self Client**.
2. Generate a refresh token with scopes:
   - `ZohoCalendar.event.ALL`
   - `ZohoMail.messages.CREATE`
   - `ZohoMail.accounts.READ`
3. In the app: **Settings → Zoho Calendar & Mail** — paste Client ID, Client Secret, Refresh Token.
4. Set **Calendar sync** / **Mail send** to `yes`.
5. Use regional domains if needed (`accounts.zoho.eu`, `calendar.zoho.eu`, `mail.zoho.eu`, etc.).
6. Click **Test connection**, then save a CRM follow-up date or use Email on a CRM row.

Tokens are stored in local settings (browser IndexedDB in local mode). Browser CORS must allow Zoho API calls from your Pages origin; if a call is blocked, use a backend proxy later.

## Roles

Admins (seeded): `alfred@redreach.ae`, `jacob@redreach.ae`. Login is **email magic link** to `@redreach.ae` (Zoho Mail) — Gmail and Google OAuth are not used.

## Roles

| Role | Can |
|------|-----|
| **admin** | Users, Settings/secrets, audit log, delete invoices/expenses, mark paid |
| **manager** | All CRM data, reassign owners, delete quotes/CRM mistakes — no Settings |
| **sales** | Day-to-day CRM, quotes, invoices — no Settings, audit, or hard finance deletes |

Permissions are defined in `app/src/lib/permissions.ts`.  
Other signed-in users default to `sales`.
