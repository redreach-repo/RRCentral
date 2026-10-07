# Zoho CRM integration (RRCentral)

## Current state in this repo

RRCentral’s React app integrates **Zoho Calendar** and **Zoho Mail** (`app/src/lib/zoho.ts`), using Self Client credentials stored in `app_settings`.

**Calendar (bidirectional UX):**
- **Dashboard → Schedule** (top of page) combines CRM follow-ups and Zoho Calendar meetings in one list, with filters for All / Follow-ups / Meetings.
- **Schedule meeting** invites selected `@redreach.ae` team members (Zoho sends email invites → phone/desktop calendar when accepted).
- CRM follow-up dates still push to Zoho as `Follow-up: {company}` events; the sales owner is invited automatically.

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
