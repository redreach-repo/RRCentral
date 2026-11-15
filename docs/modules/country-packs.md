Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: India/Canada tax and payroll rule payloads; UAE VAT rate hint; all packs marked Unverified until counsel

## What it does

Catalog of country packs (AE / IN / CA) as data. Admins activate a pack for the tenant; activation stores `app_settings.countryPack` and a `tenant_country_packs` row. UI shows Unverified banners — rates/labels are placeholders, not legal advice.

## Roles

- Staff: read catalog
- Admin: activate pack

## Tables

- `country_packs` (global catalog)
- `tenant_country_packs` (per-tenant activation)

## Alfred

Apply migrations `20261230150000_country_packs.sql` via the SQL copy page. No Edge secrets.
