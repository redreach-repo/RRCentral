# Tee Tribe — product & engineering decisions

Made without blocking on questions. Change later if needed.

## Architecture
1. **Separate Next.js app** at `/teetribe` (not inside the Vite CRM SPA). Deploy to Vercel on `teetribe.com`. Red Reach Central stays the ops CRM at GitHub Pages.
2. **Same Supabase as Central**: Tee Tribe shop tables live in the Red Reach Central project with a `tt_` prefix (`tt_products`, `tt_orders`, …) so they never clash with Central CRM `products`. Paid orders also sync into `website_inquiries` / CRM via `teetribe-order-sync`.
3. **Mock-first**: Phase 1 reads `/data/seed.ts`. When `NEXT_PUBLIC_USE_MOCK=true` (default in dev without Supabase), the UI uses seed data. Flip off when Supabase is configured. Use the **same** `NEXT_PUBLIC_SUPABASE_URL` / keys as Central.


## Commerce
4. Prices stored as **integer fils** (AED 99.00 → `9900`). Display helper formats `AED 99` with no decimals unless fils ≠ 0.
5. Stripe Checkout Sessions only (no Payment Element). Omit `payment_method_types` so Apple Pay / Google Pay follow Dashboard settings. Currency `aed`.
6. Free delivery threshold default **AED 200** (`20000` fils); flat fee default **AED 15** (`1500` fils), both env-configurable.
7. Cash on delivery behind `FEATURE_COD=false` (default off).
8. Tribe Member first-order 10% via Stripe coupon created server-side per signup (`tribe-first-{code}`).

## Brand & content
9. No UAE flag, national emblem, or ruler imagery in seed assets. SVG tee mockups only until real photos land (swap via `product_images.url` in DB).
10. Faith Collection copy is encouraging / tasteful, never evangelistic.
11. Logo: SVG wordmark + layered triangle in `components/Logo.tsx`.
12. Fonts: Archivo Black (display) + Inter (body) via `next/font/google` as specified.

## i18n & UX
13. EN default; AR toggle with `dir=rtl` and placeholder Arabic strings in `/lib/i18n`.
14. Tayo chatbot: scripted flows client-side + `/api/tayo` → Claude Haiku when `ANTHROPIC_API_KEY` set; in-memory rate limit. No keys in the browser.
15. Admin at `/admin` gated by Supabase Auth + `app_metadata.role === 'admin'` (or `public.admins` email via `tt_is_admin()` in RLS). Mock mode allows open access with warning banner.

## Phase 2–6 (implemented)
17. **Catalog layer** (`lib/catalog.ts`): returns seed when `NEXT_PUBLIC_USE_MOCK !== 'false'` or Supabase missing; else queries Supabase via service role.
18. **Checkout**: Zod-validated cart, pending order in Supabase, Stripe Checkout Session (AED, UAE shipping, phone), `integration_identifier` metadata, free delivery threshold from env.
19. **Webhook**: signature verify, idempotent via `stripe_event_id` / status check, atomic stock decrement via `tt_decrement_stock`, Resend confirmation, CRM sync.
20. **Admin**: route groups `(protected)` / `(public)/login`; client tables for products/stock, orders, waitlist, quotes, members.
21. **SEO**: `sitemap.ts`, `robots.ts`, JSON-LD on PDP, Open Graph via `lib/seo.ts`.

## Email
16. Resend for transactional mail. Reply-To: `alfred@redreach.ae`. From: `orders@teetribe.com` (fallback `onboarding@resend.dev` in test).
