# Zoho CRM integration (RRCentral)

## Current state in this repo

RRCentral’s React app integrates **Zoho Calendar** and **Zoho Mail** (`app/src/lib/zoho.ts`), using Self Client credentials stored in `app_settings`.

Mail supports:
- **Send** from CRM / documents (`sendZohoMail`)
- **Inbox + Sent read** on the Dashboard (`listZohoInboxMessages` / `listZohoSentMessages`), matched to CRM contacts by email
- **Scan & file to WorkDrive** (`scanAndFileCrmEmails`): for matched messages, create the customer folder under the Customers root (if needed), upload an HTML archive of the email, and link it under Customer files → Communications

WorkDrive auto-file requires Settings → WorkDrive = yes, a Customers root folder URL/ID, Supabase `zoho-proxy` deployed with the upload action, and OAuth scopes including `WorkDrive.files.CREATE` + `WorkDrive.links.CREATE`.

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
