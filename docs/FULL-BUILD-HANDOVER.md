# RR Wanders / RRCentral — Full Build Handover

> Inspected during tour-ops implementation (2026-07-30). This file did not previously exist in the repo; it documents the current React CRM (`app/`) reality versus Zoho-oriented expectations.

## Product surface

| Area | Location | Notes |
|------|----------|--------|
| Shared company CRM (Threads-oriented leads) | `/crm` | Company pipeline Lead→Won; not tour packages |
| RR Wanders customer leads/deals | `/wanders` → **Customer leads** | Travel sales/booking pipeline; passengers; deposit |
| Tour products & operations | `/wanders` → **Tour products & ops** | Packages, partners, costs, prices, departures, bookings |
| Multi-currency payments | `/payments` | Customer payments/refunds; FX log |
| Threads catalog/inventory | `/catalog`, `/inventory` | Division `01` only |

## Data stores (local IndexedDB + Supabase schema)

Tour ops (division-safe, separate from Threads):

- `tour_packages`
- `wanders_partners` (suppliers + coordinators)
- `package_cost_components`
- `package_selling_prices`
- `scheduled_departures`
- `customer_bookings` (links `deal_id` + `package_id` + `departure_id` + partner ids)
- `wanders_deals` / `wanders_passengers` (customer side)

## Privacy / security

- Passport/medical fields live on `wanders_passengers` only; masked in lists; not for marketing views.
- Supplier bank details (if added later) must remain access-controlled — not implemented in seed.
- No live Zoho writes from this tour-ops work.
- Do not place package/partner facts only inside lead `notes` or Zoho Lead Description.

## What is not in this repository

- `POST /api/leads` HTTP API — **not present**. Lead intake is via the React app / legacy Apps Script, not a dedicated `/api/leads` route.
- Zoho CRM custom modules for Packages/Departures — **not provisioned**. Only Zoho Calendar/Mail client exists (`app/src/lib/zoho.ts`).

## Philippines seed (synthetic, local)

- Package `WAN-PH-KER-2027` — Kerala advertising market, Philippines destination, Jan–Mar 2027
- Partners: Christine (supplier), Koko (coordinator)
- Departures: Jan / Feb / Mar 2027 shells
- INR selling prices pending finalization (amount 0)

## Owner TBC still blocking production legal/tax copy

See Settings → RR Wanders (legal entity, governing law, base currency, tax rules).
