# Theme studio (§5.3)

**Date:** 15 November 2026 (Asia/Dubai)

Admin route `/theme-studio` edits `brand_kits` for the active company (and optionally a business unit):

- Primary / accent / neutral colours (hex + colour picker)
- Heading + body font (DM Sans, IBM Plex Sans, Source Serif 4, System UI)
- UI density (compact / comfortable / spacious) via `--rr-density`
- Logo paths (horizontal, light, mark)
- Legal footer
- Named presets + reset to HighMast defaults
- Scope switcher: company kit vs per-BU kit (schema already supported BU kits)
- Live chrome preview via CSS variables (`applyBrandCssVars`)
- Contrast ratios shown for primary ↔ light

Fonts persist in `brand_kits.fonts` JSONB (`{ heading, body, density }`).

## Persistence

`saveBrandKit` upserts `brand_kits` for `(tenant_id, company_id)` or a BU row (`business_unit_id`). Local mode applies in-memory only; BU list requires Supabase.

Company kit remains the chrome default after save. BU kits are edited/previewed in Theme studio; wiring active-BU chrome swap stays later.

## Not in this slice

- Official SVG masters (blocked on asset zip)
- Active business-unit switcher in the top bar applying BU kit to chrome
- Custom uploaded webfonts / arbitrary CSS
