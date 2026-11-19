# HR and payroll access

Migration `20261321090000_hr_payroll_manager_only.sql`, test `supabase/tests/modules/hr_payroll_access_test.sql`.

| Table | Admin | Manager | Staff | Sales | Viewer |
|---|---|---|---|---|---|
| hr_employees (salary, IBAN, ID numbers) | read, write | read, write | none | none | none |
| payroll_runs, payroll_lines | read, write | read, write | none | none | none |
| hr_attendance_days | read, write | read, write | none | none | none |
| hr_leave_requests, payroll_exports | unchanged (already manager only) | | | | |

Only permissions change; no rows are touched. Always own company only.

On live: run it straight after `20261217120000_feature_slices_m6_m12.sql`, and again if that file or `20260926090000_security_rls.sql` is ever run again (both put the broad policies back). The System check page marks 20261217120000 with this reminder.

## Guard tests

- `supabase/tests/modules/role_access_guard_test.sql` checks the whole database on every CI run: row level security on every table, tenant isolation on every tenant table, nothing open to anonymous visitors except the website form and business type packs, and no "all staff / sales / viewer" policy on HR, payroll, audit or field access log tables. It then reads a real HR row and the audit log as each role.
- `app/src/modules/navRoleAccess.test.ts` checks the sidebar per role: HR, payroll, ledger, approvals and MRR for managers and admins only; settings, audit log, API, app errors, system check, data requests, theme studio and plan for admins only.

## API keys, webhooks and approvals

Migration `20261321100000_api_keys_webhooks_approvals_access.sql`, test `supabase/tests/modules/api_webhooks_approvals_access_test.sql`.

| Table | Admin | Manager | Staff / Sales | Viewer |
|---|---|---|---|---|
| api_keys, webhook_endpoints | read, write | none | none | none |
| approval_requests | all | all (decide) | raise, see own, cancel own while pending | none |

Permissions only. The approvals page still stops a manager approving their own request; the database does not add that rule.
