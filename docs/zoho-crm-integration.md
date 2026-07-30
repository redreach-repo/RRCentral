# Zoho CRM integration (RRCentral)

## Current state in this repo

RRCentral’s React app integrates **Zoho Calendar** and **Zoho Mail** only (`app/src/lib/zoho.ts`), using Self Client credentials stored in `app_settings`.

There is **no** Zoho CRM Lead/module sync for:

- Tour packages
- Scheduled departures
- Customer bookings
- Suppliers / coordinators
- Cost components / selling prices

Tour product data is stored in the app database (IndexedDB locally / Supabase when connected).

## Rules for this change set

- Do **not** activate live Zoho.
- Do **not** use live credentials or create live CRM records.
- Do **not** push package/partner information into Zoho Lead Description fields.
- Preserve existing Calendar/Mail behaviour and settings keys.

## If Zoho CRM product modules are required later

An administrator must create custom modules (or confirm API names) before any sync code is written. See `docs/zoho-field-mapping.md`.

## Related

- Field/module mapping: `docs/zoho-field-mapping.md`
- Lead handling: `docs/lead-handling-runbook.md`
- Handover: `docs/FULL-BUILD-HANDOVER.md`
