# RED REACH Central

Public website + CRM + quotations + invoices for **Red Reach Middle East FZE**.

## Live CRM URL (bookmark this)

**https://redreach-repo.github.io/RRCentral/**

| What | URL |
|------|-----|
| Public site | https://redreach-repo.github.io/RRCentral/ |
| Sign in | https://redreach-repo.github.io/RRCentral/login |
| Dashboard | https://redreach-repo.github.io/RRCentral/app |

`https://redreach-repo.github.io/` alone is **not** the CRM — GitHub shows a 404 there until you publish the org redirect in [`org-pages/`](./org-pages/). Merging a PR updates the `/RRCentral/` site after the deploy action finishes.

**www.redreach.ae** is still the Hostinger WordPress site — it will not change until DNS is pointed at Pages.

Each division is its own page. **RR Central** is a quiet text link to `/login` (or `/app` when signed in).

| Surface | Path |
|---------|------|
| Public site | `/`, `/about`, `/insights`, `/contact`, `/businesses` |
| Divisions | `/marketing`, `/care`, `/connect`, `/wanders`, `/threads`, `/trading`, `/upskilling` |
| Tee Tribe shop | `/shop` (also `/teetribe`) — Christian, one-liner, minimalist and secular tees. Pay with Stripe. |
| Wanders destinations | `/wanders/philippines`, `/wanders/kerala`, `/wanders/himalaya` |
| Legacy aliases | `/travel` → `/wanders`, `/uniforms` → `/threads`, `/verticals` → `/businesses` |
| Central sign-in | `/login` (linked as **Central**) |
| CRM dashboard | `/app` after sign-in |
| CRM modules | `/crm`, `/quotations`, `/app/wanders`, … |

Contact forms write **website inquiries** into Central (and create a CRM lead in local mode). On Supabase, apply the migrations in [`supabase/migrations/`](./supabase/migrations/) so `website_inquiries` exists and anonymous visitors can insert (only insert — see [`docs/SECURITY.md`](./docs/SECURITY.md)).

## How the team should use it

**Use GitHub Pages + Supabase** (shared cloud database). Open:

https://redreach-repo.github.io/RRCentral/

1. Create a project at [supabase.com](https://supabase.com)
2. Apply the database migrations in [`supabase/migrations/`](./supabase/migrations/), oldest first
   (`npx supabase db push`, or paste each file into the SQL Editor in filename order).
   **Before `…_security_rls.sql`, make sure your email is an active admin in `app_users`.**
3. Auth → Providers → **Google** → enable  
   Redirect URL: `https://redreach-repo.github.io/RRCentral/`  
   Only people listed in `app_users` (Settings → Users) can see any data — other Google accounts get “No access”.
4. Deploy the Edge Functions: `zoho-proxy` (Zoho) and `create-checkout-session` (shop) — see [`docs/SECURITY.md`](./docs/SECURITY.md).
5. Project Settings → API → copy **URL** + **anon key**
6. In the CRM: **Settings → Data & storage → Connect Supabase** → paste → Connect & reload  
   *(Or add GitHub Actions secrets `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` and redeploy so everyone is cloud by default.)*

Until Supabase is connected, the orange banner means **local mode** (data stays in that browser only).

## What's in Central

- **Access control** — only teammates listed in Settings → Users can sign in to data; admin vs sales enforced by the database ([`docs/SECURITY.md`](./docs/SECURITY.md)).
- **Audit log** (admin) — who created, changed or deleted what, with before/after values.
- **Follow-up reminders** — bell + sidebar badge with overdue / due-today counts; optional once-a-day desktop notification.
- **Pipeline & conversion by division** on the Dashboard — open, awarded, win rate, average won deal, invoiced, outstanding.
- **Nightly encrypted backups** ([`docs/BACKUPS.md`](./docs/BACKUPS.md)).

## Fix org-root 404

See [`org-pages/README.md`](./org-pages/README.md) — publish that tiny redirect as `redreach-repo.github.io` so the bare domain sends people into Central.

Team setup checklist (secrets, teammates, backup upload, custom domain): [`docs/TEAM_SETUP.md`](./docs/TEAM_SETUP.md).

## Apps

| App | Path | Stack |
|-----|------|--------|
| **React app (team)** | [`app/`](./app/) | Vite + React → GitHub Pages + optional Supabase |
| Database | [`supabase/`](./supabase/) | Ordered SQL migrations, one-off scripts, Edge Functions |
| Legacy UI | [`web/`](./web/) | Static Pages launcher for Apps Script (superseded by `app/`; not deployed) |
| Legacy backend | [`appscript/`](./appscript/) | Google Apps Script + Sheets |

## React app quick start

**Today on GitHub Pages the app runs in local mode until Supabase is connected:** CRM data is stored in **this browser’s IndexedDB** (`rrcentral_local`). Use **Settings → Data & storage** to connect Supabase or download backups.

### Local (no Supabase)

```bash
cd app
npm install
npm run dev
```

Open http://localhost:5173/RRCentral/shop for **Tee Tribe**. Locally, checkout talks to a Vite API at `/api/create-checkout-session`. Without `STRIPE_SECRET_KEY` it completes a demo order. With a Stripe restricted key in `app/.env` (see `app/.env.example`) it redirects to Stripe-hosted Checkout (AED, UAE shipping, no `payment_method_types` so Dashboard payment methods apply).

On the live site checkout calls the Supabase Edge Function [`create-checkout-session`](./supabase/functions/create-checkout-session/) (or `VITE_CHECKOUT_API_URL` if set). If it is not deployed the shop shows an error — it never pretends an order succeeded. Prices come from `app/src/shop/checkout.ts`; after changing the catalog run `npm run build:checkout-fn` in `app/` (CI checks this).

### Checks (run before opening a PR — CI runs the same)

```bash
cd app
npm run lint && npm run typecheck && npm test
```

### Cloud (Supabase) — team sharing

Follow the steps at the top of this README. Full notes: [`app/README.md`](./app/README.md).

## Legacy Apps Script API

Deployment ID: `AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig`

```
https://script.google.com/macros/s/AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig/exec
```

See [`appscript/README.md`](./appscript/README.md) and [`web/README.md`](./web/README.md).

The external API and `?page=migrate` export are **disabled** until an admin sets a random `apiToken` (32+ characters) in the App Settings sheet and redeploys. The old default token is permanently rejected.

## Admins

- `alfredsv@gmail.com`
- `redreachdxb@gmail.com`
- `alfred@redreach.ae`
- `jacob@redreach.ae`
