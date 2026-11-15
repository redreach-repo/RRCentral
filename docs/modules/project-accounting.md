Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: WIP, retention, billing schedules, full job cost rollup

## What it does

Delivery projects with budget and cost lines (labour/materials/other). Light project accounting slice for ops — not a full job-cost ledger.

## Roles

- Staff: read/write projects and cost lines
- Manager+: Projects nav entry

## Tables

- `delivery_projects`, `project_cost_lines`

## Alfred

Apply `20261230170000_project_accounting.sql`.
