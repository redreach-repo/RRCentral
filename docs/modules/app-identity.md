# App identity on every device (Master Spec §5.6)

**Date:** 15 November 2026 (Asia/Dubai)  
**Status:** partial (client-side after sign-in)

## What ships now

After sign-in, `TenantContext` builds a per-tenant Web App Manifest from the active company name + brand kit and swaps the document `link[rel=manifest]`, `theme-color`, and apple-touch title/icons.

- Manifest `id` includes `tenant` + `company` so two workspaces can install side by side
- Short name ≤ 12 characters; reserved names blocked in helpers
- Theme colour = brand primary; square mark preferred for icons when set

Helpers: `app/src/lib/tenantAppIdentity.ts`.

## Not yet (needs M11 provisioner / Alfred)

- Server-generated manifest **per tenant host** (`alnoor.highmast.app`)
- `tenant_app_identities` table and workspace address uniqueness
- Install guides with tenant-coloured screenshots
- iPhone reinstall notice when the app name changes
- Initials tile generator when no logo is uploaded
