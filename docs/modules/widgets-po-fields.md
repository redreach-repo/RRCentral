# Widgets / PO numbering / custom fields / archive / webhook dry

After #447.

## Shipped

- Dashboard typed widget slots (`kpi_count`, `saved_view_link`, `static_note`)
- PO create uses `allocateReference('purchase_order')` with local `nextPoNumber` fallback
- Settings: edit prefix on expense / purchase_order sequences
- Accounts list: up to 3 custom field columns + Archive / Restore + show archived
- Quotes / invoices: show archived toggle
- Public API: webhook emit skips POST when `APP_ENV=demo` or `webhook_endpoints.dry_run`

## Not done

M14, live ESP/Tax/CASA/QTSP, live charts, RLS record rules.