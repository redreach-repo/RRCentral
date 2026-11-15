Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: landed cost tax treatment, WIP/retention job-cost accounting, VAT FTA filing, GL CoA tax mapping

## What it does

- Invoice finalize → draft GL journal (existing auto-post mapper)
- Reports VAT return boxes panel
- CSV export on vendors, expenses, catalog, inventory, POs, projects
- PO `landed_cost_aed` allocated into `landed_unit_cost` / product `unit_cost` on receive
- Project `retention_pct` / `billed_to_date_aed` / `wip_aed` + refresh RPC
- Public API: invoice/quote lines + invoice finalize

## Alfred

Apply `20261302120000`–`130000`. Redeploy `public-api`.
