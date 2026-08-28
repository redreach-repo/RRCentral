# RED REACH Central

Public website + CRM + quotations + invoices for **Red Reach Middle East FZE**.

The live React site is **https://redreach-repo.github.io/RRCentral/**. Merging a PR updates that GitHub Pages URL after the deploy action finishes. **www.redreach.ae is still the Hostinger WordPress site** — it will not change until DNS is pointed at Pages.

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
| CRM modules | `/crm`, `/quotations`, `/wanders`, … |

Contact forms write **website inquiries** into Central (and create a CRM lead in local mode). On Supabase, run the updated [`app/supabase-schema.sql`](./app/supabase-schema.sql) so `website_inquiries` exists and anonymous visitors can insert.

## How the team should use it

**Use GitHub Pages + Supabase** (shared cloud database). Open:

https://redreach-repo.github.io/RRCentral/

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → run [`app/supabase-schema.sql`](./app/supabase-schema.sql)
3. Auth → Providers → **Google** → enable  
   Redirect URL: `https://redreach-repo.github.io/RRCentral/`
4. Project Settings → API → copy **URL** + **anon key**
5. In the CRM: **Settings → Data & storage → Connect Supabase** → paste → Connect & reload  
   *(Or add GitHub Actions secrets `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` and redeploy so everyone is cloud by default.)*

Until Supabase is connected, the orange banner means **local mode** (data stays in that browser only).

## Apps

| App | Path | Stack |
|-----|------|--------|
| **React app (team)** | [`app/`](./app/) | Vite + React → GitHub Pages + optional Supabase |
| Legacy UI | [`web/`](./web/) | Static Pages launcher for Apps Script |
| Legacy backend | [`appscript/`](./appscript/) | Google Apps Script + Sheets |

## React app quick start

**Today on GitHub Pages the app runs in local mode until Supabase is connected:** CRM data is stored in **this browser’s IndexedDB** (`rrcentral_local`). Use **Settings → Data & storage** to connect Supabase or download backups.

### Local (no Supabase)

```bash
cd app
npm install
npm run dev
```

Open http://localhost:5173/RRCentral/shop for **Tee Tribe**. Checkout talks to a local Vite API at `/api/create-checkout-session`. Without `STRIPE_SECRET_KEY` it completes a demo order. With a Stripe restricted key in `app/.env` (see `app/.env.example`) it redirects to Stripe-hosted Checkout (AED, UAE shipping, no `payment_method_types` so Dashboard payment methods apply). GitHub Pages has no server: set `VITE_CHECKOUT_API_URL` to a Checkout function, or the bag falls back to demo success.

### Cloud (Supabase) — team sharing

Follow the steps at the top of this README. Full notes: [`app/README.md`](./app/README.md).

## Legacy Apps Script API

Deployment ID: `AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig`

```
https://script.google.com/macros/s/AKfycbzpBkL38S4dXfUk90yLg3uiKRCWi7Sey5TbnOfyi8ERbApKUeHEU1HPxYjSXvVdz1t0ig/exec
```

See [`appscript/README.md`](./appscript/README.md) and [`web/README.md`](./web/README.md).

## Admins

- `alfredsv@gmail.com`
- `redreachdxb@gmail.com`
- `alfred@redreach.ae`
- `jacob@redreach.ae`
