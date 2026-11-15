# Theme studio (§5.3 first slice)

**Date:** 15 November 2026 (Asia/Dubai)

Admin route `/theme-studio` edits the active company’s `brand_kits` row:

- Primary / accent / neutral colours (hex + colour picker)
- Logo paths (horizontal, light, mark)
- Legal footer
- Named presets + reset to HighMast defaults
- Live chrome preview via CSS variables (`applyBrandCssVars`)
- Contrast ratios shown for primary ↔ light

## Not in this slice

- Full font / layout / density studio
- Official SVG masters (blocked on asset zip)
- Per–business-unit kits UI (schema supports BU kits; UI is company-scoped)

## Persistence

`saveCompanyBrandKit` upserts `brand_kits` for `(tenant_id, company_id)`. Local mode applies in-memory only.
