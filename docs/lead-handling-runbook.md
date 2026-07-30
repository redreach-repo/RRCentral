# Lead handling runbook — RR Wanders

## Principles

1. **Customer leads ≠ tour products.** Enquiries and deals live under `/wanders` → Customer leads (`wanders_deals`).
2. **Packages / partners / departures / bookings** live under `/wanders` → Tour products & ops.
3. Never paste Christine/Koko rates, package cost sheets or departure capacity **only** into a lead description.
4. When a customer books (or holds) a departure, create a **Customer booking** row linking:
   - `deal_id` (lead)
   - `package_id`
   - `departure_id`
   - `supplier_id` (e.g. Christine)
   - `coordinator_id` (e.g. Koko)

## Intake channels in this repo

| Channel | Status |
|---------|--------|
| Manual create in Wanders CRM | Supported |
| `POST /api/leads` | **Not implemented** in RRCentral — no route to preserve beyond “do not invent one that writes package data into lead notes” |
| Zoho Lead webhook | **Not implemented** |
| Legacy Apps Script | Separate legacy path; do not mix tour-ops schema into it without a dedicated design |

## Privacy

- Collect passport/medical data only when operationally required (`wanders_passengers`).
- Do not expose pax/passport fields in marketing analytics or public docs.
- Payment proof and supplier bank details stay access-controlled.

## Philippines product (seed)

- Market: Kerala, India → Destination: Philippines → Period: Jan–Mar 2027
- Min group 10; smaller groups = private / higher price
- Meal tiers: Breakfast only | Full board
- Supplier currency PHP; customer selling currency INR (price pending)
- Status: Product development / supplier rates received
- Coordinator communication to Christine: **through Koko**
