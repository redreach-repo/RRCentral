# RRCRM status

**Last updated:** 13 November 2026 (Asia/Dubai)  
**Current milestone:** M2 Customization layer (in progress)

## Shipped this turn (M2 numbering + customization foundation)

- `supabase/migrations/20261213140000_customization_layer.sql` — `numbering_sequences`, `custom_field_definitions` / `custom_field_values`, `saved_views`, `rr_allocate_reference()`
- Quotes / invoices / delivery notes / accounts allocate via RPC (client falls back to max+1)
- Settings → **Numbering** table (live counters + next preview)
- `supabase/tests/numbering_test.sql` wired into `run.sh`

## Already on main (M1)

- Tenancy + restrictive RLS + company switcher + brand kits + i18n skeleton + `/guide`

## Still open

**M2 next slices:** custom field UI on records, saved views in list pages, pipelines/workflows as data, labels/dashboards  
**M1 leftovers:** move Layout nav fully into module manifests; field permissions; Zod; TS strict; PWA mark regen; missing Boost/Care/Trading logos  
**Open §19 decisions** — do not guess

## Next after M2 close

**M3** CRM unify (dual models → one).
