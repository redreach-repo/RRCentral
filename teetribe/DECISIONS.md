# Tee Tribe — product & engineering decisions

Made without blocking on questions. Change later if needed.

## Architecture
1. **Separate Next.js app** at `/teetribe` (not inside the Vite CRM SPA). Deploy to Vercel on `teetribe.com`. Red Reach Central stays the ops CRM at GitHub Pages.
2. **Central CRM link**: paid orders write a CRM lead + income note into Central via a server-side sync (`CRM_SYNC_URL` + service role / edge function). Inventory source of truth for Tee Tribe is the Tee Tribe Supabase project; admins can mirror stock into Central Inventory when `CRM_SYNC_INVENTORY=true`.
3. **Mock-first**: Phase 1 reads `/data/seed.ts`. When `NEXT_PUBLIC_USE_MOCK=true` (default in dev without Supabase), the UI uses seed data. Flip off when Supabase is configured.

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
14. Tayo chatbot: Phase 1 scripted flows client-side; Phase 2 `/api/tayo` → Claude with rate limit. No keys in the browser.
15. Admin at `/admin` gated by Supabase Auth + `app_metadata.role === 'admin'`.

## Email
16. Resend for transactional mail. Reply-To: `alfred@redreach.ae`. From: `orders@teetribe.com` (fallback `onboarding@resend.dev` in test).
