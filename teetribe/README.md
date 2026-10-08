# Tee Tribe — Next.js Storefront

Mobile-first UAE storefront for premium tees, limited drops, and custom tribe-made merch. Works mock-first without any API keys; connect Supabase, Stripe, and Resend when ready for production.

## Quick start

```bash
cd teetribe
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Live domain

Production is **https://tee-tribe.com** (Vercel project `tee-tribe`, root directory `teetribe`). The domain was bought from Buzinessware. After ICANN / registrant email verification, in cPanel **Zone Editor**:

- `tee-tribe.com` **A** → `76.76.21.21`
- `www.tee-tribe.com` **CNAME** → `cname.vercel-dns.com`

Until `STRIPE_SECRET_KEY` and Supabase are set on Vercel, the shop runs in mock mode (catalog from seed, demo checkout).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run seed` | Upsert collections/products into Supabase |

## Project structure

```
src/
  app/           # App Router pages & API routes
  components/    # UI components (incl. Tayo chat)
  context/       # Cart & locale providers
  data/seed.ts   # Mock products, collections, helpers
  lib/           # catalog, stripe, email, crmSync, supabase, seo
scripts/         # DB seed
supabase/        # Migrations + RLS
```

## Environment variables

Copy `.env.example` to `.env.local`.

**Mock mode (default):**

- `NEXT_PUBLIC_USE_MOCK=true` — use seed data (default)
- `NEXT_PUBLIC_FREE_DELIVERY_FILS=20000` — free delivery above AED 200
- `NEXT_PUBLIC_DELIVERY_FEE_FILS=1500` — flat AED 15 delivery

**Production keys:**

| Service | Variables |
|---------|-----------|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `QUOTE_NOTIFY_EMAIL` |
| Tayo AI | `ANTHROPIC_API_KEY`, `TAYO_RATE_LIMIT_PER_MIN` |
| CRM sync | `CRM_SYNC_URL`, `CRM_SYNC_SECRET` |

Without `STRIPE_SECRET_KEY`, checkout POSTs to `/api/checkout` and redirects to `/order/success?mock=1`.

Set `NEXT_PUBLIC_USE_MOCK=false` once Supabase is configured to use live data.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — hero, collections, best sellers, tribe signup |
| `/shop` | Filterable product grid |
| `/collections/[slug]` | Collection landing |
| `/product/[slug]` | PDP with gallery, variants, JSON-LD |
| `/drops` | Limited drops + waitlist |
| `/cart`, `/checkout` | Cart and Stripe Checkout |
| `/tribe-made` | Custom merch + quote form |
| `/family`, `/about`, `/faq`, etc. | Content pages |
| `/admin` | Admin dashboard (mock-open or Supabase auth) |

## API routes

| Route | Description |
|-------|-------------|
| `POST /api/checkout` | Zod-validated cart → Stripe Checkout Session (AED) or mock redirect |
| `POST /api/stripe/webhook` | Payment confirmation, stock decrement, email, CRM sync |
| `POST /api/waitlist` | Drop waitlist signup |
| `POST /api/members` | Tribe member signup + discount code |
| `POST /api/quotes` | Tribe Made quote request |
| `POST /api/tayo` | Tayo chatbot (Claude or scripted fallback) |
| `GET /api/mockup` | SVG product mockup generator |

## Linking to Red Reach Central

Tee Tribe can push paid orders into Red Reach Central as website inquiries / CRM notes.

1. Deploy an edge function or API endpoint in Central that accepts POST requests.
2. Set `CRM_SYNC_URL` to that endpoint (e.g. `https://your-central-api/sync/teetribe`).
3. Set `CRM_SYNC_SECRET` to a shared secret; Tee Tribe sends it as `X-CRM-Sync-Secret`.
4. On `checkout.session.completed`, the Stripe webhook calls `syncOrderToCrm()` which POSTs:

```json
{
  "source": "teetribe",
  "type": "paid_order",
  "inquiry": {
    "name": "Customer name",
    "email": "customer@example.ae",
    "phone": "+971...",
    "company": "Tee Tribe Website",
    "notes": "Order summary with line items..."
  },
  "order": { "orderId": "TT-...", "totalFils": 19800, "items": [...] }
}
```

Central can create a lead, attach an income note, and optionally mirror inventory when `CRM_SYNC_INVENTORY=true`.

## Supabase setup

1. Create a Supabase project.
2. Run migration: `supabase/migrations/20261007000000_teetribe_commerce.sql`
3. Add your admin email to `public.admins` or set `app_metadata.role = 'admin'` on the auth user.
4. `npm run seed` to upsert products from `src/data/seed.ts`.

## Design

- **Colors**: amber `#E8A317`, teal `#0A8A7A`, sunshine `#F5C842`, ink `#0D0D0D`, cream `#FAF7F0`
- **Fonts**: Archivo Black (display) + Inter (body)
- **Style**: oversized type, sticker badges, mobile-first, cream background

See `DECISIONS.md` for architecture notes.
