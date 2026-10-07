# Tee Tribe — Next.js Storefront

Mobile-first UAE storefront for premium tees, limited drops, and custom tribe-made merch. Phase 1 uses mock seed data — no Supabase or Stripe keys required.

## Quick start

```bash
cd teetribe
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run seed` | Phase 2 Supabase seed stub |

## Project structure

```
src/
  app/           # App Router pages & API routes
  components/    # UI components
  context/       # Cart & locale providers
  data/seed.ts   # Mock products, collections, helpers
  lib/           # Types, money, i18n, cn
scripts/         # DB seed (Phase 2)
supabase/        # Migrations (Phase 2)
```

## Environment variables

Copy `.env.example` to `.env.local`. Phase 1 works with defaults:

- `NEXT_PUBLIC_USE_MOCK=true` — use seed data (default)
- `NEXT_PUBLIC_FREE_DELIVERY_FILS=20000` — free delivery above AED 200
- `NEXT_PUBLIC_DELIVERY_FEE_FILS=1500` — flat AED 15 delivery

Phase 2 keys (optional now):

- **Supabase** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Stripe** — `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Resend** — `RESEND_API_KEY` for transactional email

Without `STRIPE_SECRET_KEY`, checkout POSTs to `/api/checkout` and redirects to `/order/success?mock=1`.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — hero, collections, best sellers, tribe signup |
| `/shop` | Filterable product grid |
| `/collections/[slug]` | Collection landing |
| `/product/[slug]` | PDP with gallery, variants, size guide |
| `/drops` | Limited drops + waitlist |
| `/cart`, `/checkout` | Cart and checkout |
| `/tribe-made` | Custom merch + quote form |
| `/family`, `/about`, `/faq`, etc. | Content pages |
| `/admin` | Admin placeholder (connect Supabase in Phase 2) |

## API routes (Phase 1 stubs)

- `GET /api/mockup` — SVG product mockup generator
- `POST /api/checkout` — mock order or Stripe (Phase 2)
- `POST /api/waitlist`, `/api/members`, `/api/quotes` — accept JSON, return `{ok:true}`

## Design

- **Colors**: amber `#E8A317`, teal `#0A8A7A`, sunshine `#F5C842`, ink `#0D0D0D`, cream `#FAF7F0`
- **Fonts**: Archivo Black (display) + Inter (body)
- **Style**: oversized type, sticker badges, mobile-first, cream background

## Phase 2 roadmap

1. Supabase schema + RLS + admin auth
2. Stripe Checkout Sessions (AED)
3. Resend transactional email
4. CRM sync to Red Reach Central
5. Tayo chatbot via `/api/tayo`

See `DECISIONS.md` for architecture notes.
