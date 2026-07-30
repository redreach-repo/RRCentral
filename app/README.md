# RED REACH Central (GitHub + optional Supabase)

Modern React CRM for Red Reach Middle East FZE. Frontend on GitHub Pages.

## Data storage

| Mode | When | Where data lives |
|------|------|------------------|
| **Local** (default on GitHub Pages today) | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing or still placeholders | **IndexedDB** in the browser (`rrcentral_local`). Session in `localStorage`. Not shared across devices. |
| **Supabase** | Real project URL + anon key set at build time | **Postgres** in your Supabase project + Google OAuth |

In local mode, open **Settings → Data & storage** to download / restore a JSON backup. Clearing site data in the browser deletes the CRM.

## Setup

### Local mode (no cloud)

```bash
cd app
npm install
npm run dev
```

Open http://localhost:5173/RRCentral/ — pick a seeded admin email. Sheets data auto-imports from `public/migration-data.json` on first load.

### Cloud mode (Supabase)

1. Create a project at https://supabase.com
2. SQL Editor → run `supabase-schema.sql`
3. Auth → Google provider + redirect URLs:
   - `http://localhost:5173/RRCentral/`
   - `https://redreach-repo.github.io/RRCentral/`
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
2. SQL Editor → run [`supabase-schema.sql`](./supabase-schema.sql)
3. Auth → enable **Google**, add redirect URLs for local + GitHub Pages
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

Admins (seeded): `alfredsv@gmail.com`, `redreachdxb@gmail.com`, `alfred@redreach.ae`, `jacob@redreach.ae`  
Other signed-in users default to `sales`.
