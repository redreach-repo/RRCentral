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

Dashboard (monthly income/expense), CRM, Follow-ups, Quotations, Invoices, Catalog, Templates, VAT report + P&amp;L, Expenses, Settings, PDF export, WhatsApp share.

## Roles

Admins (seeded): `alfredsv@gmail.com`, `redreachdxb@gmail.com`, `alfred@redreach.ae`, `jacob@redreach.ae`  
Other signed-in users default to `sales`.
