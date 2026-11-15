# ask_ai / soft-delete / warehouse stock deepen

After #446 leftovers.

## Shipped

- Workflow `ask_ai` dry-logs prompt into `ask_ai_dry_logs` (no AI gateway call).
- Quote / invoice / delivery-note delete prefers `deleted_at` (falls back to hard delete).
- Pipeline (`MyDealsPage`) filters deals with `record_rules` scope `deal`.
- Inventory shows `warehouse_stock` stub table when rows exist.
- Quotations list Export CSV.

## Not done

M14 native, live ESP / Tax / CASA / QTSP, live ask_ai gateway, RLS record rules.