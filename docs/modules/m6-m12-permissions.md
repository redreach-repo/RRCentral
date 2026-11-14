Status: built and tested (draft)
Owner: Claude (fix on top of Cursor's tables; no Cursor files touched)
PR: see the PR titled "Lock down M6–M12 slice permissions" (draft)
Stubbed / unverified: tested on local Postgres with main and with Cursor's #415 merged in; not run on the live project. Cursor's pages may show empty lists to sales users now (that is the point); Cursor may want to hide those menu items for sales.

# Permission fix for the M6–M12 first slices

## The problem (in Cursor's #413, already on main)
`20261217120000_feature_slices_m6_m12.sql` gives every `rr_is_staff()` user (admin, manager **and sales**) full read and write on:

| Table | What a sales user could do |
|---|---|
| `hr_employees` | read and edit everyone's salary and IBAN |
| `payroll_runs`, `payroll_lines` | read and change payroll, mark runs approved or paid |
| `approval_requests` | approve any request, including their own; forge who asked |
| `api_keys` | mint a working API key by inserting a hash they made |
| `webhook_endpoints` | read signing secrets; point webhooks anywhere |

## The fix (`20261220090000_m6_m12_permissions.sql`)
| Table | Who |
|---|---|
| HR + payroll | manager, admin |
| API keys, webhooks | admin |
| Approvals: read | admin, manager, sales (whole queue); staff (own) |
| Approvals: raise | everyone on the team except viewers; the database sets who asked |
| Approvals: approve / reject | manager or admin who did not ask; recorded as the real signed in user |
| Approvals: cancel | the person who asked, or an admin |
| Approvals: after a decision | nothing can change (status, note, checker) |

Plus every approval change is written to `audit_log`.

## Setup for Alfred
SQL copy page, in this order: `20261217120000_feature_slices_m6_m12.sql`, `20261217140000_feature_slices_deepen.sql` (from Cursor's #415, once merged), then **this file**. If the first file is ever run again, run this one again after it.

## Still open for Cursor (not fixed here, so we don't edit Cursor's files)
- `testWebhookDelivery` reads the webhook secret in the browser and the browser does the test POST. Better: send from an Edge Function so the secret never reaches a browser.
- `public-api` falls back to an unscoped `accounts` list when the tenant filter errors; that fallback should be removed (could cross tenants).
- API key scope `*` is accepted; consider removing it.
- Salary and IBAN are plain columns; Field-level encryption (Claude) will cover them.
- Payroll can be marked approved without an approval request when under AED 5k; confirm that threshold with Alfred.

## Tests
`supabase/tests/modules/m6_m12_permissions_test.sql`: 31 checks across admin, manager, sales, staff, viewer, other tenant, anon.
