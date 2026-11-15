Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: WPS/SIF remain draft — see COMPLIANCE_NOTES; export audit is product telemetry only

## What it does

When Payroll downloads CSV or SIF draft, the app inserts a `payroll_exports` audit row (format, period, line count, actor). Does not change WPS certification status.

## Roles

- Staff: insert export log on download

## Tables

- `payroll_exports`

## Alfred

Apply `20261230190000_payroll_exports.sql`.
