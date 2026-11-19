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
